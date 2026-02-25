const fs = require('fs');
const path = require('path');
const pdf = require('pdf-parse');
const XLSX = require('xlsx');
const OpenAI = require('openai');
const feishuService = require('./FeishuService');

let pdfjs, createCanvas;
try {
  pdfjs = require('pdfjs-dist/legacy/build/pdf.js');
  createCanvas = require('canvas').createCanvas;
} catch (e) {
  console.warn('[SIM] canvas/pdfjs-dist not available, PDF image extraction disabled:', e.message);
}

class SimulationService {
  constructor(io) {
    this.io = io;
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: process.env.OPENAI_BASE_URL,
    });
    this.agentsDir = path.join(__dirname, '../../.opencode/agents');
    this.aborted = false;
    this.userInterrupts = [];
  }

  abort() {
    this.aborted = true;
  }

  addUserMessage(userName, content) {
    this.userInterrupts.push({ userName, content });
  }

  consumeUserMessages() {
    return this.userInterrupts.splice(0);
  }

  loadAgentPrompt(agentName) {
    try {
      return fs.readFileSync(path.join(this.agentsDir, `${agentName}.md`), 'utf-8');
    } catch (err) {
      console.error(`Failed to load agent ${agentName}:`, err.message);
      return '';
    }
  }

  async readDocContent(docUrl) {
    let text;

    if (docUrl.startsWith('uploads/')) {
      const uploadsDir = path.join(__dirname, '../../uploads');
      const filename = docUrl.split('/')[1];
      const absPath = path.join(uploadsDir, filename);

      if (!fs.existsSync(absPath)) {
        throw new Error(`File not found: ${absPath}`);
      }

      const lower = filename.toLowerCase();

      if (lower.endsWith('.pdf')) {
        const dataBuffer = fs.readFileSync(absPath);

        if (pdfjs && createCanvas && process.env.VISION_MODEL) {
          try {
            const { fullText, visualCount } = await this.buildPdfWithInlineImages(dataBuffer);
            this._lastPdfVisualCount = visualCount;
            return fullText;
          } catch (e) {
            console.error('[SIM] PDF inline image processing failed, falling back to text-only:', e.message);
          }
        } else if (!process.env.VISION_MODEL) {
          console.log('[SIM] VISION_MODEL not set, skipping PDF image analysis');
        }

        // Fallback: text-only extraction
        const pdfData = await pdf(dataBuffer);
        return pdfData.text;
      }

      if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
        const workbook = XLSX.readFile(absPath);
        const sheets = workbook.SheetNames.map(name => {
          const csv = XLSX.utils.sheet_to_csv(workbook.Sheets[name]);
          return `--- Sheet: ${name} ---\n${csv}`;
        });
        return sheets.join('\n\n');
      }

      return fs.readFileSync(absPath, 'utf-8');
    }

    if (docUrl.includes('feishu.cn') || docUrl.includes('lark.cn') || docUrl.includes('larksuite.com')) {
      text = await feishuService.fetchDocument(docUrl);
      text = await this.processImagePlaceholders(text);
      return text;
    }

    throw new Error(`Unsupported document source: ${docUrl}. Use Feishu URL or upload a local file.`);
  }

  emit(sessionId, agent, role, phase, content) {
    this.io.to(sessionId).emit('simulation-message', {
      agentName: agent,
      roleDisplay: role,
      phase: phase,
      content: content
    });
  }

  emitLog(sessionId, content) {
    this.io.to(sessionId).emit('system-log', { type: 'stdout', content });
  }

  buildInterruptContext() {
    const msgs = this.consumeUserMessages();
    if (msgs.length === 0) return '';
    return '\n\n--- Human Participant Input ---\n' +
      msgs.map(m => `[${m.userName}]: ${m.content}`).join('\n') +
      '\n--- End Human Input ---\nPlease acknowledge and incorporate the above human feedback in your response.\n';
  }

  async loadRefDoc(agentConfig) {
    if (!agentConfig.referenceDoc) return '';
    try {
      const content = await this.readDocContent(agentConfig.referenceDoc);
      return `\n\n========== 你的参考需求文档（重要！）==========
${content}
========== 参考需求文档结束 ==========

【核心任务】你必须基于上面这份参考需求文档来评审主文档。具体要求：
1. 逐条梳理参考文档中的每个需求/诉求/场景
2. 对照主文档，检查每个需求是否被提及、是否被满足、是否有遗漏
3. 如果主文档未覆盖参考文档中的某个需求，必须明确指出
4. 如果主文档的方案与参考文档中的需求有冲突，必须指出冲突点
5. 你的每个问题都应该关联到参考文档中的具体条目\n`;
    } catch (e) {
      console.error(`Failed to read agent reference doc: ${e.message}`);
      return '';
    }
  }

  async runSimulation(sessionId, config) {
    const { docUrl, selectedAgents, maxRounds, globalContext, referenceDocs } = config;
    const history = [];

    const log = (msg) => {
      console.log(`[SIM] ${msg}`);
      this.emitLog(sessionId, msg);
    };

    const record = (agent, role, phase, content) => {
      this.emit(sessionId, agent, role, phase, content);
      history.push(`${agent} (${role}): ${content}`);
    };

    const checkAbort = () => {
      if (this.aborted) {
        record('System', 'Orchestrator', 'Stopped', 'Simulation was stopped by user.');
        this.io.to(sessionId).emit('simulation-complete', {});
        log('Simulation aborted by user.');
        return true;
      }
      return false;
    };

    try {
      log('Phase 0: Reading document...');
      const docContent = await this.readDocContent(docUrl);
      log(`Document loaded (${docContent.length} chars)`);

      // Notify frontend about image processing results
      if (this._lastPdfVisualCount > 0) {
        log(`📊 PDF图片解析完成：${this._lastPdfVisualCount} 页包含图表/公式等视觉内容，已内联到对应章节文字中`);
        this._lastPdfVisualCount = 0;
      } else if (docContent.includes('图片内容（AI解析）')) {
        const imgMatches = docContent.match(/--- 图片内容（AI解析） ---/g);
        const count = imgMatches ? imgMatches.length : 0;
        log(`🖼️ 文档图片解析完成：${count} 张图片已通过AI转录为文字`);
      } else if (docUrl.endsWith('.pdf') && !process.env.VISION_MODEL) {
        log('⚠️ 未配置VISION_MODEL，PDF中的图片/公式/图表未被解析');
      }

      if (checkAbort()) return;

      const synthesisPrompt = this.loadAgentPrompt('synthesis');

      record('Synthesis', 'Orchestrator', 'Intake', 'Initializing review... Analyzing document scope and agenda.');

      const intakeResponse = await this.callLLM([
        { role: 'system', content: synthesisPrompt || 'You are a review orchestrator. Analyze the document structure and identify key areas for review. Output in Chinese.' },
        { role: 'user', content: `Phase 0: Intake.\nDocument:\n${docContent}\n\n${globalContext ? `Global Context: ${globalContext}\n\n` : ''}请分析这篇文档并输出：
1. **文档结构大纲**：列出文档的所有章节/段落标题及其主要内容概述
2. **评审重点区域**：标记每个章节中需要重点评审的内容
3. **潜在关注点**：初步识别可能引发讨论的区域` }
      ]);
      record('Synthesis', 'Orchestrator', 'Intake', intakeResponse);
      const docOutline = intakeResponse;
      log('Phase 0 complete.');

      if (checkAbort()) return;

      log('Phase 1: Round 1 - Reviewer Questions');

      // Build full agent profiles for cross-referencing
      const allReviewers = selectedAgents
        .filter(a => a.role !== 'owner')
        .map(a => ({
          key: a.role,
          name: a.role.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
          focusArea: a.focusArea || '',
          context: a.context || '',
          intensity: a.intensity || 'neutral',
          hasRefDoc: !!a.referenceDoc,
        }));

      const questions = [];
      for (const agentConfig of selectedAgents) {
        if (checkAbort()) return;

        const agentKey = agentConfig.role;
        if (agentKey === 'owner') continue;

        const agentPrompt = this.loadAgentPrompt(agentKey);
        const displayName = agentKey.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

        record(displayName, 'Reviewer', 'Round1', `Reviewing document (focus: ${agentConfig.focusArea || 'general'})...`);

        const refDocText = await this.loadRefDoc(agentConfig);
        const interruptCtx = this.buildInterruptContext();

        // Build participant overview: show other agents' full info
        const othersInfo = allReviewers
          .filter(r => r.key !== agentKey)
          .map(r => {
            let line = `- **${r.name}**：关注「${r.focusArea || '通用'}」`;
            if (r.context) line += `，用户要求：${r.context}`;
            if (r.hasRefDoc) line += '（附有参考文档）';
            return line;
          }).join('\n');

        // Detect if user's context mentions any other role (dynamically, no hardcoding)
        const mentionedRoles = allReviewers.filter(r =>
          r.key !== agentKey &&
          agentConfig.context &&
          (agentConfig.context.toLowerCase().includes(r.name.toLowerCase()) ||
           agentConfig.context.toLowerCase().includes(r.key.toLowerCase()) ||
           agentConfig.context.includes(r.focusArea.split(',')[0]?.trim()))
        );

        const crossRoleHint = mentionedRoles.length > 0
          ? `\n\n**跨角色关注**：你的特别指示中提到了以下角色，你需要站在他们的角度思考：\n` +
            mentionedRoles.map(r => {
              let detail = `- **${r.name}**：关注「${r.focusArea}」`;
              if (r.context) detail += `，他们的关注点是：${r.context}`;
              return detail;
            }).join('\n') +
            '\n请在评审时充分考虑这些角色的诉求，检查文档是否能满足他们的需求。'
          : '';

        // Build intensity instruction from user selection
        const intensityDesc = {
          strict: '非常严格，对文档质量要求极高，不放过任何模糊、遗漏或不合理的地方，语气直接尖锐',
          friendly: '友善建设性，在指出问题的同时肯定优点，语气温和',
          neutral: '客观公正，就事论事'
        };
        const intensityHint = intensityDesc[agentConfig.intensity] || intensityDesc.neutral;

        const personaBlock = `
========== 你的角色设定 ==========
**角色**：${displayName}
**评审风格**：${intensityHint}
**关注领域**：${agentConfig.focusArea || '通用评审'}
${agentConfig.context ? `**用户对你的特别指示（必须遵守）**：${agentConfig.context}` : ''}

**本次评审的其他参会角色及其关注点**：
${othersInfo}${crossRoleHint}
=================================`;

        const hasRefDoc = !!agentConfig.referenceDoc;
        const refDocInstruction = hasRefDoc ? `

**特别重要：你有一份参考需求文档，你必须基于它来评审主文档。**
- 先梳理你的参考文档中有哪些关键需求/诉求/场景
- 然后逐条对照主文档，检查覆盖情况
- 你的问题应优先围绕：参考文档中的哪些需求在主文档中未被满足/未被提及/有冲突
- 在每个问题中标注「参考文档依据」，引用参考文档中的具体条目` : '';

        const refDocQuestionField = hasRefDoc
          ? '\n- **参考文档依据**：「……」（引用你的参考需求文档中的相关条目）\n- **覆盖情况**：主文档是否覆盖了该需求（未提及/部分覆盖/有冲突）'
          : '';

        const response = await this.callLLM([
          { role: 'system', content: (agentPrompt || `You are a ${displayName}.`) + '\n' + intensityHint + '\nOutput in Chinese.' },
          { role: 'user', content: `${personaBlock}\n\nDocument:\n${docContent}${refDocText}${interruptCtx}\n\nPhase 1: 请从你的角色和关注领域出发，对文档进行逐章节审查，输出3-5个最重要的问题。${refDocInstruction}

**必须严格按以下格式输出每个问题：**

#### 问题 1
- **涉及章节**：（主文档中具体的章节名或段落位置）
- **原文引用**：「……」（直接引用主文档中你质疑的那段话或那句描述）${refDocQuestionField}
- **问题/质疑**：（你的具体问题，不要泛泛而谈）
- **风险等级**：高/中/低
- **影响分析**：（如果这个问题不解决，会导致什么后果）

要求：
- 每个问题都必须引用文档原文，不能凭空提问
- 问题要具体到文档的某个表述、某个数据、某个流程描述
- 如果主文档确实遗漏了参考文档中的关键需求，这属于高优先级问题
- 你的「用户对你的特别指示」是用户给你下达的额外任务和关注点，**必须**体现在你的评审中
- 如果特别指示要求你关注某些角色的需求，你必须从那些角色的视角检查文档是否满足他们的诉求` }
        ]);

        record(displayName, 'Reviewer', 'Round1', response);
        questions.push({ agent: displayName, agentKey, content: response });
        log(`${displayName} submitted questions.`);
      }

      if (checkAbort()) return;

      log('Phase 2: Owner Answers');
      const ownerPrompt = this.loadAgentPrompt('owner');
      const questionsText = questions.map(q => `From ${q.agent}:\n${q.content}`).join('\n\n');
      const interruptForOwner = this.buildInterruptContext();

      record('Owner', 'Author', 'OwnerAnswers', 'Drafting responses to all reviewer questions...');

      const ownerResponse = await this.callLLM([
        { role: 'system', content: ownerPrompt || 'You are the document owner/author. You must defend your document by citing specific content from it. Output in Chinese.' },
        { role: 'user', content: `Document:\n${docContent}\n\nIncoming Questions:\n${questionsText}${interruptForOwner}\n\nPhase 2: 请逐条回应每位评审人的问题。

**必须严格按以下格式回答每个问题：**

#### 回应 [角色名] - 问题 X
- **文档依据**：「……」（引用文档中支持你回答的原文段落）
- **回答**：（针对质疑的具体回应）
- **处理方式**：
  - 📝 需要修改文档（说明文档哪里要改、怎么改）→ 这是你的待办
  - ✅ 无需修改（解释为什么当前文档已经足够）
  - ⚠️ 需要进一步讨论（说明分歧点）

要求：
- 每条回答都必须引用文档原文作为依据
- 不能只说"会补充"、"会完善"，要具体说明改什么、怎么改
- 如果评审人的质疑确实合理，坦率承认不足并列出具体修改计划
- 重要：只要涉及文档修改，就标记为📝待办，不要标✅` }
      ]);

      record('Owner', 'Author', 'OwnerAnswers', ownerResponse);
      log('Owner responses submitted.');

      if (checkAbort()) return;

      log('Phase 3: Round 2 - Follow-up & Status');
      for (const agentConfig of selectedAgents) {
        if (checkAbort()) return;

        const agentKey = agentConfig.role;
        if (agentKey === 'owner') continue;

        const agentPrompt = this.loadAgentPrompt(agentKey);
        const displayName = agentKey.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        const refDocText = await this.loadRefDoc(agentConfig);
        const interruptCtx = this.buildInterruptContext();

        const intensityDesc3 = {
          strict: '非常严格，不轻易放过任何问题',
          friendly: '建设性，但该坚持的问题不妥协',
          neutral: '客观公正'
        };
        const intensityHint3 = intensityDesc3[agentConfig.intensity] || intensityDesc3.neutral;

        // Build cross-role awareness for Phase 3 too
        const phase3Others = allReviewers
          .filter(r => r.key !== agentKey)
          .map(r => `- ${r.name}：关注「${r.focusArea || '通用'}」${r.context ? `，指示：${r.context}` : ''}`)
          .join('\n');

        const phase3Persona = `你是 ${displayName}
- 关注领域：${agentConfig.focusArea || '通用'}
- 评审风格：${intensityHint3}
${agentConfig.context ? `- 用户对你的特别指示（必须遵守）：${agentConfig.context}` : ''}

其他参会角色：
${phase3Others}`;

        const hasRefDoc2 = !!agentConfig.referenceDoc;
        const refDocReminder = hasRefDoc2 ? '\n\n**提醒：请结合你的参考需求文档重新审视Owner的回答。Owner的修改计划是否真的能满足参考文档中的需求？如果不能，应标为❌有分歧。**' : '';

        const followUpResponse = await this.callLLM([
          { role: 'system', content: (agentPrompt || `You are a ${displayName}.`) + '\n评审风格：' + intensityHint3 + '\nOutput in Chinese.' },
          { role: 'user', content: `${phase3Persona}\n\nDocument:\n${docContent}${refDocText}\n\nYour Questions:\n${questionsText}\n\nOwner Answers:\n${ownerResponse}${interruptCtx}${refDocReminder}\n\nPhase 3: 请基于你的角色设定和特别指示，逐条评价Owner的回答。

**状态判定标准（非常重要）：**
- 📝 Owner待办：Owner承认需要修改文档 → 无论Owner态度多积极，只要文档还没改，就是待办
- ✅ 无需修改：你的疑问被充分解释，文档不需要任何改动
- ❌ 有分歧：你不认可Owner的回答，需要进一步讨论
- ⚠️ 部分待办：部分问题已解释清楚无需改，部分需要Owner修改文档

**按以下格式输出：**

#### 问题 X 评价
- **Owner回答评价**：（简要评价是否充分）
- **文档是否需要修改**：是/否
- **最终判定**：📝 Owner待办 / ✅ 无需修改 / ❌ 有分歧 / ⚠️ 部分待办
- **Owner待办事项**：（如果需要修改，列出具体要改的内容）

如果有新的追问，也请引用文档原文提出。` }
        ]);

        const status = followUpResponse.toLowerCase().includes('resolved') ? 'Resolved' : 'Blocked';
        record(displayName, 'Reviewer', 'Round2', followUpResponse);
        log(`${displayName} status: ${status}`);
      }

      if (checkAbort()) return;

      log('Phase 5: Generating Final Report');
      record('Synthesis', 'Orchestrator', 'Synthesis', 'Generating final review report...');

      const fullHistory = history.join('\n\n---\n\n');
      const finalInterrupt = this.buildInterruptContext();

      // Build participant info dynamically from user's actual config
      const participantInfo = allReviewers.map(r => {
        let desc = `- **${r.name}**：关注「${r.focusArea || '通用'}」，风格：${r.intensity}`;
        if (r.context) desc += `\n  用户指示：${r.context}`;
        if (r.hasRefDoc) desc += '\n  （附有参考需求文档）';
        return desc;
      }).join('\n');

      const minutesPrompt = `你是评审会议记录秘书。请根据以下信息，生成一份详细的、与文档内容紧密关联的评审会议纪要。

**文档章节大纲（来自Phase 0分析）**：
${docOutline}

**评审参与人及其角色设定**：
${participantInfo}

**完整评审讨论记录**：
${fullHistory}${finalInterrupt}

**原始文档内容**：
${docContent}

=== 输出要求 ===

请按以下结构输出完整的会议纪要。核心要求：**"逐章节评审详情"必须按上面的文档真实章节大纲来组织，不要自己编造章节名**。

## 评审会议纪要

### 基本信息
- 评审文档：（从文档内容中提取真实标题）
- 参与角色：（列出所有实际参与的角色及其关注领域）
- 评审概况：共提出 X 个问题，📝待办 X 个，✅无需修改 X 个，❌有分歧 X 个

### 逐章节评审详情

**请严格按照文档的真实章节结构组织**（参考上面的"文档章节大纲"），对每个被讨论到的章节输出：

#### 📄 「文档真实章节名」
**原文摘要**：（1-2句话概括该章节核心内容）

| # | 评审人 | 引用原文 | 质疑/问题 | Owner回应 | 最终状态 | Owner待办 |
|---|--------|----------|-----------|-----------|----------|-----------|
（将该章节相关的所有评审问答逐条列出，每条都要写完整，不能省略）

没有被质疑的章节不需要列出。

### 关键风险项
逐条列出，每条包含：风险描述、涉及的文档真实章节名、风险等级（高/中/低）

### Owner待办清单
汇总所有📝待办项：
| # | 修改内容 | 涉及章节 | 提出人 | 优先级 |
|---|----------|----------|--------|--------|
（从评审详情中提取所有标记为📝的项，逐条列出）

### 待讨论问题
列出所有❌有分歧的项，标注涉及章节和各方分歧点

### 后续行动计划
| # | 行动项 | 负责方 | 涉及章节 | 优先级 |
|---|--------|--------|----------|--------|

### 总体评审结论
给出整体评价：文档质量、最需改进的方面、是否可进入下一阶段。

---
在纪要的最后，附加一个JSON摘要块（必须输出，不可省略）：
\`\`\`json
{
  "topRisks": ["风险1（涉及XX章节）", "风险2"],
  "mustFixes": ["修改项1（涉及XX章节）", "修改项2"],
  "openQuestions": ["问题1（涉及XX章节）", "问题2"],
  "nextActions": ["行动1", "行动2"]
}
\`\`\`

**重要：每条评审记录都必须完整写出，不要省略、不要用"……"代替、不要说"同上"。所有章节都要输出，包括最后的JSON块。**`;

      const finalReport = await this.callLLM([
        { role: 'system', content: 'You are a professional review meeting secretary. Output structured meeting minutes in Chinese. 你必须输出完整的会议纪要，从第一章到第七章以及最后的JSON摘要块，绝对不能中途截断或省略任何章节。' },
        { role: 'user', content: minutesPrompt }
      ], { maxTokens: 16000 });

      record('Synthesis', 'Orchestrator', 'Synthesis', finalReport);

      const { reportText, parsed } = this.parseFinalReport(finalReport);
      this.io.to(sessionId).emit('simulation-complete', {
        summary: parsed,
        finalReport: reportText,
      });

      log('Simulation completed successfully.');
    } catch (error) {
      if (this.aborted) return;
      console.error('Simulation failed:', error);
      record('System', 'Error', 'Error', `Simulation failed: ${error.message}`);
      this.io.to(sessionId).emit('simulation-complete', {});
    }
  }

  parseFinalReport(report) {
    let parsed = null;
    let reportText = report;

    // Strategy 1: extract ```json ... ``` block (flexible: case-insensitive, optional language tag)
    const jsonFenceRegex = /```(?:json|JSON)?\s*\n?\s*(\{[\s\S]*?\})\s*\n?\s*```/;
    let jsonMatch = report.match(jsonFenceRegex);

    // Strategy 2: find last bare JSON object { ... } near end of report
    if (!jsonMatch) {
      const lastBrace = report.lastIndexOf('}');
      if (lastBrace > -1) {
        const searchStart = report.lastIndexOf('{', lastBrace);
        if (searchStart > -1) {
          const candidate = report.slice(searchStart, lastBrace + 1);
          if (candidate.includes('topRisks') || candidate.includes('mustFixes')) {
            jsonMatch = [candidate, candidate];
          }
        }
      }
    }

    if (jsonMatch) {
      const jsonStr = jsonMatch[1] || jsonMatch[0];
      const cutPoint = report.lastIndexOf(jsonMatch[0]);
      // Remove the JSON block and any surrounding fences/separators from display text
      reportText = report.slice(0, cutPoint).replace(/```(?:json|JSON)?\s*$/, '').replace(/---\s*$/, '').trim();

      try {
        const obj = JSON.parse(jsonStr.trim());
        parsed = {
          topRisks: Array.isArray(obj.topRisks) ? obj.topRisks : [],
          mustFixes: Array.isArray(obj.mustFixes) ? obj.mustFixes : [],
          openQuestions: Array.isArray(obj.openQuestions) ? obj.openQuestions : [],
          nextActions: Array.isArray(obj.nextActions) ? obj.nextActions : [],
        };
        console.log('[SIM] JSON summary parsed successfully:', JSON.stringify(parsed).slice(0, 200));
      } catch (e) {
        console.error('[SIM] Failed to parse JSON summary:', e.message, '\nRaw JSON:', jsonStr.slice(0, 300));
      }
    } else {
      console.log('[SIM] No JSON block found in report, falling back to header parsing');
    }

    // Strategy 3: fallback header-based parsing
    if (!parsed) {
      parsed = { topRisks: [], mustFixes: [], openQuestions: [], nextActions: [] };
      const mapping = [
        { keys: ['风险', 'risk', 'top risk'], target: 'topRisks' },
        { keys: ['必须修改', '必改', 'must-fix', 'must fix', '修改项', '待修改'], target: 'mustFixes' },
        { keys: ['待解决', '开放问题', '遗留', 'open question', '未解决', '分歧'], target: 'openQuestions' },
        { keys: ['后续', '行动', '下一步', 'next action', 'recommend', '建议', '待办'], target: 'nextActions' },
      ];
      let current = null;
      for (const line of report.split('\n')) {
        const trimmed = line.trim();
        if (/^#{1,4}\s/.test(trimmed) || /^[一二三四五六七八九十]+[、.]/.test(trimmed)) {
          const header = trimmed.replace(/^#+\s*/, '').replace(/^[一二三四五六七八九十]+[、.]\s*/, '').replace(/\*+/g, '').toLowerCase();
          current = null;
          for (const m of mapping) {
            if (m.keys.some(k => header.includes(k))) { current = m.target; break; }
          }
          continue;
        }
        if (current && /^[-*•]|\d+[.)]/.test(trimmed)) {
          const text = trimmed.replace(/^[-*•]\s*|\d+[.)]\s*/, '').replace(/^\*+|\*+$/g, '').trim();
          if (text) parsed[current].push(text);
        }
      }
      console.log('[SIM] Header-parsed summary:', JSON.stringify(parsed).slice(0, 200));
    }

    return { reportText, parsed };
  }

  async describeImage(base64, contentType = 'image/png', mode = 'standalone') {
    const visionModel = process.env.VISION_MODEL || process.env.MODEL_NAME;
    if (!visionModel) throw new Error('No vision model configured');

    const prompts = {
      standalone: `请详细解析这张图片的全部内容，确保不遗漏任何细节：
1. 如果包含公式或计算逻辑：用数学符号和文字完整转录每个公式，解释每个变量和运算符的含义，说明计算流程和各步骤之间的关系
2. 如果是流程图/架构图/示意图：描述所有节点、连线方向、分支条件和它们之间的逻辑关系
3. 如果是表格：用文本表格格式完整还原所有行列数据
4. 如果包含文字/标注：完整转录，包括注释、颜色标记、箭头指向的含义
5. 描述图片中各元素之间的逻辑关系和业务含义`,
      pdf_page: `这是一个PDF文档页面的截图。请重点解析页面中的**非纯文字内容**，包括：
1. 公式/计算逻辑：用数学符号完整转录，解释每个变量含义和计算流程
2. 流程图/架构图/示意图：描述所有节点和逻辑关系
3. 图表/数据可视化：描述图表类型、数据趋势和关键数值
4. 表格（如果是图片格式的表格）：用文本还原所有数据
5. 示意图/框图中的箭头、连线、层级关系

如果这一页只有纯文字没有任何图片/公式/图表，请回复"无图片内容"。
否则请详细描述所有视觉内容，不要重复页面上已有的纯文字。`,
    };

    const response = await this.openai.chat.completions.create({
      model: visionModel,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: prompts[mode] || prompts.standalone },
          { type: 'image_url', image_url: { url: `data:${contentType};base64,${base64}` } }
        ]
      }],
      temperature: 0.1,
      max_tokens: 2000,
    });
    return response.choices[0].message.content;
  }

  async buildPdfWithInlineImages(pdfBuffer) {
    const maxVisionCalls = parseInt(process.env.MAX_DOC_IMAGES || '8', 10);
    const visionTimeout = parseInt(process.env.VISION_TIMEOUT_MS || '30000', 10);

    class NodeCanvasFactory {
      create(width, height) {
        const canvas = createCanvas(width, height);
        return { canvas, context: canvas.getContext('2d') };
      }
      reset(pair, width, height) { pair.canvas.width = width; pair.canvas.height = height; }
      destroy(pair) { pair.canvas.width = 0; pair.canvas.height = 0; pair.canvas = null; pair.context = null; }
    }

    const doc = await pdfjs.getDocument({
      data: new Uint8Array(pdfBuffer),
      canvasFactory: new NodeCanvasFactory(),
    }).promise;

    const totalPages = doc.numPages;
    console.log(`[SIM] PDF: ${totalPages} pages. Extracting text + rendering images...`);

    // Step 1: Extract text per page AND render each page to image
    const pages = [];
    for (let i = 1; i <= totalPages; i++) {
      try {
        const page = await doc.getPage(i);

        // Extract text for this page
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(item => item.str).join(' ').trim();

        // Render page to image
        const viewport = page.getViewport({ scale: 1.5 });
        const factory = new NodeCanvasFactory();
        const { canvas, context } = factory.create(viewport.width, viewport.height);
        await page.render({ canvasContext: context, viewport }).promise;
        const pngBuffer = canvas.toBuffer('image/png');
        factory.destroy({ canvas, context });

        const sizeKB = pngBuffer.length / 1024;
        pages.push({ page: i, text: pageText, buffer: pngBuffer, sizeKB });
      } catch (e) {
        console.error(`[SIM] PDF page ${i} failed:`, e.message);
      }
    }

    // Step 2: Identify pages that likely have visual content
    const avgSize = pages.reduce((s, p) => s + p.sizeKB, 0) / (pages.length || 1);
    const visualPages = new Set();
    const candidates = pages
      .filter(p => p.sizeKB > avgSize * 0.8)
      .sort((a, b) => b.sizeKB - a.sizeKB)
      .slice(0, maxVisionCalls);

    console.log(`[SIM] PDF page sizes: avg=${avgSize.toFixed(0)}KB, visual candidates=${candidates.length}`);

    // Step 3: Call vision model for candidate pages
    const imageDescMap = {};
    for (const { page, buffer } of candidates) {
      try {
        const base64 = buffer.toString('base64');
        const desc = await Promise.race([
          this.describeImage(base64, 'image/png', 'pdf_page'),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), visionTimeout)),
        ]);
        if (desc && !desc.includes('无图片内容') && !desc.includes('只有纯文字') && desc.length > 20) {
          imageDescMap[page] = desc;
          visualPages.add(page);
          console.log(`[SIM] PDF page ${page}: visual content found (${desc.length} chars)`);
        } else {
          console.log(`[SIM] PDF page ${page}: text-only, skipped`);
        }
      } catch (e) {
        console.error(`[SIM] PDF page ${page} vision failed: ${e.message}`);
      }
    }

    // Step 4: Build final document with image descriptions INLINE next to their page text
    const parts = [];
    for (const p of pages) {
      let section = p.text;
      if (imageDescMap[p.page]) {
        section += `\n\n[📊 本页包含图表/公式/示意图，以下为AI解析内容：]\n${imageDescMap[p.page]}\n[📊 图表解析结束]`;
      }
      parts.push(section);
    }

    console.log(`[SIM] PDF: ${visualPages.size} pages with inline visual descriptions`);
    return { fullText: parts.join('\n\n'), visualCount: visualPages.size };
  }

  async processImagePlaceholders(text) {
    const imageRegex = /\[IMAGE:(\w+)\]/g;
    const matches = [...text.matchAll(imageRegex)];
    if (matches.length === 0) return text;

    const maxImages = parseInt(process.env.MAX_DOC_IMAGES || '15', 10);
    console.log(`[SIM] Found ${matches.length} images in document, processing up to ${maxImages}...`);

    const toProcess = matches.slice(0, maxImages);
    for (const match of toProcess) {
      const imgToken = match[1];
      try {
        const { base64, contentType } = await feishuService.downloadImage(imgToken);
        const description = await this.describeImage(base64, contentType);
        text = text.replace(match[0],
          `\n--- 图片内容（AI解析） ---\n${description}\n--- 图片内容结束 ---\n`);
        console.log(`[SIM] Image ${imgToken} described (${description.length} chars)`);
      } catch (e) {
        console.error(`[SIM] Failed to process image ${imgToken}:`, e.message);
        text = text.replace(match[0], `[图片：处理失败 - ${e.message}]`);
      }
    }

    if (matches.length > maxImages) {
      text = text.replace(/\[IMAGE:\w+\]/g, '[图片：超出处理上限，已跳过]');
      console.log(`[SIM] Skipped ${matches.length - maxImages} images beyond limit`);
    }

    return text;
  }

  async callLLM(messages, options = {}) {
    if (!process.env.OPENAI_API_KEY) {
      return 'Error: OPENAI_API_KEY not found. Please set it in server/.env';
    }

    try {
      const params = {
        model: process.env.MODEL_NAME || 'moonshot-v1-128k',
        messages: messages,
        temperature: options.temperature ?? 0.7,
      };
      if (options.maxTokens) {
        params.max_tokens = options.maxTokens;
      }
      const completion = await this.openai.chat.completions.create(params);
      return completion.choices[0].message.content;
    } catch (e) {
      console.error('LLM Call Error:', e.message);
      throw new Error(`LLM API error: ${e.message}`);
    }
  }
}

module.exports = SimulationService;

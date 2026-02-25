const express = require('express');
const router = express.Router();
const ReviewSession = require('../models/ReviewSession');
const SimulationService = require('../services/SimulationService');

const DEFAULT_WEIGHTS = {
  'pm-reviewer': { label: '产品总监', weight: 30, color: '#52c41a' },
  'stakeholder': { label: '关键干系人', weight: 25, color: '#1890ff' },
  'tech-reviewer': { label: '技术架构师', weight: 25, color: '#fa541c' },
  'business-analyst': { label: '业务分析师', weight: 20, color: '#722ed1' },
  'ux-reviewer': { label: '用户体验专家', weight: 15, color: '#13c2c2' },
  'qa-reviewer': { label: 'QA工程师', weight: 10, color: '#faad14' },
};

function normalizeWeights(agents) {
  const mapped = agents.filter(a => a.role !== 'owner').map(a => {
    const preset = DEFAULT_WEIGHTS[a.role] || {};
    return {
      role: a.role,
      label: preset.label || a.role.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      weight: preset.weight || Math.round(100 / agents.filter(x => x.role !== 'owner').length),
      color: preset.color || '#8c8c8c',
      focusArea: a.focusArea || '',
      context: a.context || '',
      intensity: a.intensity || 'neutral',
      referenceDoc: a.referenceDoc || null,
    };
  });
  const totalWeight = mapped.reduce((s, a) => s + a.weight, 0);
  if (totalWeight !== 100) {
    mapped.forEach(a => { a.weight = Math.round((a.weight / totalWeight) * 100); });
  }
  return mapped;
}

// POST /api/scoring/generate - Generate scores for a review session
router.post('/generate', async (req, res) => {
  try {
    const { sessionId, docUrl, selectedAgents, passLine = 75 } = req.body;
    if (!docUrl || !selectedAgents?.length) {
      return res.status(400).json({ error: 'Missing docUrl or selectedAgents' });
    }

    const io = req.app.get('io');
    const simService = new SimulationService(io);
    const docContent = await simService.readDocContent(docUrl);

    // Extract document sections
    const outlineResp = await simService.callLLM([
      { role: 'system', content: '你是文档结构分析专家。Output in Chinese.' },
      { role: 'user', content: `请分析这篇文档，提取所有一级和二级章节标题。只输出JSON数组，不要其他文字。

文档内容：
${docContent}

输出格式（严格JSON）：
["章节1标题", "章节2标题", "章节3标题", ...]` }
    ], { temperature: 0.1, maxTokens: 1000 });

    let sections = [];
    try {
      const jsonMatch = outlineResp.match(/\[[\s\S]*?\]/);
      if (jsonMatch) sections = JSON.parse(jsonMatch[0]);
    } catch (e) {
      console.error('[SCORING] Failed to parse sections:', e.message);
      sections = ['整体文档'];
    }
    if (sections.length === 0) sections = ['整体文档'];

    const agents = normalizeWeights(selectedAgents);

    // Generate scores for each agent
    const results = [];
    for (const agent of agents) {
      const scorePrompt = `你是「${agent.label}」，关注领域：${agent.focusArea || '通用评审'}。
${agent.context ? `用户特别指示：${agent.context}` : ''}

请对以下文档的每个章节进行打分（0-100分），并给出简短评价。

评分维度：
- 完整性：该章节内容是否完整，有无遗漏
- 清晰度：描述是否清楚，有无歧义
- 可行性：方案是否可执行，是否考虑了实际限制
- 与你关注领域的相关性：是否满足你角色视角的需求

文档内容：
${docContent}

需要评分的章节：${JSON.stringify(sections)}

请严格输出以下JSON格式（不要输出其他内容）：
{
  "overallScore": 数字(0-100),
  "overallFeedback": "一句话总体评价",
  "sections": [
    {"name": "章节名", "score": 数字(0-100), "feedback": "该章节的简短评价(20字以内)"}
  ]
}`;

      try {
        const resp = await simService.callLLM([
          { role: 'system', content: `你是${agent.label}。根据你的专业视角对文档打分。只输出JSON。` },
          { role: 'user', content: scorePrompt }
        ], { temperature: 0.3, maxTokens: 2000 });

        let scoreData = null;
        const jsonMatch = resp.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          scoreData = JSON.parse(jsonMatch[0]);
        }

        if (scoreData) {
          results.push({
            ...agent,
            overallScore: scoreData.overallScore || 0,
            overallFeedback: scoreData.overallFeedback || '',
            sections: (scoreData.sections || []).map(s => ({
              name: s.name,
              score: Math.min(100, Math.max(0, s.score || 0)),
              feedback: s.feedback || '',
            })),
          });
        }
      } catch (e) {
        console.error(`[SCORING] Agent ${agent.role} scoring failed:`, e.message);
      }
    }

    // Calculate weighted overall
    const weightedTotal = results.reduce((s, r) => s + r.overallScore * r.weight, 0);
    const totalWeight = results.reduce((s, r) => s + r.weight, 0);
    const overallScore = totalWeight > 0 ? +(weightedTotal / totalWeight).toFixed(1) : 0;

    res.json({
      overallScore,
      passLine,
      passed: overallScore >= passLine,
      sections,
      reviewers: results,
    });
  } catch (e) {
    console.error('[SCORING] Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/scoring/challenge - Challenge a specific score
router.post('/challenge', async (req, res) => {
  try {
    const { docUrl, agentRole, agentLabel, sectionName, currentScore, userArgument, focusArea, context } = req.body;
    if (!docUrl || !sectionName || !userArgument) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const io = req.app.get('io');
    const simService = new SimulationService(io);
    const docContent = await simService.readDocContent(docUrl);

    const challengePrompt = `你是「${agentLabel || agentRole}」，关注领域：${focusArea || '通用'}。
${context ? `用户特别指示：${context}` : ''}

你之前给文档的「${sectionName}」章节打了 ${currentScore} 分。

用户对这个评分提出了挑战：
「${userArgument}」

请重新审视这个章节，考虑用户的意见，给出新的评分和理由。

文档中「${sectionName}」相关内容：
${docContent}

请输出JSON格式：
{
  "newScore": 数字(0-100),
  "reasoning": "你重新评估的理由（说明你是否接受用户的观点，为什么调整/不调整分数）",
  "feedback": "更新后的章节评价"
}`;

    const resp = await simService.callLLM([
      { role: 'system', content: `你是${agentLabel}。用户挑战了你的评分，请公正地重新评估。只输出JSON。` },
      { role: 'user', content: challengePrompt }
    ], { temperature: 0.3, maxTokens: 1000 });

    let result = null;
    const jsonMatch = resp.match(/\{[\s\S]*\}/);
    if (jsonMatch) result = JSON.parse(jsonMatch[0]);

    if (result) {
      res.json({
        previousScore: currentScore,
        newScore: Math.min(100, Math.max(0, result.newScore || currentScore)),
        reasoning: result.reasoning || '',
        feedback: result.feedback || '',
      });
    } else {
      res.status(500).json({ error: 'Failed to parse challenge response' });
    }
  } catch (e) {
    console.error('[SCORING] Challenge error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;

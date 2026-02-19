const express = require('express');
const router = express.Router();
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const pdf = require('pdf-parse');
const axios = require('axios');

const activeSimulations = {};

async function generateAgentProfile(roleName, description) {
  try {
    const apiKey = process.env.OPENAI_API_KEY || 'sk-AJ0tfVgVly8piXIUVk3UocKhlH5qg80cyLa7Mlx5OFye7oJ2';
    const baseUrl = process.env.OPENAI_BASE_URL || 'http://model.mify.ai.srv/v1/';
    
    const prompt = `
You are an expert system designer. Create a "Reviewer Agent" profile for a multi-agent review system.
User Request: Role="${roleName}", Description="${description}"

Output a Markdown file content for this agent.
The content must follow this structure:

# Role: ${roleName}

## Profile
- **Expertise**: [List key skills]
- **Personality**: [Tone and style]
- **Focus**: [What to look for in documents]

## Instructions
1. You are participating in a BRD/PRD review.
2. Your goal is to find issues related to your expertise.
3. Be specific and constructive.

## Output Format
- When asking questions:
  - **[Priority]** Question content
  - *Why it matters*: Explanation

Generate ONLY the markdown content. No other text.
`;

    const response = await axios.post(`${baseUrl}chat/completions`, {
      model: "Mify-OpenAI/azure_openai/gpt-4o",
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: prompt }
      ],
      temperature: 0.7
    }, {
      headers: { 
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    return response.data.choices[0].message.content;
  } catch (error) {
    console.error("LLM Generation Failed:", error.message);
    return `# Role: ${roleName}\n\n## Profile\n- **Description**: ${description}\n\n## Instructions\nParticipate in the review based on your description.`;
  }
}

router.post('/generate-agent', async (req, res) => {
  const { roleName, description, scope } = req.body;
  
  const roleKey = roleName.toLowerCase().replace(/[^a-z0-9]/g, '-');
  const filename = `${roleKey}.md`;
  
  const content = await generateAgentProfile(roleName, description);
  
  const agentsDir = path.join(process.cwd(), '../.opencode/agents');
  
  if (!fs.existsSync(agentsDir)) {
    fs.mkdirSync(agentsDir, { recursive: true });
  }
  
  fs.writeFileSync(path.join(agentsDir, filename), content);
  
  res.json({ success: true, roleKey, filename });
});

router.post('/start', async (req, res) => {
  const { sessionId, docUrl, referenceDocs, selectedAgents, maxRounds, globalContext } = req.body;
  const io = req.app.get('io');

  console.log(`Starting simulation for session ${sessionId}`);

  const isLocalFile = docUrl.startsWith('uploads/');
  let fetchInstruction = "";
  
  if (isLocalFile) {
      const uploadsDir = path.join(__dirname, '../../uploads');
      const filename = docUrl.split('/')[1];
      const absPath = path.join(uploadsDir, filename);
      
      if (filename.toLowerCase().endsWith('.pdf')) {
          fetchInstruction = `The Target Document is a local PDF file at: ${absPath}\nIMMEDIATELY use the command \`node read_pdf.js "${absPath}"\` to read its content.`;
      } else {
          fetchInstruction = `The Target Document is a local file. IMMEDIATELY call the tool \`read_file\` to read it at: ${absPath}`;
      }
  } else {
      fetchInstruction = `IMMEDIATELY call the tool \`user-feishu-mcp-fetch-doc\` to read the Target Document.`;
  }

  const refDocsText = referenceDocs?.map(r => `- ${r.url} (${r.note})`).join('\n') || 'None';
  
  const agentsConfigText = selectedAgents.map(a => 
    `- **${a.role}**: Focus on "${a.focusArea}". Context: "${a.context}". Intensity: ${a.intensity}`
  ).join('\n');

    const prompt = `
@synthesis 
**START SIMULATION**
Target Document: ${docUrl}
Reference Documents:
${refDocsText}

Global Context: ${globalContext || 'None'}

Active Agents & Configuration:
${agentsConfigText}

Max Follow-up Rounds: ${maxRounds}

CRITICAL INSTRUCTION:
You are the Orchestrator.
1. ${fetchInstruction}
2. AFTER reading, generate the Phase 0 Intake summary.
3. THEN, proceed to Phase 1: Round 1 Questions.
4. **MANDATORY**: You MUST use the \`task\` tool to invoke the Reviewer Agents (e.g., \`task(agent="biz-reviewer", prompt="...")\`).
   - DO NOT simulate or hallucinate their responses.
   - Wait for the tool output.
   - When you receive their output, echo it verbatim using the JSON log format below.
5. Continue the loop (Owner Answers -> Round 2 -> Closure) using real sub-agent calls.

OUTPUT FORMAT REQUIREMENTS:
For EVERY message received from a sub-agent (and your own summary), you MUST output a structured log line:
\`\`\`json
{"type":"AGENT_MESSAGE", "agent": "AgentName", "role": "RoleName", "phase": "CurrentPhase", "content": "The actual message content..."}
\`\`\`
This JSON must be on a single line. 
The "content" field should be the actual text returned by the sub-agent.
Do not wrap the whole output in JSON, just the log lines for the UI.

EXECUTE TOOL NOW.
`;

  const safePrompt = prompt.replace(/"/g, '\\"');

  setImmediate(() => {
      console.log('--- DEBUG: Spawning OpenCode via npx ---');
      io.to(sessionId).emit('system-log', { type: 'stderr', content: '>>> DEBUG: Spawning `npx -y opencode-ai run ...`' });

      const demoRepoPath = path.resolve(__dirname, '../../');
      
      const opencode = spawn('npx', [
        '-y', 
        'opencode-ai', 
        'run', 
        '--model', 'Mify-OpenAI/azure_openai/gpt-5.1-codex',
        '--agent', 'synthesis',
        safePrompt, 
        '--print-logs', 
        '--log-level', 'DEBUG'
      ], {
        cwd: demoRepoPath, 
        env: { 
          ...process.env, 
          FORCE_COLOR: '0', 
          PATH: process.env.PATH,
          OPENAI_API_KEY: 'sk-AJ0tfVgVly8piXIUVk3UocKhlH5qg80cyLa7Mlx5OFye7oJ2',
          OPENAI_BASE_URL: 'http://model.mify.ai.srv/v1/'
        },
        stdio: 'pipe'
      });

      activeSimulations[sessionId] = opencode;

      opencode.on('error', (err) => {
          console.error('Failed to start subprocess:', err);
          io.to(sessionId).emit('system-log', { type: 'stderr', content: `>>> CRITICAL ERROR: Spawn failed: ${err.message}` });
      });

      const parseAndEmit = (outputSource, data) => {
        const output = data.toString();
        
        io.to(sessionId).emit('system-log', { type: outputSource, content: output });

        const lines = output.split('\n');
        lines.forEach(line => {
             const jsonMatch = line.match(/\{"type":"AGENT_MESSAGE".*\}/);
             if (jsonMatch) {
                 try {
                     const msgData = JSON.parse(jsonMatch[0]);
                     emitMsg(io, sessionId, msgData.agent, msgData.role, msgData.phase, msgData.content);
                 } catch (e) {
                     // ignore parse error
                 }
                 return;
             }
        });
      };

      opencode.stdout.on('data', (data) => parseAndEmit('stdout', data));
      opencode.stderr.on('data', (data) => parseAndEmit('stderr', data));

      opencode.on('close', (code) => {
        console.log(`Simulation process exited with code ${code}`);
        delete activeSimulations[sessionId];
        io.to(sessionId).emit('simulation-complete', {});
      });
  });

  res.json({ status: 'started', message: 'Simulation process scheduled' });
});

function emitMsg(io, sessionId, agent, role, phase, content) {
  io.to(sessionId).emit('simulation-message', {
    agentName: agent,
    roleDisplay: role,
    phase: phase,
    content: content
  });
}

module.exports = router;

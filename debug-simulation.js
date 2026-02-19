const { spawn } = require('child_process');
const path = require('path');

// Configuration
// CRITICAL: Point to the repo root where .opencode/agents are located
const demoRepoPath = path.resolve(__dirname); 

// 1. Support File Upload / Local File (via Environment Variable or Default URL)
// Default to a local PDF so it works out-of-the-box without Feishu auth
const defaultPdf = 'uploads/demo_brd.pdf'; 
const targetInput = process.env.TARGET_DOC || defaultPdf;
const isUrl = targetInput.startsWith('http');

let fetchInstruction = "";
if (isUrl) {
  fetchInstruction = `IMMEDIATELY call the tool \`user-feishu-mcp-fetch-doc\` to read the Target Document at: ${targetInput}`;
} else {
  // Handle local file
  const absPath = path.isAbsolute(targetInput) ? targetInput : path.join(demoRepoPath, targetInput);
  fetchInstruction = `The Target Document is a local PDF file at: ${absPath}\nIMMEDIATELY use the command \`node read_pdf.js "${absPath}"\` to read its content.`;
}

const prompt = `
@synthesis 
**START SIMULATION**
Target Document: ${targetInput}
Reference Documents: None
Global Context: None
Active Agents & Configuration:
- **owner**: Focus on "Business Goal". Intensity: neutral
- **biz-reviewer**: Focus on "ROI, Business Loop". Intensity: neutral
- **tech-reviewer**: Focus on "High Concurrency, Consistency". Intensity: neutral
- **pm-reviewer**: Focus on "User Experience, HiUI". Intensity: neutral
- **ops-legal-reviewer**: Focus on "Compliance, SOP". Intensity: neutral
- **qa-reviewer**: Focus on "Edge Cases". Intensity: neutral
- **stakeholder**: Focus on "Strategy, Budget". Intensity: neutral
Max Follow-up Rounds: 2
CRITICAL INSTRUCTION:
You are the Orchestrator.
1. ${fetchInstruction}
2. AFTER reading, generate the Phase 0 Intake summary.
3. THEN, proceed to Phase 1: Round 1 Questions.
4. **MANDATORY**: You MUST use the \`task\` tool to invoke the Reviewer Agents.
   - Wait for the tool output.
   - Echo it verbatim using the JSON log format:
   \`\`\`json
   {"type":"AGENT_MESSAGE", "agent": "AgentName", "role": "RoleName", "phase": "CurrentPhase", "content": "The actual message content..."}
   \`\`\`
5. Continue the loop.
EXECUTE TOOL NOW.
`;

console.log('--- STARTING DEBUG SCRIPT ---');
console.log('Target:', targetInput);
console.log('CWD:', demoRepoPath);

const opencode = spawn('npx', [
  '-y', 
  'opencode-ai', 
  'run', 
  '--model', 'Mify-OpenAI/azure_openai/gpt-5.1-codex',
  '--agent', 'synthesis', 
  prompt, 
  '--print-logs', 
  '--log-level', 'DEBUG'
], {
  cwd: demoRepoPath,
  env: { 
    ...process.env, 
    FORCE_COLOR: '1', 
    PATH: process.env.PATH,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY || 'sk-AJ0tfVgVly8piXIUVk3UocKhlH5qg80cyLa7Mlx5OFye7oJ2',
    OPENAI_BASE_URL: process.env.OPENAI_BASE_URL || 'http://model.mify.ai.srv/v1/'
  },
  stdio: 'inherit' 
});

opencode.on('error', (err) => {
  console.error('FAILED TO SPAWN:', err);
});

opencode.on('close', (code) => {
  console.log(`PROCESS EXITED WITH CODE ${code}`);
});

opencode.on('error', (err) => {
  console.error('FAILED TO SPAWN:', err);
});

opencode.on('close', (code) => {
  console.log(`PROCESS EXITED WITH CODE ${code}`);
});

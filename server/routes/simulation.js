const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const SimulationService = require('../services/SimulationService');

const activeSimulations = {};

router.post('/generate-agent', async (req, res) => {
  const { roleName, description, scope } = req.body;

  const roleKey = roleName.toLowerCase().replace(/[^a-z0-9]/g, '-');
  const filename = `${roleKey}.md`;

  const content = await generateAgentProfile(roleName, description);

  const agentsDir = path.resolve(__dirname, '../../.opencode/agents');

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
  console.log(`Document: ${docUrl}`);
  console.log(`Agents: ${selectedAgents.map(a => a.role).join(', ')}`);

  if (activeSimulations[sessionId]) {
    activeSimulations[sessionId].abort();
    delete activeSimulations[sessionId];
  }

  const service = new SimulationService(io);
  activeSimulations[sessionId] = service;

  res.json({ status: 'started', message: 'Simulation started' });

  setImmediate(() => {
    service.runSimulation(sessionId, {
      docUrl,
      selectedAgents,
      maxRounds: maxRounds || 2,
      globalContext,
      referenceDocs
    }).finally(() => {
      delete activeSimulations[sessionId];
    });
  });
});

router.post('/stop', (req, res) => {
  const { sessionId } = req.body;
  const service = activeSimulations[sessionId];
  if (service) {
    service.abort();
    delete activeSimulations[sessionId];
    res.json({ status: 'stopped' });
  } else {
    res.json({ status: 'not_running' });
  }
});

router.post('/interrupt', (req, res) => {
  const { sessionId, userName, content } = req.body;
  const service = activeSimulations[sessionId];
  if (service) {
    service.addUserMessage(userName, content);
    res.json({ status: 'received' });
  } else {
    res.json({ status: 'not_running' });
  }
});

async function generateAgentProfile(roleName, description) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    const baseUrl = process.env.OPENAI_BASE_URL;

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

    const response = await axios.post(`${baseUrl}/chat/completions`, {
      model: process.env.MODEL_NAME || 'moonshot-v1-128k',
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: prompt }
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
    console.error('LLM Generation Failed:', error.message);
    return `# Role: ${roleName}

## Profile
- **Description**: ${description}

## Instructions
Participate in the review based on your description.`;
  }
}

module.exports = router;

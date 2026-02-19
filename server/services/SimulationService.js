const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');

class SimulationService {
  constructor(io) {
    this.io = io;
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    this.agentsDir = path.join(__dirname, '../../.opencode/agents');
  }

  async loadAgentPrompt(agentName) {
    try {
      return fs.readFileSync(path.join(this.agentsDir, `${agentName}.md`), 'utf-8');
    } catch (err) {
      console.error(`Failed to load agent ${agentName}:`, err);
      return '';
    }
  }

  async runSimulation(sessionId, config) {
    const { docContent, selectedAgents, maxRounds } = config;
    const history = [];

    const emit = (agent, role, round, content, statusTag = null) => {
      const msg = {
        id: Date.now().toString(),
        timestamp: new Date().toISOString(),
        agent,
        role,
        round,
        content,
        statusTag
      };
      this.io.to(sessionId).emit('new-comment', { ...msg, isAgent: true });
      history.push(`${agent} (${role}): ${content}`);
    };

    try {
      const synthesisPrompt = await this.loadAgentPrompt('synthesis');
      emit('Synthesis', 'Orchestrator', 'Intake', 'Initializing simulation... Reading document...');
      
      const intakeResponse = await this.callLLM([
        { role: 'system', content: synthesisPrompt },
        { role: 'user', content: `Phase 0: Intake.\nDocument:\n${docContent}\n\nAnalyze the document and output the Agenda & Key Scope.` }
      ]);
      emit('Synthesis', 'Orchestrator', 'Intake', intakeResponse);

      const questions = [];
      for (const agentKey of selectedAgents) {
        if (agentKey === 'owner') continue; 

        const agentPrompt = await this.loadAgentPrompt(agentKey);
        const agentName = agentKey.replace('-reviewer', '').toUpperCase() + ' Reviewer'; 
        
        emit(agentName, 'Reviewer', 'Round1', 'Reviewing document...');
        
        const response = await this.callLLM([
          { role: 'system', content: agentPrompt },
          { role: 'user', content: `Document:\n${docContent}\n\nPhase 1: Please generate your top 3-5 prioritized questions.` }
        ]);
        
        emit(agentName, 'Reviewer', 'Round1', response, 'Pending');
        questions.push({ agent: agentName, content: response });
      }

      const ownerPrompt = await this.loadAgentPrompt('owner');
      const questionsText = questions.map(q => `From ${q.agent}:\n${q.content}`).join('\n\n');
      
      emit('Owner', 'Author', 'OwnerAnswers', 'Drafting responses...');

      const ownerResponse = await this.callLLM([
        { role: 'system', content: ownerPrompt },
        { role: 'user', content: `Document:\n${docContent}\n\nIncoming Questions:\n${questionsText}\n\nPhase 2: Answer these questions citing evidence.` }
      ]);

      emit('Owner', 'Author', 'OwnerAnswers', ownerResponse);

      for (const agentKey of selectedAgents) {
        if (agentKey === 'owner') continue;
        const agentName = agentKey.replace('-reviewer', '').toUpperCase() + ' Reviewer'; 
        const agentPrompt = await this.loadAgentPrompt(agentKey);

        const followUpResponse = await this.callLLM([
          { role: 'system', content: agentPrompt },
          { role: 'user', content: `Document:\n${docContent}\n\nQuestions:\n${questionsText}\n\nOwner Answers:\n${ownerResponse}\n\nPhase 3: Provide your status (Resolved/Blocked) and any final follow-ups.` }
        ]);

        const status = followUpResponse.toLowerCase().includes('resolved') ? 'Resolved' : 'Blocked';
        emit(agentName, 'Reviewer', 'Round2', followUpResponse, status);
      }

      emit('Synthesis', 'Orchestrator', 'Synthesis', 'Generating final report and artifacts...');
      
      const fullHistory = history.join('\n\n');
      const finalReport = await this.callLLM([
        { role: 'system', content: synthesisPrompt },
        { role: 'user', content: `Simulation History:\n${fullHistory}\n\nPhase 5: Generate the Final Review Report (JSON format for summary) and Markdown text.` }
      ]);
      
      emit('Synthesis', 'Orchestrator', 'Synthesis', finalReport);
      
      this.io.to(sessionId).emit('simulation-complete', { 
        summary: {
          topRisks: ["Generated from real LLM execution"],
          mustFixes: ["Check discussion for details"],
          openQuestions: [],
          nextActions: ["See final report"]
        }
      });

    } catch (error) {
      console.error('Simulation failed:', error);
      emit('System', 'Error', 'Error', `Simulation failed: ${error.message}`);
    }
  }

  async callLLM(messages) {
    if (!process.env.OPENAI_API_KEY) {
      return "Error: OPENAI_API_KEY not found in server environment. Please set it to run real simulation.";
    }
    
    try {
      const completion = await this.openai.chat.completions.create({
        model: "gpt-4o", // Or gpt-3.5-turbo
        messages: messages,
        temperature: 0.7,
      });
      return completion.choices[0].message.content;
    } catch (e) {
      console.error("LLM Call Error:", e);
      return `(LLM Error: ${e.message})`;
    }
  }
}

module.exports = SimulationService;

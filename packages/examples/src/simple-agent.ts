import { AgentPool, BaseAgent } from '@mynth/core';

async function main() {
  const pool = new AgentPool();
  pool.createAgent('reasoner', 'Reasoner', [{ type: 'reasoning', level: 7, confidence: 0.9 }]);
  pool.createAgent('coder', 'Coder', [{ type: 'codegen', level: 8, confidence: 0.85 }]);

  const agent = pool.acquire('reasoning');
  if (!agent) {
    console.log('No available agent');
    return;
  }

  console.log(`Acquired agent: ${agent.name} (${agent.id})`);
  agent.onStateChange = (state) => console.log(`  state -> ${state}`);

  agent.assignTask({});
  agent.startWork();
  await new Promise((r) => setTimeout(r, 50));
  console.log('  working...');
  agent.complete();
  console.log('  done');

  pool.release(agent);
  console.log(`Task count: ${agent.metadata.taskCount}`);
}

main().catch(console.error);

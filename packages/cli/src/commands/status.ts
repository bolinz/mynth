import { AgentPool } from '@mynth/core';

export async function statusCommand(): Promise<void> {
  const pool = new AgentPool();
  const agents = pool.getAllAgents();

  console.log('Mynth System Status\n');

  if (agents.length === 0) {
    console.log('No agents configured. Run "mynth run <task>" to create them.');
    return;
  }

  console.log('Agent Pool:');
  console.log('─'.repeat(40));
  for (const agent of agents) {
    const caps = agent.capabilities.map((c) => c.type).join(', ');
    console.log(`  ${agent.name.padEnd(12)} ${agent.state.padEnd(12)} [${caps}]`);
  }
  console.log('─'.repeat(40));
  console.log(`  Total agents: ${agents.length}`);
}

import type { CoreEngine } from '@mynth/core';

export async function statusCommand(engine: CoreEngine): Promise<void> {
  const pool = engine.getAgentPool();
  const agents = pool.getAllAgents();

  console.log('Mynth System Status\n');
  if (agents.length === 0) {
    console.log('No agents configured.');
    return;
  }

  console.log('Agent Pool:');
  console.log('\u2500'.repeat(45));
  for (const agent of agents) {
    const caps = agent.capabilities.map((c) => c.type).join(', ');
    console.log(`  ${agent.name.padEnd(12)} ${agent.state.padEnd(12)} [${caps}]`);
  }
  console.log('\u2500'.repeat(45));
  console.log(`  Total agents: ${agents.length}`);
}

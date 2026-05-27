import type { CoreEngine } from '@mynth/core';

export async function statusCommand(engine: CoreEngine): Promise<void> {
  const pool = engine.getAgentPool();
  const agents = pool.getAllAgents();

  const degradation = engine.degradation;
  const level = degradation.getLevel();
  const summary = degradation.getSummary();

  console.log('Mynth System Status\n');
  const levelColor = level === 0 ? '\x1b[32m' : level >= 3 ? '\x1b[31m' : '\x1b[33m';
  console.log(`  Degradation Level: ${levelColor}L${level}\x1b[0m`);
  for (const [dim, state] of Object.entries(summary)) {
    const color =
      state.health === 'ok' ? '\x1b[32m' : state.health === 'degraded' ? '\x1b[33m' : '\x1b[31m';
    console.log(
      `    ${dim.padEnd(14)} ${color}${state.health}\x1b[0m${state.reason ? ` (${state.reason})` : ''}`,
    );
  }
  console.log('');

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

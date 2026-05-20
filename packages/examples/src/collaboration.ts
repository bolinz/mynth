import { AgentPool, Orchestrator, Scheduler } from '@mynth/core';

async function main() {
  const pool = new AgentPool();
  pool.createAgent('reasoner', 'Reasoner', [
    { type: 'reasoning', level: 8, confidence: 0.9 },
    { type: 'coordination', level: 5, confidence: 0.7 },
  ]);
  pool.createAgent('coder', 'Coder', [{ type: 'codegen', level: 8, confidence: 0.85 }]);
  pool.createAgent('reviewer', 'Reviewer', [{ type: 'review', level: 7, confidence: 0.8 }]);

  const orchestrator = new Orchestrator(['reasoner', 'coder', 'reviewer']);
  const analysis = await orchestrator.analyze({
    id: 'task-1',
    description: 'Implement a login form with validation',
    priority: 1,
  });

  console.log(`Starting chain: first agent = ${analysis.firstAgent}`);
  console.log(`Max hops: ${analysis.constraints.maxHops}`);

  const scheduler = new Scheduler();
  await scheduler.submit({
    id: 'task-1',
    description: 'Implement a login form with validation',
    priority: 1,
  });

  const chain: Array<{ id: string; cap: 'reasoning' | 'codegen' | 'review' }> = [
    { id: 'reasoner', cap: 'reasoning' },
    { id: 'coder', cap: 'codegen' },
    { id: 'reviewer', cap: 'review' },
  ];
  const taskContext = await orchestrator.initializeChain(
    { id: 'task-1', description: 'Implement a login form with validation', priority: 1 },
    chain[0].id,
  );

  for (const { id: agentId, cap } of chain) {
    const agent = pool.acquire(cap);
    if (!agent) {
      console.log(`No agent available for ${cap}`);
      continue;
    }

    console.log(`\n[${agent.name}] executing...`);
    agent.assignTask(taskContext);
    agent.startWork();
    await new Promise((r) => setTimeout(r, 100));
    console.log(`[${agent.name}] completed`);
    agent.complete();
    pool.release(agent);
  }

  scheduler.updateStatus('task-1', 'completed');
  console.log('\nChain transfer complete');
}

main().catch(console.error);

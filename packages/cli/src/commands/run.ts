import { AgentPool, Orchestrator, Scheduler } from '@mynth/core';

export async function runCommand(task: string, options: { timeout?: string }): Promise<void> {
  const pool = new AgentPool();
  pool.createAgent('reasoner', 'Reasoner', [
    { type: 'reasoning', level: 8, confidence: 0.9 },
    { type: 'coordination', level: 5, confidence: 0.7 },
  ]);
  pool.createAgent('coder', 'Coder', [
    { type: 'codegen', level: 8, confidence: 0.85 },
  ]);
  pool.createAgent('reviewer', 'Reviewer', [
    { type: 'review', level: 7, confidence: 0.8 },
  ]);

  const taskId = `task_${Date.now()}`;
  const scheduler = new Scheduler();
  await scheduler.submit({ id: taskId, description: task, priority: 1 });

  const orchestrator = new Orchestrator(['reasoner', 'coder', 'reviewer']);
  const analysis = await orchestrator.analyze({ id: taskId, description: task, priority: 1 });

  console.log(`Task submitted: ${taskId}`);
  console.log(`Status: queued\n`);
  console.log(`[orchestrator] analyzing task: needs ${analysis.capabilities.join(', ')}`);
  console.log(`[orchestrator] first agent: ${analysis.firstAgent}`);

  const chain = ['reasoning', 'codegen', 'review'] as const;
  const taskContext = await orchestrator.initializeChain(
    { id: taskId, description: task, priority: 1 },
    'reasoner',
  );

  for (const cap of chain) {
    const agent = pool.acquire(cap);
    if (!agent) {
      console.log(`No agent available for ${cap}`);
      continue;
    }

    agent.onStateChange = (state) => {
      if (state === 'working') console.log(`  [${agent.name}] working...`);
    };

    console.log(`\n[${agent.name}] executing...`);
    agent.assignTask(taskContext);
    agent.startWork();

    const timeoutMs = options.timeout ? Number.parseInt(options.timeout) : 5000;
    await new Promise((r) => setTimeout(r, Math.min(200, timeoutMs)));

    agent.complete();
    console.log(`[${agent.name}] completed`);
    pool.release(agent);
  }

  scheduler.updateStatus(taskId, 'completed');
  console.log(`\n✓ Task completed: ${taskId}`);
}

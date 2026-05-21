import type { CoreEngine } from '@mynth/core';

export async function logsCommand(engine: CoreEngine, taskId?: string): Promise<void> {
  if (!taskId) {
    console.log('Usage: mynth logs <taskId>');
    return;
  }

  const hops = await engine.stateStore.loadTaskHops(taskId);
  const tasks = await engine.stateStore.loadAllTasks();
  const task = tasks.find((t) => t.taskId === taskId);

  console.log(`\nTask: ${task?.description ?? taskId}`);
  console.log(`Status: ${task?.status ?? 'unknown'} | Hops: ${task?.hops ?? hops.length}`);
  console.log('');

  if (hops.length === 0) {
    console.log('  No hop records found.');
    return;
  }

  for (let i = 0; i < hops.length; i++) {
    const hop = hops[i];
    const to = hop.toAgent || '(complete)';
    console.log(`  [${i + 1}] ${hop.fromAgent} \u2192 ${to}  (${hop.duration}ms)`);
  }
  console.log('');
}

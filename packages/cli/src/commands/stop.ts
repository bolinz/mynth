import type { CoreEngine } from '@mynth/core';

export async function stopCommand(engine: CoreEngine, taskId?: string): Promise<void> {
  if (!taskId) {
    console.log('Usage: mynth stop <taskId>');
    return;
  }

  const scheduler = engine.getScheduler();
  const task = scheduler.getTask(taskId);

  if (!task) {
    console.log(`Task not found: ${taskId}`);
    return;
  }

  if (task.status !== 'running' && task.status !== 'queued') {
    console.log(`Task ${taskId} is already ${task.status}`);
    return;
  }

  await scheduler.cancel(taskId);
  console.log(`Task ${taskId} cancelled.`);
}

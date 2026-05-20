import { Scheduler } from '@mynth/core';

export async function listCommand(): Promise<void> {
  const scheduler = new Scheduler();
  const tasks = scheduler.getAllTasks();

  console.log('Tasks\n');

  if (tasks.length === 0) {
    console.log('No tasks. Run "mynth run <task>" to create one.');
    return;
  }

  for (const task of tasks) {
    const age = Math.floor((Date.now() - task.createdAt) / 1000);
    console.log(`  ${task.taskId.padEnd(20)} ${task.status.padEnd(12)} ${age}s ago`);
  }
}

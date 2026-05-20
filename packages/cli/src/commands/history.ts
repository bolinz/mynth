import type { CoreEngine } from '@mynth/core';

export async function historyCommand(engine: CoreEngine): Promise<void> {
  const tasks = await engine.stateStore.loadAllTasks();
  const agents = await engine.stateStore.loadAgentConfigs();

  console.log('Task History\n');
  if (tasks.length === 0) {
    console.log('  No tasks yet. Run "mynth run <task>" to create one.\n');
  } else {
    for (const task of tasks) {
      const date = new Date(task.createdAt).toLocaleString();
      const icon = task.status === 'complete' ? '\u2713' : '\u2717';
      console.log(
        `  ${icon} ${task.taskId.padEnd(24)} ${task.status.padEnd(10)} ${task.hops} hops  ${date}`,
      );
    }
    console.log();
  }

  console.log('Agents');
  if (agents.length > 0) {
    console.log(`  ${agents.length} configured: ${agents.map((a) => a.name).join(', ')}`);
  }
}

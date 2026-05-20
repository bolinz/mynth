import type { CoreEngine } from '@mynth/core';

export async function runCommand(
  engine: CoreEngine,
  task: string,
  _options: { timeout?: string },
): Promise<void> {
  const result = await engine.executeTask(task);
  console.log(`Task submitted: ${result.taskId}`);
  console.log(`Status: ${result.status}`);
  console.log(`Hops: ${result.hops}`);
}

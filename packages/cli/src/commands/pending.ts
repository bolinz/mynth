import type { CoreEngine } from '@mynth/core';

export async function pendingCommand(engine: CoreEngine): Promise<void> {
  const pending = engine.hitlManager.getPending();
  if (pending.length === 0) {
    console.log('No pending approvals.');
    return;
  }
  console.log(`\nPending Approvals (${pending.length}):\n`);
  for (const req of pending) {
    console.log(`  ${req.id}`);
    console.log(`    Agent:    ${req.agentId}`);
    console.log(`    Task:     ${req.taskId}`);
    console.log(`    Action:   ${req.operation.type}: ${req.operation.summary}`);
    console.log(`    Target:   ${req.operation.target}`);
    console.log(`    Time:     ${new Date(req.createdAt).toLocaleString()}`);
    console.log('');
  }
}

import type { CoreEngine } from '@mynth/core';

export interface ApproveOptions {
  reject?: boolean;
  note?: string;
}

export async function approveCommand(
  engine: CoreEngine,
  requestId: string,
  options: ApproveOptions,
): Promise<void> {
  const req = engine.hitlManager.getById(requestId);
  if (!req) {
    console.error(`Request not found: ${requestId}`);
    return;
  }
  if (req.status !== 'pending') {
    console.error(`Request ${requestId} is already ${req.status}`);
    return;
  }

  if (options.reject) {
    await engine.hitlManager.reject(requestId, 'cli', options.note);
    console.log(`Rejected: ${requestId}`);
  } else {
    await engine.hitlManager.approve(requestId, 'cli', options.note);
    console.log(`Approved: ${requestId}`);
  }
}

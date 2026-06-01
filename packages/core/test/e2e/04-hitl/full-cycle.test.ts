import { describe, expect, it } from 'vitest';
import { createEngine, destroyEngine } from '../helpers/fixture.ts';

describe('e2e: HITL full cycle', () => {
  it('should submit and approve HITL request', async () => {
    const fx = await createEngine();

    const req = await fx.engine.hitlManager.submit({
      agentId: 'agent-1',
      taskId: 'task-1',
      operation: { type: 'config.modify', target: 'budget', summary: 'increase limit' },
      triggeredBy: 'guard_rule',
    });

    expect(req.status).toBe('pending');

    const ok = await fx.engine.hitlManager.approve(req.id, 'admin', 'approved');
    expect(ok).toBe(true);

    const updated = fx.engine.hitlManager.getById(req.id);
    expect(updated?.status).toBe('approved');
    expect(updated?.decidedBy).toBe('admin');

    await destroyEngine(fx);
  });

  it('should reject HITL request', async () => {
    const fx = await createEngine();

    const req = await fx.engine.hitlManager.submit({
      agentId: 'agent-1',
      taskId: 'task-1',
      operation: { type: 'config.modify', target: 'budget', summary: 'increase limit' },
      triggeredBy: 'guard_rule',
    });

    const ok = await fx.engine.hitlManager.reject(req.id, 'admin', 'not now');
    expect(ok).toBe(true);
    expect(fx.engine.hitlManager.getById(req.id)?.status).toBe('rejected');

    await destroyEngine(fx);
  });

  it('should persist HITL requests after restart', async () => {
    const { mkdtempSync, rmSync } = await import('fs');
    const { tmpdir } = await import('os');
    const { join } = await import('path');
    const { CoreEngine } = await import('../../../src/engine/CoreEngine.ts');

    const dir = mkdtempSync(join(tmpdir(), 'mynth-e2e-hitl-'));

    const engine1 = new CoreEngine({ dbPath: dir });
    await engine1.start();
    const req = await engine1.hitlManager.submit({
      agentId: 'a',
      taskId: 't1',
      operation: { type: 'config.modify', target: 'x', summary: 'test' },
      triggeredBy: 'guard_rule',
    });
    await engine1.hitlManager.approve(req.id, 'admin');
    await engine1.stop();

    const engine2 = new CoreEngine({ dbPath: dir });
    await engine2.start();
    await engine2.hitlManager.loadAll();
    expect(engine2.hitlManager.getById(req.id)?.status).toBe('approved');
    await engine2.stop();

    rmSync(dir, { recursive: true, force: true });
  });
});

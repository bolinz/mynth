import { describe, expect, it } from 'vitest';
import { HITLManager } from '../../src/meta/HITLManager.ts';

describe('HITLManager', () => {
  it('should submit and return pending requests', async () => {
    const mgr = new HITLManager();
    const req = await mgr.submit({
      agentId: 'agent-1',
      taskId: 'task-1',
      operation: { type: 'config.modify', target: 'budget', summary: 'Modify budget limit' },
      triggeredBy: 'guard_rule',
    });
    expect(req.status).toBe('pending');
    expect(req.id).toBeDefined();
    expect(mgr.getPendingCount()).toBe(1);
  });

  it('should approve a pending request', async () => {
    const mgr = new HITLManager();
    const req = await mgr.submit({
      agentId: 'agent-1',
      taskId: 't1',
      operation: { type: 'config.modify', target: 'budget', summary: 'test' },
      triggeredBy: 'guard_rule',
    });
    const ok = await mgr.approve(req.id, 'user-1');
    expect(ok).toBe(true);
    const approved = mgr.getById(req.id)!;
    expect(approved.status).toBe('approved');
    expect(approved.decidedBy).toBe('user-1');
  });

  it('should reject a pending request', async () => {
    const mgr = new HITLManager();
    const req = await mgr.submit({
      agentId: 'agent-1',
      taskId: 't1',
      operation: { type: 'config.modify', target: 'budget', summary: 'test' },
      triggeredBy: 'guard_rule',
    });
    const ok = await mgr.reject(req.id, 'user-1', 'not now');
    expect(ok).toBe(true);
    const rejected = mgr.getById(req.id)!;
    expect(rejected.status).toBe('rejected');
    expect(rejected.note).toBe('not now');
  });

  it('should not approve non-pending request', async () => {
    const mgr = new HITLManager();
    expect(await mgr.approve('nonexistent', 'user')).toBe(false);
  });

  it('should return all requests', async () => {
    const mgr = new HITLManager();
    await mgr.submit({
      agentId: 'a',
      taskId: 't1',
      operation: { type: 'config.modify', target: 'x', summary: 'x' },
      triggeredBy: 'guard_rule',
    });
    await mgr.submit({
      agentId: 'b',
      taskId: 't2',
      operation: { type: 'budget.override', target: 'y', summary: 'y' },
      triggeredBy: 'guard_rule',
    });
    expect(mgr.getAll().length).toBe(2);
  });

  it('should persist requests to LevelDB', async () => {
    const { mkdtempSync, rmSync } = await import('fs');
    const { tmpdir } = await import('os');
    const { join } = await import('path');
    const { LevelDBAdapter } = await import('../../src/persistence/LevelDBAdapter.ts');

    const dir = mkdtempSync(join(tmpdir(), 'mynth-hitl-'));
    const db = new LevelDBAdapter(dir);
    await db.open();

    const mgr = new HITLManager(db);
    const req = await mgr.submit({
      agentId: 'agent-1', taskId: 't1',
      operation: { type: 'config.modify', target: 'budget', summary: 'test' },
      triggeredBy: 'guard_rule',
    });
    await mgr.approve(req.id, 'user-1');

    const mgr2 = new HITLManager(db);
    await mgr2.loadAll();
    const loaded = mgr2.getById(req.id);
    expect(loaded).toBeDefined();
    expect(loaded!.status).toBe('approved');
    expect(loaded!.decidedBy).toBe('user-1');

    await db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('should recover requests from LevelDB on loadAll', async () => {
    const { mkdtempSync, rmSync } = await import('fs');
    const { tmpdir } = await import('os');
    const { join } = await import('path');
    const { LevelDBAdapter } = await import('../../src/persistence/LevelDBAdapter.ts');

    const dir = mkdtempSync(join(tmpdir(), 'mynth-hitl2-'));
    const db = new LevelDBAdapter(dir);
    await db.open();

    const mgr = new HITLManager(db);
    await mgr.submit({
      agentId: 'a', taskId: 't1',
      operation: { type: 'budget.override', target: 'x', summary: 'x' },
      triggeredBy: 'guard_rule',
    });
    await mgr.submit({
      agentId: 'b', taskId: 't2',
      operation: { type: 'config.modify', target: 'y', summary: 'y' },
      triggeredBy: 'guard_rule',
    });

    const mgr2 = new HITLManager(db);
    await mgr2.loadAll();
    expect(mgr2.getAll().length).toBe(2);
    expect(mgr2.getPendingCount()).toBe(2);

    await db.close();
    rmSync(dir, { recursive: true, force: true });
  });
});

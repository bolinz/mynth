import { describe, expect, it } from 'vitest';
import { PrivateMemory } from '../../src/memory/PrivateMemory.ts';

describe('PrivateMemory', () => {
  it('should store and recall items', async () => {
    const mem = new PrivateMemory('agent-1');
    await mem.remember('key1', { hello: 'world' });
    const val = await mem.recall('key1');
    expect(val).toEqual({ hello: 'world' });
  });

  it('should return null for unknown keys', async () => {
    const mem = new PrivateMemory('agent-1');
    expect(await mem.recall('nonexistent')).toBeNull();
  });

  it('should forget items', async () => {
    const mem = new PrivateMemory('agent-1');
    await mem.remember('x', 1);
    await mem.forget('x');
    expect(await mem.recall('x')).toBeNull();
  });

  it('should prune low-importance items', async () => {
    const mem = new PrivateMemory('agent-1');
    await mem.remember('important', 'high', 0.9);
    await mem.remember('unimportant', 'low', 0.05);
    const pruned = mem.prune(0.2);
    expect(pruned).toBe(1);
    expect(await mem.recall('important')).toBe('high');
  });

  it('should limit short-term size', async () => {
    const mem = new PrivateMemory('agent-1');
    for (let i = 0; i < 60; i++) {
      await mem.remember(`k${i}`, i);
    }
    expect(mem.size()).toBeLessThanOrEqual(50);
  });

  it('should persist via LevelDB', async () => {
    const { mkdtempSync, rmSync } = await import('fs');
    const { tmpdir } = await import('os');
    const { join } = await import('path');
    const { LevelDBAdapter } = await import('../../src/persistence/LevelDBAdapter.ts');

    const dir = mkdtempSync(join(tmpdir(), 'mynth-priv-'));
    const db = new LevelDBAdapter(dir);
    await db.open();

    const mem1 = new PrivateMemory('agent-x', db);
    await mem1.remember('persist', 'yes');

    const mem2 = new PrivateMemory('agent-x', db);
    expect(await mem2.recall('persist')).toBe('yes');

    await db.close();
    rmSync(dir, { recursive: true, force: true });
  });
});

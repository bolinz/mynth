import { describe, expect, it } from 'vitest';
import { GlobalMemory } from '../../src/memory/GlobalMemory.ts';
import { PrivateMemory } from '../../src/memory/PrivateMemory.ts';

describe('PrivateMemory L3 backup', () => {
  it('should backup and restore from GlobalMemory', async () => {
    const globalMem = new GlobalMemory();
    const mem = new PrivateMemory('agent-x');

    await mem.remember('key1', 'value1', 0.9);
    await mem.remember('key2', { nested: true }, 0.8);
    await mem.backup(globalMem);

    const mem2 = new PrivateMemory('agent-x');
    const restored = await mem2.restore(globalMem);
    expect(restored).toBe(2);
    expect(await mem2.recall('key1')).toBe('value1');
    expect(await mem2.recall('key2')).toEqual({ nested: true });
  });

  it('should skip restore if L2 has data', async () => {
    const { mkdtempSync, rmSync } = await import('fs');
    const { tmpdir } = await import('os');
    const { join } = await import('path');
    const { LevelDBAdapter } = await import('../../src/persistence/LevelDBAdapter.ts');

    const dir = mkdtempSync(join(tmpdir(), 'mynth-l3-'));
    try {
      const db = new LevelDBAdapter(dir);
      await db.open();

      const globalMem = new GlobalMemory();
      const mem = new PrivateMemory('agent-y', db);
      await mem.remember('l2key', 'l2value', 0.9);
      await mem.backup(globalMem);

      // Create new memory with same persistence (L2 has data)
      const mem2 = new PrivateMemory('agent-y', db);
      const restored = await mem2.restore(globalMem);
      expect(restored).toBe(0);
      expect(await mem2.recall('l2key')).toBe('l2value');

      await db.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

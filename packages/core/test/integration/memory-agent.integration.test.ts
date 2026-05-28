import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { GlobalMemory } from '../../src/memory/GlobalMemory.ts';
import { PrivateMemory } from '../../src/memory/PrivateMemory.ts';
import { LevelDBAdapter } from '../../src/persistence/LevelDBAdapter.ts';
import type { Persistence } from '../../src/persistence/Persistence.ts';

describe('Memory consistency across agents integration', () => {
  it('should backup and restore across agents via GlobalMemory', async () => {
    const globalMem = new GlobalMemory();
    const agent1 = new PrivateMemory('agent-a');

    await agent1.remember('secret', 'agent-a-data', 0.9);
    await agent1.remember('config', { timeout: 30 }, 0.8);
    await agent1.backup(globalMem);

    const agent2 = new PrivateMemory('agent-b');
    const restored = await agent2.restore(globalMem);
    expect(restored).toBe(0); // different agentId, no match

    // Original data still accessible
    expect(await agent1.recall('secret')).toBe('agent-a-data');
    expect(await agent1.recall('config')).toEqual({ timeout: 30 });
  });

  it('should persist memory via LevelDB and survive DB reopen', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mynth-mem-'));
    try {
      const db = new LevelDBAdapter(dir);
      await db.open();

      const mem1 = new PrivateMemory('agent-x', db);
      await mem1.remember('persistent-key', 'stored-value', 0.95);
      await db.close();

      await db.open();
      const mem2 = new PrivateMemory('agent-x', db);
      expect(await mem2.recall('persistent-key')).toBe('stored-value');
      await db.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('should share memory between agents via GlobalMemory reads', async () => {
    const globalMem = new GlobalMemory();

    await globalMem.write('shared-key', 'shared-value');
    expect(await globalMem.read('shared-key')).toBe('shared-value');
  });

  it('should skip L3 restore when L2 has data', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mynth-mem-'));
    try {
      const db = new LevelDBAdapter(dir);
      await db.open();

      const globalMem = new GlobalMemory();
      const mem = new PrivateMemory('agent-z', db);
      await mem.remember('l2-key', 'l2-value', 0.9);
      await mem.backup(globalMem);

      const mem2 = new PrivateMemory('agent-z', db);
      const restored = await mem2.restore(globalMem);
      expect(restored).toBe(0); // L2 has data, skip L3 restore
      expect(await mem2.recall('l2-key')).toBe('l2-value');

      await db.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

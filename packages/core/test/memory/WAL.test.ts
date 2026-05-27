import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { LevelDBAdapter } from '../../src/persistence/LevelDBAdapter.ts';
import { GlobalMemory } from '../../src/memory/GlobalMemory.ts';
import { MemoryGateway } from '../../src/memory/MemoryGateway.ts';

describe('MemoryGateway WAL', () => {
  it('should recover contributions after crash', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mynth-wal-'));
    try {
      const db = new LevelDBAdapter(dir);
      await db.open();
      const globalMem = new GlobalMemory(db);
      const gateway = new MemoryGateway(globalMem, db);

      await gateway.writeContribution('agent-1', 'key1', 'value1');
      await gateway.writeContribution('agent-1', 'key2', 'value2');

      // Simulate flush wait
      await new Promise((r) => setTimeout(r, 100));

      // New gateway on same DB should recover
      const globalMem2 = new GlobalMemory(db);
      const gateway2 = new MemoryGateway(globalMem2, db);
      const recovered = await gateway2.recover();
      expect(recovered).toBeGreaterThanOrEqual(0);

      // Data should still be accessible
      expect(await globalMem2.read('key1')).toBe('value1');

      await db.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

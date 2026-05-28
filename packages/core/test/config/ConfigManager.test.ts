import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { ConfigManager } from '../../src/config/ConfigManager.ts';
import { LevelDBAdapter } from '../../src/persistence/LevelDBAdapter.ts';

const validConfig = {
  dbPath: '/tmp/test',
  maxHops: 10,
  agents: [
    { id: 'a', name: 'A', capabilities: [{ type: 'reasoning', level: 8, confidence: 0.9 }] },
  ],
};

describe('ConfigManager', () => {
  it('should validate a valid config', () => {
    const mgr = new ConfigManager();
    const result = mgr.validate(validConfig);
    expect(result.dbPath).toBe('/tmp/test');
    expect(result.maxHops).toBe(10);
  });

  it('should get validated config', () => {
    const mgr = new ConfigManager();
    mgr.validate(validConfig);
    const cfg = mgr.get();
    expect(cfg.maxHops).toBe(10);
  });

  it('should throw on get before validate', () => {
    const mgr = new ConfigManager();
    expect(() => mgr.get()).toThrow('not validated');
  });

  it('should generate default config', () => {
    const cfg = ConfigManager.defaultConfig();
    expect(cfg.dbPath).toBe('./data');
    expect(cfg.maxHops).toBe(10);
    expect(cfg.agents.length).toBe(3);
  });

  it('should save and retrieve snapshots', async () => {
    const mgr = new ConfigManager();
    const s1 = await mgr.saveSnapshot({ key: 'v1' }, 'first');
    const s2 = await mgr.saveSnapshot({ key: 'v2' }, 'second');

    expect(mgr.getSnapshot(s1.id)?.label).toBe('first');
    expect(mgr.getSnapshot(s2.id)?.label).toBe('second');
  });

  it('should list snapshots in reverse chronological order', async () => {
    const mgr = new ConfigManager();
    await mgr.saveSnapshot({ a: 1 }, 'old');
    await new Promise((r) => setTimeout(r, 1));
    await mgr.saveSnapshot({ b: 2 }, 'new');

    const list = mgr.listSnapshots();
    expect(list).toHaveLength(2);
    expect(list[0].label).toBe('new');
    expect(list[1].label).toBe('old');
  });

  it('should return empty list when no snapshots', () => {
    const mgr = new ConfigManager();
    expect(mgr.listSnapshots()).toEqual([]);
  });

  it('should return undefined for unknown snapshot id', () => {
    const mgr = new ConfigManager();
    expect(mgr.getSnapshot('nonexistent')).toBeUndefined();
  });

  it('should persist and load snapshots from LevelDB', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mynth-cfg-'));
    try {
      const db = new LevelDBAdapter(dir);
      await db.open();

      const mgr1 = new ConfigManager(db);
      await mgr1.saveSnapshot({ key: 'persisted' }, 'from-db');

      const mgr2 = new ConfigManager(db);
      await mgr2.loadFromPersistence();
      expect(mgr2.listSnapshots()).toHaveLength(1);
      expect(mgr2.listSnapshots()[0].label).toBe('from-db');

      await db.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('should not load from persistence when no db', async () => {
    const mgr = new ConfigManager();
    await mgr.loadFromPersistence(); // no-op
    expect(mgr.listSnapshots()).toEqual([]);
  });
});

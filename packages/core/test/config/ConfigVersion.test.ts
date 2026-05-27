import { describe, expect, it } from 'vitest';
import { ConfigManager } from '../../src/config/ConfigManager.ts';

describe('ConfigManager versioning', () => {
  it('should save and retrieve snapshots', async () => {
    const mgr = new ConfigManager();
    const snap = await mgr.saveSnapshot({ maxHops: 10 }, 'initial config');
    expect(snap.id).toBeDefined();
    expect(snap.label).toBe('initial config');

    const retrieved = mgr.getSnapshot(snap.id);
    expect(retrieved).toBeDefined();
    expect(retrieved!.config.maxHops).toBe(10);
  });

  it('should list snapshots in reverse chronological order', async () => {
    const mgr = new ConfigManager();
    const s1 = await mgr.saveSnapshot({ v: 1 });
    await new Promise((r) => setTimeout(r, 5));
    const s2 = await mgr.saveSnapshot({ v: 2 });

    const list = mgr.listSnapshots();
    expect(list.length).toBe(2);
    expect(list[0].id).toBe(s2.id);
    expect(list[1].id).toBe(s1.id);
  });
});

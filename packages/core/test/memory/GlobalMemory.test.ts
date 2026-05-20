import { beforeEach, describe, expect, it } from 'vitest';
import { CheckpointManager } from '../../src/memory/Checkpoint.ts';
import { GlobalMemory } from '../../src/memory/GlobalMemory.ts';

describe('GlobalMemory', () => {
  let mem: GlobalMemory;

  beforeEach(() => {
    mem = new GlobalMemory();
  });

  it('should write and read values', async () => {
    await mem.write('key1', { hello: 'world' });
    const val = await mem.read('key1');
    expect(val).toEqual({ hello: 'world' });
  });

  it('should return null for missing keys', async () => {
    expect(await mem.read('nonexistent')).toBeNull();
  });

  it('should delete values', async () => {
    await mem.write('key1', 'value');
    await mem.delete('key1');
    expect(await mem.read('key1')).toBeNull();
  });

  it('should take and restore snapshots', async () => {
    await mem.write('a', 1);
    const snap = mem.snapshot();
    await mem.write('b', 2);
    mem.restore(snap);
    expect(await mem.read('b')).toBeNull();
    expect(await mem.read('a')).toBe(1);
  });
});

describe('CheckpointManager', () => {
  let mem: GlobalMemory;

  beforeEach(() => {
    mem = new GlobalMemory();
  });

  it('should create and list checkpoints', async () => {
    const cm = new CheckpointManager(mem);
    const cp = await cm.create({ agentId: 'a', state: 'working', partialResult: 'ok' });
    expect(cp.id).toBeDefined();
    expect(cp.agentId).toBe('a');
    expect(cm.list()).toHaveLength(1);
  });

  it('should restore from checkpoint', async () => {
    const cm = new CheckpointManager(mem);
    const cp = await cm.create({ agentId: 'a', state: 'working', partialResult: 'progress' });
    const restored = cm.restore(cp.id);
    expect(restored?.partialResult).toBe('progress');
  });

  it('should clean up old checkpoints', async () => {
    const cm = new CheckpointManager(mem);
    await cm.create({ agentId: 'a', state: 'working', partialResult: '1' });
    await cm.create({ agentId: 'b', state: 'working', partialResult: '2' });
    cm.cleanup(1);
    expect(cm.list().length).toBeLessThanOrEqual(1);
  });

  it('should return null for unknown checkpoint', () => {
    const cm = new CheckpointManager(mem);
    expect(cm.restore('nope')).toBeNull();
  });
});

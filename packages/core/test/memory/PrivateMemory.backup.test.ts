import { describe, expect, it } from 'vitest';
import { PrivateMemory } from '../../src/memory/PrivateMemory.ts';
import { GlobalMemory } from '../../src/memory/GlobalMemory.ts';

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
});

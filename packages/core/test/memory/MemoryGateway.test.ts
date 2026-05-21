import { describe, expect, it } from 'vitest';
import { GlobalMemory } from '../../src/memory/GlobalMemory.ts';
import { MemoryGateway } from '../../src/memory/MemoryGateway.ts';

describe('MemoryGateway', () => {
  it('should accept valid contributions', async () => {
    const mem = new GlobalMemory();
    const gw = new MemoryGateway(mem);
    const result = await gw.writeContribution('agent-a', 'key1', { hello: 'world' });
    expect(result.accepted).toBe(true);
    expect(gw.getContributionCount()).toBe(1);
  });

  it('should reject duplicate contributions', async () => {
    const mem = new GlobalMemory();
    const gw = new MemoryGateway(mem);
    await gw.writeContribution('agent-a', 'key1', 'value1');
    const result = await gw.writeContribution('agent-a', 'key1', 'value2');
    expect(result.accepted).toBe(false);
    expect(result.reason).toBe('duplicate contribution');
  });

  it('should reject invalid keys', async () => {
    const mem = new GlobalMemory();
    const gw = new MemoryGateway(mem);
    const result = await gw.writeContribution('a', '', 'value');
    expect(result.accepted).toBe(false);
  });

  it('should track contributions for skill distillation', async () => {
    const mem = new GlobalMemory();
    const gw = new MemoryGateway(mem);
    const skill = gw.checkSkillDistillation(50);
    expect(skill).toBeNull();
  });

  it('should detect skill distillation threshold', async () => {
    const mem = new GlobalMemory();
    const gw = new MemoryGateway(mem);
    for (let i = 0; i < 50; i++) {
      await gw.writeContribution('reasoner', `pattern_${i}`, 'data');
    }
    const skill = gw.checkSkillDistillation(50);
    expect(skill).not.toBeNull();
    expect(skill!.meta.usageCount).toBe(50);
  });

  it('should list all contributions', async () => {
    const mem = new GlobalMemory();
    const gw = new MemoryGateway(mem);
    await gw.writeContribution('a', 'k1', 'v1');
    await gw.writeContribution('b', 'k2', 'v2');
    expect(gw.getContributions()).toHaveLength(2);
  });
});

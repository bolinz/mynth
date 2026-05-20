import type { Capability } from '@mynth/sdk';
import { describe, expect, it } from 'vitest';
import { AgentPool } from '../../src/agent/AgentPool.ts';

const reasonCaps: Capability[] = [{ type: 'reasoning', level: 7, confidence: 0.9 }];
const codegenCaps: Capability[] = [{ type: 'codegen', level: 7, confidence: 0.9 }];

describe('AgentPool', () => {
  it('should acquire an agent by capability', () => {
    const pool = new AgentPool();
    pool.createAgent('r1', 'Reasoner', reasonCaps);
    const agent = pool.acquire('reasoning');
    expect(agent).not.toBeNull();
    expect(agent!.id).toBe('r1');
    expect(agent!.state).toBe('idle');
  });

  it('should return null when no agent available', () => {
    const pool = new AgentPool();
    expect(pool.acquire('reasoning')).toBeNull();
  });

  it('should not return busy agents', () => {
    const pool = new AgentPool();
    pool.createAgent('r1', 'Reasoner', reasonCaps);
    const a1 = pool.acquire('reasoning')!;
    a1.assignTask({} as any);
    expect(pool.acquire('reasoning')).toBeNull();
  });

  it('should release agent back to pool', () => {
    const pool = new AgentPool();
    pool.createAgent('r1', 'Reasoner', reasonCaps);
    const agent = pool.acquire('reasoning')!;
    pool.release(agent);
    expect(pool.acquire('reasoning')).not.toBeNull();
  });

  it('should find agents by capability', () => {
    const pool = new AgentPool();
    pool.createAgent('r1', 'R', reasonCaps);
    pool.createAgent('c1', 'C', codegenCaps);
    expect(pool.findByCapability('reasoning')).toHaveLength(1);
    expect(pool.findByCapability('codegen')).toHaveLength(1);
  });

  it('should get all agents', () => {
    const pool = new AgentPool();
    pool.createAgent('r1', 'R', reasonCaps);
    pool.createAgent('c1', 'C', codegenCaps);
    expect(pool.getAllAgents()).toHaveLength(2);
  });

  it('should destroy agents', () => {
    const pool = new AgentPool();
    pool.createAgent('r1', 'R', reasonCaps);
    pool.destroyAgent('r1');
    expect(pool.getAllAgents()).toHaveLength(0);
  });
});

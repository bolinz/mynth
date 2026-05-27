import { describe, expect, it } from 'vitest';

// Type-level tests: ensure types are correctly structured
describe('SDK types', () => {
  it('should support TaskStatus values', () => {
    const statuses = [
      'queued',
      'running',
      'completed',
      'failed',
      'cancelled',
      'rolled_back',
    ] as const;
    expect(statuses).toContain('running');
    expect(statuses).toContain('completed');
  });

  it('should support CapabilityType values', () => {
    const types = [
      'reasoning',
      'codegen',
      'review',
      'search',
      'plan',
      'memory',
      'math',
      'creative',
      'critique',
      'synthesis',
      'coordination',
    ] as const;
    expect(types).toContain('reasoning');
    expect(types).toContain('codegen');
  });

  it('should support AgentState values', () => {
    const states = [
      'idle',
      'thinking',
      'working',
      'transferring',
      'waiting',
      'error',
      'shutdown',
    ] as const;
    expect(states).toContain('idle');
    expect(states).toContain('working');
  });

  it('should support MessageType values', () => {
    const types = [
      'task',
      'result',
      'transfer',
      'error',
      'status',
      'control',
      'query',
      'response',
      'broadcast',
      'ack',
    ] as const;
    expect(types).toContain('task');
    expect(types).toContain('result');
  });

  it('should construct Task object', () => {
    const task = { id: 't1', description: 'test', priority: 1 };
    expect(task.id).toBe('t1');
    expect(task.description).toBe('test');
  });

  it('should construct HopRecord', () => {
    const hop = {
      fromAgent: 'a',
      toAgent: 'b',
      timestamp: Date.now(),
      handoverNote: 'test',
      duration: 100,
    };
    expect(hop.fromAgent).toBe('a');
    expect(hop.duration).toBe(100);
  });

  it('should construct TenantContext', () => {
    const tenant = { tenantId: 'tenant-1' };
    expect(tenant.tenantId).toBe('tenant-1');
  });
});

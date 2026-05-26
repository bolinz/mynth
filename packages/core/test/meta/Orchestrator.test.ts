import type { Task } from '@mynth/sdk';
import { describe, expect, it } from 'vitest';
import { Orchestrator } from '../../src/meta/Orchestrator.ts';

describe('Orchestrator', () => {
  it('should analyze a task and select first agent', async () => {
    const agents = ['reasoner', 'coder', 'reviewer'];
    const orc = new Orchestrator(agents);
    const result = await orc.analyze({
      id: 't1',
      description: 'write code',
      priority: 1,
    } as Task);
    expect(result.firstAgent).toBeDefined();
    expect(agents).toContain(result.firstAgent);
    expect(result.constraints.maxHops).toBeGreaterThan(0);
  });

  it('should initialize chain with context', async () => {
    const orc = new Orchestrator(['reasoner']);
    const chain = await orc.initializeChain(
      { id: 't1', description: 'test', priority: 1 } as Task,
      'reasoner',
    );
    expect(chain.taskId).toBe('t1');
    expect(chain.currentAgent).toBe('reasoner');
  });

  it('should infer codegen capability for code tasks', async () => {
    const orc = new Orchestrator(['reasoner', 'coder', 'reviewer']);
    const result = await orc.analyze({
      id: 't1',
      description: 'implement a login form',
      priority: 1,
    } as Task);
    expect(result.capabilities).toContain('codegen');
    expect(result.capabilities).toContain('reasoning');
  });

  it('should infer review capability for review tasks', async () => {
    const orc = new Orchestrator(['reasoner', 'reviewer']);
    const result = await orc.analyze({
      id: 't1',
      description: 'review the pull request',
      priority: 1,
    } as Task);
    expect(result.capabilities).toContain('review');
  });

  it('should infer plan capability for design tasks', async () => {
    const orc = new Orchestrator(['reasoner']);
    const result = await orc.analyze({
      id: 't1',
      description: 'design the system architecture',
      priority: 1,
    } as Task);
    expect(result.capabilities).toContain('plan');
  });

  it('should default to reasoning for unknown tasks', async () => {
    const orc = new Orchestrator(['reasoner']);
    const result = await orc.analyze({ id: 't1', description: 'hello world', priority: 1 } as Task);
    expect(result.capabilities).toEqual(['reasoning']);
  });

  it('should infer multiple capabilities', async () => {
    const orc = new Orchestrator(['reasoner', 'coder', 'reviewer']);
    const result = await orc.analyze({
      id: 't1',
      description: 'implement a login form and review the code',
      priority: 1,
    } as Task);
    expect(result.capabilities).toContain('codegen');
    expect(result.capabilities).toContain('review');
    expect(result.capabilities.length).toBeGreaterThanOrEqual(2);
  });

  it('should select first agent by explicit capability mapping', async () => {
    const orchestrator = new Orchestrator(
      ['ag-1', 'ag-2', 'ag-3'],
      [
        { agentId: 'ag-1', capabilities: ['reasoning'] },
        { agentId: 'ag-2', capabilities: ['codegen'] },
        { agentId: 'ag-3', capabilities: ['review'] },
      ],
    );
    const analysis = await orchestrator.analyze({
      id: 't1',
      description: 'implement a function',
      priority: 1,
    } as Task);
    // reasoning is always inferred first and matched to ag-1 explicitly
    expect(analysis.firstAgent).toBe('ag-1');
  });

  it('should select capability-specific agent when reasoning agent lacks it', async () => {
    const orchestrator = new Orchestrator(
      ['ag-1', 'ag-2'],
      [
        { agentId: 'ag-1', capabilities: ['review'] },
        { agentId: 'ag-2', capabilities: ['codegen'] },
      ],
    );
    const analysis = await orchestrator.analyze({
      id: 't1',
      description: 'implement a function',
      priority: 1,
    } as Task);
    // reasoning is always inferred but no agent maps to it;
    // next capability is codegen which maps to ag-2
    expect(analysis.firstAgent).toBe('ag-2');
  });

  it('should fallback to first agent when no capability match', async () => {
    const orchestrator = new Orchestrator(
      ['ag-1', 'ag-2'],
      [
        { agentId: 'ag-1', capabilities: ['reasoning'] },
        { agentId: 'ag-2', capabilities: ['codegen'] },
      ],
    );
    const analysis = await orchestrator.analyze({
      id: 't1',
      description: 'do something unrelated',
      priority: 1,
    } as Task);
    expect(analysis.firstAgent).toBe('ag-1');
  });

  it('should maintain backward compatibility with ID-based matching', async () => {
    const orchestrator = new Orchestrator(['reasoner', 'coder', 'reviewer']);
    const analysis = await orchestrator.analyze({
      id: 't1',
      description: 'write code',
      priority: 1,
    } as Task);
    expect(['reasoner', 'coder', 'reviewer']).toContain(analysis.firstAgent);
  });
});

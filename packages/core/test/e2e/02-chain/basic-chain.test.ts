import { describe, expect, it } from 'vitest';
import { collectEvents } from '../helpers/event-collector.ts';
import { createEngine, destroyEngine } from '../helpers/fixture.ts';

describe('e2e: basic chain transfer', () => {
  it('should complete a simple task with single agent', async () => {
    const fx = await createEngine({
      agents: [
        {
          id: 'agent-a',
          name: 'Agent A',
          capabilities: [
            { type: 'reasoning', level: 8, confidence: 0.9 },
            { type: 'codegen', level: 8, confidence: 0.9 },
            { type: 'creative', level: 8, confidence: 0.9 },
          ],
        },
      ],
      maxHops: 3,
    });

    const events = collectEvents(fx.engine.bus);
    const result = await fx.engine.executeTask('build a login page');

    expect(result.status).toBe('complete');
    expect(result.hops).toBeGreaterThanOrEqual(1);
    expect(result.taskId).toBeDefined();
    expect(events.some((e) => e.topic === 'task.submitted')).toBe(true);
    expect(events.some((e) => e.topic === 'hop.recorded')).toBe(true);

    await destroyEngine(fx);
  });

  it('should route through multiple agents based on capabilities', async () => {
    const fx = await createEngine({
      agents: [
        {
          id: 'reasoner',
          name: 'Reasoner',
          capabilities: [{ type: 'reasoning', level: 8, confidence: 0.9 }],
        },
        {
          id: 'coder',
          name: 'Coder',
          capabilities: [{ type: 'codegen', level: 8, confidence: 0.9 }],
        },
        {
          id: 'reviewer',
          name: 'Reviewer',
          capabilities: [{ type: 'review', level: 7, confidence: 0.8 }],
        },
      ],
      maxHops: 5,
    });

    const result = await fx.engine.executeTask('implement login page with tests');

    expect(result.status).toBe('complete');
    expect(result.hops).toBeGreaterThanOrEqual(2);

    // Verify hops were persisted
    const hops = await fx.engine.stateStore.loadTaskHops(result.taskId);
    expect(hops.length).toBe(result.hops);

    await destroyEngine(fx);
  });

  it('should escalate when no capable agent exists', async () => {
    const fx = await createEngine({
      agents: [
        {
          id: 'agent-a',
          name: 'Agent A',
          capabilities: [{ type: 'reasoning', level: 5, confidence: 0.5 }],
        },
      ],
      maxHops: 3,
    });

    const result = await fx.engine.executeTask('design database schema');

    expect(result.status).toBe('escalated');

    await destroyEngine(fx);
  });

  it('should record hop history with durations', async () => {
    const fx = await createEngine({
      agents: [
        {
          id: 'a',
          name: 'A',
          capabilities: [{ type: 'reasoning', level: 5, confidence: 0.5 }],
        },
        {
          id: 'b',
          name: 'B',
          capabilities: [{ type: 'codegen', level: 5, confidence: 0.5 }],
        },
      ],
      maxHops: 5,
    });

    const result = await fx.engine.executeTask('build feature');
    const hops = await fx.engine.stateStore.loadTaskHops(result.taskId);

    for (const hop of hops) {
      expect(hop.fromAgent).toBeDefined();
      expect(hop.duration).toBeGreaterThanOrEqual(0);
      expect(hop.timestamp).toBeGreaterThan(0);
    }

    await destroyEngine(fx);
  });
});

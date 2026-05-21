import { describe, expect, it } from 'vitest';
import { DegradationMonitor } from '../../src/meta/DegradationMonitor.ts';

describe('DegradationMonitor', () => {
  it('should start at level 0', () => {
    const dm = new DegradationMonitor();
    expect(dm.getLevel()).toBe(0);
  });

  it('should degrade to level 1 for single dimension', () => {
    const dm = new DegradationMonitor();
    dm.setDimension('llm', 'degraded');
    expect(dm.getLevel()).toBe(1);
  });

  it('should degrade to level 2 for multiple dimensions', () => {
    const dm = new DegradationMonitor();
    dm.setDimension('llm', 'degraded');
    dm.setDimension('memory', 'degraded');
    expect(dm.getLevel()).toBe(2);
  });

  it('should degrade to level 4 for down dimension', () => {
    const dm = new DegradationMonitor();
    dm.setDimension('llm', 'down');
    expect(dm.getLevel()).toBe(4);
  });

  it('should trigger onLevelChange callback', () => {
    const dm = new DegradationMonitor();
    const levels: number[] = [];
    dm.onLevelChange((l) => levels.push(l));
    dm.setDimension('llm', 'degraded');
    expect(levels).toEqual([1]);
  });

  it('should track dimension state', () => {
    const dm = new DegradationMonitor();
    dm.setDimension('llm', 'degraded', 'API rate limited');
    const dim = dm.getDimension('llm');
    expect(dim.health).toBe('degraded');
    expect(dim.reason).toBe('API rate limited');
  });

  it('should return summary', () => {
    const dm = new DegradationMonitor();
    dm.setDimension('llm', 'degraded');
    const summary = dm.getSummary();
    expect(summary.llm.health).toBe('degraded');
    expect(summary.memory.health).toBe('ok');
  });
});

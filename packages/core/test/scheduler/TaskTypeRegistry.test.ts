import { describe, expect, it } from 'vitest';
import { TaskTypeRegistry } from '../../src/scheduler/TaskTypeRegistry.ts';

describe('TaskTypeRegistry', () => {
  it('should have default types', () => {
    const reg = new TaskTypeRegistry();
    expect(reg.get('mission')).toBeDefined();
    expect(reg.get('quest')).toBeDefined();
    expect(reg.get('task')).toBeDefined();
    expect(reg.get('urgent')).toBeDefined();
    expect(reg.get('sidequest')).toBeDefined();
  });

  it('should return task as default for unknown types', () => {
    const reg = new TaskTypeRegistry();
    const behavior = reg.get('unknown_type');
    expect(behavior.type).toBe('task');
  });

  it('should allow registering new types', () => {
    const reg = new TaskTypeRegistry();
    reg.register({
      type: 'recurring',
      label: '周期',
      icon: '↻',
      color: '#000',
      maxActive: 5,
      canHaveChildren: false,
      lifecycle: 'recurring',
    });
    expect(reg.get('recurring').type).toBe('recurring');
  });

  it('should list all types', () => {
    const reg = new TaskTypeRegistry();
    expect(reg.getAll().length).toBeGreaterThanOrEqual(5);
  });
});

import { describe, expect, it } from 'vitest';
import { TaskTreeManager } from '../../src/scheduler/TaskTreeManager.ts';

describe('TaskTreeManager', () => {
  it('should submit a mission task', () => {
    const mgr = new TaskTreeManager();
    const task = mgr.submitTask({ id: 'm1', description: 'Build web app', type: 'mission' });
    expect(task.type).toBe('mission');
    expect(task.status).toBe('queued');
    expect(mgr.getActiveMission()?.id).toBe('m1');
  });

  it('should auto-archive old mission on new mission', () => {
    const mgr = new TaskTreeManager();
    mgr.submitTask({ id: 'm1', description: 'Old mission', type: 'mission' });
    mgr.submitTask({ id: 'm2', description: 'New mission', type: 'mission' });
    const old = mgr.getTask('m1');
    expect(old?.status).toBe('archived' as any);
    expect(mgr.getActiveMission()?.id).toBe('m2');
  });

  it('should push and pop sub tasks', () => {
    const mgr = new TaskTreeManager();
    mgr.submitTask({ id: 'm1', description: 'Mission', type: 'mission' });
    mgr.updateStatus('m1', 'running');

    const sub = mgr.pushSubTask('m1', { id: 'q1', description: 'Quest', type: 'quest' });
    expect(sub.parentId).toBe('m1');
    expect(mgr.getTask('m1')?.status).toBe('paused' as any);

    const parentId = mgr.popSubTask('q1');
    expect(parentId).toBe('m1');
    expect(mgr.getTask('q1')?.status).toBe('completed');
    expect(mgr.getTask('m1')?.status).toBe('running');
  });

  it('should calculate progress from children', () => {
    const mgr = new TaskTreeManager();
    mgr.submitTask({ id: 'm1', description: 'Mission', type: 'mission', childIds: ['t1', 't2'] });
    mgr.submitTask({ id: 't1', description: 'Task 1', parentId: 'm1' });
    mgr.submitTask({ id: 't2', description: 'Task 2', parentId: 'm1' });

    mgr.updateStatus('t1', 'completed');
    mgr.updateProgress('m1');
    expect(mgr.getTask('m1')?.progress).toBe(50);
  });

  it('should return -1 progress for leaf tasks', () => {
    const mgr = new TaskTreeManager();
    mgr.submitTask({ id: 't1', description: 'Leaf task' });
    mgr.updateProgress('t1');
    expect(mgr.getTask('t1')?.progress).toBe(-1);
  });

  it('should interrupt and resume', () => {
    const mgr = new TaskTreeManager();
    mgr.submitTask({ id: 'm1', description: 'Mission', type: 'mission' });
    mgr.updateStatus('m1', 'running');

    mgr.interrupt('m1', { id: 'urg1', description: 'Urgent bug' });
    expect(mgr.getTask('m1')?.status).toBe('paused' as any);
    expect(mgr.getTask('urg1')?.type).toBe('urgent');

    const resumed = mgr.resume();
    expect(resumed).toBe('m1');
    expect(mgr.getTask('m1')?.status).toBe('running');
  });

  it('should detect deviation with low similarity', () => {
    const mgr = new TaskTreeManager();
    mgr.submitTask({ id: 'm1', description: 'build web application', type: 'mission' });

    const result = mgr.detectDeviation('design database schema', (desc) => {
      if (desc.includes('web')) return ['codegen'];
      if (desc.includes('database')) return ['plan'];
      return [];
    });
    expect(result.isDeviation).toBe(true);
    expect(result.similarity).toBeLessThan(0.3);
  });

  it('should not detect deviation with high similarity', () => {
    const mgr = new TaskTreeManager();
    mgr.submitTask({ id: 'm1', description: 'build web application', type: 'mission' });

    const result = mgr.detectDeviation('implement login page', (desc) => {
      return ['codegen'];
    });
    expect(result.isDeviation).toBe(false);
  });

  it('should get parent chain', () => {
    const mgr = new TaskTreeManager();
    mgr.submitTask({ id: 'm1', description: 'Mission', type: 'mission', childIds: ['q1'] });
    mgr.submitTask({ id: 'q1', description: 'Quest', parentId: 'm1', childIds: ['t1'] });
    mgr.submitTask({ id: 't1', description: 'Task', parentId: 'q1' });

    const chain = mgr.getParentChain('t1');
    expect(chain.map((t) => t.id)).toEqual(['m1', 'q1', 't1']);
  });

  it('should set active mission', () => {
    const mgr = new TaskTreeManager();
    mgr.submitTask({ id: 'm1', description: 'Mission 1', type: 'mission' });
    mgr.submitTask({ id: 'm2', description: 'Mission 2', type: 'mission' });

    expect(mgr.getActiveMission()?.id).toBe('m2'); // auto-set to latest

    const ok = mgr.setActiveMission('m1');
    expect(ok).toBe(true);
    expect(mgr.getActiveMission()?.id).toBe('m1');

    // Old mission (m2) should be archived
    const oldMission = mgr.getTask('m2');
    expect(oldMission?.status).toBe('archived');
  });

  it('should return false for nonexistent task', () => {
    const mgr = new TaskTreeManager();
    expect(mgr.setActiveMission('nonexistent')).toBe(false);
  });

  it('should return false for non-mission task', () => {
    const mgr = new TaskTreeManager();
    mgr.submitTask({ id: 't1', description: 'Task', type: 'task' });
    expect(mgr.setActiveMission('t1')).toBe(false);
  });
});

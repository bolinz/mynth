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

  it('should set active mission and push old to backlog', () => {
    const mgr = new TaskTreeManager();
    mgr.submitTask({ id: 'm1', description: 'Mission 1', type: 'mission' });
    mgr.submitTask({ id: 'm2', description: 'Mission 2', type: 'mission' });

    expect(mgr.getActiveMission()?.id).toBe('m2');
    mgr.getTask('m2')!.status = 'running' as any;

    const ok = mgr.setActiveMission('m1');
    expect(ok).toBe(true);
    expect(mgr.getActiveMission()?.id).toBe('m1');

    // m2 should be paused and in backlog
    expect(mgr.getTask('m2')?.status).toBe('paused');
    const backlog = mgr.getBacklog();
    expect(backlog).toHaveLength(1);
    expect(backlog[0].id).toBe('m2');
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

  it('should auto-resume backlog when active mission completes', () => {
    const mgr = new TaskTreeManager();
    mgr.submitTask({ id: 'm1', description: 'Mission 1', type: 'mission' });
    mgr.submitTask({ id: 'm2', description: 'Mission 2', type: 'mission' });
    mgr.getTask('m2')!.status = 'running' as any;

    mgr.setActiveMission('m1');
    expect(mgr.getActiveMission()?.id).toBe('m1');

    // Complete active mission → should auto-resume m2 from backlog
    mgr.updateStatus('m1', 'completed');
    expect(mgr.getActiveMission()?.id).toBe('m2');
    expect(mgr.getTask('m2')?.status).toBe('running');
    expect(mgr.getBacklog()).toHaveLength(0);
  });

  it('should stack multiple paused missions', () => {
    const mgr = new TaskTreeManager();
    mgr.submitTask({ id: 'm1', description: 'Mission 1', type: 'mission' });
    mgr.submitTask({ id: 'm2', description: 'Mission 2', type: 'mission' });
    mgr.submitTask({ id: 'm3', description: 'Mission 3', type: 'mission' });

    // Set all to running
    mgr.getTask('m1')!.status = 'running' as any;
    mgr.getTask('m2')!.status = 'running' as any;
    mgr.getTask('m3')!.status = 'running' as any;

    // m3 → m2 → m1
    mgr.setActiveMission('m2');
    mgr.setActiveMission('m1');

    expect(mgr.getBacklog()).toHaveLength(2);
    expect(mgr.getBacklog()[0].id).toBe('m3'); // m3 pushed first
    expect(mgr.getBacklog()[1].id).toBe('m2'); // m2 pushed second

    // Complete m1 → auto-resume m2
    mgr.updateStatus('m1', 'completed');
    expect(mgr.getActiveMission()?.id).toBe('m2');
    expect(mgr.getBacklog()).toHaveLength(1);
    expect(mgr.getBacklog()[0].id).toBe('m3');
  });

  it('should restore specific mission from backlog (swaps current)', () => {
    const mgr = new TaskTreeManager();
    mgr.submitTask({ id: 'm1', description: 'Mission 1', type: 'mission' });
    mgr.submitTask({ id: 'm2', description: 'Mission 2', type: 'mission' });
    mgr.getTask('m2')!.status = 'running' as any;

    mgr.setActiveMission('m1'); // m2 paused → backlog
    expect(mgr.getBacklog()).toHaveLength(1);
    expect(mgr.getBacklog()[0].id).toBe('m2');

    const restored = mgr.restoreFromBacklog('m2');
    expect(restored).toBe(true);
    expect(mgr.getActiveMission()?.id).toBe('m2');
    // m1 swapped into backlog
    expect(mgr.getBacklog()).toHaveLength(1);
    expect(mgr.getBacklog()[0].id).toBe('m1');
  });

  it('should restoreFromBacklog return false for unknown mission', () => {
    const mgr = new TaskTreeManager();
    expect(mgr.restoreFromBacklog('nonexistent')).toBe(false);
  });

  it('should not push duplicate to backlog', () => {
    const mgr = new TaskTreeManager();
    mgr.submitTask({ id: 'm1', description: 'M1', type: 'mission' });
    mgr.submitTask({ id: 'm2', description: 'M2', type: 'mission' });
    mgr.getTask('m2')!.status = 'running' as any;

    mgr.setActiveMission('m1'); // m2 → backlog=[m2]
    mgr.setActiveMission('m2'); // m2 removed from backlog, m1 → backlog=[m1]
    expect(mgr.getBacklog()).toHaveLength(1);
    expect(mgr.getBacklog()[0].id).toBe('m1');
  });

  // --- Fork / Dependency ---

  it('should fork tasks under a parent', () => {
    const mgr = new TaskTreeManager();
    mgr.submitTask({ id: 'm1', description: 'Mission', type: 'mission' });

    const fork = mgr.forkTasks('m1', [
      { id: 'a1', description: 'Approach A' },
      { id: 'a2', description: 'Approach B' },
    ]);

    expect(fork.parentId).toBe('m1');
    expect(mgr.getTask('a1')?.parentId).toBe(fork.id);
    expect(mgr.getTask('a2')?.parentId).toBe(fork.id);
    expect(mgr.getTask(fork.id)?.type).toBe('fork');
    expect(mgr.getTask(fork.id)?.childIds).toEqual(['a1', 'a2']);
  });

  it('should set dependency between tasks', () => {
    const mgr = new TaskTreeManager();
    mgr.submitTask({ id: 't1', description: 'Task 1' });
    mgr.submitTask({ id: 't2', description: 'Task 2' });

    const ok = mgr.setDependency('t2', 't1');
    expect(ok).toBe(true);
    expect(mgr.getTask('t2')?.dependsOn).toContain('t1');
  });

  it('should return false setting dependency for nonexistent task', () => {
    const mgr = new TaskTreeManager();
    mgr.submitTask({ id: 't1', description: 'Task 1' });
    expect(mgr.setDependency('nonexistent', 't1')).toBe(false);
    expect(mgr.setDependency('t1', 'nonexistent')).toBe(false);
  });

  it('should check satisfied dependencies', () => {
    const mgr = new TaskTreeManager();
    mgr.submitTask({ id: 't1', description: 'Dep' });
    mgr.submitTask({ id: 't2', description: 'Main', dependsOn: ['t1'] });

    mgr.updateStatus('t1', 'completed');
    expect(mgr.checkDependencies('t2')).toBe(true);
  });

  it('should detect unsatisfied dependencies', () => {
    const mgr = new TaskTreeManager();
    mgr.submitTask({ id: 't1', description: 'Dep' });
    mgr.submitTask({ id: 't2', description: 'Main', dependsOn: ['t1'] });

    expect(mgr.checkDependencies('t2')).toBe(false);
  });

  it('should return true if no dependencies', () => {
    const mgr = new TaskTreeManager();
    mgr.submitTask({ id: 't1', description: 'No deps' });
    expect(mgr.checkDependencies('t1')).toBe(true);
  });
});

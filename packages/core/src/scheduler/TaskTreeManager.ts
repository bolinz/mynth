import type { Task, TaskContext, TaskStatus } from '@mynth/sdk';
import { TaskTypeRegistry } from './TaskTypeRegistry.ts';

export interface TaskNode extends Task {
  children: TaskNode[];
}

export class TaskTreeManager {
  private tasks = new Map<string, Task>();
  private activeMissionId?: string;
  private typeRegistry = new TaskTypeRegistry();
  private interruptStack: Array<{ interruptedTaskId: string; missionId: string; stack: string[] }> =
    [];

  // --- Submission ---

  submitTask(input: Partial<Task> & { id: string; description: string }): Task {
    const type = input.type ?? 'task';
    const behavior = this.typeRegistry.get(type);
    const now = Date.now();

    // Auto-archive old mission if new mission created
    if (type === 'mission' && this.activeMissionId && behavior.autoArchiveOnNew) {
      const old = this.tasks.get(this.activeMissionId);
      if (old && old.status !== 'archived') {
        old.status = 'archived';
      }
    }

    const task: Task = {
      id: input.id,
      description: input.description,
      priority: input.priority ?? 1,
      status: 'queued',
      type,
      parentId: input.parentId,
      childIds: input.childIds ?? [],
      dependsOn: input.dependsOn ?? [],
      tags: input.tags ?? [],
      progress: -1,
      isInterrupt: input.isInterrupt ?? false,
      metadata: input.metadata ?? {},
      createdAt: now,
    };

    this.tasks.set(task.id, task);

    if (type === 'mission') {
      this.activeMissionId = task.id;
    }

    // Link to parent
    if (input.parentId) {
      const parent = this.tasks.get(input.parentId);
      if (parent) {
        parent.childIds = parent.childIds ?? [];
        if (!parent.childIds.includes(task.id)) {
          parent.childIds.push(task.id);
        }
      }
    }

    return task;
  }

  getTask(id: string): Task | undefined {
    return this.tasks.get(id);
  }

  updateStatus(taskId: string, status: TaskStatus): void {
    const task = this.tasks.get(taskId);
    if (task) {
      task.status = status;
      if (status === 'running') task.startedAt = Date.now();
      if (status === 'completed' || status === 'failed') task.completedAt = Date.now();
      // Auto-resume backlog mission when active mission completes
      if (status === 'completed' && task.type === 'mission' && taskId === this.activeMissionId) {
        this.tryAutoResume();
      }
    }
  }

  // --- Tree operations ---

  pushSubTask(
    parentId: string,
    subTask: Partial<Task> & { id: string; description: string },
  ): Task {
    subTask.parentId = parentId;
    const task = this.submitTask(subTask);

    // Pause parent
    const parent = this.tasks.get(parentId);
    if (parent && parent.status === 'running') {
      parent.status = 'paused';
    }

    return task;
  }

  popSubTask(taskId: string): string | null {
    const task = this.tasks.get(taskId);
    if (!task) return null;

    // Mark current as completed
    task.status = 'completed';
    task.completedAt = Date.now();

    // Resume parent
    const parentId = task.parentId;
    if (parentId) {
      const parent = this.tasks.get(parentId);
      if (parent && parent.status === 'paused') {
        parent.status = 'running';
      }
      return parentId;
    }

    return null;
  }

  // --- Fork / Dependency ---

  forkTasks(
    parentId: string,
    tasks: Array<Partial<Task> & { id: string; description: string }>,
  ): Task {
    const forkId = `fork_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const childIds = tasks.map((t) => t.id);

    const fork = this.submitTask({
      id: forkId,
      description: `Fork: ${parentId}`,
      type: 'fork',
      parentId,
      childIds,
    });

    for (const task of tasks) {
      this.submitTask({ ...task, parentId: forkId });
    }

    return fork;
  }

  setDependency(taskId: string, dependsOnId: string): boolean {
    const task = this.tasks.get(taskId);
    const dep = this.tasks.get(dependsOnId);
    if (!task || !dep) return false;

    task.dependsOn = task.dependsOn ?? [];
    if (!task.dependsOn.includes(dependsOnId)) {
      task.dependsOn.push(dependsOnId);
    }
    return true;
  }

  checkDependencies(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return true;
    const deps = task.dependsOn ?? [];
    if (deps.length === 0) return true;
    return deps.every((depId) => {
      const dep = this.tasks.get(depId);
      return dep?.status === 'completed';
    });
  }

  getParentChain(taskId: string): Task[] {
    const chain: Task[] = [];
    let current = this.tasks.get(taskId);
    while (current) {
      chain.unshift(current);
      current = current.parentId ? this.tasks.get(current.parentId) : undefined;
    }
    return chain;
  }

  getTree(): TaskNode[] {
    const roots = Array.from(this.tasks.values()).filter((t) => !t.parentId);
    return roots.map((r) => this.buildNode(r));
  }

  getActiveMission(): Task | undefined {
    return this.activeMissionId ? this.tasks.get(this.activeMissionId) : undefined;
  }

  private backLog: string[] = [];

  setActiveMission(missionId: string): boolean {
    const task = this.tasks.get(missionId);
    if (!task || task.type !== 'mission') return false;

    // Remove from backlog if already there (being activated)
    const backlogIdx = this.backLog.indexOf(missionId);
    if (backlogIdx !== -1) {
      this.backLog.splice(backlogIdx, 1);
    }

    // Pause current active mission (push to backlog)
    if (this.activeMissionId && this.activeMissionId !== missionId) {
      const current = this.tasks.get(this.activeMissionId);
      if (current && current.status !== 'completed' && current.status !== 'failed') {
        current.status = 'paused';
        if (!this.backLog.includes(this.activeMissionId)) {
          this.backLog.push(this.activeMissionId);
        }
      }
    }

    this.activeMissionId = missionId;
    task.status = 'running';
    return true;
  }

  getBacklog(): Task[] {
    return this.backLog.map((id) => this.tasks.get(id)).filter(Boolean) as Task[];
  }

  restoreFromBacklog(missionId: string): boolean {
    const task = this.tasks.get(missionId);
    if (!task || task.type !== 'mission') return false;

    const idx = this.backLog.indexOf(missionId);
    if (idx === -1) return false;

    // Remove from backlog
    this.backLog.splice(idx, 1);

    // Pause current active mission
    if (this.activeMissionId && this.activeMissionId !== missionId) {
      const current = this.tasks.get(this.activeMissionId);
      if (current && current.status !== 'completed' && current.status !== 'failed') {
        current.status = 'paused';
        if (!this.backLog.includes(this.activeMissionId)) {
          this.backLog.push(this.activeMissionId);
        }
      }
    }

    this.activeMissionId = missionId;
    task.status = 'running';
    return true;
  }

  private tryAutoResume(): void {
    if (this.backLog.length === 0) return;
    const nextId = this.backLog.pop()!;
    const next = this.tasks.get(nextId);
    if (next) {
      this.activeMissionId = nextId;
      next.status = 'running';
    }
  }

  // --- Progress ---

  updateProgress(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (!task) return;
    task.progress = this.calcProgress(task);
  }

  private calcProgress(task: Task): number {
    // Leaf task: no progress data
    if ((task.childIds ?? []).length === 0) return -1;

    const children = (task.childIds ?? [])
      .map((id) => this.tasks.get(id))
      .filter(Boolean) as Task[];
    if (children.length === 0) return -1;

    const completed = children.filter((c) => c.status === 'completed').length;
    return Math.round((completed / children.length) * 100);
  }

  recalcAllProgress(): void {
    // Bottom-up: process leaves first
    const process = (task: Task): void => {
      for (const childId of task.childIds ?? []) {
        const child = this.tasks.get(childId);
        if (child) process(child);
      }
      task.progress = this.calcProgress(task);
    };

    for (const task of this.tasks.values()) {
      if (!task.parentId) process(task);
    }
  }

  // --- Interrupt / Resume ---

  interrupt(
    currentTaskId: string,
    urgentTask: Partial<Task> & { id: string; description: string },
  ): void {
    const current = this.tasks.get(currentTaskId);
    if (!current) return;

    // Save context
    const chain = this.getParentChain(currentTaskId);
    this.interruptStack.push({
      interruptedTaskId: currentTaskId,
      missionId: this.activeMissionId ?? '',
      stack: chain.map((t) => t.id),
    });

    // Pause current chain
    current.status = 'paused';

    // Create urgent task
    urgentTask.type = 'urgent';
    urgentTask.isInterrupt = true;
    this.submitTask(urgentTask as any);
  }

  resume(): string | null {
    const snapshot = this.interruptStack.pop();
    if (!snapshot) return null;

    this.activeMissionId = snapshot.missionId;
    const task = this.tasks.get(snapshot.interruptedTaskId);
    if (task) {
      task.status = 'running';
    }
    return snapshot.interruptedTaskId;
  }

  // --- Deviation Detection ---

  detectDeviation(
    description: string,
    _inferCapabilities?: (desc: string) => string[],
  ): { isDeviation: boolean; similarity: number } {
    const mission = this.getActiveMission();
    if (!mission) return { isDeviation: false, similarity: 1 };

    // Simple keyword-based similarity (Jaccard)
    const inferFn =
      _inferCapabilities ??
      ((desc: string) => {
        const codeWords = ['implement', 'write', 'code', 'function', 'api', 'build'];
        const words = desc.toLowerCase().split(/[\s,]+/);
        return codeWords.filter((w) => words.includes(w));
      });

    const newCaps = inferFn(description);
    const missionCaps = inferFn(mission.description);

    if (newCaps.length === 0 && missionCaps.length === 0)
      return { isDeviation: false, similarity: 1 };
    if (newCaps.length === 0 || missionCaps.length === 0)
      return { isDeviation: true, similarity: 0 };

    const intersection = newCaps.filter((c) => missionCaps.includes(c)).length;
    const union = new Set([...newCaps, ...missionCaps]).size;
    const similarity = intersection / union;

    return {
      isDeviation: similarity < 0.3,
      similarity,
    };
  }

  // --- Utilities ---

  getTasksByStatus(status: TaskStatus): Task[] {
    return Array.from(this.tasks.values()).filter((t) => t.status === status);
  }

  getAllTasks(): Task[] {
    return Array.from(this.tasks.values());
  }

  size(): number {
    return this.tasks.size;
  }

  clear(): void {
    this.tasks.clear();
    this.activeMissionId = undefined;
    this.interruptStack = [];
  }

  private buildNode(task: Task): TaskNode {
    const children = (task.childIds ?? [])
      .map((id) => this.tasks.get(id))
      .filter((t): t is Task => !!t)
      .map((t) => this.buildNode(t));
    return { ...task, children };
  }
}

import type { Task, TaskContext, TaskStatus } from '@mynth/sdk';
import { TaskQueue } from './TaskQueue.ts';
import { TaskTreeManager } from './TaskTreeManager.ts';
import type { TaskNode } from './TaskTreeManager.ts';

export class Scheduler {
  private queue = new TaskQueue();
  private tasks = new Map<string, TaskContext>();
  private onTaskChange?: (taskId: string, status: TaskStatus) => void;
  tree = new TaskTreeManager();

  async submit(task: Task): Promise<string> {
    this.tree.submitTask({ ...task, id: task.id, type: task.type || 'task' });
    const ctx = this.queue.enqueue(task);
    this.tasks.set(ctx.taskId, ctx);
    return ctx.taskId;
  }

  async cancel(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (task) {
      task.status = 'cancelled';
      this.queue.remove(taskId);
      this.notify(taskId, 'cancelled');
    }
  }

  getTask(taskId: string): TaskContext | undefined {
    return this.tasks.get(taskId);
  }

  getAllTasks(): TaskContext[] {
    return Array.from(this.tasks.values());
  }

  dequeue(): TaskContext | null {
    const ctx = this.queue.dequeue();
    if (ctx) {
      ctx.status = 'running';
      this.notify(ctx.taskId, 'running');
    }
    return ctx;
  }

  updateStatus(taskId: string, status: TaskStatus): void {
    const task = this.tasks.get(taskId);
    if (task) {
      task.status = status;
      this.notify(taskId, status);
    }
  }

  subscribe(handler: (taskId: string, status: TaskStatus) => void): void {
    this.onTaskChange = handler;
  }

  private notify(taskId: string, status: TaskStatus): void {
    this.onTaskChange?.(taskId, status);
  }

  getTree(): TaskNode[] {
    return this.tree.getTree();
  }

  getContextStack(taskId: string): Task[] {
    return this.tree.getParentChain(taskId);
  }

  getTaskProgress(taskId: string): number {
    return this.tree.getTask(taskId)?.progress ?? -1;
  }
}

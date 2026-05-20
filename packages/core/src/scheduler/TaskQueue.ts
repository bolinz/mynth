import type { Task, TaskContext, TaskStatus } from '@mynth/sdk';

interface QueueItem {
  context: TaskContext;
  priority: number;
}

export class TaskQueue {
  private items: QueueItem[] = [];

  enqueue(task: Task): TaskContext {
    const context: TaskContext = {
      taskId: task.id,
      description: task.description,
      priority: task.priority,
      status: 'queued',
      neededCapabilities: [],
      hopHistory: [],
      currentAgent: '',
      createdAt: Date.now(),
    };
    this.items.push({ context, priority: task.priority });
    this.items.sort((a, b) => a.priority - b.priority);
    return context;
  }

  dequeue(): TaskContext | null {
    return this.items.shift()?.context ?? null;
  }

  size(): number {
    return this.items.length;
  }

  remove(taskId: string): void {
    this.items = this.items.filter((i) => i.context.taskId !== taskId);
  }
}

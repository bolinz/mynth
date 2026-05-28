export interface TaskTypeBehavior {
  type: string;
  label: string;
  icon: string;
  color: string;
  maxActive: number;
  canHaveChildren: boolean;
  autoArchiveOnNew?: boolean;
  lifecycle: 'normal' | 'recurring' | 'persistent';
}

export class TaskTypeRegistry {
  private behaviors = new Map<string, TaskTypeBehavior>();

  constructor() {
    this.register({
      type: 'mission',
      label: '主线任务',
      icon: '\u25c8',
      color: '#7c3aed',
      maxActive: 1,
      canHaveChildren: true,
      autoArchiveOnNew: true,
      lifecycle: 'normal',
    });
    this.register({
      type: 'quest',
      label: '次级任务',
      icon: '\u25c6',
      color: '#3b82f6',
      maxActive: Number.POSITIVE_INFINITY,
      canHaveChildren: true,
      lifecycle: 'normal',
    });
    this.register({
      type: 'task',
      label: '任务',
      icon: '\u2022',
      color: '#e2e8f0',
      maxActive: Number.POSITIVE_INFINITY,
      canHaveChildren: false,
      lifecycle: 'normal',
    });
    this.register({
      type: 'urgent',
      label: '紧急任务',
      icon: '\u26a1',
      color: '#ef4444',
      maxActive: Number.POSITIVE_INFINITY,
      canHaveChildren: true,
      lifecycle: 'normal',
    });
    this.register({
      type: 'sidequest',
      label: '偏离任务',
      icon: '\u26a0',
      color: '#eab308',
      maxActive: Number.POSITIVE_INFINITY,
      canHaveChildren: false,
      lifecycle: 'normal',
    });
  }

  register(behavior: TaskTypeBehavior): void {
    this.behaviors.set(behavior.type, behavior);
  }

  get(type: string): TaskTypeBehavior {
    return this.behaviors.get(type) ?? this.behaviors.get('task')!;
  }

  getAll(): TaskTypeBehavior[] {
    return Array.from(this.behaviors.values());
  }
}

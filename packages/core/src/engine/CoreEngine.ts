import { AgentPool } from '../agent/AgentPool.ts';
import { GlobalMemory } from '../memory/GlobalMemory.ts';
import { MemoryQueue } from '../message-bus/MemoryQueue.ts';
import { Guard } from '../meta/Guard.ts';
import { Intervener } from '../meta/Intervener.ts';
import { Observer } from '../meta/Observer.ts';
import { Orchestrator } from '../meta/Orchestrator.ts';
import { LevelDBAdapter } from '../persistence/LevelDBAdapter.ts';
import type { Persistence } from '../persistence/Persistence.ts';
import { Scheduler } from '../scheduler/Scheduler.ts';

export interface EngineConfig {
  dbPath: string;
}

export interface TaskResult {
  taskId: string;
  status: string;
  hops: number;
}

export class CoreEngine {
  private running = false;
  private db!: Persistence;
  private queue!: MemoryQueue;
  private pool!: AgentPool;
  private scheduler!: Scheduler;
  private memory!: GlobalMemory;
  private orchestrator!: Orchestrator;
  observer!: Observer;
  guard!: Guard;
  intervener!: Intervener;

  constructor(private config: EngineConfig) {}

  async start(): Promise<void> {
    this.db = new LevelDBAdapter(this.config.dbPath);
    await this.db.open();

    this.queue = new MemoryQueue();
    this.pool = new AgentPool();
    this.memory = new GlobalMemory(this.db);
    this.scheduler = new Scheduler();
    this.orchestrator = new Orchestrator(['reasoner', 'coder', 'reviewer']);
    this.observer = new Observer();
    this.guard = new Guard();
    this.intervener = new Intervener();

    this.registerDefaultAgents();
    this.running = true;
  }

  async stop(): Promise<void> {
    this.running = false;
    await this.db.close();
  }

  isRunning(): boolean {
    return this.running;
  }

  async executeTask(description: string): Promise<TaskResult> {
    const taskId = `task_${Date.now()}`;
    await this.scheduler.submit({ id: taskId, description, priority: 1 });

    const analysis = await this.orchestrator.analyze({
      id: taskId,
      description,
      priority: 1,
    });
    const taskContext = await this.orchestrator.initializeChain(
      { id: taskId, description, priority: 1 },
      analysis.firstAgent,
    );

    const chain = ['reasoning', 'codegen', 'review'] as const;
    for (const cap of chain) {
      const agent = this.pool.acquire(cap);
      if (!agent) continue;
      agent.assignTask(taskContext);
      agent.startWork();
      await new Promise((r) => setTimeout(r, 50));
      agent.complete();
      this.pool.release(agent);
    }

    this.scheduler.updateStatus(taskId, 'completed');
    return { taskId, status: 'completed', hops: chain.length };
  }

  getScheduler(): Scheduler {
    return this.scheduler;
  }

  getAgentPool(): AgentPool {
    return this.pool;
  }

  private registerDefaultAgents(): void {
    this.pool.createAgent('reasoner', 'Reasoner', [
      { type: 'reasoning', level: 8, confidence: 0.9 },
      { type: 'coordination', level: 5, confidence: 0.7 },
    ]);
    this.pool.createAgent('coder', 'Coder', [{ type: 'codegen', level: 8, confidence: 0.85 }]);
    this.pool.createAgent('reviewer', 'Reviewer', [{ type: 'review', level: 7, confidence: 0.8 }]);
  }
}

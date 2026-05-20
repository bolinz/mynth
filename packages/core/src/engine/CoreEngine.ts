import { AgentPool } from '../agent/AgentPool.ts';
import { ChainTransferManager } from '../chain/ChainTransferManager.ts';
import { GlobalMemory } from '../memory/GlobalMemory.ts';
import { EventBus } from '../message-bus/EventBus.ts';
import { MemoryQueue } from '../message-bus/MemoryQueue.ts';
import { Guard } from '../meta/Guard.ts';
import { Intervener } from '../meta/Intervener.ts';
import { Observer } from '../meta/Observer.ts';
import { Orchestrator } from '../meta/Orchestrator.ts';
import { LevelDBAdapter } from '../persistence/LevelDBAdapter.ts';
import type { Persistence } from '../persistence/Persistence.ts';
import { StateStore } from '../persistence/StateStore.ts';
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
  private pool!: AgentPool;
  private scheduler!: Scheduler;
  private memory!: GlobalMemory;
  private orchestrator!: Orchestrator;
  observer!: Observer;
  guard!: Guard;
  intervener!: Intervener;
  eventBus!: EventBus;
  stateStore!: StateStore;

  constructor(private config: EngineConfig) {}

  async start(): Promise<void> {
    this.db = new LevelDBAdapter(this.config.dbPath);
    await this.db.open();

    this.stateStore = new StateStore(this.db);
    this.eventBus = new EventBus();
    this.pool = new AgentPool();
    this.pool.setEventBus(this.eventBus);
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
    this.eventBus.publish('task.submitted', { taskId, description });
    await this.stateStore.saveTask({
      taskId,
      description,
      status: 'running',
      hops: 0,
      createdAt: Date.now(),
    });

    const analysis = await this.orchestrator.analyze({ id: taskId, description, priority: 1 });
    const taskContext = await this.orchestrator.initializeChain(
      {
        id: taskId,
        description,
        priority: 1,
        constraints: { requiredCapabilities: [], forbiddenAgents: [], maxHops: 10 },
      },
      analysis.firstAgent,
    );
    taskContext.neededCapabilities = analysis.capabilities.map((name) => ({
      type: name as any,
      level: 5,
      confidence: 0.5,
    }));

    const chain = new ChainTransferManager(
      this.pool,
      this.observer,
      this.intervener,
      10,
      this.eventBus,
    );
    const result = await chain.startChain(taskContext, analysis.firstAgent);

    // Persist hops
    for (const hop of result.hopHistory) {
      await this.stateStore.saveHop(taskId, hop);
    }

    this.scheduler.updateStatus(taskId, result.status === 'complete' ? 'completed' : 'failed');
    await this.stateStore.saveTask({
      taskId,
      description,
      status: result.status,
      hops: result.hopCount,
      createdAt: Date.now(),
    });
    this.eventBus.publish('task.completed', {
      taskId,
      status: result.status,
      hops: result.hopCount,
    });
    return { taskId, status: result.status, hops: result.hopCount };
  }

  getScheduler(): Scheduler {
    return this.scheduler;
  }

  getAgentPool(): AgentPool {
    return this.pool;
  }

  private registerDefaultAgents(): void {
    const configs = [
      {
        id: 'reasoner',
        name: 'Reasoner',
        capabilities: [
          { type: 'reasoning' as const, level: 8, confidence: 0.9 },
          { type: 'coordination' as const, level: 5, confidence: 0.7 },
        ],
      },
      {
        id: 'coder',
        name: 'Coder',
        capabilities: [{ type: 'codegen' as const, level: 8, confidence: 0.85 }],
      },
      {
        id: 'reviewer',
        name: 'Reviewer',
        capabilities: [{ type: 'review' as const, level: 7, confidence: 0.8 }],
      },
    ];
    for (const cfg of configs) {
      this.pool.createAgent(cfg.id, cfg.name, cfg.capabilities);
      this.stateStore.saveAgentConfig(cfg);
    }
  }
}

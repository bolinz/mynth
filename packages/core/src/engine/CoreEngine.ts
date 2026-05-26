import { AgentPool } from '../agent/AgentPool.ts';
import { ChainTransferManager } from '../chain/ChainTransferManager.ts';
import { AnthropicProvider } from '../llm/AnthropicProvider.ts';
import { BudgetTracker } from '../llm/BudgetTracker.ts';
import { CapabilityRouter } from '../llm/CapabilityRouter.ts';
import { LLMPool } from '../llm/LLMPool.ts';
import { OpenAIProvider } from '../llm/OpenAIProvider.ts';
import { RetryProvider } from '../llm/RetryProvider.ts';
import { GlobalMemory } from '../memory/GlobalMemory.ts';
import type { EventBus } from '../message-bus/EventBus.ts';
import { MessageBus } from '../message-bus/MessageBus.ts';
import { DegradationMonitor } from '../meta/DegradationMonitor.ts';
import { Guard } from '../meta/Guard.ts';
import { Intervener } from '../meta/Intervener.ts';
import { Observer } from '../meta/Observer.ts';
import { Orchestrator } from '../meta/Orchestrator.ts';
import { LevelDBAdapter } from '../persistence/LevelDBAdapter.ts';
import type { Persistence } from '../persistence/Persistence.ts';
import { StateStore } from '../persistence/StateStore.ts';
import { PromptRegistry } from '../prompt/PromptRegistry.ts';
import { Scheduler } from '../scheduler/Scheduler.ts';
import { EngineConfigSchema, type ValidatedEngineConfig } from '../config/schema.ts';
import { GracefulShutdown } from './GracefulShutdown.ts';

export interface EngineConfig {
  dbPath: string;
  maxHops?: number;
  agents?: Array<{
    id: string;
    name: string;
    capabilities: Array<{ type: string; level: number; confidence: number }>;
  }>;
}

export interface TaskResult {
  taskId: string;
  status: string;
  hops: number;
}

export class CoreEngine {
  private running = false;
  private parsedConfig!: ValidatedEngineConfig;
  private db!: Persistence;
  private pool!: AgentPool;
  private scheduler!: Scheduler;
  private memory!: GlobalMemory;
  private orchestrator!: Orchestrator;
  observer!: Observer;
  guard!: Guard;
  intervener!: Intervener;
  bus!: MessageBus;
  stateStore!: StateStore;
  llmPool!: LLMPool;
  budgetTracker!: BudgetTracker;
  capabilityRouter!: CapabilityRouter;
  promptRegistry!: PromptRegistry;
  shutdown!: GracefulShutdown;
  degradation!: DegradationMonitor;

  get eventBus(): EventBus {
    return this.bus as unknown as EventBus;
  }

  constructor(private config: EngineConfig) {}

  async start(): Promise<void> {
    this.parsedConfig = EngineConfigSchema.parse({
      dbPath: this.config.dbPath,
      maxHops: this.config.maxHops ?? 10,
      agents: this.config.agents ?? [
        {
          id: 'reasoner',
          name: 'Reasoner',
          transferPolicy: 'capability_match' as const,
          capabilities: [{ type: 'reasoning' as const, level: 8, confidence: 0.9 }],
        },
        {
          id: 'coder',
          name: 'Coder',
          transferPolicy: 'capability_match' as const,
          capabilities: [{ type: 'codegen' as const, level: 8, confidence: 0.85 }],
        },
        {
          id: 'reviewer',
          name: 'Reviewer',
          transferPolicy: 'capability_match' as const,
          capabilities: [{ type: 'review' as const, level: 7, confidence: 0.8 }],
        },
      ],
    });

    this.db = new LevelDBAdapter(this.config.dbPath);
    await this.db.open();

    this.stateStore = new StateStore(this.db);
    this.bus = new MessageBus();
    this.pool = new AgentPool();
    this.pool.setBus(this.bus);
    this.memory = new GlobalMemory(this.db);
    this.scheduler = new Scheduler();
    this.orchestrator = new Orchestrator(this.parsedConfig.agents.map((a) => a.id));
    this.observer = new Observer();
    this.guard = new Guard();
    this.intervener = new Intervener();

    // LLM infrastructure
    this.llmPool = new LLMPool();
    this.budgetTracker = new BudgetTracker();
    this.promptRegistry = new PromptRegistry();

    if (process.env.ANTHROPIC_API_KEY) {
      const anthropic = new AnthropicProvider(
        process.env.ANTHROPIC_API_KEY,
        'claude-sonnet-4-20250514',
      );
      const retry = new RetryProvider(anthropic, 3);
      this.llmPool.register('claude-sonnet', retry);
      this.llmPool.register('claude-haiku', retry);
    }
    if (process.env.OPENAI_API_KEY) {
      const openai = new OpenAIProvider(process.env.OPENAI_API_KEY, 'gpt-4o');
      const retry = new RetryProvider(openai, 3);
      this.llmPool.register('gpt-4o', retry);
    }

    this.capabilityRouter = new CapabilityRouter(this.llmPool);
    this.shutdown = new GracefulShutdown(this.scheduler, this.memory, this.db, {
      drainTimeout: 10000,
    });
    this.degradation = new DegradationMonitor();

    this.registerDefaultAgents();
    this.running = true;
  }

  async stop(): Promise<void> {
    this.running = false;
    await this.shutdown.shutdown();
  }

  isRunning(): boolean {
    return this.running;
  }

  async executeTask(description: string): Promise<TaskResult> {
    const taskId = `task_${Date.now()}`;
    await this.scheduler.submit({ id: taskId, description, priority: 1 });
    this.bus.publish('task.submitted', { taskId, description });
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
      this.parsedConfig.maxHops,
      this.bus as any,
      this.llmPool,
      this.promptRegistry,
      this.budgetTracker,
      this.capabilityRouter,
    );
    const result = await chain.startChain(taskContext, analysis.firstAgent);

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
    this.bus.publish('task.completed', { taskId, status: result.status, hops: result.hopCount });
    return { taskId, status: result.status, hops: result.hopCount };
  }

  getScheduler(): Scheduler {
    return this.scheduler;
  }

  getAgentPool(): AgentPool {
    return this.pool;
  }

  private registerDefaultAgents(): void {
    for (const cfg of this.parsedConfig.agents) {
      this.pool.createAgent(cfg.id, cfg.name, cfg.capabilities);
      this.stateStore.saveAgentConfig({
        id: cfg.id,
        name: cfg.name,
        capabilities: cfg.capabilities,
      });
    }
  }
}

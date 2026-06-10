import type { TenantContext } from '@mynth/sdk';
import { AgentPool } from '../agent/AgentPool.ts';
import { ChainTransferManager } from '../chain/ChainTransferManager.ts';
import { EngineConfigSchema, type ValidatedEngineConfig } from '../config/schema.ts';
import { HealthChecker } from '../health/HealthChecker.ts';
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
import { HITLManager } from '../meta/HITLManager.ts';
import { InteractionManager } from '../meta/InteractionManager.ts';
import { Intervener } from '../meta/Intervener.ts';
import { Observer } from '../meta/Observer.ts';
import { Orchestrator } from '../meta/Orchestrator.ts';
import { Tracer } from '../meta/Tracer.ts';
import { RendererRegistry } from '../meta/ViewRenderer.ts';
import { MetricsRegistry } from '../metrics/MetricsRegistry.ts';
import { LevelDBAdapter } from '../persistence/LevelDBAdapter.ts';
import type { Persistence } from '../persistence/Persistence.ts';
import { StateStore } from '../persistence/StateStore.ts';
import { PromptRegistry } from '../prompt/PromptRegistry.ts';
import {
  cardsRenderer,
  chartRenderer,
  diffRenderer,
  flowchartRenderer,
  markdownRenderer,
  rawHtmlRenderer,
  tableRenderer,
} from '../renderers/index.ts';
import { Scheduler } from '../scheduler/Scheduler.ts';
import { ToolRegistry } from '../tool/ToolRegistry.ts';
import { ApiCallTool } from '../tools/ApiCallTool.ts';
import { CodeExecuteTool } from '../tools/CodeExecuteTool.ts';
import { FileReadTool } from '../tools/FileReadTool.ts';
import { FileWriteTool } from '../tools/FileWriteTool.ts';
import { WebSearchTool } from '../tools/WebSearchTool.ts';
import { GracefulShutdown } from './GracefulShutdown.ts';

export interface EngineConfig {
  dbPath: string;
  tenant?: TenantContext;
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
  hitlManager!: HITLManager;
  tracer!: Tracer;
  toolRegistry!: ToolRegistry;
  metricsRegistry!: MetricsRegistry;
  healthChecker!: HealthChecker;
  rendererRegistry!: RendererRegistry;
  interactionManager!: InteractionManager;
  private evictTimer?: ReturnType<typeof setInterval>;

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

    this.stateStore = new StateStore(this.db, this.config.tenant);
    this.bus = new MessageBus();
    this.pool = new AgentPool();
    this.pool.setBus(this.eventBus);
    this.memory = new GlobalMemory(this.db);
    this.scheduler = new Scheduler();
    this.orchestrator = new Orchestrator(
      this.parsedConfig.agents.map((a) => a.id),
      this.parsedConfig.agents.map((a) => ({
        agentId: a.id,
        capabilities: a.capabilities.map((c) => c.type),
      })),
    );
    this.observer = new Observer();
    this.guard = new Guard();
    this.intervener = new Intervener();
    this.hitlManager = new HITLManager(this.db, this.eventBus);
    await this.hitlManager.loadAll();

    this.metricsRegistry = new MetricsRegistry();

    this.toolRegistry = new ToolRegistry(this.hitlManager);
    this.toolRegistry.register(new WebSearchTool());
    this.toolRegistry.register(new FileReadTool());
    this.toolRegistry.register(new FileWriteTool());
    this.toolRegistry.register(new ApiCallTool());
    this.toolRegistry.register(new CodeExecuteTool());

    // LLM infrastructure
    this.llmPool = new LLMPool();
    this.budgetTracker = new BudgetTracker();
    this.rendererRegistry = new RendererRegistry();
    this.rendererRegistry.register(markdownRenderer);
    this.rendererRegistry.register(tableRenderer);
    this.rendererRegistry.register(diffRenderer);
    this.rendererRegistry.register(flowchartRenderer);
    this.rendererRegistry.register(chartRenderer);
    this.rendererRegistry.register(cardsRenderer);
    this.rendererRegistry.register(rawHtmlRenderer);
    this.promptRegistry = new PromptRegistry(this.rendererRegistry);
    this.interactionManager = new InteractionManager();

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
    this.tracer = new Tracer();
    this.shutdown = new GracefulShutdown(this.scheduler, this.memory, this.db, {
      drainTimeout: 10000,
    });
    this.degradation = new DegradationMonitor(this.eventBus);
    this.healthChecker = new HealthChecker(this.degradation, this.pool, this.db);

    this.evictTimer = setInterval(() => {
      const evicted = this.pool.evictIdle();
      if (evicted > 0) {
        this.bus?.publish('intervention.executed', {
          type: 'warn',
          reason: `Evicted ${evicted} idle agents from warm pool`,
        });
      }
    }, 30000);

    await this.registerDefaultAgents();
    this.running = true;
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.evictTimer) clearInterval(this.evictTimer);
    await this.shutdown.shutdown();
  }

  isRunning(): boolean {
    return this.running;
  }

  async executeTask(description: string): Promise<TaskResult> {
    if (this.shutdown.isDraining()) {
      throw new Error('Engine is shutting down');
    }
    const taskId = `task_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    try {
      await this.scheduler.submit({ id: taskId, description, priority: 1, status: 'queued' });
      this.bus.publish('task.submitted', { taskId, description });
      await this.stateStore.saveTask({
        taskId,
        description,
        status: 'running',
        hops: 0,
        createdAt: Date.now(),
      });

      const analysis = await this.orchestrator.analyze({
        id: taskId,
        description,
        priority: 1,
        status: 'queued',
      });

      const predicted = this.orchestrator.predictNext(analysis.capabilities);
      for (const cap of predicted) {
        const existing = this.pool.acquire(cap as any);
        if (!existing) {
          this.pool.createAgent(`warm-${cap}-${Date.now()}`, `Warm ${cap}`, [
            { type: cap as any, level: 5, confidence: 0.5 },
          ]);
        } else {
          this.pool.release(existing);
        }
      }

      const taskContext = await this.orchestrator.initializeChain(
        {
          id: taskId,
          description,
          priority: 1,
          constraints: { requiredCapabilities: [], forbiddenAgents: [], maxHops: 10 },
        },
        analysis.firstAgent,
        analysis.capabilities,
      );

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
        this.tracer,
        this.toolRegistry,
      );
      const result = await chain.startChain(taskContext, analysis.firstAgent);

      // Update task progress via tree
      this.scheduler.tree.updateStatus(
        taskId,
        result.status === 'complete' ? 'completed' : 'failed',
      );
      this.scheduler.tree.updateProgress(taskId);
      this.bus?.publish('task.progress_changed', {
        taskId,
        progress: this.scheduler.tree.getTask(taskId)?.progress ?? -1,
      });

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
    } catch (err) {
      this.scheduler.updateStatus(taskId, 'failed');
      await this.stateStore.saveTask({
        taskId,
        description,
        status: 'failed',
        hops: 0,
        createdAt: Date.now(),
      });
      throw err;
    }
  }

  getScheduler(): Scheduler {
    return this.scheduler;
  }

  getAgentPool(): AgentPool {
    return this.pool;
  }

  private async registerDefaultAgents(): Promise<void> {
    for (const cfg of this.parsedConfig.agents) {
      this.pool.createAgent(cfg.id, cfg.name, cfg.capabilities);
      await this.stateStore.saveAgentConfig({
        id: cfg.id,
        name: cfg.name,
        capabilities: cfg.capabilities,
      });
    }
  }
}

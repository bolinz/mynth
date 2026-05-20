import type { CoreEngine, EventPayload, EventTopic } from '@mynth/core';

function agentName(engine: CoreEngine, id: string): string {
  const agent = engine.getAgentPool().getAgent(id);
  return agent?.name ?? id;
}

function ts(): string {
  return new Date().toLocaleTimeString();
}

export async function runCommand(
  engine: CoreEngine,
  task: string,
  _options: { timeout?: string },
): Promise<void> {
  console.log(`\nTask: "${task}"`);

  const unsubs: Array<() => void> = [];

  unsubs.push(
    engine.eventBus.subscribe(
      'agent.state_changed',
      (_topic: EventTopic, payload: EventPayload) => {
        const e = payload as any;
        if (e.toState === 'working') {
          console.log(`  [${ts()}] ${agentName(engine, e.agentId)} working...`);
        }
      },
    ),
  );

  unsubs.push(
    engine.eventBus.subscribe('hop.recorded', (_topic: EventTopic, payload: EventPayload) => {
      const e = payload as any;
      if (e.to) {
        console.log(
          `  [${ts()}] ${agentName(engine, e.from)} \u2192 ${agentName(engine, e.to)} (${e.duration}ms)`,
        );
      }
    }),
  );

  unsubs.push(
    engine.eventBus.subscribe('anomaly.detected', (_topic: EventTopic, payload: EventPayload) => {
      const e = payload as any;
      console.log(
        `  [${ts()}] \u26a0 Anomaly: ${e.type}${e.agentId ? ` (agent: ${agentName(engine, e.agentId)})` : ''}`,
      );
    }),
  );

  unsubs.push(
    engine.eventBus.subscribe(
      'intervention.executed',
      (_topic: EventTopic, payload: EventPayload) => {
        const e = payload as any;
        console.log(
          `  [${ts()}] \u2139 Intervention: ${e.type}${e.reason ? ` - ${e.reason}` : ''}`,
        );
      },
    ),
  );

  const result = await engine.executeTask(task);

  for (const u of unsubs) u();

  const icon = result.status === 'complete' ? '\u2713' : '\u2717';
  console.log(`\n${icon} Task ${result.taskId}: ${result.status} (${result.hops} hops)`);
}

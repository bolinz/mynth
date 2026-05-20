import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CoreEngine, InProcessClient } from '../src/index.ts';

describe('InProcessClient', () => {
  let engine: CoreEngine;
  let client: InProcessClient;
  let dir: string;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'mynth-sdk-'));
    engine = new CoreEngine({ dbPath: dir });
    await engine.start();
    client = new InProcessClient(engine);
  });

  afterAll(async () => {
    await engine.stop();
    rmSync(dir, { recursive: true, force: true });
  });

  it('should run a task', async () => {
    const result = await client.run('test task');
    expect(result.taskId).toBeDefined();
    expect(result.status).toBe('complete');
    expect(result.hops).toBeGreaterThan(0);
  });

  it('should return agent status', async () => {
    const agents = await client.status();
    expect(agents.length).toBeGreaterThanOrEqual(1);
    expect(agents[0].name).toBeDefined();
  });

  it('should return tasks', async () => {
    await client.run('another task');
    const tasks = await client.tasks();
    expect(tasks.length).toBeGreaterThanOrEqual(1);
    expect(tasks[0].taskId).toBeDefined();
  });

  it('should support event subscription', async () => {
    const events: string[] = [];
    const unsub = client.subscribe('task.completed', (_t: unknown, p: any) => {
      events.push(p.taskId);
    });
    await client.run('task for events');
    expect(events.length).toBeGreaterThanOrEqual(1);
    unsub();
  });
});

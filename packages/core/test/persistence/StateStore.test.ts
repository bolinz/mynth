import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LevelDBAdapter } from '../../src/persistence/LevelDBAdapter.ts';
import { StateStore } from '../../src/persistence/StateStore.ts';

async function createStore(): Promise<{ dir: string; db: LevelDBAdapter; store: StateStore }> {
  const dir = mkdtempSync(join(tmpdir(), 'mynth-state-'));
  const db = new LevelDBAdapter(dir);
  await db.open();
  const store = new StateStore(db);
  return { dir, db, store };
}

async function closeStore(s: { dir: string; db: LevelDBAdapter }): Promise<void> {
  await s.db.close();
  rmSync(s.dir, { recursive: true, force: true });
}

describe('StateStore empty', () => {
  it('should return empty arrays when no data', async () => {
    const s = await createStore();
    expect(await s.store.loadAllTasks()).toEqual([]);
    expect(await s.store.loadTaskHops('none')).toEqual([]);
    expect(await s.store.loadAgentConfigs()).toEqual([]);
    await closeStore(s);
  });
});

describe('StateStore with data', () => {
  let s: { dir: string; db: LevelDBAdapter; store: StateStore };

  beforeAll(async () => {
    s = await createStore();
  });
  afterAll(async () => {
    await closeStore(s);
  });

  it('should save and load tasks', async () => {
    await s.store.saveTask({
      taskId: 't1',
      description: 'test',
      status: 'complete',
      hops: 2,
      createdAt: 1000,
    });
    const tasks = await s.store.loadAllTasks();
    expect(tasks).toHaveLength(1);
    expect(tasks[0].taskId).toBe('t1');
    expect(tasks[0].hops).toBe(2);
  });

  it('should save and load hops', async () => {
    const hop = {
      fromAgent: 'a',
      toAgent: 'b',
      timestamp: 100,
      handoverNote: 'transfer',
      duration: 50,
    };
    await s.store.saveHop('task-1', hop);
    const hops = await s.store.loadTaskHops('task-1');
    expect(hops).toHaveLength(1);
    expect(hops[0].handoverNote).toBe('transfer');
  });

  it('should save and load agent configs', async () => {
    await s.store.saveAgentConfig({
      id: 'r1',
      name: 'Reasoner',
      capabilities: [{ type: 'reasoning', level: 8, confidence: 0.9 }],
    });
    const configs = await s.store.loadAgentConfigs();
    expect(configs).toHaveLength(1);
    expect(configs[0].name).toBe('Reasoner');
  });

  it('should append multiple hops', async () => {
    await s.store.saveHop('multi', {
      fromAgent: 'a',
      toAgent: 'b',
      timestamp: 1,
      handoverNote: 'first',
      duration: 10,
    });
    await s.store.saveHop('multi', {
      fromAgent: 'b',
      toAgent: 'c',
      timestamp: 2,
      handoverNote: 'second',
      duration: 20,
    });
    const hops = await s.store.loadTaskHops('multi');
    expect(hops).toHaveLength(2);
  });
});

import { describe, expect, it } from 'vitest';
import { HttpClient } from '../src/client/HttpClient.ts';

describe('HttpClient', () => {
  it('should construct with base URL', () => {
    const client = new HttpClient('http://localhost:3000');
    expect(client).toBeDefined();
  });

  it('should call run and return result', async () => {
    let capturedUrl = '';
    globalThis.fetch = ((url: string, _init?: any) => {
      capturedUrl = url;
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ taskId: 't1', status: 'complete', hops: 2 }),
      });
    }) as any;

    const client = new HttpClient('http://localhost:3000');
    const result = await client.run('test task');
    expect(result.taskId).toBe('t1');
    expect(capturedUrl).toContain('/run');
  });

  it('should call status and return agents', async () => {
    globalThis.fetch = (() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve([{ id: 'agent-1', name: 'Agent 1', state: 'idle' }]),
      })) as any;

    const client = new HttpClient('http://localhost:3000');
    const agents = await client.status();
    expect(agents).toHaveLength(1);
    expect(agents[0].id).toBe('agent-1');
  });

  it('should call tasks and return task list', async () => {
    globalThis.fetch = (() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve([{ taskId: 't1', description: 'test', status: 'running' }]),
      })) as any;

    const client = new HttpClient('http://localhost:3000');
    const tasks = await client.tasks();
    expect(tasks).toHaveLength(1);
    expect(tasks[0].taskId).toBe('t1');
  });

  it('should throw on error response', async () => {
    globalThis.fetch = (() =>
      Promise.resolve({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Server Error'),
      })) as any;

    const client = new HttpClient('http://localhost:3000');
    await expect(client.run('test')).rejects.toThrow();
  });
});

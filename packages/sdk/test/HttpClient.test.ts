import { describe, expect, it, vi } from 'vitest';
import { HttpClient } from '../src/client/HttpClient.ts';

describe('HttpClient', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubGlobal('fetch');
  });

  it('should construct with base URL', () => {
    const client = new HttpClient('http://localhost:3000');
    expect(client).toBeDefined();
  });

  it('should call run and return result', async () => {
    const fetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ taskId: 't1', status: 'complete', hops: 2 }),
    });

    const client = new HttpClient('http://localhost:3000');
    const result = await client.run('test task');
    expect(result.taskId).toBe('t1');
    expect(result.status).toBe('complete');
  });

  it('should call status and return agents', async () => {
    const fetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetch.mockResolvedValue({
      ok: true,
      json: async () => [{ id: 'agent-1', name: 'Agent 1', state: 'idle' }],
    });

    const client = new HttpClient('http://localhost:3000');
    const agents = await client.status();
    expect(agents).toHaveLength(1);
    expect(agents[0].id).toBe('agent-1');
  });

  it('should call tasks and return task list', async () => {
    const fetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetch.mockResolvedValue({
      ok: true,
      json: async () => [{ taskId: 't1', description: 'test', status: 'running' }],
    });

    const client = new HttpClient('http://localhost:3000');
    const tasks = await client.tasks();
    expect(tasks).toHaveLength(1);
    expect(tasks[0].taskId).toBe('t1');
  });

  it('should throw on error response', async () => {
    const fetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetch.mockResolvedValue({ ok: false, status: 500, text: async () => 'Server Error' });

    const client = new HttpClient('http://localhost:3000');
    await expect(client.run('test')).rejects.toThrow();
  });
});

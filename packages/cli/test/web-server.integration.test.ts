import { mkdtempSync, rmSync } from 'fs';
import http from 'node:http';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CoreEngine } from '../../core/src/engine/CoreEngine.ts';
import { startWebServer } from '../src/web/server.ts';

function fetchUrl(url: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body: data }));
      res.on('error', reject);
    });
  });
}

function postUrl(url: string, json: unknown): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(json);
    const req = http.request(
      url,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
        res.on('error', reject);
      },
    );
    req.write(data);
    req.end();
  });
}

describe('Web server routes', () => {
  let dir: string;
  let engine: CoreEngine;
  let server: http.Server;
  let base: string;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'mynth-web-'));
    engine = new CoreEngine({ dbPath: dir, maxHops: 5 });
    await engine.start();
    server = startWebServer(engine, 0);
    await new Promise<void>((resolve) => server.on('listening', resolve));
    const addr = server.address()!;
    const port = typeof addr === 'string' ? addr : addr.port;
    base = `http://localhost:${port}`;
  });

  afterAll(async () => {
    server.close();
    await engine.stop();
    rmSync(dir, { recursive: true, force: true });
  });

  it('GET / should return HTML', async () => {
    const res = await fetchUrl(`${base}/`);
    expect(res.status).toBe(200);
    expect(res.body).toContain('<!DOCTYPE html>');
  });

  it('GET /status should return agent list', async () => {
    const res = await fetchUrl(`${base}/status`);
    expect(res.status).toBe(200);
    const agents = JSON.parse(res.body);
    expect(Array.isArray(agents)).toBe(true);
    expect(agents.length).toBeGreaterThan(0);
    expect(agents[0]).toHaveProperty('id');
    expect(agents[0]).toHaveProperty('state');
  });

  it('GET /tasks should return task list', async () => {
    await engine.executeTask('web test');
    const res = await fetchUrl(`${base}/tasks`);
    expect(res.status).toBe(200);
    const tasks = JSON.parse(res.body);
    expect(Array.isArray(tasks)).toBe(true);
    expect(tasks.some((t: any) => t.description === 'web test')).toBe(true);
  });

  it('GET /checkpoints with taskId should return hop records', async () => {
    const result = await engine.executeTask('checkpoint task');
    const res = await fetchUrl(`${base}/checkpoints?taskId=${result.taskId}`);
    expect(res.status).toBe(200);
    const hops = JSON.parse(res.body);
    expect(Array.isArray(hops)).toBe(true);
  });

  it('GET /checkpoints without taskId should return 400', async () => {
    const res = await fetchUrl(`${base}/checkpoints`);
    expect(res.status).toBe(400);
    expect(res.body).toContain('Missing taskId');
  });

  it('GET /pending-approvals should return pending requests', async () => {
    await engine.hitlManager.submit({
      agentId: 'a',
      taskId: 't1',
      operation: { type: 'deploy', target: 'prod', summary: 'deploy to prod' },
      triggeredBy: 'guard_rule',
    });
    const res = await fetchUrl(`${base}/pending-approvals`);
    expect(res.status).toBe(200);
    const pending = JSON.parse(res.body);
    expect(Array.isArray(pending)).toBe(true);
    expect(pending.some((r: any) => r.operation.summary === 'deploy to prod')).toBe(true);
  });

  it('POST /approve should approve a HITL request', async () => {
    const req = await engine.hitlManager.submit({
      agentId: 'b',
      taskId: 't2',
      operation: { type: 'config', target: 'settings', summary: 'change config' },
      triggeredBy: 'agent_self_assess',
    });
    const res = await postUrl(`${base}/approve`, { id: req.id, action: 'approve' });
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ success: true });
  });

  it('POST /approve should return 404 for unknown request', async () => {
    const res = await postUrl(`${base}/approve`, { id: 'nonexistent', action: 'approve' });
    expect(res.status).toBe(404);
  });

  it('POST /approve should return 400 for invalid action', async () => {
    const req = await engine.hitlManager.submit({
      agentId: 'c',
      taskId: 't3',
      operation: { type: 'deploy', target: 'x', summary: 'deploy x' },
      triggeredBy: 'guard_rule',
    });
    const res = await postUrl(`${base}/approve`, { id: req.id, action: 'invalid' });
    expect(res.status).toBe(400);
  });

  it('GET /api/tree should return task tree', async () => {
    await engine.executeTask('tree task');
    const res = await fetchUrl(`${base}/api/tree`);
    expect(res.status).toBe(200);
    const tree = JSON.parse(res.body);
    expect(Array.isArray(tree)).toBe(true);
  });

  it('POST /run should execute a task', async () => {
    const res = await postUrl(`${base}/run`, { task: 'run via api' });
    expect(res.status).toBe(200);
    const result = JSON.parse(res.body);
    expect(result).toHaveProperty('taskId');
    expect(result).toHaveProperty('hops');
  });

  it('GET /tree should return inline HTML board', async () => {
    const res = await fetchUrl(`${base}/tree`);
    expect(res.status).toBe(200);
    expect(res.body).toContain('Task Tree');
    expect(res.body).toContain('renderNode');
    expect(res.body).toContain('/api/tree');
  });

  it('GET /events should stream SSE connected event', async () => {
    const res = await new Promise<http.IncomingMessage>((resolve, reject) => {
      const req = http.get(`${base}/events`, (res) => resolve(res));
      req.on('error', reject);
    });
    // SSE sends immediate 'connected' event
    await new Promise<void>((resolve) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk.toString();
        if (data.includes('event: connected')) {
          res.destroy();
          resolve();
        }
      });
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
  });

  it('POST /api/views should render a view', async () => {
    const res = await postUrl(`${base}/api/views`, {
      type: 'markdown',
      data: { text: 'Hello **world**' },
    });
    expect(res.status).toBe(200);
    expect(res.body).toContain('Hello');
  });

  it('POST /api/views should return 404 for unknown type', async () => {
    const res = await postUrl(`${base}/api/views`, {
      type: 'nonexistent',
      data: {},
    });
    expect(res.status).toBe(404);
  });

  it('POST /api/interaction should respond to an interaction', async () => {
    engine.interactionManager.submit({
      id: 'interact-1',
      agentId: 'a',
      taskId: 't1',
      prompt: 'confirm?',
      options: ['yes', 'no'],
    });
    const res = await postUrl(`${base}/api/interaction`, {
      interactionId: 'interact-1',
      value: 'yes',
    });
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ success: true });
  });

  it('POST /api/tree/move should move a task to new parent', async () => {
    // Create a tree structure first
    const tree = engine.getScheduler().tree;
    tree.submitTask({ id: 'parent-1', description: 'parent', type: 'quest', priority: 1 });
    tree.submitTask({
      id: 'child-1',
      description: 'child',
      type: 'task',
      priority: 1,
      parentId: 'parent-1',
    });
    tree.submitTask({ id: 'new-parent', description: 'new parent', type: 'quest', priority: 2 });

    const res = await postUrl(`${base}/api/tree/move`, {
      taskId: 'child-1',
      newParentId: 'new-parent',
    });
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ success: true });

    // Verify move
    const movedTask = tree.getTask('child-1');
    expect(movedTask?.parentId).toBe('new-parent');
  });

  it('POST /api/tree/move should return 404 for unknown task', async () => {
    const res = await postUrl(`${base}/api/tree/move`, {
      taskId: 'nonexistent',
      newParentId: 'parent-1',
    });
    expect(res.status).toBe(404);
  });

  it('POST /api/tree/activate should switch active mission', async () => {
    const tree = engine.getScheduler().tree;
    tree.submitTask({ id: 'mission-a', description: 'Mission A', type: 'mission' });
    tree.submitTask({ id: 'mission-b', description: 'Mission B', type: 'mission' });

    const res = await postUrl(`${base}/api/tree/activate`, { missionId: 'mission-a' });
    expect(res.status).toBe(200);
    expect(tree.getActiveMission()?.id).toBe('mission-a');
  });

  it('GET /api/tree/backlog should return paused missions', async () => {
    const tree = engine.getScheduler().tree;
    tree.submitTask({ id: 'm-pri', description: 'Primary', type: 'mission' });
    tree.submitTask({ id: 'm-sec', description: 'Secondary', type: 'mission' });
    tree.getTask('m-sec')!.status = 'running' as any;
    tree.setActiveMission('m-pri');

    const res = await fetchUrl(`${base}/api/tree/backlog`);
    expect(res.status).toBe(200);
    const backlog = JSON.parse(res.body);
    expect(Array.isArray(backlog)).toBe(true);
    expect(backlog.some((m: any) => m.id === 'm-sec')).toBe(true);
  });

  it('POST /api/tree/restore should restore from backlog', async () => {
    const tree = engine.getScheduler().tree;
    tree.submitTask({ id: 'm-r1', description: 'R1', type: 'mission' });
    tree.submitTask({ id: 'm-r2', description: 'R2', type: 'mission' });
    tree.getTask('m-r2')!.status = 'running' as any;
    tree.setActiveMission('m-r1'); // m-r2 → backlog

    const res = await postUrl(`${base}/api/tree/restore`, { missionId: 'm-r2' });
    expect(res.status).toBe(200);
    expect(tree.getActiveMission()?.id).toBe('m-r2');
  });

  it('POST /api/tree/restore should return 404 for unknown', async () => {
    const res = await postUrl(`${base}/api/tree/restore`, { missionId: 'unknown' });
    expect(res.status).toBe(404);
  });

  it('POST /api/tree/activate should return 404 for unknown mission', async () => {
    const res = await postUrl(`${base}/api/tree/activate`, { missionId: 'nonexistent' });
    expect(res.status).toBe(404);
  });

  it('GET /nonexistent should return 404', async () => {
    const res = await fetchUrl(`${base}/nonexistent`);
    expect(res.status).toBe(404);
  });
});

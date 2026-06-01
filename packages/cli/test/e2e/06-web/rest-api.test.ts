import { mkdtempSync, rmSync } from 'fs';
import http from 'node:http';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { CoreEngine } from '../../../../core/src/engine/CoreEngine.ts';
import { startWebServer } from '../../../src/web/server.ts';

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

function postJson(url: string, body: unknown): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(
      url,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
      },
      (res) => {
        let responseData = '';
        res.on('data', (chunk) => {
          responseData += chunk;
        });
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body: responseData }));
      },
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

describe('e2e: Web REST API', () => {
  it('should serve status endpoint', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mynth-e2e-web-'));
    const engine = new CoreEngine({ dbPath: dir });
    await engine.start();

    const server = startWebServer(engine, 0);
    const port = (server.address() as any).port;

    const res = await fetchUrl(`http://localhost:${port}/status`);
    expect(res.status).toBe(200);
    const agents = JSON.parse(res.body);
    expect(Array.isArray(agents)).toBe(true);

    server.close();
    await engine.stop();
    rmSync(dir, { recursive: true, force: true });
  });

  it('should run task via POST /run', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mynth-e2e-web-'));
    const engine = new CoreEngine({ dbPath: dir });
    await engine.start();

    const server = startWebServer(engine, 0);
    const port = (server.address() as any).port;

    const res = await postJson(`http://localhost:${port}/run`, { task: 'e2e test task' });
    expect(res.status).toBe(200);
    const data = JSON.parse(res.body);
    expect(data.taskId).toBeDefined();
    expect(data.status).toBeDefined();

    server.close();
    await engine.stop();
    rmSync(dir, { recursive: true, force: true });
  });

  it('should return pending approvals', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mynth-e2e-web-'));
    const engine = new CoreEngine({ dbPath: dir });
    await engine.start();

    await engine.hitlManager.submit({
      agentId: 'a',
      taskId: 't1',
      operation: { type: 'config.modify', target: 'x', summary: 'test' },
      triggeredBy: 'guard_rule',
    });

    const server = startWebServer(engine, 0);
    const port = (server.address() as any).port;

    const res = await fetchUrl(`http://localhost:${port}/pending-approvals`);
    expect(res.status).toBe(200);
    const data = JSON.parse(res.body);
    expect(data.length).toBeGreaterThanOrEqual(1);

    server.close();
    await engine.stop();
    rmSync(dir, { recursive: true, force: true });
  });

  it('should approve via POST /approve', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mynth-e2e-web-'));
    const engine = new CoreEngine({ dbPath: dir });
    await engine.start();

    const req = await engine.hitlManager.submit({
      agentId: 'a',
      taskId: 't1',
      operation: { type: 'config.modify', target: 'x', summary: 'test' },
      triggeredBy: 'guard_rule',
    });

    const server = startWebServer(engine, 0);
    const port = (server.address() as any).port;

    const res = await postJson(`http://localhost:${port}/approve`, {
      id: req.id,
      action: 'approve',
    });
    expect(res.status).toBe(200);
    expect(engine.hitlManager.getById(req.id)?.status).toBe('approved');

    server.close();
    await engine.stop();
    rmSync(dir, { recursive: true, force: true });
  });

  it('should return 404 for unknown endpoint', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mynth-e2e-web-'));
    const engine = new CoreEngine({ dbPath: dir });
    await engine.start();

    const server = startWebServer(engine, 0);
    const port = (server.address() as any).port;

    const res = await fetchUrl(`http://localhost:${port}/nonexistent`);
    expect(res.status).toBe(404);

    server.close();
    await engine.stop();
    rmSync(dir, { recursive: true, force: true });
  });
});

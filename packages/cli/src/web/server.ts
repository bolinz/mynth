import { readFileSync } from 'node:fs';
import http from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CoreEngine } from '@mynth/core';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function startWebServer(engine: CoreEngine, port = 3000): void {
  const clients = new Set<http.ServerResponse>();

  // Subscribe to all EventBus events and broadcast to SSE clients
  const topics = [
    'agent.state_changed',
    'hop.recorded',
    'anomaly.detected',
    'intervention.executed',
    'task.submitted',
    'task.completed',
    'hitl.requested',
    'hitl.resolved',
  ] as const;

  const unsubs = topics.map((topic) =>
    engine.eventBus.subscribe(topic, (_t: string, payload: unknown) => {
      const data = JSON.stringify({ topic: _t, payload });
      for (const res of clients) {
        res.write(`event: ${_t}\ndata: ${data}\n\n`);
      }
    }),
  );

  const html = readFileSync(join(__dirname, 'index.html'), 'utf-8');

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`);

    if (url.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }

    if (url.pathname === '/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      });
      res.write('event: connected\ndata: {}\n\n');
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }

    if (url.pathname === '/status') {
      const agents = engine
        .getAgentPool()
        .getAllAgents()
        .map((a: any) => ({
          id: a.id,
          name: a.name,
          state: a.state,
          capabilities: a.capabilities.map((c: any) => c.type),
          taskCount: a.metadata.taskCount,
        }));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(agents));
      return;
    }

    if (url.pathname === '/tasks') {
      const tasks = engine
        .getScheduler()
        .getAllTasks()
        .map((t) => ({
          taskId: t.taskId,
          description: t.description,
          status: t.status,
        }));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(tasks));
      return;
    }

    if (url.pathname === '/checkpoints') {
      const taskId = url.searchParams.get('taskId');
      if (!taskId) {
        res.writeHead(400);
        res.end('Missing taskId');
        return;
      }
      const hops = await engine.stateStore.loadTaskHops(taskId);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(hops));
      return;
    }

    if (url.pathname === '/pending-approvals') {
      const pending = engine.hitlManager.getPending().map((r: any) => ({
        id: r.id,
        agentId: r.agentId,
        operation: r.operation,
        createdAt: r.createdAt,
      }));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(pending));
      return;
    }

    if (url.pathname === '/approve' && req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', async () => {
        try {
          const { id, action, note } = JSON.parse(body);
          const reqData = engine.hitlManager.getById(id);
          if (!reqData) {
            res.writeHead(404);
            res.end(JSON.stringify({ error: 'Request not found' }));
            return;
          }
          if (action === 'approve') {
            await engine.hitlManager.approve(id, 'web', note);
          } else if (action === 'reject') {
            await engine.hitlManager.reject(id, 'web', note);
          } else {
            res.writeHead(400);
            res.end(JSON.stringify({ error: 'Invalid action' }));
            return;
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true }));
        } catch (err) {
          res.writeHead(500);
          res.end(JSON.stringify({ error: String(err) }));
        }
      });
      return;
    }

    if (url.pathname === '/run' && req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', async () => {
        try {
          const { task } = JSON.parse(body);
          const result = await engine.executeTask(task);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: String(err) }));
        }
      });
      return;
    }

    res.writeHead(404);
    res.end('Not found');
  });

  server.listen(port, () => {
    console.log(`Web UI: http://localhost:${port}`);
  });

  process.on('SIGINT', () => {
    server.close();
    for (const u of unsubs) u();
    process.exit(0);
  });
}

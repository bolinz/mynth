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
    'task.progress_changed',
    'system.degradation_changed',
    'agent.response',
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
      req.on('data', (chunk) => {
        body += chunk;
      });
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

    if (url.pathname === '/api/views' && req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', async () => {
        try {
          const { type, data } = JSON.parse(body);
          const renderer = engine.rendererRegistry.get(type);
          if (!renderer) {
            res.writeHead(404);
            res.end(JSON.stringify({ error: `Unknown view type: ${type}` }));
            return;
          }
          const html = renderer.renderWeb({ type, data });
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(html);
        } catch (err) {
          res.writeHead(500);
          res.end(JSON.stringify({ error: String(err) }));
        }
      });
      return;
    }

    if (url.pathname === '/api/interaction' && req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        try {
          const { interactionId, value } = JSON.parse(body);
          const result = engine.interactionManager.respond(interactionId, value);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: !!result }));
        } catch (err) {
          res.writeHead(500);
          res.end(JSON.stringify({ error: String(err) }));
        }
      });
      return;
    }

    if (url.pathname === '/api/tree') {
      const tree = engine.scheduler.getTree();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(tree));
      return;
    }

    if (url.pathname === '/api/tree/move' && req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        try {
          const { taskId, newParentId } = JSON.parse(body);
          const task = engine.scheduler.tree.getTask(taskId);
          if (!task) {
            res.writeHead(404);
            res.end(JSON.stringify({ error: 'Task not found' }));
            return;
          }
          if (task.parentId) {
            const oldParent = engine.scheduler.tree.getTask(task.parentId);
            if (oldParent) {
              oldParent.childIds = oldParent.childIds!.filter((id) => id !== taskId);
            }
          }
          task.parentId = newParentId;
          if (newParentId) {
            const newParent = engine.scheduler.tree.getTask(newParentId);
            if (newParent && !newParent.childIds!.includes(taskId)) {
              newParent.childIds!.push(taskId);
            }
          }
          engine.scheduler.tree.recalcAllProgress();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true }));
        } catch (err) {
          res.writeHead(500);
          res.end(JSON.stringify({ error: String(err) }));
        }
      });
      return;
    }

    if (url.pathname === '/tree') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Task Tree - Mynth</title>
<style>
  body { font-family: system-ui; background: #0f172a; color: #e2e8f0; padding: 20px; }
  .node { margin: 4px 0; padding: 8px 12px; border-radius: 6px; cursor: pointer; }
  .node:hover { background: #1e293b; }
  .node-root { border-left: 3px solid #7c3aed; }
  .node-quest { border-left: 3px solid #3b82f6; margin-left: 24px; }
  .node-task { border-left: 3px solid #475569; margin-left: 48px; }
  .node-urgent { border-left: 3px solid #ef4444; }
  .node-sidequest { border-left: 3px solid #eab308; }
  .status { font-size: 12px; color: #94a3b8; }
  .progress { display: inline-block; width: 80px; height: 6px; background: #334155; border-radius: 3px; margin-left: 8px; }
  .progress-fill { height: 100%; border-radius: 3px; background: #22c55e; }
  .badge { display: inline-block; padding: 1px 6px; border-radius: 4px; font-size: 11px; margin-left: 6px; }
  .badge-main { background: #7c3aed; color: #ddd6fe; }
  .badge-urgent { background: #ef4444; color: #fecaca; }
  .badge-sidequest { background: #eab308; color: #1c1917; }
  .children { margin-left: 12px; }
  .path { padding: 12px; background: #1e293b; border-radius: 6px; margin-top: 16px; font-size: 13px; color: #94a3b8; }
  .path span { color: #e2e8f0; margin: 0 4px; }
  h1 { color: #a78bfa; }
</style></head><body>
<h1>\u25c8 Task Tree</h1>
<div id="tree"></div>
<div class="path" id="path"></div>
<script>
let treeData = [];
const typeIcons = { mission:'\u25c8', quest:'\u25c6', task:'\u2022', urgent:'\u26a1', sidequest:'\u26a0' };
const typeColors = { mission:'#7c3aed', quest:'#3b82f6', task:'#e2e8f0', urgent:'#ef4444', sidequest:'#eab308' };
const statusLabels = { queued:'\u25cb Queued', running:'\u25cf Running', completed:'\u2713 Completed', failed:'\u2717 Failed', paused:'\u23f8 Paused', pending_review:'? Review' };

function renderNode(node, depth) {
  const icon = typeIcons[node.type] || '\u2022';
  const color = typeColors[node.type] || '#e2e8f0';
  const cls = node.type === 'mission' ? 'node-root' : node.type === 'urgent' ? 'node-urgent' : node.type === 'sidequest' ? 'node-sidequest' : node.parentId ? 'node-task' : 'node-quest';
  const st = statusLabels[node.status] || node.status;
  let html = '<div class="node ' + cls + '" onclick="showPath(\'' + node.id + '\')">';
  html += '<span style="color:' + color + '">' + icon + '</span> ';
  html += '<strong>' + escapeHtml(node.description) + '</strong>';
  if (node.progress >= 0) html += '<span class="progress"><span class="progress-fill" style="width:' + node.progress + '%"></span></span>';
  html += ' <span class="status">' + st + '</span>';
  if (node.type === 'mission' && node.status === 'running') html += '<span class="badge badge-main">MAIN</span>';
  if (node.type === 'urgent') html += '<span class="badge badge-urgent">URGENT</span>';
  if (node.type === 'sidequest') html += '<span class="badge badge-sidequest">SIDE</span>';
  html += '</div>';
  if (node.children && node.children.length > 0) {
    html += '<div class="children">';
    for (const child of node.children) html += renderNode(child, depth + 1);
    html += '</div>';
  }
  return html;
}

function showPath(taskId) {
  const findNode = (nodes, id) => {
    for (const n of nodes) {
      if (n.id === id) return n;
      if (n.children) { const r = findNode(n.children, id); if (r) return r; }
    }
    return null;
  };
  const buildPath = (nodes, id) => {
    const parts = [];
    const find = (ns, target) => {
      for (const n of ns) {
        if (n.id === target) { parts.unshift(n.description); return true; }
        if (n.children && find(n.children, target)) { parts.unshift(n.description); return true; }
      }
      return false;
    };
    find(nodes, id);
    return parts;
  };
  const parts = buildPath(treeData, taskId);
  document.getElementById('path').innerHTML = '\u25c8 Path: ' + parts.map(p => '<span>' + escapeHtml(p) + '</span>').join(' > ');
}

function escapeHtml(s) { return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

async function loadTree() {
  const r = await fetch('/api/tree');
  treeData = await r.json();
  let html = '';
  for (const node of treeData) {
    html += renderNode(node, 0);
    html += '<hr style="border-color:#1e293b;margin:12px 0">';
  }
  document.getElementById('tree').innerHTML = html || '<p style="color:#64748b">No tasks.</p>';
}

loadTree();
const evtSource = new EventSource('/events');
evtSource.addEventListener('task.progress_changed', () => loadTree());
evtSource.addEventListener('task.completed', () => loadTree());
evtSource.addEventListener('task.submitted', () => loadTree());
</script>
</body></html>`;
      res.end(html);
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

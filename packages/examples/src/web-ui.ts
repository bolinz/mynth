import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { startWebServer } from '@mynth/cli';
import { CoreEngine } from '@mynth/core';

async function main() {
  const dir = mkdtempSync(join(tmpdir(), 'mynth-example-web-'));
  const engine = new CoreEngine({
    dbPath: dir,
    maxHops: 5,
    agents: [
      {
        id: 'reasoner',
        name: 'Reasoner',
        capabilities: [{ type: 'reasoning', level: 8, confidence: 0.9 }],
      },
      {
        id: 'coder',
        name: 'Coder',
        capabilities: [{ type: 'codegen', level: 8, confidence: 0.85 }],
      },
      {
        id: 'reviewer',
        name: 'Reviewer',
        capabilities: [{ type: 'review', level: 7, confidence: 0.8 }],
      },
    ],
  });
  await engine.start();

  // Submit tasks to populate the tree
  const tree = engine.getScheduler().tree;
  tree.submitTask({
    id: 'mission-1',
    description: 'Build a web app',
    type: 'mission',
    priority: 1,
  });
  tree.submitTask({
    id: 'quest-1',
    description: 'Design backend',
    type: 'quest',
    priority: 1,
    parentId: 'mission-1',
  });
  tree.submitTask({
    id: 'quest-2',
    description: 'Build frontend',
    type: 'quest',
    priority: 2,
    parentId: 'mission-1',
  });
  tree.submitTask({
    id: 'task-1',
    description: 'Write API',
    type: 'task',
    priority: 1,
    parentId: 'quest-1',
  });

  // Start web server
  const server = startWebServer(engine, 4000);
  const addr = server.address()!;
  const port = typeof addr === 'string' ? addr : addr.port;

  console.log(`Web UI: http://localhost:${port}`);
  console.log(`Task tree: http://localhost:${port}/tree`);
  console.log(
    `Run task: curl -X POST http://localhost:${port}/run -H 'Content-Type: application/json' -d '{"task":"hello world"}'`,
  );
  console.log('\nPress Ctrl+C to stop');

  // Execute a sample task
  const result = await engine.executeTask('Build a login form');
  console.log(`\nTask completed: ${result.taskId} (${result.hops} hops)`);

  // Keep running
  await new Promise(() => {});
}

main().catch(console.error);

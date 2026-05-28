import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { CoreEngine } from '@mynth/core';

async function main() {
  const dir = mkdtempSync(join(tmpdir(), 'mynth-example-tree-'));
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
    ],
  });
  await engine.start();

  const tree = engine.getScheduler().tree;

  // Submit a mission with sub-tasks
  const mission = tree.submitTask({
    id: 'm1',
    description: 'Build a web app',
    type: 'mission',
    priority: 1,
  });
  const quest1 = tree.submitTask({
    id: 'q1',
    description: 'Design backend API',
    type: 'quest',
    priority: 1,
    parentId: 'm1',
  });
  const quest2 = tree.submitTask({
    id: 'q2',
    description: 'Build frontend',
    type: 'quest',
    priority: 2,
    parentId: 'm1',
  });
  tree.submitTask({
    id: 't1',
    description: 'Write API routes',
    type: 'task',
    priority: 1,
    parentId: 'q1',
  });
  tree.submitTask({
    id: 't2',
    description: 'Add database layer',
    type: 'task',
    priority: 2,
    parentId: 'q1',
  });

  console.log('Task Tree:');
  console.log(JSON.stringify(tree.getTree(), null, 2));

  // Interrupt with urgent task
  tree.interrupt('q1', { id: 'urg1', description: 'Fix production bug', priority: 0 });
  console.log('\nAfter interrupt (urgent task added):');
  console.log(JSON.stringify(tree.getTree(), null, 2));

  // Execute and update progress
  tree.updateStatus('t1', 'completed');
  tree.updateProgress('t1');
  console.log(`\nProgress after completing t1: ${tree.getTaskProgress('m1')}%`);

  tree.updateStatus('t2', 'completed');
  tree.updateProgress('t2');
  console.log(`Progress after completing t2: ${tree.getTaskProgress('q1')}%`);

  // Deviation detection
  const isDeviating = tree.detectDeviation('Fix urgent bug in auth', 'reasoning');
  console.log(`\nDeviation from main mission: ${isDeviating ? 'YES (sidequest)' : 'NO'}`);

  // Resume interrupted task
  const resumed = tree.resume();
  console.log(`\nResumed task: ${resumed ?? 'none'}`);

  console.log('\nContext stack for q1:');
  console.log(tree.getParentChain('t1').map((t) => t.description));

  await engine.stop();
  console.log('\nDone');
}

main().catch(console.error);

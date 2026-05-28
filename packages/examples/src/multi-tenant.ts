import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { LevelDBAdapter, StateStore } from '@mynth/core';

async function main() {
  const dir = mkdtempSync(join(tmpdir(), 'mynth-example-tenant-'));
  const db = new LevelDBAdapter(dir);
  await db.open();

  // Two tenants with isolated state
  const acme = new StateStore(db, { tenantId: 'acme-corp' });
  const beta = new StateStore(db, { tenantId: 'beta-inc' });

  // Acme's data
  await acme.saveTask({
    taskId: 't1',
    description: 'Acme task #1',
    status: 'running',
    hops: 2,
    createdAt: Date.now(),
  });
  await acme.saveAgentConfig({
    id: 'agent-a',
    name: 'Acme Reasoner',
    capabilities: [{ type: 'reasoning', level: 8, confidence: 0.9 }],
  });

  // Beta's data (same task ID, different content)
  await beta.saveTask({
    taskId: 't1',
    description: 'Beta task #1',
    status: 'complete',
    hops: 4,
    createdAt: Date.now(),
  });
  await beta.saveAgentConfig({
    id: 'agent-b',
    name: 'Beta Coder',
    capabilities: [{ type: 'codegen', level: 7, confidence: 0.8 }],
  });

  // Verify isolation
  const acmeTasks = await acme.loadAllTasks();
  const betaTasks = await beta.loadAllTasks();

  console.log('Acme tasks:', JSON.stringify(acmeTasks, null, 2));
  console.log('Beta tasks:', JSON.stringify(betaTasks, null, 2));
  console.log(
    `\nIsolated: ${acmeTasks[0].description !== betaTasks[0].description ? 'YES' : 'NO'}`,
  );

  await db.close();
  console.log('\nDone');
}

main().catch(console.error);

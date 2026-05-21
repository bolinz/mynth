#!/usr/bin/env node
import { homedir } from 'os';
import { join } from 'path';
import { CoreEngine } from '@mynth/core';
import { cac } from 'cac';
import { version } from '../package.json' with { type: 'json' };
import { historyCommand } from './commands/history.ts';
import { initCommand } from './commands/init.ts';
import { listCommand } from './commands/list.ts';
import { logsCommand } from './commands/logs.ts';
import { runCommand } from './commands/run.ts';
import { statusCommand } from './commands/status.ts';
import { stopCommand } from './commands/stop.ts';
import { startTui } from './tui/index.ts';
import { startWebServer } from './web/server.ts';

const engine = new CoreEngine({
  dbPath: join(homedir(), '.mynth', 'data'),
});

const cli = cac('mynth');

cli
  .command('run <task>', 'Run a task through the agent chain')
  .option('--timeout <ms>', 'Task timeout in milliseconds')
  .action(async (task: string, options: { timeout?: string }) => {
    await engine.start();
    await runCommand(engine, task, options);
    await engine.stop();
  });

cli.command('status', 'Show system status').action(async () => {
  await engine.start();
  await statusCommand(engine);
  await engine.stop();
});

cli.command('list', 'List tasks').action(async () => {
  await engine.start();
  await listCommand(engine);
  await engine.stop();
});

cli.command('tui', 'Launch TUI interface').action(async () => {
  await engine.start();
  await startTui(engine);
  await engine.stop();
});

cli.command('ui', 'Launch Web UI (http://localhost:3000)').action(async () => {
  await engine.start();
  startWebServer(engine, 3000);
  console.log('Web UI running at http://localhost:3000');
  console.log('Press Ctrl+C to stop');
});

cli.command('history', 'Show task history and persisted state').action(async () => {
  await engine.start();
  await historyCommand(engine);
  await engine.stop();
});

cli.command('init [project]', 'Initialize a new mynth project').action(async () => {
  await initCommand();
});

cli.command('logs <taskId>', 'View task execution log').action(async (taskId: string) => {
  await engine.start();
  await logsCommand(engine, taskId);
  await engine.stop();
});

cli.command('stop <taskId>', 'Cancel a running task').action(async (taskId: string) => {
  await engine.start();
  await stopCommand(engine, taskId);
  await engine.stop();
});

cli.help();
cli.version(version);
cli.parse();

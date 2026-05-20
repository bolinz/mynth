#!/usr/bin/env node
import { homedir } from 'os';
import { join } from 'path';
import { CoreEngine } from '@mynth/core';
import { cac } from 'cac';
import { version } from '../package.json' with { type: 'json' };
import { historyCommand } from './commands/history.ts';
import { listCommand } from './commands/list.ts';
import { runCommand } from './commands/run.ts';
import { statusCommand } from './commands/status.ts';
import { startTui } from './tui/index.ts';

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

cli.command('history', 'Show task history and persisted state').action(async () => {
  await engine.start();
  await historyCommand(engine);
  await engine.stop();
});

cli.help();
cli.version(version);
cli.parse();

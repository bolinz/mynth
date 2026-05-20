#!/usr/bin/env node
import { cac } from 'cac';
import { runCommand } from './commands/run.ts';
import { statusCommand } from './commands/status.ts';
import { listCommand } from './commands/list.ts';
import { version, name } from '../package.json' with { type: 'json' };

const cli = cac('mynth');

cli.command('run <task>', 'Run a task through the agent chain')
  .option('--timeout <ms>', 'Task timeout in milliseconds')
  .action(async (task: string, options: { timeout?: string }) => {
    await runCommand(task, options);
  });

cli.command('status', 'Show system status')
  .action(async () => {
    await statusCommand();
  });

cli.command('list', 'List tasks')
  .action(async () => {
    await listCommand();
  });

cli.help();
cli.version(version);
cli.parse();

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export async function initCommand(): Promise<void> {
  const projectName = process.argv[3] || 'my-mynth-project';
  const projectDir = join(process.cwd(), projectName);

  if (existsSync(projectDir)) {
    console.log(`Directory "${projectName}" already exists.`);
    return;
  }

  mkdirSync(projectDir, { recursive: true });
  mkdirSync(join(projectDir, 'src'));
  mkdirSync(join(projectDir, 'data'));

  const config = {
    dbPath: join(projectDir, 'data'),
    maxHops: 10,
    agents: [
      {
        id: 'reasoner',
        name: 'Reasoner',
        transferPolicy: 'capability_match',
        capabilities: [{ type: 'reasoning', level: 8, confidence: 0.9 }],
      },
      {
        id: 'coder',
        name: 'Coder',
        transferPolicy: 'capability_match',
        capabilities: [{ type: 'codegen', level: 8, confidence: 0.85 }],
      },
      {
        id: 'reviewer',
        name: 'Reviewer',
        transferPolicy: 'capability_match',
        capabilities: [{ type: 'review', level: 7, confidence: 0.8 }],
      },
    ],
  };

  writeFileSync(join(projectDir, 'mynth.config.json'), JSON.stringify(config, null, 2));

  const indexContent = [
    "import { CoreEngine } from '@mynth/core';",
    '',
    "const engine = new CoreEngine({ dbPath: './data' });",
    'await engine.start();',
    "const result = await engine.executeTask('Hello, world!');",
    'console.log(result);',
    'await engine.stop();',
  ].join('\n');

  writeFileSync(join(projectDir, 'src/index.ts'), indexContent);

  console.log(`\n  Created project: ${projectName}/`);
  console.log(`    mynth.config.json     — agent and engine configuration`);
  console.log(`    src/index.ts          — entry point`);
  console.log(`    data/                 — LevelDB data directory`);
  console.log(`\n  Set API key to enable LLM:`);
  console.log(`    export ANTHROPIC_API_KEY=sk-...\n`);
}

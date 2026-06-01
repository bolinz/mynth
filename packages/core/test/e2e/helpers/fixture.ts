import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { CoreEngine, type EngineConfig } from '../../../src/engine/CoreEngine.ts';

export interface E2EFixture {
  dir: string;
  engine: CoreEngine;
}

export async function createEngine(overrides?: Partial<EngineConfig>): Promise<E2EFixture> {
  const dir = mkdtempSync(join(tmpdir(), 'mynth-e2e-'));
  const engine = new CoreEngine({ dbPath: dir, ...overrides });
  await engine.start();
  return { dir, engine };
}

export async function destroyEngine(fixture: E2EFixture): Promise<void> {
  try {
    await fixture.engine.stop();
  } finally {
    rmSync(fixture.dir, { recursive: true, force: true });
  }
}

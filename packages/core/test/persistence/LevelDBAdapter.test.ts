import { mkdtempSync } from 'fs';
import { rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LevelDBAdapter } from '../../src/persistence/LevelDBAdapter.ts';

describe('LevelDBAdapter', () => {
  let dir: string;
  let db: LevelDBAdapter;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'mynth-db-'));
    db = new LevelDBAdapter(dir);
    await db.open();
  });

  afterAll(async () => {
    await db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('should put and get values', async () => {
    await db.put('key', { hello: 'world' });
    const val = await db.get('key');
    expect(val).toEqual({ hello: 'world' });
  });

  it('should return null for missing keys', async () => {
    expect(await db.get('nope')).toBeNull();
  });

  it('should delete values', async () => {
    await db.put('x', 1);
    await db.delete('x');
    expect(await db.get('x')).toBeNull();
  });

  it('should range scan', async () => {
    await db.put('a:1', 'a1');
    await db.put('a:2', 'a2');
    await db.put('b:1', 'b1');
    const results = await db.range('a:', 'a:\xff');
    expect(results).toHaveLength(2);
  });
});

import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { LevelDBAdapter } from '../../src/persistence/LevelDBAdapter.ts';

describe('LevelDBAdapter encoding', () => {
  it('should roundtrip string values', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mynth-enc-'));
    try {
      const db = new LevelDBAdapter(dir);
      await db.open();
      await db.put('str', 'hello');
      const val = await db.get('str');
      expect(val).toBe('hello');
      await db.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('should roundtrip number values', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mynth-enc2-'));
    try {
      const db = new LevelDBAdapter(dir);
      await db.open();
      await db.put('num', 42);
      const val = await db.get('num');
      expect(val).toBe(42);
      await db.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('should roundtrip object values', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mynth-enc3-'));
    try {
      const db = new LevelDBAdapter(dir);
      await db.open();
      const obj = { a: 1, b: [2, 3] };
      await db.put('obj', obj);
      const val = await db.get('obj');
      expect(val).toEqual(obj);
      await db.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

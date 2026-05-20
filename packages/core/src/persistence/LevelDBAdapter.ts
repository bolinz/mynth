import { Level } from 'level';
import type { Operation, Persistence } from './Persistence.ts';

export class LevelDBAdapter implements Persistence {
  private db!: Level<string, string>;

  constructor(private dbPath: string) {}

  async open(): Promise<void> {
    this.db = new Level(this.dbPath, { valueEncoding: 'json' });
  }

  async get(key: string): Promise<unknown> {
    try {
      const value = await this.db.get(key);
      if (value === undefined) return null;
      return JSON.parse(value);
    } catch (err) {
      if (isNotFoundError(err)) return null;
      throw err;
    }
  }

  async put(key: string, value: unknown): Promise<void> {
    await this.db.put(key, JSON.stringify(value));
  }

  async delete(key: string): Promise<void> {
    await this.db.del(key);
  }

  async batch(operations: Operation[]): Promise<void> {
    const ops = operations.map((op) => {
      if (op.type === 'put') {
        return { type: 'put' as const, key: op.key, value: JSON.stringify(op.value) };
      }
      return { type: 'del' as const, key: op.key };
    });
    await this.db.batch(ops);
  }

  async range(start: string, end: string): Promise<[string, unknown][]> {
    const results: [string, unknown][] = [];
    for await (const [key, value] of this.db.iterator({ gte: start, lte: end })) {
      results.push([key, JSON.parse(value)]);
    }
    return results;
  }

  async close(): Promise<void> {
    await this.db.close();
  }
}

function isNotFoundError(err: unknown): boolean {
  if (err instanceof Error && 'code' in err) {
    return (err as { code: string }).code === 'LEVEL_NOT_FOUND';
  }
  return false;
}

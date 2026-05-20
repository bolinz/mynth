export interface Persistence {
  get(key: string): Promise<unknown>;
  put(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
  batch(operations: Operation[]): Promise<void>;
  range(start: string, end: string): Promise<[string, unknown][]>;
  close(): Promise<void>;
}

export interface Operation {
  type: 'put' | 'del';
  key: string;
  value?: unknown;
}

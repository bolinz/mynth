export interface SDKTaskResult {
  taskId: string;
  status: string;
  hops: number;
}

export class HttpClient {
  constructor(private baseUrl: string) {}

  async run(task: string): Promise<SDKTaskResult> {
    const res = await fetch(`${this.baseUrl}/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    return res.json();
  }

  async status(): Promise<
    Array<{ id: string; name: string; state: string; capabilities: string[] }>
  > {
    const res = await fetch(`${this.baseUrl}/status`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  async tasks(): Promise<Array<{ taskId: string; description: string; status: string }>> {
    const res = await fetch(`${this.baseUrl}/tasks`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  subscribe(_event: string, _handler: (...args: unknown[]) => void): () => void {
    console.warn('HttpClient does not support real-time subscriptions via HTTP');
    return () => {};
  }
}

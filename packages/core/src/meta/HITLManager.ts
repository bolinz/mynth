import type { Persistence } from '../persistence/Persistence.ts';

export interface HITLOperation {
  type: string;
  target: string;
  summary: string;
}

export interface HITLRequest {
  id: string;
  agentId: string;
  taskId: string;
  operation: HITLOperation;
  triggeredBy: 'guard_rule' | 'agent_self_assess';
  status: 'pending' | 'approved' | 'rejected';
  createdAt: number;
  decidedAt?: number;
  decidedBy?: string;
  note?: string;
}

export class HITLManager {
  private requests = new Map<string, HITLRequest>();
  private persistence?: Persistence;

  constructor(persistence?: Persistence) {
    this.persistence = persistence;
  }

  async submit(data: Omit<HITLRequest, 'id' | 'status' | 'createdAt' | 'decidedAt' | 'decidedBy'>): Promise<HITLRequest> {
    const request: HITLRequest = {
      ...data,
      id: `hitl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      status: 'pending',
      createdAt: Date.now(),
    };
    this.requests.set(request.id, request);
    if (this.persistence) {
      await this.persistence.put(`hitl:${request.id}`, request);
    }
    return request;
  }

  async approve(id: string, by: string, note?: string): Promise<boolean> {
    const req = this.requests.get(id);
    if (!req || req.status !== 'pending') return false;
    req.status = 'approved';
    req.decidedAt = Date.now();
    req.decidedBy = by;
    req.note = note;
    if (this.persistence) {
      await this.persistence.put(`hitl:${id}`, req);
    }
    return true;
  }

  async reject(id: string, by: string, note?: string): Promise<boolean> {
    const req = this.requests.get(id);
    if (!req || req.status !== 'pending') return false;
    req.status = 'rejected';
    req.decidedAt = Date.now();
    req.decidedBy = by;
    req.note = note;
    if (this.persistence) {
      await this.persistence.put(`hitl:${id}`, req);
    }
    return true;
  }

  getPending(): HITLRequest[] {
    return Array.from(this.requests.values()).filter((r) => r.status === 'pending');
  }

  getPendingCount(): number {
    return this.getPending().length;
  }

  getById(id: string): HITLRequest | undefined {
    return this.requests.get(id);
  }

  getAll(): HITLRequest[] {
    return Array.from(this.requests.values());
  }

  async loadAll(): Promise<void> {
    if (!this.persistence) return;
    const raw = await this.persistence.range('hitl:', 'hitl~');
    for (const [, value] of raw) {
      const req = value as HITLRequest;
      this.requests.set(req.id, req);
    }
  }
}

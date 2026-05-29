import type { EventBus } from '../message-bus/EventBus.ts';
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
  private eventBus?: EventBus;

  constructor(persistence?: Persistence, eventBus?: EventBus) {
    this.persistence = persistence;
    this.eventBus = eventBus;
  }

  async submit(
    data: Omit<HITLRequest, 'id' | 'status' | 'createdAt' | 'decidedAt' | 'decidedBy'>,
  ): Promise<HITLRequest> {
    if (this.requests.size >= 1000) {
      const oldest = [...this.requests.entries()]
        .filter(([, r]) => r.status !== 'pending')
        .sort(([, a], [, b]) => (a.createdAt ?? 0) - (b.createdAt ?? 0))[0];
      if (oldest) {
        this.requests.delete(oldest[0]);
      } else {
        const oldestPending = [...this.requests.entries()].sort(
          ([, a], [, b]) => (a.createdAt ?? 0) - (b.createdAt ?? 0),
        )[0];
        if (oldestPending) this.requests.delete(oldestPending[0]);
      }
    }
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
    this.eventBus?.publish('hitl.requested', {
      requestId: request.id,
      agentId: request.agentId,
      operation: request.operation.type,
      summary: request.operation.summary,
      createdAt: request.createdAt,
    });
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
    this.eventBus?.publish('hitl.resolved', {
      requestId: id,
      status: 'approved',
      decidedBy: by,
    });
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
    this.eventBus?.publish('hitl.resolved', {
      requestId: id,
      status: 'rejected',
      decidedBy: by,
    });
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

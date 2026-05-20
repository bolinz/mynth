export interface SecurityRequest {
  agentId: string;
  action: string;
  resource: string;
}

export interface SecurityCheck {
  allowed: boolean;
  reason?: string;
}

export class Guard {
  private permissions = new Map<string, string[]>();

  setPermission(agentId: string, actions: string[]): void {
    this.permissions.set(agentId, actions);
  }

  async checkPermission(request: SecurityRequest): Promise<SecurityCheck> {
    const allowed = this.permissions.get(request.agentId);
    if (!allowed) {
      return { allowed: false, reason: 'No permissions configured' };
    }
    return { allowed: allowed.includes(request.action) };
  }

  async approveTool(_toolId: string, agentId: string, _params: unknown): Promise<SecurityCheck> {
    return this.checkPermission({ agentId, action: `tool:${_toolId}`, resource: _toolId });
  }
}

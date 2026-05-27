import type { HITLOperation } from './HITLManager.ts';

export type Role = 'admin' | 'developer' | 'reviewer' | 'viewer';

export interface SecurityRequest {
  agentId: string;
  action: string;
  resource: string;
}

export interface SecurityCheck {
  allowed: boolean;
  reason?: string;
}

export interface OperationCheck {
  allowed: boolean;
  needsApproval: boolean;
  reason?: string;
  requestData?: {
    agentId: string;
    taskId: string;
    operation: HITLOperation;
    triggeredBy: 'guard_rule' | 'agent_self_assess';
  };
}

export interface SecurityPolicy {
  id: string;
  name: string;
  rule: (request: SecurityRequest) => SecurityCheck;
}

const ROLE_PERMISSIONS: Record<Role, string[]> = {
  admin: ['*'],
  developer: [
    'task.submit',
    'task.cancel',
    'task.view',
    'agent.view',
    'agent.create',
    'tool:codegen',
    'tool:review',
    'tool:search',
  ],
  reviewer: ['task.view', 'agent.view', 'tool:review', 'tool:search'],
  viewer: ['task.view', 'agent.view'],
};

export class Guard {
  private agentRoles = new Map<string, Role>();
  private policies: SecurityPolicy[] = [];
  private toolPermissions = new Map<string, Role[]>();

  constructor() {
    this.registerDefaultPolicies();
  }

  setRole(agentId: string, role: Role): void {
    this.agentRoles.set(agentId, role);
  }

  getRole(agentId: string): Role {
    return this.agentRoles.get(agentId) ?? 'viewer';
  }

  setToolPermission(toolId: string, allowedRoles: Role[]): void {
    this.toolPermissions.set(toolId, allowedRoles);
  }

  async checkPermission(request: SecurityRequest): Promise<SecurityCheck> {
    const role = this.agentRoles.get(request.agentId) ?? 'viewer';

    // Check custom policies first
    for (const policy of this.policies) {
      const result = policy.rule(request);
      if (!result.allowed) return result;
    }

    // Check role permissions
    const permissions = ROLE_PERMISSIONS[role];
    if (!permissions) {
      return { allowed: false, reason: `Unknown role: ${role}` };
    }
    if (permissions.includes('*')) return { allowed: true };

    if (permissions.includes(request.action)) return { allowed: true };

    // Check tool-level permissions
    if (request.action.startsWith('tool:')) {
      const toolId = request.action.replace('tool:', '');
      const allowedRoles = this.toolPermissions.get(toolId);
      if (allowedRoles?.includes(role)) return { allowed: true };
    }

    return { allowed: false, reason: `Role ${role} cannot ${request.action}` };
  }

  async approveTool(toolId: string, agentId: string, _params: unknown): Promise<SecurityCheck> {
    return this.checkPermission({
      agentId,
      action: `tool:${toolId}`,
      resource: toolId,
    });
  }

  checkOperation(agentId: string, taskId: string, operation: HITLOperation): OperationCheck {
    const role = this.agentRoles.get(agentId) ?? 'viewer';

    if (operation.type === 'budget.override' && role !== 'admin') {
      return {
        allowed: false,
        needsApproval: true,
        reason: 'budget override requires admin approval',
        requestData: { agentId, taskId, operation, triggeredBy: 'guard_rule' },
      };
    }

    if (operation.type === 'config.modify') {
      return {
        allowed: false,
        needsApproval: true,
        reason: 'config modification requires approval',
        requestData: { agentId, taskId, operation, triggeredBy: 'guard_rule' },
      };
    }

    if (operation.type === 'task.cancel' && role !== 'admin') {
      return {
        allowed: false,
        needsApproval: true,
        reason: 'cancelling tasks requires approval',
        requestData: { agentId, taskId, operation, triggeredBy: 'guard_rule' },
      };
    }

    if (operation.type === 'chain.transfer' && role !== 'admin') {
      return {
        allowed: false,
        needsApproval: true,
        reason: 'chain transfer requires approval',
        requestData: { agentId, taskId, operation, triggeredBy: 'guard_rule' },
      };
    }

    return { allowed: true, needsApproval: false };
  }

  addPolicy(policy: SecurityPolicy): void {
    this.policies.push(policy);
  }

  getAgentRoles(): Record<string, Role> {
    return Object.fromEntries(this.agentRoles);
  }

  private registerDefaultPolicies(): void {
    this.addPolicy({
      id: 'no-system-tools',
      name: 'Block system-level tools from non-admin',
      rule: (req) => {
        if (req.action.startsWith('system:') && this.agentRoles.get(req.agentId) !== 'admin') {
          return { allowed: false, reason: 'system tools require admin role' };
        }
        return { allowed: true };
      },
    });
  }
}

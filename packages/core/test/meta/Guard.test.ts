import { describe, expect, it } from 'vitest';
import { Guard } from '../../src/meta/Guard.ts';

describe('Guard RBAC', () => {
  it('should allow admin to do anything', async () => {
    const guard = new Guard();
    guard.setRole('a1', 'admin');
    const check = await guard.checkPermission({
      agentId: 'a1',
      action: 'anything',
      resource: 'any',
    });
    expect(check.allowed).toBe(true);
  });

  it('should allow developer to submit tasks', async () => {
    const guard = new Guard();
    guard.setRole('dev1', 'developer');
    const check = await guard.checkPermission({
      agentId: 'dev1',
      action: 'task.submit',
      resource: 't1',
    });
    expect(check.allowed).toBe(true);
  });

  it('should deny viewer from submitting tasks', async () => {
    const guard = new Guard();
    guard.setRole('v1', 'viewer');
    const check = await guard.checkPermission({
      agentId: 'v1',
      action: 'task.submit',
      resource: 't1',
    });
    expect(check.allowed).toBe(false);
  });

  it('should deny developer from system tools', async () => {
    const guard = new Guard();
    guard.setRole('dev1', 'developer');
    const check = await guard.checkPermission({
      agentId: 'dev1',
      action: 'system:shutdown',
      resource: 'engine',
    });
    expect(check.allowed).toBe(false);
  });

  it('should default unknown agents to viewer', async () => {
    const guard = new Guard();
    const check = await guard.checkPermission({
      agentId: 'unknown',
      action: 'agent.view',
      resource: 'a1',
    });
    expect(check.allowed).toBe(true);
  });

  it('should check tool-level permissions', async () => {
    const guard = new Guard();
    guard.setRole('dev1', 'developer');
    guard.setToolPermission('deploy', ['admin']);
    const check = await guard.checkPermission({
      agentId: 'dev1',
      action: 'tool:deploy',
      resource: 'deploy',
    });
    expect(check.allowed).toBe(false);
  });

  it('should approve tool for allowed role', async () => {
    const guard = new Guard();
    guard.setRole('dev1', 'developer');
    guard.setToolPermission('codegen', ['developer', 'admin']);
    const check = await guard.approveTool('codegen', 'dev1', {});
    expect(check.allowed).toBe(true);
  });

  it('should deny approve tool for wrong role', async () => {
    const guard = new Guard();
    guard.setRole('v1', 'viewer');
    const check = await guard.approveTool('codegen', 'v1', {});
    expect(check.allowed).toBe(false);
  });

  it('should return agent roles', () => {
    const guard = new Guard();
    guard.setRole('a1', 'admin');
    guard.setRole('d1', 'developer');
    const roles = guard.getAgentRoles();
    expect(roles.a1).toBe('admin');
    expect(roles.d1).toBe('developer');
  });

  it('should support custom policies', async () => {
    const guard = new Guard();
    guard.setRole('dev1', 'developer');
    guard.addPolicy({
      id: 'no-night',
      name: 'Block operations at night',
      rule: () => ({ allowed: false, reason: 'night hours' }),
    });
    const check = await guard.checkPermission({
      agentId: 'dev1',
      action: 'task.submit',
      resource: 't1',
    });
    expect(check.allowed).toBe(false);
    expect(check.reason).toBe('night hours');
  });
});

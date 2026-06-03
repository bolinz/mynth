import { describe, expect, it } from 'vitest';
import { AgentPool } from '../../src/agent/AgentPool.ts';
import { HealthChecker } from '../../src/health/HealthChecker.ts';
import { DegradationMonitor } from '../../src/meta/DegradationMonitor.ts';

describe('HealthChecker', () => {
  it('should return healthy for empty checker', async () => {
    const hc = new HealthChecker();
    const result = await hc.check();
    expect(result.status).toBe('healthy');
    expect(result.uptime).toBeGreaterThanOrEqual(0);
  });

  it('should detect degraded subsystems', async () => {
    const degradation = new DegradationMonitor();
    degradation.setDimension('llm', 'degraded', 'API timeout');

    const hc = new HealthChecker(degradation);
    const result = await hc.check();
    expect(result.status).toBe('degraded');
    expect(result.subsystems.degradation.status).toBe('degraded');
  });

  it('should report agent pool stats', async () => {
    const pool = new AgentPool();
    pool.createAgent('a', 'A', [{ type: 'reasoning', level: 5, confidence: 0.5 }]);

    const hc = new HealthChecker(undefined, pool);
    const result = await hc.check();
    expect(result.subsystems.agent_pool.status).toBe('healthy');
    expect(result.subsystems.agent_pool.details).toContain('1 agents');
  });
});

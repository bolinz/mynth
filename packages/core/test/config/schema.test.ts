import { describe, expect, it } from 'vitest';
import { ConfigManager } from '../../src/config/ConfigManager.ts';
import { AgentConfigSchema, EngineConfigSchema } from '../../src/config/schema.ts';

describe('EngineConfigSchema', () => {
  it('should accept valid config', () => {
    const result = EngineConfigSchema.safeParse({
      dbPath: './test-data',
      agents: [
        { id: 'r', name: 'R', capabilities: [{ type: 'reasoning', level: 5, confidence: 0.5 }] },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('should apply defaults', () => {
    const result = EngineConfigSchema.parse({});
    expect(result.maxHops).toBe(10);
    expect(result.agents.length).toBe(3);
  });

  it('should reject invalid capability type', () => {
    const result = EngineConfigSchema.safeParse({
      agents: [{ id: 'r', name: 'R', capabilities: [{ type: 'invalid', level: 5 }] }],
    });
    expect(result.success).toBe(false);
  });

  it('should reject level > 10', () => {
    const result = EngineConfigSchema.safeParse({
      agents: [{ id: 'r', name: 'R', capabilities: [{ type: 'reasoning', level: 99 }] }],
    });
    expect(result.success).toBe(false);
  });

  it('should require at least one agent', () => {
    const result = EngineConfigSchema.safeParse({ agents: [] });
    expect(result.success).toBe(false);
  });
});

describe('ConfigManager', () => {
  it('should validate and store config', () => {
    const mgr = new ConfigManager();
    const cfg = mgr.validate({ dbPath: './data' });
    expect(cfg.dbPath).toBe('./data');
    expect(mgr.get().maxHops).toBe(10);
  });

  it('should throw on invalid config', () => {
    const mgr = new ConfigManager();
    expect(() => mgr.validate({ dbPath: 123 })).toThrow('validation failed');
  });

  it('should return default config', () => {
    const cfg = ConfigManager.defaultConfig();
    expect(cfg.dbPath).toBe('./data');
    expect(cfg.agents[0].name).toBe('Reasoner');
  });
});

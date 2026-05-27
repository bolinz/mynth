import { EngineConfigSchema, type ValidatedEngineConfig } from './schema.ts';
import type { Persistence } from '../persistence/Persistence.ts';

export interface ConfigSnapshot {
  id: string;
  timestamp: number;
  config: Record<string, unknown>;
  label?: string;
}

export class ConfigManager {
  private validatedConfig: ValidatedEngineConfig | null = null;
  private snapshots: ConfigSnapshot[] = [];
  private persistence?: Persistence;

  constructor(persistence?: Persistence) {
    this.persistence = persistence;
  }

  validate(input: unknown): ValidatedEngineConfig {
    const result = EngineConfigSchema.safeParse(input);
    if (!result.success) {
      const errors = result.error.issues
        .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
        .join('\n');
      throw new Error(`Config validation failed:\n${errors}`);
    }
    this.validatedConfig = result.data;
    return result.data;
  }

  get(): ValidatedEngineConfig {
    if (!this.validatedConfig) throw new Error('Config not validated yet');
    return this.validatedConfig;
  }

  static defaultConfig(): ValidatedEngineConfig {
    return EngineConfigSchema.parse({});
  }

  async saveSnapshot(config: Record<string, unknown>, label?: string): Promise<ConfigSnapshot> {
    const snapshot: ConfigSnapshot = {
      id: `cfg_${Date.now()}`,
      timestamp: Date.now(),
      config,
      label,
    };
    this.snapshots.push(snapshot);
    if (this.persistence) {
      await this.persistence.put(`config:snapshot:${snapshot.id}`, snapshot);
    }
    return snapshot;
  }

  getSnapshot(id: string): ConfigSnapshot | undefined {
    return this.snapshots.find((s) => s.id === id);
  }

  listSnapshots(): ConfigSnapshot[] {
    return [...this.snapshots].sort((a, b) => b.timestamp - a.timestamp);
  }

  async loadFromPersistence(): Promise<void> {
    if (!this.persistence) return;
    const raw = await this.persistence.range('config:snapshot:', 'config:snapshot~');
    for (const [, value] of raw) {
      this.snapshots.push(value as ConfigSnapshot);
    }
  }
}

import { EngineConfigSchema, type ValidatedEngineConfig } from './schema.ts';

export class ConfigManager {
  private validatedConfig: ValidatedEngineConfig | null = null;

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
}

import { z } from 'zod';

export const CapabilityTypeSchema = z.enum([
  'reasoning',
  'codegen',
  'review',
  'search',
  'plan',
  'memory',
  'math',
  'creative',
  'critique',
  'synthesis',
  'coordination',
]);

export const CapabilitySchema = z.object({
  type: CapabilityTypeSchema,
  level: z.number().min(0).max(10),
  confidence: z.number().min(0).max(1).default(0.8),
});

export const HandoverConstraintsSchema = z.object({
  requiredCapabilities: z.array(CapabilitySchema).default([]),
  forbiddenAgents: z.array(z.string()).default([]),
  maxHops: z.number().min(1).max(100).default(10),
  deadline: z.number().optional(),
});

export const AgentConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  capabilities: z.array(CapabilitySchema).min(1),
  transferPolicy: z
    .enum(['capability_match', 'load_balance', 'history_based'])
    .default('capability_match'),
});

const DEFAULT_AGENTS: ValidatedAgentConfig[] = [
  {
    id: 'reasoner',
    name: 'Reasoner',
    transferPolicy: 'capability_match',
    capabilities: [{ type: 'reasoning' as const, level: 8, confidence: 0.9 }],
  },
  {
    id: 'coder',
    name: 'Coder',
    transferPolicy: 'capability_match',
    capabilities: [{ type: 'codegen' as const, level: 8, confidence: 0.85 }],
  },
  {
    id: 'reviewer',
    name: 'Reviewer',
    transferPolicy: 'capability_match',
    capabilities: [{ type: 'review' as const, level: 7, confidence: 0.8 }],
  },
];

export const EngineConfigSchema = z.object({
  dbPath: z.string().default('./data'),
  maxHops: z.number().min(1).max(100).default(10),
  agents: z.array(AgentConfigSchema).min(1).default(DEFAULT_AGENTS),
});

export const BudgetConfigSchema = z.object({
  perTaskInput: z.number().positive().default(10000),
  perTaskOutput: z.number().positive().default(5000),
});

export const LLMProviderConfigSchema = z.object({
  provider: z.enum(['anthropic', 'openai']),
  model: z.string().min(1),
  apiKey: z.string().min(1),
});

export type ValidatedEngineConfig = z.infer<typeof EngineConfigSchema>;
export type ValidatedAgentConfig = z.infer<typeof AgentConfigSchema>;

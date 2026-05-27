# LLM 结构化输出实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 添加 Zod schema 驱动的 LLM 结构化输出系统，支持按 capability 注册 schema 并自动校验。

**Architecture:** PromptSchema 提供 JSON 提取 + Zod 校验，PromptRegistry 扩展支持注册/查询 schema，ChainTransferManager.executeWithLLM 集成自动校验路径。

**Tech Stack:** TypeScript, Zod, Vitest

---

### Task 1: PromptSchema + extractJSON

**Files:**
- Create: `packages/core/src/prompt/PromptSchema.ts`
- Create: `packages/core/test/prompt/PromptSchema.test.ts`

- [ ] **Step 1: 创建 PromptSchema.ts**

```typescript
import type { z } from 'zod';

export interface PromptSchema<T> {
  name: string;
  schema: z.ZodType<T>;
  strict: boolean;
  extractInstructions: string;
}

export function extractJSON(text: string): string {
  const trimmed = text.trim();

  // Try parsing entire text as JSON
  try {
    JSON.parse(trimmed);
    return trimmed;
  } catch {
    // not valid JSON
  }

  // Match ```json ... ``` block
  const jsonBlockMatch = trimmed.match(/```json\s*([\s\S]*?)\s*```/);
  if (jsonBlockMatch) {
    const candidate = jsonBlockMatch[1].trim();
    try {
      JSON.parse(candidate);
      return candidate;
    } catch {
      // not valid JSON
    }
  }

  // Match first { ... } or [ ... ]
  for (const start of ['{', '[']) {
    const startIdx = trimmed.indexOf(start);
    if (startIdx === -1) continue;
    const end = start === '{' ? '}' : ']';
    let depth = 0;
    for (let i = startIdx; i < trimmed.length; i++) {
      if (trimmed[i] === start) depth++;
      else if (trimmed[i] === end) {
        depth--;
        if (depth === 0) {
          const candidate = trimmed.slice(startIdx, i + 1);
          try {
            JSON.parse(candidate);
            return candidate;
          } catch {
            // continue
          }
        }
      }
    }
  }

  return '';
}

export function validateJSON<T>(text: string, schema: z.ZodType<T>): { success: true; data: T } | { success: false; error: string } {
  try {
    const data = schema.parse(JSON.parse(text));
    return { success: true, data };
  } catch (err) {
    const message = err instanceof z.ZodError ? err.message : String(err);
    return { success: false, error: message };
  }
}
```

- [ ] **Step 2: 编写测试**

```typescript
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { extractJSON, validateJSON } from '../../src/prompt/PromptSchema.ts';

describe('extractJSON', () => {
  it('should extract from plain JSON', () => {
    expect(extractJSON('{"a":1}')).toBe('{"a":1}');
  });

  it('should extract from ```json code block', () => {
    const input = 'Some text\n```json\n{"a": 1}\n```\nmore';
    expect(extractJSON(input)).toBe('{"a": 1}');
  });

  it('should extract first balanced braces', () => {
    const input = 'Here is the result: {"nested": {"inner": true}} and more';
    expect(extractJSON(input)).toBe('{"nested": {"inner": true}}');
  });

  it('should extract array JSON', () => {
    const input = 'Result:\n```json\n[1, 2, 3]\n```';
    expect(extractJSON(input)).toBe('[1, 2, 3]');
  });

  it('should return empty string for no JSON', () => {
    expect(extractJSON('Just some text without JSON')).toBe('');
  });
});

describe('validateJSON', () => {
  const schema = z.object({ name: z.string(), age: z.number() });

  it('should validate correct JSON', () => {
    const result = validateJSON('{"name": "Alice", "age": 30}', schema);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('Alice');
    }
  });

  it('should fail on invalid JSON', () => {
    const result = validateJSON('not json', schema);
    expect(result.success).toBe(false);
  });

  it('should fail on schema mismatch', () => {
    const result = validateJSON('{"name": 123}', schema);
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 3: 运行测试**

Run: `pnpm test -- packages/core/test/prompt/PromptSchema.test.ts`
Expected: 7 tests PASS

- [ ] **Step 4: 提交**

```bash
git add packages/core/src/prompt/PromptSchema.ts packages/core/test/prompt/PromptSchema.test.ts
git commit -m "feat(core): add PromptSchema with extractJSON and validateJSON"
```

---

### Task 2: PromptRegistry 扩展

**Files:**
- Modify: `packages/core/src/prompt/PromptRegistry.ts`
- Modify: `packages/core/src/prompt/system-prompts.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: 扩展 PromptRegistry**

In `packages/core/src/prompt/PromptRegistry.ts`:

```typescript
import { DEFAULT_SYSTEM_PROMPT, SYSTEM_PROMPTS } from './system-prompts.ts';
import type { PromptSchema } from './PromptSchema.ts';

export class PromptRegistry {
  private schemas = new Map<string, PromptSchema<unknown>>();

  getSystemPrompt(capability: string): string {
    return SYSTEM_PROMPTS[capability] ?? DEFAULT_SYSTEM_PROMPT;
  }

  buildPrompt(capability: string, task: string, context: string): string {
    const system = this.getSystemPrompt(capability);
    return [
      system,
      '',
      '--- Task ---',
      task,
      '',
      context ? `--- Context ---\n${context}\n` : '',
      '--- Response ---',
    ].join('\n');
  }

  registerSchema(capability: string, schema: PromptSchema<unknown>): void {
    this.schemas.set(capability, schema);
  }

  getSchema(capability: string): PromptSchema<unknown> | undefined {
    return this.schemas.get(capability);
  }

  buildStructuredPrompt(capability: string, task: string, context: string): string {
    const base = this.buildPrompt(capability, task, context);
    const schema = this.schemas.get(capability);
    if (!schema) return base;
    return `${base}\n\n${schema.extractInstructions}`;
  }
}
```

- [ ] **Step 2: 添加示例 schema 指令到 system-prompts**

In `packages/core/src/prompt/system-prompts.ts`, add structured output instructions for existing prompts. Append to each prompt:

For `reasoning`, change to:
```
export const SYSTEM_PROMPTS: Record<string, string> = {
  reasoning: `You are a reasoning agent. Analyze problems step by step, consider alternatives, and provide clear logical conclusions.

Focus on: analysis, problem-solving, critical thinking, evaluation.

Your response should be structured as:
1. Understanding of the task
2. Step-by-step reasoning
3. Conclusion or recommendation`,
```

No changes needed - the structured output instructions are in `extractInstructions` field of PromptSchema, not in the system prompts.

- [ ] **Step 3: 导出 PromptSchema**

In `packages/core/src/index.ts`, add to prompt exports:
```typescript
export { PromptSchema, extractJSON, validateJSON } from './prompt/PromptSchema.ts';
```

- [ ] **Step 4: 运行测试**

Run: `pnpm test -- packages/core/test/prompt/PromptRegistry.test.ts packages/core/test/prompt/PromptSchema.test.ts`
Expected: All tests PASS

- [ ] **Step 5: 提交**

```bash
git add packages/core/src/prompt/PromptRegistry.ts packages/core/src/index.ts
git commit -m "feat(core): extend PromptRegistry with structured schema registration"
```

---

### Task 3: ChainTransferManager 集成

**Files:**
- Modify: `packages/core/src/chain/ChainTransferManager.ts`

- [ ] **Step 1: 集成结构化输出校验到 executeWithLLM**

In `packages/core/src/chain/ChainTransferManager.ts`, modify `executeWithLLM`:

After the `await loop.execute(prompt, capability)` line and before returning, add:

```typescript
      const result = await loop.execute(prompt, capability);

      // Structured output validation
      const schema = this.promptRegistry?.getSchema(capability);
      if (schema) {
        const json = extractJSON(result);
        if (json) {
          const validation = validateJSON(json, schema.schema);
          if (!validation.success) {
            if (schema.strict) {
              throw new Error(`Structured output validation failed for ${capability}: ${validation.error}`);
            }
            this.bus?.publish('anomaly.detected', {
              type: 'structured_output_validation_failed',
              agentId,
              details: { capability, error: validation.error },
            });
          }
        }
      }

      if (this.budgetTracker) {
```

And import `extractJSON` and `validateJSON` at the top.

- [ ] **Step 2: 运行测试**

Run: `pnpm test`
Expected: All 199+ tests PASS

- [ ] **Step 3: 提交**

```bash
git add packages/core/src/chain/ChainTransferManager.ts
git commit -m "feat(core): integrate structured output validation into chain execution"
```

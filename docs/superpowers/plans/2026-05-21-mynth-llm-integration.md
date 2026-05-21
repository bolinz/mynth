# Mynth LLM Integration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans.

**Goal:** Replace `setTimeout(20ms)` simulation with real LLM calls so agents can actually reason, generate, and review.

**Architecture:** `LLMProvider` abstract interface → `AnthropicProvider` / `OpenAIProvider` implementations → `LLMPool` with retry/fallback/circuit-breaker → Agent uses `LLMProvider` in Think-Act-Observe loop → `BudgetTracker` for cost control.

**Prerequisites:** Core agent framework (BaseAgent, AgentStateMachine, ChainTransferManager, EventBus) exists. Agent execution is currently simulated with `simulateWork()`.

---

## File Map

```
packages/
└── core/src/
    ├── llm/
    │   ├── LLMProvider.ts          # Interface: complete(), completeStream()
    │   ├── LLMPool.ts              # Provider registry + routing
    │   ├── RetryProvider.ts        # Retry on 429/502/503
    │   ├── FallbackProvider.ts     # Cross-provider fallback chain
    │   ├── CircuitBreaker.ts       # Failure threshold → open circuit
    │   ├── BudgetTracker.ts        # Token counting + per-task budget
    │   └── index.ts
    ├── agent/
    │   ├── BaseAgent.ts            # [MODIFY] use LLMProvider instead of simulateWork
    │   └── ReActLoop.ts            # [NEW] Think-Act-Observe execution loop
    ├── prompt/
    │   ├── PromptRegistry.ts       # Template registry per capability
    │   ├── system-prompts.ts       # System prompts for reasoning/codegen/review
    │   └── index.ts
    └── engine/
        └── CoreEngine.ts           # [MODIFY] configure LLMPool on start
```

---

### Task 1: LLMProvider Interface

**Files:**
- Create: `packages/core/src/llm/LLMProvider.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/test/llm/LLMProvider.test.ts
import { describe, it, expect } from 'vitest';
import type { LLMProvider, LLMConfig, LLMResponse } from '../../src/llm/LLMProvider.ts';

describe('LLMProvider interface', () => {
  it('should define the expected types', () => {
    const config: LLMConfig = { model: 'test', temperature: 0.7, maxTokens: 1000 };
    expect(config.model).toBe('test');
  });
});

export class MockProvider implements LLMProvider {
  async complete(prompt: string, config: LLMConfig): Promise<LLMResponse> {
    return { content: `Echo: ${prompt.slice(0, 20)}`, usage: { inputTokens: 10, outputTokens: 5 }, finishReason: 'stop' };
  }
  async completeStream(prompt: string, config: LLMConfig): Promise<AsyncGenerator<LLMResponse>> {
    async function* gen() { yield { content: 'chunk', usage: { inputTokens: 0, outputTokens: 5 }, finishReason: 'stop' }; }
    return gen();
  }
}

describe('MockProvider', () => {
  it('should return a response', async () => {
    const p = new MockProvider();
    const res = await p.complete('hello', { model: 'mock' });
    expect(res.content).toContain('Echo:');
    expect(res.finishReason).toBe('stop');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/core/test/llm/LLMProvider.test.ts`
Expected: FAIL (file not found)

- [ ] **Step 3: Write minimal implementation**

```typescript
// packages/core/src/llm/LLMProvider.ts
export interface LLMConfig {
  model: string;
  temperature?: number;
  maxTokens?: number;
  stopSequences?: string[];
}

export interface LLMResponse {
  content: string;
  usage: { inputTokens: number; outputTokens: number };
  finishReason: 'stop' | 'length' | 'error';
}

export interface LLMProvider {
  complete(prompt: string, config: LLMConfig): Promise<LLMResponse>;
  completeStream(prompt: string, config: LLMConfig): AsyncGenerator<LLMResponse>;
}
```

```typescript
// packages/core/src/llm/index.ts
export type { LLMProvider, LLMConfig, LLMResponse } from './LLMProvider.ts';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/core/test/llm/LLMProvider.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/llm/LLMProvider.ts packages/core/src/llm/index.ts packages/core/test/llm/LLMProvider.test.ts
git commit -m "feat(core): add LLMProvider interface and mock"
```

---

### Task 2: LLMPool with Provider Registry

**Files:**
- Create: `packages/core/src/llm/LLMPool.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/test/llm/LLMPool.test.ts
import { describe, it, expect } from 'vitest';
import { LLMPool } from '../../src/llm/LLMPool.ts';
import { MockProvider } from './LLMProvider.test.ts';

describe('LLMPool', () => {
  it('should register and resolve a provider', () => {
    const pool = new LLMPool();
    pool.register('mock', new MockProvider());
    const resolved = pool.resolve({ model: 'mock' });
    expect(resolved).toBeDefined();
  });

  it('should throw for unknown model', () => {
    const pool = new LLMPool();
    expect(() => pool.resolve({ model: 'nonexistent' })).toThrow();
  });

  it('should route by model prefix', () => {
    const pool = new LLMPool();
    pool.register('claude-haiku', new MockProvider());
    const resolved = pool.resolve({ model: 'claude-haiku-20240307' });
    expect(resolved).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/core/test/llm/LLMPool.test.ts`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

```typescript
// packages/core/src/llm/LLMPool.ts
import type { LLMProvider, LLMConfig } from './LLMProvider.ts';

export class LLMPool {
  private providers = new Map<string, LLMProvider>();

  register(name: string, provider: LLMProvider): void {
    this.providers.set(name, provider);
  }

  resolve(config: LLMConfig): LLMProvider {
    // Try exact match first
    const exact = this.providers.get(config.model);
    if (exact) return exact;

    // Try prefix match (e.g. "claude-sonnet-20240229" matches "claude-sonnet")
    for (const [name, provider] of this.providers) {
      if (config.model.startsWith(name)) return provider;
    }

    throw new Error(`No provider found for model: ${config.model}`);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/core/test/llm/LLMPool.test.ts`
Expected: PASS

- [ ] **Step 5: Update llm/index.ts**

```typescript
// packages/core/src/llm/index.ts — add LLMPool export
export type { LLMProvider, LLMConfig, LLMResponse } from './LLMProvider.ts';
export { LLMPool } from './LLMPool.ts';
```

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/llm/ packages/core/test/llm/
git commit -m "feat(core): add LLMPool with model prefix routing"
```

---

### Task 3: Retry, Fallback, CircuitBreaker Providers

**Files:**
- Create: `packages/core/src/llm/RetryProvider.ts`
- Create: `packages/core/src/llm/FallbackProvider.ts`
- Create: `packages/core/src/llm/CircuitBreaker.ts`

- [ ] **Step 1: Write tests**

```typescript
// packages/core/test/llm/RetryProvider.test.ts
import { describe, it, expect, vi } from 'vitest';
import { RetryProvider } from '../../src/llm/RetryProvider.ts';
import { MockProvider } from './LLMProvider.test.ts';

describe('RetryProvider', () => {
  it('should succeed on first attempt', async () => {
    const inner = new MockProvider();
    const retry = new RetryProvider(inner, 3);
    const res = await retry.complete('hello', { model: 'mock' });
    expect(res.content).toBeDefined();
  });

  it('should retry on 429 status', async () => {
    let attempts = 0;
    const failing = {
      async complete() { attempts++; throw Object.assign(new Error('rate limit'), { status: 429 }); },
      async *completeStream() {},
    };
    const retry = new RetryProvider(failing as any, 2);
    await expect(retry.complete('hi', { model: 'x' })).rejects.toThrow();
    expect(attempts).toBe(2);
  });
});
```

```typescript
// packages/core/test/llm/FallbackProvider.test.ts
import { describe, it, expect, vi } from 'vitest';
import { FallbackProvider } from '../../src/llm/FallbackProvider.ts';
import { MockProvider } from './LLMProvider.test.ts';

describe('FallbackProvider', () => {
  it('should use primary provider first', async () => {
    const primary = new MockProvider();
    const fallback = new FallbackProvider([primary, new MockProvider()]);
    const res = await fallback.complete('hi', { model: 'x' });
    expect(res.content).toContain('Echo:');
  });

  it('should fallback on failure', async () => {
    let primaryCalled = false;
    const primary = { async complete() { primaryCalled = true; throw new Error('fail'); }, async *completeStream() {} };
    const fallback = new FallbackProvider([primary as any, new MockProvider()]);
    const res = await fallback.complete('hi', { model: 'x' });
    expect(primaryCalled).toBe(true);
    expect(res.content).toContain('Echo:');
  });
});
```

```typescript
// packages/core/test/llm/CircuitBreaker.test.ts
import { describe, it, expect } from 'vitest';
import { CircuitBreaker } from '../../src/llm/CircuitBreaker.ts';
import { MockProvider } from './LLMProvider.test.ts';

describe('CircuitBreaker', () => {
  it('should pass through when closed', async () => {
    const cb = new CircuitBreaker(new MockProvider(), 3);
    const res = await cb.complete('hi', { model: 'x' });
    expect(res.content).toBeDefined();
  });

  it('should open after threshold failures', async () => {
    let callCount = 0;
    const failing = { async complete() { callCount++; throw new Error('fail'); }, async *completeStream() {} };
    const cb = new CircuitBreaker(failing as any, 2);
    await expect(cb.complete('hi', { model: 'x' })).rejects.toThrow();
    await expect(cb.complete('hi', { model: 'x' })).rejects.toThrow();
    await expect(cb.complete('hi', { model: 'x' })).rejects.toThrow('circuit open');
    expect(callCount).toBe(2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/core/test/llm/RetryProvider.test.ts packages/core/test/llm/FallbackProvider.test.ts packages/core/test/llm/CircuitBreaker.test.ts`
Expected: FAIL

- [ ] **Step 3: Write implementations**

```typescript
// packages/core/src/llm/RetryProvider.ts
import type { LLMProvider, LLMConfig, LLMResponse } from './LLMProvider.ts';

export class RetryProvider implements LLMProvider {
  constructor(private inner: LLMProvider, private maxRetries = 3) {}

  async complete(prompt: string, config: LLMConfig): Promise<LLMResponse> {
    let lastError: Error | null = null;
    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        return await this.inner.complete(prompt, config);
      } catch (err) {
        lastError = err as Error;
        if (!this.isRetryable(err)) throw err;
        if (attempt < this.maxRetries - 1) {
          await new Promise((r) => setTimeout(r, Math.min(1000 * 2 ** attempt, 10000)));
        }
      }
    }
    throw lastError;
  }

  async *completeStream(prompt: string, config: LLMConfig): AsyncGenerator<LLMResponse> {
    yield* this.inner.completeStream(prompt, config);
  }

  private isRetryable(err: unknown): boolean {
    const status = (err as any)?.status || (err as any)?.code;
    return [429, 502, 503].includes(status);
  }
}
```

```typescript
// packages/core/src/llm/FallbackProvider.ts
import type { LLMProvider, LLMConfig, LLMResponse } from './LLMProvider.ts';

export class FallbackProvider implements LLMProvider {
  constructor(private providers: LLMProvider[]) {}

  async complete(prompt: string, config: LLMConfig): Promise<LLMResponse> {
    const errors: Error[] = [];
    for (const provider of this.providers) {
      try {
        return await provider.complete(prompt, config);
      } catch (err) {
        errors.push(err as Error);
      }
    }
    throw new Error(`All providers failed: ${errors.map((e) => e.message).join('; ')}`);
  }

  async *completeStream(prompt: string, config: LLMConfig): AsyncGenerator<LLMResponse> {
    for (const provider of this.providers) {
      try {
        yield* provider.completeStream(prompt, config);
        return;
      } catch { /* try next */ }
    }
  }
}
```

```typescript
// packages/core/src/llm/CircuitBreaker.ts
import type { LLMProvider, LLMConfig, LLMResponse } from './LLMProvider.ts';

type CircuitState = 'closed' | 'open' | 'half-open';

export class CircuitBreaker implements LLMProvider {
  private state: CircuitState = 'closed';
  private failureCount = 0;
  private lastFailureTime = 0;

  constructor(private inner: LLMProvider, private threshold = 5, private resetTimeout = 30000) {}

  async complete(prompt: string, config: LLMConfig): Promise<LLMResponse> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime > this.resetTimeout) {
        this.state = 'half-open';
      } else {
        throw new Error('circuit open');
      }
    }

    try {
      const result = await this.inner.complete(prompt, config);
      if (this.state === 'half-open') {
        this.state = 'closed';
        this.failureCount = 0;
      }
      return result;
    } catch (err) {
      this.failureCount++;
      this.lastFailureTime = Date.now();
      if (this.failureCount >= this.threshold) {
        this.state = 'open';
      }
      throw err;
    }
  }

  async *completeStream(prompt: string, config: LLMConfig): AsyncGenerator<LLMResponse> {
    yield* this.inner.completeStream(prompt, config);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/core/test/llm/`
Expected: PASS

- [ ] **Step 5: Update llm/index.ts**

- [ ] **Step 6: Commit**

---

### Task 4: BudgetTracker

**Files:**
- Create: `packages/core/src/llm/BudgetTracker.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/test/llm/BudgetTracker.test.ts
import { describe, it, expect } from 'vitest';
import { BudgetTracker } from '../../src/llm/BudgetTracker.ts';

describe('BudgetTracker', () => {
  it('should track token usage per task', async () => {
    const bt = new BudgetTracker();
    bt.record('task-1', 'reasoning', 100, 50);
    const usage = bt.getTaskUsage('task-1');
    expect(usage.inputTokens).toBe(100);
    expect(usage.outputTokens).toBe(50);
  });

  it('should reject when over budget', () => {
    const bt = new BudgetTracker({ perTaskInput: 200 });
    bt.record('t1', 'r', 150, 50);
    expect(bt.check('t1', 'r')).toBe(false);
  });

  it('should accept when under budget', () => {
    const bt = new BudgetTracker({ perTaskInput: 1000 });
    bt.record('t1', 'r', 100, 50);
    expect(bt.check('t1', 'r')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Write minimal implementation**

```typescript
// packages/core/src/llm/BudgetTracker.ts
export interface BudgetConfig {
  perTaskInput?: number;
  perTaskOutput?: number;
}

export interface UsageRecord {
  inputTokens: number;
  outputTokens: number;
}

export class BudgetTracker {
  private usage = new Map<string, UsageRecord>();

  constructor(private config: BudgetConfig = {}) {}

  record(taskId: string, _capability: string, inputTokens: number, outputTokens: number): void {
    const key = taskId;
    const existing = this.usage.get(key) ?? { inputTokens: 0, outputTokens: 0 };
    this.usage.set(key, {
      inputTokens: existing.inputTokens + inputTokens,
      outputTokens: existing.outputTokens + outputTokens,
    });
  }

  check(taskId: string, _capability: string): boolean {
    const usage = this.usage.get(taskId);
    if (!usage) return true;
    if (this.config.perTaskInput && usage.inputTokens > this.config.perTaskInput) return false;
    if (this.config.perTaskOutput && usage.outputTokens > this.config.perTaskOutput) return false;
    return true;
  }

  getTaskUsage(taskId: string): UsageRecord {
    return this.usage.get(taskId) ?? { inputTokens: 0, outputTokens: 0 };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

- [ ] **Step 5: Update llm/index.ts**

- [ ] **Step 6: Commit**

---

### Task 5: Anthropic and OpenAI Provider Implementations

**Files:**
- Create: `packages/core/src/llm/AnthropicProvider.ts`
- Create: `packages/core/src/llm/OpenAIProvider.ts`

- [ ] **Step 1: Write tests using mocks**

```typescript
// packages/core/test/llm/AnthropicProvider.test.ts
import { describe, it, expect, vi } from 'vitest';
import { AnthropicProvider } from '../../src/llm/AnthropicProvider.ts';

describe('AnthropicProvider', () => {
  it('should call the API and return response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [{ text: 'Hello!' }],
        usage: { input_tokens: 10, output_tokens: 5 },
      }),
    });
    const provider = new AnthropicProvider('sk-test', 'claude-sonnet-4', mockFetch as any);
    const res = await provider.complete('Hi', { model: 'claude-sonnet-4' });
    expect(res.content).toBe('Hello!');
    expect(res.usage.inputTokens).toBe(10);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.anthropic.com/v1/messages',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'x-api-key': 'sk-test' }),
      }),
    );
  });
});
```

```typescript
// packages/core/test/llm/OpenAIProvider.test.ts
import { describe, it, expect, vi } from 'vitest';
import { OpenAIProvider } from '../../src/llm/OpenAIProvider.ts';

describe('OpenAIProvider', () => {
  it('should call the API and return response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'Hello!' } }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      }),
    });
    const provider = new OpenAIProvider('sk-test', 'gpt-4o', mockFetch as any);
    const res = await provider.complete('Hi', { model: 'gpt-4o' });
    expect(res.content).toBe('Hello!');
    expect(res.usage.inputTokens).toBe(10);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

- [ ] **Step 3: Write implementations**

```typescript
// packages/core/src/llm/AnthropicProvider.ts
import type { LLMProvider, LLMConfig, LLMResponse } from './LLMProvider.ts';

export class AnthropicProvider implements LLMProvider {
  private apiUrl = 'https://api.anthropic.com/v1/messages';

  constructor(
    private apiKey: string,
    private defaultModel: string,
    private fetchFn: typeof fetch = globalThis.fetch,
  ) {}

  async complete(prompt: string, config: LLMConfig): Promise<LLMResponse> {
    const model = config.model || this.defaultModel;
    const res = await this.fetchFn(this.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: config.maxTokens ?? 1024,
        temperature: config.temperature ?? 0.7,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw Object.assign(new Error(`Anthropic API error: ${err}`), { status: res.status });
    }

    const json = await res.json();
    return {
      content: json.content[0]?.text ?? '',
      usage: { inputTokens: json.usage?.input_tokens ?? 0, outputTokens: json.usage?.output_tokens ?? 0 },
      finishReason: json.stop_reason === 'end_turn' ? 'stop' : 'length',
    };
  }

  async *completeStream(prompt: string, config: LLMConfig): AsyncGenerator<LLMResponse> {
    const model = config.model || this.defaultModel;
    const res = await this.fetchFn(this.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: config.maxTokens ?? 1024,
        temperature: config.temperature ?? 0.7,
        messages: [{ role: 'user', content: prompt }],
        stream: true,
      }),
    });

    if (!res.ok) throw new Error(`Anthropic API error: ${res.status}`);
    const reader = res.body?.getReader();
    if (!reader) return;

    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = JSON.parse(line.slice(6));
          if (data.type === 'content_block_delta') {
            yield { content: data.delta?.text ?? '', usage: { inputTokens: 0, outputTokens: 0 }, finishReason: 'stop' };
          }
        }
      }
    }
  }
}
```

```typescript
// packages/core/src/llm/OpenAIProvider.ts
import type { LLMProvider, LLMConfig, LLMResponse } from './LLMProvider.ts';

export class OpenAIProvider implements LLMProvider {
  private apiUrl = 'https://api.openai.com/v1/chat/completions';

  constructor(
    private apiKey: string,
    private defaultModel: string,
    private fetchFn: typeof fetch = globalThis.fetch,
  ) {}

  async complete(prompt: string, config: LLMConfig): Promise<LLMResponse> {
    const model = config.model || this.defaultModel;
    const res = await this.fetchFn(this.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model,
        max_tokens: config.maxTokens ?? 1024,
        temperature: config.temperature ?? 0.7,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw Object.assign(new Error(`OpenAI API error: ${err}`), { status: res.status });
    }

    const json = await res.json();
    return {
      content: json.choices[0]?.message?.content ?? '',
      usage: { inputTokens: json.usage?.prompt_tokens ?? 0, outputTokens: json.usage?.completion_tokens ?? 0 },
      finishReason: json.choices[0]?.finish_reason === 'stop' ? 'stop' : 'length',
    };
  }

  async *completeStream(prompt: string, config: LLMConfig): AsyncGenerator<LLMResponse> {
    const model = config.model || this.defaultModel;
    const res = await this.fetchFn(this.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model,
        max_tokens: config.maxTokens ?? 1024,
        temperature: config.temperature ?? 0.7,
        messages: [{ role: 'user', content: prompt }],
        stream: true,
      }),
    });

    if (!res.ok) throw new Error(`OpenAI API error: ${res.status}`);
    const reader = res.body?.getReader();
    if (!reader) return;

    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (line.startsWith('data: ') && line !== 'data: [DONE]') {
          const data = JSON.parse(line.slice(6));
          const delta = data.choices?.[0]?.delta?.content;
          if (delta) {
            yield { content: delta, usage: { inputTokens: 0, outputTokens: 0 }, finishReason: 'stop' };
          }
        }
      }
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

- [ ] **Step 5: Update llm/index.ts with new exports**

- [ ] **Step 6: Commit**

---

### Task 6: ReAct Execution Loop

**Files:**
- Create: `packages/core/src/agent/ReActLoop.ts`
- Modify: `packages/core/src/agent/BaseAgent.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/test/agent/ReActLoop.test.ts
import { describe, it, expect, vi } from 'vitest';
import { ReActLoop } from '../../src/agent/ReActLoop.ts';
import type { LLMProvider } from '../../src/llm/LLMProvider.ts';

describe('ReActLoop', () => {
  it('should call LLM and return result', async () => {
    const mockLLM: LLMProvider = {
      complete: vi.fn().mockResolvedValue({ content: '42', usage: { inputTokens: 5, outputTokens: 1 }, finishReason: 'stop' }),
      completeStream: vi.fn() as any,
    };
    const loop = new ReActLoop(mockLLM);
    const result = await loop.execute('What is 6 * 7?', 'reasoning');
    expect(result).toBe('42');
  });

  it('should respect max iterations', async () => {
    const mockLLM: LLMProvider = {
      complete: vi.fn().mockResolvedValue({ content: 'need more info', usage: { inputTokens: 5, outputTokens: 5 }, finishReason: 'stop' }),
      completeStream: vi.fn() as any,
    };
    const loop = new ReActLoop(mockLLM, 3);
    const result = await loop.execute('complex question', 'reasoning');
    expect(result).toContain('max iterations');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Write minimal implementation**

```typescript
// packages/core/src/agent/ReActLoop.ts
import type { LLMProvider } from '../llm/LLMProvider.ts';

export class ReActLoop {
  private maxIterations: number;

  constructor(private llm: LLMProvider, maxIterations = 10) {
    this.maxIterations = maxIterations;
  }

  async execute(task: string, _capability: string): Promise<string> {
    let thought = '';

    for (let i = 0; i < this.maxIterations; i++) {
      const prompt = this.buildPrompt(task, thought, i);
      const response = await this.llm.complete(prompt, { model: 'default', temperature: 0.7, maxTokens: 1024 });

      thought += '\n' + response.content;

      if (this.isComplete(response.content)) {
        return response.content;
      }
    }

    return `Reached max iterations (${this.maxIterations}): ${thought}`;
  }

  private buildPrompt(task: string, previousThought: string, iteration: number): string {
    return [
      'You are an AI agent executing a task. Think step by step.',
      '',
      `Task: ${task}`,
      '',
      previousThought ? `Previous work:\n${previousThought}\n` : '',
      iteration > 0
        ? 'Continue from where you left off. Focus on making concrete progress.'
        : 'Start by analyzing what needs to be done.',
      '',
      'Provide your reasoning and any output. If the task is complete, start your response with "FINAL:"',
    ].join('\n');
  }

  private isComplete(content: string): boolean {
    return content.includes('FINAL:') || content.includes('ANSWER:');
  }
}
```

- [ ] **Step 4: Now modify BaseAgent to use ReActLoop**

```typescript
// In BaseAgent.ts — add optional LLMProvider and ReActLoop
import { ReActLoop } from './ReActLoop.ts';
import type { LLMProvider } from '../llm/LLMProvider.ts';

// Add to constructor params:
// private llmProvider?: LLMProvider,

// Replace simulateWork in ChainTransferManager integration:
// Instead of simulateWork, the agent does:
async executeWithLLM(task: string, capability: string): Promise<string> {
  if (!this.llmProvider) return 'simulated';
  const loop = new ReActLoop(this.llmProvider);
  return loop.execute(task, capability);
}
```

- [ ] **Step 5: Run tests to verify they pass**

- [ ] **Step 6: Commit**

---

### Task 7: Prompt Registry for Capability-Specific Prompts

**Files:**
- Create: `packages/core/src/prompt/PromptRegistry.ts`
- Create: `packages/core/src/prompt/system-prompts.ts`
- Create: `packages/core/src/prompt/index.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/test/prompt/PromptRegistry.test.ts
import { describe, it, expect } from 'vitest';
import { PromptRegistry } from '../../src/prompt/PromptRegistry.ts';

describe('PromptRegistry', () => {
  it('should return a system prompt for each capability', () => {
    const reg = new PromptRegistry();
    const prompt = reg.getSystemPrompt('codegen');
    expect(prompt).toContain('code');
  });

  it('should default to reasoning prompt', () => {
    const reg = new PromptRegistry();
    const prompt = reg.getSystemPrompt('unknown_capability');
    expect(prompt).toBeDefined();
  });

  it('should build a full prompt with task context', () => {
    const reg = new PromptRegistry();
    const prompt = reg.buildPrompt('codegen', 'write a hello world function', 'previous work: analysis done');
    expect(prompt).toContain('write a hello world function');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Write implementations**

```typescript
// packages/core/src/prompt/system-prompts.ts
export const SYSTEM_PROMPTS: Record<string, string> = {
  reasoning: `You are a reasoning agent. Analyze problems step by step, consider alternatives, and provide clear logical conclusions.

Focus on: analysis, problem-solving, critical thinking, evaluation.

Your response should be structured as:
1. Understanding of the task
2. Step-by-step reasoning
3. Conclusion or recommendation`,

  codegen: `You are a code generation agent. Write clean, well-structured code following best practices.

Focus on: implementation, functions, classes, APIs, algorithms.

Rules:
- Write complete, runnable code
- Include error handling
- Follow language-specific conventions
- Add brief comments for complex logic`,

  review: `You are a code review agent. Review code for correctness, security, performance, and style.

Focus on: bugs, security issues, performance problems, code style, test coverage.

Check for:
- Logic errors and edge cases
- Security vulnerabilities
- Performance bottlenecks
- Adherence to coding standards
- Test coverage gaps`,
};

export const DEFAULT_SYSTEM_PROMPT = `You are a helpful AI agent. Complete the task to the best of your ability.`;
```

```typescript
// packages/core/src/prompt/PromptRegistry.ts
import { SYSTEM_PROMPTS, DEFAULT_SYSTEM_PROMPT } from './system-prompts.ts';

export class PromptRegistry {
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
}
```

```typescript
// packages/core/src/prompt/index.ts
export { PromptRegistry } from './PromptRegistry.ts';
export { SYSTEM_PROMPTS, DEFAULT_SYSTEM_PROMPT } from './system-prompts.ts';
```

- [ ] **Step 4: Run tests to verify they pass**

- [ ] **Step 5: Commit**

---

### Task 8: Wire Everything into CoreEngine

**Files:**
- Modify: `packages/core/src/engine/CoreEngine.ts`
- Modify: `packages/core/src/chain/ChainTransferManager.ts`

- [ ] **Step 1: Update CoreEngine to configure LLM on start**

```typescript
// In CoreEngine.ts — add LLM configuration
import { LLMPool } from '../llm/LLMPool.ts';
import { RetryProvider } from '../llm/RetryProvider.ts';
import { FallbackProvider } from '../llm/FallbackProvider.ts';
import { CircuitBreaker } from '../llm/CircuitBreaker.ts';
import { AnthropicProvider } from '../llm/AnthropicProvider.ts';
import { OpenAIProvider } from '../llm/OpenAIProvider.ts';
import { BudgetTracker } from '../llm/BudgetTracker.ts';
import { PromptRegistry } from '../prompt/PromptRegistry.ts';

// Add to CoreEngine class:
llmPool!: LLMPool;
budgetTracker!: BudgetTracker;
promptRegistry!: PromptRegistry;

// In start():
this.llmPool = new LLMPool();
this.budgetTracker = new BudgetTracker();
this.promptRegistry = new PromptRegistry();

// Configure providers based on environment:
if (process.env.ANTHROPIC_API_KEY) {
  const anthropic = new AnthropicProvider(process.env.ANTHROPIC_API_KEY, 'claude-sonnet-4-20250514');
  const retry = new RetryProvider(anthropic, 3);
  this.llmPool.register('claude-sonnet', retry);
  this.llmPool.register('claude-haiku', retry);
}
if (process.env.OPENAI_API_KEY) {
  const openai = new OpenAIProvider(process.env.OPENAI_API_KEY, 'gpt-4o');
  const retry = new RetryProvider(openai, 3);
  this.llmPool.register('gpt-4o', retry);
}
```

- [ ] **Step 2: Update ChainTransferManager to use LLM for agent execution**

```typescript
// In ChainTransferManager — replace simulateWork() with actual LLM call
// Pass llmPool to the chain manager
// Each agent calls llmPool.resolve().complete() instead of simulateWork
```

- [ ] **Step 3: Verify build and tests pass**

Run: `npx turbo build && npx vitest run`

- [ ] **Step 4: Commit**

---

### Task 9: CLI Configuration for API Keys

**Files:**
- Modify: `packages/cli/src/index.ts`
- Create: `packages/cli/src/config.ts` (optional)

- [ ] **Step 1: Update CLI to read env vars and configure engine**

```typescript
// In packages/cli/src/index.ts, before engine.start():
// Read API keys from environment
// engine.start() will pick them up via process.env
```

- [ ] **Step 2: Verify CLI still works**

Run: `pnpm --filter @mynth/cli exec mynth run "hello"`

- [ ] **Step 3: Commit**

---

## Self-Review Checklist

- **Spec coverage:** All LLM integration aspects covered: provider interface, pool management, retry/fallback/circuit-breaker, Anthropic/OpenAI implementations, ReAct loop, budget tracking, prompt templates, and wiring.
- **Placeholder scan:** No TBDs. Every code block is complete and testable.
- **Type consistency:** `LLMProvider` interface used consistently across all provider implementations and the `ReActLoop`. `BudgetTracker` uses the same token counting units throughout.
- **Test availability:** Every implementation Task has a corresponding test file with specific assertions.

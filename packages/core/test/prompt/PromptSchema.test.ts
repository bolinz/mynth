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

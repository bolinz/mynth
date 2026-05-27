import { z } from 'zod';
import { ZodError } from 'zod';

export interface PromptSchema<T> {
  name: string;
  schema: z.ZodType<T>;
  strict: boolean;
  extractInstructions: string;
}

export function extractJSON(text: string): string {
  const trimmed = text.trim();

  try {
    JSON.parse(trimmed);
    return trimmed;
  } catch {
    // not valid JSON
  }

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

export function validateJSON<T>(
  text: string,
  schema: z.ZodType<T>,
): { success: true; data: T } | { success: false; error: string } {
  try {
    const data = schema.parse(JSON.parse(text));
    return { success: true, data };
  } catch (err) {
    const message = err instanceof ZodError ? err.message : String(err);
    return { success: false, error: message };
  }
}

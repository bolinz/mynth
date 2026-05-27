import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { RendererRegistry } from '../../src/meta/ViewRenderer.ts';
import type { ViewRenderer } from '../../src/meta/ViewRenderer.ts';

describe('RendererRegistry', () => {
  it('should register and get a renderer', () => {
    const registry = new RendererRegistry();
    const renderer: ViewRenderer = {
      type: 'markdown',
      description: 'Render content as Markdown',
      schema: z.object({ content: z.string() }),
      renderTUI() {
        return 'markdown output';
      },
      renderWeb() {
        return '<p>markdown</p>';
      },
    };
    registry.register(renderer);
    expect(registry.get('markdown')).toBe(renderer);
  });

  it('should return undefined for unregistered type', () => {
    const registry = new RendererRegistry();
    expect(registry.get('nonexistent')).toBeUndefined();
  });

  it('should return all registered renderers', () => {
    const registry = new RendererRegistry();
    const a: ViewRenderer = {
      type: 'a',
      description: 'Renderer A',
      schema: z.object({}),
      renderTUI() {
        return 'a';
      },
      renderWeb() {
        return '<p>a</p>';
      },
    };
    const b: ViewRenderer = {
      type: 'b',
      description: 'Renderer B',
      schema: z.object({}),
      renderTUI() {
        return 'b';
      },
      renderWeb() {
        return '<p>b</p>';
      },
    };
    registry.register(a);
    registry.register(b);
    expect(registry.getAll()).toEqual([a, b]);
  });

  it('should build prompt description from registered renderers', () => {
    const registry = new RendererRegistry();
    registry.register({
      type: 'table',
      description: 'Render tabular data',
      schema: z.object({}),
      renderTUI() {
        return 'table';
      },
      renderWeb() {
        return '<table></table>';
      },
    });
    registry.register({
      type: 'chart',
      description: 'Render chart',
      schema: z.object({}),
      renderTUI() {
        return { type: 'browser', html: '<canvas></canvas>' };
      },
      renderWeb() {
        return '<canvas></canvas>';
      },
    });
    const desc = registry.buildPromptDescription();
    expect(desc).toBe(
      'Available view types:\n- "table": Render tabular data\n- "chart": Render chart',
    );
  });

  it('should handle empty registry in buildPromptDescription', () => {
    const registry = new RendererRegistry();
    expect(registry.buildPromptDescription()).toBe('Available view types:\n');
  });
});

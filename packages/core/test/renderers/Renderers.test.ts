import { describe, expect, it } from 'vitest';
import { cardsRenderer } from '../../src/renderers/cards.ts';
import { markdownRenderer } from '../../src/renderers/markdown.ts';
import { tableRenderer } from '../../src/renderers/table.ts';

describe('markdownRenderer', () => {
  it('should render markdown text', () => {
    const result = markdownRenderer.renderWeb({
      type: 'markdown',
      data: { text: 'Hello **world**' },
    });
    expect(result).toContain('Hello');
  });

  it('should escape HTML in markdown', () => {
    const result = markdownRenderer.renderWeb({
      type: 'markdown',
      data: { text: '<script>alert(1)</script>' },
    });
    expect(result).not.toContain('<script>');
    expect(result).toContain('&lt;script&gt;');
  });

  it('should render TUI output', () => {
    const result = markdownRenderer.renderTUI({ type: 'markdown', data: { text: 'Hello' } });
    expect(result).toBe('Hello');
  });
});

describe('tableRenderer', () => {
  const view = {
    type: 'table' as const,
    data: {
      headers: ['Name', 'Value'],
      rows: [
        ['a', '1'],
        ['b', '2'],
      ],
    },
  };

  it('should render web table', () => {
    const html = tableRenderer.renderWeb(view);
    expect(html).toContain('<table>');
    expect(html).toContain('<th>Name</th>');
    expect(html).toContain('<td>a</td>');
  });

  it('should render TUI ASCII table', () => {
    const tui = tableRenderer.renderTUI(view);
    expect(tui).toContain('+');
    expect(tui).toContain('Name');
    expect(tui).toContain('a');
  });
});

describe('cardsRenderer', () => {
  it('should render web cards', () => {
    const html = cardsRenderer.renderWeb({
      type: 'cards',
      data: { items: [{ title: 'Card 1', description: 'Desc', action: 'select:a' }] },
    });
    expect(html).toContain('Card 1');
    expect(html).toContain('data-action="select:a"');
  });

  it('should render TUI cards', () => {
    const tui = cardsRenderer.renderTUI({
      type: 'cards',
      data: { items: [{ title: 'Card 1' }] },
    });
    expect(tui).toContain('Card 1');
  });
});

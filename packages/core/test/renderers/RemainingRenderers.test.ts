import { describe, expect, it } from 'vitest';
import { chartRenderer } from '../../src/renderers/chart.ts';
import { diffRenderer } from '../../src/renderers/diff.ts';
import { flowchartRenderer } from '../../src/renderers/flowchart.ts';
import { rawHtmlRenderer } from '../../src/renderers/raw_html.ts';

describe('diffRenderer', () => {
  const view = {
    type: 'diff' as const,
    data: {
      file: 'src/index.ts',
      hunks: [
        {
          oldStart: 1,
          oldLines: 3,
          newStart: 1,
          newLines: 4,
          content: [' unchanged', '+added line', '-removed line'],
        },
      ],
    },
  };

  it('should render TUI diff with colors', () => {
    const tui = diffRenderer.renderTUI(view);
    expect(tui).toContain('File: src/index.ts');
    expect(tui).toContain('@@');
    expect(tui).toContain('{green-fg}+added line{/}');
    expect(tui).toContain('{red-fg}-removed line{/}');
  });

  it('should render Web diff with HTML', () => {
    const html = diffRenderer.renderWeb(view);
    expect(html).toContain('diff-file');
    expect(html).toContain('src/index.ts');
    expect(html).toContain('diff-hunk');
    expect(html).toContain('diff-line');
  });

  it('should escape HTML in diff content', () => {
    const html = diffRenderer.renderWeb({
      type: 'diff',
      data: {
        file: 'x',
        hunks: [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, content: ['+<script>'] }],
      },
    });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('flowchartRenderer', () => {
  const view = {
    type: 'flowchart' as const,
    data: {
      nodes: [
        { id: 'start', label: 'Start' },
        { id: 'end', label: 'End' },
      ],
      edges: [{ from: 'start', to: 'end', label: 'done' }],
    },
  };

  it('should render TUI flowchart', () => {
    const tui = flowchartRenderer.renderTUI(view);
    expect(tui).toContain('[start] Start');
    expect(tui).toContain('[end] End');
    expect(tui).toContain('start -> end (done)');
  });

  it('should render TUI flowchart without edge labels', () => {
    const tui = flowchartRenderer.renderTUI({
      type: 'flowchart',
      data: {
        nodes: [
          { id: 'a', label: 'A' },
          { id: 'b', label: 'B' },
        ],
        edges: [{ from: 'a', to: 'b' }],
      },
    });
    expect(tui).toContain('a -> b');
    expect(tui).not.toContain('(');
  });

  it('should render Web flowchart with data attributes', () => {
    const html = flowchartRenderer.renderWeb(view);
    expect(html).toContain('flow-node');
    expect(html).toContain('id="node-start"');
    expect(html).toContain('data-edges=');
  });

  it('should escape HTML in node labels', () => {
    const html = flowchartRenderer.renderWeb({
      type: 'flowchart',
      data: { nodes: [{ id: 'x', label: '<b>bold</b>' }], edges: [] },
    });
    expect(html).not.toContain('<b>');
    expect(html).toContain('&lt;b&gt;');
  });
});

describe('chartRenderer', () => {
  const view = {
    type: 'chart' as const,
    data: {
      type: 'bar' as const,
      labels: ['Jan', 'Feb'],
      datasets: [{ label: 'Sales', values: [100, 200] }],
    },
  };

  it('should render TUI chart', () => {
    const tui = chartRenderer.renderTUI(view);
    expect(tui).toContain('[Chart: bar]');
    expect(tui).toContain('Jan: 100');
    expect(tui).toContain('Feb: 200');
  });

  it('should render Web chart with data attributes', () => {
    const html = chartRenderer.renderWeb(view);
    expect(html).toContain('data-type="bar"');
    expect(html).toContain('data-labels=');
    expect(html).toContain('data-datasets=');
  });

  it('should render line chart', () => {
    const html = chartRenderer.renderWeb({
      type: 'chart',
      data: { type: 'line', labels: ['Q1'], datasets: [{ label: 'Growth', values: [15] }] },
    });
    expect(html).toContain('data-type="line"');
  });

  it('should render pie chart', () => {
    const html = chartRenderer.renderWeb({
      type: 'chart',
      data: { type: 'pie', labels: ['A'], datasets: [{ label: 'Share', values: [50] }] },
    });
    expect(html).toContain('data-type="pie"');
  });
});

describe('rawHtmlRenderer', () => {
  it('should render TUI browser hint', () => {
    const result = rawHtmlRenderer.renderTUI({
      type: 'raw_html',
      data: { html: '<h1>Hello</h1>' },
    });
    expect(result).toEqual({ type: 'browser', html: '<h1>Hello</h1>' });
  });

  it('should render Web iframe with srcdoc', () => {
    const html = rawHtmlRenderer.renderWeb({
      type: 'raw_html',
      data: { html: '<h1>Hello</h1>' },
    });
    expect(html).toContain('<iframe');
    expect(html).toContain('srcdoc=');
  });

  it('should escape HTML in srcdoc', () => {
    const html = rawHtmlRenderer.renderWeb({
      type: 'raw_html',
      data: { html: '<script>evil()</script>' },
    });
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
  });
});

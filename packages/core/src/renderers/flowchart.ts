import { z } from 'zod';
import type { ViewRenderer } from '../meta/ViewRenderer.ts';

export const flowchartRenderer: ViewRenderer = {
  type: 'flowchart',
  description:
    'Flowchart with nodes and edges. data: { nodes: { id, label }[], edges: { from, to, label? }[] }',
  schema: z.object({
    nodes: z.array(z.object({ id: z.string(), label: z.string() })),
    edges: z.array(z.object({ from: z.string(), to: z.string(), label: z.string().optional() })),
  }),
  renderTUI(view) {
    const { nodes, edges } = view.data as any;
    const lines: string[] = [];
    for (const node of nodes) {
      lines.push(`  [${node.id}] ${node.label}`);
    }
    lines.push('');
    for (const edge of edges) {
      lines.push(`  ${edge.from} -> ${edge.to}${edge.label ? ` (${edge.label})` : ''}`);
    }
    return lines.join('\n');
  },
  renderWeb(view) {
    const { nodes, edges } = view.data as any;
    const nodeHtml = nodes
      .map((n: any) => `<div class="flow-node" id="node-${n.id}">${htmlEscape(n.label)}</div>`)
      .join('');
    const edgeJs = JSON.stringify(edges);
    return `<div class="flowchart" data-edges='${edgeJs}'>${nodeHtml}</div>`;
  },
};

function htmlEscape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

import { z } from 'zod';
import type { ViewRenderer } from '../meta/ViewRenderer.ts';

export const chartRenderer: ViewRenderer = {
  type: 'chart',
  description: 'Chart (bar/line/pie). data: { type, labels, datasets }',
  schema: z.object({
    type: z.enum(['bar', 'line', 'pie']),
    labels: z.array(z.string()),
    datasets: z.array(z.object({ label: z.string(), values: z.array(z.number()) })),
  }),
  renderTUI(view) {
    const { type, labels, datasets } = view.data as any;
    const lines: string[] = [`[Chart: ${type}]`];
    for (let i = 0; i < labels.length; i++) {
      const vals = datasets.map((d: any) => d.values[i]).join(', ');
      lines.push(`  ${labels[i]}: ${vals}`);
    }
    return lines.join('\n');
  },
  renderWeb(view) {
    const { type, labels, datasets } = view.data as any;
    return `<div class="chart" data-type="${type}" data-labels='${JSON.stringify(labels)}' data-datasets='${JSON.stringify(datasets)}'></div>`;
  },
};

import { z } from 'zod';
import type { ViewRenderer } from '../meta/ViewRenderer.ts';

export const tableRenderer: ViewRenderer = {
  type: 'table',
  description: 'Table with headers and rows. data: { headers: string[], rows: string[][] }',
  schema: z.object({
    headers: z.array(z.string()),
    rows: z.array(z.array(z.string())),
  }),
  renderTUI(view) {
    const { headers, rows } = view.data as { headers: string[]; rows: string[][] };
    const lines: string[] = [];
    const colWidths = headers.map((h, i) =>
      Math.max(h.length, ...rows.map((r) => (r[i] || '').length)),
    );
    const sep = `+${colWidths.map((w) => '-'.repeat(w + 2)).join('+')}+`;
    const renderRow = (row: string[]) =>
      `| ${row.map((c, i) => (c || '').padEnd(colWidths[i])).join(' | ')} |`;

    lines.push(sep);
    lines.push(renderRow(headers));
    lines.push(sep);
    for (const row of rows) lines.push(renderRow(row));
    lines.push(sep);
    return lines.join('\n');
  },
  renderWeb(view) {
    const { headers, rows } = view.data as { headers: string[]; rows: string[][] };
    const thead = headers.map((h) => `<th>${htmlEscape(h)}</th>`).join('');
    const trows = rows
      .map((r) => `<tr>${r.map((c) => `<td>${htmlEscape(c)}</td>`).join('')}</tr>`)
      .join('');
    return `<table><thead><tr>${thead}</tr></thead><tbody>${trows}</tbody></table>`;
  },
};

function htmlEscape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

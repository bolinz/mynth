import { z } from 'zod';
import type { ViewRenderer } from '../meta/ViewRenderer.ts';

export const diffRenderer: ViewRenderer = {
  type: 'diff',
  description: 'Code diff with hunks. data: { file: string, hunks: { oldStart, oldLines, newStart, newLines, content }[] }',
  schema: z.object({
    file: z.string(),
    hunks: z.array(z.object({
      oldStart: z.number(),
      oldLines: z.number(),
      newStart: z.number(),
      newLines: z.number(),
      content: z.array(z.string()),
    })),
  }),
  renderTUI(view) {
    const { file, hunks } = view.data as { file: string; hunks: any[] };
    const lines: string[] = [`File: ${file}`];
    for (const hunk of hunks) {
      lines.push(`@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`);
      for (const line of hunk.content) {
        if (line.startsWith('+')) lines.push(`{green-fg}${line}{/}`);
        else if (line.startsWith('-')) lines.push(`{red-fg}${line}{/}`);
        else lines.push(line);
      }
    }
    return lines.join('\n');
  },
  renderWeb(view) {
    const { file, hunks } = view.data as { file: string; hunks: any[] };
    let html = `<div class="diff"><div class="diff-file">${escape(file)}</div>`;
    for (const hunk of hunks) {
      html += `<div class="diff-hunk">@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@</div>`;
      for (const line of hunk.content) {
        const cls = line.startsWith('+') ? 'add' : line.startsWith('-') ? 'del' : '';
        html += `<div class="diff-line ${cls}"><pre>${escape(line)}</pre></div>`;
      }
    }
    html += '</div>';
    return html;
  },
};

function escape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

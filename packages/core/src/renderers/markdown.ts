import { z } from 'zod';
import type { ViewRenderer } from '../meta/ViewRenderer.ts';

export const markdownRenderer: ViewRenderer = {
  type: 'markdown',
  description: 'Markdown formatted text. data: { text: string }',
  schema: z.object({ text: z.string() }),
  renderTUI(view) {
    return (view.data as { text: string }).text;
  },
  renderWeb(view) {
    const { text } = view.data as { text: string };
    return `<div class="markdown">${escapeHtml(text)}</div>`;
  },
};

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

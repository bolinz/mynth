import { z } from 'zod';
import type { ViewRenderer } from '../meta/ViewRenderer.ts';

export const rawHtmlRenderer: ViewRenderer = {
  type: 'raw_html',
  description: 'Raw HTML content (sanitized). data: { html: string }',
  schema: z.object({ html: z.string() }),
  renderTUI(view) {
    return { type: 'browser' as const, html: (view.data as { html: string }).html };
  },
  renderWeb(view) {
    const html = (view.data as { html: string }).html;
    return `<iframe sandbox="allow-same-origin" srcdoc="${htmlEscape(html)}"></iframe>`;
  },
};

function htmlEscape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

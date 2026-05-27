import { z } from 'zod';
import type { ViewRenderer } from '../meta/ViewRenderer.ts';

export const cardsRenderer: ViewRenderer = {
  type: 'cards',
  description: 'Cards list. data: { items: { title, description?, action? }[] }',
  schema: z.object({
    items: z.array(
      z.object({
        title: z.string(),
        description: z.string().optional(),
        action: z.string().optional(),
      }),
    ),
  }),
  renderTUI(view) {
    const { items } = view.data as any;
    return items
      .map(
        (item: any) =>
          `  ${item.title}${item.description ? ': ' + item.description : ''}${item.action ? ` [${item.action}]` : ''}`,
      )
      .join('\n');
  },
  renderWeb(view) {
    const { items } = view.data as any;
    const cards = items
      .map((item: any) => {
        const actionAttr = item.action ? ` data-action="${item.action}"` : '';
        return `<div class="card"${actionAttr}><h4>${htmlEscape(item.title)}</h4>${item.description ? `<p>${htmlEscape(item.description)}</p>` : ''}</div>`;
      })
      .join('');
    return `<div class="cards">${cards}</div>`;
  },
};

function htmlEscape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

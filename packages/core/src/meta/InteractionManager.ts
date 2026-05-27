import type { Interaction, InteractionResponse } from './ViewRenderer.ts';

export class InteractionManager {
  private pending = new Map<string, Interaction>();
  private handlers: Array<(response: InteractionResponse) => void> = [];

  submit(interaction: Interaction): void {
    this.pending.set(interaction.id, interaction);
  }

  respond(id: string, value: unknown): InteractionResponse | null {
    const interaction = this.pending.get(id);
    if (!interaction) return null;
    this.pending.delete(id);
    const response: InteractionResponse = { interactionId: id, value };
    for (const handler of this.handlers) {
      handler(response);
    }
    return response;
  }

  getPending(agentId?: string): Interaction[] {
    const all = Array.from(this.pending.values());
    return agentId ? all.filter((i) => i.agentId === agentId) : all;
  }

  getPendingCount(): number {
    return this.pending.size;
  }

  onResponse(handler: (response: InteractionResponse) => void): void {
    this.handlers.push(handler);
  }
}

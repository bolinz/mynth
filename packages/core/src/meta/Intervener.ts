export type InterventionAction =
  | { type: 'warn'; message: string }
  | { type: 'pause'; reason: string }
  | { type: 'replace'; oldAgent: string; newAgent: string }
  | { type: 'rollback'; checkpoint: string }
  | { type: 'reroute'; newStart: string }
  | { type: 'terminate'; reason: string };

export interface AnomalyEvent {
  type: string;
  agentId?: string;
  threshold?: number;
  current?: number;
  agents?: string[];
}

export class Intervener {
  decide(anomaly: AnomalyEvent): InterventionAction {
    switch (anomaly.type) {
      case 'hop_count_exceeded':
        return {
          type: 'terminate',
          reason: `Hop count ${anomaly.current} exceeded threshold ${anomaly.threshold}`,
        };
      case 'duration_exceeded':
        return { type: 'pause', reason: `Duration exceeded ${anomaly.threshold}` };
      case 'agent_error':
        return { type: 'replace', oldAgent: anomaly.agentId ?? '', newAgent: '' };
      case 'cycle_pattern':
        return { type: 'reroute', newStart: '' };
      case 'security_violation':
        return { type: 'terminate', reason: 'Security violation detected' };
      default:
        return { type: 'warn', message: `Unknown anomaly: ${anomaly.type}` };
    }
  }
}

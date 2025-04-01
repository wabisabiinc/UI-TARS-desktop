export interface AgentContext {
  plan: Array<{
    id: string;
    title: string;
  }>;
  currentStep: number;
  memory: Map<string, any>;
  agentId: string;
  requestId: string;
}

export interface AgentEvent {
  agentId: string;
  timestamp: number;
  [key: string]: any;
}

export interface AgentStartOptions {
  inputText: string;
}

export interface AgentStartResult {
  agentId: string;
}

export interface AgentStopOptions {
  agentId: string;
}

export interface AgentInterruptOptions {
  agentId: string;
  text: string;
}

export interface AgentGetEventsOptions {
  agentId: string;
}

export interface AgentGetEventsResult {
  events: any[];
}

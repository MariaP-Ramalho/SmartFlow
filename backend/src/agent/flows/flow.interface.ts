export interface FlowNode {
  id: string;
  type: 'question' | 'action' | 'decision' | 'end';
  content: string;
  options?: FlowOption[];
  next?: string;
  metadata?: Record<string, any>;
}

export interface FlowOption {
  label: string;
  value: string;
  nextNodeId: string;
  condition?: string;
}

export interface FlowTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  nodes: FlowNode[];
  startNodeId: string;
}

export interface FlowState {
  templateId: string;
  currentNodeId: string;
  collectedData: Record<string, any>;
  history: FlowHistoryEntry[];
  status: 'in_progress' | 'completed' | 'abandoned';
}

export interface FlowHistoryEntry {
  nodeId: string;
  response?: string;
  timestamp: Date;
}

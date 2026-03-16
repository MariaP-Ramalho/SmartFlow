export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, any>;
}

export interface ToolResult {
  success: boolean;
  data?: any;
  error?: string;
}

export interface AgentTool {
  readonly definition: ToolDefinition;
  execute(args: Record<string, any>, context: AgentContext): Promise<ToolResult>;
}

export interface AgentContext {
  caseId: string;
  ticketId?: string;
  conversationHistory: any[];
  metadata?: Record<string, any>;
}

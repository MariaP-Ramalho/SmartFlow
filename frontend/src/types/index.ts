export type TicketStatus =
  | "new"
  | "triaged"
  | "in_progress"
  | "waiting_customer"
  | "waiting_approval"
  | "resolved"
  | "closed"
  | "escalated";

export type TicketPriority = "low" | "medium" | "high" | "urgent";

export type RiskLevel = "low" | "medium" | "high" | "critical";

export type ApprovalStatus = "pending" | "approved" | "rejected" | "expired";

export type KnowledgeSource =
  | "manual"
  | "confluence"
  | "notion"
  | "web_crawl"
  | "pdf_upload";

export type AuditAction =
  | "ticket_received"
  | "triage_completed"
  | "knowledge_search"
  | "diagnosis_generated"
  | "resolution_proposed"
  | "approval_requested"
  | "approval_resolved"
  | "response_sent"
  | "ticket_resolved"
  | "ticket_escalated"
  | "policy_triggered";

export type PolicyTrigger =
  | "refund"
  | "replacement"
  | "discount"
  | "warranty_extension"
  | "escalation"
  | "account_credit";

export interface Customer {
  id: string;
  name: string;
  email: string;
  phone?: string;
  company?: string;
  tier?: string;
}

export interface Product {
  id: string;
  name: string;
  sku: string;
  category: string;
  price?: number;
}

export interface Warranty {
  id: string;
  productId: string;
  startDate: string;
  endDate: string;
  type: string;
  active: boolean;
}

export interface AgentAction {
  action: string;
  timestamp: string;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  durationMs?: number;
  status: "success" | "failure" | "skipped";
}

export interface DiagnosticData {
  symptoms: string[];
  possibleCauses: string[];
  confidence: number;
  suggestedResolution: string;
  knowledgeRefs: string[];
}

export interface Ticket {
  id: string;
  clickupId: string;
  title: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  category: string;
  tags: string[];
  customer: Customer;
  product?: Product;
  warranty?: Warranty;
  diagnosticData?: DiagnosticData;
  resolution?: string;
  agentActions: AgentAction[];
  slaDeadline?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuditLog {
  id: string;
  caseId: string;
  action: AuditAction;
  actor: string;
  details: string;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  durationMs?: number;
  timestamp: string;
}

export interface PolicyCondition {
  field: string;
  operator: "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "in" | "contains";
  value: string | number | boolean | string[];
}

export interface Policy {
  id: string;
  name: string;
  trigger: PolicyTrigger;
  conditions: PolicyCondition[];
  riskLevel: RiskLevel;
  requiresApproval: boolean;
  approvers: string[];
  maxAutoAmount: number;
  active: boolean;
}

export interface KnowledgeDocument {
  id: string;
  title: string;
  content: string;
  category: string;
  tags: string[];
  source: KnowledgeSource;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface Approval {
  id: string;
  policyId: string;
  caseId: string;
  ticketId: string;
  action: string;
  context: Record<string, unknown>;
  status: ApprovalStatus;
  requestedAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
}

export interface MetricsSummary {
  totalCases: number;
  resolvedWithoutHuman: number;
  avgResolutionTimeMs: number;
  backlogCount: number;
  period: {
    start: string;
    end: string;
  };
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  error?: string;
  meta?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

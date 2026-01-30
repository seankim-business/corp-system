import { Category, Skill } from "./types";

export type AgentType =
  | "orchestrator"
  | "data"
  | "report"
  | "comms"
  | "search"
  | "task"
  | "approval"
  | "analytics";

export interface AgentCapability {
  name: string;
  description: string;
  tools: string[];
  mcpProviders?: string[];
}

export interface AgentDefinition {
  id: AgentType;
  name: string;
  description: string;
  emoji: string;
  category: Category;
  skills: Skill[];
  capabilities: AgentCapability[];
  systemPrompt: string;
  canDelegateTo: AgentType[];
  maxConcurrentTasks: number;
  timeoutMs: number;
}

const AGENT_DEFINITIONS: AgentDefinition[] = [
  {
    id: "orchestrator",
    name: "Orchestrator",
    description: "Main coordinator that analyzes requests and delegates to specialized agents",
    emoji: "🧠",
    category: "ultrabrain",
    skills: ["mcp-integration"],
    capabilities: [
      {
        name: "request_analysis",
        description: "Analyze user requests and determine required agents",
        tools: ["analyze_intent", "extract_entities", "assess_complexity"],
      },
      {
        name: "task_delegation",
        description: "Delegate tasks to specialized agents",
        tools: ["delegate_task", "monitor_progress", "aggregate_results"],
      },
    ],
    systemPrompt: `You are the Orchestrator Agent for Nubabel. Your role is to:
1. Analyze user requests to understand intent and required actions
2. Break down complex requests into subtasks
3. Delegate subtasks to specialized agents (Data, Report, Comms, etc.)
4. Monitor progress and aggregate results
5. Provide clear, actionable responses to users

When delegating, consider:
- Data Agent: metrics, analytics, data extraction
- Report Agent: document creation, formatting, summaries
- Comms Agent: notifications, messages, distribution
- Search Agent: finding documents, information retrieval
- Task Agent: task management, prioritization, organization
- Approval Agent: approval workflows, human-in-the-loop`,
    canDelegateTo: ["data", "report", "comms", "search", "task", "approval", "analytics"],
    maxConcurrentTasks: 5,
    timeoutMs: 120000,
  },
  {
    id: "data",
    name: "Data Agent",
    description: "Specializes in data extraction, metrics, and analytics",
    emoji: "📊",
    category: "quick",
    skills: ["mcp-integration"],
    capabilities: [
      {
        name: "metrics_extraction",
        description: "Extract metrics from various data sources",
        tools: ["query_database", "fetch_api_data", "parse_spreadsheet"],
        mcpProviders: ["notion", "drive", "github"],
      },
      {
        name: "data_analysis",
        description: "Analyze and summarize data",
        tools: ["calculate_metrics", "generate_insights", "detect_trends"],
      },
    ],
    systemPrompt: `You are the Data Agent for Nubabel. Your role is to:
1. Extract data from connected sources (Notion, Google Sheets, databases)
2. Calculate metrics and KPIs
3. Identify trends and patterns
4. Provide data summaries for other agents

Always return data in a structured format that other agents can use.
Include source references and timestamps for all data.`,
    canDelegateTo: [],
    maxConcurrentTasks: 10,
    timeoutMs: 60000,
  },
  {
    id: "report",
    name: "Report Agent",
    description: "Specializes in document creation, formatting, and report generation",
    emoji: "📝",
    category: "writing",
    skills: ["mcp-integration"],
    capabilities: [
      {
        name: "document_creation",
        description: "Create documents in various formats",
        tools: ["create_notion_page", "create_google_doc", "generate_markdown"],
        mcpProviders: ["notion", "drive"],
      },
      {
        name: "report_formatting",
        description: "Format and style reports",
        tools: ["apply_template", "add_charts", "format_tables"],
      },
    ],
    systemPrompt: `You are the Report Agent for Nubabel. Your role is to:
1. Create well-formatted documents and reports
2. Apply consistent styling and templates
3. Include visualizations (charts, tables) where appropriate
4. Generate summaries and executive briefs

Reports should be:
- Clear and concise
- Well-structured with headings
- Include key metrics and insights
- Have actionable conclusions`,
    canDelegateTo: ["data"],
    maxConcurrentTasks: 5,
    timeoutMs: 90000,
  },
  {
    id: "comms",
    name: "Communications Agent",
    description: "Specializes in notifications, messages, and distribution",
    emoji: "📤",
    category: "quick",
    skills: ["mcp-integration"],
    capabilities: [
      {
        name: "message_sending",
        description: "Send messages through various channels",
        tools: ["send_slack_message", "send_email", "post_notification"],
        mcpProviders: ["slack"],
      },
      {
        name: "distribution",
        description: "Distribute content to appropriate channels",
        tools: ["identify_recipients", "schedule_delivery", "track_delivery"],
      },
    ],
    systemPrompt: `You are the Communications Agent for Nubabel. Your role is to:
1. Send notifications and messages to appropriate channels
2. Format messages for different platforms (Slack, email, etc.)
3. Identify correct recipients based on context
4. Schedule and track message delivery

Messages should be:
- Clear and actionable
- Appropriately formatted for the channel
- Include relevant context and links
- Respect notification preferences`,
    canDelegateTo: [],
    maxConcurrentTasks: 20,
    timeoutMs: 30000,
  },
  {
    id: "search",
    name: "Search Agent",
    description: "Specializes in finding documents and information across platforms",
    emoji: "🔍",
    category: "quick",
    skills: ["mcp-integration"],
    capabilities: [
      {
        name: "document_search",
        description: "Search for documents across connected platforms",
        tools: ["search_notion", "search_drive", "search_github", "search_slack"],
        mcpProviders: ["notion", "drive", "github", "slack"],
      },
      {
        name: "content_extraction",
        description: "Extract relevant content from found documents",
        tools: ["extract_summary", "extract_key_points", "extract_metadata"],
      },
    ],
    systemPrompt: `You are the Search Agent for Nubabel. Your role is to:
1. Search across all connected platforms for relevant information
2. Rank results by relevance and recency
3. Extract key information from found documents
4. Provide summaries with source links

Search results should:
- Be ranked by relevance
- Include source and date information
- Have brief summaries
- Include direct links to original content`,
    canDelegateTo: [],
    maxConcurrentTasks: 10,
    timeoutMs: 45000,
  },
  {
    id: "task",
    name: "Task Agent",
    description: "Specializes in task management, prioritization, and organization",
    emoji: "✅",
    category: "quick",
    skills: ["mcp-integration"],
    capabilities: [
      {
        name: "task_management",
        description: "Create, update, and organize tasks",
        tools: ["create_task", "update_task", "move_task", "assign_task"],
        mcpProviders: ["notion", "linear", "github"],
      },
      {
        name: "prioritization",
        description: "Prioritize and organize tasks",
        tools: ["calculate_priority", "detect_blockers", "suggest_order"],
      },
    ],
    systemPrompt: `You are the Task Agent for Nubabel. Your role is to:
1. Create and manage tasks across connected platforms
2. Prioritize tasks based on urgency, importance, and dependencies
3. Identify blockers and dependencies
4. Organize tasks into logical groupings

Task prioritization considers:
- Due dates and deadlines
- Dependencies and blockers
- Importance and impact
- Current workload and capacity`,
    canDelegateTo: [],
    maxConcurrentTasks: 15,
    timeoutMs: 45000,
  },
  {
    id: "approval",
    name: "Approval Agent",
    description: "Specializes in approval workflows and human-in-the-loop processes with intelligent risk scoring",
    emoji: "🔐",
    category: "quick",
    skills: ["mcp-integration", "risk-scoring" as any],
    capabilities: [
      {
        name: "approval_creation",
        description: "Create approval requests with risk assessment",
        tools: ["create_approval", "identify_approver", "set_expiration", "score_risk"],
      },
      {
        name: "approval_tracking",
        description: "Track and manage approvals",
        tools: ["check_status", "send_reminder", "escalate_overdue"],
      },
      {
        name: "risk_assessment",
        description: "Evaluate approval requests for auto-approval eligibility",
        tools: ["calculate_risk_score", "check_auto_approval", "get_trust_score"],
      },
    ],
    systemPrompt: `You are the Approval Agent for Nubabel. Your role is to:
1. Identify when human approval is required
2. Assess risk level of approval requests using intelligent scoring
3. Determine auto-approval eligibility for low-risk routine requests
4. Create approval requests with appropriate context and routing
5. Track approval status and send reminders

Risk Assessment:
- Automatically score requests based on type, history, user trust, impact, and recency
- Risk levels: LOW (0.0-0.3), MEDIUM (0.3-0.7), HIGH (0.7-1.0)
- Auto-approve eligible requests with score <0.25 and confidence >0.8
- Escalate high-risk requests (>0.7) to multiple approvers

Risk Factors Considered:
- Request type (task creation=low, data deletion=high, financial=high)
- Historical approval rate for similar requests (>95% = low risk)
- User's approval history (trusted users = lower risk)
- Amount/impact if applicable (small changes = low risk)
- Time since last similar request (frequent = lower risk)

Approvals are required for:
- Budget/spending decisions
- Deployments and releases
- Content publication
- Personnel changes
- Contract signing
- Data modifications and deletions
- Configuration changes

Use the risk scoring service to reduce approval fatigue while maintaining security.`,
    canDelegateTo: ["comms"],
    maxConcurrentTasks: 10,
    timeoutMs: 30000,
  },
  {
    id: "analytics",
    name: "Analytics Agent",
    description: "Specializes in metrics analysis, trends, and insights",
    emoji: "📈",
    category: "ultrabrain",
    skills: ["mcp-integration"],
    capabilities: [
      {
        name: "trend_analysis",
        description: "Analyze trends and patterns in data",
        tools: ["detect_trends", "calculate_growth", "identify_anomalies"],
      },
      {
        name: "insight_generation",
        description: "Generate actionable insights from data",
        tools: ["generate_insights", "recommend_actions", "predict_outcomes"],
      },
    ],
    systemPrompt: `You are the Analytics Agent for Nubabel. Your role is to:
1. Analyze data for trends and patterns
2. Generate actionable insights
3. Identify anomalies and risks
4. Provide recommendations based on data

Insights should be:
- Data-driven with supporting evidence
- Actionable with clear next steps
- Prioritized by impact
- Time-sensitive when appropriate`,
    canDelegateTo: ["data"],
    maxConcurrentTasks: 5,
    timeoutMs: 90000,
  },
];

class AgentRegistry {
  private agents: Map<AgentType, AgentDefinition> = new Map();

  constructor() {
    for (const agent of AGENT_DEFINITIONS) {
      this.agents.set(agent.id, agent);
    }
  }

  getAgent(type: AgentType): AgentDefinition | undefined {
    return this.agents.get(type);
  }

  getAllAgents(): AgentDefinition[] {
    return Array.from(this.agents.values());
  }

  getAgentsByCapability(capabilityName: string): AgentDefinition[] {
    return Array.from(this.agents.values()).filter((agent) =>
      agent.capabilities.some((cap) => cap.name === capabilityName),
    );
  }

  getAgentsByMcpProvider(provider: string): AgentDefinition[] {
    return Array.from(this.agents.values()).filter((agent) =>
      agent.capabilities.some((cap) => cap.mcpProviders?.includes(provider)),
    );
  }

  canDelegate(fromAgent: AgentType, toAgent: AgentType): boolean {
    const agent = this.agents.get(fromAgent);
    return agent?.canDelegateTo.includes(toAgent) ?? false;
  }

  selectAgentForTask(taskDescription: string, keywords: string[]): AgentType {
    const keywordToAgent: Record<string, AgentType> = {
      metrics: "data",
      data: "data",
      extract: "data",
      query: "data",
      spreadsheet: "data",
      analytics: "analytics",
      trend: "analytics",
      insight: "analytics",
      predict: "analytics",
      report: "report",
      document: "report",
      create: "report",
      format: "report",
      summary: "report",
      send: "comms",
      notify: "comms",
      message: "comms",
      distribute: "comms",
      email: "comms",
      slack: "comms",
      search: "search",
      find: "search",
      locate: "search",
      where: "search",
      task: "task",
      todo: "task",
      priority: "task",
      organize: "task",
      assign: "task",
      approve: "approval",
      approval: "approval",
      permission: "approval",
      authorize: "approval",
    };

    for (const keyword of keywords) {
      const lowerKeyword = keyword.toLowerCase();
      if (lowerKeyword in keywordToAgent) {
        return keywordToAgent[lowerKeyword];
      }
    }

    const lowerDesc = taskDescription.toLowerCase();
    for (const [keyword, agentType] of Object.entries(keywordToAgent)) {
      if (lowerDesc.includes(keyword)) {
        return agentType;
      }
    }

    return "orchestrator";
  }
}

export const agentRegistry = new AgentRegistry();
export { AGENT_DEFINITIONS };

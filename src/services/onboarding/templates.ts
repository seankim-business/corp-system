import { Prisma } from "@prisma/client";
import { db as prisma } from "../../db/client";
import { logger } from "../../utils/logger";

export interface AgentTemplate {
  id: string;
  name: string;
  role: string;
  skills: string[];
  enabled: boolean;
  description?: string;
}

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  config: Record<string, unknown>;
  sopEnabled?: boolean;
}

export interface SOPTemplate {
  id: string;
  name: string;
  description: string;
  steps: Array<{
    name: string;
    description: string;
    action: string;
  }>;
}

export interface OnboardingTemplate {
  id: string;
  name: string;
  nameKo: string;
  industry: string;
  description: string;
  descriptionKo: string;
  icon: string;

  // Pre-configured components
  agents: AgentTemplate[];
  workflows: WorkflowTemplate[];
  sops: SOPTemplate[];

  // Customization options
  customizationOptions: {
    agentsOptional: string[]; // Can be disabled
    additionalAgents: string[]; // Can be added
  };
}

export interface TemplatePreview {
  template: OnboardingTemplate;
  willCreate: {
    agents: number;
    workflows: number;
    sops: number;
  };
  estimatedSetupTime: string;
}

// Industry templates
export const ONBOARDING_TEMPLATES: OnboardingTemplate[] = [
  {
    id: "tech-startup",
    name: "Tech Startup",
    nameKo: "테크 스타트업",
    industry: "technology",
    description: "Template for software development teams with agile workflows",
    descriptionKo: "소프트웨어 개발팀을 위한 애자일 워크플로우 템플릿",
    icon: "🚀",
    agents: [
      {
        id: "product-agent",
        name: "Product Agent",
        role: "Product Manager AI - handles PRDs, roadmaps, and feature prioritization",
        skills: ["product-management", "roadmap-planning", "user-research"],
        enabled: true,
        description: "Manages product backlog and user stories",
      },
      {
        id: "engineering-agent",
        name: "Engineering Agent",
        role: "Tech Lead AI - code reviews, architecture decisions, technical docs",
        skills: ["code-review", "architecture", "documentation"],
        enabled: true,
        description: "Assists with technical decisions and reviews",
      },
      {
        id: "qa-agent",
        name: "QA Agent",
        role: "Quality Assurance AI - test planning, bug tracking, regression testing",
        skills: ["test-planning", "bug-tracking", "automation"],
        enabled: true,
        description: "Manages testing and quality processes",
      },
      {
        id: "devops-agent",
        name: "DevOps Agent",
        role: "DevOps AI - CI/CD, deployments, infrastructure monitoring",
        skills: ["ci-cd", "deployment", "monitoring"],
        enabled: false,
        description: "Handles deployment and infrastructure",
      },
    ],
    workflows: [
      {
        id: "sprint-planning",
        name: "Sprint Planning",
        description: "Automated sprint planning with story point estimation",
        config: { sprintLength: 14, estimationMethod: "fibonacci" },
      },
      {
        id: "release-process",
        name: "Release Process",
        description: "Automated release checklist and deployment",
        config: { stages: ["staging", "production"], requiresApproval: true },
      },
      {
        id: "daily-standup",
        name: "Daily Standup",
        description: "Automated standup summary collection",
        config: { time: "09:00", timezone: "Asia/Seoul" },
      },
    ],
    sops: [
      {
        id: "bug-triage",
        name: "Bug Triage",
        description: "Standard process for bug prioritization",
        steps: [
          { name: "Classify", description: "Classify bug severity", action: "classify" },
          { name: "Assign", description: "Assign to team member", action: "assign" },
          { name: "Notify", description: "Notify stakeholders", action: "notify" },
        ],
      },
    ],
    customizationOptions: {
      agentsOptional: ["qa-agent", "devops-agent"],
      additionalAgents: ["design-agent", "data-agent"],
    },
  },
  {
    id: "agency",
    name: "Creative Agency",
    nameKo: "에이전시",
    industry: "agency",
    description: "Template for marketing and design agencies with client workflows",
    descriptionKo: "마케팅/디자인 에이전시를 위한 클라이언트 워크플로우 템플릿",
    icon: "🎨",
    agents: [
      {
        id: "account-agent",
        name: "Account Agent",
        role: "Account Manager AI - client communication, project tracking",
        skills: ["client-management", "project-tracking", "reporting"],
        enabled: true,
        description: "Manages client relationships and communications",
      },
      {
        id: "creative-agent",
        name: "Creative Agent",
        role: "Creative Director AI - brand guidelines, creative briefs, design feedback",
        skills: ["brand-management", "creative-direction", "feedback"],
        enabled: true,
        description: "Oversees creative work and brand consistency",
      },
      {
        id: "content-agent",
        name: "Content Agent",
        role: "Content Manager AI - content calendar, copywriting, SEO",
        skills: ["content-planning", "copywriting", "seo"],
        enabled: true,
        description: "Manages content creation and publishing",
      },
      {
        id: "analytics-agent",
        name: "Analytics Agent",
        role: "Analytics AI - campaign performance, reporting, insights",
        skills: ["analytics", "reporting", "optimization"],
        enabled: false,
        description: "Tracks and reports campaign performance",
      },
    ],
    workflows: [
      {
        id: "client-onboarding",
        name: "Client Onboarding",
        description: "New client setup and kickoff process",
        config: { phases: ["discovery", "planning", "kickoff"] },
      },
      {
        id: "campaign-launch",
        name: "Campaign Launch",
        description: "Campaign launch checklist and approvals",
        config: { requiresClientApproval: true },
      },
      {
        id: "monthly-report",
        name: "Monthly Report",
        description: "Automated monthly performance reports",
        config: { dueDay: 5 },
      },
    ],
    sops: [
      {
        id: "creative-review",
        name: "Creative Review",
        description: "Standard creative review process",
        steps: [
          { name: "Internal Review", description: "Team reviews creative", action: "review" },
          { name: "Client Review", description: "Send to client for approval", action: "approve" },
          { name: "Revisions", description: "Implement feedback", action: "revise" },
        ],
      },
    ],
    customizationOptions: {
      agentsOptional: ["analytics-agent"],
      additionalAgents: ["social-agent", "media-agent"],
    },
  },
  {
    id: "ecommerce",
    name: "E-Commerce",
    nameKo: "이커머스",
    industry: "retail",
    description: "Template for online retail businesses with inventory and fulfillment",
    descriptionKo: "온라인 쇼핑몰을 위한 재고/주문 관리 템플릿",
    icon: "🛒",
    agents: [
      {
        id: "inventory-agent",
        name: "Inventory Agent",
        role: "Inventory Manager AI - stock levels, reordering, supplier coordination",
        skills: ["inventory-management", "forecasting", "supplier-relations"],
        enabled: true,
        description: "Manages inventory and stock levels",
      },
      {
        id: "cs-agent",
        name: "Customer Service Agent",
        role: "CS AI - customer inquiries, returns, support tickets",
        skills: ["customer-support", "ticket-management", "returns"],
        enabled: true,
        description: "Handles customer service requests",
      },
      {
        id: "marketing-agent",
        name: "Marketing Agent",
        role: "E-commerce Marketing AI - promotions, email campaigns, ads",
        skills: ["promotions", "email-marketing", "advertising"],
        enabled: true,
        description: "Manages marketing campaigns",
      },
      {
        id: "fulfillment-agent",
        name: "Fulfillment Agent",
        role: "Fulfillment AI - order processing, shipping, tracking",
        skills: ["order-processing", "shipping", "logistics"],
        enabled: false,
        description: "Manages order fulfillment",
      },
    ],
    workflows: [
      {
        id: "order-processing",
        name: "Order Processing",
        description: "Automated order fulfillment workflow",
        config: { autoFulfill: true, trackingNotifications: true },
      },
      {
        id: "inventory-alert",
        name: "Inventory Alert",
        description: "Low stock alerts and reorder automation",
        config: { threshold: 10, autoReorder: false },
      },
      {
        id: "customer-feedback",
        name: "Customer Feedback",
        description: "Post-purchase feedback collection",
        config: { delayDays: 7 },
      },
    ],
    sops: [
      {
        id: "return-process",
        name: "Return Process",
        description: "Standard return and refund process",
        steps: [
          { name: "Receive Request", description: "Log return request", action: "log" },
          { name: "Verify", description: "Verify eligibility", action: "verify" },
          { name: "Process", description: "Process return/refund", action: "process" },
        ],
      },
    ],
    customizationOptions: {
      agentsOptional: ["fulfillment-agent", "marketing-agent"],
      additionalAgents: ["analytics-agent", "review-agent"],
    },
  },
  {
    id: "manufacturing",
    name: "Manufacturing",
    nameKo: "제조업",
    industry: "manufacturing",
    description: "Template for manufacturing companies with production workflows",
    descriptionKo: "제조/생산 기업을 위한 생산 관리 템플릿",
    icon: "🏭",
    agents: [
      {
        id: "production-agent",
        name: "Production Agent",
        role: "Production Manager AI - scheduling, capacity planning, efficiency",
        skills: ["production-planning", "scheduling", "optimization"],
        enabled: true,
        description: "Manages production schedules and capacity",
      },
      {
        id: "quality-agent",
        name: "Quality Agent",
        role: "Quality Control AI - inspections, compliance, defect tracking",
        skills: ["quality-control", "inspection", "compliance"],
        enabled: true,
        description: "Handles quality assurance and compliance",
      },
      {
        id: "supply-agent",
        name: "Supply Chain Agent",
        role: "Supply Chain AI - procurement, vendor management, logistics",
        skills: ["procurement", "vendor-management", "logistics"],
        enabled: true,
        description: "Manages supply chain operations",
      },
      {
        id: "maintenance-agent",
        name: "Maintenance Agent",
        role: "Maintenance AI - equipment maintenance, preventive scheduling",
        skills: ["maintenance", "equipment-tracking", "scheduling"],
        enabled: false,
        description: "Manages equipment maintenance",
      },
    ],
    workflows: [
      {
        id: "production-schedule",
        name: "Production Schedule",
        description: "Weekly production planning and scheduling",
        config: { planningHorizon: 7 },
      },
      {
        id: "quality-inspection",
        name: "Quality Inspection",
        description: "Automated quality check workflow",
        config: { inspectionPoints: ["incoming", "in-process", "final"] },
      },
      {
        id: "maintenance-schedule",
        name: "Maintenance Schedule",
        description: "Preventive maintenance scheduling",
        config: { frequency: "weekly" },
      },
    ],
    sops: [
      {
        id: "defect-handling",
        name: "Defect Handling",
        description: "Standard defect identification and resolution",
        steps: [
          { name: "Identify", description: "Identify and log defect", action: "log" },
          { name: "Analyze", description: "Root cause analysis", action: "analyze" },
          { name: "Correct", description: "Implement correction", action: "correct" },
        ],
      },
    ],
    customizationOptions: {
      agentsOptional: ["maintenance-agent"],
      additionalAgents: ["safety-agent", "hr-agent"],
    },
  },
  {
    id: "consulting",
    name: "Consulting Firm",
    nameKo: "컨설팅",
    industry: "professional-services",
    description: "Template for consulting firms with project and client management",
    descriptionKo: "컨설팅 기업을 위한 프로젝트/클라이언트 관리 템플릿",
    icon: "💼",
    agents: [
      {
        id: "engagement-agent",
        name: "Engagement Agent",
        role: "Engagement Manager AI - project tracking, deliverables, timelines",
        skills: ["project-management", "deliverable-tracking", "client-reporting"],
        enabled: true,
        description: "Manages consulting engagements",
      },
      {
        id: "research-agent",
        name: "Research Agent",
        role: "Research AI - market research, competitive analysis, data gathering",
        skills: ["research", "analysis", "data-gathering"],
        enabled: true,
        description: "Conducts research and analysis",
      },
      {
        id: "knowledge-agent",
        name: "Knowledge Agent",
        role: "Knowledge Management AI - best practices, templates, frameworks",
        skills: ["knowledge-management", "templates", "best-practices"],
        enabled: true,
        description: "Manages firm knowledge base",
      },
    ],
    workflows: [
      {
        id: "engagement-kickoff",
        name: "Engagement Kickoff",
        description: "New engagement setup and team assignment",
        config: { phases: ["scoping", "planning", "kickoff"] },
      },
      {
        id: "weekly-status",
        name: "Weekly Status",
        description: "Automated weekly status reports",
        config: { day: "friday" },
      },
    ],
    sops: [
      {
        id: "deliverable-review",
        name: "Deliverable Review",
        description: "Quality review process for deliverables",
        steps: [
          { name: "Self Review", description: "Author reviews", action: "review" },
          { name: "Peer Review", description: "Peer feedback", action: "peer-review" },
          { name: "Manager Review", description: "Manager approval", action: "approve" },
        ],
      },
    ],
    customizationOptions: {
      agentsOptional: ["knowledge-agent"],
      additionalAgents: ["billing-agent", "recruiting-agent"],
    },
  },
  {
    id: "custom",
    name: "Custom Setup",
    nameKo: "직접 구성",
    industry: "custom",
    description: "Start from scratch and configure everything yourself",
    descriptionKo: "처음부터 직접 구성합니다",
    icon: "⚙️",
    agents: [],
    workflows: [],
    sops: [],
    customizationOptions: {
      agentsOptional: [],
      additionalAgents: [
        "general-agent",
        "assistant-agent",
        "support-agent",
        "analyst-agent",
        "coordinator-agent",
      ],
    },
  },
];

export class TemplateService {
  /**
   * List all available templates
   */
  list(): OnboardingTemplate[] {
    return ONBOARDING_TEMPLATES;
  }

  /**
   * Get template by ID
   */
  get(templateId: string): OnboardingTemplate | null {
    return ONBOARDING_TEMPLATES.find((t) => t.id === templateId) || null;
  }

  /**
   * Preview what will be created
   */
  preview(templateId: string): TemplatePreview | null {
    const template = this.get(templateId);
    if (!template) return null;

    const enabledAgents = template.agents.filter((a) => a.enabled);

    return {
      template,
      willCreate: {
        agents: enabledAgents.length,
        workflows: template.workflows.length,
        sops: template.sops.length,
      },
      estimatedSetupTime: this.estimateSetupTime(template),
    };
  }

  /**
   * Apply template to organization
   */
  async apply(
    organizationId: string,
    templateId: string,
    customizations?: {
      enabledAgents?: string[];
      disabledAgents?: string[];
    },
  ): Promise<{
    createdAgents: string[];
    createdWorkflows: string[];
    createdSops: string[];
  }> {
    const template = this.get(templateId);
    if (!template) {
      throw new Error(`Template ${templateId} not found`);
    }

    const createdAgents: string[] = [];
    const createdWorkflows: string[] = [];
    const createdSops: string[] = [];

    // Determine which agents to create
    let agentsToCreate = template.agents.filter((a) => a.enabled);

    if (customizations?.enabledAgents) {
      // Add explicitly enabled agents
      const additional = template.agents.filter(
        (a) => !a.enabled && customizations.enabledAgents!.includes(a.id),
      );
      agentsToCreate = [...agentsToCreate, ...additional];
    }

    if (customizations?.disabledAgents) {
      // Remove explicitly disabled agents
      agentsToCreate = agentsToCreate.filter(
        (a) => !customizations.disabledAgents!.includes(a.id),
      );
    }

    // Create agents
    for (const agentTemplate of agentsToCreate) {
      try {
        const agent = await prisma.agent.create({
          data: {
            organizationId,
            name: agentTemplate.name.toLowerCase().replace(/\s+/g, "-"),
            type: "permanent",
            role: agentTemplate.role,
            skills: agentTemplate.skills,
            status: "active",
            metadata: {
              templateId,
              templateAgentId: agentTemplate.id,
              description: agentTemplate.description,
            },
          },
        });
        createdAgents.push(agent.id);
      } catch (error) {
        logger.warn("Failed to create agent from template", {
          organizationId,
          agentId: agentTemplate.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Create workflows
    for (const workflowTemplate of template.workflows) {
      try {
        const workflow = await prisma.workflow.create({
          data: {
            organizationId,
            name: workflowTemplate.name,
            description: workflowTemplate.description,
            config: workflowTemplate.config as Prisma.InputJsonValue,
            enabled: false, // Start disabled so user can review
            sopEnabled: workflowTemplate.sopEnabled || false,
          },
        });
        createdWorkflows.push(workflow.id);
      } catch (error) {
        logger.warn("Failed to create workflow from template", {
          organizationId,
          workflowId: workflowTemplate.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    logger.info("Applied onboarding template", {
      organizationId,
      templateId,
      createdAgents: createdAgents.length,
      createdWorkflows: createdWorkflows.length,
      createdSops: createdSops.length,
    });

    return { createdAgents, createdWorkflows, createdSops };
  }

  /**
   * Estimate setup time based on template complexity
   */
  private estimateSetupTime(template: OnboardingTemplate): string {
    const enabledAgents = template.agents.filter((a) => a.enabled).length;
    const workflows = template.workflows.length;

    if (enabledAgents === 0 && workflows === 0) {
      return "5-10 minutes";
    }
    if (enabledAgents <= 2 && workflows <= 2) {
      return "10-15 minutes";
    }
    if (enabledAgents <= 4 && workflows <= 4) {
      return "15-20 minutes";
    }
    return "20-30 minutes";
  }
}

export const templateService = new TemplateService();

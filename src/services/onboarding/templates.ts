/**
 * Onboarding Templates Service (Stub)
 *
 * NOTE: Requires onboarding tables in Prisma schema (Template, etc.)
 */

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
  agents: AgentTemplate[];
  workflows: WorkflowTemplate[];
  sops: SOPTemplate[];
  customizationOptions: {
    agentsOptional: string[];
    additionalAgents: string[];
  };
}

export interface TemplatePreview {
  id: string;
  name: string;
  nameKo: string;
  industry: string;
  description: string;
  descriptionKo: string;
  icon: string;
  agentCount: number;
  workflowCount: number;
  sopCount: number;
}

export const ONBOARDING_TEMPLATES: OnboardingTemplate[] = [
  {
    id: "general",
    name: "General Business",
    nameKo: "일반 비즈니스",
    industry: "general",
    description: "A general-purpose setup for most businesses",
    descriptionKo: "대부분의 비즈니스에 적합한 범용 설정",
    icon: "building",
    agents: [
      { id: "assistant", name: "Assistant", role: "general", skills: ["task_management"], enabled: true },
    ],
    workflows: [],
    sops: [],
    customizationOptions: { agentsOptional: [], additionalAgents: [] },
  },
];

export class TemplateService {
  getTemplates(): TemplatePreview[] {
    logger.debug("TemplateService.getTemplates called (stub)");
    return ONBOARDING_TEMPLATES.map((t) => ({
      id: t.id,
      name: t.name,
      nameKo: t.nameKo,
      industry: t.industry,
      description: t.description,
      descriptionKo: t.descriptionKo,
      icon: t.icon,
      agentCount: t.agents.length,
      workflowCount: t.workflows.length,
      sopCount: t.sops.length,
    }));
  }

  getTemplate(templateId: string): OnboardingTemplate | null {
    logger.debug("TemplateService.getTemplate called (stub)", { templateId });
    return ONBOARDING_TEMPLATES.find((t) => t.id === templateId) || null;
  }

  async applyTemplate(
    _organizationId: string,
    _templateId: string,
    _customization?: { enabledAgents?: string[]; disabledAgents?: string[] },
  ): Promise<{ success: boolean; agentsCreated: number; workflowsCreated: number }> {
    logger.warn("TemplateService.applyTemplate called (stub)");
    return { success: true, agentsCreated: 0, workflowsCreated: 0 };
  }

  getTemplatesByIndustry(industry: string): TemplatePreview[] {
    return this.getTemplates().filter((t) => t.industry === industry);
  }

  getIndustries(): string[] {
    return [...new Set(ONBOARDING_TEMPLATES.map((t) => t.industry))];
  }
}

export const templateService = new TemplateService();

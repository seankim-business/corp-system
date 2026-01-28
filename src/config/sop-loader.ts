import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import { z } from "zod";

const StepInputSchema = z.record(z.unknown()).optional();

const SOPStepSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  type: z.enum(["automated", "manual", "approval_required"]),
  agent: z.string().optional(),
  tool: z.string().optional(),
  input: StepInputSchema,
  output: z.record(z.unknown()).optional(),
  timeout: z.string().optional(),
  requires_approval: z.boolean().optional(),
  approver: z.string().optional(),
  assignee: z.string().optional(),
  checklist: z.array(z.string()).optional(),
  conditional: z
    .object({
      when: z.string(),
    })
    .optional(),
  required_approvals: z.array(z.string()).optional(),
});

const TriggerSchema = z.object({
  pattern: z.string(),
});

const ExceptionHandlerSchema = z.object({
  condition: z.string(),
  action: z.enum([
    "notify_owner",
    "escalate",
    "retry_with_modification",
    "send_reminder",
    "request_revision",
    "halt_and_escalate",
    "return_to_step",
    "page_executive",
    "escalate_and_retry",
    "auto_update",
  ]),
  target: z.string().optional(),
  step: z.string().optional(),
  message: z.string().optional(),
  notify: z.string().optional(),
  when: z.string().optional(),
  max_retries: z.number().optional(),
});

const MetadataSchema = z.object({
  id: z.string(),
  name: z.string(),
  function: z.string(),
  owner: z.string(),
  version: z.string(),
});

export const SOPDefinitionSchema = z.object({
  schema_version: z.string(),
  kind: z.literal("SOP"),
  metadata: MetadataSchema,
  triggers: z.array(TriggerSchema),
  steps: z.array(SOPStepSchema),
  exception_handling: z.array(ExceptionHandlerSchema).optional(),
});

export type SOPDefinition = z.infer<typeof SOPDefinitionSchema>;
export type SOPStep = z.infer<typeof SOPStepSchema>;
export type SOPTrigger = z.infer<typeof TriggerSchema>;
export type SOPExceptionHandler = z.infer<typeof ExceptionHandlerSchema>;
export type SOPMetadata = z.infer<typeof MetadataSchema>;

const SOPS_DIR = path.resolve(__dirname, "../../config/sops");

let sopCache: Map<string, SOPDefinition> | null = null;

export function loadSOPs(): SOPDefinition[] {
  if (!fs.existsSync(SOPS_DIR)) {
    console.warn(`SOPs directory not found: ${SOPS_DIR}`);
    return [];
  }

  const files = fs
    .readdirSync(SOPS_DIR)
    .filter((file) => file.endsWith(".yaml") || file.endsWith(".yml"));
  const sops: SOPDefinition[] = [];

  for (const file of files) {
    const filePath = path.join(SOPS_DIR, file);
    try {
      const fileContent = fs.readFileSync(filePath, "utf8");
      const parsed = yaml.load(fileContent);
      const sop = SOPDefinitionSchema.parse(parsed);
      sops.push(sop);
    } catch (error) {
      console.error(`Failed to load SOP config from ${file}:`, error);
      throw new Error(`Invalid SOP configuration in ${file}: ${(error as Error).message}`);
    }
  }

  return sops;
}

export function getSOPsMap(): Map<string, SOPDefinition> {
  if (sopCache) return sopCache;

  const sops = loadSOPs();
  sopCache = new Map();

  for (const sop of sops) {
    sopCache.set(sop.metadata.id, sop);
  }

  return sopCache;
}

export function getSOPById(id: string): SOPDefinition | undefined {
  return getSOPsMap().get(id);
}

export function getSOPByTrigger(text: string): SOPDefinition | undefined {
  const sops = getSOPsMap();
  const normalizedText = text.toLowerCase().trim();

  for (const sop of sops.values()) {
    for (const trigger of sop.triggers) {
      if (normalizedText.includes(trigger.pattern.toLowerCase())) {
        return sop;
      }
    }
  }

  return undefined;
}

export function getSOPsByFunction(functionId: string): SOPDefinition[] {
  const sops = getSOPsMap();
  const result: SOPDefinition[] = [];

  for (const sop of sops.values()) {
    if (sop.metadata.function === functionId) {
      result.push(sop);
    }
  }

  return result;
}

export function clearSOPCache(): void {
  sopCache = null;
}

export function validateSOPDefinition(data: unknown): SOPDefinition {
  return SOPDefinitionSchema.parse(data);
}

export function convertSOPToExecutorFormat(sop: SOPDefinition): Array<{
  id: string;
  name: string;
  description?: string;
  type: "manual" | "automated" | "approval" | "mcp_call";
  config?: Record<string, unknown>;
  requiredApprovers?: string[];
  timeoutMinutes?: number;
  skippable?: boolean;
}> {
  return sop.steps.map((step) => {
    let executorType: "manual" | "automated" | "approval" | "mcp_call";

    switch (step.type) {
      case "automated":
        executorType = step.tool ? "mcp_call" : "automated";
        break;
      case "approval_required":
        executorType = "approval";
        break;
      case "manual":
      default:
        executorType = "manual";
    }

    const timeoutMinutes = step.timeout ? parseTimeout(step.timeout) : undefined;

    return {
      id: step.id,
      name: step.name,
      description: step.description,
      type: executorType,
      config: {
        agent: step.agent,
        tool: step.tool,
        input: step.input,
        output: step.output,
        assignee: step.assignee,
        checklist: step.checklist,
        conditional: step.conditional,
      },
      requiredApprovers: step.approver ? [step.approver] : step.required_approvals,
      timeoutMinutes,
      skippable: step.type === "manual" && !step.requires_approval,
    };
  });
}

function parseTimeout(timeout: string): number {
  const match = timeout.match(/^(\d+)(m|h|d)$/);
  if (!match) return 60;

  const value = parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case "m":
      return value;
    case "h":
      return value * 60;
    case "d":
      return value * 60 * 24;
    default:
      return 60;
  }
}

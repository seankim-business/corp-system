/**
 * SOP Generator Service
 *
 * Generates Standard Operating Procedures (SOPs) from workflow descriptions
 * using simple template-based approach (no AI required)
 *
 * Features:
 * - Parse workflow description into structured steps
 * - Generate SOP steps with title, description, duration, approval requirements
 * - Template-based generation for consistency
 */

export interface SOPStep {
  id: string;
  title: string;
  description: string;
  expectedDuration: number; // in minutes
  approvalRequired: boolean;
  order: number;
}

export interface GeneratedSOP {
  workflowId: string;
  title: string;
  description: string;
  steps: SOPStep[];
  generatedAt: Date;
}

/**
 * Template patterns for common workflow types
 */
const WORKFLOW_TEMPLATES = {
  approval: {
    name: "Approval Workflow",
    keywords: ["approve", "approval", "review", "verify"],
    steps: [
      {
        title: "Submit Request",
        description: "Submit the request for approval",
        duration: 5,
        approval: false,
      },
      {
        title: "Review Request",
        description: "Review the submitted request for completeness and accuracy",
        duration: 10,
        approval: true,
      },
      {
        title: "Approve or Reject",
        description: "Make a decision to approve or reject the request",
        duration: 5,
        approval: true,
      },
      {
        title: "Notify Requester",
        description: "Send notification to requester with decision",
        duration: 2,
        approval: false,
      },
    ],
  },
  data_processing: {
    name: "Data Processing Workflow",
    keywords: ["process", "data", "extract", "transform", "load"],
    steps: [
      {
        title: "Extract Data",
        description: "Extract data from source system",
        duration: 15,
        approval: false,
      },
      {
        title: "Validate Data",
        description: "Validate data quality and completeness",
        duration: 10,
        approval: false,
      },
      {
        title: "Transform Data",
        description: "Transform data to target format",
        duration: 20,
        approval: false,
      },
      {
        title: "Load Data",
        description: "Load processed data to destination",
        duration: 10,
        approval: false,
      },
      {
        title: "Verify Results",
        description: "Verify that data was loaded correctly",
        duration: 5,
        approval: true,
      },
    ],
  },
  notification: {
    name: "Notification Workflow",
    keywords: ["notify", "alert", "send", "message", "email"],
    steps: [
      {
        title: "Trigger Event",
        description: "Detect or trigger the notification event",
        duration: 1,
        approval: false,
      },
      {
        title: "Prepare Message",
        description: "Prepare the notification message content",
        duration: 5,
        approval: false,
      },
      {
        title: "Send Notification",
        description: "Send notification to recipients",
        duration: 2,
        approval: false,
      },
      {
        title: "Log Activity",
        description: "Log notification activity for audit trail",
        duration: 1,
        approval: false,
      },
    ],
  },
  task_management: {
    name: "Task Management Workflow",
    keywords: ["task", "create", "assign", "complete", "track"],
    steps: [
      {
        title: "Create Task",
        description: "Create a new task with details and requirements",
        duration: 5,
        approval: false,
      },
      {
        title: "Assign Task",
        description: "Assign task to responsible person or team",
        duration: 3,
        approval: false,
      },
      {
        title: "Execute Task",
        description: "Complete the assigned task",
        duration: 30,
        approval: false,
      },
      {
        title: "Review Completion",
        description: "Review task completion and quality",
        duration: 10,
        approval: true,
      },
      {
        title: "Close Task",
        description: "Close task and archive records",
        duration: 2,
        approval: false,
      },
    ],
  },
  generic: {
    name: "Generic Workflow",
    keywords: [],
    steps: [
      {
        title: "Initiate Process",
        description: "Start the workflow process",
        duration: 5,
        approval: false,
      },
      {
        title: "Execute Main Steps",
        description: "Execute the main workflow steps",
        duration: 20,
        approval: false,
      },
      {
        title: "Review Results",
        description: "Review workflow results and outcomes",
        duration: 10,
        approval: true,
      },
      {
        title: "Complete Process",
        description: "Complete the workflow and document results",
        duration: 5,
        approval: false,
      },
    ],
  },
};

/**
 * Detect workflow type from description
 */
function detectWorkflowType(description: string): keyof typeof WORKFLOW_TEMPLATES {
  const lowerDesc = description.toLowerCase();

  for (const [type, template] of Object.entries(WORKFLOW_TEMPLATES)) {
    if (type === "generic") continue;

    for (const keyword of template.keywords) {
      if (lowerDesc.includes(keyword)) {
        return type as keyof typeof WORKFLOW_TEMPLATES;
      }
    }
  }

  return "generic";
}

/**
 * Extract custom steps from description if present
 * Looks for numbered lists or bullet points
 */
function extractCustomSteps(description: string): string[] {
  const lines = description.split("\n");
  const steps: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    // Match numbered lists (1., 2., etc.) or bullet points (-, *, •)
    if (/^(\d+\.|[-*•])\s+/.test(trimmed)) {
      const stepText = trimmed.replace(/^(\d+\.|[-*•])\s+/, "").trim();
      if (stepText) {
        steps.push(stepText);
      }
    }
  }

  return steps;
}

/**
 * Generate SOP from workflow description
 *
 * @param workflowId - ID of the workflow
 * @param description - Workflow description
 * @param title - Workflow title
 * @returns Generated SOP with steps
 */
export function generateSOP(workflowId: string, description: string, title: string): GeneratedSOP {
  // Detect workflow type
  const workflowType = detectWorkflowType(description);
  const template = WORKFLOW_TEMPLATES[workflowType];

  // Extract custom steps if present
  const customSteps = extractCustomSteps(description);

  // Build SOP steps
  let steps: SOPStep[];

  if (customSteps.length > 0) {
    // Use custom steps from description
    steps = customSteps.map((stepText, index) => ({
      id: `step-${index + 1}`,
      title: extractTitle(stepText),
      description: stepText,
      expectedDuration: estimateDuration(stepText),
      approvalRequired: shouldRequireApproval(stepText),
      order: index + 1,
    }));
  } else {
    // Use template steps
    steps = template.steps.map((step, index) => ({
      id: `step-${index + 1}`,
      title: step.title,
      description: step.description,
      expectedDuration: step.duration,
      approvalRequired: step.approval,
      order: index + 1,
    }));
  }

  return {
    workflowId,
    title: title || template.name,
    description,
    steps,
    generatedAt: new Date(),
  };
}

/**
 * Extract title from step text (first 50 chars or first sentence)
 */
function extractTitle(stepText: string): string {
  const firstSentence = stepText.split(/[.!?]/)[0].trim();
  if (firstSentence.length > 50) {
    return firstSentence.substring(0, 47) + "...";
  }
  return firstSentence || "Step";
}

/**
 * Estimate duration based on step keywords
 */
function estimateDuration(stepText: string): number {
  const lowerText = stepText.toLowerCase();

  // Quick steps
  if (lowerText.includes("send") || lowerText.includes("notify") || lowerText.includes("log")) {
    return 2;
  }

  // Short steps
  if (lowerText.includes("review") || lowerText.includes("check") || lowerText.includes("verify")) {
    return 10;
  }

  // Medium steps
  if (
    lowerText.includes("process") ||
    lowerText.includes("create") ||
    lowerText.includes("prepare")
  ) {
    return 15;
  }

  // Long steps
  if (
    lowerText.includes("execute") ||
    lowerText.includes("implement") ||
    lowerText.includes("complete")
  ) {
    return 30;
  }

  // Default
  return 10;
}

/**
 * Determine if step requires approval
 */
function shouldRequireApproval(stepText: string): boolean {
  const lowerText = stepText.toLowerCase();
  const approvalKeywords = [
    "approve",
    "review",
    "verify",
    "validate",
    "authorize",
    "confirm",
    "sign",
  ];

  return approvalKeywords.some((keyword) => lowerText.includes(keyword));
}

/**
 * Validate generated SOP
 */
export function validateSOP(sop: GeneratedSOP): string[] {
  const errors: string[] = [];

  if (!sop.workflowId) {
    errors.push("Workflow ID is required");
  }

  if (!sop.title || sop.title.trim().length === 0) {
    errors.push("SOP title is required");
  }

  if (!sop.steps || sop.steps.length === 0) {
    errors.push("SOP must have at least one step");
  }

  // Validate each step
  sop.steps.forEach((step, index) => {
    if (!step.title || step.title.trim().length === 0) {
      errors.push(`Step ${index + 1}: Title is required`);
    }

    if (!step.description || step.description.trim().length === 0) {
      errors.push(`Step ${index + 1}: Description is required`);
    }

    if (step.expectedDuration <= 0) {
      errors.push(`Step ${index + 1}: Expected duration must be positive`);
    }

    if (step.order !== index + 1) {
      errors.push(`Step ${index + 1}: Order is incorrect`);
    }
  });

  return errors;
}

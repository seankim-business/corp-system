import { Router, Request, Response } from "express";
import { z } from "zod";
import { db as prisma } from "../db/client";
import { requireAuth } from "../middleware/auth.middleware";
import { requirePermission } from "../middleware/require-permission";
import { Permission } from "../auth/rbac";
import { validate } from "../middleware/validation.middleware";
import { logger } from "../utils/logger";
import {
  analyzeChange,
  notifyStakeholders,
  ChangeRequest,
  ChangeAnalysis,
} from "../services/change-analyzer";

const router = Router();

const createChangeSchema = z.object({
  title: z.string().min(1).max(500),
  type: z.string().min(1).max(50),
  description: z.string().min(1).max(1000),
  impactLevel: z.enum(["low", "medium", "high"]).default("low"),
});

const listChangesSchema = z.object({
  type: z.string().optional(),
  impactLevel: z.enum(["low", "medium", "high"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

const analyzeChangeSchema = z.object({
  changeType: z.enum(["new_agent", "new_team", "process_modification", "role_change"]),
  teamFunction: z.string().min(1).max(100),
  entityName: z.string().min(1).max(200),
  description: z.string().min(1).max(2000),
  selectedSkills: z.array(z.string()).optional(),
  selectedTools: z.array(z.string()).optional(),
  permissions: z
    .object({
      read: z.array(z.string()),
      write: z.array(z.string()),
      deny: z.array(z.string()),
    })
    .optional(),
});

const wizardSubmitSchema = z.object({
  changeType: z.enum(["new_agent", "new_team", "process_modification", "role_change"]),
  teamFunction: z.string().min(1).max(100),
  entityName: z.string().min(1).max(200),
  description: z.string().min(1).max(2000),
  selectedSkills: z.array(z.string()),
  selectedTools: z.array(z.string()),
  permissions: z.object({
    read: z.array(z.string()),
    write: z.array(z.string()),
    deny: z.array(z.string()),
  }),
  analysis: z.object({
    suggestedSkills: z.array(z.string()),
    suggestedTools: z.array(z.string()),
    impactedAgents: z.array(z.string()),
    impactedSOPs: z.array(z.string()),
    riskLevel: z.enum(["low", "medium", "high"]),
    recommendations: z.array(z.string()),
    filesCreated: z.array(z.string()),
    filesModified: z.array(z.string()),
  }),
});

router.post(
  "/org-changes",
  requireAuth,
  requirePermission(Permission.AUDIT_READ),
  validate({ body: createChangeSchema }),
  async (req: Request, res: Response) => {
    try {
      const { title, type, description, impactLevel } = req.body;
      const organizationId = req.user!.organizationId;
      const userId = req.user!.id;

      const change = await prisma.organizationChange.create({
        data: {
          organizationId,
          title,
          type,
          description,
          impactLevel,
          requestedBy: userId,
        },
      });

      logger.info("Organization change logged", {
        changeId: change.id,
        organizationId,
        type,
        impactLevel,
      });

      res.status(201).json(change);
    } catch (error) {
      logger.error("Failed to create organization change", { error });
      res.status(500).json({ error: "Failed to create organization change" });
    }
  },
);

router.get(
  "/org-changes",
  requireAuth,
  requirePermission(Permission.AUDIT_READ),
  validate({ query: listChangesSchema }),
  async (req: Request, res: Response) => {
    try {
      const { type, impactLevel, limit, offset } = req.query as unknown as {
        type?: string;
        impactLevel?: "low" | "medium" | "high";
        limit: number;
        offset: number;
      };
      const { organizationId } = req.user!;

      const where: any = { organizationId };
      if (type) where.type = type;
      if (impactLevel) where.impactLevel = impactLevel;

      const total = await prisma.organizationChange.count({ where });

      const changes = await prisma.organizationChange.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      });

      res.json({
        data: changes,
        pagination: {
          total,
          limit,
          offset,
          hasMore: offset + limit < total,
        },
      });
    } catch (error) {
      logger.error("Failed to list organization changes", { error });
      res.status(500).json({ error: "Failed to list organization changes" });
    }
  },
);

/**
 * POST /api/org-changes/analyze
 * Analyze a change request and return AI suggestions + impact analysis
 */
router.post(
  "/org-changes/analyze",
  requireAuth,
  requirePermission(Permission.AUDIT_READ),
  validate({ body: analyzeChangeSchema }),
  async (req: Request, res: Response) => {
    try {
      const changeRequest: ChangeRequest = req.body;

      logger.info("Analyzing organization change request", {
        organizationId: req.user!.organizationId,
        changeType: changeRequest.changeType,
        entityName: changeRequest.entityName,
      });

      const analysis = await analyzeChange(changeRequest);

      res.json(analysis);
    } catch (error) {
      logger.error("Failed to analyze organization change", { error });
      res.status(500).json({ error: "Failed to analyze organization change" });
    }
  },
);

/**
 * POST /api/org-changes/wizard
 * Submit the wizard form, create PR, and notify stakeholders
 */
router.post(
  "/org-changes/wizard",
  requireAuth,
  requirePermission(Permission.AUDIT_READ),
  validate({ body: wizardSubmitSchema }),
  async (req: Request, res: Response) => {
    try {
      const {
        changeType,
        teamFunction,
        entityName,
        description,
        selectedSkills,
        selectedTools,
        permissions,
        analysis,
      } = req.body;

      const organizationId = req.user!.organizationId;
      const userId = req.user!.id;

      logger.info("Processing organization change wizard submission", {
        organizationId,
        changeType,
        entityName,
        riskLevel: analysis.riskLevel,
      });

      // Create the organization change record
      const change = await prisma.organizationChange.create({
        data: {
          organizationId,
          title: `[${changeType}] ${entityName}`,
          type: changeType,
          description,
          impactLevel: analysis.riskLevel,
          requestedBy: userId,
          metadata: {
            teamFunction,
            selectedSkills,
            selectedTools,
            permissions,
            impactedAgents: analysis.impactedAgents,
            impactedSOPs: analysis.impactedSOPs,
            filesCreated: analysis.filesCreated,
            filesModified: analysis.filesModified,
            recommendations: analysis.recommendations,
          },
        },
      });

      // Generate PR content
      const prContent = await generatePRContent({
        changeType,
        teamFunction,
        entityName,
        description,
        selectedSkills,
        selectedTools,
        permissions,
        analysis,
      });

      // Create GitHub PR (simulated for now - would integrate with GitHub API)
      const prUrl = await createGitHubPR({
        organizationId,
        changeId: change.id,
        title: `[Org Change] ${changeType}: ${entityName}`,
        body: prContent.body,
        files: prContent.files,
      });

      // Update the change record with PR URL
      await prisma.organizationChange.update({
        where: { id: change.id },
        data: {
          metadata: {
            ...(change.metadata as object),
            prUrl,
          },
        },
      });

      // Notify stakeholders
      const changeRequest: ChangeRequest = {
        changeType,
        teamFunction,
        entityName,
        description,
        selectedSkills,
        selectedTools,
        permissions,
      };
      await notifyStakeholders(changeRequest, analysis as ChangeAnalysis, prUrl);

      logger.info("Organization change wizard completed", {
        changeId: change.id,
        prUrl,
      });

      res.status(201).json({
        success: true,
        changeId: change.id,
        prUrl,
        message: "Organization change submitted successfully. PR created for review.",
      });
    } catch (error) {
      logger.error("Failed to process organization change wizard", { error });
      res.status(500).json({ error: "Failed to process organization change" });
    }
  },
);

/**
 * Generate PR content for the organization change
 */
interface PRContentInput {
  changeType: string;
  teamFunction: string;
  entityName: string;
  description: string;
  selectedSkills: string[];
  selectedTools: string[];
  permissions: { read: string[]; write: string[]; deny: string[] };
  analysis: {
    impactedAgents: string[];
    impactedSOPs: string[];
    riskLevel: string;
    recommendations: string[];
    filesCreated: string[];
    filesModified: string[];
  };
}

interface PRFile {
  path: string;
  content: string;
  action: "create" | "modify";
}

async function generatePRContent(input: PRContentInput): Promise<{ body: string; files: PRFile[] }> {
  const { changeType, teamFunction, entityName, description, selectedSkills, selectedTools, permissions, analysis } =
    input;

  const entitySlug = entityName.toLowerCase().replace(/\s+/g, "-");
  const files: PRFile[] = [];

  // Generate YAML content based on change type
  if (changeType === "new_agent") {
    const agentYaml = `# Agent Configuration: ${entityName}
# Generated by Organization Change Wizard
# Team Function: ${teamFunction}

name: ${entitySlug}
display_name: "${entityName}"
description: "${description}"
team_function: "${teamFunction}"

skills:
${selectedSkills.map((s) => `  - ${s}`).join("\n")}

tools:
${selectedTools.map((t) => `  - ${t}`).join("\n")}

permissions:
  read:
${permissions.read.map((p) => `    - "${p}"`).join("\n") || '    - "/*"'}
  write:
${permissions.write.map((p) => `    - "${p}"`).join("\n") || "    []"}
  deny:
${permissions.deny.map((p) => `    - "${p}"`).join("\n") || "    []"}

settings:
  enabled: true
  max_concurrent_tasks: 5
  timeout_seconds: 300
`;

    files.push({
      path: `config/agents/${entitySlug}.yaml`,
      content: agentYaml,
      action: "create",
    });
  } else if (changeType === "new_team") {
    const teamYaml = `# Team Configuration: ${entityName}
# Generated by Organization Change Wizard

name: ${entitySlug}
display_name: "${entityName}"
function: "${teamFunction}"
description: "${description}"

members: []

lead_agent: ${entitySlug}-lead

channels:
  slack: "#${entitySlug}"

settings:
  auto_assign: true
`;

    files.push({
      path: `config/teams/${entitySlug}.yaml`,
      content: teamYaml,
      action: "create",
    });
  }

  // Generate PR body
  const body = `## Organization Change: ${changeType.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}

### Summary
**Entity:** ${entityName}
**Team Function:** ${teamFunction}
**Risk Level:** ${analysis.riskLevel.toUpperCase()}

### Description
${description}

### Skills & Tools
**Skills:**
${selectedSkills.map((s) => `- \`${s}\``).join("\n")}

**Tools:**
${selectedTools.map((t) => `- \`${t}\``).join("\n")}

### Permissions
| Type | Paths |
|------|-------|
| Read | ${permissions.read.join(", ") || "Default"} |
| Write | ${permissions.write.join(", ") || "None" } |
| Deny | ${permissions.deny.join(", ") || "None"} |

### Impact Analysis
**Impacted Agents:** ${analysis.impactedAgents.join(", ") || "None"}
**Impacted SOPs:** ${analysis.impactedSOPs.join(", ") || "None"}

### Files Changed
**Created:**
${analysis.filesCreated.map((f) => `- \`${f}\``).join("\n") || "- None"}

**Modified:**
${analysis.filesModified.map((f) => `- \`${f}\``).join("\n") || "- None"}

### Recommendations
${analysis.recommendations.map((r) => `- ${r}`).join("\n")}

---
*Generated by Nubabel Organization Change Wizard*
`;

  return { body, files };
}

/**
 * Create a GitHub PR (placeholder for actual GitHub integration)
 */
interface CreatePRInput {
  organizationId: string;
  changeId: string;
  title: string;
  body: string;
  files: PRFile[];
}

async function createGitHubPR(input: CreatePRInput): Promise<string> {
  const { organizationId, changeId, title } = input;

  // TODO: CRITICAL - This function does NOT create real GitHub PRs
  // This is a placeholder that returns a fake URL for demonstration purposes only.
  //
  // Real implementation requires:
  // 1. GitHub App or OAuth token with repo write access
  // 2. Use Octokit or GitHub REST API
  // 3. Create branch: org-change/${changeId}
  // 4. Commit files to branch using GitHub Trees API
  // 5. Create PR targeting main branch
  // 6. Return the actual PR URL from GitHub's response

  logger.warn("PLACEHOLDER: GitHub PR creation not implemented - returning fake URL", {
    organizationId,
    changeId,
    title,
    fileCount: input.files.length,
  });

  // PLACEHOLDER: Returns a clearly fake URL to indicate GitHub integration is not yet implemented
  // Do NOT use this in production - it will store invalid URLs in the database
  const timestamp = Date.now();
  const prUrl = `https://github.com/PLACEHOLDER/nubabel/pull/PENDING-${changeId}-${timestamp}`;

  logger.info("PLACEHOLDER PR URL generated", { prUrl, changeId });

  return prUrl;
}

export default router;

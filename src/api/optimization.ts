/**
 * Agent Optimization API Routes
 *
 * 기획:
 * - A/B 테스트 실험 관리 API
 * - 프롬프트 최적화 API
 * - 라우팅 최적화 API
 * - 모델 선택 및 추천 API
 * - Multi-tenant: organizationId로 필터링
 *
 * 엔드포인트:
 * - GET    /api/optimization/experiments
 * - POST   /api/optimization/experiments
 * - GET    /api/optimization/experiments/:id
 * - POST   /api/optimization/experiments/:id/start
 * - POST   /api/optimization/experiments/:id/stop
 * - GET    /api/optimization/experiments/:id/results
 * - POST   /api/optimization/experiments/:id/promote
 * - GET    /api/optimization/agents/:id/prompts
 * - POST   /api/optimization/agents/:id/prompts/generate
 * - POST   /api/optimization/agents/:id/prompts/test
 * - POST   /api/optimization/agents/:id/prompts/:variantId/activate
 * - GET    /api/optimization/agents/:id/routing/analysis
 * - POST   /api/optimization/agents/:id/routing/suggestions
 * - POST   /api/optimization/agents/:id/routing/apply
 * - GET    /api/optimization/agents/:id/model-recommendations
 * - GET    /api/optimization/costs
 * - GET    /api/optimization/costs/trend
 * - GET    /api/optimization/models
 */

import { Router, Request, Response } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.middleware";
import { requirePermission } from "../middleware/require-permission";
import { Permission } from "../auth/rbac";
import { validate, uuidParamSchema } from "../middleware/validation.middleware";
import { logger } from "../utils/logger";
import {
  // Experiment Manager
  createExperiment,
  startExperiment,
  stopExperiment,
  cancelExperiment,
  getExperiment,
  listExperiments,
  getExperimentVariants,
  analyzeResults,
  promoteWinner,
  // Prompt Optimizer
  getPromptVariants,
  generateVariants,
  testPromptVariant,
  setActivePrompt,
  getBestPrompt,
  // Routing Optimizer
  getRoutingRule,
  getRoutingRules,
  analyzeMisroutes,
  suggestKeywords,
  suggestRemovals,
  expandKeywords,
  applyImprovements,
  getRoutingAnalysisSummary,
  // Model Selector
  getModelProfiles,
  analyzeTradeoffs,
  selectModel,
  // Cost Optimizer
  analyzeCosts,
  analyzeTokenEfficiency,
  calculatePotentialSavings,
  getDailyCostTrend,
} from "../services/agent-optimizer";

const router = Router();

// Validation schemas
const createExperimentSchema = z.object({
  name: z.string().min(1).max(255),
  agentId: z.string().min(1).max(100),
  type: z.enum(["prompt", "model", "routing"]),
  controlConfig: z.record(z.unknown()),
  treatmentConfig: z.record(z.unknown()),
  trafficSplit: z.number().min(0).max(1).optional(),
  primaryMetric: z.enum(["success_rate", "latency", "cost", "user_rating"]).optional(),
  secondaryMetrics: z.array(z.string()).optional(),
  minSampleSize: z.number().int().min(10).optional(),
});

const generatePromptsSchema = z.object({
  basePrompt: z.string().min(1),
  optimizationGoal: z.enum(["accuracy", "speed", "cost"]),
  numVariants: z.number().int().min(1).max(5).optional(),
  preserveCore: z.boolean().optional(),
});

const testPromptSchema = z.object({
  newPrompt: z.string().min(1),
  trafficSplit: z.number().min(0).max(1).optional(),
});

const applyRoutingSchema = z.object({
  addKeywords: z.array(z.string()).optional(),
  removeKeywords: z.array(z.string()).optional(),
});

const expandKeywordsSchema = z.object({
  keywords: z.array(z.string()).min(1),
  similarityThreshold: z.number().min(0).max(1).optional(),
});

const selectModelSchema = z.object({
  complexity: z.enum(["simple", "medium", "complex"]),
  type: z.enum(["routing", "generation", "analysis", "coding"]),
  expectedTokens: z.number().int().min(1),
  latencyRequirement: z.enum(["fast", "normal", "slow_ok"]),
  qualityRequirement: z.enum(["high", "medium", "low"]),
});

const agentIdParamSchema = z.object({
  id: z.string().min(1).max(100),
});

// ============================================================================
// EXPERIMENTS
// ============================================================================

router.get(
  "/experiments",
  requireAuth,
  requirePermission(Permission.WORKFLOW_READ),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;
      const { agentId, status } = req.query;

      const experiments = await listExperiments(
        organizationId,
        agentId as string | undefined,
        status as string | undefined,
      );

      return res.json({ experiments });
    } catch (error) {
      logger.error(
        "List experiments error",
        {},
        error instanceof Error ? error : new Error(String(error)),
      );
      return res.status(500).json({ error: "Failed to fetch experiments" });
    }
  },
);

router.post(
  "/experiments",
  requireAuth,
  requirePermission(Permission.WORKFLOW_CREATE),
  validate({ body: createExperimentSchema }),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;
      const params = req.body;

      const experiment = await createExperiment({
        organizationId,
        ...params,
      });

      return res.status(201).json({ experiment });
    } catch (error) {
      logger.error(
        "Create experiment error",
        {},
        error instanceof Error ? error : new Error(String(error)),
      );
      return res.status(500).json({ error: "Failed to create experiment" });
    }
  },
);

router.get(
  "/experiments/:id",
  requireAuth,
  requirePermission(Permission.WORKFLOW_READ),
  validate({ params: uuidParamSchema }),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;
      const id = String(req.params.id);

      const experiment = await getExperiment(id, organizationId);
      if (!experiment) {
        return res.status(404).json({ error: "Experiment not found" });
      }

      const variants = await getExperimentVariants(id);

      return res.json({ experiment, variants });
    } catch (error) {
      logger.error(
        "Get experiment error",
        {},
        error instanceof Error ? error : new Error(String(error)),
      );
      return res.status(500).json({ error: "Failed to fetch experiment" });
    }
  },
);

router.post(
  "/experiments/:id/start",
  requireAuth,
  requirePermission(Permission.WORKFLOW_EXECUTE),
  validate({ params: uuidParamSchema }),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;
      const id = String(req.params.id);

      const experiment = await getExperiment(id, organizationId);
      if (!experiment) {
        return res.status(404).json({ error: "Experiment not found" });
      }

      await startExperiment(id);
      return res.json({ success: true, message: "Experiment started" });
    } catch (error) {
      logger.error(
        "Start experiment error",
        {},
        error instanceof Error ? error : new Error(String(error)),
      );
      return res.status(500).json({ error: "Failed to start experiment" });
    }
  },
);

router.post(
  "/experiments/:id/stop",
  requireAuth,
  requirePermission(Permission.WORKFLOW_EXECUTE),
  validate({ params: uuidParamSchema }),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;
      const id = String(req.params.id);

      const experiment = await getExperiment(id, organizationId);
      if (!experiment) {
        return res.status(404).json({ error: "Experiment not found" });
      }

      await stopExperiment(id);
      return res.json({ success: true, message: "Experiment stopped" });
    } catch (error) {
      logger.error(
        "Stop experiment error",
        {},
        error instanceof Error ? error : new Error(String(error)),
      );
      return res.status(500).json({ error: "Failed to stop experiment" });
    }
  },
);

router.post(
  "/experiments/:id/cancel",
  requireAuth,
  requirePermission(Permission.WORKFLOW_EXECUTE),
  validate({ params: uuidParamSchema }),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;
      const id = String(req.params.id);

      const experiment = await getExperiment(id, organizationId);
      if (!experiment) {
        return res.status(404).json({ error: "Experiment not found" });
      }

      await cancelExperiment(id);
      return res.json({ success: true, message: "Experiment cancelled" });
    } catch (error) {
      logger.error(
        "Cancel experiment error",
        {},
        error instanceof Error ? error : new Error(String(error)),
      );
      return res.status(500).json({ error: "Failed to cancel experiment" });
    }
  },
);

router.get(
  "/experiments/:id/results",
  requireAuth,
  requirePermission(Permission.WORKFLOW_READ),
  validate({ params: uuidParamSchema }),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;
      const id = String(req.params.id);

      const experiment = await getExperiment(id, organizationId);
      if (!experiment) {
        return res.status(404).json({ error: "Experiment not found" });
      }

      const results = await analyzeResults(id);
      return res.json({ results });
    } catch (error) {
      logger.error(
        "Analyze experiment error",
        {},
        error instanceof Error ? error : new Error(String(error)),
      );
      return res.status(500).json({ error: "Failed to analyze experiment" });
    }
  },
);

router.post(
  "/experiments/:id/promote",
  requireAuth,
  requirePermission(Permission.WORKFLOW_EXECUTE),
  validate({ params: uuidParamSchema }),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;
      const id = String(req.params.id);

      const experiment = await getExperiment(id, organizationId);
      if (!experiment) {
        return res.status(404).json({ error: "Experiment not found" });
      }

      await promoteWinner(id);
      return res.json({ success: true, message: "Winner promoted" });
    } catch (error) {
      logger.error(
        "Promote winner error",
        {},
        error instanceof Error ? error : new Error(String(error)),
      );
      return res.status(500).json({ error: "Failed to promote winner" });
    }
  },
);

// ============================================================================
// PROMPTS
// ============================================================================

router.get(
  "/agents/:id/prompts",
  requireAuth,
  requirePermission(Permission.WORKFLOW_READ),
  validate({ params: agentIdParamSchema }),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;
      const agentId = String(req.params.id);

      const variants = await getPromptVariants(organizationId, agentId);
      const bestPrompt = await getBestPrompt(organizationId, agentId);

      return res.json({ variants, bestPrompt });
    } catch (error) {
      logger.error(
        "Get prompts error",
        {},
        error instanceof Error ? error : new Error(String(error)),
      );
      return res.status(500).json({ error: "Failed to fetch prompts" });
    }
  },
);

router.post(
  "/agents/:id/prompts/generate",
  requireAuth,
  requirePermission(Permission.WORKFLOW_CREATE),
  validate({ params: agentIdParamSchema, body: generatePromptsSchema }),
  async (req: Request, res: Response) => {
    try {
      const { basePrompt, optimizationGoal, numVariants, preserveCore } = req.body;

      const variants = await generateVariants(basePrompt, {
        optimizationGoal,
        numVariants,
        preserveCore,
      });

      return res.json({ variants });
    } catch (error) {
      logger.error(
        "Generate prompts error",
        {},
        error instanceof Error ? error : new Error(String(error)),
      );
      return res.status(500).json({ error: "Failed to generate prompts" });
    }
  },
);

router.post(
  "/agents/:id/prompts/test",
  requireAuth,
  requirePermission(Permission.WORKFLOW_CREATE),
  validate({ params: agentIdParamSchema, body: testPromptSchema }),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;
      const agentId = String(req.params.id);
      const { newPrompt, trafficSplit } = req.body;

      const experimentId = await testPromptVariant(
        organizationId,
        agentId,
        newPrompt,
        trafficSplit,
      );

      return res.status(201).json({ experimentId });
    } catch (error) {
      logger.error(
        "Test prompt error",
        {},
        error instanceof Error ? error : new Error(String(error)),
      );
      return res.status(500).json({ error: "Failed to create prompt test" });
    }
  },
);

router.post(
  "/agents/:id/prompts/:variantId/activate",
  requireAuth,
  requirePermission(Permission.WORKFLOW_UPDATE),
  validate({
    params: z.object({
      id: z.string().min(1).max(100),
      variantId: z.string().uuid(),
    }),
  }),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;
      const agentId = String(req.params.id);
      const variantId = String(req.params.variantId);

      await setActivePrompt(organizationId, agentId, variantId);
      return res.json({ success: true });
    } catch (error) {
      logger.error(
        "Activate prompt error",
        {},
        error instanceof Error ? error : new Error(String(error)),
      );
      return res.status(500).json({ error: "Failed to activate prompt" });
    }
  },
);

// ============================================================================
// ROUTING
// ============================================================================

router.get(
  "/agents/:id/routing/analysis",
  requireAuth,
  requirePermission(Permission.WORKFLOW_READ),
  validate({ params: agentIdParamSchema }),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;
      const agentId = String(req.params.id);
      const days = parseInt(req.query.days as string) || 30;

      const [rule, analysis, summary] = await Promise.all([
        getRoutingRule(organizationId, agentId),
        analyzeMisroutes(organizationId, agentId, days),
        getRoutingAnalysisSummary(organizationId, days),
      ]);

      return res.json({ rule, analysis, summary });
    } catch (error) {
      logger.error(
        "Routing analysis error",
        {},
        error instanceof Error ? error : new Error(String(error)),
      );
      return res.status(500).json({ error: "Failed to analyze routing" });
    }
  },
);

router.get(
  "/routing/rules",
  requireAuth,
  requirePermission(Permission.WORKFLOW_READ),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;

      const rules = await getRoutingRules(organizationId);
      return res.json({ rules });
    } catch (error) {
      logger.error(
        "Get routing rules error",
        {},
        error instanceof Error ? error : new Error(String(error)),
      );
      return res.status(500).json({ error: "Failed to fetch routing rules" });
    }
  },
);

router.post(
  "/agents/:id/routing/suggestions",
  requireAuth,
  requirePermission(Permission.WORKFLOW_READ),
  validate({ params: agentIdParamSchema }),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;
      const agentId = String(req.params.id);

      const [additions, removals] = await Promise.all([
        suggestKeywords(organizationId, agentId),
        suggestRemovals(organizationId, agentId),
      ]);

      return res.json({ additions, removals });
    } catch (error) {
      logger.error(
        "Routing suggestions error",
        {},
        error instanceof Error ? error : new Error(String(error)),
      );
      return res.status(500).json({ error: "Failed to get routing suggestions" });
    }
  },
);

router.post(
  "/routing/expand-keywords",
  requireAuth,
  requirePermission(Permission.WORKFLOW_READ),
  validate({ body: expandKeywordsSchema }),
  async (req: Request, res: Response) => {
    try {
      const { keywords, similarityThreshold } = req.body;

      const expanded = await expandKeywords(keywords, similarityThreshold);
      return res.json({ expanded });
    } catch (error) {
      logger.error(
        "Expand keywords error",
        {},
        error instanceof Error ? error : new Error(String(error)),
      );
      return res.status(500).json({ error: "Failed to expand keywords" });
    }
  },
);

router.post(
  "/agents/:id/routing/apply",
  requireAuth,
  requirePermission(Permission.WORKFLOW_UPDATE),
  validate({ params: agentIdParamSchema, body: applyRoutingSchema }),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;
      const agentId = String(req.params.id);
      const { addKeywords = [], removeKeywords = [] } = req.body;

      const rule = await applyImprovements(
        organizationId,
        agentId,
        addKeywords,
        removeKeywords,
      );

      return res.json({ rule });
    } catch (error) {
      logger.error(
        "Apply routing error",
        {},
        error instanceof Error ? error : new Error(String(error)),
      );
      return res.status(500).json({ error: "Failed to apply routing improvements" });
    }
  },
);

// ============================================================================
// MODELS
// ============================================================================

router.get(
  "/models",
  requireAuth,
  requirePermission(Permission.WORKFLOW_READ),
  async (req: Request, res: Response) => {
    try {
      const includeDisabled = req.query.includeDisabled === "true";
      const models = await getModelProfiles(!includeDisabled);
      return res.json({ models });
    } catch (error) {
      logger.error(
        "Get models error",
        {},
        error instanceof Error ? error : new Error(String(error)),
      );
      return res.status(500).json({ error: "Failed to fetch models" });
    }
  },
);

router.post(
  "/models/select",
  requireAuth,
  requirePermission(Permission.WORKFLOW_READ),
  validate({ body: selectModelSchema }),
  async (req: Request, res: Response) => {
    try {
      const taskProfile = req.body;
      const model = await selectModel(taskProfile);
      return res.json({ model });
    } catch (error) {
      logger.error(
        "Select model error",
        {},
        error instanceof Error ? error : new Error(String(error)),
      );
      return res.status(500).json({ error: "Failed to select model" });
    }
  },
);

router.get(
  "/agents/:id/model-recommendations",
  requireAuth,
  requirePermission(Permission.WORKFLOW_READ),
  validate({ params: agentIdParamSchema }),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;
      const agentId = String(req.params.id);

      const [tradeoffs, tokenEfficiency] = await Promise.all([
        analyzeTradeoffs(organizationId, agentId),
        analyzeTokenEfficiency(organizationId, agentId),
      ]);

      return res.json({ tradeoffs, tokenEfficiency });
    } catch (error) {
      logger.error(
        "Model recommendations error",
        {},
        error instanceof Error ? error : new Error(String(error)),
      );
      return res.status(500).json({ error: "Failed to get model recommendations" });
    }
  },
);

// ============================================================================
// COSTS
// ============================================================================

router.get(
  "/costs",
  requireAuth,
  requirePermission(Permission.WORKFLOW_READ),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;
      const days = parseInt(req.query.days as string) || 30;

      const [analysis, potentialSavings] = await Promise.all([
        analyzeCosts(organizationId, days),
        calculatePotentialSavings(organizationId, days),
      ]);

      return res.json({ analysis, potentialSavings });
    } catch (error) {
      logger.error(
        "Cost analysis error",
        {},
        error instanceof Error ? error : new Error(String(error)),
      );
      return res.status(500).json({ error: "Failed to analyze costs" });
    }
  },
);

router.get(
  "/costs/trend",
  requireAuth,
  requirePermission(Permission.WORKFLOW_READ),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;
      const days = parseInt(req.query.days as string) || 30;

      const trend = await getDailyCostTrend(organizationId, days);
      return res.json({ trend });
    } catch (error) {
      logger.error(
        "Cost trend error",
        {},
        error instanceof Error ? error : new Error(String(error)),
      );
      return res.status(500).json({ error: "Failed to get cost trend" });
    }
  },
);

export default router;

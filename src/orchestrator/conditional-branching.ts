import { logger } from "../utils/logger";

export interface BranchCondition {
  field: string;
  operator: "eq" | "neq" | "gt" | "lt" | "contains" | "exists";
  value: unknown;
}

export interface BranchRule {
  conditions: BranchCondition[];
  operator: "and" | "or";
  nextSkillId: string;
  fallbackSkillId?: string;
}

/**
 * Resolve a dot-notation path against a nested object.
 * Returns undefined if any segment is missing.
 *
 * Example: getNestedValue({ result: { data: { status: "ok" } } }, "result.data.status") => "ok"
 */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const segments = path.split(".");
  let current: unknown = obj;

  for (const segment of segments) {
    if (current === null || current === undefined || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }

  return current;
}

/**
 * Evaluate a single condition against a context object.
 */
export function evaluateCondition(
  condition: BranchCondition,
  context: Record<string, unknown>,
): boolean {
  const { field, operator, value } = condition;
  const actual = getNestedValue(context, field);

  logger.debug("Evaluating condition", {
    field,
    operator,
    expectedValue: String(value),
    actualValue: String(actual),
  });

  switch (operator) {
    case "eq":
      return actual === value;

    case "neq":
      return actual !== value;

    case "gt":
      return typeof actual === "number" && typeof value === "number" && actual > value;

    case "lt":
      return typeof actual === "number" && typeof value === "number" && actual < value;

    case "contains": {
      if (typeof actual === "string" && typeof value === "string") {
        return actual.includes(value);
      }
      if (Array.isArray(actual)) {
        return actual.includes(value);
      }
      return false;
    }

    case "exists":
      return actual !== undefined && actual !== null;
  }
}

/**
 * Evaluate a branch rule against a context and return the next skill ID.
 *
 * If all conditions pass (combined via the rule's operator), returns nextSkillId.
 * Otherwise, returns fallbackSkillId (or undefined if none specified).
 */
export function evaluateBranch(
  rule: BranchRule,
  context: Record<string, unknown>,
): string | undefined {
  const { conditions, operator, nextSkillId, fallbackSkillId } = rule;

  if (conditions.length === 0) {
    logger.warn("Branch rule has no conditions, using nextSkillId");
    return nextSkillId;
  }

  const conditionResults = conditions.map((condition) =>
    evaluateCondition(condition, context),
  );

  let passed: boolean;

  if (operator === "and") {
    passed = conditionResults.every(Boolean);
  } else {
    passed = conditionResults.some(Boolean);
  }

  const selectedSkillId = passed ? nextSkillId : fallbackSkillId;

  logger.debug("Branch evaluation complete", {
    operator,
    conditionCount: conditions.length,
    conditionResults,
    passed,
    selectedSkillId: selectedSkillId ?? "none",
  });

  return selectedSkillId;
}

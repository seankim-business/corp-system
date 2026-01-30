import { logger } from "../utils/logger";

export interface SkillDependency {
  skillId: string;
  dependsOn: string[];
  conflicts: string[];
  exclusiveResources: string[];
}

export type DependencyGraph = Map<string, SkillDependency>;

/**
 * An ExecutionPlan is an ordered list of steps.
 * Each step contains an array of skill IDs that can run in parallel.
 * Steps must execute sequentially (step 0 before step 1, etc.).
 */
export type ExecutionPlan = string[][];

const graph: DependencyGraph = new Map();

/**
 * Register a skill dependency entry in the graph.
 */
export function registerDependency(dep: SkillDependency): void {
  graph.set(dep.skillId, dep);
  logger.debug("Registered skill dependency", {
    skillId: dep.skillId,
    dependsOn: dep.dependsOn,
    conflicts: dep.conflicts,
    exclusiveResources: dep.exclusiveResources,
  });
}

/**
 * Get transitive dependencies for a given skill ID.
 * Returns the full set of skill IDs that must be satisfied (excluding the skill itself).
 */
export function getDependencies(skillId: string): string[] {
  const visited = new Set<string>();
  const result: string[] = [];

  function walk(current: string): void {
    const entry = graph.get(current);
    if (!entry) {
      return;
    }
    for (const dep of entry.dependsOn) {
      if (!visited.has(dep)) {
        visited.add(dep);
        result.push(dep);
        walk(dep);
      }
    }
  }

  walk(skillId);
  return result;
}

/**
 * Detect circular dependencies starting from a given skill ID.
 * Returns true if a cycle is detected, false otherwise.
 */
export function detectCycles(skillId: string): boolean {
  const visiting = new Set<string>();
  const visited = new Set<string>();

  function hasCycle(current: string): boolean {
    if (visiting.has(current)) {
      return true;
    }
    if (visited.has(current)) {
      return false;
    }

    visiting.add(current);

    const entry = graph.get(current);
    if (entry) {
      for (const dep of entry.dependsOn) {
        if (hasCycle(dep)) {
          return true;
        }
      }
    }

    visiting.delete(current);
    visited.add(current);
    return false;
  }

  return hasCycle(skillId);
}

/**
 * Detect conflicts among a set of skill IDs.
 * Returns pairs of [skillA, skillB] that conflict with each other,
 * either through explicit conflict declarations or exclusive resource overlap.
 */
export function detectConflicts(skillIds: string[]): [string, string][] {
  const conflicts: [string, string][] = [];
  const seen = new Set<string>();

  for (let i = 0; i < skillIds.length; i++) {
    const a = skillIds[i];
    const entryA = graph.get(a);

    for (let j = i + 1; j < skillIds.length; j++) {
      const b = skillIds[j];
      const pairKey = `${a}::${b}`;
      if (seen.has(pairKey)) {
        continue;
      }
      seen.add(pairKey);

      const entryB = graph.get(b);

      // Check explicit conflict declarations (bidirectional)
      const aConflictsWithB = entryA?.conflicts.includes(b) ?? false;
      const bConflictsWithA = entryB?.conflicts.includes(a) ?? false;

      if (aConflictsWithB || bConflictsWithA) {
        conflicts.push([a, b]);
        logger.warn("Skill conflict detected", { skillA: a, skillB: b, type: "explicit" });
        continue;
      }

      // Check exclusive resource overlap
      if (entryA && entryB) {
        const sharedResources = entryA.exclusiveResources.filter((r) =>
          entryB.exclusiveResources.includes(r),
        );
        if (sharedResources.length > 0) {
          conflicts.push([a, b]);
          logger.warn("Skill conflict detected", {
            skillA: a,
            skillB: b,
            type: "exclusive-resource",
            resources: sharedResources,
          });
        }
      }
    }
  }

  return conflicts;
}

/**
 * Validate that all dependencies for the given skill IDs are satisfiable.
 * Returns an object with valid flag and any missing dependencies.
 */
export function validateDependencies(
  skillIds: string[],
): { valid: boolean; missing: { skillId: string; missingDeps: string[] }[] } {
  const available = new Set(skillIds);
  const missing: { skillId: string; missingDeps: string[] }[] = [];

  for (const skillId of skillIds) {
    // Check for cycles
    if (detectCycles(skillId)) {
      logger.error("Circular dependency detected", { skillId });
      missing.push({ skillId, missingDeps: ["__circular_dependency__"] });
      continue;
    }

    const transitiveDeps = getDependencies(skillId);
    const unsatisfied = transitiveDeps.filter((dep) => !available.has(dep));

    if (unsatisfied.length > 0) {
      missing.push({ skillId, missingDeps: unsatisfied });
      logger.warn("Unsatisfied dependencies", { skillId, missingDeps: unsatisfied });
    }
  }

  return {
    valid: missing.length === 0,
    missing,
  };
}

/**
 * Resolve an execution order for the given skill IDs using topological sort.
 * Skills without inter-dependencies are grouped into the same step for parallel execution.
 * Returns an ExecutionPlan (array of steps, each step is an array of parallel skill IDs).
 */
export function resolveExecutionOrder(skillIds: string[]): ExecutionPlan {
  const requested = new Set(skillIds);
  const plan: ExecutionPlan = [];

  // Build in-degree map scoped to the requested skills
  const inDegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();

  for (const id of skillIds) {
    if (!inDegree.has(id)) {
      inDegree.set(id, 0);
    }
    if (!dependents.has(id)) {
      dependents.set(id, []);
    }
  }

  for (const id of skillIds) {
    const entry = graph.get(id);
    if (!entry) {
      continue;
    }
    for (const dep of entry.dependsOn) {
      if (requested.has(dep)) {
        inDegree.set(id, (inDegree.get(id) ?? 0) + 1);
        const depList = dependents.get(dep) ?? [];
        depList.push(id);
        dependents.set(dep, depList);
      }
    }
  }

  // Kahn's algorithm with level grouping for parallelism
  const remaining = new Map(inDegree);
  let processed = 0;

  while (remaining.size > 0) {
    // Collect all skills with in-degree 0 (can run in parallel this step)
    const ready: string[] = [];
    for (const [id, deg] of remaining) {
      if (deg === 0) {
        ready.push(id);
      }
    }

    if (ready.length === 0) {
      // Cycle detected among remaining skills
      const stuck = Array.from(remaining.keys());
      logger.error("Cycle detected in execution order resolution", { skills: stuck });
      // Include remaining skills as a final step to avoid silent drops
      plan.push(stuck);
      break;
    }

    plan.push(ready);
    processed += ready.length;

    for (const id of ready) {
      remaining.delete(id);
      const deps = dependents.get(id) ?? [];
      for (const dependent of deps) {
        if (remaining.has(dependent)) {
          remaining.set(dependent, (remaining.get(dependent) ?? 1) - 1);
        }
      }
    }
  }

  logger.info("Resolved execution order", {
    skillCount: skillIds.length,
    stepCount: plan.length,
    processedCount: processed,
  });

  return plan;
}

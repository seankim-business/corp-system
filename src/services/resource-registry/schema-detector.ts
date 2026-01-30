/**
 * AI Schema Detector Service
 * Uses AI to detect resource types and suggest field mappings
 */

import { InternalResourceType } from "@prisma/client";
import { db as prisma } from "../../db/client";
import {
  ExternalResourceSchema,
  SchemaSuggestion,
  FieldMappingSuggestion,
  ExternalField,
} from "./providers/types";

// ============================================================================
// Built-in Type Schemas
// ============================================================================

/**
 * Standard field definitions for built-in resource types
 */
const BUILT_IN_SCHEMAS: Record<
  Exclude<InternalResourceType, "custom">,
  {
    fields: string[];
    keywords: string[];
    patterns: RegExp[];
  }
> = {
  vision: {
    fields: ["title", "description", "timeframe"],
    keywords: ["vision", "north star", "future state", "aspiration"],
    patterns: [/vision/i, /north.?star/i],
  },
  mission: {
    fields: ["title", "description", "purpose"],
    keywords: ["mission", "purpose", "why we exist"],
    patterns: [/mission/i, /purpose/i],
  },
  goal: {
    fields: ["title", "description", "owner", "progress", "dueDate", "status"],
    keywords: ["goal", "target", "outcome", "achievement"],
    patterns: [/goals?/i, /targets?/i, /outcomes?/i],
  },
  objective: {
    fields: ["title", "description", "quarter", "owner", "progress", "keyResults"],
    keywords: ["objective", "okr", "quarterly", "q1", "q2", "q3", "q4"],
    patterns: [/objectives?/i, /okrs?/i, /quarterly/i],
  },
  key_result: {
    fields: ["title", "objective", "target", "current", "unit", "progress"],
    keywords: ["key result", "kr", "metric", "measure", "kpi"],
    patterns: [/key.?results?/i, /\bkrs?\b/i],
  },
  strategy: {
    fields: ["title", "description", "timeline", "owner", "status"],
    keywords: ["strategy", "strategic", "initiative", "plan"],
    patterns: [/strateg/i, /initiatives?/i],
  },
  business_model: {
    fields: ["title", "description", "components", "revenue", "customers"],
    keywords: ["business model", "revenue", "canvas", "value proposition"],
    patterns: [/business.?model/i, /canvas/i],
  },
  value_stream: {
    fields: ["title", "description", "stages", "owner", "metrics"],
    keywords: ["value stream", "workflow", "process", "pipeline"],
    patterns: [/value.?stream/i, /workflow/i, /pipeline/i],
  },
  project: {
    fields: ["name", "description", "status", "owner", "team", "startDate", "endDate", "progress"],
    keywords: ["project", "initiative", "program", "workstream"],
    patterns: [/projects?/i, /programs?/i],
  },
  task: {
    fields: ["title", "description", "status", "assignee", "dueDate", "priority", "project"],
    keywords: ["task", "todo", "action", "item", "ticket"],
    patterns: [/tasks?/i, /todos?/i, /tickets?/i, /action.?items?/i],
  },
  department: {
    fields: ["name", "code", "head", "parentDepartment", "budget"],
    keywords: ["department", "division", "team", "unit", "org"],
    patterns: [/departments?/i, /divisions?/i, /teams?/i],
  },
  position: {
    fields: ["title", "department", "level", "reportsTo", "responsibilities"],
    keywords: ["position", "role", "job", "title"],
    patterns: [/positions?/i, /roles?/i, /job.?titles?/i],
  },
  kpi: {
    fields: ["name", "target", "current", "unit", "period", "owner"],
    keywords: ["kpi", "metric", "indicator", "measure", "performance"],
    patterns: [/kpis?/i, /metrics?/i, /indicators?/i],
  },
};

// ============================================================================
// Schema Detector Service
// ============================================================================

export class SchemaDetectorService {
  /**
   * Detect the most likely resource type for a given schema
   */
  async detectResourceType(
    organizationId: string,
    schema: ExternalResourceSchema,
    hints?: { userDescription?: string; expectedType?: InternalResourceType }
  ): Promise<SchemaSuggestion[]> {
    const suggestions: SchemaSuggestion[] = [];

    // 1. Check user hints first
    if (hints?.expectedType && hints.expectedType !== "custom") {
      const hintSuggestion = this.scoreAgainstType(schema, hints.expectedType);
      hintSuggestion.confidence = Math.min(hintSuggestion.confidence + 0.2, 1.0);
      hintSuggestion.reason = `User indicated this is ${hints.expectedType}. ${hintSuggestion.reason}`;
      suggestions.push(hintSuggestion);
    }

    // 2. Score against all built-in types
    for (const type of Object.keys(BUILT_IN_SCHEMAS) as Array<
      Exclude<InternalResourceType, "custom">
    >) {
      if (hints?.expectedType === type) continue; // Already added
      const suggestion = this.scoreAgainstType(schema, type);
      if (suggestion.confidence > 0.3) {
        suggestions.push(suggestion);
      }
    }

    // 3. Check custom types from organization
    const customSchemas = await prisma.resourceTypeSchema.findMany({
      where: {
        OR: [{ organizationId }, { isBuiltIn: true }],
        internalType: "custom",
      },
    });

    for (const customSchema of customSchemas) {
      const suggestion = this.scoreAgainstCustomType(schema, customSchema);
      if (suggestion.confidence > 0.3) {
        suggestions.push(suggestion);
      }
    }

    // 4. Apply user description hints
    if (hints?.userDescription) {
      this.applyUserDescriptionHints(suggestions, hints.userDescription);
    }

    // Sort by confidence
    suggestions.sort((a, b) => b.confidence - a.confidence);

    // Take top 3
    return suggestions.slice(0, 3);
  }

  /**
   * Suggest field mappings from external to internal schema
   */
  async suggestFieldMappings(
    organizationId: string,
    externalSchema: ExternalResourceSchema,
    targetType: InternalResourceType,
    customTypeName?: string
  ): Promise<FieldMappingSuggestion[]> {
    const suggestions: FieldMappingSuggestion[] = [];

    // Get target schema
    let targetFields: string[];
    if (targetType === "custom" && customTypeName) {
      const customSchema = await prisma.resourceTypeSchema.findFirst({
        where: {
          OR: [{ organizationId }, { isBuiltIn: true }],
          internalType: "custom",
          customTypeName,
        },
      });
      targetFields = customSchema
        ? (customSchema.fields as Array<{ name: string }>).map((f) => f.name)
        : [];
    } else {
      targetFields = BUILT_IN_SCHEMAS[targetType as keyof typeof BUILT_IN_SCHEMAS]?.fields || [];
    }

    // Match each external field to potential internal fields
    for (const externalField of externalSchema.fields) {
      const matches = this.findFieldMatches(externalField, targetFields);
      suggestions.push(...matches);
    }

    // Sort by confidence and dedupe
    const seenPairs = new Set<string>();
    return suggestions
      .sort((a, b) => b.confidence - a.confidence)
      .filter((s) => {
        const key = `${s.externalField}:${s.internalField}`;
        if (seenPairs.has(key)) return false;
        seenPairs.add(key);
        return true;
      });
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private scoreAgainstType(
    schema: ExternalResourceSchema,
    type: Exclude<InternalResourceType, "custom">
  ): SchemaSuggestion {
    const typeInfo = BUILT_IN_SCHEMAS[type];
    let score = 0;
    const reasons: string[] = [];

    // 1. Check resource name against patterns
    for (const pattern of typeInfo.patterns) {
      if (pattern.test(schema.resourceName)) {
        score += 0.3;
        reasons.push(`Name matches ${type} pattern`);
        break;
      }
    }

    // 2. Check field names against expected fields
    const fieldNames = schema.fields.map((f) => f.name.toLowerCase());
    const matchedFields = typeInfo.fields.filter((expected) =>
      fieldNames.some((actual) => this.fuzzyMatch(actual, expected))
    );
    const fieldScore = matchedFields.length / typeInfo.fields.length;
    score += fieldScore * 0.4;
    if (matchedFields.length > 0) {
      reasons.push(`${matchedFields.length}/${typeInfo.fields.length} expected fields found`);
    }

    // 3. Check sample data for keywords
    if (schema.sampleData && schema.sampleData.length > 0) {
      const sampleText = JSON.stringify(schema.sampleData).toLowerCase();
      for (const keyword of typeInfo.keywords) {
        if (sampleText.includes(keyword.toLowerCase())) {
          score += 0.1;
          reasons.push(`Sample data contains "${keyword}"`);
          break;
        }
      }
    }

    // Generate field mapping suggestions
    const fieldMappings = this.generateBasicFieldMappings(schema.fields, typeInfo.fields);

    return {
      type,
      confidence: Math.min(score, 1.0),
      reason: reasons.join("; ") || "Basic pattern match",
      fieldMappings,
    };
  }

  private scoreAgainstCustomType(
    schema: ExternalResourceSchema,
    customSchema: {
      customTypeName: string | null;
      fields: unknown;
      aiDetectionKeywords: string[];
      aiDetectionPatterns: unknown;
    }
  ): SchemaSuggestion {
    let score = 0;
    const reasons: string[] = [];

    // Check keywords
    const keywords = customSchema.aiDetectionKeywords || [];
    for (const keyword of keywords) {
      if (schema.resourceName.toLowerCase().includes(keyword.toLowerCase())) {
        score += 0.3;
        reasons.push(`Name contains keyword "${keyword}"`);
        break;
      }
    }

    // Check fields
    const customFields = (customSchema.fields as Array<{ name: string }>)?.map((f) => f.name) || [];
    const fieldNames = schema.fields.map((f) => f.name.toLowerCase());
    const matchedFields = customFields.filter((expected) =>
      fieldNames.some((actual) => this.fuzzyMatch(actual, expected))
    );
    if (customFields.length > 0) {
      const fieldScore = matchedFields.length / customFields.length;
      score += fieldScore * 0.5;
      if (matchedFields.length > 0) {
        reasons.push(`${matchedFields.length}/${customFields.length} fields match`);
      }
    }

    const fieldMappings = this.generateBasicFieldMappings(schema.fields, customFields);

    return {
      type: "custom",
      customTypeName: customSchema.customTypeName || undefined,
      confidence: Math.min(score, 1.0),
      reason: reasons.join("; ") || "Custom type pattern match",
      fieldMappings,
    };
  }

  private applyUserDescriptionHints(suggestions: SchemaSuggestion[], description: string): void {
    const descLower = description.toLowerCase();

    for (const suggestion of suggestions) {
      // Check if description mentions this type
      const typeKeywords = BUILT_IN_SCHEMAS[
        suggestion.type as keyof typeof BUILT_IN_SCHEMAS
      ]?.keywords || [];

      for (const keyword of typeKeywords) {
        if (descLower.includes(keyword.toLowerCase())) {
          suggestion.confidence = Math.min(suggestion.confidence + 0.15, 1.0);
          suggestion.reason += "; User description mentions related keywords";
          break;
        }
      }
    }
  }

  private findFieldMatches(
    externalField: ExternalField,
    targetFields: string[]
  ): FieldMappingSuggestion[] {
    const suggestions: FieldMappingSuggestion[] = [];
    const externalName = externalField.name.toLowerCase();

    for (const targetField of targetFields) {
      const targetLower = targetField.toLowerCase();
      let confidence = 0;
      let reason = "";

      // Exact match
      if (externalName === targetLower) {
        confidence = 1.0;
        reason = "Exact match";
      }
      // Contains match
      else if (externalName.includes(targetLower) || targetLower.includes(externalName)) {
        confidence = 0.8;
        reason = "Partial match";
      }
      // Common synonyms
      else if (this.areSynonyms(externalName, targetLower)) {
        confidence = 0.7;
        reason = "Synonym match";
      }
      // Fuzzy match
      else if (this.fuzzyMatch(externalName, targetLower)) {
        confidence = 0.5;
        reason = "Fuzzy match";
      }

      if (confidence > 0) {
        suggestions.push({
          externalField: externalField.name,
          internalField: targetField,
          confidence,
          reason,
        });
      }
    }

    return suggestions;
  }

  private generateBasicFieldMappings(
    externalFields: ExternalField[],
    targetFields: string[]
  ): FieldMappingSuggestion[] {
    const mappings: FieldMappingSuggestion[] = [];
    const usedTargets = new Set<string>();

    for (const field of externalFields) {
      const matches = this.findFieldMatches(field, targetFields);
      // Take best unused match
      for (const match of matches.sort((a, b) => b.confidence - a.confidence)) {
        if (!usedTargets.has(match.internalField)) {
          mappings.push(match);
          usedTargets.add(match.internalField);
          break;
        }
      }
    }

    return mappings;
  }

  private fuzzyMatch(a: string, b: string): boolean {
    // Simple Levenshtein-based fuzzy match
    const distance = this.levenshteinDistance(a, b);
    const maxLen = Math.max(a.length, b.length);
    return distance / maxLen < 0.3;
  }

  private levenshteinDistance(a: string, b: string): number {
    const matrix: number[][] = [];
    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }
    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    return matrix[b.length][a.length];
  }

  private areSynonyms(a: string, b: string): boolean {
    const synonymGroups = [
      ["name", "title", "label"],
      ["description", "desc", "summary", "details"],
      ["owner", "assignee", "responsible", "lead"],
      ["status", "state", "progress"],
      ["date", "due", "deadline", "duedate", "due_date"],
      ["start", "begin", "from", "startdate", "start_date"],
      ["end", "finish", "to", "enddate", "end_date"],
      ["team", "group", "department"],
      ["priority", "importance", "urgency"],
    ];

    for (const group of synonymGroups) {
      if (group.includes(a) && group.includes(b)) {
        return true;
      }
    }
    return false;
  }
}

export const schemaDetectorService = new SchemaDetectorService();

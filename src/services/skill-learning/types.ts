export interface ExecutionStep {
  skillId?: string;
  toolName?: string;
  provider?: string;
  input: Record<string, unknown>;
  output?: unknown;
  success: boolean;
  durationMs: number;
  timestamp: Date;
}

export interface ExecutionPattern {
  id: string;
  organizationId: string;
  patternHash: string;
  patternType: 'sequence' | 'retry' | 'composite';
  steps: ExecutionStep[];
  frequency: number;
  triggerPhrases: string[];
  contextTags: string[];
  status: 'detected' | 'validated' | 'converted' | 'dismissed';
  firstSeenAt: Date;
  lastSeenAt: Date;
}

export interface GeneratedSkillSuggestion {
  pattern: ExecutionPattern;
  suggestedName: string;
  suggestedDescription: string;
  suggestedTriggers: string[];
  confidence: number;
}

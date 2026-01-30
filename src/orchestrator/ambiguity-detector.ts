import { logger } from "../utils/logger";
import type { ExtractedEntities } from "./intent-detector";

export interface AmbiguityResult {
  isAmbiguous: boolean;
  ambiguityScore: number; // 0.0 (clear) to 1.0 (very ambiguous)
  reasons: string[];
  suggestedClarifications: string[];
}

export interface ClarificationQuestion {
  question: string;
  context: string;
  suggestedAnswers?: string[];
}

// --- Pattern definitions ---

const VAGUE_VERB_PATTERNS_EN: RegExp[] = [
  /\b(fix)\b/i,
  /\b(improve)\b/i,
  /\b(update)\b/i,
  /\b(change)\b/i,
  /\b(make better)\b/i,
  /\b(enhance)\b/i,
  /\b(refactor)\b/i,
  /\b(clean up)\b/i,
  /\b(optimize)\b/i,
  /\b(handle)\b/i,
  /\b(deal with)\b/i,
  /\b(address)\b/i,
  /\b(look at)\b/i,
  /\b(work on)\b/i,
  /\b(tweak)\b/i,
];

const VAGUE_VERB_PATTERNS_KO: RegExp[] = [
  /해줘/,
  /고쳐줘/,
  /바꿔줘/,
  /수정해/,
  /개선해/,
  /좀 해/,
  /처리해/,
  /손봐/,
  /다듬어/,
  /정리해/,
];

const SPECIFICITY_PATTERNS: RegExp[] = [
  // File names and paths
  /\b[\w-]+\.(ts|tsx|js|jsx|py|go|rs|java|css|html|json|yaml|yml|md|sql)\b/i,
  // Function / method names (camelCase or snake_case with parens)
  /\b[a-z][a-zA-Z0-9]*[A-Z][a-zA-Z0-9]*\s*\(/,
  /\b[a-z_]+[a-z0-9]*_[a-z_]+\s*\(/,
  // Component names (PascalCase)
  /\b[A-Z][a-zA-Z0-9]+(?:Component|Page|View|Modal|Dialog|Form|Button|Widget|Card|Panel|Layout|Header|Footer|Sidebar|Nav)\b/,
  // Class names
  /\bclass\s+[A-Z][a-zA-Z0-9]+/,
  // API endpoints
  /\/(api|v[0-9]+)\//,
  // CSS selectors / class names
  /\.[a-z][a-zA-Z0-9-]+/,
  // Import paths
  /from\s+['"][^'"]+['"]/,
  // Line numbers
  /line\s+\d+/i,
  // Error codes / messages
  /error\s*:\s*\w+/i,
  /\bERR_\w+/,
];

const PRONOUN_START_PATTERNS_EN: RegExp[] = [
  /^it\b/i,
  /^this\b/i,
  /^that\b/i,
  /^those\b/i,
  /^these\b/i,
  /^they\b/i,
  /^them\b/i,
];

const PRONOUN_START_PATTERNS_KO: RegExp[] = [
  /^이거/,
  /^그거/,
  /^저거/,
  /^이것/,
  /^그것/,
  /^저것/,
  /^이게/,
  /^그게/,
  /^저게/,
];

/** Patterns that signal multiple possible interpretations */
const MULTI_INTERPRETATION_PATTERNS: Array<{
  pattern: RegExp;
  topic: string;
  question: string;
}> = [
  {
    pattern: /\badd error handling\b/i,
    topic: "error handling scope",
    question:
      "Where should error handling be added? (specific files, functions, or endpoints)",
  },
  {
    pattern: /\badd (logging|logs)\b/i,
    topic: "logging scope",
    question:
      "Where should logging be added and at what level? (debug, info, warn, error)",
  },
  {
    pattern: /\badd (tests|testing)\b/i,
    topic: "testing scope",
    question:
      "Which modules or functions should be tested? (unit, integration, e2e)",
  },
  {
    pattern: /\badd (validation|input validation)\b/i,
    topic: "validation scope",
    question:
      "Which inputs or endpoints need validation? What rules should be applied?",
  },
  {
    pattern: /\badd (auth|authentication|authorization)\b/i,
    topic: "auth scope",
    question:
      "Which routes or resources need authentication/authorization? What auth method?",
  },
  {
    pattern: /\brefactor\b/i,
    topic: "refactoring scope",
    question:
      "What specific code should be refactored, and what is the desired outcome?",
  },
  {
    pattern: /\b(style|styling|css)\b/i,
    topic: "styling scope",
    question:
      "Which components or pages need styling changes? What is the desired look?",
  },
  {
    pattern: /\b(performance|slow|fast|speed)\b/i,
    topic: "performance target",
    question:
      "Which part of the system is slow? Is there a specific metric or benchmark target?",
  },
  {
    pattern: /\b(security|secure|vulnerability)\b/i,
    topic: "security scope",
    question:
      "Which security concern should be addressed? (XSS, CSRF, injection, auth, etc.)",
  },
  {
    pattern: /에러\s*처리/,
    topic: "error handling scope (KO)",
    question: "어디에 에러 처리를 추가해야 하나요? (파일, 함수, 엔드포인트)",
  },
  {
    pattern: /테스트\s*(추가|작성)/,
    topic: "testing scope (KO)",
    question: "어떤 모듈이나 함수에 테스트를 추가해야 하나요? (단위, 통합, e2e)",
  },
  {
    pattern: /리팩토링|리팩터링/,
    topic: "refactoring scope (KO)",
    question:
      "어떤 코드를 리팩토링해야 하나요? 원하는 결과물은 무엇인가요?",
  },
];

/** Conflicting instruction patterns (pairs of opposing directives) */
const CONFLICT_PAIRS: Array<{
  patternA: RegExp;
  patternB: RegExp;
  description: string;
}> = [
  {
    patternA: /\b(add|include|keep)\b/i,
    patternB: /\b(remove|delete|drop)\b/i,
    description:
      "Request mentions both adding and removing — clarify which action is intended for each item.",
  },
  {
    patternA: /\b(simplif|simpler|reduce)\b/i,
    patternB: /\b(add more|extend|expand|more features)\b/i,
    description:
      "Request asks to both simplify and extend — clarify the priority.",
  },
  {
    patternA: /\b(strict|stricter|enforce)\b/i,
    patternB: /\b(flexible|lenient|relax)\b/i,
    description:
      "Request mentions both stricter and more flexible behavior — clarify which applies where.",
  },
  {
    patternA: /\b(sync|synchronous)\b/i,
    patternB: /\b(async|asynchronous)\b/i,
    description:
      "Request mentions both synchronous and asynchronous — clarify the desired approach.",
  },
];

// --- Scoring constants ---

const SCORE_VAGUE_VERB = 0.2;
const SCORE_NO_SPECIFICITY = 0.25;
const SCORE_TOO_SHORT = 0.3;
const SCORE_MULTI_INTERPRETATION = 0.15;
const SCORE_PRONOUN_START = 0.2;
const SCORE_CONFLICTING = 0.3;

const AMBIGUITY_THRESHOLD = 0.6;
const MIN_REQUEST_LENGTH = 15;

// --- Main detection function ---

export function detectAmbiguity(userRequest: string): AmbiguityResult {
  const trimmed = userRequest.trim();
  const reasons: string[] = [];
  const suggestedClarifications: string[] = [];
  let score = 0;

  logger.debug("Ambiguity detection started", {
    requestLength: trimmed.length,
    requestPreview: trimmed.slice(0, 80),
  });

  // 1. Check for vague verbs without specific targets
  score += checkVagueVerbs(trimmed, reasons, suggestedClarifications);

  // 2. Check for missing specificity
  score += checkSpecificity(trimmed, reasons, suggestedClarifications);

  // 3. Check for too-short requests
  score += checkLength(trimmed, reasons, suggestedClarifications);

  // 4. Check for multiple possible interpretations
  score += checkMultipleInterpretations(
    trimmed,
    reasons,
    suggestedClarifications,
  );

  // 5. Check for pronouns without antecedents at the start
  score += checkPronounStart(trimmed, reasons, suggestedClarifications);

  // 6. Check for conflicting instructions
  score += checkConflicts(trimmed, reasons, suggestedClarifications);

  // Clamp score to [0, 1]
  const clampedScore = Math.min(1.0, Math.max(0.0, score));
  const isAmbiguous = clampedScore >= AMBIGUITY_THRESHOLD;

  logger.debug("Ambiguity detection complete", {
    score: clampedScore,
    isAmbiguous,
    reasonCount: reasons.length,
    clarificationCount: suggestedClarifications.length,
  });

  if (isAmbiguous) {
    logger.info("Ambiguous request detected", {
      score: clampedScore,
      reasons,
    });
  }

  return {
    isAmbiguous,
    ambiguityScore: Math.round(clampedScore * 100) / 100,
    reasons,
    suggestedClarifications,
  };
}

// --- Individual check functions ---

function checkVagueVerbs(
  text: string,
  reasons: string[],
  clarifications: string[],
): number {
  const allPatterns = [...VAGUE_VERB_PATTERNS_EN, ...VAGUE_VERB_PATTERNS_KO];
  const matchedVagueVerbs: string[] = [];

  for (const pattern of allPatterns) {
    if (pattern.test(text)) {
      const match = text.match(pattern);
      if (match) {
        matchedVagueVerbs.push(match[0]);
      }
    }
  }

  if (matchedVagueVerbs.length === 0) {
    return 0;
  }

  // Check whether a specific target accompanies the vague verb
  const hasSpecificTarget = SPECIFICITY_PATTERNS.some((p) => p.test(text));
  if (hasSpecificTarget) {
    // Vague verb is present but paired with a concrete target — reduced penalty
    return 0;
  }

  reasons.push(
    `Vague verb(s) without specific target: ${matchedVagueVerbs.join(", ")}`,
  );
  clarifications.push(
    "Which specific file, function, or component should be affected?",
  );

  return SCORE_VAGUE_VERB;
}

function checkSpecificity(
  text: string,
  reasons: string[],
  clarifications: string[],
): number {
  const hasSpecificity = SPECIFICITY_PATTERNS.some((p) => p.test(text));

  if (hasSpecificity) {
    return 0;
  }

  // Allow short but highly specific imperative commands (e.g., "run tests")
  const specificImperatives =
    /\b(run tests|build|deploy|lint|format|start|stop|restart|install|migrate|seed)\b/i;
  if (specificImperatives.test(text)) {
    return 0;
  }

  reasons.push(
    "No specific file names, function names, or component names mentioned",
  );
  clarifications.push(
    "Can you specify the exact files, functions, or components involved?",
  );

  return SCORE_NO_SPECIFICITY;
}

function checkLength(
  text: string,
  reasons: string[],
  clarifications: string[],
): number {
  if (text.length >= MIN_REQUEST_LENGTH) {
    return 0;
  }

  reasons.push(
    `Request is very short (${text.length} characters) — may lack sufficient detail`,
  );
  clarifications.push(
    "Could you provide more detail about what you need done?",
  );

  return SCORE_TOO_SHORT;
}

function checkMultipleInterpretations(
  text: string,
  reasons: string[],
  clarifications: string[],
): number {
  let addedScore = 0;

  for (const entry of MULTI_INTERPRETATION_PATTERNS) {
    if (entry.pattern.test(text)) {
      // Only flag if the request lacks enough context to disambiguate
      const hasContext = SPECIFICITY_PATTERNS.some((p) => p.test(text));
      if (!hasContext) {
        reasons.push(
          `Ambiguous scope for "${entry.topic}" — multiple interpretations possible`,
        );
        clarifications.push(entry.question);
        addedScore += SCORE_MULTI_INTERPRETATION;
      }
    }
  }

  // Cap contribution from this check so it doesn't dominate
  return Math.min(addedScore, 0.3);
}

function checkPronounStart(
  text: string,
  reasons: string[],
  clarifications: string[],
): number {
  const allPatterns = [
    ...PRONOUN_START_PATTERNS_EN,
    ...PRONOUN_START_PATTERNS_KO,
  ];

  for (const pattern of allPatterns) {
    if (pattern.test(text)) {
      const match = text.match(pattern);
      const pronoun = match ? match[0] : "unknown";

      reasons.push(
        `Request starts with a pronoun ("${pronoun}") without a clear antecedent`,
      );
      clarifications.push(
        "What specifically are you referring to? Please name the file, component, or feature.",
      );

      return SCORE_PRONOUN_START;
    }
  }

  return 0;
}

function checkConflicts(
  text: string,
  reasons: string[],
  clarifications: string[],
): number {
  let addedScore = 0;

  for (const pair of CONFLICT_PAIRS) {
    if (pair.patternA.test(text) && pair.patternB.test(text)) {
      reasons.push(`Potentially conflicting instructions: ${pair.description}`);
      clarifications.push(pair.description);
      addedScore += SCORE_CONFLICTING;
    }
  }

  // Cap contribution from conflicts
  return Math.min(addedScore, 0.4);
}

// ---------------------------------------------------------------------------
// Clarification Question Generation
// ---------------------------------------------------------------------------

/**
 * Generate a specific clarification question based on the ambiguity result
 * and detected entities. Uses detected entities to make the question more specific.
 *
 * @param userRequest - The original user request
 * @param ambiguityResult - The result from detectAmbiguity
 * @param entities - Extracted entities from the request
 * @returns A clarification question object
 */
export function generateClarificationQuestion(
  userRequest: string,
  ambiguityResult: AmbiguityResult,
  entities?: ExtractedEntities,
): ClarificationQuestion {
  // If not ambiguous, no clarification needed
  if (!ambiguityResult.isAmbiguous) {
    return {
      question: "The request seems clear. Do you want to proceed?",
      context: "No ambiguity detected",
    };
  }

  // Use the first suggested clarification as the base
  const primaryClarification =
    ambiguityResult.suggestedClarifications[0] ||
    "Could you provide more details about what you need?";

  // Build context from detected entities
  const contextParts: string[] = [];

  if (entities) {
    if (entities.providers.length > 0) {
      contextParts.push(`Detected providers: ${entities.providers.join(", ")}`);
    }
    if (entities.fileNames.length > 0) {
      contextParts.push(`Detected files: ${entities.fileNames.join(", ")}`);
    }
    if (entities.dates.length > 0) {
      contextParts.push(`Detected dates: ${entities.dates.join(", ")}`);
    }
    if (entities.projectNames.length > 0) {
      contextParts.push(`Detected projects: ${entities.projectNames.join(", ")}`);
    }
  }

  const context = contextParts.length > 0
    ? contextParts.join(" | ")
    : `Ambiguity score: ${ambiguityResult.ambiguityScore}`;

  // Generate suggested answers based on the type of ambiguity
  const suggestedAnswers = generateSuggestedAnswers(
    userRequest,
    ambiguityResult.reasons,
    entities,
  );

  logger.debug("Generated clarification question", {
    requestPreview: userRequest.slice(0, 50),
    ambiguityScore: ambiguityResult.ambiguityScore,
    reasonCount: ambiguityResult.reasons.length,
  });

  return {
    question: primaryClarification,
    context,
    suggestedAnswers: suggestedAnswers.length > 0 ? suggestedAnswers : undefined,
  };
}

/**
 * Generate suggested answers based on the type of ambiguity and entities
 */
function generateSuggestedAnswers(
  userRequest: string,
  reasons: string[],
  entities?: ExtractedEntities,
): string[] {
  const suggestions: string[] = [];
  const requestLower = userRequest.toLowerCase();

  // Scope-based suggestions
  if (reasons.some((r) => r.includes("scope"))) {
    if (entities?.fileNames && entities.fileNames.length > 0) {
      suggestions.push(`All files in ${entities.fileNames[0]}`);
      suggestions.push(`Only ${entities.fileNames[0]}`);
    } else {
      suggestions.push("Entire codebase");
      suggestions.push("Specific file or module");
      suggestions.push("Current directory only");
    }
  }

  // Error handling suggestions
  if (requestLower.includes("error") || requestLower.includes("에러")) {
    suggestions.push("Add try-catch blocks");
    suggestions.push("Add error logging");
    suggestions.push("Add user-facing error messages");
    suggestions.push("Add error recovery logic");
  }

  // Testing suggestions
  if (requestLower.includes("test") || requestLower.includes("테스트")) {
    suggestions.push("Unit tests");
    suggestions.push("Integration tests");
    suggestions.push("End-to-end tests");
  }

  // Refactoring suggestions
  if (requestLower.includes("refactor") || requestLower.includes("리팩토링")) {
    suggestions.push("Extract functions");
    suggestions.push("Improve naming");
    suggestions.push("Remove duplication");
    suggestions.push("Simplify logic");
  }

  // Provider-specific suggestions
  if (entities?.providers && entities.providers.length > 0) {
    const provider = entities.providers[0];
    suggestions.push(`Create in ${provider}`);
    suggestions.push(`Update existing ${provider} item`);
    suggestions.push(`Search ${provider}`);
  }

  return suggestions.slice(0, 5); // Limit to 5 suggestions
}

/**
 * Helper function to check if a request needs clarification
 * without running full ambiguity detection.
 */
export function needsClarification(ambiguityScore: number): boolean {
  return ambiguityScore >= AMBIGUITY_THRESHOLD;
}

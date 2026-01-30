/**
 * Example usage of enhanced intent detection with LLM fallback
 */

import { analyzeRequest, detectIntent } from "../intent-detector";
import { detectAmbiguity, generateClarificationQuestion } from "../ambiguity-detector";

/**
 * Example 1: Basic intent detection with Korean patterns
 */
async function example1_KoreanIntents() {
  console.log("=== Example 1: Korean Intent Patterns ===\n");

  const requests = [
    "작업 생성해줘",
    "일정 확인해줘",
    "메시지 보내줘",
    "검색해줘",
  ];

  for (const request of requests) {
    const result = await detectIntent(request);
    console.log(`Request: "${request}"`);
    console.log(`Action: ${result.action}, Target: ${result.target}, Confidence: ${result.confidence}`);
    console.log();
  }
}

/**
 * Example 2: LLM fallback for low-confidence requests
 */
async function example2_LLMFallback() {
  console.log("=== Example 2: LLM Fallback ===\n");

  // High confidence (pattern match)
  const clearRequest = "create a new task in Notion";
  const clearResult = await detectIntent(clearRequest);
  console.log(`Clear request: "${clearRequest}"`);
  console.log(`Result: ${clearResult.action} - ${clearResult.target} (confidence: ${clearResult.confidence})`);
  console.log();

  // Low confidence (LLM fallback)
  const vagueRequest = "do something with the data";
  const vagueResult = await detectIntent(vagueRequest);
  console.log(`Vague request: "${vagueRequest}"`);
  console.log(`Result: ${vagueResult.action} - ${vagueResult.target} (confidence: ${vagueResult.confidence})`);
  console.log("(Note: LLM fallback was used for low confidence)");
  console.log();
}

/**
 * Example 3: Full request analysis with entities
 */
async function example3_FullAnalysis() {
  console.log("=== Example 3: Full Request Analysis ===\n");

  const request = "create a task in Notion for @john due tomorrow";
  const analysis = await analyzeRequest(request);

  console.log(`Request: "${request}"`);
  console.log("\nIntent:");
  console.log(`  Action: ${analysis.intent.action}`);
  console.log(`  Target: ${analysis.intent.target}`);
  console.log(`  Confidence: ${analysis.intent.confidence}`);

  console.log("\nEntities:");
  console.log(`  Providers: ${analysis.entities.providers.join(", ") || "none"}`);
  console.log(`  User mentions: ${analysis.entities.userMentions.join(", ") || "none"}`);
  console.log(`  Dates: ${analysis.entities.dates.join(", ") || "none"}`);
  console.log();
}

/**
 * Example 4: Ambiguity detection and clarification
 */
async function example4_AmbiguityDetection() {
  console.log("=== Example 4: Ambiguity Detection ===\n");

  const ambiguousRequest = "fix the error";
  const analysis = await analyzeRequest(ambiguousRequest);
  const ambiguity = detectAmbiguity(ambiguousRequest);

  console.log(`Request: "${ambiguousRequest}"`);
  console.log(`\nAmbiguity Score: ${ambiguity.ambiguityScore}`);
  console.log(`Is Ambiguous: ${ambiguity.isAmbiguous}`);

  if (ambiguity.isAmbiguous) {
    console.log("\nReasons:");
    ambiguity.reasons.forEach((reason, i) => {
      console.log(`  ${i + 1}. ${reason}`);
    });

    const clarification = generateClarificationQuestion(
      ambiguousRequest,
      ambiguity,
      analysis.entities,
    );

    console.log("\nClarification Question:");
    console.log(`  ${clarification.question}`);
    console.log(`  Context: ${clarification.context}`);

    if (clarification.suggestedAnswers) {
      console.log("\nSuggested Answers:");
      clarification.suggestedAnswers.forEach((answer, i) => {
        console.log(`  ${i + 1}. ${answer}`);
      });
    }
  }
  console.log();
}

/**
 * Example 5: Caching demonstration
 */
async function example5_Caching() {
  console.log("=== Example 5: LLM Caching ===\n");

  const request = "handle this thing";

  console.log("First call (will use LLM if confidence is low):");
  const start1 = Date.now();
  const result1 = await detectIntent(request);
  const time1 = Date.now() - start1;
  console.log(`Result: ${result1.action} - ${result1.target}`);
  console.log(`Time: ${time1}ms`);
  console.log();

  console.log("Second call (should use cache):");
  const start2 = Date.now();
  const result2 = await detectIntent(request);
  const time2 = Date.now() - start2;
  console.log(`Result: ${result2.action} - ${result2.target}`);
  console.log(`Time: ${time2}ms`);
  console.log();

  console.log(`Cache speedup: ${(time1 / time2).toFixed(1)}x faster`);
  console.log();
}

/**
 * Run all examples
 */
async function runAllExamples() {
  try {
    await example1_KoreanIntents();
    await example2_LLMFallback();
    await example3_FullAnalysis();
    await example4_AmbiguityDetection();
    await example5_Caching();

    console.log("=== All examples completed ===");
  } catch (error) {
    console.error("Error running examples:", error);
    process.exit(1);
  }
}

// Run examples if this file is executed directly
if (require.main === module) {
  runAllExamples();
}

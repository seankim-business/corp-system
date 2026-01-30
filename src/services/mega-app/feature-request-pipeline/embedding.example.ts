/**
 * Example usage of Feature Request Embedding Service
 *
 * This demonstrates how to use the embedding service for semantic similarity
 * in feature request deduplication.
 */

import { getEmbeddingService } from "./embedding.service";
import { getDeduplicationService } from "./deduplication.service";

/**
 * Example 1: Generate embeddings for feature requests
 */
async function exampleGenerateEmbeddings() {
  const embeddingService = getEmbeddingService();

  if (!embeddingService.isAvailable()) {
    console.log("OpenAI API key not configured - embeddings disabled");
    return;
  }

  const featureRequest1 = {
    id: "req-1",
    content: "I need a dark mode for the dashboard so I can work at night without eye strain",
  };

  const featureRequest2 = {
    id: "req-2",
    content: "Can we add a night theme to reduce eye fatigue during late hours?",
  };

  const featureRequest3 = {
    id: "req-3",
    content: "Please add export functionality to download reports as Excel files",
  };

  // Generate embeddings
  const embedding1 = await embeddingService.getOrGenerateEmbedding(
    featureRequest1.id,
    featureRequest1.content
  );

  const embedding2 = await embeddingService.getOrGenerateEmbedding(
    featureRequest2.id,
    featureRequest2.content
  );

  const embedding3 = await embeddingService.getOrGenerateEmbedding(
    featureRequest3.id,
    featureRequest3.content
  );

  // Calculate similarities
  const similarity1_2 = embeddingService.cosineSimilarity(embedding1, embedding2);
  const similarity1_3 = embeddingService.cosineSimilarity(embedding1, embedding3);

  console.log("Similarity between dark mode requests:", similarity1_2); // High (e.g., 0.85+)
  console.log("Similarity between dark mode and export:", similarity1_3); // Low (e.g., 0.2-0.4)

  // Cache stats
  const cacheStats = embeddingService.getCacheStats();
  console.log("Cache stats:", cacheStats);
}

/**
 * Example 2: Batch embedding generation
 */
async function exampleBatchEmbeddings() {
  const embeddingService = getEmbeddingService();

  if (!embeddingService.isAvailable()) {
    return;
  }

  const requests = [
    { id: "req-1", content: "Add OAuth login with Google" },
    { id: "req-2", content: "Support Google authentication" },
    { id: "req-3", content: "Need SSO with Google accounts" },
    { id: "req-4", content: "Export data to CSV format" },
  ];

  // Batch generate embeddings (more efficient)
  const embeddings = await embeddingService.batchGenerateEmbeddings(requests);

  console.log(`Generated ${embeddings.size} embeddings`);

  // Compare all pairs
  const ids = Array.from(embeddings.keys());
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const similarity = embeddingService.cosineSimilarity(
        embeddings.get(ids[i])!,
        embeddings.get(ids[j])!
      );
      console.log(`${ids[i]} vs ${ids[j]}: ${similarity.toFixed(3)}`);
    }
  }
}

/**
 * Example 3: Using deduplication service with embeddings
 */
async function exampleDeduplicationWithEmbeddings() {
  const deduplicationService = getDeduplicationService();

  const organizationId = "org-123";
  const newRequestContent = "I want a dark mode option for the UI";

  // Find similar requests using embeddings (primary method)
  const similarRequests = await deduplicationService.findSimilarRequests(
    organizationId,
    newRequestContent
  );

  console.log(`Found ${similarRequests.length} similar requests`);

  for (const similar of similarRequests) {
    console.log(`- Request ${similar.requestId}: ${(similar.similarity * 100).toFixed(1)}% similar`);
    console.log(`  Status: ${similar.status}`);
    console.log(`  Content: ${similar.rawContent.slice(0, 100)}...`);
  }

  // Check for duplicates and get action recommendation
  if (similarRequests.length > 0) {
    const deduplicationResult = await deduplicationService.checkForDuplicates(
      organizationId,
      "new-request-id",
      newRequestContent
    );

    console.log("\nDeduplication Action:", deduplicationResult.action);
    console.log("Reason:", deduplicationResult.reason);

    if (deduplicationResult.primaryRequestId) {
      console.log("Primary Request ID:", deduplicationResult.primaryRequestId);
    }
  }
}

/**
 * Example 4: Fallback to text similarity when embeddings unavailable
 */
async function exampleFallbackBehavior() {
  const deduplicationService = getDeduplicationService();

  const organizationId = "org-123";
  const newRequestContent = "Add export to PDF functionality";

  // This will use embeddings if available, fall back to text similarity if not
  const similarRequests = await deduplicationService.findSimilarRequests(
    organizationId,
    newRequestContent
  );

  console.log("Similar requests found (using available method):", similarRequests.length);

  // You can also explicitly use text-based similarity
  const textBasedResults = await deduplicationService.findSimilarByText(
    organizationId,
    newRequestContent
  );

  console.log("Text-based similarity results:", textBasedResults.length);
}

/**
 * Example 5: Configuration thresholds
 */
async function exampleConfigurationThresholds() {
  // Create service with custom thresholds
  const deduplicationService = getDeduplicationService({
    autoMergeThreshold: 0.98, // Very high threshold for auto-merge
    suggestMergeThreshold: 0.90, // High threshold for merge suggestions
    relatedThreshold: 0.75, // Moderate threshold for linking as related
  });

  const organizationId = "org-123";
  const newRequestContent = "Support dark mode in the application";

  const result = await deduplicationService.checkForDuplicates(
    organizationId,
    "new-req-id",
    newRequestContent
  );

  console.log("Action with custom thresholds:", result.action);
  console.log("Reason:", result.reason);
}

// Export examples for testing
export {
  exampleGenerateEmbeddings,
  exampleBatchEmbeddings,
  exampleDeduplicationWithEmbeddings,
  exampleFallbackBehavior,
  exampleConfigurationThresholds,
};

// CLI runner for examples
if (require.main === module) {
  const example = process.argv[2] || "1";

  const examples: Record<string, () => Promise<void>> = {
    "1": exampleGenerateEmbeddings,
    "2": exampleBatchEmbeddings,
    "3": exampleDeduplicationWithEmbeddings,
    "4": exampleFallbackBehavior,
    "5": exampleConfigurationThresholds,
  };

  const exampleFn = examples[example];

  if (exampleFn) {
    console.log(`Running example ${example}...\n`);
    exampleFn()
      .then(() => {
        console.log("\nExample completed successfully");
        process.exit(0);
      })
      .catch((error) => {
        console.error("\nExample failed:", error);
        process.exit(1);
      });
  } else {
    console.log("Usage: ts-node embedding.example.ts [1-5]");
    console.log("Examples:");
    console.log("  1 - Generate embeddings and calculate similarity");
    console.log("  2 - Batch embedding generation");
    console.log("  3 - Deduplication with embeddings");
    console.log("  4 - Fallback behavior demonstration");
    console.log("  5 - Custom configuration thresholds");
    process.exit(1);
  }
}

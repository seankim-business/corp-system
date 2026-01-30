/**
 * Request Clusterer
 * Groups similar natural language requests using embeddings and clustering
 */

import { v4 as uuidv4 } from "uuid";
import Anthropic from "@anthropic-ai/sdk";
import { logger } from "../../utils/logger";
import type { ClusteredRequest, ClusteringOptions, RequestCluster } from "./types";

interface RequestInput {
  id: string;
  text: string;
  userId: string;
  timestamp: Date;
}

export class RequestClusterer {
  private anthropic: Anthropic | null = null;

  constructor() {
    if (process.env.ANTHROPIC_API_KEY) {
      this.anthropic = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY,
      });
    }
  }

  /**
   * Generate embeddings for requests using a simple TF-IDF-like approach
   * For production, consider using a dedicated embedding model (OpenAI, Cohere, etc.)
   */
  async embedRequests(requests: string[]): Promise<number[][]> {
    // Build vocabulary
    const vocabulary = new Set<string>();
    const tokenizedRequests = requests.map((req) => this.tokenize(req));

    for (const tokens of tokenizedRequests) {
      tokens.forEach((token) => vocabulary.add(token));
    }

    const vocabArray = Array.from(vocabulary);
    const vocabIndex = new Map(vocabArray.map((word, idx) => [word, idx]));

    // Calculate TF-IDF embeddings
    const idf = this.calculateIDF(tokenizedRequests, vocabIndex);

    return tokenizedRequests.map((tokens) => this.calculateTFIDF(tokens, vocabIndex, idf));
  }

  /**
   * Cluster similar requests using hierarchical agglomerative clustering
   */
  async clusterRequests(
    requests: RequestInput[],
    options: ClusteringOptions,
  ): Promise<RequestCluster[]> {
    const { minClusterSize, similarityThreshold } = options;

    if (requests.length < minClusterSize) {
      logger.debug("Not enough requests for clustering", {
        count: requests.length,
        minClusterSize,
      });
      return [];
    }

    logger.debug("Starting request clustering", {
      requestCount: requests.length,
      minClusterSize,
      similarityThreshold,
    });

    // Generate embeddings
    const texts = requests.map((r) => r.text);
    const embeddings = await this.embedRequests(texts);

    // Perform hierarchical agglomerative clustering
    const clusters = this.hierarchicalClustering(
      requests,
      embeddings,
      similarityThreshold,
      minClusterSize,
    );

    // Convert to RequestCluster format
    const result = await Promise.all(
      clusters.map(async (cluster) => this.buildCluster(cluster, embeddings)),
    );

    logger.info("Request clustering completed", {
      inputRequests: requests.length,
      clustersFound: result.length,
    });

    return result;
  }

  /**
   * Extract common intent from a cluster using Claude
   */
  async extractIntent(cluster: RequestCluster): Promise<string> {
    if (!this.anthropic) {
      // Fallback: use most common words
      return this.extractIntentFallback(cluster);
    }

    try {
      const sampleRequests = cluster.requests.slice(0, 5).map((r) => r.text);

      const response = await this.anthropic.messages.create({
        model: "claude-3-5-haiku-20241022",
        max_tokens: 100,
        messages: [
          {
            role: "user",
            content: `Analyze these similar user requests and extract the common intent in one short phrase (max 10 words):

Requests:
${sampleRequests.map((r, i) => `${i + 1}. "${r}"`).join("\n")}

Common intent:`,
          },
        ],
      });

      const content = response.content[0];
      if (content.type === "text") {
        return content.text.trim();
      }
      return this.extractIntentFallback(cluster);
    } catch (error) {
      logger.warn("Failed to extract intent with Claude, using fallback", {
        error: error instanceof Error ? error.message : String(error),
      });
      return this.extractIntentFallback(cluster);
    }
  }

  /**
   * Check if a cluster is automatable (can be turned into SOP)
   */
  isAutomatable(cluster: RequestCluster): boolean {
    // Criteria for automation:
    // 1. Consistent pattern across users
    // 2. Clear intent
    // 3. Size suggests recurring need
    return (
      cluster.size >= 3 &&
      cluster.commonIntent.length > 0 &&
      new Set(cluster.requests.map((r) => r.userId)).size >= 2
    );
  }

  /**
   * Tokenize a request string
   */
  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter((token) => token.length > 2); // Filter short words
  }

  /**
   * Calculate IDF (Inverse Document Frequency)
   */
  private calculateIDF(documents: string[][], vocabIndex: Map<string, number>): number[] {
    const n = documents.length;
    const idf = new Array(vocabIndex.size).fill(0);

    // Count documents containing each word
    const docFreq = new Array(vocabIndex.size).fill(0);
    for (const doc of documents) {
      const seen = new Set<number>();
      for (const token of doc) {
        const idx = vocabIndex.get(token);
        if (idx !== undefined && !seen.has(idx)) {
          docFreq[idx]++;
          seen.add(idx);
        }
      }
    }

    // Calculate IDF
    for (let i = 0; i < vocabIndex.size; i++) {
      idf[i] = Math.log((n + 1) / (docFreq[i] + 1)) + 1;
    }

    return idf;
  }

  /**
   * Calculate TF-IDF vector for a document
   */
  private calculateTFIDF(
    tokens: string[],
    vocabIndex: Map<string, number>,
    idf: number[],
  ): number[] {
    const vector = new Array(vocabIndex.size).fill(0);

    // Calculate term frequency
    const tf = new Map<number, number>();
    for (const token of tokens) {
      const idx = vocabIndex.get(token);
      if (idx !== undefined) {
        tf.set(idx, (tf.get(idx) || 0) + 1);
      }
    }

    // Calculate TF-IDF
    for (const [idx, freq] of tf) {
      vector[idx] = (freq / tokens.length) * idf[idx];
    }

    // Normalize
    const norm = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    if (norm > 0) {
      for (let i = 0; i < vector.length; i++) {
        vector[i] /= norm;
      }
    }

    return vector;
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    let dotProduct = 0;
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
    }
    return dotProduct; // Vectors are already normalized
  }

  /**
   * Perform hierarchical agglomerative clustering
   */
  private hierarchicalClustering(
    requests: RequestInput[],
    embeddings: number[][],
    threshold: number,
    minSize: number,
  ): RequestInput[][] {
    // Initialize: each request is its own cluster
    let clusters: { requests: RequestInput[]; embedding: number[] }[] = requests.map((r, i) => ({
      requests: [r],
      embedding: embeddings[i],
    }));

    // Merge clusters until no more merges possible
    while (clusters.length > 1) {
      // Find most similar pair
      let maxSim = -1;
      let mergeI = -1;
      let mergeJ = -1;

      for (let i = 0; i < clusters.length; i++) {
        for (let j = i + 1; j < clusters.length; j++) {
          const sim = this.cosineSimilarity(clusters[i].embedding, clusters[j].embedding);
          if (sim > maxSim) {
            maxSim = sim;
            mergeI = i;
            mergeJ = j;
          }
        }
      }

      // Stop if similarity below threshold
      if (maxSim < threshold) break;

      // Merge clusters
      const merged = {
        requests: [...clusters[mergeI].requests, ...clusters[mergeJ].requests],
        embedding: this.averageEmbedding([clusters[mergeI].embedding, clusters[mergeJ].embedding]),
      };

      // Remove old clusters and add merged
      clusters = clusters.filter((_, idx) => idx !== mergeI && idx !== mergeJ);
      clusters.push(merged);
    }

    // Filter by minimum size
    return clusters.filter((c) => c.requests.length >= minSize).map((c) => c.requests);
  }

  /**
   * Calculate average embedding for cluster centroid
   */
  private averageEmbedding(embeddings: number[][]): number[] {
    const dim = embeddings[0].length;
    const avg = new Array(dim).fill(0);

    for (const emb of embeddings) {
      for (let i = 0; i < dim; i++) {
        avg[i] += emb[i];
      }
    }

    for (let i = 0; i < dim; i++) {
      avg[i] /= embeddings.length;
    }

    // Normalize
    const norm = Math.sqrt(avg.reduce((sum, val) => sum + val * val, 0));
    if (norm > 0) {
      for (let i = 0; i < dim; i++) {
        avg[i] /= norm;
      }
    }

    return avg;
  }

  /**
   * Build RequestCluster from clustered requests
   */
  private async buildCluster(
    requests: RequestInput[],
    allEmbeddings: number[][],
  ): Promise<RequestCluster> {
    // Find centroid (request closest to center)
    const embeddings = requests.map((r) => {
      const idx = requests.findIndex((req) => req.id === r.id);
      return allEmbeddings[idx] || [];
    });

    const centroidEmb = this.averageEmbedding(embeddings);

    let centroidIdx = 0;
    let maxSim = -1;
    for (let i = 0; i < embeddings.length; i++) {
      const sim = this.cosineSimilarity(embeddings[i], centroidEmb);
      if (sim > maxSim) {
        maxSim = sim;
        centroidIdx = i;
      }
    }

    const clusteredRequests: ClusteredRequest[] = requests.map((r, i) => ({
      id: r.id,
      text: r.text,
      embedding: embeddings[i],
      userId: r.userId,
      timestamp: r.timestamp,
      distance: 1 - this.cosineSimilarity(embeddings[i], centroidEmb),
    }));

    const cluster: RequestCluster = {
      id: uuidv4(),
      centroid: requests[centroidIdx].text,
      requests: clusteredRequests,
      size: requests.length,
      commonIntent: "",
      commonEntities: this.extractCommonEntities(requests.map((r) => r.text)),
      commonAgent: "", // Would need agent info to determine
      automatable: false,
    };

    // Extract intent
    cluster.commonIntent = await this.extractIntent(cluster);
    cluster.automatable = this.isAutomatable(cluster);

    return cluster;
  }

  /**
   * Extract common entities from requests (simple noun extraction)
   */
  private extractCommonEntities(texts: string[]): string[] {
    const wordCounts = new Map<string, number>();

    for (const text of texts) {
      const words = this.tokenize(text);
      const seen = new Set<string>();

      for (const word of words) {
        if (!seen.has(word)) {
          wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
          seen.add(word);
        }
      }
    }

    // Return words that appear in majority of requests
    const threshold = texts.length * 0.5;
    return Array.from(wordCounts.entries())
      .filter(([_, count]) => count >= threshold)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([word]) => word);
  }

  /**
   * Fallback intent extraction without Claude
   */
  private extractIntentFallback(cluster: RequestCluster): string {
    const entities = cluster.commonEntities;
    if (entities.length > 0) {
      return `Handle ${entities.slice(0, 3).join(", ")} requests`;
    }
    return "Process similar requests";
  }
}

// Export singleton instance
export const requestClusterer = new RequestClusterer();

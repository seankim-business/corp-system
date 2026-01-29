/**
 * AI-powered Search Result Summarizer
 *
 * Provides intelligent summarization, answer generation, and related questions
 * for unified search results across Notion, Drive, GitHub, and Slack.
 */

import OpenAI from "openai";
import { logger } from "../utils/logger";

export interface SummarizableResult {
  source: string;
  title: string;
  snippet: string;
  url: string;
  metadata?: Record<string, unknown>;
}

export interface SummarizerConfig {
  apiKey: string;
  model?: string;
  maxTokens?: number;
  timeout?: number;
}

export class SearchSummarizer {
  private client: OpenAI;
  private model: string;
  private maxTokens: number;
  private timeout: number;

  constructor(config: SummarizableResult | SummarizerConfig) {
    const summarizerConfig = config as SummarizerConfig;
    if (!summarizerConfig.apiKey) {
      throw new Error("OpenAI API key is required for SearchSummarizer");
    }
    this.client = new OpenAI({ apiKey: summarizerConfig.apiKey });
    this.model = summarizerConfig.model || "gpt-4o-mini";
    this.maxTokens = summarizerConfig.maxTokens || 500;
    this.timeout = summarizerConfig.timeout || 10000;
  }

  /**
   * Generate a concise AI summary for a single search result
   */
  async summarizeResult(result: SummarizableResult, query: string): Promise<string> {
    try {
      const prompt = `Given the search query "${query}", summarize this ${result.source} document in 1-2 sentences:

Title: ${result.title}
Content: ${result.snippet}

Focus on how this document relates to the query. Be concise and informative.`;

      const response = await this.client.chat.completions.create({
        model: this.model,
        max_tokens: 150,
        temperature: 0.3,
        messages: [
          {
            role: "system",
            content:
              "You are a helpful assistant that creates concise, informative summaries of search results. Always respond in the same language as the query.",
          },
          { role: "user", content: prompt },
        ],
      });

      return response.choices[0]?.message?.content?.trim() || "";
    } catch (error) {
      logger.error("Failed to summarize result", {
        title: result.title,
        error: error instanceof Error ? error.message : String(error),
      });
      return "";
    }
  }

  /**
   * Generate a direct answer to the query from top search results
   */
  async generateAnswer(results: SummarizableResult[], query: string): Promise<string> {
    if (results.length === 0) {
      return "";
    }

    try {
      const context = results
        .slice(0, 5)
        .map(
          (r, i) =>
            `[${i + 1}] ${r.source.toUpperCase()}: ${r.title}\n${r.snippet}`,
        )
        .join("\n\n");

      const prompt = `Based on the following search results, provide a direct, helpful answer to the query: "${query}"

Search Results:
${context}

Instructions:
- Provide a direct answer in 2-4 sentences
- Cite which source(s) the answer comes from using [1], [2], etc.
- If the results don't contain enough information to answer, say so
- Respond in the same language as the query`;

      const response = await this.client.chat.completions.create({
        model: this.model,
        max_tokens: this.maxTokens,
        temperature: 0.3,
        messages: [
          {
            role: "system",
            content:
              "You are a helpful assistant that provides direct answers based on search results. Be accurate, concise, and always cite your sources.",
          },
          { role: "user", content: prompt },
        ],
      });

      return response.choices[0]?.message?.content?.trim() || "";
    } catch (error) {
      logger.error("Failed to generate answer", {
        query,
        error: error instanceof Error ? error.message : String(error),
      });
      return "";
    }
  }

  /**
   * Extract the most relevant excerpt from content based on query
   */
  async extractRelevantExcerpt(content: string, query: string): Promise<string> {
    if (!content || content.length < 50) {
      return content;
    }

    // For short content, return as-is
    if (content.length < 500) {
      return content;
    }

    try {
      const prompt = `Given the search query "${query}", extract the most relevant excerpt (2-3 sentences) from the following content:

${content.slice(0, 2000)}

Return only the excerpt, no explanation.`;

      const response = await this.client.chat.completions.create({
        model: this.model,
        max_tokens: 200,
        temperature: 0.1,
        messages: [
          {
            role: "system",
            content:
              "You extract the most relevant excerpt from text based on a search query. Return only the excerpt.",
          },
          { role: "user", content: prompt },
        ],
      });

      return response.choices[0]?.message?.content?.trim() || content.slice(0, 200);
    } catch (error) {
      logger.error("Failed to extract excerpt", {
        error: error instanceof Error ? error.message : String(error),
      });
      return content.slice(0, 200);
    }
  }

  /**
   * Suggest related questions based on query and results
   */
  async suggestRelatedQuestions(
    query: string,
    results: SummarizableResult[],
  ): Promise<string[]> {
    try {
      const context = results
        .slice(0, 3)
        .map((r) => `- ${r.title} (${r.source})`)
        .join("\n");

      const prompt = `Based on the search query "${query}" and these results:
${context}

Suggest 3 related follow-up questions the user might want to ask. Return as JSON array of strings.`;

      const response = await this.client.chat.completions.create({
        model: this.model,
        max_tokens: 200,
        temperature: 0.7,
        messages: [
          {
            role: "system",
            content:
              'You suggest related questions based on search results. Respond only with a JSON array of 3 strings. Example: ["Question 1?", "Question 2?", "Question 3?"]',
          },
          { role: "user", content: prompt },
        ],
      });

      const content = response.choices[0]?.message?.content?.trim() || "[]";
      try {
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed)) {
          return parsed.slice(0, 3).filter((q) => typeof q === "string");
        }
      } catch {
        // Try to extract questions from non-JSON response
        const matches = content.match(/"([^"]+\?)"/g);
        if (matches) {
          return matches.slice(0, 3).map((m) => m.replace(/"/g, ""));
        }
      }
      return [];
    } catch (error) {
      logger.error("Failed to suggest related questions", {
        query,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * Process multiple results in parallel with timeout
   */
  async summarizeResults(
    results: SummarizableResult[],
    query: string,
    options: { maxResults?: number; timeout?: number } = {},
  ): Promise<Map<string, string>> {
    const maxResults = options.maxResults || 5;
    const timeout = options.timeout || this.timeout;

    const summaries = new Map<string, string>();
    const toProcess = results.slice(0, maxResults);

    const promises = toProcess.map(async (result) => {
      const key = `${result.source}:${result.title}`;
      try {
        const summary = await Promise.race([
          this.summarizeResult(result, query),
          new Promise<string>((_, reject) =>
            setTimeout(() => reject(new Error("Timeout")), timeout),
          ),
        ]);
        summaries.set(key, summary);
      } catch {
        summaries.set(key, "");
      }
    });

    await Promise.allSettled(promises);
    return summaries;
  }
}

// Factory function for creating summarizer with environment config
export function createSearchSummarizer(): SearchSummarizer | null {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    logger.warn("OPENAI_API_KEY not set, search summarization disabled");
    return null;
  }
  return new SearchSummarizer({ apiKey });
}

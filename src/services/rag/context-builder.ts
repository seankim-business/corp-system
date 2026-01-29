/**
 * RAG Context Builder Service
 * Builds context strings from retrieval results for LLM prompts
 */

export interface RetrievalResult {
  documentId: string;
  sourceType: string;
  sourceId: string;
  sourceUrl?: string;
  title: string;
  content: string;
  similarity: number;
  metadata: Record<string, unknown>;
}

export interface Source {
  id: string;
  title: string;
  url?: string;
  sourceType: string;
  relevance: number;
}

export interface ContextOptions {
  /** Maximum tokens to include in context */
  maxTokens: number;
  /** Whether to include source attribution */
  includeSource: boolean;
  /** Output format */
  format: 'markdown' | 'plain';
}

export interface ContextWithSources {
  context: string;
  sources: Source[];
}

const DEFAULT_OPTIONS: ContextOptions = {
  maxTokens: 2000,
  includeSource: true,
  format: 'markdown',
};

// Rough token estimation: 1 token ≈ 4 characters
const CHARS_PER_TOKEN = 4;

export class ContextBuilder {
  private options: ContextOptions;

  constructor(options: Partial<ContextOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Build context string from retrieval results
   */
  buildContext(
    results: RetrievalResult[],
    options?: Partial<ContextOptions>
  ): string {
    const { context } = this.buildContextWithSources(results, options);
    return context;
  }

  /**
   * Build context with source attribution
   */
  buildContextWithSources(
    results: RetrievalResult[],
    options?: Partial<ContextOptions>
  ): ContextWithSources {
    const opts = { ...this.options, ...options };

    if (results.length === 0) {
      return { context: '', sources: [] };
    }

    const maxChars = opts.maxTokens * CHARS_PER_TOKEN;
    const sources: Source[] = [];
    const contextParts: string[] = [];
    let currentLength = 0;

    // Sort by similarity (highest first)
    const sortedResults = [...results].sort((a, b) => b.similarity - a.similarity);

    for (let i = 0; i < sortedResults.length; i++) {
      const result = sortedResults[i];

      // Build the content block
      const block = this.formatBlock(result, i + 1, opts);

      // Check if adding this block would exceed limit
      if (currentLength + block.length > maxChars) {
        // Try to include a truncated version
        const remaining = maxChars - currentLength;
        if (remaining > 200) { // Only include if we can fit meaningful content
          const truncatedContent = this.truncateContent(result.content, remaining - 100);
          const truncatedBlock = this.formatBlock(
            { ...result, content: truncatedContent + '...' },
            i + 1,
            opts
          );
          contextParts.push(truncatedBlock);
          sources.push(this.toSource(result));
        }
        break;
      }

      contextParts.push(block);
      currentLength += block.length;
      sources.push(this.toSource(result));
    }

    // Build final context
    let context: string;

    if (opts.format === 'markdown') {
      context = this.buildMarkdownContext(contextParts, sources, opts);
    } else {
      context = this.buildPlainContext(contextParts, opts);
    }

    return { context, sources };
  }

  private formatBlock(
    result: RetrievalResult,
    index: number,
    opts: ContextOptions
  ): string {
    if (opts.format === 'markdown') {
      const sourceInfo = opts.includeSource
        ? `\n*Source: ${result.sourceType} - ${result.title}*`
        : '';
      return `### [${index}] ${result.title}${sourceInfo}\n\n${result.content}\n`;
    } else {
      const sourceInfo = opts.includeSource
        ? ` (Source: ${result.sourceType})`
        : '';
      return `[${index}] ${result.title}${sourceInfo}\n${result.content}\n`;
    }
  }

  private buildMarkdownContext(
    parts: string[],
    sources: Source[],
    opts: ContextOptions
  ): string {
    let context = '## Relevant Context\n\n';
    context += parts.join('\n---\n\n');

    if (opts.includeSource && sources.length > 0) {
      context += '\n\n---\n\n## Sources\n';
      sources.forEach((source, i) => {
        const url = source.url ? ` - [Link](${source.url})` : '';
        context += `${i + 1}. **${source.title}** (${source.sourceType})${url}\n`;
      });
    }

    return context;
  }

  private buildPlainContext(parts: string[], _opts: ContextOptions): string {
    let context = 'RELEVANT CONTEXT:\n\n';
    context += parts.join('\n---\n');
    return context;
  }

  private truncateContent(content: string, maxLength: number): string {
    if (content.length <= maxLength) {
      return content;
    }

    // Try to truncate at a sentence boundary
    const truncated = content.slice(0, maxLength);
    const lastSentenceEnd = Math.max(
      truncated.lastIndexOf('. '),
      truncated.lastIndexOf('! '),
      truncated.lastIndexOf('? ')
    );

    if (lastSentenceEnd > maxLength * 0.7) {
      return truncated.slice(0, lastSentenceEnd + 1);
    }

    // Fall back to word boundary
    const lastSpace = truncated.lastIndexOf(' ');
    if (lastSpace > maxLength * 0.8) {
      return truncated.slice(0, lastSpace);
    }

    return truncated;
  }

  private toSource(result: RetrievalResult): Source {
    return {
      id: result.documentId,
      title: result.title,
      url: result.sourceUrl,
      sourceType: result.sourceType,
      relevance: result.similarity,
    };
  }
}

// Default singleton
let contextBuilder: ContextBuilder | null = null;

export function getContextBuilder(options?: Partial<ContextOptions>): ContextBuilder {
  if (!contextBuilder || options) {
    contextBuilder = new ContextBuilder(options);
  }
  return contextBuilder;
}

export function createContextBuilder(options?: Partial<ContextOptions>): ContextBuilder {
  return new ContextBuilder(options);
}

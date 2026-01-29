/**
 * RAG Chunk Splitter Service
 * Splits long documents into smaller chunks for embedding
 */

export interface ChunkOptions {
  /** Maximum characters per chunk */
  maxChunkSize: number;
  /** Number of characters to overlap between chunks */
  overlapSize: number;
  /** Strategy for splitting */
  splitOn: 'paragraph' | 'sentence' | 'character';
}

export interface Chunk {
  content: string;
  index: number;
  startOffset: number;
  endOffset: number;
  metadata: {
    section?: string;
    heading?: string;
  };
}

const DEFAULT_OPTIONS: ChunkOptions = {
  maxChunkSize: 1000,
  overlapSize: 200,
  splitOn: 'paragraph',
};

// Regex patterns for splitting
const PARAGRAPH_SPLIT = /\n\n+/;
const SENTENCE_SPLIT = /(?<=[.!?])\s+/;
const HEADING_PATTERN = /^(#{1,6})\s+(.+)$/gm;

export class ChunkSplitter {
  private options: ChunkOptions;

  constructor(options: Partial<ChunkOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Simple split into chunks
   */
  split(content: string, options?: Partial<ChunkOptions>): string[] {
    const opts = { ...this.options, ...options };
    return this.smartSplit(content, opts).map(chunk => chunk.content);
  }

  /**
   * Smart split that preserves semantic units and extracts metadata
   */
  smartSplit(content: string, options?: Partial<ChunkOptions>): Chunk[] {
    const opts = { ...this.options, ...options };

    if (!content || content.trim().length === 0) {
      return [];
    }

    // Extract headings for metadata
    const headings = this.extractHeadings(content);

    // Get initial segments based on split strategy
    const segments = this.getSegments(content, opts.splitOn);

    // Combine segments into chunks respecting size limits
    const chunks = this.combineIntoChunks(segments, opts, headings);

    return chunks;
  }

  private extractHeadings(content: string): Map<number, string> {
    const headings = new Map<number, string>();
    let match;

    while ((match = HEADING_PATTERN.exec(content)) !== null) {
      headings.set(match.index, match[2]);
    }

    return headings;
  }

  private getSegments(content: string, strategy: 'paragraph' | 'sentence' | 'character'): string[] {
    switch (strategy) {
      case 'paragraph':
        return content.split(PARAGRAPH_SPLIT).filter(s => s.trim().length > 0);

      case 'sentence':
        return content.split(SENTENCE_SPLIT).filter(s => s.trim().length > 0);

      case 'character':
      default:
        // For character split, we still try to break at word boundaries
        return this.splitByCharWithWordBoundary(content);
    }
  }

  private splitByCharWithWordBoundary(content: string): string[] {
    const segments: string[] = [];
    let remaining = content;

    while (remaining.length > 0) {
      if (remaining.length <= this.options.maxChunkSize) {
        segments.push(remaining);
        break;
      }

      // Find a good break point (space, newline) near the max size
      let breakPoint = this.options.maxChunkSize;
      while (breakPoint > this.options.maxChunkSize * 0.8 && !/\s/.test(remaining[breakPoint])) {
        breakPoint--;
      }

      if (breakPoint <= this.options.maxChunkSize * 0.8) {
        // No good break point found, just break at max
        breakPoint = this.options.maxChunkSize;
      }

      segments.push(remaining.slice(0, breakPoint));
      remaining = remaining.slice(breakPoint);
    }

    return segments;
  }

  private combineIntoChunks(
    segments: string[],
    opts: ChunkOptions,
    headings: Map<number, string>
  ): Chunk[] {
    const chunks: Chunk[] = [];
    let currentChunk = '';
    let currentOffset = 0;
    let chunkStartOffset = 0;
    let currentHeading: string | undefined;

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];

      // Check if adding this segment would exceed max size
      if (currentChunk.length + segment.length + 2 > opts.maxChunkSize && currentChunk.length > 0) {
        // Save current chunk
        chunks.push({
          content: currentChunk.trim(),
          index: chunks.length,
          startOffset: chunkStartOffset,
          endOffset: currentOffset,
          metadata: {
            heading: currentHeading,
          },
        });

        // Start new chunk with overlap
        const overlapStart = Math.max(0, currentChunk.length - opts.overlapSize);
        currentChunk = currentChunk.slice(overlapStart);
        chunkStartOffset = currentOffset - (currentChunk.length);
      }

      // Check for heading in segment
      const segmentHeading = this.findHeadingForOffset(headings, currentOffset);
      if (segmentHeading) {
        currentHeading = segmentHeading;
      }

      // Add segment to current chunk
      if (currentChunk.length > 0) {
        currentChunk += '\n\n';
      }
      currentChunk += segment;
      currentOffset += segment.length + 2; // +2 for potential separator
    }

    // Don't forget the last chunk
    if (currentChunk.trim().length > 0) {
      chunks.push({
        content: currentChunk.trim(),
        index: chunks.length,
        startOffset: chunkStartOffset,
        endOffset: currentOffset,
        metadata: {
          heading: currentHeading,
        },
      });
    }

    return chunks;
  }

  private findHeadingForOffset(headings: Map<number, string>, offset: number): string | undefined {
    let closestHeading: string | undefined;
    let closestOffset = -1;

    for (const [headingOffset, heading] of headings) {
      if (headingOffset <= offset && headingOffset > closestOffset) {
        closestOffset = headingOffset;
        closestHeading = heading;
      }
    }

    return closestHeading;
  }
}

// Default singleton
let chunkSplitter: ChunkSplitter | null = null;

export function getChunkSplitter(options?: Partial<ChunkOptions>): ChunkSplitter {
  if (!chunkSplitter || options) {
    chunkSplitter = new ChunkSplitter(options);
  }
  return chunkSplitter;
}

export function createChunkSplitter(options?: Partial<ChunkOptions>): ChunkSplitter {
  return new ChunkSplitter(options);
}

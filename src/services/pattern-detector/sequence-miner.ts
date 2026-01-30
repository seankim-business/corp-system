/**
 * Sequence Miner
 * Implements PrefixSpan-inspired algorithm for mining frequent action sequences
 */

import { v4 as uuidv4 } from "uuid";
import { logger } from "../../utils/logger";
import type { ActionEvent, ActionSequence, SequencePattern, SequenceMiningOptions } from "./types";

interface SequenceItem {
  actionKey: string;
  timestamp: Date;
  userId: string;
}

interface FrequentSequence {
  pattern: string[];
  support: number;
  instances: {
    userId: string;
    timestamps: Date[];
    duration: number;
  }[];
}

export class SequenceMiner {
  /**
   * Mine frequent sequences from action events using PrefixSpan-inspired algorithm
   */
  async mineSequences(
    sequences: ActionSequence[],
    options: SequenceMiningOptions,
  ): Promise<SequencePattern[]> {
    const { minSupport, minLength, maxLength, maxGap } = options;

    logger.debug("Starting sequence mining", {
      sequenceCount: sequences.length,
      minSupport,
      minLength,
      maxLength,
    });

    // Convert action sequences to item sequences
    const itemSequences = this.convertToItemSequences(sequences, maxGap);

    // Mine frequent sequences using a prefix-growth approach
    const frequentSequences = this.prefixSpan(itemSequences, minSupport, minLength, maxLength);

    // Convert to SequencePattern format
    const patterns = this.convertToPatterns(frequentSequences);

    logger.info("Sequence mining completed", {
      inputSequences: sequences.length,
      patternsFound: patterns.length,
    });

    return patterns;
  }

  /**
   * Score a pattern for SOP candidacy
   */
  scorePattern(pattern: SequencePattern): number {
    const factors = {
      // Higher frequency = better candidate
      frequencyScore: Math.min(pattern.frequency / 10, 1) * 0.3,

      // More diverse users = more generalizable
      userDiversityScore: Math.min(pattern.users.length / 5, 1) * 0.25,

      // Longer sequences = more complex automation potential
      complexityScore: Math.min((pattern.sequence.length - 1) / 5, 1) * 0.2,

      // Confidence from the mining algorithm
      confidenceScore: pattern.confidence * 0.15,

      // Time savings potential (based on avg duration)
      timeSavingsScore: Math.min(pattern.avgDuration / 300000, 1) * 0.1, // 5 min = max
    };

    return Object.values(factors).reduce((sum, score) => sum + score, 0);
  }

  /**
   * Filter patterns to only SOP-worthy candidates
   */
  filterSOPCandidates(patterns: SequencePattern[], minScore = 0.5): SequencePattern[] {
    return patterns
      .map((pattern) => ({
        pattern,
        score: this.scorePattern(pattern),
      }))
      .filter(({ score }) => score >= minScore)
      .sort((a, b) => b.score - a.score)
      .map(({ pattern, score }) => ({
        ...pattern,
        confidence: score,
        sopCandidate: true,
      }));
  }

  /**
   * Convert action sequences to item sequences for mining
   */
  private convertToItemSequences(
    sequences: ActionSequence[],
    maxGapHours: number,
  ): SequenceItem[][] {
    const maxGapMs = maxGapHours * 60 * 60 * 1000;

    return sequences.map((seq) => {
      const items: SequenceItem[] = [];
      let lastTimestamp: Date | null = null;

      for (const action of seq.actions) {
        // Check if gap is too large (start new sub-sequence)
        if (lastTimestamp && action.timestamp.getTime() - lastTimestamp.getTime() > maxGapMs) {
          // This would split sequences, but for simplicity we'll keep the sequence
          // and let the pattern matching handle gaps
        }

        items.push({
          actionKey: this.getActionKey(action),
          timestamp: action.timestamp,
          userId: action.userId,
        });

        lastTimestamp = action.timestamp;
      }

      return items;
    });
  }

  /**
   * Get a unique key for an action (for pattern matching)
   */
  private getActionKey(action: ActionEvent): string {
    switch (action.actionType) {
      case "agent_call":
        return `agent:${action.agentId || "unknown"}`;
      case "workflow_run":
        return `workflow:${action.workflowId || "unknown"}`;
      case "tool_use":
        return `tool:${action.toolName || "unknown"}`;
      case "approval":
        return "approval";
      default:
        return `action:${action.actionType}`;
    }
  }

  /**
   * PrefixSpan-inspired frequent sequence mining
   */
  private prefixSpan(
    sequences: SequenceItem[][],
    minSupport: number,
    minLength: number,
    maxLength: number,
  ): FrequentSequence[] {
    const frequentSequences: FrequentSequence[] = [];

    // Find frequent 1-sequences (single items)
    const itemCounts = new Map<string, { count: number; instances: SequenceItem[][] }>();

    for (const seq of sequences) {
      const seenItems = new Set<string>();
      for (const item of seq) {
        if (!seenItems.has(item.actionKey)) {
          seenItems.add(item.actionKey);
          const existing = itemCounts.get(item.actionKey) || { count: 0, instances: [] };
          existing.count++;
          existing.instances.push(seq.filter((i) => i.actionKey === item.actionKey));
          itemCounts.set(item.actionKey, existing);
        }
      }
    }

    // Filter to frequent items
    const frequentItems = Array.from(itemCounts.entries())
      .filter(([_, data]) => data.count >= minSupport)
      .map(([item]) => item);

    // Recursive pattern growth
    this.growPatterns(
      [],
      sequences,
      frequentItems,
      minSupport,
      minLength,
      maxLength,
      frequentSequences,
    );

    return frequentSequences;
  }

  /**
   * Recursively grow patterns
   */
  private growPatterns(
    prefix: string[],
    projectedDb: SequenceItem[][],
    frequentItems: string[],
    minSupport: number,
    minLength: number,
    maxLength: number,
    results: FrequentSequence[],
  ): void {
    if (prefix.length >= maxLength) return;

    for (const item of frequentItems) {
      const newPrefix = [...prefix, item];

      // Find sequences containing this pattern and project database
      const { support, instances, newProjectedDb } = this.projectDatabase(
        projectedDb,
        prefix,
        item,
        minSupport,
      );

      if (support >= minSupport) {
        // Add to results if meets minimum length
        if (newPrefix.length >= minLength) {
          results.push({
            pattern: newPrefix,
            support,
            instances,
          });
        }

        // Recursively grow
        if (newProjectedDb.length > 0 && newPrefix.length < maxLength) {
          this.growPatterns(
            newPrefix,
            newProjectedDb,
            frequentItems,
            minSupport,
            minLength,
            maxLength,
            results,
          );
        }
      }
    }
  }

  /**
   * Project database for pattern extension
   */
  private projectDatabase(
    sequences: SequenceItem[][],
    prefix: string[],
    newItem: string,
    _minSupport: number,
  ): {
    support: number;
    instances: FrequentSequence["instances"];
    newProjectedDb: SequenceItem[][];
  } {
    const instances: FrequentSequence["instances"] = [];
    const newProjectedDb: SequenceItem[][] = [];

    for (const seq of sequences) {
      // Find where prefix ends and new item appears after
      let prefixEndIdx = -1;

      if (prefix.length === 0) {
        prefixEndIdx = -1;
      } else {
        // Find the prefix in the sequence
        let prefixIdx = 0;
        for (let i = 0; i < seq.length && prefixIdx < prefix.length; i++) {
          if (seq[i].actionKey === prefix[prefixIdx]) {
            prefixIdx++;
            prefixEndIdx = i;
          }
        }
        if (prefixIdx < prefix.length) continue; // Prefix not found
      }

      // Find new item after prefix
      let foundNewItem = false;
      const timestamps: Date[] = [];
      const projectedSeq: SequenceItem[] = [];

      for (let i = prefixEndIdx + 1; i < seq.length; i++) {
        if (seq[i].actionKey === newItem && !foundNewItem) {
          foundNewItem = true;
          timestamps.push(seq[i].timestamp);
          // Project: everything after this occurrence
          projectedSeq.push(...seq.slice(i + 1));
          break;
        }
      }

      if (foundNewItem) {
        const firstTimestamp = prefix.length > 0 ? seq[0].timestamp : timestamps[0];
        const lastTimestamp = timestamps[timestamps.length - 1];

        instances.push({
          userId: seq[0].userId,
          timestamps: [firstTimestamp, lastTimestamp],
          duration: lastTimestamp.getTime() - firstTimestamp.getTime(),
        });

        if (projectedSeq.length > 0) {
          newProjectedDb.push(projectedSeq);
        }
      }
    }

    return {
      support: instances.length,
      instances,
      newProjectedDb,
    };
  }

  /**
   * Convert frequent sequences to SequencePattern format
   */
  private convertToPatterns(frequentSequences: FrequentSequence[]): SequencePattern[] {
    return frequentSequences.map((fs) => {
      const users = [...new Set(fs.instances.map((i) => i.userId))];
      const durations = fs.instances.map((i) => i.duration);
      const avgDuration =
        durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;

      const allTimestamps = fs.instances.flatMap((i) => i.timestamps);
      const firstSeen = new Date(Math.min(...allTimestamps.map((t) => t.getTime())));
      const lastSeen = new Date(Math.max(...allTimestamps.map((t) => t.getTime())));

      return {
        id: uuidv4(),
        sequence: fs.pattern,
        frequency: fs.support,
        confidence: Math.min(fs.support / 10, 1), // Simple confidence based on support
        users,
        avgDuration,
        firstSeen,
        lastSeen,
        sopCandidate: false, // Will be set by filterSOPCandidates
      };
    });
  }
}

// Export singleton instance
export const sequenceMiner = new SequenceMiner();

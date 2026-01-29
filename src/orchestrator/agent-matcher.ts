import { AgentConfig, loadAgents } from "../config/agent-loader";
import { loadSkillsForAgent, SkillConfig } from "../config/skill-loader";
import { RequestAnalysis } from "./types";
import { logger } from "../utils/logger";

export interface AgentMatchResult {
  agent: AgentConfig;
  confidence: number;
  matchedKeywords: string[];
  skills: SkillConfig[];
}

export interface AgentMatchOptions {
  minConfidence?: number;
  includeSkills?: boolean;
}

/**
 * Match a user request to the most appropriate agent based on routing_keywords
 */
export function matchAgent(
  analysis: RequestAnalysis,
  agents?: AgentConfig[],
  options: AgentMatchOptions = {},
): AgentMatchResult | null {
  const { minConfidence = 0.3, includeSkills = true } = options;
  const agentList = agents || loadAgents();

  if (agentList.length === 0) {
    logger.warn("No agents loaded for matching");
    return null;
  }

  const scores: Array<{
    agent: AgentConfig;
    score: number;
    matchedKeywords: string[];
  }> = [];

  const requestText = analysis.keywords.join(" ").toLowerCase();
  const requestKeywords = new Set(analysis.keywords.map((k) => k.toLowerCase()));

  for (const agent of agentList) {
    let score = 0;
    const matchedKeywords: string[] = [];

    for (const keyword of agent.routing_keywords) {
      const lowerKeyword = keyword.toLowerCase();

      // Exact match in keywords
      if (requestKeywords.has(lowerKeyword)) {
        score += 2;
        matchedKeywords.push(keyword);
        continue;
      }

      // Partial match in full text
      if (requestText.includes(lowerKeyword)) {
        score += 1;
        matchedKeywords.push(keyword);
      }
    }

    // Boost score based on entity matches
    if (analysis.entities.target) {
      const targetLower = analysis.entities.target.toLowerCase();
      if (agent.tools.some((tool) => tool.toLowerCase().includes(targetLower))) {
        score += 1.5;
      }
    }

    if (analysis.entities.action) {
      const actionLower = analysis.entities.action.toLowerCase();
      if (agent.routing_keywords.some((k) => k.toLowerCase().includes(actionLower))) {
        score += 0.5;
      }
    }

    scores.push({ agent, score, matchedKeywords });
  }

  // Sort by score descending
  scores.sort((a, b) => b.score - a.score);

  // Check for fallback agent if no good match
  const topMatch = scores[0];
  if (!topMatch || topMatch.score === 0) {
    const fallbackAgent = agentList.find((a) => a.fallback);
    if (fallbackAgent) {
      const skills = includeSkills ? loadSkillsForAgent(fallbackAgent.skills) : [];
      return {
        agent: fallbackAgent,
        confidence: 0.5,
        matchedKeywords: [],
        skills,
      };
    }
    return null;
  }

  // Normalize confidence (max possible score depends on keywords matched)
  const maxPossibleScore = topMatch.agent.routing_keywords.length * 2 + 2;
  const confidence = Math.min(topMatch.score / maxPossibleScore, 1);

  if (confidence < minConfidence) {
    const fallbackAgent = agentList.find((a) => a.fallback);
    if (fallbackAgent) {
      const skills = includeSkills ? loadSkillsForAgent(fallbackAgent.skills) : [];
      return {
        agent: fallbackAgent,
        confidence: Math.max(confidence, 0.3),
        matchedKeywords: topMatch.matchedKeywords,
        skills,
      };
    }
    return null;
  }

  const skills = includeSkills ? loadSkillsForAgent(topMatch.agent.skills) : [];

  logger.debug("Agent matched", {
    agentId: topMatch.agent.id,
    confidence,
    matchedKeywords: topMatch.matchedKeywords,
    skillCount: skills.length,
  });

  return {
    agent: topMatch.agent,
    confidence,
    matchedKeywords: topMatch.matchedKeywords,
    skills,
  };
}

/**
 * Check if request is ambiguous (multiple agents with similar confidence)
 */
export function isAmbiguousMatch(
  analysis: RequestAnalysis,
  agents?: AgentConfig[],
  threshold = 0.1,
): { ambiguous: boolean; candidates: AgentConfig[] } {
  const agentList = agents || loadAgents();
  const scores: Array<{ agent: AgentConfig; score: number }> = [];

  const requestText = analysis.keywords.join(" ").toLowerCase();
  const requestKeywords = new Set(analysis.keywords.map((k) => k.toLowerCase()));

  for (const agent of agentList) {
    if (agent.fallback) continue;

    let score = 0;
    for (const keyword of agent.routing_keywords) {
      const lowerKeyword = keyword.toLowerCase();
      if (requestKeywords.has(lowerKeyword)) {
        score += 2;
      } else if (requestText.includes(lowerKeyword)) {
        score += 1;
      }
    }

    if (score > 0) {
      scores.push({ agent, score });
    }
  }

  if (scores.length < 2) {
    return { ambiguous: false, candidates: [] };
  }

  scores.sort((a, b) => b.score - a.score);
  const topScore = scores[0].score;
  const scoreDiff = topScore > 0 ? (topScore - scores[1].score) / topScore : 0;

  if (scoreDiff < threshold) {
    return {
      ambiguous: true,
      candidates: scores.slice(0, 3).map((s) => s.agent),
    };
  }

  return { ambiguous: false, candidates: [] };
}

/**
 * Generate clarification question for ambiguous matches
 */
export function generateClarificationQuestion(candidates: AgentConfig[]): string {
  const options = candidates
    .map((c, i) => `${i + 1}. ${c.emoji} ${c.name} - ${c.function}`)
    .join("\n");

  return `요청을 더 잘 이해하기 위해 확인이 필요합니다. 어떤 작업을 원하시나요?\n\n${options}\n\n번호로 선택하거나 더 자세히 설명해 주세요.`;
}

/**
 * Detect if multi-agent workflow is needed
 */
export function detectMultiAgentNeed(
  analysis: RequestAnalysis,
  agents?: AgentConfig[],
): { needed: boolean; suggestedAgents: AgentConfig[] } {
  const agentList = agents || loadAgents();

  if (!analysis.requiresMultiAgent) {
    return { needed: false, suggestedAgents: [] };
  }

  const matchedAgents: AgentConfig[] = [];
  const requestText = analysis.keywords.join(" ").toLowerCase();

  for (const agent of agentList) {
    if (agent.fallback) continue;

    for (const keyword of agent.routing_keywords) {
      if (requestText.includes(keyword.toLowerCase())) {
        if (!matchedAgents.includes(agent)) {
          matchedAgents.push(agent);
        }
        break;
      }
    }
  }

  return {
    needed: matchedAgents.length > 1,
    suggestedAgents: matchedAgents,
  };
}

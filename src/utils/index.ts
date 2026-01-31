/**
 * Utils module exports
 *
 * Exports utility functions for agent interoperability
 */

// Agent Intermediate Representation
export {
  AgentIR,
  AgentSource,
  ModelTier,
  CostEstimate,
  AgentModelConfig,
  AgentToolConfig,
  AgentPermissions,
  AgentMetadata,
  OMC_MODEL_TO_TIER,
  TIER_TO_OMC_MODEL,
  inferTierFromName,
  inferCostFromTier,
  normalizeAgentId,
  createMinimalAgentIR,
  validateAgentIR,
} from "./agent-ir";

// Agent Converter
export {
  omcToIR,
  nubabelToIR,
  irToOmc,
  irToNubabel,
  loadOMCAgent,
  loadNubabelAgent,
  saveAsOMC,
  saveAsNubabel,
  convertAgent,
} from "./agent-converter";

// Agent Mapping
export {
  AgentMapping,
  OMC_AGENT_MAPPING,
  getOMCToNubabelMapping,
  getNubabelToOMCMapping,
  getAgentsByCategory,
  getAgentsByTier,
  findAgentsByCapability,
  recommendAgent,
  getAllCategories,
  isValidOMCAgent,
  isValidNubabelEquivalent,
} from "./agent-mapping";

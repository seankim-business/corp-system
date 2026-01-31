/**
 * Integration tests for Agent Converter
 *
 * Tests bidirectional conversion between OMC and Nubabel agent formats:
 * - OMC -> IR -> Nubabel
 * - Nubabel -> IR -> OMC
 * - Round-trip consistency
 */

import fs from "fs";
import path from "path";
import os from "os";
import {
  omcToIR,
  nubabelToIR,
  irToOmc,
  irToNubabel,
  loadOMCAgent,
  loadNubabelAgent,
  saveAsOMC,
  saveAsNubabel,
  convertAgent,
} from "../../utils/agent-converter";
import {
  AgentIR,
  ModelTier,
  validateAgentIR,
  createMinimalAgentIR,
} from "../../utils/agent-ir";
import {
  OMC_AGENT_MAPPING,
  getOMCToNubabelMapping,
  getNubabelToOMCMapping,
  isValidOMCAgent,
  getAgentsByTier,
} from "../../utils/agent-mapping";
import { AgentConfig } from "../../config/agent-loader";

// OMC agents directory (may not exist in CI)
const OMC_AGENTS_DIR = path.join(
  os.homedir(),
  ".claude/plugins/cache/omc/oh-my-claudecode/3.7.15/agents"
);

// Nubabel agents directory
const NUBABEL_AGENTS_DIR = path.resolve(__dirname, "../../../config/agents");

// Test fixtures directory
const FIXTURES_DIR = path.join(__dirname, "__fixtures__");

// Temp directory for test outputs
let tempDir: string;

beforeAll(() => {
  // Create temp directory for test outputs
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-converter-test-"));

  // Create fixtures directory if needed
  if (!fs.existsSync(FIXTURES_DIR)) {
    fs.mkdirSync(FIXTURES_DIR, { recursive: true });
  }
});

afterAll(() => {
  // Clean up temp directory
  if (tempDir && fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true });
  }
});

describe("AgentIR", () => {
  describe("validateAgentIR", () => {
    it("should validate a complete AgentIR", () => {
      const ir: AgentIR = {
        id: "test-agent",
        name: "Test Agent",
        description: "A test agent",
        source: "omc",
        model: { tier: "medium" },
        systemPrompt: "You are a test agent.",
        tools: { allowed: ["Read", "Write"] },
        metadata: {},
      };

      const errors = validateAgentIR(ir);
      expect(errors).toHaveLength(0);
    });

    it("should detect missing required fields", () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ir = {
        name: "Test",
        source: "omc",
        model: { tier: "medium" },
        tools: { allowed: [] },
        metadata: {},
      } as unknown as AgentIR;

      const errors = validateAgentIR(ir);
      expect(errors).toContain("Missing required field: id");
    });

    it("should detect invalid tier", () => {
      const ir: AgentIR = {
        id: "test",
        name: "Test",
        description: "",
        source: "omc",
        model: { tier: "invalid" as ModelTier },
        systemPrompt: "",
        tools: { allowed: [] },
        metadata: {},
      };

      const errors = validateAgentIR(ir);
      expect(errors.some((e) => e.includes("Invalid model tier"))).toBe(true);
    });
  });

  describe("createMinimalAgentIR", () => {
    it("should create a valid minimal IR", () => {
      const ir = createMinimalAgentIR("test-id", "Test Name", "omc", "high");

      expect(ir.id).toBe("test-id");
      expect(ir.name).toBe("Test Name");
      expect(ir.source).toBe("omc");
      expect(ir.model.tier).toBe("high");
      expect(validateAgentIR(ir)).toHaveLength(0);
    });
  });
});

describe("OMC to IR Conversion", () => {
  // Create test fixture
  const createOMCFixture = (content: string, filename: string): string => {
    const filePath = path.join(tempDir, filename);
    fs.writeFileSync(filePath, content);
    return filePath;
  };

  it("should parse basic OMC agent with frontmatter", () => {
    const content = `---
name: test-executor
description: A test executor agent
model: sonnet
---

You are a test executor. Execute tasks directly.`;

    const filePath = createOMCFixture(content, "test-executor.md");
    const ir = omcToIR(filePath);

    expect(ir.id).toBe("test-executor");
    expect(ir.name).toBe("test-executor");
    expect(ir.description).toBe("A test executor agent");
    expect(ir.model.tier).toBe("medium"); // sonnet -> medium
    expect(ir.model.originalModel).toBe("sonnet");
    expect(ir.source).toBe("omc");
    expect(ir.systemPrompt).toContain("test executor");
  });

  it("should parse OMC agent with disallowed tools", () => {
    const content = `---
name: architect
description: Read-only architect
model: opus
disallowedTools: Write, Edit
---

You are a read-only architect.`;

    const filePath = createOMCFixture(content, "architect.md");
    const ir = omcToIR(filePath);

    expect(ir.tools.denied).toContain("Write");
    expect(ir.tools.denied).toContain("Edit");
  });

  it("should infer tier from agent name suffix", () => {
    const content = `---
name: executor-low
description: Low tier executor
---

Simple executor.`;

    const filePath = createOMCFixture(content, "executor-low.md");
    const ir = omcToIR(filePath);

    expect(ir.model.tier).toBe("low");
  });

  it("should infer tier from model field over name", () => {
    const content = `---
name: executor-low
description: Actually uses opus
model: opus
---

High-powered executor.`;

    const filePath = createOMCFixture(content, "exec-mismatch.md");
    const ir = omcToIR(filePath);

    expect(ir.model.tier).toBe("high"); // opus overrides -low suffix
  });

  it("should extract keywords from content", () => {
    const content = `---
name: test-agent
description: Test
model: sonnet
---

<Role>
This agent helps with analysis and debugging tasks.
It can search the codebase and find patterns.
</Role>`;

    const filePath = createOMCFixture(content, "keyword-test.md");
    const ir = omcToIR(filePath);

    expect(ir.metadata.keywords).toContain("analyze");
    expect(ir.metadata.keywords).toContain("search");
  });

  // Integration test with real OMC agents (skip if not available)
  const describeWithOMC = fs.existsSync(OMC_AGENTS_DIR)
    ? describe
    : describe.skip;

  describeWithOMC("Real OMC Agent Conversion", () => {
    it("should convert executor.md", () => {
      const ir = loadOMCAgent(path.join(OMC_AGENTS_DIR, "executor.md"));

      expect(ir.name).toBe("executor");
      expect(ir.model.tier).toBe("medium");
      expect(ir.source).toBe("omc");
      expect(ir.systemPrompt).toBeTruthy();
    });

    it("should convert architect.md", () => {
      const ir = loadOMCAgent(path.join(OMC_AGENTS_DIR, "architect.md"));

      expect(ir.name).toBe("architect");
      expect(ir.model.tier).toBe("high");
      expect(ir.tools.denied).toContain("Write");
      expect(ir.tools.denied).toContain("Edit");
    });

    it("should convert all OMC agents without errors", () => {
      const agentFiles = fs
        .readdirSync(OMC_AGENTS_DIR)
        .filter((f) => f.endsWith(".md") && f !== "AGENTS.md");

      for (const file of agentFiles) {
        const filePath = path.join(OMC_AGENTS_DIR, file);
        const ir = omcToIR(filePath);

        const errors = validateAgentIR(ir);
        expect(errors).toHaveLength(0);
        expect(ir.id).toBeTruthy();
        expect(ir.name).toBeTruthy();
      }
    });
  });
});

describe("Nubabel to IR Conversion", () => {
  it("should convert Nubabel AgentConfig to IR", () => {
    const config: AgentConfig = {
      id: "dev-agent",
      name: "Development Agent",
      function: "Handles development tasks",
      description: "Development agent for code tasks",
      emoji: "💻",
      skills: ["code-review", "implementation"],
      tools: ["github", "linear"],
      routing_keywords: ["dev", "code", "pr"],
      permissions: {
        read: ["github:*"],
        write: ["github:issues/*"],
      },
      sops: ["/sops/dev/review.yaml"],
      enabled: true,
      fallback: false,
    };

    const ir = nubabelToIR(config);

    expect(ir.id).toBe("dev-agent");
    expect(ir.name).toBe("Development Agent");
    expect(ir.source).toBe("nubabel");
    expect(ir.tools.allowed).toContain("github");
    expect(ir.tools.allowed).toContain("linear");
    expect(ir.permissions?.read).toContain("github:*");
    expect(ir.metadata.skills).toContain("code-review");
    expect(ir.metadata.keywords).toContain("dev");
  });

  it("should infer tier from config complexity", () => {
    // Simple config -> low tier
    const simpleConfig: AgentConfig = {
      id: "simple",
      name: "Simple Agent",
      function: "Simple tasks",
      description: "Simple",
      emoji: "🤖",
      skills: ["basic"],
      tools: ["slack"],
      routing_keywords: ["help"],
      permissions: { read: [], write: [] },
      enabled: true,
      fallback: false,
    };

    const simpleIR = nubabelToIR(simpleConfig);
    expect(simpleIR.model.tier).toBe("low");

    // Complex config -> high tier
    const complexConfig: AgentConfig = {
      id: "complex",
      name: "Complex Agent",
      function: "Complex tasks",
      description: "Complex",
      emoji: "🧠",
      skills: ["a", "b", "c", "d", "e"],
      tools: ["github", "linear", "slack", "notion"],
      routing_keywords: ["complex"],
      permissions: { read: [], write: [] },
      sops: ["/sop1", "/sop2", "/sop3"],
      enabled: true,
      fallback: false,
    };

    const complexIR = nubabelToIR(complexConfig);
    expect(complexIR.model.tier).toBe("high");
  });

  // Integration test with real Nubabel agents
  const describeWithNubabel = fs.existsSync(NUBABEL_AGENTS_DIR)
    ? describe
    : describe.skip;

  describeWithNubabel("Real Nubabel Agent Conversion", () => {
    it("should convert dev-agent.yaml", () => {
      const ir = loadNubabelAgent(
        path.join(NUBABEL_AGENTS_DIR, "dev-agent.yaml")
      );

      expect(ir.id).toBe("dev-agent");
      expect(ir.source).toBe("nubabel");
      expect(ir.tools.allowed).toContain("github");
    });

    it("should convert all Nubabel agents without errors", () => {
      const agentFiles = fs
        .readdirSync(NUBABEL_AGENTS_DIR)
        .filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"));

      for (const file of agentFiles) {
        const filePath = path.join(NUBABEL_AGENTS_DIR, file);
        const ir = loadNubabelAgent(filePath);

        const errors = validateAgentIR(ir);
        expect(errors).toHaveLength(0);
        expect(ir.id).toBeTruthy();
        expect(ir.name).toBeTruthy();
      }
    });
  });
});

describe("IR to OMC Conversion", () => {
  it("should generate valid OMC markdown", () => {
    const ir: AgentIR = {
      id: "test-agent",
      name: "Test Agent",
      description: "A test agent for conversion",
      source: "nubabel",
      model: { tier: "medium" },
      systemPrompt: "You are a test agent. Do your best.",
      tools: {
        allowed: ["Read", "Write"],
        denied: ["Edit"],
      },
      metadata: {
        category: "testing",
        keywords: ["test", "demo"],
      },
    };

    const markdown = irToOmc(ir);

    expect(markdown).toContain("---");
    expect(markdown).toContain("name: Test Agent");
    expect(markdown).toContain("model: sonnet");
    expect(markdown).toContain("disallowedTools: Edit");
    expect(markdown).toContain("You are a test agent");
  });

  it("should use original model when available", () => {
    const ir: AgentIR = {
      id: "opus-agent",
      name: "Opus Agent",
      description: "High tier agent",
      source: "omc",
      model: { tier: "high", originalModel: "opus" },
      systemPrompt: "Test",
      tools: { allowed: [] },
      metadata: {},
    };

    const markdown = irToOmc(ir);
    expect(markdown).toContain("model: opus");
  });

  it("should generate system prompt when empty", () => {
    const ir: AgentIR = {
      id: "generated",
      name: "Generated Agent",
      description: "Agent with generated prompt",
      source: "nubabel",
      model: { tier: "low" },
      systemPrompt: "",
      tools: { allowed: ["slack", "notion"] },
      permissions: {
        read: ["*"],
        write: ["slack:*"],
      },
      metadata: {
        category: "testing",
        keywords: ["test"],
      },
    };

    const markdown = irToOmc(ir);

    expect(markdown).toContain("<Role>");
    expect(markdown).toContain("Generated Agent");
    expect(markdown).toContain("<Tools>");
    expect(markdown).toContain("- slack");
  });
});

describe("IR to Nubabel Conversion", () => {
  it("should generate valid Nubabel config", () => {
    const ir: AgentIR = {
      id: "omc-executor",
      name: "OMC Executor",
      description: "Executor from OMC",
      source: "omc",
      model: { tier: "medium" },
      systemPrompt: "Execute tasks",
      tools: { allowed: [] },
      permissions: {
        read: ["github:*"],
        write: ["github:issues/*"],
      },
      metadata: {
        category: "execution",
        keywords: ["execute", "implement"],
        skills: ["implementation", "code-execution"],
      },
    };

    const config = irToNubabel(ir);

    expect(config.id).toBe("omc-executor");
    expect(config.name).toBe("OMC Executor");
    expect(config.skills).toContain("implementation");
    expect(config.routing_keywords).toContain("execute");
    expect(config.permissions.read).toContain("github:*");
  });

  it("should infer emoji from category", () => {
    const irExecution = createMinimalAgentIR("exec", "Exec", "omc");
    irExecution.metadata.category = "execution";
    const configExec = irToNubabel(irExecution);
    expect(configExec.emoji).toBe("⚡");

    const irSecurity = createMinimalAgentIR("sec", "Sec", "omc");
    irSecurity.metadata.category = "security";
    const configSec = irToNubabel(irSecurity);
    expect(configSec.emoji).toBe("🔒");
  });

  it("should infer skills from category when not provided", () => {
    const ir = createMinimalAgentIR("test", "Test", "omc");
    ir.metadata.category = "testing";

    const config = irToNubabel(ir);

    expect(config.skills).toContain("testing");
    expect(config.skills).toContain("quality-assurance");
  });
});

describe("Round-Trip Conversion", () => {
  it("should preserve data in OMC -> IR -> Nubabel -> IR round trip", () => {
    const omcContent = `---
name: roundtrip-agent
description: Agent for round-trip testing
model: sonnet
---

<Role>
You are a round-trip test agent.
</Role>

<Capabilities>
- Execute tasks
- Analyze code
</Capabilities>`;

    const filePath = path.join(tempDir, "roundtrip-omc.md");
    fs.writeFileSync(filePath, omcContent);

    // OMC -> IR
    const ir1 = omcToIR(filePath);

    // IR -> Nubabel
    const nubabelConfig = irToNubabel(ir1);

    // Nubabel -> IR
    const ir2 = nubabelToIR(nubabelConfig);

    // Core identity should be preserved
    expect(ir2.id).toBe(ir1.id);
    expect(ir2.name).toBe(ir1.name);
    // Tier should be preserved (through inference)
    expect(ir2.model.tier).toBeDefined();
  });

  it("should preserve data in Nubabel -> IR -> OMC -> IR round trip", () => {
    const nubabelConfig: AgentConfig = {
      id: "roundtrip-nubabel",
      name: "Roundtrip Nubabel Agent",
      function: "Test round-trip conversion",
      description: "Agent for testing Nubabel to OMC and back",
      emoji: "🔄",
      skills: ["conversion", "testing"],
      tools: ["slack", "github"],
      routing_keywords: ["roundtrip", "test"],
      permissions: {
        read: ["*"],
        write: ["slack:*"],
      },
      enabled: true,
      fallback: false,
    };

    // Nubabel -> IR
    const ir1 = nubabelToIR(nubabelConfig);

    // IR -> OMC
    const omcContent = irToOmc(ir1);

    // Save and reload as OMC
    const omcPath = path.join(tempDir, "roundtrip-nubabel.md");
    fs.writeFileSync(omcPath, omcContent);
    const ir2 = omcToIR(omcPath);

    // Core identity should be preserved (name may have "Agent" suffix stripped/added during OMC conversion)
    // ID is derived from name in OMC, so exact match not guaranteed
    expect(ir2.name).toBe(ir1.name);
    expect(ir2.description).toBe(ir1.description);
  });

  // Full integration with real agents (if available)
  const describeWithBoth =
    fs.existsSync(OMC_AGENTS_DIR) && fs.existsSync(NUBABEL_AGENTS_DIR)
      ? describe
      : describe.skip;

  describeWithBoth("Full Integration Round-Trip", () => {
    it("should convert real OMC executor to Nubabel and back", () => {
      const omcPath = path.join(OMC_AGENTS_DIR, "executor.md");

      // OMC -> IR -> Nubabel
      const ir1 = loadOMCAgent(omcPath);
      // Unused but verifies the conversion works
      void irToNubabel(ir1);

      // Save Nubabel
      const nubabelPath = path.join(tempDir, "executor-converted.yaml");
      saveAsNubabel(ir1, nubabelPath);

      // Nubabel -> IR
      const ir2 = loadNubabelAgent(nubabelPath);

      expect(ir2.id).toBe(ir1.id);
      expect(validateAgentIR(ir2)).toHaveLength(0);
    });

    it("should convert real Nubabel dev-agent to OMC and back", () => {
      const nubabelPath = path.join(NUBABEL_AGENTS_DIR, "dev-agent.yaml");

      // Nubabel -> IR -> OMC
      const ir1 = loadNubabelAgent(nubabelPath);
      const omcContent = irToOmc(ir1);

      // Save OMC
      const omcPath = path.join(tempDir, "dev-agent-converted.md");
      fs.writeFileSync(omcPath, omcContent);

      // OMC -> IR
      const ir2 = omcToIR(omcPath);

      // ID is derived from name in OMC format, so may differ
      // Name should be preserved
      expect(ir2.name).toBe(ir1.name);
      expect(validateAgentIR(ir2)).toHaveLength(0);
    });
  });
});

describe("Agent Mapping", () => {
  it("should have mapping for all 33 OMC agents", () => {
    // 33 OMC agents: 3x executor, 3x architect, 3x explore, 3x researcher,
    // 3x designer, 1x writer, 1x vision, 1x planner, 1x critic, 1x analyst,
    // 2x qa-tester, 2x security-reviewer, 2x build-fixer, 2x tdd-guide,
    // 2x code-reviewer, 3x scientist
    expect(OMC_AGENT_MAPPING.length).toBe(33);
  });

  it("should map OMC agent names to Nubabel equivalents", () => {
    const executorMapping = getOMCToNubabelMapping("executor");
    expect(executorMapping).toBeDefined();
    expect(executorMapping?.nubabelEquivalent).toBe("task-executor");
    expect(executorMapping?.omcTier).toBe("medium");

    const architectMapping = getOMCToNubabelMapping("architect");
    expect(architectMapping).toBeDefined();
    expect(architectMapping?.nubabelEquivalent).toBe("code-analyzer-high");
    expect(architectMapping?.omcTier).toBe("high");
  });

  it("should map Nubabel IDs back to OMC", () => {
    const mapping = getNubabelToOMCMapping("task-executor");
    expect(mapping).toBeDefined();
    expect(mapping?.omcName).toBe("executor");
  });

  it("should validate OMC agent names", () => {
    expect(isValidOMCAgent("executor")).toBe(true);
    expect(isValidOMCAgent("architect")).toBe(true);
    expect(isValidOMCAgent("nonexistent")).toBe(false);
  });

  it("should get agents by tier", () => {
    const lowTier = getAgentsByTier("low");
    expect(lowTier.length).toBeGreaterThan(0);
    expect(lowTier.every((m) => m.omcTier === "low")).toBe(true);

    const highTier = getAgentsByTier("high");
    expect(highTier.length).toBeGreaterThan(0);
    expect(highTier.every((m) => m.omcTier === "high")).toBe(true);
  });

  it("should have all tiers represented", () => {
    const tiers = new Set(OMC_AGENT_MAPPING.map((m) => m.omcTier));
    expect(tiers.has("low")).toBe(true);
    expect(tiers.has("medium")).toBe(true);
    expect(tiers.has("high")).toBe(true);
  });

  it("should have unique OMC names", () => {
    const names = OMC_AGENT_MAPPING.map((m) => m.omcName);
    const uniqueNames = new Set(names);
    expect(uniqueNames.size).toBe(names.length);
  });

  it("should have unique Nubabel equivalents", () => {
    const equivalents = OMC_AGENT_MAPPING.map((m) => m.nubabelEquivalent);
    const uniqueEquivalents = new Set(equivalents);
    expect(uniqueEquivalents.size).toBe(equivalents.length);
  });
});

describe("File Operations", () => {
  it("should save and load OMC agent", () => {
    const ir: AgentIR = {
      id: "file-test",
      name: "File Test Agent",
      description: "Testing file operations",
      source: "nubabel",
      model: { tier: "medium" },
      systemPrompt: "You are a file test agent.",
      tools: { allowed: ["Read"] },
      metadata: {},
    };

    const filePath = path.join(tempDir, "file-test.md");
    saveAsOMC(ir, filePath);

    expect(fs.existsSync(filePath)).toBe(true);

    const loadedIR = loadOMCAgent(filePath);
    // ID is derived from name in OMC format
    expect(loadedIR.name).toBe(ir.name);
    expect(loadedIR.systemPrompt).toContain("file test agent");
  });

  it("should save and load Nubabel agent", () => {
    const ir: AgentIR = {
      id: "file-test-nubabel",
      name: "File Test Nubabel",
      description: "Testing Nubabel file operations",
      source: "omc",
      model: { tier: "low" },
      systemPrompt: "You are a file test agent.",
      tools: { allowed: ["slack"] },
      permissions: { read: ["*"], write: [] },
      metadata: {
        keywords: ["test"],
        skills: ["testing"],
      },
    };

    const filePath = path.join(tempDir, "file-test-nubabel.yaml");
    saveAsNubabel(ir, filePath);

    expect(fs.existsSync(filePath)).toBe(true);

    const loadedIR = loadNubabelAgent(filePath);
    expect(loadedIR.id).toBe(ir.id);
    expect(loadedIR.name).toBe(ir.name);
  });

  it("should convert between formats via convertAgent", () => {
    // Create OMC source
    const omcContent = `---
name: convert-test
description: Test conversion function
model: haiku
---

Test agent for convertAgent function.`;

    const omcPath = path.join(tempDir, "convert-source.md");
    fs.writeFileSync(omcPath, omcContent);

    // Convert to Nubabel
    const nubabelPath = path.join(tempDir, "convert-target.yaml");
    const ir = convertAgent(omcPath, "nubabel", nubabelPath);

    expect(fs.existsSync(nubabelPath)).toBe(true);
    expect(ir.source).toBe("omc");

    // Convert back to OMC
    const omcPath2 = path.join(tempDir, "convert-back.md");
    const ir2 = convertAgent(nubabelPath, "omc", omcPath2);

    expect(fs.existsSync(omcPath2)).toBe(true);
    expect(ir2.source).toBe("nubabel");
  });
});

describe("Error Handling", () => {
  it("should throw on non-existent OMC file", () => {
    expect(() => loadOMCAgent("/nonexistent/path.md")).toThrow(
      "OMC agent file not found"
    );
  });

  it("should throw on non-existent Nubabel file", () => {
    expect(() => loadNubabelAgent("/nonexistent/path.yaml")).toThrow(
      "Nubabel agent file not found"
    );
  });

  it("should throw on invalid AgentIR for conversion", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const invalidIR = {
      name: "No ID",
      source: "omc",
      model: { tier: "medium" },
      tools: { allowed: [] },
      metadata: {},
    } as unknown as AgentIR;

    expect(() => irToOmc(invalidIR)).toThrow("Invalid AgentIR");
    expect(() => irToNubabel(invalidIR)).toThrow("Invalid AgentIR");
  });

  it("should handle markdown without frontmatter", () => {
    const content = "Just markdown content without frontmatter.";
    const filePath = path.join(tempDir, "no-frontmatter.md");
    fs.writeFileSync(filePath, content);

    const ir = omcToIR(filePath);

    // Should use filename as name
    expect(ir.name).toBe("no-frontmatter");
    expect(ir.systemPrompt).toBe(content);
  });

  it("should handle unknown file extension in convertAgent", () => {
    const txtPath = path.join(tempDir, "unknown.txt");
    fs.writeFileSync(txtPath, "text content");

    expect(() => convertAgent(txtPath, "omc")).toThrow("Unknown file format");
  });
});

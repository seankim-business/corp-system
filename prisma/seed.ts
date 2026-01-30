/**
 * Prisma Seed Script
 * Seeds the database with initial data including built-in resource type schemas
 */

import { PrismaClient, InternalResourceType } from "@prisma/client";

const prisma = new PrismaClient();

// Built-in Resource Type Schemas for ERR
const BUILT_IN_TYPE_SCHEMAS = [
  {
    internalType: "vision" as InternalResourceType,
    displayName: "Vision",
    description: "Long-term aspirational statement describing the desired future state",
    fields: [
      { name: "title", type: "string", required: true, description: "Vision statement title" },
      { name: "description", type: "string", required: true, description: "Full vision statement" },
      { name: "timeframe", type: "string", required: false, description: "Target timeframe (e.g., 2030)" },
    ],
    aiDetectionKeywords: ["vision", "north star", "future state", "aspiration", "dream"],
    aiDetectionPatterns: ["vision", "north.?star", "long.?term"],
    exampleData: [
      { title: "Company Vision", description: "To be the leading provider of..." },
    ],
  },
  {
    internalType: "mission" as InternalResourceType,
    displayName: "Mission",
    description: "Statement defining the organization's purpose and primary objectives",
    fields: [
      { name: "title", type: "string", required: true, description: "Mission statement title" },
      { name: "description", type: "string", required: true, description: "Full mission statement" },
      { name: "purpose", type: "string", required: false, description: "Core purpose" },
    ],
    aiDetectionKeywords: ["mission", "purpose", "why we exist", "core purpose"],
    aiDetectionPatterns: ["mission", "purpose"],
    exampleData: [
      { title: "Our Mission", description: "We exist to empower..." },
    ],
  },
  {
    internalType: "goal" as InternalResourceType,
    displayName: "Goal",
    description: "High-level target or achievement to be accomplished",
    fields: [
      { name: "title", type: "string", required: true, description: "Goal title" },
      { name: "description", type: "string", required: false, description: "Goal description" },
      { name: "owner", type: "string", required: false, description: "Goal owner/responsible person" },
      { name: "progress", type: "number", required: false, description: "Progress percentage (0-100)" },
      { name: "dueDate", type: "date", required: false, description: "Target completion date" },
      { name: "status", type: "select", required: false, description: "Goal status" },
    ],
    aiDetectionKeywords: ["goal", "target", "outcome", "achievement", "aim"],
    aiDetectionPatterns: ["goals?", "targets?", "outcomes?"],
    exampleData: [
      { title: "Increase Revenue", progress: 75, status: "On Track" },
    ],
  },
  {
    internalType: "objective" as InternalResourceType,
    displayName: "Objective (OKR)",
    description: "Qualitative goal in OKR framework with associated key results",
    fields: [
      { name: "title", type: "string", required: true, description: "Objective title" },
      { name: "description", type: "string", required: false, description: "Objective description" },
      { name: "quarter", type: "string", required: false, description: "Quarter (Q1, Q2, Q3, Q4)" },
      { name: "owner", type: "string", required: false, description: "Objective owner" },
      { name: "progress", type: "number", required: false, description: "Overall progress (0-100)" },
      { name: "keyResults", type: "relation", required: false, description: "Associated key results" },
    ],
    aiDetectionKeywords: ["objective", "okr", "quarterly", "q1", "q2", "q3", "q4"],
    aiDetectionPatterns: ["objectives?", "okrs?", "quarterly", "\\bq[1-4]\\b"],
    exampleData: [
      { title: "Launch New Product", quarter: "Q1", progress: 60 },
    ],
  },
  {
    internalType: "key_result" as InternalResourceType,
    displayName: "Key Result",
    description: "Measurable outcome that indicates progress toward an objective",
    fields: [
      { name: "title", type: "string", required: true, description: "Key result title" },
      { name: "objective", type: "relation", required: false, description: "Parent objective" },
      { name: "target", type: "number", required: true, description: "Target value" },
      { name: "current", type: "number", required: false, description: "Current value" },
      { name: "unit", type: "string", required: false, description: "Unit of measurement" },
      { name: "progress", type: "number", required: false, description: "Progress percentage" },
    ],
    aiDetectionKeywords: ["key result", "kr", "metric", "measure", "kpi"],
    aiDetectionPatterns: ["key.?results?", "\\bkrs?\\b", "metrics?"],
    exampleData: [
      { title: "Achieve $1M ARR", target: 1000000, current: 750000, unit: "USD" },
    ],
  },
  {
    internalType: "strategy" as InternalResourceType,
    displayName: "Strategy",
    description: "High-level plan of action designed to achieve goals",
    fields: [
      { name: "title", type: "string", required: true, description: "Strategy title" },
      { name: "description", type: "string", required: false, description: "Strategy description" },
      { name: "timeline", type: "string", required: false, description: "Implementation timeline" },
      { name: "owner", type: "string", required: false, description: "Strategy owner" },
      { name: "status", type: "select", required: false, description: "Strategy status" },
    ],
    aiDetectionKeywords: ["strategy", "strategic", "initiative", "plan", "approach"],
    aiDetectionPatterns: ["strateg", "initiatives?", "strategic.?plan"],
    exampleData: [
      { title: "Market Expansion Strategy", status: "In Progress" },
    ],
  },
  {
    internalType: "business_model" as InternalResourceType,
    displayName: "Business Model",
    description: "Description of how the organization creates and delivers value",
    fields: [
      { name: "title", type: "string", required: true, description: "Business model name" },
      { name: "description", type: "string", required: false, description: "Business model description" },
      { name: "components", type: "string", required: false, description: "Key components" },
      { name: "revenue", type: "string", required: false, description: "Revenue streams" },
      { name: "customers", type: "string", required: false, description: "Customer segments" },
    ],
    aiDetectionKeywords: ["business model", "revenue", "canvas", "value proposition"],
    aiDetectionPatterns: ["business.?model", "canvas", "value.?prop"],
    exampleData: [
      { title: "SaaS Business Model", revenue: "Subscription" },
    ],
  },
  {
    internalType: "value_stream" as InternalResourceType,
    displayName: "Value Stream",
    description: "End-to-end flow of activities that deliver value to customers",
    fields: [
      { name: "title", type: "string", required: true, description: "Value stream name" },
      { name: "description", type: "string", required: false, description: "Value stream description" },
      { name: "stages", type: "string", required: false, description: "Process stages" },
      { name: "owner", type: "string", required: false, description: "Value stream owner" },
      { name: "metrics", type: "string", required: false, description: "Key metrics" },
    ],
    aiDetectionKeywords: ["value stream", "workflow", "process", "pipeline"],
    aiDetectionPatterns: ["value.?stream", "workflow", "pipeline", "process.?flow"],
    exampleData: [
      { title: "Customer Onboarding", stages: "Sign-up → Setup → Training → Go-live" },
    ],
  },
  {
    internalType: "project" as InternalResourceType,
    displayName: "Project",
    description: "Temporary endeavor undertaken to create a unique product or result",
    fields: [
      { name: "name", type: "string", required: true, description: "Project name" },
      { name: "description", type: "string", required: false, description: "Project description" },
      { name: "status", type: "select", required: false, description: "Project status" },
      { name: "owner", type: "string", required: false, description: "Project owner/manager" },
      { name: "team", type: "relation", required: false, description: "Team members" },
      { name: "startDate", type: "date", required: false, description: "Project start date" },
      { name: "endDate", type: "date", required: false, description: "Project end date" },
      { name: "progress", type: "number", required: false, description: "Completion percentage" },
    ],
    aiDetectionKeywords: ["project", "initiative", "program", "workstream"],
    aiDetectionPatterns: ["projects?", "programs?", "initiatives?"],
    exampleData: [
      { name: "Website Redesign", status: "In Progress", progress: 45 },
    ],
  },
  {
    internalType: "task" as InternalResourceType,
    displayName: "Task",
    description: "Individual work item or action to be completed",
    fields: [
      { name: "title", type: "string", required: true, description: "Task title" },
      { name: "description", type: "string", required: false, description: "Task description" },
      { name: "status", type: "select", required: false, description: "Task status" },
      { name: "assignee", type: "string", required: false, description: "Person assigned" },
      { name: "dueDate", type: "date", required: false, description: "Due date" },
      { name: "priority", type: "select", required: false, description: "Priority level" },
      { name: "project", type: "relation", required: false, description: "Parent project" },
    ],
    aiDetectionKeywords: ["task", "todo", "action", "item", "ticket", "issue"],
    aiDetectionPatterns: ["tasks?", "todos?", "tickets?", "action.?items?", "issues?"],
    exampleData: [
      { title: "Review PR #123", status: "To Do", priority: "High" },
    ],
  },
  {
    internalType: "department" as InternalResourceType,
    displayName: "Department",
    description: "Organizational unit or division within the company",
    fields: [
      { name: "name", type: "string", required: true, description: "Department name" },
      { name: "code", type: "string", required: false, description: "Department code" },
      { name: "head", type: "string", required: false, description: "Department head" },
      { name: "parentDepartment", type: "relation", required: false, description: "Parent department" },
      { name: "budget", type: "number", required: false, description: "Department budget" },
    ],
    aiDetectionKeywords: ["department", "division", "team", "unit", "org"],
    aiDetectionPatterns: ["departments?", "divisions?", "teams?", "org.?chart"],
    exampleData: [
      { name: "Engineering", code: "ENG", head: "CTO" },
    ],
  },
  {
    internalType: "position" as InternalResourceType,
    displayName: "Position",
    description: "Role or job title within the organization",
    fields: [
      { name: "title", type: "string", required: true, description: "Position title" },
      { name: "department", type: "relation", required: false, description: "Department" },
      { name: "level", type: "string", required: false, description: "Seniority level" },
      { name: "reportsTo", type: "relation", required: false, description: "Reporting manager" },
      { name: "responsibilities", type: "string", required: false, description: "Key responsibilities" },
    ],
    aiDetectionKeywords: ["position", "role", "job", "title", "career"],
    aiDetectionPatterns: ["positions?", "roles?", "job.?titles?"],
    exampleData: [
      { title: "Senior Software Engineer", level: "Senior", department: "Engineering" },
    ],
  },
  {
    internalType: "kpi" as InternalResourceType,
    displayName: "KPI",
    description: "Key Performance Indicator - measurable value demonstrating effectiveness",
    fields: [
      { name: "name", type: "string", required: true, description: "KPI name" },
      { name: "target", type: "number", required: true, description: "Target value" },
      { name: "current", type: "number", required: false, description: "Current value" },
      { name: "unit", type: "string", required: false, description: "Unit of measurement" },
      { name: "period", type: "string", required: false, description: "Measurement period" },
      { name: "owner", type: "string", required: false, description: "KPI owner" },
    ],
    aiDetectionKeywords: ["kpi", "metric", "indicator", "measure", "performance"],
    aiDetectionPatterns: ["kpis?", "metrics?", "indicators?", "performance.?measures?"],
    exampleData: [
      { name: "Monthly Active Users", target: 100000, current: 85000, unit: "users" },
    ],
  },
];

async function seedResourceTypeSchemas() {
  console.log("Seeding built-in resource type schemas...");

  for (const schema of BUILT_IN_TYPE_SCHEMAS) {
    const existing = await prisma.resourceTypeSchema.findFirst({
      where: {
        organizationId: null,
        internalType: schema.internalType,
        isBuiltIn: true,
      },
    });

    if (existing) {
      // Update existing
      await prisma.resourceTypeSchema.update({
        where: { id: existing.id },
        data: {
          displayName: schema.displayName,
          description: schema.description,
          fields: schema.fields,
          aiDetectionKeywords: schema.aiDetectionKeywords,
          aiDetectionPatterns: schema.aiDetectionPatterns,
          exampleData: schema.exampleData,
          version: existing.version + 1,
        },
      });
      console.log(`  Updated: ${schema.displayName}`);
    } else {
      // Create new
      await prisma.resourceTypeSchema.create({
        data: {
          organizationId: null, // Global/built-in
          internalType: schema.internalType,
          displayName: schema.displayName,
          description: schema.description,
          fields: schema.fields,
          aiDetectionKeywords: schema.aiDetectionKeywords,
          aiDetectionPatterns: schema.aiDetectionPatterns,
          exampleData: schema.exampleData,
          isBuiltIn: true,
        },
      });
      console.log(`  Created: ${schema.displayName}`);
    }
  }

  console.log("✅ Resource type schemas seeded successfully");
}

async function main() {
  console.log("Starting database seed...\n");

  await seedResourceTypeSchemas();

  console.log("\n✅ Database seeding completed!");
}

main()
  .catch((e) => {
    console.error("Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

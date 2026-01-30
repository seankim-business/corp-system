/**
 * Built-in Industry Templates
 *
 * Pre-configured organizational templates for common industries,
 * based on best practices and industry standards.
 */

import { IndustryType, CompanySize, GrowthStage, PositionLevel } from "../../types";

export interface BuiltInTemplateData {
  name: string;
  industry: IndustryType;
  companySize: CompanySize;
  growthStage: GrowthStage;
  description: string;
  departments: {
    name: string;
    description: string;
    positions: {
      title: string;
      level: PositionLevel;
      skills: string[];
      count?: number;
      reportsTo?: string;
    }[];
  }[];
  bestPractices: string[];
  antiPatterns: string[];
  keyRoles: string[];
}

export const BUILT_IN_TEMPLATES: BuiltInTemplateData[] = [
  // ========================================================================
  // TECHNOLOGY - STARTUP
  // ========================================================================
  {
    name: "Tech Startup - Early Stage",
    industry: "technology",
    companySize: "startup",
    growthStage: "seed",
    description:
      "Optimized for early-stage tech startups focusing on product-market fit and rapid iteration",
    departments: [
      {
        name: "Engineering",
        description: "Product development and technical infrastructure",
        positions: [
          {
            title: "Engineering Lead",
            level: 4,
            skills: ["system-design", "code-review", "technical-leadership"],
            count: 1,
          },
          {
            title: "Senior Engineer",
            level: 3,
            skills: ["backend-development", "api-design", "database-design"],
            count: 2,
            reportsTo: "Engineering Lead",
          },
          {
            title: "Frontend Engineer",
            level: 2,
            skills: ["react", "typescript", "ui-development"],
            count: 1,
            reportsTo: "Engineering Lead",
          },
        ],
      },
      {
        name: "Product",
        description: "Product strategy and user experience",
        positions: [
          {
            title: "Product Manager",
            level: 3,
            skills: ["product-strategy", "user-research", "roadmap-planning"],
            count: 1,
          },
          {
            title: "Product Designer",
            level: 2,
            skills: ["ui-ux-design", "prototyping", "user-testing"],
            count: 1,
            reportsTo: "Product Manager",
          },
        ],
      },
      {
        name: "Growth",
        description: "User acquisition and retention",
        positions: [
          {
            title: "Growth Lead",
            level: 3,
            skills: ["growth-hacking", "analytics", "conversion-optimization"],
            count: 1,
          },
          {
            title: "Content Creator",
            level: 2,
            skills: ["copywriting", "social-media", "seo"],
            count: 1,
            reportsTo: "Growth Lead",
          },
        ],
      },
    ],
    bestPractices: [
      "Keep hierarchy flat to enable fast decision-making",
      "Focus senior talent on highest-impact areas",
      "Maintain 2:1 senior to junior ratio for mentorship",
      "Cross-functional collaboration between Eng/Product/Growth",
      "Weekly all-hands for alignment",
    ],
    antiPatterns: [
      "Over-hiring before product-market fit",
      "Creating management layers too early",
      "Siloing departments with strict boundaries",
      "Hiring specialists before generalists",
    ],
    keyRoles: ["Engineering Lead", "Product Manager", "Growth Lead"],
  },

  // ========================================================================
  // FASHION - GROWTH STAGE
  // ========================================================================
  {
    name: "Fashion Brand - Growth Stage",
    industry: "fashion",
    companySize: "smb",
    growthStage: "growth",
    description:
      "Structured for growing fashion brands scaling production and distribution",
    departments: [
      {
        name: "Creative",
        description: "Design and brand creative direction",
        positions: [
          {
            title: "Creative Director",
            level: 5,
            skills: ["design-direction", "brand-vision", "trend-forecasting"],
            count: 1,
          },
          {
            title: "Senior Designer",
            level: 3,
            skills: ["fashion-design", "clo3d", "pattern-making"],
            count: 2,
            reportsTo: "Creative Director",
          },
          {
            title: "Junior Designer",
            level: 1,
            skills: ["technical-drawing", "fabric-research", "color-theory"],
            count: 3,
            reportsTo: "Senior Designer",
          },
          {
            title: "Art Director",
            level: 3,
            skills: ["visual-identity", "photography-direction", "campaign-design"],
            count: 1,
            reportsTo: "Creative Director",
          },
        ],
      },
      {
        name: "Marketing",
        description: "Brand marketing and customer acquisition",
        positions: [
          {
            title: "Marketing Lead",
            level: 4,
            skills: ["campaign-strategy", "brand-marketing", "analytics"],
            count: 1,
          },
          {
            title: "Content Creator",
            level: 2,
            skills: ["copywriting", "social-media", "influencer-relations"],
            count: 2,
            reportsTo: "Marketing Lead",
          },
          {
            title: "Performance Marketer",
            level: 2,
            skills: ["paid-advertising", "conversion-optimization", "data-analysis"],
            count: 1,
            reportsTo: "Marketing Lead",
          },
        ],
      },
      {
        name: "Operations",
        description: "Supply chain and quality control",
        positions: [
          {
            title: "Operations Manager",
            level: 4,
            skills: ["supply-chain", "vendor-management", "production-planning"],
            count: 1,
          },
          {
            title: "Quality Controller",
            level: 2,
            skills: ["quality-assurance", "inspection", "compliance"],
            count: 2,
            reportsTo: "Operations Manager",
          },
          {
            title: "Merchandiser",
            level: 2,
            skills: ["inventory-management", "demand-forecasting", "pricing"],
            count: 1,
            reportsTo: "Operations Manager",
          },
        ],
      },
    ],
    bestPractices: [
      "Establish clear creative approval chain (CD → Senior Designer → Junior)",
      "Maintain 1:3 senior to junior designer ratio for mentorship",
      "Integrate quality control with design process early",
      "Weekly creative reviews with cross-functional stakeholders",
      "Operations closely aligned with design calendar",
    ],
    antiPatterns: [
      "Allowing production to proceed without QC approval",
      "Creative working in isolation from operations constraints",
      "Hiring junior designers without senior mentorship",
      "Marketing launching campaigns before product readiness",
    ],
    keyRoles: ["Creative Director", "Marketing Lead", "Operations Manager"],
  },

  // ========================================================================
  // ECOMMERCE - MATURE STAGE
  // ========================================================================
  {
    name: "E-commerce - Mature Stage",
    industry: "ecommerce",
    companySize: "enterprise",
    growthStage: "mature",
    description: "Comprehensive structure for established e-commerce operations",
    departments: [
      {
        name: "Engineering",
        description: "Platform development and infrastructure",
        positions: [
          {
            title: "VP Engineering",
            level: 5,
            skills: ["engineering-leadership", "strategic-planning", "team-scaling"],
            count: 1,
          },
          {
            title: "Engineering Manager",
            level: 4,
            skills: ["team-management", "architecture-review", "delivery-management"],
            count: 3,
            reportsTo: "VP Engineering",
          },
          {
            title: "Senior Engineer",
            level: 3,
            skills: ["system-design", "microservices", "performance-optimization"],
            count: 6,
            reportsTo: "Engineering Manager",
          },
          {
            title: "DevOps Engineer",
            level: 3,
            skills: ["kubernetes", "ci-cd", "monitoring"],
            count: 2,
            reportsTo: "Engineering Manager",
          },
        ],
      },
      {
        name: "Product",
        description: "Product strategy and management",
        positions: [
          {
            title: "VP Product",
            level: 5,
            skills: ["product-leadership", "strategic-planning", "stakeholder-management"],
            count: 1,
          },
          {
            title: "Product Manager",
            level: 3,
            skills: ["product-strategy", "roadmap-planning", "data-analysis"],
            count: 4,
            reportsTo: "VP Product",
          },
          {
            title: "UX Designer",
            level: 3,
            skills: ["user-research", "information-architecture", "usability-testing"],
            count: 2,
            reportsTo: "VP Product",
          },
        ],
      },
      {
        name: "Marketing",
        description: "Customer acquisition and retention",
        positions: [
          {
            title: "CMO",
            level: 5,
            skills: ["marketing-strategy", "brand-leadership", "budget-management"],
            count: 1,
          },
          {
            title: "Performance Marketing Manager",
            level: 4,
            skills: ["paid-acquisition", "attribution-modeling", "roi-optimization"],
            count: 2,
            reportsTo: "CMO",
          },
          {
            title: "CRM Manager",
            level: 4,
            skills: ["email-marketing", "customer-segmentation", "retention-strategy"],
            count: 1,
            reportsTo: "CMO",
          },
          {
            title: "Content Marketing Manager",
            level: 3,
            skills: ["content-strategy", "seo", "brand-storytelling"],
            count: 1,
            reportsTo: "CMO",
          },
        ],
      },
      {
        name: "Operations",
        description: "Fulfillment and customer service",
        positions: [
          {
            title: "COO",
            level: 5,
            skills: ["operations-leadership", "process-optimization", "vendor-management"],
            count: 1,
          },
          {
            title: "Fulfillment Manager",
            level: 4,
            skills: ["logistics", "inventory-optimization", "warehouse-management"],
            count: 2,
            reportsTo: "COO",
          },
          {
            title: "Customer Success Manager",
            level: 3,
            skills: ["customer-support", "ticket-management", "satisfaction-metrics"],
            count: 2,
            reportsTo: "COO",
          },
        ],
      },
    ],
    bestPractices: [
      "Clear ownership boundaries between Engineering/Product/Marketing",
      "Quarterly OKR planning with cross-functional alignment",
      "Engineering capacity planning 2 quarters ahead",
      "Data-driven decision-making with shared metrics dashboards",
      "Regular leadership sync (weekly) and all-hands (monthly)",
    ],
    antiPatterns: [
      "Product roadmap changes without Engineering input on feasibility",
      "Marketing campaigns launched without platform stability verification",
      "Operations working in isolation from product/engineering",
      "Siloed department metrics without company-level alignment",
    ],
    keyRoles: ["VP Engineering", "VP Product", "CMO", "COO"],
  },

  // ========================================================================
  // MANUFACTURING - GROWTH STAGE
  // ========================================================================
  {
    name: "Manufacturing - Growth Stage",
    industry: "manufacturing",
    companySize: "smb",
    growthStage: "growth",
    description: "Optimized for manufacturing companies scaling production",
    departments: [
      {
        name: "Production",
        description: "Manufacturing and production management",
        positions: [
          {
            title: "Production Director",
            level: 5,
            skills: ["production-planning", "process-optimization", "quality-management"],
            count: 1,
          },
          {
            title: "Production Manager",
            level: 4,
            skills: ["line-management", "scheduling", "workforce-planning"],
            count: 2,
            reportsTo: "Production Director",
          },
          {
            title: "Quality Engineer",
            level: 3,
            skills: ["quality-assurance", "iso-compliance", "inspection-protocols"],
            count: 2,
            reportsTo: "Production Manager",
          },
          {
            title: "Process Engineer",
            level: 3,
            skills: ["lean-manufacturing", "process-improvement", "automation"],
            count: 2,
            reportsTo: "Production Manager",
          },
        ],
      },
      {
        name: "Supply Chain",
        description: "Procurement and logistics",
        positions: [
          {
            title: "Supply Chain Manager",
            level: 4,
            skills: ["procurement", "vendor-relations", "logistics"],
            count: 1,
          },
          {
            title: "Procurement Specialist",
            level: 3,
            skills: ["sourcing", "negotiation", "cost-analysis"],
            count: 2,
            reportsTo: "Supply Chain Manager",
          },
          {
            title: "Logistics Coordinator",
            level: 2,
            skills: ["shipping", "inventory-management", "freight-management"],
            count: 2,
            reportsTo: "Supply Chain Manager",
          },
        ],
      },
      {
        name: "Engineering",
        description: "Product design and development",
        positions: [
          {
            title: "Engineering Manager",
            level: 4,
            skills: ["product-design", "cad", "prototyping"],
            count: 1,
          },
          {
            title: "Design Engineer",
            level: 3,
            skills: ["mechanical-design", "materials-engineering", "testing"],
            count: 2,
            reportsTo: "Engineering Manager",
          },
        ],
      },
      {
        name: "Sales",
        description: "Business development and customer relations",
        positions: [
          {
            title: "Sales Director",
            level: 4,
            skills: ["sales-strategy", "key-account-management", "forecasting"],
            count: 1,
          },
          {
            title: "Sales Representative",
            level: 2,
            skills: ["relationship-building", "negotiation", "product-knowledge"],
            count: 3,
            reportsTo: "Sales Director",
          },
        ],
      },
    ],
    bestPractices: [
      "Daily production standups with Production/Quality/Engineering",
      "Weekly supply chain sync with Production for materials planning",
      "Monthly capacity planning with Sales for demand forecasting",
      "Cross-functional quality reviews before scaling production",
      "Engineering change orders reviewed by Production before implementation",
    ],
    antiPatterns: [
      "Sales committing to delivery dates without Production input",
      "Engineering designs finalized without manufacturability review",
      "Quality issues escalated to customers instead of caught internally",
      "Procurement decisions made without cost impact analysis",
    ],
    keyRoles: [
      "Production Director",
      "Supply Chain Manager",
      "Engineering Manager",
      "Sales Director",
    ],
  },

  // ========================================================================
  // FINANCE - MATURE STAGE
  // ========================================================================
  {
    name: "Financial Services - Mature Stage",
    industry: "finance",
    companySize: "enterprise",
    growthStage: "mature",
    description: "Comprehensive structure for established financial services firms",
    departments: [
      {
        name: "Operations",
        description: "Core financial operations and processing",
        positions: [
          {
            title: "COO",
            level: 5,
            skills: ["operations-leadership", "risk-management", "compliance"],
            count: 1,
          },
          {
            title: "Operations Manager",
            level: 4,
            skills: ["process-management", "quality-control", "team-leadership"],
            count: 3,
            reportsTo: "COO",
          },
          {
            title: "Operations Specialist",
            level: 3,
            skills: ["transaction-processing", "reconciliation", "data-analysis"],
            count: 6,
            reportsTo: "Operations Manager",
          },
        ],
      },
      {
        name: "Compliance",
        description: "Regulatory compliance and risk management",
        positions: [
          {
            title: "Chief Compliance Officer",
            level: 5,
            skills: [
              "regulatory-compliance",
              "policy-development",
              "audit-management",
            ],
            count: 1,
          },
          {
            title: "Compliance Manager",
            level: 4,
            skills: ["compliance-monitoring", "reporting", "training"],
            count: 2,
            reportsTo: "Chief Compliance Officer",
          },
          {
            title: "Compliance Analyst",
            level: 3,
            skills: ["regulatory-research", "documentation", "control-testing"],
            count: 3,
            reportsTo: "Compliance Manager",
          },
        ],
      },
      {
        name: "Technology",
        description: "Financial systems and infrastructure",
        positions: [
          {
            title: "CTO",
            level: 5,
            skills: ["technology-strategy", "security", "infrastructure"],
            count: 1,
          },
          {
            title: "Engineering Manager",
            level: 4,
            skills: ["system-architecture", "team-management", "delivery"],
            count: 2,
            reportsTo: "CTO",
          },
          {
            title: "Senior Engineer",
            level: 3,
            skills: ["backend-development", "api-design", "database-management"],
            count: 4,
            reportsTo: "Engineering Manager",
          },
          {
            title: "Security Engineer",
            level: 3,
            skills: ["cybersecurity", "penetration-testing", "incident-response"],
            count: 2,
            reportsTo: "CTO",
          },
        ],
      },
      {
        name: "Client Services",
        description: "Customer relationship management",
        positions: [
          {
            title: "Head of Client Services",
            level: 5,
            skills: ["client-management", "service-strategy", "escalation-handling"],
            count: 1,
          },
          {
            title: "Client Services Manager",
            level: 4,
            skills: ["relationship-management", "problem-resolution", "team-leadership"],
            count: 3,
            reportsTo: "Head of Client Services",
          },
          {
            title: "Client Services Representative",
            level: 2,
            skills: ["customer-support", "product-knowledge", "communication"],
            count: 8,
            reportsTo: "Client Services Manager",
          },
        ],
      },
    ],
    bestPractices: [
      "Weekly risk committee meetings with Ops/Compliance/Technology",
      "Monthly compliance audits of operational processes",
      "Quarterly technology security reviews",
      "Daily operational metrics reporting to leadership",
      "Strict segregation of duties between operations and compliance",
    ],
    antiPatterns: [
      "Technology changes deployed without compliance review",
      "Operations proceeding with unapproved process deviations",
      "Client issues escalated externally before internal resolution",
      "Compliance working reactively instead of embedded in operations",
    ],
    keyRoles: ["COO", "Chief Compliance Officer", "CTO", "Head of Client Services"],
  },
];

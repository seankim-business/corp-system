/**
 * Multi-region Configuration
 *
 * Defines available deployment regions with their infrastructure endpoints,
 * features, and compliance certifications.
 */

export type LLMProvider = "openai" | "azure" | "anthropic" | "google";
export type ComplianceCertification = "gdpr" | "hipaa" | "soc2" | "iso27001" | "pci-dss";

export interface RegionDatabase {
  host: string;
  port: number;
  replicaHost?: string;
  replicaPort?: number;
  ssl: boolean;
}

export interface RegionRedis {
  host: string;
  port: number;
  ssl: boolean;
  cluster?: boolean;
}

export interface RegionStorage {
  bucket: string;
  endpoint: string;
  region: string;
}

export interface RegionFeatures {
  available: boolean;
  llmProvider: LLMProvider;
  llmFallbackProvider?: LLMProvider;
  compliance: ComplianceCertification[];
  maxConcurrentRequests?: number;
  rateLimitMultiplier?: number;
}

export interface Region {
  id: string;
  name: string;
  location: string;
  timezone: string;

  // Infrastructure
  database: RegionDatabase;
  redis: RegionRedis;
  storage: RegionStorage;

  // Features and compliance
  features: RegionFeatures;

  // Failover configuration
  failoverRegion?: string;
  priority: number; // Lower is higher priority for load balancing
}

export const REGIONS: Region[] = [
  {
    id: "us-east",
    name: "US East",
    location: "Virginia, USA",
    timezone: "America/New_York",
    database: {
      host: process.env.DB_US_EAST_HOST || "db-us-east.nubabel.com",
      port: parseInt(process.env.DB_US_EAST_PORT || "5432", 10),
      replicaHost: process.env.DB_US_EAST_REPLICA_HOST || "db-us-east-replica.nubabel.com",
      replicaPort: parseInt(process.env.DB_US_EAST_REPLICA_PORT || "5432", 10),
      ssl: true,
    },
    redis: {
      host: process.env.REDIS_US_EAST_HOST || "redis-us-east.nubabel.com",
      port: parseInt(process.env.REDIS_US_EAST_PORT || "6379", 10),
      ssl: true,
      cluster: false,
    },
    storage: {
      bucket: process.env.S3_US_EAST_BUCKET || "nubabel-us-east",
      endpoint: "s3.us-east-1.amazonaws.com",
      region: "us-east-1",
    },
    features: {
      available: true,
      llmProvider: "openai",
      llmFallbackProvider: "anthropic",
      compliance: ["hipaa", "soc2"],
      maxConcurrentRequests: 1000,
      rateLimitMultiplier: 1.0,
    },
    failoverRegion: "us-west",
    priority: 1,
  },
  {
    id: "us-west",
    name: "US West",
    location: "Oregon, USA",
    timezone: "America/Los_Angeles",
    database: {
      host: process.env.DB_US_WEST_HOST || "db-us-west.nubabel.com",
      port: parseInt(process.env.DB_US_WEST_PORT || "5432", 10),
      ssl: true,
    },
    redis: {
      host: process.env.REDIS_US_WEST_HOST || "redis-us-west.nubabel.com",
      port: parseInt(process.env.REDIS_US_WEST_PORT || "6379", 10),
      ssl: true,
    },
    storage: {
      bucket: process.env.S3_US_WEST_BUCKET || "nubabel-us-west",
      endpoint: "s3.us-west-2.amazonaws.com",
      region: "us-west-2",
    },
    features: {
      available: true,
      llmProvider: "openai",
      llmFallbackProvider: "anthropic",
      compliance: ["soc2"],
      maxConcurrentRequests: 500,
      rateLimitMultiplier: 1.0,
    },
    failoverRegion: "us-east",
    priority: 2,
  },
  {
    id: "eu-west",
    name: "Europe",
    location: "Frankfurt, Germany",
    timezone: "Europe/Berlin",
    database: {
      host: process.env.DB_EU_WEST_HOST || "db-eu-west.nubabel.com",
      port: parseInt(process.env.DB_EU_WEST_PORT || "5432", 10),
      replicaHost: process.env.DB_EU_WEST_REPLICA_HOST,
      ssl: true,
    },
    redis: {
      host: process.env.REDIS_EU_WEST_HOST || "redis-eu-west.nubabel.com",
      port: parseInt(process.env.REDIS_EU_WEST_PORT || "6379", 10),
      ssl: true,
    },
    storage: {
      bucket: process.env.S3_EU_WEST_BUCKET || "nubabel-eu-west",
      endpoint: "s3.eu-west-1.amazonaws.com",
      region: "eu-west-1",
    },
    features: {
      available: true,
      llmProvider: "azure", // Azure OpenAI for GDPR compliance
      llmFallbackProvider: "anthropic",
      compliance: ["gdpr", "iso27001"],
      maxConcurrentRequests: 750,
      rateLimitMultiplier: 1.0,
    },
    failoverRegion: "eu-north",
    priority: 1,
  },
  {
    id: "eu-north",
    name: "Europe North",
    location: "Stockholm, Sweden",
    timezone: "Europe/Stockholm",
    database: {
      host: process.env.DB_EU_NORTH_HOST || "db-eu-north.nubabel.com",
      port: parseInt(process.env.DB_EU_NORTH_PORT || "5432", 10),
      ssl: true,
    },
    redis: {
      host: process.env.REDIS_EU_NORTH_HOST || "redis-eu-north.nubabel.com",
      port: parseInt(process.env.REDIS_EU_NORTH_PORT || "6379", 10),
      ssl: true,
    },
    storage: {
      bucket: process.env.S3_EU_NORTH_BUCKET || "nubabel-eu-north",
      endpoint: "s3.eu-north-1.amazonaws.com",
      region: "eu-north-1",
    },
    features: {
      available: true,
      llmProvider: "azure",
      compliance: ["gdpr"],
      maxConcurrentRequests: 300,
      rateLimitMultiplier: 0.8,
    },
    failoverRegion: "eu-west",
    priority: 2,
  },
  {
    id: "ap-northeast",
    name: "Asia Pacific",
    location: "Seoul, Korea",
    timezone: "Asia/Seoul",
    database: {
      host: process.env.DB_AP_NORTHEAST_HOST || "db-ap-northeast.nubabel.com",
      port: parseInt(process.env.DB_AP_NORTHEAST_PORT || "5432", 10),
      ssl: true,
    },
    redis: {
      host: process.env.REDIS_AP_NORTHEAST_HOST || "redis-ap-northeast.nubabel.com",
      port: parseInt(process.env.REDIS_AP_NORTHEAST_PORT || "6379", 10),
      ssl: true,
    },
    storage: {
      bucket: process.env.S3_AP_NORTHEAST_BUCKET || "nubabel-ap-northeast",
      endpoint: "s3.ap-northeast-2.amazonaws.com",
      region: "ap-northeast-2",
    },
    features: {
      available: true,
      llmProvider: "openai",
      llmFallbackProvider: "google",
      compliance: [],
      maxConcurrentRequests: 500,
      rateLimitMultiplier: 1.0,
    },
    failoverRegion: "ap-southeast",
    priority: 1,
  },
  {
    id: "ap-southeast",
    name: "Asia Pacific Southeast",
    location: "Singapore",
    timezone: "Asia/Singapore",
    database: {
      host: process.env.DB_AP_SOUTHEAST_HOST || "db-ap-southeast.nubabel.com",
      port: parseInt(process.env.DB_AP_SOUTHEAST_PORT || "5432", 10),
      ssl: true,
    },
    redis: {
      host: process.env.REDIS_AP_SOUTHEAST_HOST || "redis-ap-southeast.nubabel.com",
      port: parseInt(process.env.REDIS_AP_SOUTHEAST_PORT || "6379", 10),
      ssl: true,
    },
    storage: {
      bucket: process.env.S3_AP_SOUTHEAST_BUCKET || "nubabel-ap-southeast",
      endpoint: "s3.ap-southeast-1.amazonaws.com",
      region: "ap-southeast-1",
    },
    features: {
      available: true,
      llmProvider: "openai",
      compliance: [],
      maxConcurrentRequests: 400,
      rateLimitMultiplier: 1.0,
    },
    failoverRegion: "ap-northeast",
    priority: 2,
  },
];

// Default region when none is specified
export const DEFAULT_REGION_ID = process.env.DEFAULT_REGION_ID || "us-east";

// Region lookup helpers
export function getRegionById(regionId: string): Region | undefined {
  return REGIONS.find((r) => r.id === regionId);
}

export function getDefaultRegion(): Region {
  const region = getRegionById(DEFAULT_REGION_ID);
  if (!region) {
    throw new Error(`Default region '${DEFAULT_REGION_ID}' not found`);
  }
  return region;
}

export function getAvailableRegions(): Region[] {
  return REGIONS.filter((r) => r.features.available);
}

export function getRegionsByCompliance(certification: ComplianceCertification): Region[] {
  return REGIONS.filter(
    (r) => r.features.available && r.features.compliance.includes(certification),
  );
}

export function getRegionsByProvider(provider: LLMProvider): Region[] {
  return REGIONS.filter(
    (r) =>
      r.features.available &&
      (r.features.llmProvider === provider || r.features.llmFallbackProvider === provider),
  );
}

export function getFailoverRegion(regionId: string): Region | undefined {
  const region = getRegionById(regionId);
  if (!region?.failoverRegion) return undefined;
  return getRegionById(region.failoverRegion);
}

export function isRegionAvailable(regionId: string): boolean {
  const region = getRegionById(regionId);
  return region?.features.available ?? false;
}

// Region selection based on geography (simplified)
export function getClosestRegion(countryCode: string): Region {
  const regionMap: Record<string, string> = {
    // North America
    US: "us-east",
    CA: "us-east",
    MX: "us-east",
    // Europe
    DE: "eu-west",
    FR: "eu-west",
    GB: "eu-west",
    IT: "eu-west",
    ES: "eu-west",
    NL: "eu-west",
    SE: "eu-north",
    NO: "eu-north",
    FI: "eu-north",
    DK: "eu-north",
    // Asia Pacific
    KR: "ap-northeast",
    JP: "ap-northeast",
    CN: "ap-northeast",
    SG: "ap-southeast",
    AU: "ap-southeast",
    IN: "ap-southeast",
    TH: "ap-southeast",
    VN: "ap-southeast",
  };

  const regionId = regionMap[countryCode.toUpperCase()] || DEFAULT_REGION_ID;
  return getRegionById(regionId) || getDefaultRegion();
}

// Compliance check
export function meetsComplianceRequirements(
  regionId: string,
  required: ComplianceCertification[],
): boolean {
  const region = getRegionById(regionId);
  if (!region) return false;
  return required.every((cert) => region.features.compliance.includes(cert));
}

// Export region IDs as type
export type RegionId = (typeof REGIONS)[number]["id"];

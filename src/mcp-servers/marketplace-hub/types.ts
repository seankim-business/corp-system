/**
 * Marketplace Hub MCP Types
 *
 * 기획:
 * - Marketplace Hub와 통신하기 위한 타입 정의
 * - Search, Install, Recommend, Manage 타입
 *
 * 구조:
 * - SearchMarketplaceInput/Output: 마켓플레이스 검색
 * - InstallExtensionInput/Output: 확장 설치
 * - RecommendToolsInput/Output: 도구 추천
 * - GetInstalledInput/Output: 설치된 확장 조회
 * - UninstallExtensionInput/Output: 확장 제거
 */

import { ExternalSourceItem } from "../../marketplace/services/sources/external/types";

// Search Input/Output
export interface SearchMarketplaceInput {
  query: string;
  sources?: string[]; // 'smithery', 'mcp-registry', 'glama', 'comfyui', 'civitai', 'langchain-hub'
  type?: string; // 'mcp_server', 'workflow', 'prompt', 'skill'
  limit?: number;
}

export interface SearchMarketplaceOutput {
  items: ExternalSourceItem[];
  total: number;
  sources: string[];
}

// Install Input/Output
export interface InstallExtensionInput {
  source: string;
  itemId: string;
  config?: Record<string, unknown>;
}

export interface InstallExtensionOutput {
  success: boolean;
  extensionId?: string;
  installationId?: string;
  instructions?: string;
  error?: string;
}

// Recommend Input/Output
export interface RecommendToolsInput {
  request: string; // Natural language request
  context?: Record<string, unknown>;
}

export interface ToolRecommendationOutput {
  recommendations: Array<{
    item: ExternalSourceItem;
    reason: string;
    confidence: number;
  }>;
}

// Get Installed Input/Output
export interface GetInstalledInput {
  // No input needed - uses org from context
}

export interface InstalledExtension {
  id: string;
  extensionId: string;
  name: string;
  source: string;
  type: string;
  version: string;
  installedAt: string;
}

export interface GetInstalledOutput {
  items: InstalledExtension[];
}

// Uninstall Input/Output
export interface UninstallExtensionInput {
  extensionId: string;
}

export interface UninstallExtensionOutput {
  success: boolean;
  message?: string;
}

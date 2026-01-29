/**
 * CLO3D MCP Server
 *
 * Model Context Protocol server for CLO3D integration.
 * Provides tools for design management, pattern export, and 3D rendering.
 */

export { CLO3DClient, CLO3DError } from "./client";
export type {
  CLO3DConfig,
  Design,
  Collection,
  PatternExportResult,
  RenderResult,
  ListDesignsParams,
  ExportPatternParams,
  Render3DParams,
} from "./client";

// Tool handlers
export { getDesigns, schema as getDesignsSchema } from "./tools/getDesigns";
export { exportPattern, schema as exportPatternSchema } from "./tools/exportPattern";
export { render3D, schema as render3DSchema } from "./tools/render3D";

// Tool registry for MCP
export const tools = [
  {
    name: "clo3d__getDesigns",
    handler: "./tools/getDesigns",
    description: "CLO3D에서 디자인 목록을 가져옵니다",
  },
  {
    name: "clo3d__exportPattern",
    handler: "./tools/exportPattern",
    description: "CLO3D 디자인에서 패턴을 내보냅니다",
  },
  {
    name: "clo3d__render3D",
    handler: "./tools/render3D",
    description: "CLO3D 디자인의 3D 렌더링을 생성합니다",
  },
];

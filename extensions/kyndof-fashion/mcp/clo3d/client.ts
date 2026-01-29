/**
 * CLO3D API Client
 *
 * Provides typed access to CLO3D's REST API for design management,
 * pattern export, and 3D rendering.
 */

import axios, { AxiosInstance, AxiosError } from "axios";

export interface CLO3DConfig {
  apiKey: string;
  workspaceId: string;
  baseUrl?: string;
}

export interface Design {
  id: string;
  name: string;
  collectionId: string;
  thumbnailUrl: string;
  status: "draft" | "review" | "approved";
  createdAt: Date;
  updatedAt: Date;
  metadata?: {
    season?: string;
    category?: string;
    designer?: string;
  };
}

export interface Collection {
  id: string;
  name: string;
  season: string;
  designCount: number;
  status: "planning" | "active" | "archived";
  createdAt: Date;
}

export interface PatternExportResult {
  fileUrl: string;
  fileName: string;
  format: string;
  pieces: number;
  exportedAt: Date;
}

export interface RenderResult {
  imageUrl: string;
  resolution: { width: number; height: number };
  angle: number;
  quality: string;
  renderedAt: Date;
}

export interface ListDesignsParams {
  workspaceId: string;
  collectionId?: string;
  season?: string;
  status?: "draft" | "review" | "approved";
  limit?: number;
  offset?: number;
}

export interface ExportPatternParams {
  designId: string;
  format: "dxf" | "pdf" | "ai";
  includeSeamAllowance?: boolean;
  sizes?: string[];
}

export interface Render3DParams {
  designId: string;
  angle?: number;
  quality?: "preview" | "high" | "ultra";
  backgroundColor?: string;
  showAvatar?: boolean;
}

export class CLO3DError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public code?: string
  ) {
    super(message);
    this.name = "CLO3DError";
  }
}

export class CLO3DClient {
  private client: AxiosInstance;
  private workspaceId: string;

  constructor(config: CLO3DConfig) {
    this.workspaceId = config.workspaceId;

    this.client = axios.create({
      baseURL: config.baseUrl || "https://api.clo3d.com/v1",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
        "X-Workspace-ID": config.workspaceId,
      },
      timeout: 30000,
    });

    // Response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        if (error.response) {
          const data = error.response.data as { message?: string; code?: string };
          throw new CLO3DError(
            data.message || "CLO3D API error",
            error.response.status,
            data.code
          );
        }
        throw new CLO3DError(error.message || "Network error");
      }
    );
  }

  /**
   * List designs in the workspace
   */
  async listDesigns(params: ListDesignsParams): Promise<Design[]> {
    const response = await this.client.get<{ designs: Design[] }>("/designs", {
      params: {
        workspace_id: params.workspaceId,
        collection_id: params.collectionId,
        season: params.season,
        status: params.status,
        limit: params.limit || 50,
        offset: params.offset || 0,
      },
    });

    return response.data.designs.map((d) => ({
      ...d,
      createdAt: new Date(d.createdAt),
      updatedAt: new Date(d.updatedAt),
    }));
  }

  /**
   * Get a single design by ID
   */
  async getDesign(designId: string): Promise<Design> {
    const response = await this.client.get<Design>(`/designs/${designId}`);
    return {
      ...response.data,
      createdAt: new Date(response.data.createdAt),
      updatedAt: new Date(response.data.updatedAt),
    };
  }

  /**
   * List collections
   */
  async listCollections(season?: string): Promise<Collection[]> {
    const response = await this.client.get<{ collections: Collection[] }>("/collections", {
      params: { season },
    });

    return response.data.collections.map((c) => ({
      ...c,
      createdAt: new Date(c.createdAt),
    }));
  }

  /**
   * Export pattern from a design
   */
  async exportPattern(params: ExportPatternParams): Promise<PatternExportResult> {
    const response = await this.client.post<PatternExportResult>(
      `/designs/${params.designId}/export-pattern`,
      {
        format: params.format,
        include_seam_allowance: params.includeSeamAllowance ?? true,
        sizes: params.sizes,
      }
    );

    return {
      ...response.data,
      exportedAt: new Date(response.data.exportedAt),
    };
  }

  /**
   * Render 3D image of a design
   */
  async render3D(params: Render3DParams): Promise<RenderResult> {
    const response = await this.client.post<RenderResult>(
      `/designs/${params.designId}/render`,
      {
        angle: params.angle ?? 0,
        quality: params.quality ?? "high",
        background_color: params.backgroundColor ?? "#FFFFFF",
        show_avatar: params.showAvatar ?? true,
      }
    );

    return {
      ...response.data,
      renderedAt: new Date(response.data.renderedAt),
    };
  }

  /**
   * Update design status
   */
  async updateDesignStatus(
    designId: string,
    status: "draft" | "review" | "approved"
  ): Promise<Design> {
    const response = await this.client.patch<Design>(`/designs/${designId}`, {
      status,
    });

    return {
      ...response.data,
      createdAt: new Date(response.data.createdAt),
      updatedAt: new Date(response.data.updatedAt),
    };
  }

  /**
   * Get design measurements
   */
  async getDesignMeasurements(
    designId: string
  ): Promise<Record<string, Record<string, number>>> {
    const response = await this.client.get<{ measurements: Record<string, Record<string, number>> }>(
      `/designs/${designId}/measurements`
    );
    return response.data.measurements;
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.client.get("/health");
      return true;
    } catch {
      return false;
    }
  }
}

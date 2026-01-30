/**
 * Notion Client Service
 *
 * Wrapper around @notionhq/client for extracting content from Notion pages.
 */
import { Client } from "@notionhq/client";
import {
  BlockObjectResponse,
  PageObjectResponse,
  PartialBlockObjectResponse,
} from "@notionhq/client/build/src/api-endpoints";
import { logger } from "../../utils/logger";

export interface NotionPage {
  id: string;
  title: string;
  properties: Record<string, unknown>;
  createdBy?: string;
  lastEditedBy?: string;
  createdTime: string;
  lastEditedTime: string;
}

export interface NotionBlock {
  id: string;
  type: string;
  content: string;
}

export class NotionClientService {
  private client: Client;

  constructor(apiKey?: string) {
    const key = apiKey || process.env.NOTION_API_KEY;
    if (!key) {
      throw new Error("NOTION_API_KEY is required");
    }
    this.client = new Client({ auth: key });
  }

  /**
   * Get page metadata and properties
   */
  async getPage(pageId: string): Promise<NotionPage> {
    try {
      const page = await this.client.pages.retrieve({ page_id: pageId });

      if (!("properties" in page)) {
        throw new Error("Invalid page response");
      }

      const pageObj = page as PageObjectResponse;

      // Extract title from properties
      let title = "Untitled";
      for (const [key, prop] of Object.entries(pageObj.properties)) {
        if (prop.type === "title" && prop.title.length > 0) {
          title = prop.title.map((t) => ("plain_text" in t ? t.plain_text : "")).join("");
          break;
        }
      }

      return {
        id: pageObj.id,
        title,
        properties: pageObj.properties,
        createdBy: "created_by" in pageObj && typeof pageObj.created_by === "object" && pageObj.created_by !== null && "id" in pageObj.created_by
          ? String(pageObj.created_by.id)
          : undefined,
        lastEditedBy: "last_edited_by" in pageObj && typeof pageObj.last_edited_by === "object" && pageObj.last_edited_by !== null && "id" in pageObj.last_edited_by
          ? String(pageObj.last_edited_by.id)
          : undefined,
        createdTime: pageObj.created_time,
        lastEditedTime: pageObj.last_edited_time,
      };
    } catch (error) {
      logger.error(
        "Failed to retrieve Notion page",
        { pageId },
        error instanceof Error ? error : new Error(String(error))
      );
      throw error;
    }
  }

  /**
   * Get all blocks for a page or block
   */
  async getBlockChildren(blockId: string): Promise<BlockObjectResponse[]> {
    try {
      const blocks: BlockObjectResponse[] = [];
      let cursor: string | undefined;

      do {
        const response = await this.client.blocks.children.list({
          block_id: blockId,
          start_cursor: cursor,
          page_size: 100,
        });

        for (const block of response.results) {
          if ("type" in block) {
            blocks.push(block as BlockObjectResponse);
          }
        }

        cursor = response.has_more ? response.next_cursor ?? undefined : undefined;
      } while (cursor);

      return blocks;
    } catch (error) {
      logger.error(
        "Failed to retrieve Notion block children",
        { blockId },
        error instanceof Error ? error : new Error(String(error))
      );
      throw error;
    }
  }

  /**
   * Extract plain text content from a list of blocks (recursively)
   */
  async extractTextFromBlocks(blocks: BlockObjectResponse[]): Promise<NotionBlock[]> {
    const result: NotionBlock[] = [];

    for (const block of blocks) {
      const extracted = this.extractBlockText(block);
      if (extracted) {
        result.push(extracted);
      }

      // Recursively get children if block has them
      if (block.has_children) {
        const children = await this.getBlockChildren(block.id);
        const childTexts = await this.extractTextFromBlocks(children);
        result.push(...childTexts);
      }
    }

    return result;
  }

  /**
   * Extract text from a single block
   */
  private extractBlockText(block: BlockObjectResponse): NotionBlock | null {
    const blockType = block.type;
    let content = "";

    try {
      // Handle different block types
      switch (blockType) {
        case "paragraph":
          content = this.getRichTextContent(block.paragraph.rich_text);
          break;
        case "heading_1":
          content = this.getRichTextContent(block.heading_1.rich_text);
          break;
        case "heading_2":
          content = this.getRichTextContent(block.heading_2.rich_text);
          break;
        case "heading_3":
          content = this.getRichTextContent(block.heading_3.rich_text);
          break;
        case "bulleted_list_item":
          content = this.getRichTextContent(block.bulleted_list_item.rich_text);
          break;
        case "numbered_list_item":
          content = this.getRichTextContent(block.numbered_list_item.rich_text);
          break;
        case "to_do":
          content = this.getRichTextContent(block.to_do.rich_text);
          break;
        case "toggle":
          content = this.getRichTextContent(block.toggle.rich_text);
          break;
        case "quote":
          content = this.getRichTextContent(block.quote.rich_text);
          break;
        case "callout":
          content = this.getRichTextContent(block.callout.rich_text);
          break;
        case "code":
          content = this.getRichTextContent(block.code.rich_text);
          break;
        default:
          // Skip unsupported block types (images, embeds, etc.)
          return null;
      }

      if (!content.trim()) {
        return null;
      }

      return {
        id: block.id,
        type: blockType,
        content: content.trim(),
      };
    } catch (error) {
      logger.debug("Failed to extract text from block", {
        blockId: block.id,
        blockType,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Extract plain text from rich text array
   */
  private getRichTextContent(richText: Array<{ plain_text: string }>): string {
    return richText.map((text) => text.plain_text).join("");
  }

  /**
   * Get full page content (page info + all blocks)
   */
  async getPageContent(pageId: string): Promise<{
    page: NotionPage;
    blocks: NotionBlock[];
  }> {
    const page = await this.getPage(pageId);
    const blockResponses = await this.getBlockChildren(pageId);
    const blocks = await this.extractTextFromBlocks(blockResponses);

    return { page, blocks };
  }
}

// Singleton instance
let notionClientInstance: NotionClientService | null = null;

export function getNotionClient(apiKey?: string): NotionClientService {
  if (!notionClientInstance) {
    notionClientInstance = new NotionClientService(apiKey);
  }
  return notionClientInstance;
}

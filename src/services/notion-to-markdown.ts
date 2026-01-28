/**
 * Notion Block to Markdown Converter
 *
 * Converts Notion blocks to Markdown format following the specification
 * in plan/04-sync-strategy/notion-sync.md
 *
 * Supported block types:
 * - Headings (h1, h2, h3)
 * - Paragraphs
 * - Bulleted/Numbered/To-do lists
 * - Toggle blocks
 * - Code blocks
 * - Quotes
 * - Callouts
 * - Tables
 * - Images
 * - Dividers
 * - Mentions
 */

import { logger } from "../utils/logger";

export type NotionBlockType =
  | "paragraph"
  | "heading_1"
  | "heading_2"
  | "heading_3"
  | "bulleted_list_item"
  | "numbered_list_item"
  | "to_do"
  | "toggle"
  | "code"
  | "quote"
  | "callout"
  | "divider"
  | "table"
  | "table_row"
  | "image"
  | "bookmark"
  | "embed"
  | "link_preview"
  | "file"
  | "pdf"
  | "video"
  | "audio"
  | "equation"
  | "column_list"
  | "column"
  | "synced_block"
  | "template"
  | "link_to_page"
  | "child_page"
  | "child_database"
  | "unsupported";

export interface NotionRichText {
  type: "text" | "mention" | "equation";
  text?: {
    content: string;
    link?: { url: string } | null;
  };
  mention?: {
    type: "user" | "page" | "database" | "date" | "link_preview";
    user?: { id: string; name?: string; person?: { email: string } };
    page?: { id: string };
    database?: { id: string };
    date?: { start: string; end?: string };
    link_preview?: { url: string };
  };
  equation?: {
    expression: string;
  };
  annotations?: {
    bold?: boolean;
    italic?: boolean;
    strikethrough?: boolean;
    underline?: boolean;
    code?: boolean;
    color?: string;
  };
  plain_text: string;
  href?: string | null;
}

export interface NotionBlock {
  id: string;
  type: NotionBlockType;
  has_children: boolean;
  children?: NotionBlock[];
  [key: string]: any;
}

export interface NotionPageProperties {
  [key: string]: any;
}

export interface DocumentFrontmatter {
  schema_version: string;
  kind: string;
  metadata: {
    id: string;
    title: string;
    version: string;
    status: string;
    ownership: {
      function?: string;
      agent?: string;
      human_owner?: string;
    };
    tags: string[];
    notion_source: {
      page_id: string;
      last_synced: string;
    };
  };
}

export interface ConversionResult {
  frontmatter: DocumentFrontmatter;
  markdown: string;
  images: Array<{ url: string; path: string }>;
}

export interface ConversionOptions {
  includeChildren?: boolean;
  preserveNotionLinks?: boolean;
  imageBaseUrl?: string;
  functionMapping?: Record<string, string>;
}

/**
 * Converts Notion rich text array to Markdown string
 */
function richTextToMarkdown(richTextArray: NotionRichText[]): string {
  if (!richTextArray || !Array.isArray(richTextArray)) {
    return "";
  }

  return richTextArray
    .map((richText) => {
      let text = richText.plain_text || "";

      if (richText.type === "mention" && richText.mention) {
        const mention = richText.mention;
        switch (mention.type) {
          case "user":
            const email = mention.user?.person?.email;
            const name = mention.user?.name || "Unknown";
            return email ? `@${email}` : `@${name}`;
          case "page":
            return `[Page](notion://page/${mention.page?.id || ""})`;
          case "date":
            return mention.date?.start || "";
          default:
            return text;
        }
      }

      if (richText.type === "equation" && richText.equation) {
        return `$${richText.equation.expression}$`;
      }

      const annotations = richText.annotations;
      if (annotations) {
        if (annotations.code) {
          text = `\`${text}\``;
        }
        if (annotations.bold) {
          text = `**${text}**`;
        }
        if (annotations.italic) {
          text = `*${text}*`;
        }
        if (annotations.strikethrough) {
          text = `~~${text}~~`;
        }
        if (annotations.underline) {
          text = `<u>${text}</u>`;
        }
      }

      if (richText.href) {
        text = `[${text}](${richText.href})`;
      } else if (richText.text?.link?.url) {
        text = `[${text}](${richText.text.link.url})`;
      }

      return text;
    })
    .join("");
}

/**
 * Converts a single Notion block to Markdown
 */
function blockToMarkdown(block: NotionBlock, indent = 0, listIndex = 1): string {
  const indentStr = "  ".repeat(indent);
  const content = block[block.type];

  switch (block.type) {
    case "paragraph":
      return `${indentStr}${richTextToMarkdown(content?.rich_text || [])}\n`;

    case "heading_1":
      return `# ${richTextToMarkdown(content?.rich_text || [])}\n`;

    case "heading_2":
      return `## ${richTextToMarkdown(content?.rich_text || [])}\n`;

    case "heading_3":
      return `### ${richTextToMarkdown(content?.rich_text || [])}\n`;

    case "bulleted_list_item":
      const bulletText = richTextToMarkdown(content?.rich_text || []);
      let bulletResult = `${indentStr}- ${bulletText}\n`;
      if (block.children) {
        bulletResult += blocksToMarkdown(block.children, indent + 1);
      }
      return bulletResult;

    case "numbered_list_item":
      const numberedText = richTextToMarkdown(content?.rich_text || []);
      let numberedResult = `${indentStr}${listIndex}. ${numberedText}\n`;
      if (block.children) {
        numberedResult += blocksToMarkdown(block.children, indent + 1);
      }
      return numberedResult;

    case "to_do":
      const checkbox = content?.checked ? "[x]" : "[ ]";
      const todoText = richTextToMarkdown(content?.rich_text || []);
      return `${indentStr}- ${checkbox} ${todoText}\n`;

    case "toggle":
      const summary = richTextToMarkdown(content?.rich_text || []);
      let toggleResult = `<details>\n<summary>${summary}</summary>\n\n`;
      if (block.children) {
        toggleResult += blocksToMarkdown(block.children, 0);
      }
      toggleResult += `\n</details>\n`;
      return toggleResult;

    case "code":
      const language = content?.language || "";
      const codeText = richTextToMarkdown(content?.rich_text || []);
      return `\`\`\`${language}\n${codeText}\n\`\`\`\n`;

    case "quote":
      const quoteText = richTextToMarkdown(content?.rich_text || []);
      const quoteLines = quoteText.split("\n").map((line) => `> ${line}`);
      return quoteLines.join("\n") + "\n";

    case "callout":
      const icon = content?.icon?.emoji || content?.icon?.external?.url || "";
      const calloutText = richTextToMarkdown(content?.rich_text || []);
      let calloutResult = `> **${icon}** ${calloutText}\n`;
      if (block.children) {
        const childContent = blocksToMarkdown(block.children, 0);
        calloutResult += childContent
          .split("\n")
          .map((line) => `> ${line}`)
          .join("\n");
      }
      return calloutResult;

    case "divider":
      return `---\n`;

    case "table":
      return convertTable(block);

    case "image":
      const imageUrl = content?.file?.url || content?.external?.url || "";
      const caption = content?.caption ? richTextToMarkdown(content.caption) : "image";
      return `![${caption}](${imageUrl})\n`;

    case "bookmark":
      const bookmarkUrl = content?.url || "";
      const bookmarkCaption = content?.caption ? richTextToMarkdown(content.caption) : bookmarkUrl;
      return `[${bookmarkCaption}](${bookmarkUrl})\n`;

    case "embed":
      const embedUrl = content?.url || "";
      return `[Embed](${embedUrl})\n`;

    case "link_preview":
      const previewUrl = content?.url || "";
      return `[Link](${previewUrl})\n`;

    case "equation":
      return `$$\n${content?.expression || ""}\n$$\n`;

    case "file":
    case "pdf":
      const fileUrl = content?.file?.url || content?.external?.url || "";
      const fileName = content?.name || "file";
      return `[${fileName}](${fileUrl})\n`;

    case "video":
      const videoUrl = content?.file?.url || content?.external?.url || "";
      return `[Video](${videoUrl})\n`;

    case "audio":
      const audioUrl = content?.file?.url || content?.external?.url || "";
      return `[Audio](${audioUrl})\n`;

    case "child_page":
      return `[${content?.title || "Child Page"}](notion://page/${block.id})\n`;

    case "child_database":
      return `[${content?.title || "Database"}](notion://database/${block.id})\n`;

    case "link_to_page":
      if (content?.page_id) {
        return `[Linked Page](notion://page/${content.page_id})\n`;
      }
      if (content?.database_id) {
        return `[Linked Database](notion://database/${content.database_id})\n`;
      }
      return "";

    case "column_list":
      if (block.children) {
        return blocksToMarkdown(block.children, indent);
      }
      return "";

    case "column":
      if (block.children) {
        return blocksToMarkdown(block.children, indent);
      }
      return "";

    case "synced_block":
      if (block.children) {
        return blocksToMarkdown(block.children, indent);
      }
      return "";

    case "table_row":
      return "";

    case "template":
    case "unsupported":
    default:
      logger.debug("Unsupported block type", { type: block.type, id: block.id });
      return "";
  }
}

/**
 * Converts a Notion table block to Markdown table
 */
function convertTable(tableBlock: NotionBlock): string {
  if (!tableBlock.children || tableBlock.children.length === 0) {
    return "";
  }

  const rows = tableBlock.children;
  const tableContent = tableBlock.table;
  const hasColumnHeader = tableContent?.has_column_header ?? true;

  const lines: string[] = [];

  rows.forEach((row, index) => {
    const cells = row.table_row?.cells || [];
    const cellTexts = cells.map((cell: NotionRichText[]) => richTextToMarkdown(cell));
    lines.push(`| ${cellTexts.join(" | ")} |`);

    if (index === 0 && hasColumnHeader) {
      const separator = cells.map(() => "---");
      lines.push(`| ${separator.join(" | ")} |`);
    }
  });

  return lines.join("\n") + "\n";
}

/**
 * Converts an array of Notion blocks to Markdown
 */
function blocksToMarkdown(blocks: NotionBlock[], indent = 0): string {
  const result: string[] = [];
  let listIndex = 1;
  let previousType: NotionBlockType | null = null;

  for (const block of blocks) {
    if (previousType === "numbered_list_item" && block.type !== "numbered_list_item") {
      listIndex = 1;
    }

    const markdown = blockToMarkdown(block, indent, listIndex);
    result.push(markdown);

    if (block.type === "numbered_list_item") {
      listIndex++;
    }

    previousType = block.type;
  }

  return result.join("");
}

/**
 * Extracts title from Notion page properties
 */
function extractTitle(properties: NotionPageProperties): string {
  const titleKeys = ["Name", "Title", "name", "title"];

  for (const key of titleKeys) {
    const prop = properties[key];
    if (prop?.title) {
      return prop.title.map((t: NotionRichText) => t.plain_text).join("");
    }
  }

  return "Untitled";
}

/**
 * Extracts property value from Notion page properties
 */
function extractPropertyValue(property: any): any {
  if (!property) return null;

  switch (property.type) {
    case "title":
      return property.title?.map((t: NotionRichText) => t.plain_text).join("") || "";
    case "rich_text":
      return property.rich_text?.map((t: NotionRichText) => t.plain_text).join("") || "";
    case "select":
      return property.select?.name || null;
    case "multi_select":
      return property.multi_select?.map((s: any) => s.name) || [];
    case "status":
      return property.status?.name || null;
    case "date":
      return property.date?.start || null;
    case "people":
      return property.people?.map((p: any) => p.name || p.person?.email) || [];
    case "url":
      return property.url || null;
    case "email":
      return property.email || null;
    case "phone_number":
      return property.phone_number || null;
    case "number":
      return property.number;
    case "checkbox":
      return property.checkbox || false;
    case "relation":
      return property.relation?.map((r: any) => r.id) || [];
    case "formula":
      return extractPropertyValue(property.formula);
    case "rollup":
      return extractPropertyValue(property.rollup);
    default:
      return null;
  }
}

/**
 * Generates document ID from title
 */
function generateDocumentId(title: string, kind: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 50);

  return `${kind.toLowerCase()}-${slug}`;
}

/**
 * Maps Notion status to document status
 */
function mapStatus(notionStatus: string | null): string {
  const statusMap: Record<string, string> = {
    Draft: "draft",
    "In Review": "review",
    "Ready for Official": "pending",
    Official: "active",
    Deprecated: "deprecated",
    Archived: "archived",
  };

  return statusMap[notionStatus || ""] || "draft";
}

/**
 * Infers document kind from database or properties
 */
function inferDocumentKind(properties: NotionPageProperties, databaseName?: string): string {
  if (databaseName) {
    const normalizedName = databaseName.toLowerCase();
    if (normalizedName.includes("sop")) return "SOP";
    if (normalizedName.includes("policy") || normalizedName.includes("policies")) return "Policy";
    if (normalizedName.includes("brand")) return "Brand";
    if (normalizedName.includes("skill")) return "Skill";
    if (normalizedName.includes("function")) return "Function";
  }

  const tags = extractPropertyValue(properties.Tags);
  if (Array.isArray(tags)) {
    if (tags.some((t) => t.toLowerCase().includes("sop"))) return "SOP";
    if (tags.some((t) => t.toLowerCase().includes("policy"))) return "Policy";
  }

  return "Document";
}

/**
 * Builds frontmatter from Notion page properties
 */
function buildFrontmatter(
  pageId: string,
  properties: NotionPageProperties,
  databaseName?: string,
  functionMapping?: Record<string, string>,
): DocumentFrontmatter {
  const title = extractTitle(properties);
  const kind = inferDocumentKind(properties, databaseName);
  const status = extractPropertyValue(properties.Status);
  const tags = extractPropertyValue(properties.Tags) || [];
  const version = extractPropertyValue(properties.Version) || "1.0.0";
  const functionProp = extractPropertyValue(properties.Function);
  const owner = extractPropertyValue(properties.Owner);

  const agentId = functionMapping?.[functionProp] || undefined;
  const ownerEmail = Array.isArray(owner) ? owner[0] : owner;

  return {
    schema_version: "1.0",
    kind,
    metadata: {
      id: generateDocumentId(title, kind),
      title,
      version: typeof version === "string" ? version : "1.0.0",
      status: mapStatus(status),
      ownership: {
        function: functionProp || undefined,
        agent: agentId,
        human_owner: ownerEmail || undefined,
      },
      tags: Array.isArray(tags) ? tags : [],
      notion_source: {
        page_id: pageId,
        last_synced: new Date().toISOString(),
      },
    },
  };
}

/**
 * Converts frontmatter to YAML string
 */
function frontmatterToYaml(frontmatter: DocumentFrontmatter): string {
  const lines: string[] = ["---"];

  lines.push(`schema_version: "${frontmatter.schema_version}"`);
  lines.push(`kind: "${frontmatter.kind}"`);
  lines.push("");
  lines.push("metadata:");
  lines.push(`  id: "${frontmatter.metadata.id}"`);
  lines.push(`  title: "${frontmatter.metadata.title.replace(/"/g, '\\"')}"`);
  lines.push(`  version: "${frontmatter.metadata.version}"`);
  lines.push(`  status: "${frontmatter.metadata.status}"`);
  lines.push("");
  lines.push("  ownership:");
  if (frontmatter.metadata.ownership.function) {
    lines.push(`    function: "${frontmatter.metadata.ownership.function}"`);
  }
  if (frontmatter.metadata.ownership.agent) {
    lines.push(`    agent: "${frontmatter.metadata.ownership.agent}"`);
  }
  if (frontmatter.metadata.ownership.human_owner) {
    lines.push(`    human_owner: "${frontmatter.metadata.ownership.human_owner}"`);
  }
  lines.push("");
  lines.push("  tags:");
  frontmatter.metadata.tags.forEach((tag) => {
    lines.push(`    - "${tag}"`);
  });
  lines.push("");
  lines.push("  notion_source:");
  lines.push(`    page_id: "${frontmatter.metadata.notion_source.page_id}"`);
  lines.push(`    last_synced: "${frontmatter.metadata.notion_source.last_synced}"`);

  lines.push("---");
  lines.push("");

  return lines.join("\n");
}

/**
 * Extracts image URLs from blocks for later download/upload
 */
function extractImages(blocks: NotionBlock[]): Array<{ url: string; path: string }> {
  const images: Array<{ url: string; path: string }> = [];
  let imageIndex = 0;

  function processBlock(block: NotionBlock) {
    if (block.type === "image") {
      const content = block.image;
      const url = content?.file?.url || content?.external?.url;
      if (url) {
        const ext = url.split(".").pop()?.split("?")[0] || "png";
        images.push({
          url,
          path: `images/image-${imageIndex}.${ext}`,
        });
        imageIndex++;
      }
    }

    if (block.children) {
      block.children.forEach(processBlock);
    }
  }

  blocks.forEach(processBlock);
  return images;
}

/**
 * Main conversion function: Converts Notion page to Markdown with frontmatter
 */
export function convertNotionToMarkdown(
  pageId: string,
  properties: NotionPageProperties,
  blocks: NotionBlock[],
  options: ConversionOptions = {},
): ConversionResult {
  const { functionMapping } = options;

  const frontmatter = buildFrontmatter(pageId, properties, undefined, functionMapping);
  const markdownContent = blocksToMarkdown(blocks);
  const images = extractImages(blocks);
  const fullMarkdown = frontmatterToYaml(frontmatter) + markdownContent;

  return {
    frontmatter,
    markdown: fullMarkdown,
    images,
  };
}

/**
 * Converts only blocks to markdown (no frontmatter)
 */
export function convertBlocksToMarkdown(blocks: NotionBlock[]): string {
  return blocksToMarkdown(blocks);
}

/**
 * Helper to check if a page is ready for promotion based on properties
 */
export function isReadyForPromotion(properties: NotionPageProperties): {
  ready: boolean;
  reasons: string[];
} {
  const reasons: string[] = [];

  const status = extractPropertyValue(properties.Status);
  if (status !== "Ready for Official" && status !== "Ready for Review") {
    reasons.push(`Status is "${status}", expected "Ready for Official" or "Ready for Review"`);
  }

  const owner = extractPropertyValue(properties.Owner);
  if (!owner || (Array.isArray(owner) && owner.length === 0)) {
    reasons.push("Owner not assigned");
  }

  const reviewer = extractPropertyValue(properties["Reviewed By"]);
  if (!reviewer || (Array.isArray(reviewer) && reviewer.length === 0)) {
    reasons.push("No reviewer assigned (optional)");
  }

  const tags = extractPropertyValue(properties.Tags) || [];
  if (Array.isArray(tags) && tags.includes("no-sync")) {
    reasons.push("Document has 'no-sync' tag");
  }

  if (Array.isArray(tags) && tags.includes("confidential")) {
    reasons.push("Document has 'confidential' tag");
  }

  const ready = reasons.filter((r) => !r.includes("optional")).length === 0;

  return { ready, reasons };
}

export default {
  convertNotionToMarkdown,
  convertBlocksToMarkdown,
  isReadyForPromotion,
  richTextToMarkdown,
  extractTitle,
  extractPropertyValue,
};

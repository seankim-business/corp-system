export interface BlockKitMessage {
  text: string;
  blocks?: any[];
}

export function buildSuccessMessage(
  category: string,
  output: string,
  metadata?: {
    duration?: number;
    skills?: string[];
    model?: string;
  },
): BlockKitMessage {
  const emoji = getCategoryEmoji(category);
  const categoryLabel = formatCategoryLabel(category);

  const blocks: any[] = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `${emoji} ${categoryLabel}`,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: output,
      },
    },
  ];

  if (metadata) {
    const fields: Array<{ type: "mrkdwn"; text: string }> = [];

    if (metadata.duration) {
      fields.push({
        type: "mrkdwn",
        text: `*Duration:* ${(metadata.duration / 1000).toFixed(1)}s`,
      });
    }

    if (metadata.skills && metadata.skills.length > 0) {
      fields.push({
        type: "mrkdwn",
        text: `*Skills:* ${metadata.skills.join(", ")}`,
      });
    }

    if (metadata.model) {
      fields.push({
        type: "mrkdwn",
        text: `*Model:* ${metadata.model}`,
      });
    }

    if (fields.length > 0) {
      blocks.push({
        type: "context",
        elements: fields,
      });
    }
  }

  return {
    text: `${emoji} [${categoryLabel}] ${output}`,
    blocks,
  };
}

export function buildErrorMessage(error: string): BlockKitMessage {
  return {
    text: `❌ Error: ${error}`,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `❌ *Error*\n\n${error}`,
        },
      },
    ],
  };
}

export function buildProgressMessage(
  step: string,
  progress?: number,
): BlockKitMessage {
  const progressText = progress !== undefined ? ` (${progress}%)` : "";

  return {
    text: `🤔 ${step}${progressText}`,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `🤔 *${step}*${progressText}`,
        },
      },
    ],
  };
}

function getCategoryEmoji(category: string): string {
  const emojiMap: Record<string, string> = {
    "visual-engineering": "🎨",
    ultrabrain: "🧠",
    artistry: "✨",
    quick: "⚡",
    writing: "📝",
    "unspecified-low": "🤖",
    "unspecified-high": "🚀",
  };
  return emojiMap[category] || "🤖";
}

function formatCategoryLabel(category: string): string {
  return category
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

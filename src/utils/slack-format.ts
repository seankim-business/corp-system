/**
 * Slack Message Formatting Utilities
 * Based on OpenClaw patterns for optimal Slack UX
 */

export const SLACK_TEXT_LIMIT = 4000;

/**
 * Split long messages at natural boundaries (paragraphs, then newlines)
 * Ensures each chunk is under SLACK_TEXT_LIMIT
 *
 * @param text - The text to chunk
 * @param limit - Maximum characters per chunk (default: SLACK_TEXT_LIMIT)
 * @returns Array of text chunks, each under the limit
 */
export function chunkMessage(text: string, limit: number = SLACK_TEXT_LIMIT): string[] {
  if (!text || text.length === 0) return [''];  // Return [''] not [] for empty
  if (text.length <= limit) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= limit) {
      chunks.push(remaining);
      break;
    }

    // Try to split at paragraph boundary first
    let splitPoint = remaining.lastIndexOf('\n\n', limit);

    // Fall back to single newline
    if (splitPoint < limit / 2) {
      splitPoint = remaining.lastIndexOf('\n', limit);
    }

    // Fall back to space
    if (splitPoint < limit / 2) {
      splitPoint = remaining.lastIndexOf(' ', limit);
    }

    // Last resort: hard cut
    if (splitPoint < limit / 2) {
      splitPoint = limit;
    }

    chunks.push(remaining.slice(0, splitPoint));
    remaining = remaining.slice(splitPoint).trimStart();
  }

  return chunks;
}

/**
 * Convert markdown to Slack mrkdwn format
 * Handles: bold, italic, strikethrough, code, links
 *
 * @param markdown - Standard markdown text
 * @returns Slack mrkdwn formatted text
 */
export function markdownToSlackMrkdwn(markdown: string): string {
  if (!markdown) return '';

  let result = markdown;

  // Step 1: Preserve Slack special tokens (mentions, channels, URLs)
  const slackTokens: Map<string, string> = new Map();
  let tokenIndex = 0;

  // Preserve existing Slack tokens <@user>, <#channel>, <url|text>
  result = result.replace(/<[@#!][^>]+>/g, (match) => {
    const placeholder = `\x00SLACK${tokenIndex++}\x00`;
    slackTokens.set(placeholder, match);
    return placeholder;
  });

  // Step 2: Convert markdown bold (**text** or __text__) to Slack bold (*text*)
  // Use a unique placeholder to prevent italic conversion
  const boldPlaceholder = '\x01BOLD\x01';
  result = result.replace(/\*\*(.+?)\*\*/g, `${boldPlaceholder}$1${boldPlaceholder}`);
  result = result.replace(/__(.+?)__/g, `${boldPlaceholder}$1${boldPlaceholder}`);

  // Step 3: Strikethrough: ~~text~~ to ~text~
  result = result.replace(/~~(.+?)~~/g, '~$1~');

  // Step 4: Links: [text](url) to <url|text>
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text, url) => {
    const placeholder = `\x00SLACK${tokenIndex++}\x00`;
    // Only use pipe syntax if text differs from URL
    const slackLink = (text === url || text === url.replace(/^https?:\/\//, ''))
      ? `<${url}>`
      : `<${url}|${text}>`;
    slackTokens.set(placeholder, slackLink);
    return placeholder;
  });

  // Step 5: Convert remaining angle brackets to HTML entities
  result = result.replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // Step 6: Restore bold placeholders to Slack bold (*text*)
  result = result.replace(new RegExp(boldPlaceholder, 'g'), '*');

  // Step 7: Restore all Slack tokens
  for (const [placeholder, token] of slackTokens) {
    result = result.replace(placeholder, token);
  }

  return result;
}

/**
 * Block Kit section block with mrkdwn text
 */
interface SectionBlock {
  type: 'section';
  text: {
    type: 'mrkdwn';
    text: string;
  };
}

/**
 * Format a response into Slack Block Kit blocks
 *
 * @param text - The text to format
 * @returns Array of Slack Block Kit blocks
 */
export function formatResponseBlocks(text: string): SectionBlock[] {
  if (!text) return [];

  const mrkdwnText = markdownToSlackMrkdwn(text);

  // If text is short enough, use a single section block
  if (mrkdwnText.length <= 3000) {
    return [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: mrkdwnText,
        },
      },
    ];
  }

  // For longer text, chunk it into multiple section blocks
  const chunks = chunkMessage(mrkdwnText, 3000);
  return chunks.map((chunk) => ({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: chunk,
    },
  }));
}

/**
 * Slack message payload
 */
export interface SlackMessagePayload {
  channel: string;
  text: string;
  thread_ts?: string;
  blocks?: SectionBlock[];
}

/**
 * Options for preparing Slack messages
 */
export interface PrepareSlackMessagesOptions {
  channel: string;
  threadTs?: string;
}

/**
 * Chunk and format a complete Slack message
 * Returns array of message payloads ready to send
 *
 * @param text - The text to send
 * @param options - Channel and thread options
 * @returns Array of message payloads ready to send to Slack API
 */
export function prepareSlackMessages(
  text: string,
  options: PrepareSlackMessagesOptions
): SlackMessagePayload[] {
  if (!text) {
    // Return empty message payload for empty text
    return [{
      channel: options.channel,
      text: '',
      ...(options.threadTs ? { thread_ts: options.threadTs } : {}),
      blocks: [],
    }];
  }

  const chunks = chunkMessage(text, SLACK_TEXT_LIMIT);

  return chunks.map((chunk, index) => {
    const mrkdwnChunk = markdownToSlackMrkdwn(chunk);
    const isFirst = index === 0;
    const isLast = index === chunks.length - 1;

    // Add continuation indicator for multi-part messages
    let displayText = mrkdwnChunk;
    if (chunks.length > 1) {
      if (!isLast) {
        displayText += '\n\n_...continued..._';
      }
      if (!isFirst) {
        displayText = `_...continued from above..._\n\n${displayText}`;
      }
    }

    return {
      channel: options.channel,
      text: displayText,
      ...(options.threadTs ? { thread_ts: options.threadTs } : {}),
      blocks: formatResponseBlocks(displayText),
    };
  });
}

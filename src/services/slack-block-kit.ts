export function buildSuccessMessage(data: {
  output: string;
  category: string;
  skills: string[];
  duration: number;
  model: string;
}): { text: string; blocks: any[] } {
  const { output, category, skills, duration, model } = data;

  return {
    text: output,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `✅ *Task Completed*\n\n${output}`,
        },
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `📊 *Category:* \`${category}\` | *Skills:* \`${skills.join(", ")}\` | *Model:* \`${model}\` | *Duration:* ${(duration / 1000).toFixed(2)}s`,
          },
        ],
      },
    ],
  };
}

export function buildErrorMessage(data: { error: string; eventId: string }): {
  text: string;
  blocks: any[];
} {
  const { error, eventId } = data;

  return {
    text: `Error: ${error}`,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `❌ *Error*\n\n${error}`,
        },
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `🔍 *Event ID:* \`${eventId}\``,
          },
        ],
      },
    ],
  };
}

export function buildProgressMessage(data: { status: string; progress: number }): {
  text: string;
  blocks: any[];
} {
  const { status, progress } = data;
  const progressBar =
    "▓".repeat(Math.floor(progress / 10)) + "░".repeat(10 - Math.floor(progress / 10));

  return {
    text: status,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `⏳ *Processing...*\n\n${status}\n\n${progressBar} ${progress}%`,
        },
      },
    ],
  };
}

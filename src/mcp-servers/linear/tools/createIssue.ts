import { LinearClient } from "../client";
import { CreateIssueInput, CreateIssueOutput } from "../types";

export async function createIssueTool(
  apiKey: string,
  input: CreateIssueInput,
): Promise<CreateIssueOutput> {
  const client = new LinearClient(apiKey);

  if (!input.teamId) {
    throw new Error("teamId is required");
  }

  if (!input.title) {
    throw new Error("title is required");
  }

  const issue = await client.createIssue(input);

  return { issue };
}

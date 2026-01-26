import { LinearClient } from "../client";
import { UpdateIssueInput, UpdateIssueOutput } from "../types";

export async function updateIssueTool(
  apiKey: string,
  input: UpdateIssueInput,
): Promise<UpdateIssueOutput> {
  const client = new LinearClient(apiKey);

  if (!input.issueId) {
    throw new Error("issueId is required");
  }

  const issue = await client.updateIssue(input);

  return { issue };
}

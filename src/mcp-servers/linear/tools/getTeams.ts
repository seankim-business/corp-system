import { getLinearClient } from "../client";
import { GetTeamsInput, GetTeamsOutput } from "../types";
import { MCPConnection } from "../../../orchestrator/types";

export async function getTeamsTool(
  apiKey: string,
  input: GetTeamsInput,
  connection?: MCPConnection,
  userId?: string,
): Promise<GetTeamsOutput> {
  const { client, release } = await getLinearClient({
    apiKey,
    connection,
    organizationId: connection?.organizationId,
    userId,
  });

  try {
    const teams = await client.getTeams(input.limit);

    return { teams };
  } finally {
    release();
  }
}

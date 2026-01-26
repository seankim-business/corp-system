import { LinearClient } from "../client";
import { GetTeamsInput, GetTeamsOutput } from "../types";

export async function getTeamsTool(apiKey: string, input: GetTeamsInput): Promise<GetTeamsOutput> {
  const client = new LinearClient(apiKey);

  const teams = await client.getTeams(input.limit);

  return { teams };
}

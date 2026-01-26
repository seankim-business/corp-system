import { sseManager } from "../api/sse";

export function emitOrgEvent(organizationId: string, event: string, data: unknown) {
  sseManager.sendToOrganization(organizationId, event, data);
}

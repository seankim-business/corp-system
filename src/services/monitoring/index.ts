export { agentActivityService, shutdownAgentActivityService } from "./agent-activity.service";

import { agentActivityService } from "./agent-activity.service";
import { getSlackAgentVisibilityService } from "../slack-agent-visibility.service";

const slackVisibility = getSlackAgentVisibilityService();
agentActivityService.setSlackService({
  postAgentStart: (params) => slackVisibility.postAgentStart(params).then(() => {}),
  updateAgentProgress: (activityId, update) =>
    slackVisibility.updateAgentProgress(activityId, update),
  postAgentComplete: (activityId, result) => slackVisibility.postAgentComplete(activityId, result),
});

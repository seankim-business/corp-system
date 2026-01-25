import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";
import { slackEventQueue } from "./slack-event.queue";
import { orchestrationQueue } from "./orchestration.queue";
import { notificationQueue } from "./notification.queue";
import { deadLetterQueue } from "./dead-letter.queue";

export const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath("/admin/queues");

createBullBoard({
  queues: [
    new BullMQAdapter(slackEventQueue),
    new BullMQAdapter(orchestrationQueue),
    new BullMQAdapter(notificationQueue),
    new BullMQAdapter(deadLetterQueue),
  ],
  serverAdapter,
});

export { serverAdapter as bullBoardAdapter };

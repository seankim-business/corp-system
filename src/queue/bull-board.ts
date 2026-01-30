import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";
import { slackEventQueue } from "./slack-event.queue";
import { orchestrationQueue } from "./orchestration.queue";
import { notificationQueue } from "./notification.queue";
import { deadLetterQueue } from "./dead-letter.queue";
import { scheduledTaskQueue } from "./scheduled-task.queue";
import { webhookQueue } from "./webhook.queue";
import { ragIndexingQueue } from "./rag-indexing.queue";

const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath("/admin/queues");

createBullBoard({
  queues: [
    new BullMQAdapter(slackEventQueue.getQueue()),
    new BullMQAdapter(orchestrationQueue.getQueue()),
    new BullMQAdapter(notificationQueue.getQueue()),
    new BullMQAdapter(deadLetterQueue.getQueue()),
    new BullMQAdapter(scheduledTaskQueue.getQueue()),
    new BullMQAdapter(webhookQueue.getQueue()),
    new BullMQAdapter(ragIndexingQueue.getQueue()),
  ],
  serverAdapter,
});

export { serverAdapter };

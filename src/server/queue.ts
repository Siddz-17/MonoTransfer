import { Queue } from "bullmq";
import { redis } from "../lib/redis";

export const TRANSFER_QUEUE_NAME = "transfer-queue";

export const transferQueue = new Queue(TRANSFER_QUEUE_NAME, {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 5000,
    },
    removeOnComplete: {
      age: 7 * 24 * 3600, // keep completed jobs 7 days
    },
    removeOnFail: {
      age: 30 * 24 * 3600, // keep failed jobs 30 days
    },
  },
});

export async function enqueueTransferJob(transferId: string): Promise<void> {
  // Idempotent: use transferId as jobId
  await transferQueue.add(
    "process-transfer",
    { transferId },
    {
      jobId: transferId,
    }
  );
}

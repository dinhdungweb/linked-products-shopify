import { runSyncWorker } from "../app/sync-worker.server.js";

runSyncWorker().catch((error) => {
  console.error("[SyncWorker] Fatal error:", error);
  process.exit(1);
});

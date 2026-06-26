import prisma from "./db.server.js";
import { unauthenticated } from "./shopify.server.js";
import { canAddLinks } from "./billing.server.js";
import { processAutomationsForProduct } from "./models/automation.server.js";
import {
  deleteLinkedProductMetafields,
  resetLinkedProductsStorefrontMetafields,
  syncGroupMetafields,
  syncShopActiveHandles,
} from "./sync.server.js";
import { syncShopSettingsMetafields } from "./settings-sync.server.js";
import { syncStyleCustomizationsMetafield } from "./style-sync.server.js";
import { SYNC_JOB_TYPES } from "./sync-jobs.server.js";

const LOCK_TIMEOUT_MS = 5 * 60 * 1000;
const POLL_INTERVAL_MS = Number(process.env.SYNC_WORKER_POLL_MS || 2000);
const MAX_BACKOFF_MS = 60 * 1000;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function getRetryDate(attempts) {
  const delay = Math.min(MAX_BACKOFF_MS, 1000 * (2 ** Math.max(attempts - 1, 0)));
  return new Date(Date.now() + delay);
}

async function claimNextJob() {
  const now = new Date();
  const staleBefore = new Date(Date.now() - LOCK_TIMEOUT_MS);

  const job = await prisma.syncJob.findFirst({
    where: {
      runAt: { lte: now },
      OR: [
        { status: "pending" },
        { status: "processing", lockedAt: { lt: staleBefore } },
      ],
    },
    orderBy: [
      { runAt: "asc" },
      { createdAt: "asc" },
    ],
  });

  if (!job) return null;

  const claimed = await prisma.syncJob.updateMany({
    where: {
      id: job.id,
      runAt: { lte: now },
      OR: [
        { status: "pending" },
        { status: "processing", lockedAt: { lt: staleBefore } },
      ],
    },
    data: {
      status: "processing",
      lockedAt: now,
      lastError: null,
    },
  });

  if (claimed.count === 0) return null;
  return prisma.syncJob.findUnique({ where: { id: job.id } });
}

async function markJobCompleted(jobId) {
  await prisma.syncJob.update({
    where: { id: jobId },
    data: {
      status: "completed",
      lockedAt: null,
      completedAt: new Date(),
      lastError: null,
    },
  });
}

async function markJobFailed(job, error) {
  const attempts = job.attempts + 1;
  const finalFailure = attempts >= job.maxAttempts;
  const message = getErrorMessage(error);

  await prisma.syncJob.update({
    where: { id: job.id },
    data: {
      status: finalFailure ? "failed" : "pending",
      attempts,
      lockedAt: null,
      runAt: finalFailure ? job.runAt : getRetryDate(attempts),
      lastError: message,
    },
  });

  if (job.type === SYNC_JOB_TYPES.GROUP_SYNC && job.targetId) {
    await prisma.productGroup.updateMany({
      where: { id: job.targetId, shop: job.shop },
      data: { syncStatus: finalFailure ? "error" : "pending" },
    });
  }

  console.error(`[SyncWorker] ${job.type} failed for ${job.shop}:`, message);
}

async function getAdminForJob(job) {
  const { admin } = await unauthenticated.admin(job.shop);
  return admin;
}

async function runCleanupJob(admin, job) {
  const productIds = Array.isArray(job.payload?.productIds) ? job.payload.productIds : [];
  if (productIds.length === 0) return;

  let idsToDelete = productIds;
  if (job.payload?.onlyIfUngrouped !== false) {
    const stillGrouped = await prisma.productGroupItem.findMany({
      where: { productId: { in: productIds } },
      select: { productId: true },
    });
    const groupedIds = new Set(stillGrouped.map((item) => item.productId));
    idsToDelete = productIds.filter((productId) => !groupedIds.has(productId));
  }

  await deleteLinkedProductMetafields(admin, idsToDelete);

  if (job.payload?.syncActiveHandles !== false) {
    await syncShopActiveHandles(admin, prisma, job.shop);
  }
}

async function runJob(job) {
  const admin = await getAdminForJob(job);

  switch (job.type) {
    case SYNC_JOB_TYPES.GROUP_SYNC:
      if (!job.targetId) throw new Error("group_sync targetId is required");
      await prisma.productGroup.updateMany({
        where: { id: job.targetId, shop: job.shop },
        data: { syncStatus: "syncing" },
      });
      await syncGroupMetafields(admin, prisma, job.targetId);
      break;
    case SYNC_JOB_TYPES.ACTIVE_HANDLES_SYNC:
      await syncShopActiveHandles(admin, prisma, job.shop);
      break;
    case SYNC_JOB_TYPES.SHOP_SETTINGS_SYNC:
      await syncShopSettingsMetafields(admin, prisma, job.shop);
      break;
    case SYNC_JOB_TYPES.STYLE_CUSTOMIZATIONS_SYNC:
      await syncStyleCustomizationsMetafield(admin, prisma, job.shop);
      break;
    case SYNC_JOB_TYPES.METAFIELD_CLEANUP:
      await runCleanupJob(admin, job);
      break;
    case SYNC_JOB_TYPES.STOREFRONT_METAFIELD_RESET:
      await resetLinkedProductsStorefrontMetafields(admin);
      break;
    case SYNC_JOB_TYPES.AUTOMATION_PRODUCT:
      await processAutomationsForProduct(
        admin,
        prisma,
        job.payload?.productId || job.targetId,
        job.shop,
        canAddLinks,
      );
      break;
    default:
      throw new Error(`Unknown sync job type: ${job.type}`);
  }
}

export async function processNextSyncJob() {
  const job = await claimNextJob();
  if (!job) return false;

  try {
    await runJob(job);
    await markJobCompleted(job.id);
  } catch (error) {
    await markJobFailed(job, error);
  }

  return true;
}

export async function runSyncWorker() {
  let stopping = false;

  const stop = () => {
    stopping = true;
  };

  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  console.log("[SyncWorker] Started");

  let loopErrorDelayMs = POLL_INTERVAL_MS;

  while (!stopping) {
    try {
      const processed = await processNextSyncJob();
      loopErrorDelayMs = POLL_INTERVAL_MS;

      if (!processed) {
        await wait(POLL_INTERVAL_MS);
      }
    } catch (error) {
      console.error("[SyncWorker] Worker loop error:", getErrorMessage(error));
      await wait(loopErrorDelayMs);
      loopErrorDelayMs = Math.min(MAX_BACKOFF_MS, loopErrorDelayMs * 2);
    }
  }

  await prisma.$disconnect();
  console.log("[SyncWorker] Stopped");
}

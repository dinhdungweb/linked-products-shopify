import crypto from "node:crypto";

export const SYNC_JOB_TYPES = {
  GROUP_SYNC: "group_sync",
  SHOP_SETTINGS_SYNC: "shop_settings_sync",
  STYLE_CUSTOMIZATIONS_SYNC: "style_customizations_sync",
  ACTIVE_HANDLES_SYNC: "active_handles_sync",
  METAFIELD_CLEANUP: "metafield_cleanup",
  AUTOMATION_PRODUCT: "automation_product",
};

const DEFAULT_MAX_ATTEMPTS = 3;

function buildDedupeKey({ shop, type, targetId, dedupeKey }) {
  if (dedupeKey) return dedupeKey;
  return [shop, type, targetId || "shop"].join(":");
}

function hashValue(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export async function enqueueSyncJob(prisma, {
  shop,
  type,
  targetId = null,
  payload = null,
  dedupeKey = null,
  runAt = new Date(),
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
}) {
  if (!shop) throw new Error("Sync job shop is required");
  if (!type) throw new Error("Sync job type is required");

  const key = buildDedupeKey({ shop, type, targetId, dedupeKey });
  const storedPayload = payload ?? {};

  return prisma.syncJob.upsert({
    where: { dedupeKey: key },
    update: {
      targetId,
      payload: storedPayload,
      status: "pending",
      attempts: 0,
      maxAttempts,
      runAt,
      lockedAt: null,
      completedAt: null,
      lastError: null,
    },
    create: {
      shop,
      type,
      targetId,
      payload: storedPayload,
      dedupeKey: key,
      status: "pending",
      maxAttempts,
      runAt,
    },
  });
}

export async function enqueueGroupSync(prisma, shop, groupId) {
  await prisma.productGroup.updateMany({
    where: { id: groupId, shop },
    data: { syncStatus: "pending" },
  });

  return enqueueSyncJob(prisma, {
    shop,
    type: SYNC_JOB_TYPES.GROUP_SYNC,
    targetId: groupId,
  });
}

export async function enqueueActiveHandlesSync(prisma, shop) {
  return enqueueSyncJob(prisma, {
    shop,
    type: SYNC_JOB_TYPES.ACTIVE_HANDLES_SYNC,
    targetId: shop,
  });
}

export async function enqueueShopSettingsSync(prisma, shop) {
  return enqueueSyncJob(prisma, {
    shop,
    type: SYNC_JOB_TYPES.SHOP_SETTINGS_SYNC,
    targetId: shop,
  });
}

export async function enqueueStyleCustomizationsSync(prisma, shop) {
  return enqueueSyncJob(prisma, {
    shop,
    type: SYNC_JOB_TYPES.STYLE_CUSTOMIZATIONS_SYNC,
    targetId: shop,
  });
}

export async function enqueueMetafieldCleanup(prisma, shop, productIds, {
  syncActiveHandles = true,
  onlyIfUngrouped = true,
  reason = "cleanup",
} = {}) {
  const ids = [...new Set((productIds || []).filter(Boolean))].sort();
  if (ids.length === 0) return null;

  return enqueueSyncJob(prisma, {
    shop,
    type: SYNC_JOB_TYPES.METAFIELD_CLEANUP,
    targetId: hashValue(ids.join("|")),
    payload: { productIds: ids, syncActiveHandles, onlyIfUngrouped, reason },
    dedupeKey: [shop, SYNC_JOB_TYPES.METAFIELD_CLEANUP, hashValue(ids.join("|"))].join(":"),
  });
}

export async function enqueueAutomationProduct(prisma, shop, productId) {
  return enqueueSyncJob(prisma, {
    shop,
    type: SYNC_JOB_TYPES.AUTOMATION_PRODUCT,
    targetId: productId,
    payload: { productId },
  });
}

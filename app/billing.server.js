import prisma from "./db.server.js";
import { PLANS } from "./billing.config.js";

export function isBillingTestMode() {
    const rawValue = process.env.SHOPIFY_BILLING_TEST ?? process.env.BILLING_TEST;

    if (rawValue === undefined) {
        return true;
    }

    return !["0", "false", "no", "off"].includes(String(rawValue).trim().toLowerCase());
}

function normalizePlanName(value) {
    return String(value || "").trim().toLowerCase();
}

function getPlanKeyFromSubscription(subscription) {
    const normalizedName = normalizePlanName(subscription?.name);

    for (const [planKey, plan] of Object.entries(PLANS)) {
        if (planKey === "free") continue;

        const possibleNames = [
            planKey,
            plan.key,
            plan.name,
            `Linked Products - ${plan.name}`,
        ].map(normalizePlanName);

        if (possibleNames.includes(normalizedName)) {
            return planKey;
        }
    }

    return null;
}

export function getPlanKeyFromSubscriptionName(subscriptionName) {
    return getPlanKeyFromSubscription({ name: subscriptionName });
}

function getSubscriptionPayloadData(payload) {
    const subscription = payload?.app_subscription || payload?.subscription || payload || {};
    const rawId = subscription.admin_graphql_api_id || subscription.id || subscription.app_subscription_id || null;
    const id = rawId && !String(rawId).includes("gid://")
        ? `gid://shopify/AppSubscription/${rawId}`
        : rawId;

    return {
        id: id ? String(id) : null,
        name: subscription.name || subscription.plan_name || "",
        status: String(subscription.status || "").toUpperCase(),
    };
}

/**
 * Get or create shop record
 */
export async function getOrCreateShop(shopDomain) {
    let shop = await prisma.shop.findUnique({
        where: { shop: shopDomain },
    });

    if (!shop) {
        shop = await prisma.shop.create({
            data: { shop: shopDomain, plan: "free" },
        });
    }

    return shop;
}

/**
 * Get shop's current plan
 */
export async function getShopPlan(shopDomain) {
    const shop = await getOrCreateShop(shopDomain);
    return shop.plan;
}

/**
 * Count total product groups for a shop
 */
export async function getGroupCount(shopDomain) {
    const count = await prisma.productGroup.count({
        where: {
            shop: shopDomain,
        },
    });
    return count;
}

/**
 * Check if shop can add more groups
 * Rename internally but keep signature for compatibility
 */
export async function canAddLinks(shopDomain, groupsToAdd = 1) {
    const shop = await getOrCreateShop(shopDomain);
    const plan = PLANS[shop.plan] || PLANS.free;
    const currentCount = await getGroupCount(shopDomain);

    // If plan gives unlimited groups
    if (plan.groupLimit === Infinity) return true;

    return currentCount + groupsToAdd <= plan.groupLimit;
}

/**
 * Get remaining groups available
 */
export async function getRemainingLinks(shopDomain) {
    const shop = await getOrCreateShop(shopDomain);
    const plan = PLANS[shop.plan] || PLANS.free;
    const currentCount = await getGroupCount(shopDomain);

    if (plan.groupLimit === Infinity) {
        return Infinity;
    }

    return Math.max(0, plan.groupLimit - currentCount);
}

/**
 * Get IDs of groups that are within the current plan's limit (oldest first)
 */
export async function getGroupsWithinLimit(shopDomain) {
    const shop = await getOrCreateShop(shopDomain);
    const plan = PLANS[shop.plan] || PLANS.free;
    
    if (plan.groupLimit === Infinity) {
        return null; // All allowed
    }

    const groups = await prisma.productGroup.findMany({
        where: { shop: shopDomain },
        orderBy: { createdAt: "asc" }, // Oldest first
        take: plan.groupLimit,
        select: { id: true }
    });

    return groups.map(g => g.id);
}

/**
 * Get usage info for display (Updated for Group limits)
 */
export async function getUsageInfo(shopDomain) {
    const shop = await getOrCreateShop(shopDomain);
    const plan = PLANS[shop.plan] || PLANS.free;
    const currentCount = await getGroupCount(shopDomain);

    return {
        plan: shop.plan,
        planName: plan.name,
        used: currentCount,
        limit: plan.groupLimit,
        remaining: plan.groupLimit === Infinity ? Infinity : plan.groupLimit - currentCount,
        percentage: plan.groupLimit === Infinity ? 0 : Math.round((currentCount / plan.groupLimit) * 100),
        isOverLimit: plan.groupLimit !== Infinity && currentCount > plan.groupLimit,
    };
}

export async function syncShopSubscription(admin, shopDomain) {
    const response = await admin.graphql(`
    query {
      currentAppInstallation {
        activeSubscriptions {
          id
          name
          status
          test
        }
      }
    }
  `);

    const result = await response.json();

    if (result.errors?.length) {
        throw new Error(result.errors.map((error) => error.message).join(", "));
    }

    const subscriptions = result.data?.currentAppInstallation?.activeSubscriptions || [];
    const activeSubscription = subscriptions.find((subscription) => subscription.status === "ACTIVE");

    if (!activeSubscription) {
        await prisma.shop.upsert({
            where: { shop: shopDomain },
            update: { plan: "free", chargeId: null },
            create: { shop: shopDomain, plan: "free" },
        });

        return { plan: "free", chargeId: null, subscription: null };
    }

    const planKey = getPlanKeyFromSubscription(activeSubscription);

    if (!planKey) {
        console.warn(
            `[Billing] Could not map active subscription "${activeSubscription.name}" for ${shopDomain}. Keeping local plan unchanged.`,
        );

        return {
            plan: null,
            chargeId: activeSubscription.id,
            subscription: activeSubscription,
        };
    }

    await prisma.shop.upsert({
        where: { shop: shopDomain },
        update: { plan: planKey, chargeId: activeSubscription.id },
        create: { shop: shopDomain, plan: planKey, chargeId: activeSubscription.id },
    });

    return { plan: planKey, chargeId: activeSubscription.id, subscription: activeSubscription };
}

export async function syncShopSubscriptionFromWebhook(shopDomain, payload) {
    const subscription = getSubscriptionPayloadData(payload);

    if (!subscription.status) {
        console.warn(`[Billing Webhook] Missing subscription status for ${shopDomain}`);
        return { changed: false, plan: null };
    }

    if (subscription.status === "ACTIVE") {
        const planKey = getPlanKeyFromSubscription(subscription);

        if (!planKey) {
            console.warn(
                `[Billing Webhook] Could not map active subscription "${subscription.name}" for ${shopDomain}`,
            );
            return { changed: false, plan: null };
        }

        await prisma.shop.upsert({
            where: { shop: shopDomain },
            update: { plan: planKey, chargeId: subscription.id },
            create: { shop: shopDomain, plan: planKey, chargeId: subscription.id },
        });

        return { changed: true, plan: planKey };
    }

    const inactiveStatuses = new Set(["CANCELLED", "DECLINED", "EXPIRED", "FROZEN"]);
    if (!inactiveStatuses.has(subscription.status)) {
        return { changed: false, plan: null };
    }

    const shop = await prisma.shop.findUnique({ where: { shop: shopDomain } });
    if (!shop) {
        return { changed: false, plan: null };
    }

    if (!subscription.id || !shop.chargeId || shop.chargeId === subscription.id) {
        await prisma.shop.update({
            where: { shop: shopDomain },
            data: { plan: "free", chargeId: null },
        });

        return { changed: true, plan: "free" };
    }

    return { changed: false, plan: shop.plan };
}

/**
 * Create subscription using Shopify Billing API
 */
export async function createSubscription(admin, planKey, shopDomain) {
    // This is a legacy method if not using the new billing.request from shopify-app-remix
    // But we'll keep it updated for consistency
    const plan = PLANS[planKey];

    if (!plan || plan.price === 0) {
        await prisma.shop.upsert({
            where: { shop: shopDomain },
            update: { plan: "free", chargeId: null },
            create: { shop: shopDomain, plan: "free" },
        });
        return { success: true, confirmationUrl: null };
    }

    // Usually calling shopify.billing.request is preferred now in action,
    // but if this server utility is used:
    const response = await admin.graphql(`
    mutation AppSubscriptionCreate($name: String!, $lineItems: [AppSubscriptionLineItemInput!]!, $returnUrl: URL!, $test: Boolean) {
      appSubscriptionCreate(
        name: $name
        lineItems: $lineItems
        returnUrl: $returnUrl
        test: $test
      ) {
        appSubscription { id }
        confirmationUrl
        userErrors { field message }
      }
    }
  `, {
        variables: {
            name: `Linked Products - ${plan.name}`,
            lineItems: [
                {
                    plan: {
                        appRecurringPricingDetails: {
                            price: {
                                amount: plan.price,
                                currencyCode: "USD",
                            },
                            interval: plan.interval,
                        },
                    },
                },
            ],
            returnUrl: `${process.env.SHOPIFY_APP_URL}/app/pricing?shop=${shopDomain}&plan=${planKey}`,
            test: isBillingTestMode(),
        },
    });

    const result = await response.json();
    if (result.data?.appSubscriptionCreate?.userErrors?.length > 0) {
        throw new Error(result.data.appSubscriptionCreate.userErrors[0].message);
    }

    return {
        success: true,
        confirmationUrl: result.data?.appSubscriptionCreate?.confirmationUrl,
        subscriptionId: result.data?.appSubscriptionCreate?.appSubscription?.id,
    };
}

/**
 * Handle subscription confirmation callback
 */
export async function confirmSubscription(admin, shopDomain, planKey, subscriptionDataOrId) {
    if (subscriptionDataOrId && typeof subscriptionDataOrId === 'object') {
        const resolvedPlanKey = getPlanKeyFromSubscription(subscriptionDataOrId) || planKey;
        await prisma.shop.upsert({
            where: { shop: shopDomain },
            update: { plan: resolvedPlanKey, chargeId: subscriptionDataOrId.id },
            create: { shop: shopDomain, plan: resolvedPlanKey, chargeId: subscriptionDataOrId.id },
        });
        return true;
    }

    if (planKey === "free") {
        await prisma.shop.upsert({
            where: { shop: shopDomain },
            update: { plan: "free", chargeId: null },
            create: { shop: shopDomain, plan: "free" },
        });

        return true;
    }

    const chargeId = typeof subscriptionDataOrId === 'string' ? subscriptionDataOrId : null;
    const response = await admin.graphql(`
    query {
      currentAppInstallation {
        activeSubscriptions { id status name }
      }
    }
  `);

    const result = await response.json();
    const subscriptions = result.data?.currentAppInstallation?.activeSubscriptions || [];
    const activeSubscription = subscriptions.find(sub =>
        sub.status === "ACTIVE" && (chargeId ? sub.id.includes(chargeId) : true)
    ) || subscriptions.find(sub => sub.status === "ACTIVE");

    if (activeSubscription) {
        const resolvedPlanKey = getPlanKeyFromSubscription(activeSubscription) || planKey;
        await prisma.shop.upsert({
            where: { shop: shopDomain },
            update: { plan: resolvedPlanKey, chargeId: activeSubscription.id },
            create: { shop: shopDomain, plan: resolvedPlanKey, chargeId: activeSubscription.id },
        });
        return true;
    }
    return false;
}

/**
 * Cancel subscription and downgrade to free
 */
export async function cancelSubscription(admin, shopDomain) {
    const shop = await getOrCreateShop(shopDomain);
    if (shop.chargeId) {
        try {
            const response = await admin.graphql(`
        mutation AppSubscriptionCancel($id: ID!) {
          appSubscriptionCancel(id: $id) {
            appSubscription { id status }
            userErrors { field message }
          }
        }
      `, {
                variables: { id: shop.chargeId },
            });

            const result = await response.json();
            const userErrors = result.data?.appSubscriptionCancel?.userErrors || [];

            if (userErrors.length > 0) {
                throw new Error(userErrors.map((error) => error.message).join(", "));
            }
        } catch (error) {
            console.error("Error cancelling subscription:", error);
            throw error;
        }
    }

    await prisma.shop.update({
        where: { shop: shopDomain },
        data: { plan: "free", chargeId: null },
    });

    return true;
}

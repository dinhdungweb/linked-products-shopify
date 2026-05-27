import prisma from "./db.server.js";
import { PLANS } from "./billing.config.js";

export function isBillingTestMode() {
    const rawValue = process.env.SHOPIFY_BILLING_TEST ?? process.env.BILLING_TEST;

    if (rawValue === undefined) {
        return true;
    }

    return !["0", "false", "no", "off"].includes(String(rawValue).trim().toLowerCase());
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
        const updatedShop = await prisma.shop.upsert({
            where: { shop: shopDomain },
            update: { plan: planKey, chargeId: subscriptionDataOrId.id },
            create: { shop: shopDomain, plan: planKey, chargeId: subscriptionDataOrId.id },
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
        await prisma.shop.upsert({
            where: { shop: shopDomain },
            update: { plan: planKey, chargeId: activeSubscription.id },
            create: { shop: shopDomain, plan: planKey, chargeId: activeSubscription.id },
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
            await admin.graphql(`
        mutation AppSubscriptionCancel($id: ID!) {
          appSubscriptionCancel(id: $id) {
            appSubscription { id status }
            userErrors { field message }
          }
        }
      `, {
                variables: { id: shop.chargeId },
            });
        } catch (error) {
            console.error("Error cancelling subscription:", error);
        }
    }

    await prisma.shop.update({
        where: { shop: shopDomain },
        data: { plan: "free", chargeId: null },
    });

    return true;
}

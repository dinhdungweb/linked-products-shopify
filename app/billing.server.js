import prisma from "./db.server";

import { PLANS } from "./billing.config";


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
 * Count total links (products in groups) for a shop
 */
export async function getLinkCount(shopDomain) {
    const count = await prisma.productGroupItem.count({
        where: {
            group: {
                shop: shopDomain,
            },
        },
    });
    return count;
}

/**
 * Check if shop can add more links
 */
export async function canAddLinks(shopDomain, additionalCount = 1) {
    const shop = await getOrCreateShop(shopDomain);
    const plan = PLANS[shop.plan] || PLANS.free;
    const currentCount = await getLinkCount(shopDomain);

    return currentCount + additionalCount <= plan.linkLimit;
}

/**
 * Get remaining links available
 */
export async function getRemainingLinks(shopDomain) {
    const shop = await getOrCreateShop(shopDomain);
    const plan = PLANS[shop.plan] || PLANS.free;
    const currentCount = await getLinkCount(shopDomain);

    if (plan.linkLimit === Infinity) {
        return Infinity;
    }

    return Math.max(0, plan.linkLimit - currentCount);
}

/**
 * Get usage info for display
 */
export async function getUsageInfo(shopDomain) {
    const shop = await getOrCreateShop(shopDomain);
    const plan = PLANS[shop.plan] || PLANS.free;
    const currentCount = await getLinkCount(shopDomain);

    return {
        plan: shop.plan,
        planName: plan.name,
        used: currentCount,
        limit: plan.linkLimit,
        remaining: plan.linkLimit === Infinity ? Infinity : plan.linkLimit - currentCount,
        percentage: plan.linkLimit === Infinity ? 0 : Math.round((currentCount / plan.linkLimit) * 100),
    };
}

/**
 * Create subscription using Shopify Billing API
 */
export async function createSubscription(admin, planKey, shopDomain) {
    const plan = PLANS[planKey];

    if (!plan || plan.price === 0) {
        // Free plan - just update database
        await prisma.shop.upsert({
            where: { shop: shopDomain },
            update: { plan: "free", chargeId: null },
            create: { shop: shopDomain, plan: "free" },
        });
        return { success: true, confirmationUrl: null };
    }

    // Create subscription via GraphQL
    const response = await admin.graphql(`
    mutation AppSubscriptionCreate($name: String!, $lineItems: [AppSubscriptionLineItemInput!]!, $returnUrl: URL!, $test: Boolean) {
      appSubscriptionCreate(
        name: $name
        lineItems: $lineItems
        returnUrl: $returnUrl
        test: $test
      ) {
        appSubscription {
          id
        }
        confirmationUrl
        userErrors {
          field
          message
        }
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
            test: process.env.NODE_ENV !== "production",
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
    // If we passed the full subscription object (from billing.check), use it directly
    if (subscriptionDataOrId && typeof subscriptionDataOrId === 'object') {
        console.log(`[Billing] Fast-syncing subscription for ${shopDomain} using provided data.`);
        const updatedShop = await prisma.shop.upsert({
            where: { shop: shopDomain },
            update: { plan: planKey, chargeId: subscriptionDataOrId.id },
            create: { shop: shopDomain, plan: planKey, chargeId: subscriptionDataOrId.id },
        });
        console.log(`[Billing] Fast-sync complete. Current plan: ${updatedShop.plan}`);
        return true;
    }

    const chargeId = typeof subscriptionDataOrId === 'string' ? subscriptionDataOrId : null;
    console.log(`[Billing] Confirming subscription for ${shopDomain}. Plan: ${planKey}, ChargeId: ${chargeId}`);

    // Verify the subscription is active
    const response = await admin.graphql(`
    query {
      currentAppInstallation {
        activeSubscriptions {
          id
          status
          name
        }
      }
    }
  `);

    const result = await response.json();
    const subscriptions = result.data?.currentAppInstallation?.activeSubscriptions || [];

    console.log(`[Billing] Active subscriptions found:`, JSON.stringify(subscriptions, null, 2));

    // Find active subscription that matches our chargeId if possible, 
    // or just the first ACTIVE one if chargeId is not in the list
    const activeSubscription = subscriptions.find(sub =>
        sub.status === "ACTIVE" && (chargeId ? sub.id.includes(chargeId) : true)
    ) || subscriptions.find(sub => sub.status === "ACTIVE");

    if (activeSubscription) {
        console.log(`[Billing] Found active subscription: ${activeSubscription.name} (${activeSubscription.id})`);

        const updatedShop = await prisma.shop.upsert({
            where: { shop: shopDomain },
            update: { plan: planKey, chargeId: activeSubscription.id },
            create: { shop: shopDomain, plan: planKey, chargeId: activeSubscription.id },
        });

        console.log(`[Billing] Database updated for ${shopDomain}: plan is now ${updatedShop.plan}`);
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
            appSubscription {
              id
              status
            }
            userErrors {
              field
              message
            }
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

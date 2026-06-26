import { authenticate } from "../shopify.server";
import { syncShopSubscriptionFromWebhook } from "../billing.server";

export const action = async ({ request }) => {
  const { topic, shop, payload } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  try {
    await syncShopSubscriptionFromWebhook(shop, payload);
  } catch (error) {
    console.error(`[Billing Webhook] Failed to sync subscription for ${shop}:`, error);
  }

  return new Response();
};

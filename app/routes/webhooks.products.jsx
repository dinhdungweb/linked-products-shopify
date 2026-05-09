import { authenticate } from "../shopify.server";
import db from "../db.server";
import { enqueueAutomationProduct } from "../sync-jobs.server";

export const action = async ({ request }) => {
  const { topic, shop, payload, session } = await authenticate.webhook(request);

  console.log(`Received webhook topic: ${topic} for shop: ${shop}`);
  if (!session) return new Response();

  if (topic === "PRODUCTS_CREATE" || topic === "PRODUCTS_UPDATE") {
    let productId = payload.id;
    if (typeof productId === "number" || !productId.includes("gid://")) {
       productId = `gid://shopify/Product/${productId}`;
    }

    try {
      await enqueueAutomationProduct(db, shop, productId);
    } catch (error) {
      console.error("Error queueing automation webhook:", error);
    }
  }

  return new Response();
};

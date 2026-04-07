import { authenticate } from "../shopify.server";
import db from "../db.server";
import { processAutomationsForProduct } from "../models/automation.server";
import { canAddLinks } from "../billing.server";

export const action = async ({ request }) => {
  const { topic, shop, payload, admin } = await authenticate.webhook(request);

  console.log(`Received webhook topic: ${topic} for shop: ${shop}`);

  if (topic === "PRODUCTS_CREATE" || topic === "PRODUCTS_UPDATE") {
    let productId = payload.id;
    if (typeof productId === "number" || !productId.includes("gid://")) {
       productId = `gid://shopify/Product/${productId}`;
    }

    try {
      console.log(`Running automation for product: ${productId}`);
      await processAutomationsForProduct(admin, db, productId, shop, canAddLinks);
    } catch (error) {
      console.error("Error processing automation webhook:", error);
    }
  }

  return new Response();
};

import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }) => {
  const { shop, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  // Webhook requests can trigger multiple times and after an app has already been uninstalled.
  // If this webhook already ran, the session may have been deleted previously.
  await db.$transaction([
    db.session.deleteMany({ where: { shop } }),
    db.syncJob.deleteMany({ where: { shop } }),
    db.automationRule.deleteMany({ where: { shop } }),
    db.appSetting.deleteMany({ where: { shop } }),
    db.optionStyleSetting.deleteMany({ where: { shop } }),
    db.productGroupItem.deleteMany({ where: { group: { shop } } }),
    db.productGroup.deleteMany({ where: { shop } }),
    db.shop.deleteMany({ where: { shop } }),
  ]);

  return new Response();
};

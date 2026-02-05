import { authenticate } from "../shopify.server";

export const action = async ({ request }) => {
    const { topic, shop, session, admin, payload } = await authenticate.webhook(request);

    // Payload contains the customer redact request details
    console.log(`Received ${topic} webhook for ${shop}`);

    // Need to respond with 200 OK
    return new Response();
};

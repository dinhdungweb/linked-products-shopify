import {
  ApiVersion,
  AppDistribution,
  BillingInterval,
  BillingReplacementBehavior,
  shopifyApp,
} from "@shopify/shopify-app-remix/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "./db.server";
import { PLANS } from "./billing.config";

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.April24, // Matches shopify.app.toml
  scopes: process.env.SCOPES?.split(","),
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(prisma),
  distribution: AppDistribution.AppStore,
  billing: {
    "basic-plan": {
      lineItems: [
        {
          amount: PLANS.basic.price,
          currencyCode: 'USD',
          interval: BillingInterval.Every30Days,
        },
      ],
      trialDays: 7,
      replacementBehavior: BillingReplacementBehavior.ApplyImmediately,
    },
    "advanced-plan": {
      lineItems: [
        {
          amount: PLANS.advanced.price,
          currencyCode: 'USD',
          interval: BillingInterval.Every30Days,
        },
      ],
      trialDays: 7,
      replacementBehavior: BillingReplacementBehavior.ApplyImmediately,
    },
    "premium-plan": {
      lineItems: [
        {
          amount: PLANS.premium.price,
          currencyCode: 'USD',
          interval: BillingInterval.Every30Days,
        },
      ],
      trialDays: 7,
      replacementBehavior: BillingReplacementBehavior.ApplyImmediately,
    },
  },
  webhooks: {
    PRODUCTS_CREATE: {
      deliveryMethod: "http",
      callbackUrl: "/webhooks/products",
    },
    PRODUCTS_UPDATE: {
      deliveryMethod: "http",
      callbackUrl: "/webhooks/products",
    },
  },
  future: {
    unstable_newEmbeddedAuthStrategy: false,
    expiringOfflineAccessTokens: true,
  },
  hooks: {
    afterAuth: async ({ session, admin }) => {
      await createMetafieldDefinitions(admin);
    },
  },
  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
});

// Function to create metafield definitions
async function createMetafieldDefinitions(admin) {
  const definitions = [
    {
      name: "Linked Products List",
      namespace: "linked_products",
      key: "linked_list",
      type: "json",
      description: "List of product handles for linked products",
      ownerType: "PRODUCT",
    },
    {
      name: "Option Value",
      namespace: "linked_products",
      key: "option_value",
      type: "single_line_text_field",
      description: "The option value displayed for this product",
      ownerType: "PRODUCT",
    },
  ];

  for (const def of definitions) {
    try {
      await admin.graphql(`
        mutation CreateMetafieldDefinition($definition: MetafieldDefinitionInput!) {
          metafieldDefinitionCreate(definition: $definition) {
            createdDefinition { id }
            userErrors { field message }
          }
        }
      `, {
        variables: {
          definition: {
            name: def.name,
            namespace: def.namespace,
            key: def.key,
            type: def.type,
            description: def.description,
            ownerType: def.ownerType,
          },
        },
      });
    } catch (error) {
      console.log(`Metafield definition ${def.key} may already exist:`, error.message);
    }
  }
}

export default shopify;
export const apiVersion = ApiVersion.April24;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;

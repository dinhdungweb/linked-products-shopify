import {
  ApiVersion,
  AppDistribution,
  BillingInterval,
  shopifyApp,
} from "@shopify/shopify-app-remix/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "./db.server";

export const MONTHLY_PLAN_BASIC = 'basic';
export const MONTHLY_PLAN_ADVANCED = 'advanced';
export const MONTHLY_PLAN_PREMIUM = 'premium';

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.January25,
  scopes: process.env.SCOPES?.split(","),
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(prisma),
  distribution: AppDistribution.AppStore,
  billing: {
    [MONTHLY_PLAN_BASIC]: {
      lineItems: [
        {
          amount: 7.99,
          currencyCode: 'USD',
          interval: BillingInterval.Every30Days,
          trialDays: 7,
        },
      ],
    },
    [MONTHLY_PLAN_ADVANCED]: {
      lineItems: [
        {
          amount: 15.99,
          currencyCode: 'USD',
          interval: BillingInterval.Every30Days,
          trialDays: 7,
        },
      ],
    },
    [MONTHLY_PLAN_PREMIUM]: {
      lineItems: [
        {
          amount: 35.99,
          currencyCode: 'USD',
          interval: BillingInterval.Every30Days,
          trialDays: 7,
        },
      ],
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
    unstable_newEmbeddedAuthStrategy: true,
    expiringOfflineAccessTokens: true,
  },
  hooks: {
    afterAuth: async ({ session, admin }) => {
      // Auto-create metafield definitions upon app installation
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
      // Ignore errors if definition already exists
      console.log(`Metafield definition ${def.key} may already exist:`, error.message);
    }
  }
}

export default shopify;
export const apiVersion = ApiVersion.January25;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;

import { normalizeProductCardStyle } from "./utils/style-mapping.js";

function buildStorefrontAppSettings(settings) {
  const defaultProductCardStyle = normalizeProductCardStyle(settings.defaultProductCardStyle);

  return {
    appEnabled: settings.appEnabled ?? true,
    showOnProductCards: settings.showOnProductCards ?? true,
    applyToCollection: settings.applyToCollection ?? true,
    applyToSearch: settings.applyToSearch ?? true,
    applyToHome: settings.applyToHome ?? false,
    soldOutLabel: settings.soldOutLabel || "Sold out",
    unavailableLabel: settings.unavailableLabel || "Unavailable",
    customCssCollection: settings.customCssCollection || "",
    cardAlign: settings.cardAlign || "left",
    cardMarginTop: settings.cardMarginTop ?? 0,
    cardMarginBottom: settings.cardMarginBottom ?? 5,
    cardDisplayMode: settings.cardDisplayMode || "swatches",
    cardShowLabel: settings.cardShowLabel ?? false,
    defaultProductCardStyle,
    defaultCardStyle: defaultProductCardStyle,
  };
}

function getErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function graphqlWithRetry(admin, query, options, label) {
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return options === undefined
        ? await admin.graphql(query)
        : await admin.graphql(query, options);
    } catch (error) {
      if (attempt === maxAttempts) {
        throw error;
      }

      console.warn(
        `[SettingsSync] ${label} failed, retrying (${attempt}/${maxAttempts}):`,
        getErrorMessage(error),
      );
      await wait(250 * attempt);
    }
  }
}

export async function syncShopSettingsMetafields(admin, prisma, shop, settingsOverride = null) {
  const settings = settingsOverride || await prisma.appSetting.findUnique({
    where: { shop },
  }) || await prisma.appSetting.create({
    data: { shop },
  });

  const shopData = await graphqlWithRetry(admin, `{ shop { id } }`, undefined, "Resolve shop id");
  const shopJson = await shopData.json();
  const shopId = shopJson.data?.shop?.id;

  if (!shopId) {
    throw new Error("Could not resolve Shopify shop id");
  }

  const response = await graphqlWithRetry(admin, `
    mutation setShopSettings($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        userErrors { field message }
      }
    }
  `, {
    variables: {
      metafields: [
        {
          namespace: "linked_products",
          key: "settings",
          type: "json",
          ownerId: shopId,
          value: JSON.stringify(settings),
        },
        {
          namespace: "linked_products",
          key: "app_settings",
          type: "json",
          ownerId: shopId,
          value: JSON.stringify(buildStorefrontAppSettings(settings)),
        },
      ],
    },
  }, "Set shop settings metafields");

  const result = await response.json();
  const errors = result.data?.metafieldsSet?.userErrors || [];
  if (errors.length > 0) {
    throw new Error(errors.map((error) => error.message).join(", "));
  }

  return settings;
}

export async function syncShopSettingsMetafieldsSafely(admin, prisma, shop, settingsOverride = null) {
  try {
    const settings = await syncShopSettingsMetafields(admin, prisma, shop, settingsOverride);
    return { ok: true, settings };
  } catch (error) {
    const message = getErrorMessage(error);
    console.warn("[SettingsSync] Shopify settings metafield sync skipped:", message);
    return { ok: false, error: message, settings: settingsOverride };
  }
}

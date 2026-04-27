import { normalizeProductCardStyle } from "./utils/style-mapping";

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

export async function syncShopSettingsMetafields(admin, prisma, shop, settingsOverride = null) {
  const settings = settingsOverride || await prisma.appSetting.findUnique({
    where: { shop },
  }) || await prisma.appSetting.create({
    data: { shop },
  });

  const shopData = await admin.graphql(`{ shop { id } }`);
  const shopJson = await shopData.json();
  const shopId = shopJson.data?.shop?.id;

  if (!shopId) {
    throw new Error("Could not resolve Shopify shop id");
  }

  const response = await admin.graphql(`
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
  });

  const result = await response.json();
  const errors = result.data?.metafieldsSet?.userErrors || [];
  if (errors.length > 0) {
    throw new Error(errors.map((error) => error.message).join(", "));
  }

  return settings;
}

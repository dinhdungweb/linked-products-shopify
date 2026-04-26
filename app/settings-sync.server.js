function normalizeProductCardStyle(style) {
  if (style === "image_swatch_on_card" || style === "swatch" || style === "image_swatch") {
    return "image_swatch_card";
  }
  if (style === "button_on_card" || style === "pill" || style === "button") {
    return "button_card";
  }
  if (style === "dropdown_on_card" || style === "dropdown") {
    return "dropdown_card";
  }

  return style || "image_swatch_card";
}

function buildStorefrontAppSettings(settings) {
  const defaultProductCardStyle = normalizeProductCardStyle(settings.defaultProductCardStyle);

  return {
    swatchSize: settings.swatchSize ?? 50,
    itemsGap: settings.itemsGap ?? 8,
    cardLimit: settings.cardLimit ?? 5,
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

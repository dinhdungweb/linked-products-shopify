export async function syncStyleCustomizationsMetafield(admin, prisma, shop) {
  const shopResponse = await admin.graphql(`{ shop { id } }`);
  const shopJson = await shopResponse.json();
  const shopId = shopJson.data?.shop?.id;

  if (!shopId) {
    throw new Error("Could not resolve Shopify shop id");
  }

  const styleSettings = await prisma.optionStyleSetting.findMany({
    where: { shop },
  });

  const allStyles = styleSettings.reduce((acc, style) => {
    acc[style.styleId] = style.settings;
    return acc;
  }, {});

  const response = await admin.graphql(`
    mutation setStyleCustomizations($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        userErrors { field message }
      }
    }
  `, {
    variables: {
      metafields: [
        {
          namespace: "linked_products",
          key: "style_customizations",
          type: "json",
          ownerId: shopId,
          value: JSON.stringify(allStyles),
        },
      ],
    },
  });

  const result = await response.json();
  const errors = result.data?.metafieldsSet?.userErrors || [];
  if (errors.length > 0) {
    throw new Error(errors.map((error) => error.message).join(", "));
  }

  return allStyles;
}

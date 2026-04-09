import { getGroupsWithinLimit } from "./billing.server";

export async function syncGroupMetafields(admin, prisma, gId) {
    const group = await prisma.productGroup.findUnique({
        where: { id: gId },
        include: { products: { orderBy: { position: "asc" } } },
    });

    if (!group) {
        return { success: false, error: "Group not found" };
    }

    // Check plan restriction - only first N groups are allowed to be active
    const allowedIds = await getGroupsWithinLimit(group.shop);
    const isPlanDisabled = allowedIds !== null && !allowedIds.includes(gId);

    const metafieldValue = group.products.map(p => ({
        handle: p.productHandle,
        title: p.optionValue || "",
        image: p.customImageUrl || "",
        color: p.customColor || "#FFFFFF",
        color2: p.customColor2 || "",
        style: p.style || "one"
    }));

    const metafields = [];
    for (const product of group.products) {
        const base = { ownerId: product.productId, namespace: "linked_products" };
        
        // If the group is draft, we send empty/null or just don't send?
        // Let's add a "group_status" metafield that the liquid can check.
        metafields.push({ ...base, key: "linked_list", value: JSON.stringify(metafieldValue), type: "json" });
        metafields.push({ ...base, key: "option_value", value: product.optionValue || "", type: "single_line_text_field" });
        metafields.push({ ...base, key: "inventory_behavior", value: group.inventoryBehavior || "show", type: "single_line_text_field" });
        metafields.push({ ...base, key: "option_name", value: group.optionName || "Color", type: "single_line_text_field" });
        metafields.push({ ...base, key: "selector_style", value: group.selectorStyle || "button", type: "single_line_text_field" });
        // Determine card style ID
        let cStyle = group.cardSelectorStyle || "image_swatch_card";
        if (cStyle === "swatch") {
            cStyle = "image_swatch_card";
        } else if (cStyle === "pill") {
            cStyle = "button_card";
        } else if (cStyle === "same") {
            cStyle = (group.selectorStyle || "button") + "_card";
            cStyle = cStyle.replace("swatch_card", "image_swatch_card");
            if (cStyle.includes("button") || cStyle.includes("block")) cStyle = "button_card";
        }
        metafields.push({ ...base, key: "card_selector_style", value: cStyle, type: "single_line_text_field" });
        metafields.push({ ...base, key: "status", value: isPlanDisabled ? "plan_disabled" : (group.status || "active"), type: "single_line_text_field" });
    }

    console.log(`[Sync] Group ${gId}: Syncing ${metafields.length} metafields...`);

    const BATCH_SIZE = 25;
    for (let i = 0; i < metafields.length; i += BATCH_SIZE) {
        const batch = metafields.slice(i, i + BATCH_SIZE);
        const metafieldMutation = await admin.graphql(`
            mutation MetafieldsSet($metafields: [MetafieldsSetInput!]!) {
                metafieldsSet(metafields: $metafields) {
                    userErrors { message }
                }
            }
        `, { variables: { metafields: batch } });
        const result = await metafieldMutation.json();
        if (result.data?.metafieldsSet?.userErrors?.length > 0) {
            console.error(`[Sync Error] ${result.data.metafieldsSet.userErrors[0].message}`);
            throw new Error(result.data.metafieldsSet.userErrors[0].message);
        }
    }

    await prisma.productGroup.update({ where: { id: gId }, data: { syncStatus: "synced" } });
    return { success: true };
}

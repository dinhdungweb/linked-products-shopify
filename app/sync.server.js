import { getGroupsWithinLimit } from "./billing.server";

const SHOP_ACTIVE_HANDLES_KEY = "active_handles";

function metafieldText(value, fallback) {
    const stringValue = value == null ? "" : String(value).trim();
    return stringValue || fallback;
}

async function getShopOwnerId(admin) {
    const response = await admin.graphql(`
        query LinkedProductsShopOwner {
            shop {
                id
            }
        }
    `);
    const result = await response.json();
    return result.data?.shop?.id;
}

export async function syncShopActiveHandles(admin, prisma, shop) {
    const allowedIds = await getGroupsWithinLimit(shop);
    const where = {
        shop,
        status: "active",
    };

    if (allowedIds !== null) {
        where.id = { in: allowedIds };
    }

    const groups = await prisma.productGroup.findMany({
        where,
        include: { products: true },
    });

    const handles = [
        ...new Set(
            groups.flatMap((group) => group.products.map((product) => product.productHandle).filter(Boolean)),
        ),
    ];

    const shopOwnerId = await getShopOwnerId(admin);
    if (!shopOwnerId) {
        throw new Error("Shop owner ID not found");
    }

    const response = await admin.graphql(`
        mutation SyncLinkedProductsActiveHandles($metafields: [MetafieldsSetInput!]!) {
            metafieldsSet(metafields: $metafields) {
                userErrors { field message }
            }
        }
    `, {
        variables: {
            metafields: [{
                ownerId: shopOwnerId,
                namespace: "linked_products",
                key: SHOP_ACTIVE_HANDLES_KEY,
                value: JSON.stringify(handles),
                type: "json",
            }],
        },
    });

    const result = await response.json();
    const userErrors = result.data?.metafieldsSet?.userErrors || [];
    if (userErrors.length > 0) {
        const error = userErrors[0];
        const field = Array.isArray(error.field) ? error.field.join(".") : error.field;
        throw new Error(`${field ? `${field}: ` : ""}${error.message}`);
    }

    return { success: true, handles };
}

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

    const seenHandles = new Set();
    const metafieldValue = [];
    
    for (const p of group.products) {
        if (!p.productHandle || seenHandles.has(p.productHandle)) continue;
        seenHandles.add(p.productHandle);
        
        metafieldValue.push({
            handle: p.productHandle,
            title: p.optionValue || "",
            image: p.customImageUrl || "",
            color: p.customColor || "#FFFFFF",
            color2: p.customColor2 || "",
            style: p.style || "one"
        });
    }

    const metafields = [];
    for (const product of group.products) {
        const base = { ownerId: product.productId, namespace: "linked_products" };
        
        // If the group is draft, we send empty/null or just don't send?
        // Let's add a "group_status" metafield that the liquid can check.
        metafields.push({ ...base, key: "linked_list", value: JSON.stringify(metafieldValue), type: "json" });
        metafields.push({ ...base, key: "option_value", value: metafieldText(product.optionValue, product.productHandle || "Option"), type: "single_line_text_field" });
        metafields.push({ ...base, key: "inventory_behavior", value: metafieldText(group.inventoryBehavior, "show"), type: "single_line_text_field" });
        metafields.push({ ...base, key: "option_name", value: metafieldText(group.optionName, "Color"), type: "single_line_text_field" });
        metafields.push({ ...base, key: "selector_style", value: metafieldText(group.selectorStyle, "button"), type: "single_line_text_field" });
        metafields.push({ ...base, key: "style", value: metafieldText(product.style, "one"), type: "single_line_text_field" });
        metafields.push({ ...base, key: "color2", value: metafieldText(product.customColor2, "none"), type: "single_line_text_field" });
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
            const error = result.data.metafieldsSet.userErrors[0];
            const field = Array.isArray(error.field) ? error.field.join(".") : error.field;
            console.error(`[Sync Error] ${field ? `${field}: ` : ""}${error.message}`);
            throw new Error(`${field ? `${field}: ` : ""}${error.message}`);
        }
    }

    await prisma.productGroup.update({ where: { id: gId }, data: { syncStatus: "synced" } });
    await syncShopActiveHandles(admin, prisma, group.shop);
    return { success: true };
}

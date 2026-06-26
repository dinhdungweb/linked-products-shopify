import { getGroupsWithinLimit } from "./billing.server.js";
import { normalizeProductCardStyle } from "./utils/style-mapping.js";

const SHOP_ACTIVE_HANDLES_KEY = "active_handles";
const LINKED_PRODUCTS_NAMESPACE = "linked_products";
const METAFIELD_DELETE_BATCH_SIZE = 25;

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

function chunkArray(items, size) {
    const chunks = [];

    for (let index = 0; index < items.length; index += size) {
        chunks.push(items.slice(index, index + size));
    }

    return chunks;
}

async function deleteMetafieldIdentifiers(admin, metafields) {
    if (metafields.length === 0) return 0;

    let deleted = 0;

    for (const batch of chunkArray(metafields, METAFIELD_DELETE_BATCH_SIZE)) {
        const response = await admin.graphql(`
            mutation MetafieldsDelete($metafields: [MetafieldIdentifierInput!]!) {
                metafieldsDelete(metafields: $metafields) {
                    deletedMetafields { ownerId key namespace }
                    userErrors { field message }
                }
            }
        `, { variables: { metafields: batch } });

        const result = await response.json();
        const errors = result.data?.metafieldsDelete?.userErrors || [];
        if (errors.length > 0) {
            throw new Error(errors.map((error) => error.message).join(", "));
        }

        deleted += result.data?.metafieldsDelete?.deletedMetafields?.length || batch.length;
    }

    return deleted;
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

export async function deleteLinkedProductMetafields(admin, productIds) {
    const ids = [...new Set((productIds || []).filter(Boolean))];
    if (ids.length === 0) return { success: true, deleted: 0 };

    let deleted = 0;

    for (const productId of ids) {
        const metafieldQuery = await admin.graphql(`
            query GetProductMetafields($productId: ID!) {
                product(id: $productId) {
                    metafields(first: 50, namespace: "linked_products") {
                        nodes { key }
                    }
                }
            }
        `, { variables: { productId } });

        const metafieldResult = await metafieldQuery.json();
        const metafieldNodes = metafieldResult.data?.product?.metafields?.nodes || [];
        if (metafieldNodes.length === 0) continue;

        const metafieldsToDelete = metafieldNodes.map((metafield) => ({
            namespace: LINKED_PRODUCTS_NAMESPACE,
            key: metafield.key,
            ownerId: productId,
        }));

        deleted += await deleteMetafieldIdentifiers(admin, metafieldsToDelete);
    }

    return { success: true, deleted };
}

export async function resetLinkedProductsStorefrontMetafields(admin) {
    let deleted = 0;
    let productCount = 0;

    const shopOwnerId = await getShopOwnerId(admin);
    if (shopOwnerId) {
        const shopMetafieldsResponse = await admin.graphql(`
            query LinkedProductsShopMetafields {
                shop {
                    metafields(first: 50, namespace: "linked_products") {
                        nodes { key }
                    }
                }
            }
        `);

        const shopMetafieldsResult = await shopMetafieldsResponse.json();
        const shopMetafields = shopMetafieldsResult.data?.shop?.metafields?.nodes || [];
        deleted += await deleteMetafieldIdentifiers(admin, shopMetafields.map((metafield) => ({
            ownerId: shopOwnerId,
            namespace: LINKED_PRODUCTS_NAMESPACE,
            key: metafield.key,
        })));
    }

    let cursor = null;
    let hasNextPage = true;

    while (hasNextPage) {
        const response = await admin.graphql(`
            query LinkedProductsProductMetafields($cursor: String) {
                products(first: 50, after: $cursor) {
                    nodes {
                        id
                        metafields(first: 50, namespace: "linked_products") {
                            nodes { key }
                        }
                    }
                    pageInfo {
                        hasNextPage
                        endCursor
                    }
                }
            }
        `, { variables: { cursor } });

        const result = await response.json();
        const products = result.data?.products?.nodes || [];

        for (const product of products) {
            const metafields = product.metafields?.nodes || [];
            if (metafields.length === 0) continue;

            productCount += 1;
            deleted += await deleteMetafieldIdentifiers(admin, metafields.map((metafield) => ({
                ownerId: product.id,
                namespace: LINKED_PRODUCTS_NAMESPACE,
                key: metafield.key,
            })));
        }

        hasNextPage = Boolean(result.data?.products?.pageInfo?.hasNextPage);
        cursor = result.data?.products?.pageInfo?.endCursor || null;
    }

    return { success: true, deleted, productCount };
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
        const cStyle = normalizeProductCardStyle(group.cardSelectorStyle, group.selectorStyle);
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

import { useCallback, useState, useEffect } from "react";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation, useActionData } from "@remix-run/react";
import {
    Page,
    Layout,
    Card,
    BlockStack,
    Text,
    Button,
    InlineStack,
    Badge,
    Banner,
    IndexTable,
    Thumbnail,
    Modal,
    TextField,
    EmptyState,
    Box,
    Divider,
    Select,
    Tooltip,
    ProgressBar,
} from "@shopify/polaris";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import { EditIcon, DeleteIcon } from "@shopify/polaris-icons";

// Loader - Get group info and product list
export async function loader({ request, params }) {
    const { authenticate, MONTHLY_PLAN_BASIC, MONTHLY_PLAN_PRO } = await import("../shopify.server");
    const { default: prisma } = await import("../db.server");
    const { getUsageInfo, confirmSubscription } = await import("../billing.server");

    const { admin, session, billing } = await authenticate.admin(request);
    const shop = session.shop;
    const { id: groupId } = params;

    // Robust & Fast Sync: Check Shopify Billing API status directly
    try {
        const billingCheck = await billing.check({
            isTest: true,
            plans: [MONTHLY_PLAN_BASIC, MONTHLY_PLAN_PRO],
        });

        // Get current plan from DB for comparison
        const shopRecord = await prisma.shop.findUnique({ where: { shop: shop } });
        const currentKnownPlan = shopRecord?.plan || 'free';

        if (billingCheck.hasActivePayment) {
            const activeSub = billingCheck.appSubscriptions[0];
            const planKey = activeSub.name.includes("Pro") ? "pro" : "basic";

            if (planKey !== currentKnownPlan) {
                console.log(`[Group Loader] Plan sync initiated: ${currentKnownPlan} -> ${planKey}`);
                await confirmSubscription(admin, shop, planKey, activeSub);
            }
        } else if (currentKnownPlan !== 'free') {
            console.log(`[Group Loader] Syncing back to free plan.`);
            await confirmSubscription(admin, shop, 'free', null);
        }
    } catch (error) {
        console.warn("[Group Loader] Billing sync skipped:", error.message);
    }

    const group = await prisma.productGroup.findUnique({
        where: { id: groupId, shop: session.shop },
        include: {
            products: {
                orderBy: { position: "asc" },
            },
        },
    });

    if (!group) {
        throw new Response("Group not found", { status: 404 });
    }

    // Get product info from Shopify
    let productDetails = [];
    if (group.products.length > 0) {
        const productIds = group.products.map((p) => p.productId);

        const response = await admin.graphql(`
      query GetProducts($ids: [ID!]!) {
        nodes(ids: $ids) {
          ... on Product {
            id
            title
            handle
            featuredImage {
              url
            }
            status
            images(first: 10) {
              nodes {
                url
              }
            }
            variants(first: 5) {
              nodes {
                id
                title
                image {
                  url
                }
              }
            }
          }
        }
      }
    `, { variables: { ids: productIds } });

        const result = await response.json();
        const shopifyProducts = result.data?.nodes || [];

        // Merge DB and Shopify info
        productDetails = group.products.map((item) => {
            const shopifyProduct = shopifyProducts.find((p) => p?.id === item.productId);

            // Find fallback image from variants if featuredImage is missing
            let fallbackImage = null;
            if (shopifyProduct?.variants?.nodes) {
                const variantWithImage = shopifyProduct.variants.nodes.find(v => v.image?.url);
                fallbackImage = variantWithImage?.image?.url;
            }

            return {
                ...item,
                title: shopifyProduct?.title || "Product does not exist",
                handle: shopifyProduct?.handle || item.productHandle,
                image: shopifyProduct?.featuredImage?.url || fallbackImage || null,
                status: shopifyProduct?.status,
                allImages: Array.from(new Set([
                    ...(shopifyProduct?.images?.nodes?.map(n => n.url) || []),
                    ...(shopifyProduct?.variants?.nodes?.map(v => v.image?.url).filter(Boolean) || [])
                ])),
                // Store variant info for suggestions if needed
                variants: shopifyProduct?.variants?.nodes || []
            };
        });
    }

    return { group: { ...group, products: productDetails }, shop: session.shop };
}

// Action - Add/remove products, sync metafields
export async function action({ request, params }) {
    const { authenticate } = await import("../shopify.server");
    const { default: prisma } = await import("../db.server");
    const { canAddLinks } = await import("../billing.server");

    const { session, admin } = await authenticate.admin(request);
    const { id: groupId } = params;
    const formData = await request.formData();
    const actionType = formData.get("action");

    // Helper function to sync metafields
    async function syncGroupMetafields(gId) {
        const group = await prisma.productGroup.findUnique({
            where: { id: gId },
            include: { products: { orderBy: { position: "asc" } } },
        });

        if (!group || group.products.length < 2) {
            return { success: false, error: "At least 2 products are required to sync" };
        }

        const metafields = [];
        const metafieldValue = group.products.map(p => ({
            handle: p.productHandle,
            title: p.optionValue || "",
            image: p.customImageUrl || "",
            color: p.customColor || ""
        }));

        for (const product of group.products) {
            // 1. linked_list metafield
            metafields.push({
                ownerId: product.productId,
                namespace: "linked_products",
                key: "linked_list",
                value: JSON.stringify(metafieldValue),
                type: "json",
            });
            // 2. option_value metafield
            metafields.push({
                ownerId: product.productId,
                namespace: "linked_products",
                key: "option_value",
                value: product.optionValue || "",
                type: "single_line_text_field",
            });
            // 3. inventory_behavior metafield
            metafields.push({
                ownerId: product.productId,
                namespace: "linked_products",
                key: "inventory_behavior",
                value: group.inventoryBehavior || "show",
                type: "single_line_text_field",
            });
        }

        // Batching: Shopify limits metafieldsSet to 25 items per call
        const BATCH_SIZE = 25;
        const batches = [];
        for (let i = 0; i < metafields.length; i += BATCH_SIZE) {
            batches.push(metafields.slice(i, i + BATCH_SIZE));
        }

        // Sequential processing: More stable than Promise.all for metafieldsSet
        for (const batch of batches) {
            const metafieldMutation = await admin.graphql(`
                mutation MetafieldsSet($metafields: [MetafieldsSetInput!]!) {
                    metafieldsSet(metafields: $metafields) {
                        metafields { id }
                        userErrors { field message }
                    }
                }
            `, {
                variables: { metafields: batch },
            });

            const result = await metafieldMutation.json();
            if (result.data?.metafieldsSet?.userErrors?.length > 0) {
                throw new Error(result.data.metafieldsSet.userErrors[0].message);
            }
        }

        await prisma.productGroup.update({
            where: { id: gId },
            data: { syncStatus: "synced" },
        });

        return { success: true };
    }

    // Add products to group + AUTO SYNC
    if (actionType === "addProducts") {
        const productsJson = formData.get("products");

        if (!productsJson) {
            return json({ error: "No products selected" }, { status: 400 });
        }

        const products = JSON.parse(productsJson);

        // Kiểm tra sản phẩm đã thuộc nhóm khác chưa
        const productIds = products.map((p) => p.id);
        const existingInOtherGroups = await prisma.productGroupItem.findMany({
            where: {
                productId: { in: productIds },
                groupId: { not: groupId },
            },
            include: {
                group: { select: { name: true } },
            },
        });

        if (existingInOtherGroups.length > 0) {
            const conflictMessages = existingInOtherGroups.map((item) => {
                const product = products.find((p) => p.id === item.productId);
                return `"${product?.title || item.productId}" already belongs to group "${item.group.name}"`;
            });
            return json({
                error: `Some products already belong to other groups:\n${conflictMessages.join('\n')}`,
            }, { status: 400 });
        }

        // Get current highest position
        const maxPosition = await prisma.productGroupItem.aggregate({
            where: { groupId },
            _max: { position: true },
        });

        // Check link limit
        const canAdd = await canAddLinks(session.shop, products.length);
        if (!canAdd) {
            return json({
                success: false,
                message: "You have reached your plan's link limit. Please upgrade to add more products.",
                limitReached: true
            });
        }

        let position = (maxPosition._max.position || 0);
        let addedCount = 0;

        for (const product of products) {
            const existing = await prisma.productGroupItem.findUnique({
                where: { groupId_productId: { groupId, productId: product.id } },
            });

            if (!existing) {
                position++;
                await prisma.productGroupItem.create({
                    data: {
                        groupId,
                        productId: product.id,
                        productHandle: product.handle,
                        optionValue: product.title,
                        position,
                    },
                });
                addedCount++;
            }
        }

        // Auto-sync after adding
        try {
            const syncResult = await syncGroupMetafields(groupId);
            if (syncResult.success) {
                return json({ success: true, message: `Added ${addedCount} products and synced successfully!` });
            } else {
                return json({ success: true, message: `Added ${addedCount} products. ${syncResult.error}` });
            }
        } catch (error) {
            await prisma.productGroup.update({
                where: { id: groupId },
                data: { syncStatus: "error" },
            });
            return json({ success: true, message: `Added ${addedCount} products but sync error: ${error.message}` });
        }
    }

    // Remove product from group + AUTO SYNC
    if (actionType === "removeProduct") {
        const productId = formData.get("productId");

        await prisma.productGroupItem.delete({
            where: { groupId_productId: { groupId, productId } },
        });

        // Auto-sync after removal
        try {
            const syncResult = await syncGroupMetafields(groupId);
            if (syncResult.success) {
                return json({ success: true, message: "Product removed and synced successfully!" });
            } else {
                return json({ success: true, message: `Product removed. ${syncResult.error}` });
            }
        } catch (error) {
            await prisma.productGroup.update({
                where: { id: groupId },
                data: { syncStatus: "error" },
            });
            return json({ success: true, message: `Product removed but sync error: ${error.message}` });
        }
    }

    // Update option value + AUTO SYNC
    if (actionType === "updateProductItem") {
        const productId = formData.get("productId");
        const optionValue = formData.get("optionValue");
        const customImageUrl = formData.get("customImageUrl");
        const customColor = formData.get("customColor");

        await prisma.productGroupItem.update({
            where: { groupId_productId: { groupId, productId } },
            data: {
                optionValue,
                customImageUrl: customImageUrl || null,
                customColor: customColor || null,
            },
        });

        // Auto-sync after update
        try {
            const syncResult = await syncGroupMetafields(groupId);
            if (syncResult.success) {
                return json({ success: true, message: "Updated and synced successfully!" });
            } else {
                return json({ success: true, message: `Updated. ${syncResult.error}` });
            }
        } catch (error) {
            await prisma.productGroup.update({
                where: { id: groupId },
                data: { syncStatus: "error" },
            });
            return json({ success: true, message: `Updated but sync error: ${error.message}` });
        }
    }

    // SYNC - Sync metafields to Shopify
    if (actionType === "sync") {
        try {
            const group = await prisma.productGroup.findUnique({
                where: { id: groupId },
                include: { products: { orderBy: { position: "asc" } } },
            });

            if (!group || group.products.length < 2) {
                return json({ error: "At least 2 products are required to sync" }, { status: 400 });
            }

            const allHandles = group.products.map((p) => p.productHandle).filter(Boolean);

            // For each product, save all handles to preserve order
            for (const product of group.products) {
                // Save all handles for consistent order
                const allHandlesForProduct = allHandles;

                // Update product metafields
                const metafieldMutation = await admin.graphql(`
          mutation UpdateProductMetafields($input: ProductInput!) {
            productUpdate(input: $input) {
              product { id }
              userErrors { field message }
            }
          }
        `, {
                    variables: {
                        input: {
                            id: product.productId,
                            metafields: [
                                {
                                    namespace: "linked_products",
                                    key: "linked_list",
                                    value: JSON.stringify(allHandlesForProduct),
                                    type: "json",
                                },
                                {
                                    namespace: "linked_products",
                                    key: "option_value",
                                    value: product.optionValue || "",
                                    type: "single_line_text_field",
                                },
                            ],
                        },
                    },
                });

                const result = await metafieldMutation.json();
                if (result.data?.productUpdate?.userErrors?.length > 0) {
                    console.error("Sync error:", result.data.productUpdate.userErrors);
                    throw new Error(result.data.productUpdate.userErrors[0].message);
                }
            }

            // Update sync status
            await prisma.productGroup.update({
                where: { id: groupId },
                data: { syncStatus: "synced" },
            });

            return json({ success: true, message: "Synced successfully!" });
        } catch (error) {
            await prisma.productGroup.update({
                where: { id: groupId },
                data: { syncStatus: "error" },
            });
            return json({ error: error.message || "Sync error" }, { status: 500 });
        }
    }

    // Update Inventory Behavior
    if (actionType === "updateInventoryBehavior") {
        const behavior = formData.get("behavior");
        await prisma.productGroup.update({
            where: { id: groupId },
            data: { inventoryBehavior: behavior },
        });

        // Auto-sync after general setting update
        try {
            await syncGroupMetafields(groupId);
            return json({ success: true, message: "Inventory settings updated and synced!" });
        } catch (error) {
            return json({ success: true, message: `Settings saved but sync failed: ${error.message}` });
        }
    }

    return json({ error: "Invalid action" }, { status: 400 });
}

export default function GroupDetail() {
    const { group } = useLoaderData();
    const actionData = useActionData();
    const submit = useSubmit();
    const navigation = useNavigation();
    const shopify = useAppBridge();

    const [showEditModal, setShowEditModal] = useState(false);
    const [editingProduct, setEditingProduct] = useState(null);
    const [editOptionValue, setEditOptionValue] = useState("");
    const [editCustomImageUrl, setEditCustomImageUrl] = useState("");
    const [editCustomColor, setEditCustomColor] = useState("");

    const [actionBannerVisible, setActionBannerVisible] = useState(true);

    // Reset banner visibility when actionData changes
    useEffect(() => {
        if (actionData) {
            setActionBannerVisible(true);
        }
    }, [actionData]);

    const isLoading = navigation.state === "submitting" || navigation.state === "loading";
    const isSyncing = navigation.state !== "idle" && (
        navigation.formData?.get("action") === "sync" ||
        navigation.formData?.get("action") === "addProducts" ||
        navigation.formData?.get("action") === "updateInventoryBehavior"
    );

    // Open Resource Picker to select products
    const handleOpenResourcePicker = useCallback(async () => {
        try {
            const selection = await shopify.resourcePicker({
                type: "product",
                multiple: true,
                action: "select",
                filter: {
                    variants: false,
                },
            });

            if (selection && selection.length > 0) {
                const products = selection.map((product) => ({
                    id: product.id,
                    title: product.title,
                    handle: product.handle,
                }));

                const formData = new FormData();
                formData.append("action", "addProducts");
                formData.append("products", JSON.stringify(products));
                submit(formData, { method: "POST" });
            }
        } catch (error) {
            console.error("Resource picker error:", error);
        }
    }, [shopify, submit]);

    const handleRemoveProduct = useCallback((productId) => {
        if (!confirm("Remove this product from group?")) return;

        const formData = new FormData();
        formData.append("action", "removeProduct");
        formData.append("productId", productId);
        submit(formData, { method: "POST" });
    }, [submit]);

    const handleEditProduct = useCallback((product) => {
        setEditingProduct(product);
        setEditOptionValue(product.optionValue || "");
        setEditCustomImageUrl(product.customImageUrl || "");
        setEditCustomColor(product.customColor || "");
        setShowEditModal(true);
    }, []);

    const handleSaveProduct = useCallback(() => {
        if (!editingProduct) return;

        const formData = new FormData();
        formData.append("action", "updateProductItem");
        formData.append("productId", editingProduct.productId);
        formData.append("optionValue", editOptionValue);
        formData.append("customImageUrl", editCustomImageUrl);
        formData.append("customColor", editCustomColor);
        submit(formData, { method: "POST" });

        setShowEditModal(false);
        setEditingProduct(null);
    }, [editingProduct, editOptionValue, editCustomImageUrl, editCustomColor, submit]);

    const handleSync = useCallback(() => {
        const formData = new FormData();
        formData.append("action", "sync");
        submit(formData, { method: "POST" });
    }, [submit]);

    const handleInventoryChange = useCallback((value) => {
        const formData = new FormData();
        formData.append("action", "updateInventoryBehavior");
        formData.append("behavior", value);
        submit(formData, { method: "POST" });
    }, [submit]);


    const getSyncBadge = () => {
        switch (group.syncStatus) {
            case "synced":
                return <Badge tone="success">Synced</Badge>;
            case "error":
                return <Badge tone="critical">Error</Badge>;
            default:
                return <Badge tone="warning">Pending sync</Badge>;
        }
    };

    return (
        <Page
            backAction={{ url: "/app" }}
            title={group.name}
            titleMetadata={getSyncBadge()}
            primaryAction={{
                content: "Add Products",
                onAction: handleOpenResourcePicker,
                disabled: isLoading,
            }}
            secondaryActions={[
                {
                    content: "Sync Metafields",
                    onAction: handleSync,
                    loading: isLoading && navigation.formData?.get("action") === "sync",
                    disabled: isLoading || group.products.length < 2,
                    primary: group.syncStatus === "pending"
                }
            ]}
        >
            <TitleBar title={group.name} />

            <Layout>
                <Layout.Section>
                    <BlockStack gap="400">
                        {actionData?.success && actionBannerVisible && (
                            <Banner tone="success" onDismiss={() => setActionBannerVisible(false)}>
                                <p>{actionData.message}</p>
                            </Banner>
                        )}

                        {actionData?.error && actionBannerVisible && (
                            <Banner tone="critical" onDismiss={() => setActionBannerVisible(false)}>
                                <p style={{ whiteSpace: "pre-line" }}>{actionData.error}</p>
                            </Banner>
                        )}

                        {group.syncStatus === "pending" && group.products.length >= 2 && !isLoading && (
                            <Banner tone="info">
                                <BlockStack gap="200">
                                    <p>You have unsynced changes. Click "Sync Metafields" to update your store.</p>
                                    <div style={{ maxWidth: '200px' }}>
                                        <Button size="slim" onClick={handleSync}>Sync Now</Button>
                                    </div>
                                </BlockStack>
                            </Banner>
                        )}

                        {isSyncing && (
                            <Box paddingBlockEnd="400">
                                <BlockStack gap="100">
                                    <Text variant="bodySm" tone="subdued">Syncing with Shopify... Please wait.</Text>
                                    <ProgressBar size="small" animated progress={45} />
                                </BlockStack>
                            </Box>
                        )}

                        <Card>
                            <BlockStack gap="400">
                                <Text variant="headingMd">Inventory Settings</Text>
                                <InlineStack gap="400" blockAlign="center">
                                    <div style={{ flex: 1 }}>
                                        <Text as="p" tone="subdued">
                                            Choose how to handle products that are currently out of stock.
                                        </Text>
                                    </div>
                                    <Select
                                        label="Out of stock behavior"
                                        labelHidden
                                        options={[
                                            { label: 'Show with indicator', value: 'show' },
                                            { label: 'Hide from list', value: 'hide' },
                                        ]}
                                        value={group.inventoryBehavior || "show"}
                                        onChange={handleInventoryChange}
                                    />
                                </InlineStack>
                            </BlockStack>
                        </Card>

                        <Card padding="0">
                            {group.products.length === 0 ? (
                                <Box padding="600">
                                    <EmptyState
                                        heading="No products yet"
                                        action={{ content: "Add Products", onAction: handleOpenResourcePicker }}
                                        image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                                    >
                                        <p>Add at least 2 products to create links.</p>
                                    </EmptyState>
                                </Box>
                            ) : (
                                <IndexTable
                                    resourceName={{ singular: "product", plural: "products" }}
                                    itemCount={group.products.length}
                                    headings={[
                                        { title: "Product" },
                                        { title: "Option Value" },
                                        { title: "Swatch" },
                                        { title: "Actions", alignment: "end" },
                                    ]}
                                    selectable={false}
                                >
                                    {group.products.map((item, index) => (
                                        <IndexTable.Row id={item.productId} key={item.productId} position={index}>
                                            <IndexTable.Cell>
                                                <div style={{ maxWidth: '350px' }}>
                                                    <InlineStack gap="300" blockAlign="center" wrap={false}>
                                                        <div style={{ flexShrink: 0 }}>
                                                            <Thumbnail
                                                                source={item.image || "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-image_large.png"}
                                                                alt={item.title}
                                                                size="small"
                                                            />
                                                        </div>
                                                        <div style={{ minWidth: 0, flex: 1 }}>
                                                            <Text variant="bodyMd" fontWeight="semibold" truncate>
                                                                {item.title}
                                                            </Text>
                                                        </div>
                                                    </InlineStack>
                                                </div>
                                            </IndexTable.Cell>
                                            <IndexTable.Cell>
                                                <div style={{ maxWidth: '180px', overflow: 'hidden' }}>
                                                    <Button
                                                        variant="plain"
                                                        onClick={() => handleEditProduct(item)}
                                                        textAlign="start"
                                                    >
                                                        <span style={{
                                                            display: 'block',
                                                            maxWidth: '180px',
                                                            whiteSpace: 'nowrap',
                                                            overflow: 'hidden',
                                                            textOverflow: 'ellipsis'
                                                        }}>
                                                            {item.optionValue || "Not set"}
                                                        </span>
                                                    </Button>
                                                </div>
                                            </IndexTable.Cell>
                                            <IndexTable.Cell>
                                                <Tooltip content={item.customColor ? "Custom Color" : item.customImageUrl ? "Custom Image" : "Product Image"}>
                                                    <div style={{ display: 'flex', alignItems: 'center' }}>
                                                        {item.customColor ? (
                                                            <div style={{
                                                                width: '28px',
                                                                height: '28px',
                                                                borderRadius: '50%',
                                                                backgroundColor: item.customColor,
                                                                border: '2px solid #fff',
                                                                boxShadow: '0 0 0 1px rgba(0,0,0,0.1)'
                                                            }} />
                                                        ) : (
                                                            <div style={{
                                                                borderRadius: '4px',
                                                                overflow: 'hidden',
                                                                border: '1px solid #eee',
                                                                lineHeight: 0
                                                            }}>
                                                                <Thumbnail
                                                                    source={item.customImageUrl || item.image || "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-image_large.png"}
                                                                    size="extraSmall"
                                                                    alt=""
                                                                />
                                                            </div>
                                                        )}
                                                    </div>
                                                </Tooltip>
                                            </IndexTable.Cell>
                                            <IndexTable.Cell>
                                                <InlineStack gap="100" align="end">
                                                    <Tooltip content="Edit">
                                                        <Button
                                                            icon={EditIcon}
                                                            onClick={() => handleEditProduct(item)}
                                                            accessibilityLabel="Edit product"
                                                        />
                                                    </Tooltip>
                                                    <Tooltip content="Remove">
                                                        <Button
                                                            icon={DeleteIcon}
                                                            tone="critical"
                                                            onClick={() => handleRemoveProduct(item.productId)}
                                                            loading={isLoading && navigation.formData?.get("action") === "removeProduct" && navigation.formData?.get("productId") === item.productId}
                                                            accessibilityLabel="Remove product"
                                                        />
                                                    </Tooltip>
                                                </InlineStack>
                                            </IndexTable.Cell>
                                        </IndexTable.Row>
                                    ))}
                                </IndexTable>
                            )}
                        </Card>

                        {group.products.length > 0 && group.products.length < 2 && (
                            <Banner tone="warning">
                                <p>At least 2 products are required for links to display on storefront</p>
                            </Banner>
                        )}
                    </BlockStack>
                </Layout.Section>
            </Layout>

            {/* Modal to edit Option Value */}
            <Modal
                open={showEditModal}
                onClose={() => setShowEditModal(false)}
                title="Edit Product Appearance"
                primaryAction={{
                    content: "Save",
                    onAction: handleSaveProduct,
                    loading: isLoading && navigation.formData?.get("action") === "updateProductItem",
                }}
                secondaryActions={[{ content: "Cancel", onAction: () => setShowEditModal(false) }]}
            >
                <Modal.Section>
                    <BlockStack gap="400">
                        <InlineStack gap="400" blockAlign="center" wrap={false}>
                            <div style={{ flexShrink: 0 }}>
                                <Thumbnail
                                    source={editingProduct?.image || "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-image_large.png"}
                                    alt={editingProduct?.title}
                                    size="small"
                                />
                            </div>
                            <Text fontWeight="semibold" variant="bodyMd">{editingProduct?.title}</Text>
                        </InlineStack>
                        <TextField
                            label="Option Value (Display label)"
                            value={editOptionValue}
                            onChange={setEditOptionValue}
                            placeholder="e.g. Red, Blue, Large..."
                            autoComplete="off"
                        />
                        <Divider />
                        <BlockStack gap="200">
                            <Text variant="headingSm">Swatch Customization</Text>

                            <Text tone="subdued" variant="bodySm">Select an image from this product:</Text>
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(7, 1fr)',
                                gap: '8px',
                                maxHeight: '250px',
                                overflowY: 'auto',
                                padding: '4px'
                            }}>
                                {editingProduct?.allImages?.map((url, idx) => (
                                    <div
                                        key={idx}
                                        onClick={() => setEditCustomImageUrl(url)}
                                        style={{
                                            cursor: 'pointer',
                                            border: editCustomImageUrl === url ? '3px solid #008060' : '1px solid #ddd',
                                            borderRadius: '6px',
                                            overflow: 'hidden',
                                            backgroundColor: '#f9f9f9',
                                            position: 'relative',
                                            paddingBottom: '100%', // Create square ratio effectively
                                            minWidth: 0
                                        }}
                                    >
                                        <img
                                            src={url}
                                            alt=""
                                            style={{
                                                position: 'absolute',
                                                top: 0,
                                                left: 0,
                                                width: '100%',
                                                height: '100%',
                                                objectFit: 'cover'
                                            }}
                                        />
                                    </div>
                                ))}
                                {editingProduct?.allImages?.length === 0 && (
                                    <div style={{ gridColumn: 'span 7', textAlign: 'center', padding: '20px' }}>
                                        <Text tone="subdued">No images found for this product.</Text>
                                    </div>
                                )}
                            </div>

                            <TextField
                                label="Custom Image URL"
                                value={editCustomImageUrl}
                                onChange={setEditCustomImageUrl}
                                placeholder="https://example.com/image.jpg"
                                helpText="You can also paste an external image URL here"
                                autoComplete="off"
                            />
                        </BlockStack>
                        <InlineStack gap="400" blockAlign="center">
                            <div style={{ flex: 1 }}>
                                <TextField
                                    label="Custom Color (HEX)"
                                    value={editCustomColor}
                                    onChange={setEditCustomColor}
                                    placeholder="#000000"
                                    helpText="Example: #FF0000 for Red"
                                    autoComplete="off"
                                />
                            </div>
                            {editCustomColor && (
                                <div style={{
                                    width: '40px',
                                    height: '40px',
                                    borderRadius: '4px',
                                    backgroundColor: editCustomColor,
                                    border: '1px solid #ddd',
                                    marginTop: '10px'
                                }} />
                            )}
                        </InlineStack>
                    </BlockStack>
                </Modal.Section>
            </Modal>
        </Page>
    );
}

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
    Thumbnail,
    Modal,
    TextField,
    Box,
    Divider,
    Select,
    Tooltip,
    ProgressBar,
    Icon,
    Checkbox,
    Grid,
} from "@shopify/polaris";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import { 
    DeleteIcon, 
    ChevronLeftIcon, 
    MagicIcon, 
    PlusCircleIcon, 
    OrderIcon,
    ViewIcon,
    DragHandleIcon,
} from "@shopify/polaris-icons";

// Loader - Get group info and product list
export async function loader({ request, params }) {
    const { authenticate, MONTHLY_PLAN_BASIC, MONTHLY_PLAN_PRO } = await import("../shopify.server");
    const { default: prisma } = await import("../db.server");
    const { getUsageInfo, confirmSubscription } = await import("../billing.server");

    const { admin, session, billing } = await authenticate.admin(request);
    const shop = session.shop;
    const { id: groupId } = params;

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
            featuredImage { url }
            status
            images(first: 10) { nodes { url } }
            variants(first: 5) { nodes { id title image { url } } }
          }
        }
      }
    `, { variables: { ids: productIds } });

        const result = await response.json();
        const shopifyProducts = result.data?.nodes || [];

        productDetails = group.products.map((item) => {
            const shopifyProduct = shopifyProducts.find((p) => p?.id === item.productId);
            let fallbackImage = shopifyProduct?.variants?.nodes?.find(v => v.image?.url)?.image?.url;

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

    async function syncGroupMetafields(gId) {
        const group = await prisma.productGroup.findUnique({
            where: { id: gId },
            include: { products: { orderBy: { position: "asc" } } },
        });

        if (!group || group.products.length < 2) {
            return { success: false, error: "At least 2 products are required to sync" };
        }

        const metafieldValue = group.products.map(p => ({
            handle: p.productHandle,
            title: p.optionValue || "",
            image: p.customImageUrl || "",
            color: p.customColor || ""
        }));

        const metafields = [];
        for (const product of group.products) {
            const base = { ownerId: product.productId, namespace: "linked_products" };
            metafields.push({ ...base, key: "linked_list", value: JSON.stringify(metafieldValue), type: "json" });
            metafields.push({ ...base, key: "option_value", value: product.optionValue || "", type: "single_line_text_field" });
            metafields.push({ ...base, key: "inventory_behavior", value: group.inventoryBehavior || "show", type: "single_line_text_field" });
            metafields.push({ ...base, key: "option_name", value: group.optionName || "Color", type: "single_line_text_field" });
            metafields.push({ ...base, key: "selector_style", value: group.selectorStyle || "block", type: "single_line_text_field" });
        }

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
            if (result.data?.metafieldsSet?.userErrors?.length > 0) throw new Error(result.data.metafieldsSet.userErrors[0].message);
        }

        await prisma.productGroup.update({ where: { id: gId }, data: { syncStatus: "synced" } });
        return { success: true };
    }

    if (actionType === "addProducts") {
        const productsJson = formData.get("products");
        if (!productsJson) return json({ error: "No products selected" }, { status: 400 });
        const products = JSON.parse(productsJson);
        const maxPosition = await prisma.productGroupItem.aggregate({ where: { groupId }, _max: { position: true } });
        let position = (maxPosition._max.position || 0);

        for (const product of products) {
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
        }
        await syncGroupMetafields(groupId);
        return json({ success: true, message: "Products added and synced!" });
    }

    if (actionType === "removeProduct") {
        const productId = formData.get("productId");
        await prisma.productGroupItem.delete({ where: { groupId_productId: { groupId, productId } } });
        await syncGroupMetafields(groupId);
        return json({ success: true, message: "Product removed!" });
    }

    if (actionType === "updateProductItem") {
        const productId = formData.get("productId");
        await prisma.productGroupItem.update({
            where: { groupId_productId: { groupId, productId } },
            data: {
                optionValue: formData.get("optionValue"),
                customImageUrl: formData.get("customImageUrl") || null,
                customColor: formData.get("customColor") || null,
            },
        });
        await syncGroupMetafields(groupId);
        return json({ success: true });
    }

    if (actionType === "updateGroupSettings") {
        const optionName = formData.get("optionName");
        const selectorStyle = formData.get("selectorStyle");
        const groupName = formData.get("groupName");
        const status = formData.get("status");

        const updateData = {};
        if (optionName !== null) updateData.optionName = optionName;
        if (selectorStyle !== null) updateData.selectorStyle = selectorStyle;
        if (groupName !== null) updateData.name = groupName;
        if (status !== null) updateData.status = status;

        await prisma.productGroup.update({ where: { id: groupId }, data: updateData });
        await syncGroupMetafields(groupId);
        return json({ success: true });
    }

    if (actionType === "autoFill") {
        const group = await prisma.productGroup.findUnique({
            where: { id: groupId },
            include: { products: true }
        });
        
        for (const item of group.products) {
            if (!item.optionValue) {
                await prisma.productGroupItem.update({
                    where: { id: item.id },
                    data: { optionValue: item.productHandle.split("-").map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(" ") }
                });
            }
        }
        await syncGroupMetafields(groupId);
        return json({ success: true, message: "Option values auto-filled!" });
    }

    if (actionType === "sync") {
        await syncGroupMetafields(groupId);
        return json({ success: true, message: "Synced successfully!" });
    }

    return json({ error: "Invalid action" }, { status: 400 });
}

export default function GroupDetail() {
    const { group, shop } = useLoaderData();
    const actionData = useActionData();
    const submit = useSubmit();
    const navigation = useNavigation();
    const shopify = useAppBridge();

    const [showEditModal, setShowEditModal] = useState(false);
    const [editingProduct, setEditingProduct] = useState(null);
    const [editOptionValue, setEditOptionValue] = useState("");
    const [editCustomImageUrl, setEditCustomImageUrl] = useState("");
    const [editCustomColor, setEditCustomColor] = useState("");
    
    // UI State for Preview
    const [previewOnProductCard, setPreviewOnProductCard] = useState(true);

    const isLoading = navigation.state !== "idle";

    const handleOpenResourcePicker = useCallback(async () => {
        try {
            const selection = await shopify.resourcePicker({ type: "product", multiple: true, action: "select" });
            if (selection && selection.length > 0) {
                const formData = new FormData();
                formData.append("action", "addProducts");
                formData.append("products", JSON.stringify(selection.map(p => ({ id: p.id, handle: p.handle, title: p.title }))));
                submit(formData, { method: "POST" });
            }
        } catch (error) { console.error("Picker error:", error); }
    }, [shopify, submit]);

    const handleRemoveProduct = (productId) => {
        if (!confirm("Remove this product from group?")) return;
        const formData = new FormData();
        formData.append("action", "removeProduct");
        formData.append("productId", productId);
        submit(formData, { method: "POST" });
    };

    const handleUpdateField = (productId, field, value) => {
        const formData = new FormData();
        formData.append("action", "updateProductItem");
        formData.append("productId", productId);
        
        const item = group.products.find(p => p.productId === productId);
        formData.append("optionValue", field === "optionValue" ? value : (item.optionValue || ""));
        formData.append("customImageUrl", field === "customImageUrl" ? value : (item.customImageUrl || ""));
        formData.append("customColor", field === "customColor" ? value : (item.customColor || ""));
        
        submit(formData, { method: "POST" });
    };

    const handleGroupStatusChange = (value) => {
        const formData = new FormData();
        formData.append("action", "updateGroupSettings");
        formData.append("status", value);
        submit(formData, { method: "POST" });
    };

    const handleAutoFill = () => {
        const formData = new FormData();
        formData.append("action", "autoFill");
        submit(formData, { method: "POST" });
    };

    const handleSync = () => {
        const formData = new FormData();
        formData.append("action", "sync");
        submit(formData, { method: "POST" });
    };

    return (
        <Page fullWidth>
            {/* Swatch Edit Modal */}
            <Modal
                open={showEditModal}
                onClose={() => setShowEditModal(false)}
                title="Edit Product Appearance"
                primaryAction={{ 
                    content: "Save", 
                    onAction: () => {
                        handleUpdateField(editingProduct.productId, "optionValue", editOptionValue);
                        handleUpdateField(editingProduct.productId, "customImageUrl", editCustomImageUrl);
                        handleUpdateField(editingProduct.productId, "customColor", editCustomColor);
                        setShowEditModal(false);
                    },
                    loading: isLoading
                }}
            >
                <Modal.Section>
                    <BlockStack gap="400">
                        <TextField 
                            label="Option Value" 
                            value={editOptionValue} 
                            onChange={setEditOptionValue} 
                            autoComplete="off" 
                            placeholder="e.g. Red, Blue, etc."
                        />
                        <TextField 
                            label="Custom Color (HEX)" 
                            value={editCustomColor} 
                            onChange={setEditCustomColor} 
                            autoComplete="off" 
                            placeholder="#000000" 
                        />
                        <Divider />
                        <Text variant="headingSm">Select Image from Product</Text>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '8px' }}>
                            {editingProduct?.allImages?.map((url, i) => (
                                <Box 
                                    key={i} 
                                    onClick={() => setEditCustomImageUrl(url)}
                                    borderColor={editCustomImageUrl === url ? "border-info" : "border"} 
                                    borderWidth={editCustomImageUrl === url ? "050" : "025"}
                                    borderRadius="200"
                                    overflow="hidden"
                                    cursor="pointer"
                                    height="60px"
                                >
                                    <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                </Box>
                            ))}
                        </div>
                        <TextField 
                            label="Custom Image URL" 
                            value={editCustomImageUrl} 
                            onChange={setEditCustomImageUrl} 
                            autoComplete="off" 
                            placeholder="https://..." 
                        />
                    </BlockStack>
                </Modal.Section>
            </Modal>
            <Box paddingBlockEnd="400">
                <BlockStack gap="200">
                    <InlineStack gap="200" align="start" blockAlign="center">
                        <Button icon={ChevronLeftIcon} variant="tertiary" url="/app/groups" />
                        <Text variant="headingLg">{group.id ? "Edit product group" : "New product group"}</Text>
                    </InlineStack>
                    <Box paddingInlineStart="1000">
                        <Text variant="bodyMd" tone="subdued">Combine multiple products into a single option</Text>
                    </Box>
                </BlockStack>
            </Box>

            <Layout>
                {/* Main Column */}
                <Layout.Section>
                    <BlockStack gap="400">
                        {actionData?.message && <Banner tone="success"><p>{actionData.message}</p></Banner>}
                        
                        {/* Group Info Card */}
                        <Card>
                            <BlockStack gap="400">
                                <TextField
                                    label="Product group name (optional)"
                                    value={group.name}
                                    onChange={(v) => {
                                        const fd = new FormData();
                                        fd.append("action", "updateGroupSettings");
                                        fd.append("groupName", v);
                                        submit(fd, { method: "POST" });
                                    }}
                                    helpText="For internal use only"
                                    autoComplete="off"
                                    maxLength={255}
                                    suffix={<Text tone="subdued">{group.name?.length || 0}/255</Text>}
                                />
                                <TextField
                                    label="Option name"
                                    value={group.optionName || "Color"}
                                    onChange={(v) => {
                                        const fd = new FormData();
                                        fd.append("action", "updateGroupSettings");
                                        fd.append("optionName", v);
                                        submit(fd, { method: "POST" });
                                    }}
                                    autoComplete="off"
                                    maxLength={255}
                                    suffix={<Text tone="subdued">{(group.optionName || "Color").length}/255</Text>}
                                />
                            </BlockStack>
                        </Card>

                        {/* Products Card */}
                        <Card padding="0">
                            <Box padding="400">
                                <InlineStack align="space-between" blockAlign="center">
                                    <Text variant="headingMd">Products</Text>
                                    <InlineStack gap="200">
                                        <Button icon={MagicIcon} onClick={handleAutoFill} variant="tertiary" disabled={group.products.length === 0}>Auto-fill</Button>
                                        <Button icon={PlusCircleIcon} onClick={handleOpenResourcePicker}>Add products</Button>
                                        <Button icon={OrderIcon} variant="tertiary" />
                                    </InlineStack>
                                </InlineStack>
                            </Box>
                            <Divider />
                            
                            {group.products.length === 0 ? (
                                <Box padding="1000">
                                    <BlockStack gap="200" align="center">
                                        <Text variant="bodyMd" tone="subdued">No products added yet.</Text>
                                        <Button onClick={handleOpenResourcePicker}>Add products</Button>
                                    </BlockStack>
                                </Box>
                            ) : (
                                <BlockStack>
                                    {group.products.map((product, idx) => (
                                        <div key={product.productId}>
                                            <Box padding="400">
                                                <Grid>
                                                    <Grid.Cell columnSpan={{ xs: 1, sm: 1, md: 1, lg: 1 }}>
                                                        <Box paddingBlockStart="400">
                                                            <Icon source={DragHandleIcon} tone="subdued" />
                                                        </Box>
                                                    </Grid.Cell>
                                                    <Grid.Cell columnSpan={{ xs: 2, sm: 2, md: 2, lg: 2 }}>
                                                        <Thumbnail
                                                            source={product.image || "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-image_large.png"}
                                                            size="medium"
                                                            alt=""
                                                        />
                                                    </Grid.Cell>
                                                    <Grid.Cell columnSpan={{ xs: 7, sm: 7, md: 7, lg: 7 }}>
                                                        <BlockStack gap="200">
                                                            <InlineStack gap="200" blockAlign="center">
                                                                <Badge tone={product.status === "ACTIVE" ? "success" : "info"}>
                                                                    {product.status === "ACTIVE" ? "Active" : "Draft"}
                                                                </Badge>
                                                                <Text fontWeight="semibold" variant="bodyMd">{product.title}</Text>
                                                            </InlineStack>
                                                            <InlineStack gap="200" blockAlign="center">
                                                                <div style={{ width: '180px' }}>
                                                                    <TextField
                                                                        label="Option value"
                                                                        labelHidden
                                                                        placeholder="Option value"
                                                                        value={product.optionValue}
                                                                        onChange={(v) => handleUpdateField(product.productId, "optionValue", v)}
                                                                        autoComplete="off"
                                                                    />
                                                                </div>
                                                                <div style={{ width: '150px' }}>
                                                                    <Select
                                                                        label="Style"
                                                                        labelHidden
                                                                        options={[
                                                                            { label: 'One color', value: 'one' },
                                                                            { label: 'Two colors', value: 'two' },
                                                                        ]}
                                                                        value="one"
                                                                    />
                                                                </div>
                                                                {/* Swatch Preview Box */}
                                                                <Box 
                                                                    width="34px" 
                                                                    height="34px" 
                                                                    background="bg-surface-secondary" 
                                                                    borderColor="border" 
                                                                    borderWidth="025" 
                                                                    borderRadius="100"
                                                                    cursor="pointer"
                                                                    onClick={() => {
                                                                        setEditingProduct(product);
                                                                        setEditOptionValue(product.optionValue || "");
                                                                        setEditCustomImageUrl(product.customImageUrl || "");
                                                                        setEditCustomColor(product.customColor || "");
                                                                        setShowEditModal(true);
                                                                    }}
                                                                >
                                                                    <div style={{ position: 'relative', width: '100%', height: '100%', borderRadius: '50%', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                                        {product.customColor ? (
                                                                            <div style={{ width: '100%', height: '100%', background: product.customColor }} />
                                                                        ) : product.customImageUrl ? (
                                                                            <img src={product.customImageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                                        ) : product.image ? (
                                                                             <img src={product.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.5 }} />
                                                                        ) : (
                                                                            <div style={{ width: '100%', height: '100%', border: '1px dashed #ccc', borderRadius: '50%' }} />
                                                                        )}
                                                                        {!product.customColor && !product.customImageUrl && (
                                                                            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', pointerEvents: 'none' }}>
                                                                                <Text variant="bodyXs" tone="subdued">+</Text>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </Box>
                                                            </InlineStack>
                                                        </BlockStack>
                                                    </Grid.Cell>
                                                    <Grid.Cell columnSpan={{ xs: 2, sm: 2, md: 2, lg: 2 }}>
                                                        <InlineStack gap="200" align="end">
                                                            <Tooltip content="Preview product">
                                                                <Button icon={ViewIcon} variant="tertiary" url={`https://${shop}/products/${product.handle}`} target="_blank" />
                                                            </Tooltip>
                                                            <Tooltip content="Remove">
                                                                <Button icon={DeleteIcon} tone="critical" onClick={() => handleRemoveProduct(product.productId)} />
                                                            </Tooltip>
                                                        </InlineStack>
                                                    </Grid.Cell>
                                                </Grid>
                                            </Box>
                                            {idx < group.products.length - 1 && <Divider />}
                                        </div>
                                    ))}
                                </BlockStack>
                            )}
                        </Card>
                    </BlockStack>
                </Layout.Section>

                {/* Sidebar Column */}
                <Layout.Section variant="oneThird">
                    <BlockStack gap="400">
                        {/* Group Status */}
                        <Card>
                            <BlockStack gap="200">
                                <Text variant="headingSm">Group status</Text>
                                <Select
                                    label="Status"
                                    labelHidden
                                    options={[
                                        { label: 'Active', value: 'active' },
                                        { label: 'Draft', value: 'draft' },
                                    ]}
                                    value={group.status || "draft"}
                                    onChange={handleGroupStatusChange}
                                />
                            </BlockStack>
                        </Card>

                        {/* Preview Product Page */}
                        <Card>
                            <BlockStack gap="300">
                                <Text variant="headingSm">Preview on product page</Text>
                                <Select
                                    label="Selector style"
                                    labelHidden
                                    options={[
                                        { label: 'Color swatch card', value: 'swatch_card' },
                                        { label: 'Text block', value: 'block' },
                                    ]}
                                    value="swatch_card"
                                />
                                <Divider />
                                <BlockStack gap="200">
                                    <Text variant="bodySm" tone="subdued" fontWeight="semibold">{group.optionName || "Color"}:</Text>
                                    <InlineStack gap="300">
                                        <Box 
                                            width="52px" 
                                            height="52px" 
                                            borderRadius="100" 
                                            background="bg-surface-secondary" 
                                            borderColor="border-critical" 
                                            borderWidth="050" 
                                            padding="100"
                                        >
                                            <div style={{ width: '100%', height: '100%', borderRadius: '50%', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <div style={{ width: '80%', height: '3px', background: '#ccc', transform: 'rotate(-45deg)' }} />
                                            </div>
                                        </Box>
                                        <Box width="52px" height="52px" borderRadius="100" background="bg-surface-secondary" borderColor="border" borderWidth="050" />
                                        <Box 
                                            width="52px" 
                                            height="52px" 
                                            borderRadius="100" 
                                            background="bg-fill-info" 
                                            borderColor="border" 
                                            borderWidth="050"
                                            display="flex"
                                            alignItems="center"
                                            justifyContent="center"
                                        >
                                            <div style={{ position: 'absolute', bottom: '-25px', width: 'max-content' }}>
                                                <Badge size="small">3p Fulfill</Badge>
                                            </div>
                                        </Box>
                                    </InlineStack>
                                    <Box paddingBlockStart="400" />
                                </BlockStack>
                            </BlockStack>
                        </Card>

                        {/* Preview Product Card */}
                        <Card>
                            <BlockStack gap="300">
                                <InlineStack align="space-between" blockAlign="center">
                                    <Text variant="headingSm">Preview on product card</Text>
                                    <div style={{ transform: 'scale(1.2)' }}>
                                        <Checkbox
                                            label=""
                                            labelHidden
                                            checked={previewOnProductCard}
                                            onChange={setPreviewOnProductCard}
                                        />
                                    </div>
                                </InlineStack>
                                <Select
                                    label="Style"
                                    labelHidden
                                    options={[
                                        { label: 'Color swatch', value: 'swatch' },
                                        { label: 'Pill', value: 'pill' },
                                    ]}
                                    value="swatch"
                                />
                                <Divider />
                                <InlineStack gap="200" blockAlign="center">
                                    <Box 
                                        width="18px" 
                                        height="18px" 
                                        borderRadius="100" 
                                        background="bg-surface-secondary" 
                                        borderColor="border-critical" 
                                        borderWidth="025" 
                                        display="flex"
                                        alignItems="center"
                                        justifyContent="center"
                                    >
                                         <div style={{ width: '80%', height: '1px', background: '#ccc', transform: 'rotate(-45deg)' }} />
                                    </Box>
                                    <Box width="18px" height="18px" borderRadius="100" background="bg-fill-warning" />
                                    <Box width="18px" height="18px" borderRadius="100" background="bg-fill-info" />
                                </InlineStack>
                            </BlockStack>
                        </Card>
                    </BlockStack>
                </Layout.Section>
            </Layout>

            {/* Sticky Footer Action Bar */}
            <Box 
                 padding="400" 
                 background="bg-surface" 
                 borderColor="border" 
                 borderWidth="025" 
                 position="sticky" 
                 insetBlockEnd="0" 
                 zIndex="10"
                 marginBlockStart="800"
            >
                <InlineStack align="end">
                    <Button variant="primary" size="large" onClick={handleSync} loading={isLoading}>Save</Button>
                </InlineStack>
            </Box>

            {/* Swatch Edit Modal */}
            <Modal
                open={showEditModal}
                onClose={() => setShowEditModal(false)}
                title="Edit Product Appearance"
                primaryAction={{ content: "Save", onAction: () => {
                    handleUpdateField(editingProduct.productId, "optionValue", editOptionValue);
                    handleUpdateField(editingProduct.productId, "customImageUrl", editCustomImageUrl);
                    handleUpdateField(editingProduct.productId, "customColor", editCustomColor);
                    setShowEditModal(false);
                }}}
            >
                <Modal.Section>
                    <BlockStack gap="400">
                        <TextField label="Option Value" value={editOptionValue} onChange={setEditOptionValue} autoComplete="off" />
                        <TextField label="Custom Color (HEX)" value={editCustomColor} onChange={setEditCustomColor} autoComplete="off" placeholder="#000000" />
                        <Divider />
                        <Text variant="headingSm">Select Image from Product</Text>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '8px' }}>
                            {editingProduct?.allImages?.map((url, i) => (
                                <Box 
                                    key={i} 
                                    onClick={() => setEditCustomImageUrl(url)}
                                    borderColor={editCustomImageUrl === url ? "border-info" : "border"} 
                                    borderWidth={editCustomImageUrl === url ? "050" : "025"}
                                    borderRadius="200"
                                    overflow="hidden"
                                    cursor="pointer"
                                    height="60px"
                                >
                                    <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                </Box>
                            ))}
                        </div>
                        <TextField label="Custom Image URL" value={editCustomImageUrl} onChange={setEditCustomImageUrl} autoComplete="off" placeholder="https://..." />
                    </BlockStack>
                </Modal.Section>
            </Modal>
        </Page>
    );
}

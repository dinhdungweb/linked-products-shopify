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
    ChevronDownIcon,
} from "@shopify/polaris-icons";

// Loader - Get group info and product list
export async function loader({ request, params }) {
    const { authenticate, MONTHLY_PLAN_BASIC, MONTHLY_PLAN_PRO } = await import("../shopify.server");
    const { default: prisma } = await import("../db.server");
    const { getUsageInfo, confirmSubscription } = await import("../billing.server");

    const { admin, session, billing } = await authenticate.admin(request);
    const shop = session.shop;
    const { id: groupId } = params;

    if (groupId === "new") {
        return json({
            group: {
                id: null,
                name: "",
                optionName: "Color",
                selectorStyle: "block",
                status: "active",
                products: [],
            },
            shop: session.shop,
        });
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
        
        let targetGroupId = groupId;
        if (groupId === "new") {
            const newGroup = await prisma.productGroup.create({
                data: {
                    shop: session.shop,
                    name: "Untitled Group",
                    optionName: "Color",
                    selectorStyle: "block",
                    status: "active",
                }
            });
            targetGroupId = newGroup.id;
        }

        const maxPosition = await prisma.productGroupItem.aggregate({ where: { groupId: targetGroupId }, _max: { position: true } });
        let position = (maxPosition._max.position || 0);

        for (const product of products) {
            position++;
            await prisma.productGroupItem.create({
                data: {
                    groupId: targetGroupId,
                    productId: product.id,
                    productHandle: product.handle,
                    optionValue: product.title,
                    position,
                },
            });
        }
        await syncGroupMetafields(targetGroupId);
        
        if (groupId === "new") {
            const { redirect } = await import("@remix-run/node");
            return redirect(`/app/groups/${targetGroupId}`);
        }
        
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
        const cardSelectorStyle = formData.get("cardSelectorStyle");
        const groupName = formData.get("groupName");
        const status = formData.get("status");

        if (groupId === "new") {
             return json({ success: true });
        }

        const updateData = {};
        if (optionName !== null) updateData.optionName = optionName;
        if (selectorStyle !== null) updateData.selectorStyle = selectorStyle;
        if (cardSelectorStyle !== null) updateData.cardSelectorStyle = cardSelectorStyle;
        if (groupName !== null) updateData.name = groupName;
        if (status !== null) updateData.status = status;

        await prisma.productGroup.update({ where: { id: groupId }, data: updateData });
        await syncGroupMetafields(groupId);
        return json({ success: true });
    }

    if (actionType === "deleteGroup") {
        await prisma.productGroup.delete({ where: { id: groupId } });
        const { redirect } = await import("@remix-run/node");
        return redirect("/app/groups");
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
    
    // Style Modal State
    const [showStyleModal, setShowStyleModal] = useState(false);
    const [selectingFor, setSelectingFor] = useState("productPage"); // productPage or productCard
    
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

    const handleDeleteGroup = () => {
        if (!confirm("Are you sure you want to delete this entire group? This action cannot be undone.")) return;
        const formData = new FormData();
        formData.append("action", "deleteGroup");
        submit(formData, { method: "POST" });
    };

    const handleStyleSelect = (styleId) => {
        const formData = new FormData();
        formData.append("action", "updateGroupSettings");
        if (selectingFor === "productPage") {
            formData.append("selectorStyle", styleId);
        } else {
            formData.append("cardSelectorStyle", styleId);
        }
        submit(formData, { method: "POST" });
        setShowStyleModal(false);
    };

    const renderSidebarPreview = (styleId, isCard = false) => {
        const products = group.products.slice(0, 6);
        if (products.length === 0) return <Text tone="subdued">Add products to see preview</Text>;

        if (styleId === 'image_swatch') {
            return (
                <InlineStack gap="200" wrap={false}>
                    {products.map((p, i) => (
                        <div key={i} style={{ 
                            width: isCard ? '24px' : '48px', 
                            height: isCard ? '24px' : '48px', 
                            flexShrink: 0, 
                            border: i === 0 ? '2px solid #000' : '1px solid #ccc', 
                            borderRadius: '4px',
                            backgroundColor: '#fff',
                            overflow: 'hidden' 
                        }}>
                            <img src={p.image || "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-image_large.png"} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        </div>
                    ))}
                </InlineStack>
            );
        }

        if (styleId === 'slide_swatch') {
            return (
                <InlineStack gap="200" wrap={false}>
                    {products.map((p, i) => (
                        <div key={i} style={{ 
                            width: isCard ? '50px' : '80px', 
                            flexShrink: 0, 
                            border: i === 0 ? '2px solid #000' : '1px solid #ccc', 
                            borderRadius: '4px', 
                            backgroundColor: '#fff', 
                            overflow: 'hidden' 
                        }}>
                            <div style={{ width: '100%', height: isCard ? '50px' : '80px', backgroundColor: '#f4f4f4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <img src={p.image} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'cover' }} />
                            </div>
                            {!isCard && (
                                <div style={{ padding: '4px', textAlign: 'center' }}>
                                    <div style={{ fontSize: '10px', fontWeight: 'bold', whiteSpace: 'nowrap', overflow: 'hidden' }}>{p.optionValue}</div>
                                    <div style={{ fontSize: '10px', color: '#666' }}>$12.88</div>
                                </div>
                            )}
                        </div>
                    ))}
                </InlineStack>
            );
        }

        if (styleId === 'polaroid_swatch') {
            return (
                <InlineStack gap="200" wrap={false}>
                    {products.map((p, i) => (
                        <div key={i} style={{ 
                            padding: isCard ? '2px' : '4px', 
                            backgroundColor: '#fff', 
                            border: i === 0 ? '2px solid #000' : '1px solid #ccc', 
                            flexShrink: 0, 
                            boxShadow: '0 1px 3px rgba(0,0,0,0.1)' 
                        }}>
                            <div style={{ width: isCard ? '20px' : '40px', height: isCard ? '24px' : '48px', overflow: 'hidden' }}>
                                <img src={p.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            </div>
                        </div>
                    ))}
                </InlineStack>
            );
        }

        if (styleId === 'color_swatch' || styleId === 'square_color_swatch') {
            return (
                <InlineStack gap="150" wrap={false}>
                    {products.map((p, i) => (
                        <div key={i} style={{
                            width: isCard ? '16px' : '32px', 
                            height: isCard ? '16px' : '32px', 
                            borderRadius: styleId.includes('square') ? '2px' : '50%', 
                            flexShrink: 0,
                            background: p.customColor || '#f5f5dc', 
                            border: '1px solid #ddd',
                            outline: i === 0 ? '2px solid #000' : 'none',
                            outlineOffset: '2px'
                        }} />
                    ))}
                </InlineStack>
            );
        }

        if (styleId === 'pill_swatch') {
            return (
                <InlineStack gap="150" wrap={false}>
                    {products.map((p, i) => (
                        <div key={i} style={{ 
                            padding: isCard ? '4px 8px' : '6px 12px', 
                            border: i === 0 ? '2px solid #000' : '1px solid #ccc', 
                            backgroundColor: '#fff', 
                            borderRadius: '20px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px'
                        }}>
                            <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: p.customColor || '#ccc' }} />
                            <span style={{ fontSize: isCard ? '10px' : '12px' }}>{p.optionValue}</span>
                        </div>
                    ))}
                </InlineStack>
            );
        }

        if (styleId === 'button' || styleId === 'pill_button') {
            return (
                <InlineStack gap="150" wrap={false}>
                    {products.map((p, i) => (
                        <div key={i} style={{ 
                            padding: isCard ? '4px 8px' : '8px 16px', 
                            border: i === 0 ? '2px solid #000' : '1px solid #ccc', 
                            backgroundColor: i === 0 ? '#000' : '#fff', 
                            color: i === 0 ? '#fff' : '#000', 
                            fontSize: isCard ? '10px' : '12px', 
                            borderRadius: styleId === 'pill_button' ? '20px' : '4px',
                            fontWeight: i === 0 ? 'bold' : 'normal'
                        }}>
                            {p.optionValue}
                        </div>
                    ))}
                </InlineStack>
            );
        }

        if (styleId.includes('card')) {
             return (
                <InlineStack gap="200" wrap={false}>
                    {products.map((p, i) => (
                        <div key={i} style={{ 
                            width: isCard ? '60px' : '80px', 
                            flexShrink: 0, 
                            border: i === 0 ? '2px solid #000' : '1px solid #ccc', 
                            borderRadius: '8px', 
                            backgroundColor: '#fff', 
                            padding: '8px',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: '8px'
                        }}>
                            <div style={{ 
                                width: isCard ? '30px' : '40px', 
                                height: isCard ? '30px' : '40px', 
                                borderRadius: styleId.includes('color') ? '50%' : '4px', 
                                backgroundColor: p.customColor || '#f4f4f4',
                                overflow: 'hidden',
                                border: '1px solid #eee'
                            }}>
                                {styleId.includes('image') && <img src={p.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                            </div>
                            <div style={{ fontSize: '10px', fontWeight: 'bold', whiteSpace: 'nowrap', overflow: 'hidden', textAlign: 'center', width: '100%' }}>{p.optionValue}</div>
                        </div>
                    ))}
                </InlineStack>
            );
        }

        if (styleId.includes('dropdown')) {
            return (
                <div style={{ width: '100%', maxWidth: '240px', padding: isCard ? '6px 12px' : '10px 14px', border: '2px solid #000', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fff' }}>
                    <InlineStack gap="200" blockAlign="center">
                        {styleId === 'image_dropdown' && <img src={products[0].image} alt="" style={{ width: '24px', height: '24px', borderRadius: '4px' }} />}
                        <span style={{ fontSize: isCard ? '12px' : '14px', fontWeight: '600' }}>{products[0].optionValue || "Select..." || products[0].title}</span>
                    </InlineStack>
                    <Icon source={ChevronDownIcon} tone="base" />
                </div>
            );
        }

        // Fallback to text blocks
        return (
            <InlineStack gap="150" wrap={false}>
                {products.map((p, i) => (
                    <div key={i} style={{ padding: '8px 16px', border: i === 0 ? '2px solid #000' : '1px solid #ddd', borderRadius: '4px', fontSize: '12px', backgroundColor: i === 0 ? '#000' : '#fff', color: i === 0 ? '#fff' : '#333' }}>{p.optionValue}</div>
                ))}
            </InlineStack>
        );
    };

    const STYLE_OPTIONS = [
        { id: 'image_swatch', label: 'Image swatch', type: 'Image Swatch' },
        { id: 'slide_swatch', label: 'Slide swatch (Mobile only)', type: 'Image Swatch' },
        { id: 'polaroid_swatch', label: 'Polaroid swatch', type: 'Image Swatch' },
        { id: 'color_swatch', label: 'Color swatch', type: 'Color swatch' },
        { id: 'square_color_swatch', label: 'Square color swatch', type: 'Color swatch' },
        { id: 'pill_swatch', label: 'Color swatch in pill button', type: 'Color swatch' },
        { id: 'button', label: 'Button', type: 'Button' },
        { id: 'pill_button', label: 'Pill button', type: 'Button' },
        { id: 'dropdown', label: 'Dropdown', type: 'Dropdown' },
        { id: 'image_dropdown', label: 'Image swatch in dropdown', type: 'Dropdown' },
        { id: 'image_swatch_card', label: 'Image swatch card', type: 'Image Swatch' },
        { id: 'color_swatch_card', label: 'Color swatch card', type: 'Color swatch' },
    ];

    const PREVIEW_IMAGES = [
        "https://picsum.photos/id/1027/400/500",
        "https://picsum.photos/id/1011/400/500",
        "https://picsum.photos/id/1059/400/500",
        "https://picsum.photos/id/1074/400/500",
        "https://picsum.photos/id/1084/400/500",
        "https://picsum.photos/id/1069/400/500",
    ];

    const PREVIEW_COLORS = ['#f5f5dc', '#a020f0', '#ffa500', '#008000', '#ffb6c1', '#adff2f', '#ff0000', 'linear-gradient(45deg, #f06, #9f6)'];

    const renderPreview = (styleId) => {
        if (styleId === 'image_swatch') return (
            <InlineStack gap="200" wrap={false}>
                {PREVIEW_IMAGES.map((img, i) => (
                    <div key={i} style={{ width: '48px', height: '48px', flexShrink: 0, border: i === 1 ? '2px solid #000' : '1px solid #ccc', borderRadius: '4px', overflow: 'hidden' }}>
                        <img src={img} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </div>
                ))}
            </InlineStack>
        );

        if (styleId === 'slide_swatch') return (
            <InlineStack gap="200" wrap={false}>
                {['Beige Brown', 'Black White', 'Red Rose', 'Teal Lily', 'Yellow Bloom', 'Purple Mini'].map((name, i) => (
                    <div key={i} style={{ width: '70px', flexShrink: 0, border: i === 1 ? '2px solid #000' : '1px solid #ccc', borderRadius: '4px', backgroundColor: '#fff', overflow: 'hidden' }}>
                        <div style={{ width: '100%', height: '80px', backgroundColor: '#f4f4f4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <img src={PREVIEW_IMAGES[i]} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'cover' }} />
                        </div>
                        <div style={{ padding: '4px', textAlign: 'center' }}>
                            <div style={{ fontSize: '10px', fontWeight: 'bold', whiteSpace: 'nowrap', overflow: 'hidden' }}>{name}</div>
                            <div style={{ fontSize: '10px', color: '#666' }}>$12.88</div>
                        </div>
                    </div>
                ))}
            </InlineStack>
        );

        if (styleId === 'polaroid_swatch') return (
            <InlineStack gap="200" wrap={false}>
                {PREVIEW_IMAGES.map((img, i) => (
                    <div key={i} style={{ padding: '4px', backgroundColor: '#fff', border: i === 1 ? '2px solid #000' : '1px solid #ccc', flexShrink: 0, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                        <div style={{ width: '40px', height: '48px', overflow: 'hidden' }}>
                            <img src={img} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        </div>
                    </div>
                ))}
            </InlineStack>
        );

        if (styleId === 'color_swatch' || styleId === 'square_color_swatch') return (
            <InlineStack gap="200" wrap={false}>
                {PREVIEW_COLORS.slice(0, 6).map((color, i) => (
                    <div key={i} style={{
                        width: '32px', height: '32px', borderRadius: styleId === 'square_color_swatch' ? '4px' : '50%', flexShrink: 0,
                        background: color, border: '2px solid #fff', outline: i === 1 ? '2px solid #5c6ac4' : '1px solid #ddd', outlineOffset: '2px'
                    }} />
                ))}
            </InlineStack>
        );

        if (styleId === 'pill_swatch') return (
            <InlineStack gap="200" wrap={false}>
                {['Beige', 'Purple', 'Orange', 'Green', 'Yellow', 'Black'].map((text, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 12px', flexShrink: 0, borderRadius: '20px', backgroundColor: '#fff', border: i === 1 ? '2px solid #000' : '1px solid #ccc' }}>
                        <div style={{ width: '16px', height: '16px', borderRadius: '50%', background: PREVIEW_COLORS[i] }} />
                        <span style={{ fontSize: '12px', fontWeight: i === 1 ? 'bold' : 'normal' }}>{text}</span>
                    </div>
                ))}
            </InlineStack>
        );

        if (styleId === 'button' || styleId === 'pill_button') return (
            <InlineStack gap="200" wrap={false}>
                {['Beige', 'Dark blue', 'Green', 'Yellow', 'Black', 'Red'].map((n, i) => (
                    <div key={n} style={{ padding: '8px 16px', border: i === 1 ? '2px solid #000' : '1px solid #ccc', backgroundColor: i === 1 ? '#000' : '#fff', color: i === 1 ? '#fff' : '#000', fontSize: '13px', borderRadius: styleId === 'pill_button' ? '20px' : '4px', fontWeight: i === 1 ? 'bold' : 'normal' }}>{n}</div>
                ))}
            </InlineStack>
        );

        if (styleId === 'dropdown') return (
            <div style={{ width: '100%', padding: '10px 14px', border: '1px solid #8c9196', borderRadius: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fff' }}>
                <span style={{ fontSize: '14px' }}>Beige Brown</span>
                <Icon source={ChevronDownIcon} tone="base" />
            </div>
        );

        if (styleId === 'image_dropdown') return (
            <div style={{ width: '100%', padding: '6px 14px', border: '1px solid #8c9196', borderRadius: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fff' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <img src={PREVIEW_IMAGES[0]} alt="" style={{ width: '24px', height: '24px', borderRadius: '4px', objectFit: 'cover' }} />
                    <span style={{ fontSize: '14px' }}>Beige Brown</span>
                </div>
                <Icon source={ChevronDownIcon} tone="base" />
            </div>
        );

        if (styleId === 'image_swatch_card' || styleId === 'color_swatch_card') return (
            <InlineStack gap="200" wrap={false}>
                {['Beige', 'Purple', 'Orange', 'Green', 'Yellow', 'Black'].map((name, i) => (
                    <div key={i} style={{ padding: '8px', border: i === 1 ? '1px solid #000' : '1px solid #ccc', backgroundColor: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                        <div style={{ width: styleId === 'image_swatch_card' ? '40px' : '32px', height: styleId === 'image_swatch_card' ? '40px' : '32px', borderRadius: '50%', overflow: 'hidden', backgroundColor: PREVIEW_COLORS[i], border: '1px solid #ddd' }}>
                            {styleId === 'image_swatch_card' && <img src={PREVIEW_IMAGES[i]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                        </div>
                        <div style={{ fontSize: '10px', fontWeight: i === 1 ? 'bold' : 'normal' }}>{name}</div>
                    </div>
                ))}
            </InlineStack>
        );

        return null;
    };

    return (
        <Page fullWidth>
            {/* Style Selection Modal */}
            <Modal
                open={showStyleModal}
                onClose={() => setShowStyleModal(false)}
                title="LineOption Combined Listings"
                large
            >
                <Modal.Section>
                    <Box paddingBlockEnd="400">
                         <Banner icon={MagicIcon} tone="info">
                            <p>Choose a style to start with. You can customize it later.</p>
                         </Banner>
                    </Box>
                    <div style={{ minWidth: '900px' }}>
                        <Grid>
                            {STYLE_OPTIONS.map((style) => (
                                <Grid.Cell key={style.id} columnSpan={{ xs: 6, sm: 12, md: 6, lg: 6 }}>
                                    <div 
                                        onClick={() => handleStyleSelect(style.id)}
                                        style={{ 
                                            height: '100%', 
                                            display: 'flex', 
                                            flexDirection: 'column', 
                                            backgroundColor: 'var(--p-color-bg-surface, #fff)', 
                                            borderRadius: 'var(--p-border-radius-300, 8px)', 
                                            boxShadow: (selectingFor === "productPage" ? group.selectorStyle : group.cardSelectorStyle) === style.id ? 'var(--p-shadow-300, 0 4px 12px rgba(0,0,0,0.15))' : 'var(--p-shadow-200, 0 1px 3px rgba(0,0,0,0.1))', 
                                            overflow: 'hidden',
                                            cursor: 'pointer',
                                            border: (selectingFor === "productPage" ? group.selectorStyle : group.cardSelectorStyle) === style.id ? '2px solid var(--p-color-border-info, #008060)' : '1px solid transparent',
                                            transition: 'all 0.2s ease'
                                        }}
                                    >
                                        <Box padding="300">
                                            <InlineStack align="space-between" blockAlign="center">
                                                <InlineStack gap="200" blockAlign="center">
                                                    <div style={{ width: '16px', height: '16px', borderRadius: '50%', border: '2px solid #ccc', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                        {(selectingFor === "productPage" ? group.selectorStyle : group.cardSelectorStyle) === style.id && <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#008060' }} />}
                                                    </div>
                                                    <BlockStack gap="050">
                                                        <Text variant="headingSm" as="h3">{style.label}</Text>
                                                        <Text variant="bodySm" tone="subdued">Display as {style.type}</Text>
                                                    </BlockStack>
                                                </InlineStack>
                                            </InlineStack>
                                        </Box>
                                        <Divider />
                                        <div style={{ flex: 1, backgroundColor: 'var(--p-color-bg-surface-secondary, #f4f6f8)', padding: '16px', display: 'flex', flexDirection: 'column', minHeight: '120px' }}>
                                            <div style={{ flex: 1, display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-start', overflowX: 'auto', paddingBottom: '4px' }}>
                                                {renderPreview(style.id)}
                                            </div>
                                        </div>
                                    </div>
                                </Grid.Cell>
                            ))}
                        </Grid>
                    </div>
                </Modal.Section>
            </Modal>
            
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
                                <InlineStack align="space-between" blockAlign="center">
                                    <Text variant="headingSm">Preview on product page</Text>
                                    <Button variant="tertiary" onClick={() => { setSelectingFor("productPage"); setShowStyleModal(true); }}>Change</Button>
                                </InlineStack>
                                <Text variant="bodySm" tone="subdued">Style: {STYLE_OPTIONS.find(s => s.id === group.selectorStyle)?.label || group.selectorStyle}</Text>
                                <Divider />
                                <BlockStack gap="200">
                                    <Text variant="bodySm" tone="subdued" fontWeight="semibold">{group.optionName || "Color"}:</Text>
                                    {renderSidebarPreview(group.selectorStyle)}
                                    <Box paddingBlockStart="400" />
                                </BlockStack>
                            </BlockStack>
                        </Card>

                        {/* Preview Product Card */}
                        <Card>
                            <BlockStack gap="300">
                                <InlineStack align="space-between" blockAlign="center">
                                    <Text variant="headingSm">Preview on product card</Text>
                                    <InlineStack gap="200" blockAlign="center">
                                         <Button variant="tertiary" onClick={() => { setSelectingFor("productCard"); setShowStyleModal(true); }}>Change</Button>
                                         <div style={{ transform: 'scale(1.2)' }}>
                                            <Checkbox
                                                label=""
                                                labelHidden
                                                checked={group.cardSelectorStyle === "same" || !group.cardSelectorStyle}
                                                onChange={(v) => {
                                                    const fd = new FormData();
                                                    fd.append("action", "updateGroupSettings");
                                                    fd.append("cardSelectorStyle", v ? "same" : "swatch");
                                                    submit(fd, { method: "POST" });
                                                }}
                                            />
                                        </div>
                                    </InlineStack>
                                </InlineStack>
                                <Text variant="bodySm" tone="subdued">Style: {group.cardSelectorStyle === "same" ? "Same as product page" : (STYLE_OPTIONS.find(s => s.id === group.cardSelectorStyle)?.label || group.cardSelectorStyle)}</Text>
                                <Divider />
                                <div style={{ border: '1px solid #eee', padding: '12px', borderRadius: '8px', background: '#fff' }}>
                                     {renderSidebarPreview(group.cardSelectorStyle === "same" ? group.selectorStyle : group.cardSelectorStyle, true)}
                                </div>
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
                <InlineStack align="space-between" blockAlign="center">
                    <Button variant="primary" tone="critical" onClick={handleDeleteGroup} loading={isLoading && navigation.formData?.get("action") === "deleteGroup"}>Delete</Button>
                    <InlineStack gap="300">
                        <Button variant="primary" size="large" onClick={handleSync} loading={isLoading && navigation.formData?.get("action") === "sync"}>Save</Button>
                    </InlineStack>
                </InlineStack>
            </Box>
        </Page>
    );
}

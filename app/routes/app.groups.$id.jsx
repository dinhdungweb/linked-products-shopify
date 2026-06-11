import { useCallback, useState, useEffect } from "react";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation, useActionData, useRevalidator } from "@remix-run/react";
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
    Icon,
    Checkbox,
    Grid,
    Popover,
    ColorPicker,
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
import { 
    DndContext, 
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
    useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import {
    enqueueGroupSync,
    enqueueMetafieldCleanup,
    enqueueShopSettingsSync,
} from "../sync-jobs.server";
import { 
    BASE_SETTINGS, 
    DEFAULT_SETTINGS_BY_STYLE, 
    PreviewRenderer 
} from "../utils/style-utils";
import { normalizeProductCardStyle } from "../utils/style-mapping";

const STYLE_OPTIONS = [
    { id: 'image_swatch', label: 'Image swatch', type: 'Image Swatch', category: 'Image Swatch' },
    { id: 'slide_swatch', label: 'Slide swatch (Mobile only)', type: 'Image Swatch', category: 'Image Swatch' },
    { id: 'polaroid_swatch', label: 'Polaroid swatch', type: 'Image Swatch', category: 'Image Swatch' },
    { id: 'color_swatch', label: 'Color swatch', type: 'Color swatch', category: 'Color swatch' },
    { id: 'square_color_swatch', label: 'Square color swatch', type: 'Color swatch', category: 'Color swatch' },
    { id: 'pill_swatch', label: 'Color swatch in pill button', type: 'Color swatch', category: 'Color swatch' },
    { id: 'button', label: 'Button', type: 'Button', category: 'Button & Label' },
    { id: 'pill_button', label: 'Pill button', type: 'Button', category: 'Button & Label' },
    { id: 'dropdown', label: 'Dropdown', type: 'Dropdown', category: 'Dropdown' },
    { id: 'image_dropdown', label: 'Image swatch in dropdown', type: 'Dropdown', category: 'Dropdown' },
    { id: 'button_card', label: 'Button', type: 'Button', category: 'Product Card' },
    { id: 'color_swatch_card', label: 'Color swatch card', type: 'Color swatch', category: 'Product Card' },
    { id: 'image_swatch_card', label: 'Image swatch card', type: 'Image Swatch', category: 'Product Card' },
    { id: 'dropdown_card', label: 'Dropdown', type: 'Dropdown', category: 'Product Card' },
];

const STYLE_CATEGORIES = [
    "Image Swatch",
    "Color swatch",
    "Button & Label",
    "Dropdown",
    "Product Card"
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

function getErrorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}

function buildOptionValueFromHandle(handle) {
    return (handle || "")
        .split("-")
        .filter(Boolean)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");
}

function getDefaultProductItemStyle(selectorStyle) {
    return selectorStyle?.includes("image") || selectorStyle?.includes("slide") || selectorStyle?.includes("polaroid")
        ? "image"
        : "one";
}

function shouldAutoFillOptionValue(currentValue, productTitle) {
    const value = (currentValue || "").trim();
    if (!value) return true;
    return Boolean(productTitle) && value === productTitle;
}

async function enqueueShopSettingsSyncSafely(prisma, shop) {
    try {
        await enqueueShopSettingsSync(prisma, shop);
    } catch (error) {
        console.warn("[Groups] Could not enqueue shop settings sync:", getErrorMessage(error));
    }
}

async function fetchShopCurrencyCode(admin) {
    try {
        const shopResponse = await admin.graphql(`{ shop { currencyCode } }`);
        const shopData = await shopResponse.json();
        return shopData.data?.shop?.currencyCode || "USD";
    } catch (error) {
        console.warn("[Groups] Could not fetch shop currency code:", getErrorMessage(error));
        return "USD";
    }
}

async function fetchShopifyProducts(admin, productIds) {
    if (productIds.length === 0) return [];

    try {
        const response = await admin.graphql(`
      query GetProducts($ids: [ID!]!) {
        nodes(ids: $ids) {
          ... on Product {
            id
            title
            handle
            featuredImage { url }
            status
            totalInventory
            images(first: 10) { nodes { url } }
            variants(first: 5) { nodes { id title price availableForSale image { url } } }
          }
        }
      }
    `, { variables: { ids: productIds } });

        const result = await response.json();
        return result.data?.nodes || [];
    } catch (error) {
        console.warn("[Groups] Could not fetch product details:", getErrorMessage(error));
        return [];
    }
}

// Color conversion helpers
function hexToHsb(hex) {
    if (!hex || !hex.startsWith('#')) return { hue: 0, saturation: 0, brightness: 1 };
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, v = max;
    const d = max - min;
    s = max === 0 ? 0 : d / max;
    if (max === min) { h = 0; }
    else {
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }
    return { hue: h * 360, saturation: s, brightness: v };
}

function hsbToHex(hsb) {
    const { hue, saturation, brightness } = hsb;
    const s = saturation;
    const v = brightness;
    const c = v * s;
    const x = c * (1 - Math.abs((hue / 60) % 2 - 1));
    const m = v - c;
    let r, g, b;
    if (hue >= 0 && hue < 60) { r = c; g = x; b = 0; }
    else if (hue >= 60 && hue < 120) { r = x; g = c; b = 0; }
    else if (hue >= 120 && hue < 180) { r = 0; g = c; b = x; }
    else if (hue >= 180 && hue < 240) { r = 0; g = x; b = c; }
    else if (hue >= 240 && hue < 300) { r = x; g = 0; b = c; }
    else { r = c; g = 0; b = x; }
    const toHex = (n) => Math.round((n + m) * 255).toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

const getBorderRadius = (id) => {
    if (!id) return '8px';
    const lower = id.toLowerCase();
    if (lower.includes('square')) return '4px';
    if (lower.includes('slide')) return '4px';
    if (lower.includes('polaroid')) return '0';
    return '8px';
};


const getSwatchStyle = (p) => {
    if (p.style === 'two') {
        return { background: `linear-gradient(to right, ${p.customColor || '#F5F5F5'} 50%, ${p.customColor2 || '#D0D0D0'} 50%)` };
    }
    if (p.style === 'image') {
        return { 
            backgroundImage: `url(${p.customImageUrl || p.image || ''})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center'
        };
    }
    return { background: p.customColor || '#F5F5F5' };
};

const SortableItem = ({ product, idx, isLast, shop, handleRemoveProduct, handleUpdateField, getBorderRadius, localSelectorStyle }) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: product.productId });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        backgroundColor: isDragging ? 'var(--p-color-bg-surface-secondary, #f4f6f8)' : 'transparent',
        zIndex: isDragging ? 1 : 0,
        position: 'relative',
    };

    return (
        <div ref={setNodeRef} style={style}>
            <Box padding="400">
                <InlineStack gap="300" blockAlign="center" wrap={false}>
                    <div {...attributes} {...listeners} style={{ cursor: 'grab', padding: '8px' }}>
                        <Icon source={DragHandleIcon} tone="subdued" />
                    </div>
                    <Thumbnail
                        source={product.image || "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-image_large.png"}
                        size="medium"
                        alt=""
                    />
                    <div style={{ flex: 1 }}>
                        <BlockStack gap="200">
                            <InlineStack gap="200" blockAlign="center">
                                <Badge tone={product.status === "ACTIVE" ? "success" : "info"}>
                                    {product.status === "ACTIVE" ? "Active" : "Draft"}
                                </Badge>
                                {product.isUnavailable && (
                                    <Badge tone="critical">Sold out</Badge>
                                )}
                                <Text fontWeight="semibold" variant="bodyMd">{product.title}</Text>
                            </InlineStack>
                            <InlineStack gap="200" blockAlign="center">
                                <div style={{ width: '180px' }}>
                                    <TextField
                                        id={`ov-${product.productId}`}
                                        label="Option value"
                                        labelHidden
                                        placeholder="Option value"
                                        value={product.optionValue || ""}
                                        onChange={(v) => handleUpdateField(product.productId, "optionValue", v)}
                                        autoComplete="off"
                                    />
                                </div>
                                <div style={{ width: '130px' }}>
                                    <Select
                                        label="Style"
                                        labelHidden
                                        options={[
                                            { label: 'One color', value: 'one' },
                                            { label: 'Two colors', value: 'two' },
                                            { label: 'Image', value: 'image' },
                                        ]}
                                        value={product.style || "one"}
                                        onChange={(v) => handleUpdateField(product.productId, "style", v)}
                                    />
                                </div>
                                <InlineStack gap="100">
                                    {product.style === 'two' ? (
                                        <InlineStack gap="100">
                                            <ColorPickerPopover 
                                                color={product.customColor || '#F5F5F5'} 
                                                onChange={(v) => handleUpdateField(product.productId, "customColor", v)} 
                                                radius={getBorderRadius(localSelectorStyle)}
                                            />
                                            <ColorPickerPopover 
                                                color={product.customColor2 || '#D0D0D0'} 
                                                onChange={(v) => handleUpdateField(product.productId, "customColor2", v)} 
                                                radius={getBorderRadius(localSelectorStyle)}
                                            />
                                        </InlineStack>
                                    ) : product.style === 'image' ? (
                                        <ImagePickerPopover 
                                            imageUrl={product.customImageUrl} 
                                            onChange={(v) => handleUpdateField(product.productId, "customImageUrl", v)}
                                            productImages={product.allImages || []}
                                            radius={getBorderRadius(localSelectorStyle)}
                                        />
                                    ) : (
                                        <ColorPickerPopover 
                                            color={product.customColor || '#F5F5F5'} 
                                            onChange={(v) => handleUpdateField(product.productId, "customColor", v)} 
                                            radius={getBorderRadius(localSelectorStyle)}
                                        />
                                    )}
                                </InlineStack>
                            </InlineStack>
                        </BlockStack>
                    </div>
                    <div style={{ minWidth: '80px' }}>
                        <InlineStack gap="100" align="end" blockAlign="center">
                            <Tooltip content="Preview product">
                                <Button
                                    icon={ViewIcon}
                                    variant="tertiary"
                                    size="slim"
                                    url={`https://${shop}/products/${product.handle}`}
                                    target="_blank"
                                />
                            </Tooltip>
                            <Tooltip content="Remove">
                                <Button
                                    icon={DeleteIcon}
                                    variant="tertiary"
                                    tone="critical"
                                    size="slim"
                                    onClick={() => handleRemoveProduct(product.productId)}
                                />
                            </Tooltip>
                        </InlineStack>
                    </div>
                </InlineStack>
            </Box>
            {!isLast && <Divider />}
        </div>
    );
};

// Loader - Get group info and product list
export async function loader({ request, params }) {
    const { authenticate } = await import("../shopify.server");
    const { default: prisma } = await import("../db.server");
    const { admin, session } = await authenticate.admin(request);
    const shop = session.shop;
    const { id: groupId } = params;

    if (groupId === "new") {
        const { canAddLinks } = await import("../billing.server");
        const canAdd = await canAddLinks(shop, 1);
        if (!canAdd) {
            return redirect("/app?limit_reached=true");
        }
    }

    const styleSettings = await prisma.optionStyleSetting.findMany({
        where: { shop },
    });

    const appSettings = await prisma.appSetting.findUnique({
        where: { shop },
    }) || await prisma.appSetting.create({
        data: { shop }
    });

    const formattedSettings = styleSettings.reduce((acc, curr) => {
        acc[curr.styleId] = curr.settings;
        return acc;
    }, {});

    if (groupId === "new") {
        let currentCardStyle = normalizeProductCardStyle(
            appSettings.defaultProductCardStyle,
            appSettings.defaultProductPageStyle || "image_swatch",
        );
        
        const isValidCardStyle = STYLE_OPTIONS.some(s => s.id === currentCardStyle && s.category === "Product Card");
        
        if (!isValidCardStyle) {
            currentCardStyle = "image_swatch_card";
            await prisma.appSetting.update({
                where: { shop: session.shop },
                data: { defaultProductCardStyle: currentCardStyle }
            });
            await enqueueShopSettingsSyncSafely(prisma, shop);
        }

        // Fetch all products in other active groups to detect conflicts
        const activeProducts = await prisma.productGroupItem.findMany({
            where: {
                group: {
                    shop: session.shop,
                    status: "active"
                }
            },
            include: { group: { select: { name: true } } }
        });
        
        const usedProductsMap = activeProducts.reduce((acc, p) => {
            acc[p.productId] = p.group.name || "Untitled Group";
            return acc;
        }, {});

        return json({
            group: {
                id: null,
                name: "",
                optionName: "Color",
                selectorStyle: appSettings.defaultProductPageStyle || "image_swatch",
                cardSelectorStyle: currentCardStyle,
                status: "active",
                products: [],
            },
            shop: session.shop,
            styleSettings: formattedSettings,
            appSettings,
            usedProductsMap // Quan trọng: Phải có biến này để không bị crash khi thêm sản phẩm
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
    
    const currencyCode = await fetchShopCurrencyCode(admin);
    
    // Formatter for currency
    const priceFormatter = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currencyCode,
    });
    
    if (group.products.length > 0) {
        const productIds = group.products.map((p) => p.productId);
        const shopifyProducts = await fetchShopifyProducts(admin, productIds);

        productDetails = group.products.map((item) => {
            const shopifyProduct = shopifyProducts.find((p) => p?.id === item.productId);
            let fallbackImage = shopifyProduct?.variants?.nodes?.find(v => v.image?.url)?.image?.url;
            
            // Check if product is available or not based on total inventory or variants
            const isUnavailable = shopifyProduct ? (shopifyProduct.totalInventory <= 0 && !shopifyProduct.variants.nodes.some(v => v.availableForSale)) : false;
            
            // Format price using Intl.NumberFormat
            let rawPrice = parseFloat(shopifyProduct?.variants?.nodes?.[0]?.price || "12.88");
            let formattedPrice = priceFormatter.format(rawPrice);

            return {
                ...item,
                title: shopifyProduct?.title || "Product does not exist",
                handle: shopifyProduct?.handle || item.productHandle,
                image: shopifyProduct?.featuredImage?.url || fallbackImage || null,
                status: shopifyProduct?.status,
                isUnavailable: isUnavailable,
                price: formattedPrice,
                allImages: Array.from(new Set([
                    ...(shopifyProduct?.images?.nodes?.map(n => n.url) || []),
                    ...(shopifyProduct?.variants?.nodes?.map(v => v.image?.url).filter(Boolean) || [])
                ])),
            };
        });
    }

    // Fetch all products in other active groups to detect conflicts
    const activeProducts = await prisma.productGroupItem.findMany({
        where: {
            group: {
                shop: session.shop,
                status: "active",
                id: { not: groupId === "new" ? undefined : groupId }
            }
        },
        include: { group: { select: { name: true } } }
    });
    
    const usedProductsMap = activeProducts.reduce((acc, p) => {
        acc[p.productId] = p.group.name || "Untitled Group";
        return acc;
    }, {});

    return json({ 
        group: { ...group, products: productDetails }, 
        shop: session.shop,
        styleSettings: formattedSettings,
        appSettings,
        usedProductsMap
    });
}

// Action - Add/remove products, sync metafields
export async function action({ request, params }) {
    const { authenticate } = await import("../shopify.server");
    const { default: prisma } = await import("../db.server");
    const { session } = await authenticate.admin(request);
    const { id: groupId } = params;
    const formData = await request.formData();
    const actionType = formData.get("action");


    if (actionType === "addProducts") {
        const productsJson = formData.get("products");
        const forceMove = formData.get("forceMove") === "true";
        if (!productsJson) return json({ error: "No products selected" }, { status: 400 });
        const products = JSON.parse(productsJson);
        const submittedGroupName = formData.get("groupName");
        const submittedOptionName = formData.get("optionName");
        const submittedSelectorStyle = formData.get("selectorStyle");
        const submittedCardSelectorStyle = formData.get("cardSelectorStyle");
        const submittedInventoryBehavior = formData.get("inventoryBehavior");
        const submittedStatus = formData.get("status");
        
        let targetGroupId = groupId;
        if (groupId === "new") {
            return json({ success: true, products });
        } else if (
            submittedGroupName !== null ||
            submittedOptionName !== null ||
            submittedSelectorStyle !== null ||
            submittedCardSelectorStyle !== null ||
            submittedInventoryBehavior !== null ||
            submittedStatus !== null
        ) {
            await prisma.productGroup.update({
                where: { id: targetGroupId },
                data: {
                    ...(submittedGroupName !== null ? { name: submittedGroupName || "Untitled Group" } : {}),
                    ...(submittedOptionName !== null ? { optionName: submittedOptionName || "Color" } : {}),
                    ...(submittedSelectorStyle !== null ? { selectorStyle: submittedSelectorStyle } : {}),
                    ...(submittedCardSelectorStyle !== null ? { cardSelectorStyle: submittedCardSelectorStyle } : {}),
                    ...(submittedInventoryBehavior !== null ? { inventoryBehavior: submittedInventoryBehavior } : {}),
                    ...(submittedStatus !== null ? { status: submittedStatus } : {}),
                },
            });
        }

        const selectedProductIds = [...new Set(products.map((product) => product.id).filter(Boolean))];
        const existingItems = await prisma.productGroupItem.findMany({
            where: {
                groupId: targetGroupId,
                productId: { in: selectedProductIds },
            },
            select: { productId: true },
        });
        const existingProductIds = new Set(existingItems.map((item) => item.productId));

        const maxPosition = await prisma.productGroupItem.aggregate({ where: { groupId: targetGroupId }, _max: { position: true } });
        let position = (maxPosition._max.position || 0);

        const group = await prisma.productGroup.findUnique({ where: { id: targetGroupId } });
        const defaultStyle = getDefaultProductItemStyle(group?.selectorStyle);

        const affectedGroupIds = new Set();

        for (const product of products) {
            if (forceMove) {
                // Find previous groups this product belonged to
                const previousItems = await prisma.productGroupItem.findMany({
                    where: { productId: product.id, NOT: { groupId: targetGroupId } }
                });
                previousItems.forEach(item => affectedGroupIds.add(item.groupId));
                
                // Delete from those groups
                await prisma.productGroupItem.deleteMany({
                    where: { productId: product.id, NOT: { groupId: targetGroupId } }
                });
            }

            if (existingProductIds.has(product.id)) {
                const updated = await prisma.productGroupItem.updateMany({
                    where: { groupId: targetGroupId, productId: product.id },
                    data: {
                        productHandle: product.handle,
                        optionValue: product.title,
                    },
                });

                if (updated.count > 0) continue;
            }

            position++;
            await prisma.productGroupItem.upsert({
                where: { groupId_productId: { groupId: targetGroupId, productId: product.id } },
                update: {
                    productHandle: product.handle,
                    optionValue: product.title,
                },
                create: {
                    groupId: targetGroupId,
                    productId: product.id,
                    productHandle: product.handle,
                    optionValue: product.title,
                    position,
                    style: defaultStyle,
                    customColor: "#FFFFFF"
                },
            });
            existingProductIds.add(product.id);
        }

        // Re-sync groups that lost a product
        for (const aid of affectedGroupIds) {
            await enqueueGroupSync(prisma, session.shop, aid);
        }

        await enqueueGroupSync(prisma, session.shop, targetGroupId);
        
        return json({ success: true, message: "Products added. Storefront sync queued." });
    }

    if (actionType === "removeProduct") {
        const productId = formData.get("productId");
        if (!productId) {
            return json({ error: "Product not found" }, { status: 400 });
        }
        
        await prisma.productGroupItem.deleteMany({ where: { groupId, productId } });
        await enqueueMetafieldCleanup(prisma, session.shop, [productId], { reason: "product_removed" });
        await enqueueGroupSync(prisma, session.shop, groupId);
        return json({ success: true, message: "Product removed!" });
    }

    if (actionType === "updateGroupSettings") {
        const optionName = formData.get("optionName");
        const selectorStyle = formData.get("selectorStyle");
        const cardSelectorStyle = formData.get("cardSelectorStyle");
        const groupName = formData.get("groupName");
        const status = formData.get("status");

        if (groupId === "new") return json({ success: true });

        const updateData = {};
        if (optionName !== null) updateData.optionName = optionName;
        if (selectorStyle !== null) updateData.selectorStyle = selectorStyle;
        if (cardSelectorStyle !== null) updateData.cardSelectorStyle = cardSelectorStyle;
        if (groupName !== null) updateData.name = groupName;
        if (status !== null) updateData.status = status;

        await prisma.productGroup.update({ where: { id: groupId }, data: updateData });
        await enqueueGroupSync(prisma, session.shop, groupId);
        return json({ success: true });
    }

    if (actionType === "deleteGroup") {
        const group = await prisma.productGroup.findUnique({
            where: { id: groupId },
            include: { products: true }
        });

        await prisma.productGroup.delete({ where: { id: groupId } });
        await enqueueMetafieldCleanup(
            prisma,
            session.shop,
            group?.products?.map((product) => product.productId) || [],
            { reason: "group_deleted" },
        );
        const { redirect } = await import("@remix-run/node");
        return redirect("/app/groups");
    }

    if (actionType === "autoFill") {
        const groupName = formData.get("groupName");
        const optionName = formData.get("optionName");
        const selectorStyle = formData.get("selectorStyle");
        const cardSelectorStyle = formData.get("cardSelectorStyle");
        const inventoryBehavior = formData.get("inventoryBehavior");
        const status = formData.get("status");
        const productsJson = formData.get("products");
        const submittedProducts = productsJson ? JSON.parse(productsJson) : [];
        const submittedByProductId = new Map(
            submittedProducts.map((product) => [product.productId, product]),
        );

        const group = await prisma.productGroup.findUnique({
            where: { id: groupId },
            include: { products: { orderBy: { position: "asc" } } },
        });
        await prisma.productGroup.update({
            where: { id: groupId },
            data: {
                ...(groupName !== null ? { name: groupName || "Untitled Group" } : {}),
                ...(optionName !== null ? { optionName: optionName || "Color" } : {}),
                ...(selectorStyle !== null ? { selectorStyle } : {}),
                ...(cardSelectorStyle !== null ? { cardSelectorStyle } : {}),
                ...(inventoryBehavior !== null ? { inventoryBehavior } : {}),
                ...(status !== null ? { status } : {}),
            },
        });

        const orderedProducts = submittedProducts.length > 0
            ? submittedProducts
                .map((submitted) => group.products.find((item) => item.productId === submitted.productId))
                .filter(Boolean)
            : group.products;

        for (let index = 0; index < orderedProducts.length; index++) {
            const item = orderedProducts[index];
            const submitted = submittedByProductId.get(item.productId);
            const submittedOptionValue = submitted?.optionValue?.trim();
            const nextOptionValue = submitted
                ? shouldAutoFillOptionValue(submittedOptionValue, submitted.title)
                    ? buildOptionValueFromHandle(item.productHandle)
                    : submittedOptionValue
                : item.optionValue || buildOptionValueFromHandle(item.productHandle);

            await prisma.productGroupItem.update({
                where: { id: item.id },
                data: {
                    optionValue: nextOptionValue,
                    customImageUrl: submitted?.customImageUrl || item.customImageUrl || null,
                    customColor: submitted?.customColor || item.customColor,
                    customColor2: submitted?.customColor2 || item.customColor2,
                    style: submitted?.style || item.style || "one",
                    position: index + 1,
                }
            });
        }

        for (const submitted of submittedProducts) {
            if (!group.products.some((item) => item.productId === submitted.productId)) {
                await prisma.productGroupItem.updateMany({
                    where: { groupId, productId: submitted.productId },
                    data: {
                        optionValue: submitted.optionValue?.trim() || buildOptionValueFromHandle(submitted.productHandle || submitted.handle),
                        customImageUrl: submitted.customImageUrl || null,
                        customColor: submitted.customColor || null,
                        customColor2: submitted.customColor2 || null,
                        style: submitted.style || "one",
                    },
                });
            }
        }
        await enqueueGroupSync(prisma, session.shop, groupId);
        return json({ success: true, message: "Blank option values auto-filled!" });
    }

    if (actionType === "saveAll") {
        const groupName = formData.get("groupName");
        const optionName = formData.get("optionName");
        const selectorStyle = formData.get("selectorStyle");
        const cardSelectorStyle = formData.get("cardSelectorStyle");
        const inventoryBehavior = formData.get("inventoryBehavior");
        const status = formData.get("status");
        const productsJson = formData.get("products");
        const products = productsJson ? JSON.parse(productsJson) : [];

        if (groupId === "new") {
            const { canAddLinks } = await import("../billing.server");
            const canAdd = await canAddLinks(session.shop, 1);
            if (!canAdd) {
                return json({
                    error: "You have reached your plan's group limit. Please upgrade to create more product groups.",
                    limitReached: true,
                }, { status: 400 });
            }

            const newGroup = await prisma.productGroup.create({
                data: {
                    shop: session.shop,
                    name: groupName || "Untitled Group",
                    optionName: optionName || "Color",
                    selectorStyle: selectorStyle || "image_swatch",
                    cardSelectorStyle: cardSelectorStyle || "image_swatch_card",
                    inventoryBehavior: inventoryBehavior || "show",
                    status: status || "active",
                    products: {
                        create: products.map((item, index) => ({
                            productId: item.productId,
                            productHandle: item.productHandle || item.handle,
                            optionValue: item.optionValue || item.title || buildOptionValueFromHandle(item.productHandle || item.handle),
                            customImageUrl: item.customImageUrl || null,
                            customColor: item.customColor || (item.style === "one" ? "#FFFFFF" : null),
                            customColor2: item.customColor2 || (item.style === "two" ? "#F5F5F5" : null),
                            style: item.style || getDefaultProductItemStyle(selectorStyle),
                            position: index + 1,
                        })),
                    },
                },
            });

            await enqueueGroupSync(prisma, session.shop, newGroup.id);
            return redirect(`/app/groups/${newGroup.id}`);
        }

        await prisma.$transaction(async (tx) => {
            await tx.productGroup.update({
                where: { id: groupId },
                data: {
                    name: groupName, optionName, selectorStyle, cardSelectorStyle, inventoryBehavior, status,
                }
            });

            if (products.length > 0) {
                for (let i = 0; i < products.length; i++) {
                    const item = products[i];
                    await tx.productGroupItem.update({
                        where: { groupId_productId: { groupId, productId: item.productId } },
                        data: {
                            optionValue: item.optionValue,
                            customImageUrl: item.customImageUrl || null,
                            customColor: item.customColor || (item.style === 'one' ? "#FFFFFF" : null),
                            customColor2: item.customColor2 || (item.style === 'two' ? "#F5F5F5" : null),
                            style: item.style || "one",
                            position: i + 1,
                        }
                    });
                }
            }
        });

        await enqueueGroupSync(prisma, session.shop, groupId);
        return json({ success: true, message: "All changes saved. Storefront sync queued." });
    }

    return json({ error: "Invalid action" }, { status: 400 });
}

const ColorPickerPopover = ({ color, onChange, radius = '8px' }) => {
    const [active, setActive] = useState(false);
    const toggleActive = useCallback(() => setActive((active) => !active), []);
    const hsb = hexToHsb(color || '#000000');
    const handleColorChange = (newHsb) => onChange(hsbToHex(newHsb));
    const handleHexChange = (newHex) => onChange(newHex);

    return (
        <Popover
            active={active}
            activator={
                <div onClick={toggleActive} style={{ height: '32px', padding: '4px 8px', border: '1px solid #dcdcdc', borderRadius: radius, cursor: 'pointer', background: '#fff', display: 'flex', alignItems: 'center', gap: '8px', minWidth: '110px' }}>
                    <div style={{ width: '22px', height: '22px', borderRadius: '2px', background: color || '#000000' }} />
                    <span style={{ fontSize: '12px', color: '#666', fontFamily: 'monospace' }}>{color || '#000000'}</span>
                </div>
            }
            onClose={toggleActive}
        >
            <Box padding="300">
                <BlockStack gap="300">
                    <ColorPicker onChange={handleColorChange} color={hsb} allowAlpha={false} />
                    <TextField label="HEX" labelHidden value={color || '#000000'} onChange={handleHexChange} autoComplete="off" />
                </BlockStack>
            </Box>
        </Popover>
    );
};

const ImagePickerPopover = ({ imageUrl, onChange, productImages = [], radius = '4px' }) => {
    const [active, setActive] = useState(false);
    const toggleActive = useCallback(() => setActive((active) => !active), []);
    const handleSelectImage = (url) => { onChange(url); setActive(false); };

    return (
        <Popover
            active={active}
            activator={
                <div onClick={toggleActive} style={{ width: '32px', height: '32px', minWidth: '32px', background: '#f4f4f4', border: '1px solid #dcdcdc', borderRadius: radius, cursor: 'pointer', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <div style={{ width: '100%', height: '100%', borderRadius: radius, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {imageUrl ? <img src={imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Text variant="bodyXs" tone="subdued">+</Text>}
                    </div>
                </div>
            }
            onClose={toggleActive}
        >
            <Box padding="300" width="240px">
                <BlockStack gap="300">
                    <Text variant="headingSm">Select image</Text>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', maxHeight: '200px', overflowY: 'auto' }}>
                        {productImages.map((img, i) => (
                            <div key={i} onClick={() => handleSelectImage(img)} style={{ aspectRatio: '1/1', cursor: 'pointer', border: imageUrl === img ? '2px solid #008060' : '1px solid #ccc', borderRadius: '4px', overflow: 'hidden' }}>
                                <img src={img} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            </div>
                        ))}
                    </div>
                    <Divider />
                    <TextField label="Or enter image URL" labelHidden value={imageUrl || ''} onChange={onChange} autoComplete="off" placeholder="https://..." />
                </BlockStack>
            </Box>
        </Popover>
    );
};
export default function GroupDetail() {
    const { group, shop, styleSettings, appSettings, usedProductsMap } = useLoaderData();
    const actionData = useActionData();
    const submit = useSubmit();
    const navigation = useNavigation();
    const shopify = useAppBridge();
    const revalidator = useRevalidator();

    const [showStyleModal, setShowStyleModal] = useState(false);
    const [selectingFor, setSelectingFor] = useState("productPage"); // productPage or productCard
    const [previewOnProductCard, setPreviewOnProductCard] = useState(true);

    // Conflict states
    const [conflicts, setConflicts] = useState([]);
    const [pendingSelection, setPendingSelection] = useState([]);
    const [showConflictModal, setShowConflictModal] = useState(false);

    const [localGroupName, setLocalGroupName] = useState(group.name || "");
    const [localOptionName, setLocalOptionName] = useState(group.optionName || "Color");
    const [localSelectorStyle, setLocalSelectorStyle] = useState(group.selectorStyle || "image_swatch");
    const [localCardSelectorStyle, setLocalCardSelectorStyle] = useState(group.cardSelectorStyle || "image_swatch_card");
    const effectiveCardPreviewStyle = normalizeProductCardStyle(localCardSelectorStyle, localSelectorStyle);
    const [localInventoryBehavior, setLocalInventoryBehavior] = useState(group.inventoryBehavior || "show");
    const [localStatus, setLocalStatus] = useState(group.status || "active");
    const [localProducts, setLocalProducts] = useState(group.products || []);

    useEffect(() => {
        setLocalGroupName(group.name || "");
        setLocalOptionName(group.optionName || "Color");
        setLocalSelectorStyle(group.selectorStyle || "image_swatch");
        setLocalCardSelectorStyle(group.cardSelectorStyle || "image_swatch_card");
        setLocalInventoryBehavior(group.inventoryBehavior || "show");
        setLocalStatus(group.status || "active");
        setLocalProducts(group.products || []);
    }, [group]);

    useEffect(() => {
        if (actionData?.success && actionData?.message) shopify.toast.show(actionData.message, { duration: 3000 });
    }, [actionData, shopify]);

    const isNewGroup = !group.id;
    const isLoading = navigation.state !== "idle";

    const fetchIdToken = async () => {
        try {
            if (typeof window !== "undefined" && window.shopify && window.shopify.idToken) {
                const idToken = await window.shopify.idToken();
                return { Authorization: `Bearer ${idToken}` };
            }
        } catch (e) { console.error("Token error:", e); }
        return {};
    };

    const appendGroupFormState = useCallback((formData) => {
        formData.append("groupName", localGroupName);
        formData.append("optionName", localOptionName);
        formData.append("selectorStyle", localSelectorStyle);
        formData.append("cardSelectorStyle", localCardSelectorStyle);
        formData.append("inventoryBehavior", localInventoryBehavior);
        formData.append("status", localStatus);
    }, [
        localCardSelectorStyle,
        localGroupName,
        localInventoryBehavior,
        localOptionName,
        localSelectorStyle,
        localStatus,
    ]);

    const getPickerProductImage = useCallback((product) => {
        return product?.featuredImage?.url
            || product?.image?.url
            || product?.images?.[0]?.url
            || product?.images?.[0]?.originalSrc
            || null;
    }, []);

    const toProductPayload = useCallback((product) => ({
        id: product.id || product.productId,
        handle: product.handle || product.productHandle,
        title: product.title,
    }), []);

    const mergeLocalProducts = useCallback((products) => {
        const defaultStyle = getDefaultProductItemStyle(localSelectorStyle);

        setLocalProducts((current) => {
            const next = [...current];
            const indexById = new Map(next.map((product, index) => [product.productId, index]));

            for (const product of products) {
                const productId = product.id || product.productId;
                if (!productId) continue;

                const productHandle = product.handle || product.productHandle;
                const image = getPickerProductImage(product);
                const existingIndex = indexById.get(productId);

                if (existingIndex !== undefined) {
                    next[existingIndex] = {
                        ...next[existingIndex],
                        title: product.title || next[existingIndex].title,
                        handle: productHandle || next[existingIndex].handle,
                        productHandle: productHandle || next[existingIndex].productHandle,
                        image: image || next[existingIndex].image,
                    };
                    continue;
                }

                next.push({
                    id: `local-${productId}`,
                    productId,
                    productHandle,
                    handle: productHandle,
                    title: product.title || productHandle || "Selected product",
                    optionValue: product.title || buildOptionValueFromHandle(productHandle),
                    image,
                    status: product.status || "ACTIVE",
                    isUnavailable: false,
                    allImages: image ? [image] : [],
                    customImageUrl: null,
                    customColor: "#FFFFFF",
                    customColor2: null,
                    style: defaultStyle,
                    position: next.length + 1,
                });
                indexById.set(productId, next.length - 1);
            }

            return next;
        });
    }, [getPickerProductImage, localSelectorStyle]);

    const handleOpenResourcePicker = useCallback(async () => {
        try {
            const selectionIds = localProducts.map((product) => ({ id: product.productId }));
            const selection = await shopify.resourcePicker({
                type: "product",
                multiple: true,
                action: "select",
                selectionIds,
                filter: { variants: false },
            });
            if (selection && selection.length > 0) {
                const selectedProducts = Array.from(
                    new Map(selection.filter((product) => product?.id).map((product) => [product.id, product])).values(),
                );
                
                // Check for conflicts
                const foundConflicts = selectedProducts.filter(p => usedProductsMap[p.id]);
                
                if (foundConflicts.length > 0) {
                    setConflicts(foundConflicts.map(p => ({ ...p, groupName: usedProductsMap[p.id] })));
                    setPendingSelection(selectedProducts);
                    setShowConflictModal(true);
                } else {
                    if (isNewGroup) {
                        mergeLocalProducts(selectedProducts);
                        return;
                    }

                    const formData = new FormData();
                    formData.append("action", "addProducts");
                    formData.append("products", JSON.stringify(selectedProducts.map(toProductPayload)));
                    appendGroupFormState(formData);
                    const headers = await fetchIdToken();
                    submit(formData, { method: "POST", headers });
                }
            }
        } catch (error) { console.error("Picker error:", error); }
    }, [appendGroupFormState, isNewGroup, localProducts, mergeLocalProducts, shopify, submit, toProductPayload, usedProductsMap]);

    const handleResolveConflict = async (forceMove) => {
        const formData = new FormData();
        formData.append("action", "addProducts");
        
        let productsToAdd = pendingSelection;
        if (!forceMove) {
            // Filter out conflicts
            productsToAdd = pendingSelection.filter(p => !conflicts.some(c => c.id === p.id));
        }

        if (productsToAdd.length > 0) {
            if (isNewGroup) {
                mergeLocalProducts(productsToAdd);
                setShowConflictModal(false);
                setConflicts([]);
                setPendingSelection([]);
                return;
            }

            formData.append("products", JSON.stringify(productsToAdd.map(toProductPayload)));
            if (forceMove) formData.append("forceMove", "true");
            appendGroupFormState(formData);
            const headers = await fetchIdToken();
            submit(formData, { method: "POST", headers });
        }
        
        setShowConflictModal(false);
        setConflicts([]);
        setPendingSelection([]);
    };

    const handleRemoveProduct = async (productId) => {
        if (!confirm("Remove this product?")) return;
        if (isNewGroup) {
            setLocalProducts((current) => current.filter((product) => product.productId !== productId));
            return;
        }

        const formData = new FormData();
        formData.append("action", "removeProduct");
        formData.append("productId", productId);
        const headers = await fetchIdToken();
        submit(formData, { method: "POST", headers });
    };

    const handleUpdateField = (id, field, value) => {
        setLocalProducts(prev => prev.map(p => p.productId === id ? { ...p, [field]: value } : p));
    };

    const handleAutoFill = async () => {
        if (isNewGroup) {
            setLocalProducts((current) => current.map((product) => ({
                ...product,
                optionValue: shouldAutoFillOptionValue(product.optionValue, product.title)
                    ? buildOptionValueFromHandle(product.productHandle || product.handle)
                    : product.optionValue,
            })));
            return;
        }

        const formData = new FormData();
        formData.append("action", "autoFill");
        appendGroupFormState(formData);
        formData.append("products", JSON.stringify(localProducts.map(p => ({
            productId: p.productId,
            productHandle: p.productHandle || p.handle,
            handle: p.handle || p.productHandle,
            title: p.title,
            optionValue: p.optionValue,
            customImageUrl: p.customImageUrl,
            customColor: p.customColor,
            customColor2: p.customColor2,
            style: p.style,
        }))));
        const headers = await fetchIdToken();
        submit(formData, { method: "POST", headers });
    };

    const handleSync = async () => {
        const formData = new FormData();
        formData.append("action", "saveAll");
        formData.append("groupName", localGroupName);
        formData.append("optionName", localOptionName);
        formData.append("selectorStyle", localSelectorStyle);
        formData.append("cardSelectorStyle", localCardSelectorStyle);
        formData.append("inventoryBehavior", localInventoryBehavior);
        formData.append("status", localStatus);
        const productsToSave = localProducts.map(p => ({
            productId: p.productId,
            productHandle: p.productHandle || p.handle,
            handle: p.handle || p.productHandle,
            title: p.title,
            optionValue: p.optionValue,
            customImageUrl: p.customImageUrl,
            customColor: p.customColor,
            customColor2: p.customColor2,
            style: p.style,
        }));
        formData.append("products", JSON.stringify(productsToSave));
        const headers = await fetchIdToken();
        submit(formData, { method: "POST", headers });
    };

    const handleDeleteGroup = async () => {
        if (!confirm("Delete this group?")) return;
        const formData = new FormData();
        formData.append("action", "deleteGroup");
        const headers = await fetchIdToken();
        submit(formData, { method: "POST", headers });
    };

    const handleStyleSelect = (styleId) => {
        if (selectingFor === "productPage") {
            setLocalSelectorStyle(styleId);
            const styleInfo = STYLE_OPTIONS.find(s => s.id === styleId);
            if (styleInfo) {
                let targetProductStyle = null;
                if (styleInfo.category === 'Image Swatch' || styleId === 'image_dropdown') targetProductStyle = 'image';
                else if (styleInfo.category === 'Color swatch') targetProductStyle = 'one';
                if (targetProductStyle) setLocalProducts(current => current.map(p => ({ ...p, style: targetProductStyle })));
            }
        } else {
            setLocalCardSelectorStyle(styleId);
        }
        setShowStyleModal(false);
    };

    const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

    const handleDragEnd = (event) => {
        const { active, over } = event;
        if (active.id !== over.id) {
            setLocalProducts((items) => {
                const oldIndex = items.findIndex((i) => i.productId === active.id);
                const newIndex = items.findIndex((i) => i.productId === over.id);
                return arrayMove(items, oldIndex, newIndex);
            });
        }
    };

    return (
        <Page
            fullWidth
            title={group.id ? "Edit product group" : "New product group"}
            subtitle="Combine multiple products into a single option"
            backAction={{ content: "Product groups", url: "/app/groups" }}
            primaryAction={{
                content: "Save",
                onAction: handleSync,
                loading: isLoading && navigation.formData?.get("action") === "saveAll",
            }}
            secondaryActions={group.id ? [
                {
                    content: "Delete",
                    destructive: true,
                    onAction: handleDeleteGroup,
                    loading: isLoading && navigation.formData?.get("action") === "deleteGroup",
                }
            ] : []}
        >
            <Modal open={showStyleModal} onClose={() => setShowStyleModal(false)} title={selectingFor === "productPage" ? "Select Product Page Style" : "Select Product Card Style"} size="large">
                <Modal.Section>
                    <Box paddingBlockEnd="400">
                        <Banner icon={MagicIcon} tone="info">
                            <InlineStack align="space-between" blockAlign="center">
                                <p>Choose a style to start with. You can customize it later.</p>
                                <Button size="slim" onClick={() => revalidator.revalidate()} loading={revalidator.state === "loading"} icon={MagicIcon}>Refresh latest styles</Button>
                            </InlineStack>
                        </Banner>
                    </Box>
                    <div style={{ width: '100%' }}>
                        <BlockStack gap="600">
                            {STYLE_CATEGORIES.filter(cat => selectingFor === "productCard" ? cat === "Product Card" : cat !== "Product Card").map((cat) => (
                                <BlockStack gap="300" key={cat}>
                                    <Box paddingBlockStart="200" paddingBlockEnd="100"><Text variant="headingMd" as="h2">{cat}</Text></Box>
                                    <Grid>
                                        {STYLE_OPTIONS.filter(s => s.category === cat).map((style) => (
                                            <Grid.Cell key={style.id} columnSpan={{ xs: 6, sm: 6, md: 6, lg: 6 }}>
                                                <div onClick={() => handleStyleSelect(style.id)} style={{ height: '100%', display: 'flex', flexDirection: 'column', backgroundColor: '#fff', borderRadius: '8px', boxShadow: (selectingFor === "productPage" ? localSelectorStyle : localCardSelectorStyle) === style.id ? '0 4px 12px rgba(0,0,0,0.15)' : '0 1px 2px rgba(0,0,0,0.05)', cursor: 'pointer', border: (selectingFor === "productPage" ? localSelectorStyle : localCardSelectorStyle) === style.id ? '2px solid #008060' : '1px solid #ebebeb', transition: 'all 0.15s ease' }}>
                                                    <Box padding="300">
                                                        <InlineStack gap="200" blockAlign="center">
                                                            <div style={{ width: '16px', height: '16px', borderRadius: '50%', border: '2px solid #ccc', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                                {(selectingFor === "productPage" ? localSelectorStyle : localCardSelectorStyle) === style.id && <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#008060' }} />}
                                                            </div>
                                                            <BlockStack gap="050"><Text variant="headingSm" as="h3">{style.label}</Text><Text variant="bodySm" tone="subdued">Display as {style.type}</Text></BlockStack>
                                                        </InlineStack>
                                                    </Box>
                                                    <Divider />
                                                    <div style={{ flex: 1, backgroundColor: '#f4f6f8', padding: '16px', display: 'flex', flexDirection: 'column', minHeight: '120px' }}>
                                                        <div style={{ flex: 1, display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-start', overflow: 'visible', paddingBottom: '4px' }}>
                                                            <PreviewRenderer 
                                                                styleId={style.id} 
                                                                settings={styleSettings[style.id] || DEFAULT_SETTINGS_BY_STYLE[style.id] || BASE_SETTINGS} 
                                                                isCard={selectingFor === "productCard"}
                                                                appSettings={appSettings}
                                                                hideLabel={true}
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                            </Grid.Cell>
                                        ))}
                                    </Grid>
                                </BlockStack>
                            ))}
                        </BlockStack>
                    </div>
                </Modal.Section>
            </Modal>
            
            <Layout>
                <Layout.Section>
                    <BlockStack gap="400">
                        <Card>
                            <BlockStack gap="400">
                                <TextField id="groupName" label="Product group name (optional)" value={localGroupName} onChange={setLocalGroupName} helpText="For internal use only" autoComplete="off" maxLength={255} suffix={<Text tone="subdued">{localGroupName.length}/255</Text>} />
                                <TextField id="optionName" label="Option name" value={localOptionName} onChange={setLocalOptionName} autoComplete="off" maxLength={255} suffix={<Text tone="subdued">{localOptionName.length}/255</Text>} />
                            </BlockStack>
                        </Card>

                        <Card padding="0">
                            <Box padding="400"><InlineStack align="space-between" blockAlign="center"><Text variant="headingMd">Products</Text><InlineStack gap="200"><Button icon={MagicIcon} onClick={handleAutoFill} variant="tertiary" disabled={localProducts.length === 0} size="slim">Auto-fill</Button><Button icon={PlusCircleIcon} onClick={handleOpenResourcePicker} size="slim">Add products</Button><Button icon={OrderIcon} variant="tertiary" size="slim" /></InlineStack></InlineStack></Box>
                            <Divider />
                            {localProducts.length === 0 ? <Box padding="1000"><div style={{ display: 'flex', justifyContent: 'center', width: '100%' }}><BlockStack gap="200" align="center" inlineAlign="center"><Text variant="bodyMd" tone="subdued" alignment="center">No products added yet.</Text><Button onClick={handleOpenResourcePicker} size="slim">Add products</Button></BlockStack></div></Box> : (
                                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd} modifiers={[restrictToVerticalAxis]}>
                                    <SortableContext items={localProducts.map(p => p.productId)} strategy={verticalListSortingStrategy}>
                                        <BlockStack>{localProducts.map((p, idx) => <SortableItem key={p.productId} product={p} idx={idx} isLast={idx === localProducts.length - 1} shop={shop} handleRemoveProduct={handleRemoveProduct} handleUpdateField={handleUpdateField} getBorderRadius={getBorderRadius} localSelectorStyle={localSelectorStyle} />)}</BlockStack>
                                    </SortableContext>
                                </DndContext>
                            )}
                        </Card>
                    </BlockStack>
                </Layout.Section>

                <Layout.Section variant="oneThird">
                    <BlockStack gap="400">
                        <Card><BlockStack gap="200"><InlineStack align="space-between" blockAlign="center"><Text variant="headingSm">Group status</Text><Badge tone={localStatus === "active" ? "success" : "info"}>{localStatus === "active" ? "Active" : "Draft"}</Badge></InlineStack><Select label="Group Status" labelHidden options={[{ label: 'Active', value: 'active' }, { label: 'Draft', value: 'draft' }]} value={localStatus} onChange={setLocalStatus} /></BlockStack></Card>
                        <Card><BlockStack gap="300"><Text variant="headingSm">Appearance</Text><Select label="Inventory behavior" options={[{ label: 'Show out of stock', value: 'show' }, { label: 'Hide out of stock', value: 'hide' }]} value={localInventoryBehavior} onChange={setLocalInventoryBehavior} /></BlockStack></Card>
                        <Card>
                            <BlockStack gap="200">
                                <Text variant="headingSm">Preview on product page</Text>
                                <InlineStack gap="200" blockAlign="center"><Text variant="bodySm" tone="subdued">Style: {STYLE_OPTIONS.find(s => s.id === localSelectorStyle)?.label || localSelectorStyle}</Text><div style={{ color: '#8c9196' }}>•</div><Button variant="plain" onClick={() => { setSelectingFor("productPage"); setShowStyleModal(true); }}>Change</Button></InlineStack>
                                <Divider />
                                <PreviewRenderer 
                                    styleId={localSelectorStyle} 
                                    settings={styleSettings[localSelectorStyle] || DEFAULT_SETTINGS_BY_STYLE[localSelectorStyle] || BASE_SETTINGS} 
                                    products={localProducts} 
                                    appSettings={appSettings} 
                                    label={localOptionName}
                                />
                            </BlockStack>
                        </Card>
                        <Card>
                            <BlockStack gap="200">
                                <InlineStack align="space-between" blockAlign="center">
                                    <Text variant="headingSm">Preview on product card</Text>
                                    <div style={{ transform: 'scale(1.2)' }}>
                                        <Checkbox 
                                            label="" 
                                            labelHidden 
                                            checked={localCardSelectorStyle !== "hidden"} 
                                            onChange={(v) => setLocalCardSelectorStyle(v ? "image_swatch_card" : "hidden")} 
                                        />
                                    </div>
                                </InlineStack>
                                
                                {localCardSelectorStyle === "hidden" ? (
                                    <Box padding="400" background="bg-surface-secondary" borderRadius="200" borderWidth="025" borderColor="border" borderStyle="dashed">
                                        <BlockStack gap="200" align="center">
                                            <div style={{ color: '#8c9196', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                                                <Icon source={ViewIcon} tone="subdued" />
                                                <Text variant="bodySm" tone="subdued">This option is hidden in product card</Text>
                                            </div>
                                        </BlockStack>
                                    </Box>
                                ) : (
                                    <>
                                        <InlineStack gap="200" blockAlign="center">
                                            <Text variant="bodySm" tone="subdued">Style: {localCardSelectorStyle === "same" ? "Same as product page" : (STYLE_OPTIONS.find(s => s.id === localCardSelectorStyle)?.label || localCardSelectorStyle)}</Text>
                                            <div style={{ color: '#8c9196' }}>•</div>
                                            <Button variant="plain" onClick={() => { setSelectingFor("productCard"); setShowStyleModal(true); }}>Change</Button>
                                        </InlineStack>
                                        <Divider />
                                        <div style={{ maxWidth: '240px', margin: '0 auto', width: '100%' }}>
                                            {previewOnProductCard ? (
                                                <Box padding="400" background="bg-surface-secondary" borderRadius="200" borderWidth="025" borderColor="border">
                                                    <BlockStack gap="200">
                                                        <div style={{ aspectRatio: '1/1', backgroundColor: '#eee', borderRadius: '4px', overflow: 'hidden' }}>
                                                            <img src={localProducts[0]?.image || PREVIEW_IMAGES[0]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                        </div>
                                                        <Text variant="bodySm" fontWeight="medium">Product Name Example</Text>
                                                        <Text variant="bodyXs" tone="subdued">$49.00 USD</Text>
                                                        <div style={{ marginTop: '8px' }}>
                                                            <PreviewRenderer 
                                                                styleId={effectiveCardPreviewStyle}
                                                                settings={styleSettings[effectiveCardPreviewStyle] || DEFAULT_SETTINGS_BY_STYLE[effectiveCardPreviewStyle] || BASE_SETTINGS}
                                                                products={localProducts} 
                                                                appSettings={appSettings}
                                                                isCard={true}
                                                                hideLabel={true}
                                                            />
                                                        </div>
                                                    </BlockStack>
                                                </Box>
                                            ) : (
                                                <PreviewRenderer 
                                                    styleId={effectiveCardPreviewStyle}
                                                    settings={styleSettings[effectiveCardPreviewStyle] || DEFAULT_SETTINGS_BY_STYLE[effectiveCardPreviewStyle] || BASE_SETTINGS}
                                                    products={localProducts} 
                                                    appSettings={appSettings}
                                                    isCard={true}
                                                    hideLabel={true}
                                                />
                                            )}
                                        </div>
                                    </>
                                )}
                                <Box paddingBlockStart="400">
                                    <InlineStack align="space-between">
                                        <Text variant="bodySm" tone="subdued">Preview on:</Text>
                                        <InlineStack gap="200">
                                            <Button size="micro" pressed={!previewOnProductCard} onClick={() => setPreviewOnProductCard(false)}>Product Page</Button>
                                            <Button size="micro" pressed={previewOnProductCard} onClick={() => setPreviewOnProductCard(true)}>Collection</Button>
                                        </InlineStack>
                                    </InlineStack>
                                </Box>
                            </BlockStack>
                        </Card>
                    </BlockStack>
                </Layout.Section>
            </Layout>

            <Modal
                open={showConflictModal}
                onClose={() => { setShowConflictModal(false); setConflicts([]); setPendingSelection([]); }}
                title="Phát hiện sản phẩm đã trùng lặp"
                primaryAction={{
                    content: "Thêm và Chuyển nhóm",
                    onAction: () => handleResolveConflict(true),
                }}
                secondaryActions={[
                    {
                        content: "Bỏ qua trùng lặp",
                        onAction: () => handleResolveConflict(false),
                    }
                ]}
            >
                <Modal.Section>
                    <BlockStack gap="400">
                        <Banner tone="warning">
                            Các sản phẩm sau đây đã thuộc một nhóm <b>Active</b> khác. Nếu bạn chuyển chúng sang nhóm này, chúng sẽ không hiển thị ở nhóm cũ nữa.
                        </Banner>
                        <ul style={{ paddingLeft: '20px', margin: 0 }}>
                            {conflicts.map((c, i) => (
                                <li key={i} style={{ marginBottom: '8px' }}>
                                    <b>{c.title}</b> (Đang ở nhóm: <i>{c.groupName}</i>)
                                </li>
                            ))}
                        </ul>
                    </BlockStack>
                </Modal.Section>
            </Modal>
        </Page>
    );
}

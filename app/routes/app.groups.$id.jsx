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
    ChevronDownIcon,
} from "@shopify/polaris-icons";
import { syncGroupMetafields } from "../sync.server";

const STYLE_OPTIONS = [
    { id: 'image_swatch', label: 'Image swatch', type: 'Image Swatch', category: 'Image Swatch' },
    { id: 'slide_swatch', label: 'Slide swatch (Mobile only)', type: 'Image Swatch', category: 'Image Swatch' },
    { id: 'polaroid_swatch', label: 'Polaroid swatch', type: 'Image Swatch', category: 'Image Swatch' },
    { id: 'image_swatch_card', label: 'Image swatch card', type: 'Image Swatch', category: 'Image Swatch' },
    { id: 'color_swatch', label: 'Color swatch', type: 'Color swatch', category: 'Color swatch' },
    { id: 'square_color_swatch', label: 'Square color swatch', type: 'Color swatch', category: 'Color swatch' },
    { id: 'pill_swatch', label: 'Color swatch in pill button', type: 'Color swatch', category: 'Color swatch' },
    { id: 'color_swatch_card', label: 'Color swatch card', type: 'Color swatch', category: 'Color swatch' },
    { id: 'button', label: 'Button', type: 'Button', category: 'Button & Label' },
    { id: 'pill_button', label: 'Pill button', type: 'Button', category: 'Button & Label' },
    { id: 'dropdown', label: 'Dropdown', type: 'Dropdown', category: 'Dropdown' },
    { id: 'image_dropdown', label: 'Image swatch in dropdown', type: 'Dropdown', category: 'Dropdown' },
];

const STYLE_CATEGORIES = [
    "Image Swatch",
    "Color swatch",
    "Button & Label",
    "Dropdown"
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
    if (!id) return '50%';
    const lower = id.toLowerCase();
    if (lower.includes('square')) return '4px';
    if (lower.includes('slide')) return '4px';
    if (lower.includes('polaroid')) return '0';
    return '50%';
};

const renderPreview = (styleId) => {
    if (styleId === 'image_swatch') return (
        <InlineStack gap="200" wrap={false}>
            {PREVIEW_IMAGES.map((img, i) => (
                <div key={i} style={{ width: '48px', height: '48px', flexShrink: 0, border: i === 1 ? '2px solid #000' : '1px solid #ccc', borderRadius: '50%', overflow: 'hidden' }}>
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
                    width: '32px', height: '32px', borderRadius: getBorderRadius(styleId), flexShrink: 0,
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
                    <div style={{ width: styleId === 'image_swatch_card' ? '40px' : '32px', height: styleId === 'image_swatch_card' ? '40px' : '32px', borderRadius: getBorderRadius(styleId), overflow: 'hidden', background: PREVIEW_COLORS[i], border: '1px solid #ddd' }}>
                        {styleId === 'image_swatch_card' && <img src={PREVIEW_IMAGES[i]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                    </div>
                    <div style={{ fontSize: '10px', fontWeight: i === 1 ? 'bold' : 'normal' }}>{name}</div>
                </div>
            ))}
        </InlineStack>
    );

    return null;
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

const renderSidebarPreview = (styleId, isCard = false, products = []) => {
    if (!products || products.length === 0) return <Text tone="subdued">Add products to see preview</Text>;

    if (styleId === 'image_swatch') {
        return (
            <InlineStack gap="200" wrap={false}>
                {products.map((p, i) => (
                    <div key={i} style={{ 
                        width: isCard ? '24px' : '48px', 
                        height: isCard ? '24px' : '48px', 
                        flexShrink: 0, 
                        border: i === 0 ? '2px solid #000' : '1px solid #ccc', 
                        borderRadius: '50%',
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
            <InlineStack gap="150" wrap={true}>
                {products.map((p, i) => (
                    <div key={i} style={{
                        width: isCard ? '16px' : '32px', 
                        height: isCard ? '16px' : '32px', 
                        borderRadius: getBorderRadius(styleId), 
                        flexShrink: 0,
                        ...getSwatchStyle(p),
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
            <InlineStack gap="150" wrap={true}>
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
                        <div style={{ width: '12px', height: '12px', borderRadius: '50%', ...getSwatchStyle(p), flexShrink: 0 }} />
                        <span style={{ 
                            fontSize: isCard ? '10px' : '12px',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            maxWidth: isCard ? '80px' : '120px'
                        }}>{p.optionValue}</span>
                    </div>
                ))}
            </InlineStack>
        );
    }

    if (styleId === 'button' || styleId === 'pill_button') {
        return (
            <InlineStack gap="150" wrap={true}>
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
                        <div style={{ 
                            textAlign: 'center',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            maxWidth: isCard ? '80px' : '120px'
                        }}>
                            {p.optionValue}
                        </div>
                    </div>
                ))}
            </InlineStack>
        );
    }

    if (styleId.includes('card')) {
         return (
            <InlineStack gap="200" wrap={true}>
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
                            borderRadius: getBorderRadius(styleId), 
                            ...getSwatchStyle(p),
                            overflow: 'hidden',
                            border: '1px solid #eee'
                        }}>
                            {styleId.includes('image') && <img src={p.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                        </div>
                        <div style={{ 
                            fontSize: '10px', 
                            fontWeight: 'bold', 
                            textAlign: 'center', 
                            width: '100%',
                            lineHeight: '1.2',
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis'
                        }}>{p.optionValue}</div>
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
        <InlineStack gap="150" wrap={true}>
            {products.map((p, i) => (
                <div key={i} style={{ 
                    padding: '8px 16px', 
                    border: i === 0 ? '2px solid #000' : '1px solid #ddd', 
                    borderRadius: '4px', 
                    fontSize: '12px', 
                    backgroundColor: i === 0 ? '#000' : '#fff', 
                    color: i === 0 ? '#fff' : '#333',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    maxWidth: '120px'
                }}>{p.optionValue}</div>
            ))}
        </InlineStack>
    );
};

const LivePreview = ({ style, optionName, products, inventoryBehavior }) => {
    let displayedProducts = products;
    if (inventoryBehavior === 'hide') {
        displayedProducts = products.filter(p => !p.variants || p.variants.some(v => v.inventory_quantity > 0));
    }
    
    return (
        <Box padding="400" background="bg-surface-secondary" borderRadius="200" borderWidth="025" borderColor="border">
            <BlockStack gap="200">
                <Text variant="bodySm" fontWeight="bold" tone="subdued">{optionName}:</Text>
                <div style={{ padding: '8px 0' }}>
                    {renderSidebarPreview(style, false, displayedProducts.slice(0, 6))}
                </div>
            </BlockStack>
        </Box>
    );
};

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

        const group = await prisma.productGroup.findUnique({ where: { id: targetGroupId } });
        const defaultStyle = (group?.selectorStyle?.includes('image') || group?.selectorStyle?.includes('slide') || group?.selectorStyle?.includes('polaroid')) ? 'image' : 'one';

        for (const product of products) {
            position++;
            await prisma.productGroupItem.create({
                data: {
                    groupId: targetGroupId,
                    productId: product.id,
                    productHandle: product.handle,
                    optionValue: product.title,
                    position,
                    style: defaultStyle,
                    customColor: "#FFFFFF"
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
        await syncGroupMetafields(admin, prisma, groupId);
        return json({ success: true, message: "Product removed!" });
    }

    if (actionType === "updateProductItem") {
        const productId = formData.get("productId");
        const updateData = {};
        
        if (formData.has("optionValue")) updateData.optionValue = formData.get("optionValue");
        if (formData.has("customImageUrl")) updateData.customImageUrl = formData.get("customImageUrl");
        if (formData.has("customColor")) updateData.customColor = formData.get("customColor");

        console.log(`[Update Item] Product: ${productId}, Data:`, updateData);

        await prisma.productGroupItem.update({
            where: { groupId_productId: { groupId, productId } },
            data: updateData,
        });
        await syncGroupMetafields(admin, prisma, groupId);
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
        await syncGroupMetafields(admin, prisma, groupId);
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
        await syncGroupMetafields(admin, prisma, groupId);
        return json({ success: true, message: "Option values auto-filled!" });
    }

    if (actionType === "saveAll") {
        const groupName = formData.get("groupName");
        const optionName = formData.get("optionName");
        const selectorStyle = formData.get("selectorStyle");
        const cardSelectorStyle = formData.get("cardSelectorStyle");
        const inventoryBehavior = formData.get("inventoryBehavior");
        const status = formData.get("status");
        const productsJson = formData.get("products");

        await prisma.$transaction(async (tx) => {
            // 1. Update Group Settings
            await tx.productGroup.update({
                where: { id: groupId },
                data: {
                    name: groupName,
                    optionName: optionName,
                    selectorStyle: selectorStyle,
                    cardSelectorStyle: cardSelectorStyle,
                    inventoryBehavior: inventoryBehavior,
                    status: status,
                }
            });

            // 2. Update Product Items
            if (productsJson) {
                const products = JSON.parse(productsJson);
                for (const item of products) {
                    await tx.productGroupItem.update({
                        where: { groupId_productId: { groupId, productId: item.productId } },
                        data: {
                            optionValue: item.optionValue,
                            customImageUrl: item.customImageUrl || null,
                            customColor: item.customColor || (item.style === 'one' ? "#FFFFFF" : null),
                            customColor2: item.customColor2 || (item.style === 'two' ? "#F5F5F5" : null),
                            style: item.style || "one",
                        }
                    });
                }
            }
        });

        await syncGroupMetafields(admin, prisma, groupId);
        return json({ success: true, message: "All changes saved and synced!" });
    }

    if (actionType === "sync") {
        await syncGroupMetafields(admin, prisma, groupId);
        return json({ success: true, message: "Synced successfully!" });
    }

    return json({ error: "Invalid action" }, { status: 400 });
}

const ColorPickerPopover = ({ color, onChange, radius = '50%' }) => {
    const [active, setActive] = useState(false);
    const toggleActive = useCallback(() => setActive((active) => !active), []);

    const hsb = hexToHsb(color || '#000000');
    
    const handleColorChange = (newHsb) => {
        onChange(hsbToHex(newHsb));
    };

    const handleHexChange = (newHex) => {
        if (/^#[0-9A-F]{6}$/i.test(newHex)) {
            onChange(newHex.toUpperCase());
        } else if (newHex.startsWith('#') && newHex.length <= 7) {
            // Allow typing
        }
    };

    return (
        <Popover
            active={active}
            activator={
                <div
                    onClick={toggleActive}
                    style={{ 
                        width: '34px', 
                        height: '34px', 
                        minWidth: '34px',
                        background: '#f4f4f4',
                        border: '1px solid #dcdcdc',
                        borderRadius: radius,
                        cursor: 'pointer',
                        overflow: 'hidden',
                        flexShrink: 0
                    }}
                >
                    <div style={{ 
                        width: '100%', 
                        height: '100%', 
                        borderRadius: radius, 
                        background: color || '#000000',
                        border: '1px solid rgba(0,0,0,0.1)'
                    }} />
                </div>
            }
            onClose={toggleActive}
        >
            <Box padding="300">
                <BlockStack gap="300">
                    <ColorPicker onChange={handleColorChange} color={hsb} allowAlpha={false} />
                    <TextField
                        label="HEX"
                        labelHidden
                        value={color || '#000000'}
                        onChange={handleHexChange}
                        autoComplete="off"
                    />
                </BlockStack>
            </Box>
        </Popover>
    );
};

const ImagePickerPopover = ({ imageUrl, onChange, productImages = [], radius = '4px' }) => {
    const [active, setActive] = useState(false);
    const toggleActive = useCallback(() => setActive((active) => !active), []);

    const handleSelectImage = (url) => {
        onChange(url);
        setActive(false);
    };

    return (
        <Popover
            active={active}
            activator={
                <div
                    onClick={toggleActive}
                    style={{ 
                        width: '34px', 
                        height: '34px', 
                        minWidth: '34px',
                        background: '#f4f4f4',
                        border: '1px solid #dcdcdc',
                        borderRadius: radius,
                        cursor: 'pointer',
                        overflow: 'hidden',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0
                    }}
                >
                    <div style={{ 
                        width: '100%', 
                        height: '100%', 
                        borderRadius: radius, 
                        overflow: 'hidden',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        border: '1px solid rgba(0,0,0,0.1)'
                    }}>
                        {imageUrl ? (
                            <img src={imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                            <Text variant="bodyXs" tone="subdued">+</Text>
                        )}
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
                            <div 
                                key={i} 
                                onClick={() => handleSelectImage(img)}
                                style={{ 
                                    aspectRatio: '1/1', 
                                    cursor: 'pointer', 
                                    border: imageUrl === img ? '2px solid #008060' : '1px solid #ccc',
                                    borderRadius: '4px',
                                    overflow: 'hidden'
                                }}
                            >
                                <img src={img} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            </div>
                        ))}
                    </div>
                    <Divider />
                    <TextField
                        label="Or enter image URL"
                        labelHidden
                        value={imageUrl || ''}
                        onChange={onChange}
                        autoComplete="off"
                        placeholder="https://..."
                    />
                </BlockStack>
            </Box>
        </Popover>
    );
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

    // Local state for all group settings (Classic Save Pattern)
    const [localGroupName, setLocalGroupName] = useState(group.name || "");
    const [localOptionName, setLocalOptionName] = useState(group.optionName || "Color");
    const [localSelectorStyle, setLocalSelectorStyle] = useState(group.selectorStyle || "block");
    const [localCardSelectorStyle, setLocalCardSelectorStyle] = useState(group.cardSelectorStyle || "swatch");
    const [localInventoryBehavior, setLocalInventoryBehavior] = useState(group.inventoryBehavior || "show");
    const [localStatus, setLocalStatus] = useState(group.status || "active");
    const [localProducts, setLocalProducts] = useState(group.products || []);

    // Sync local state when group data changes from server (Loader refresh)
    useEffect(() => {
        setLocalGroupName(group.name || "");
        setLocalOptionName(group.optionName || "Color");
        setLocalSelectorStyle(group.selectorStyle || "block");
        setLocalCardSelectorStyle(group.cardSelectorStyle || "swatch");
        setLocalInventoryBehavior(group.inventoryBehavior || "show");
        setLocalStatus(group.status || "active");
        setLocalProducts(group.products || []);
    }, [group]);

    useEffect(() => {
        if (actionData?.success && actionData?.message) {
            shopify.toast.show(actionData.message, { duration: 3000 });
        }
    }, [actionData, shopify]);

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
        setLocalProducts(prev => prev.map(p => 
            p.productId === productId ? { ...p, [field]: value } : p
        ));
    };

    const handleGroupStatusChange = (value) => {
        setLocalStatus(value);
    };

    const handleAutoFill = () => {
        const formData = new FormData();
        formData.append("action", "autoFill");
        submit(formData, { method: "POST" });
    };

    const handleSync = () => {
        const formData = new FormData();
        formData.append("action", "saveAll");
        formData.append("groupName", localGroupName);
        formData.append("optionName", localOptionName);
        formData.append("selectorStyle", localSelectorStyle);
        formData.append("cardSelectorStyle", localCardSelectorStyle);
        formData.append("inventoryBehavior", localInventoryBehavior);
        formData.append("status", localStatus);
        
        // Prepare products list for saving
        const productsToSave = localProducts.map(p => ({
            productId: p.productId,
            optionValue: p.optionValue,
            customImageUrl: p.customImageUrl,
            customColor: p.customColor,
            customColor2: p.customColor2,
            style: p.style
        }));
        formData.append("products", JSON.stringify(productsToSave));

        submit(formData, { method: "POST" });
    };

    const handleDeleteGroup = () => {
        if (!confirm("Are you sure you want to delete this entire group? This action cannot be undone.")) return;
        const formData = new FormData();
        formData.append("action", "deleteGroup");
        submit(formData, { method: "POST" });
    };

    const handleStyleSelect = (styleId) => {
        if (selectingFor === "productPage") {
            setLocalSelectorStyle(styleId);
            
            // Auto-update product styles based on selection
            const styleInfo = STYLE_OPTIONS.find(s => s.id === styleId);
            if (styleInfo) {
                let targetProductStyle = null;
                if (styleInfo.category === 'Image Swatch' || styleId === 'image_dropdown') {
                    targetProductStyle = 'image';
                } else if (styleInfo.category === 'Color swatch') {
                    targetProductStyle = 'one';
                }

                if (targetProductStyle) {
                    setLocalProducts(current => current.map(p => ({
                        ...p,
                        style: targetProductStyle
                    })));
                }
            }
        } else {
            setLocalCardSelectorStyle(styleId);
        }
        setShowStyleModal(false);
    };



    return (
        <Page fullWidth>
            {/* Style Selection Modal */}
            <Modal
                open={showStyleModal}
                onClose={() => setShowStyleModal(false)}
                title="LineOption Combined Listings"
                size="large"
            >
                <Modal.Section>
                    <Box paddingBlockEnd="400">
                         <Banner icon={MagicIcon} tone="info">
                            <p>Choose a style to start with. You can customize it later.</p>
                         </Banner>
                    </Box>
                    <div style={{ width: '100%' }}>
                        <BlockStack gap="600">
                            {STYLE_CATEGORIES.map((cat) => (
                                <BlockStack gap="300" key={cat}>
                                    <Box paddingBlockStart="200" paddingBlockEnd="100">
                                        <Text variant="headingMd" as="h2">{cat}</Text>
                                    </Box>
                                    <Grid>
                                        {STYLE_OPTIONS.filter(s => s.category === cat).map((style) => (
                                            <Grid.Cell key={style.id} columnSpan={{ xs: 6, sm: 6, md: 6, lg: 6 }}>
                                                <div 
                                                    onClick={() => handleStyleSelect(style.id)}
                                                    style={{ 
                                                        height: '100%', 
                                                        display: 'flex', 
                                                        flexDirection: 'column', 
                                                        backgroundColor: 'var(--p-color-bg-surface, #fff)', 
                                                        borderRadius: 'var(--p-border-radius-200, 8px)', 
                                                        boxShadow: (selectingFor === "productPage" ? localSelectorStyle : localCardSelectorStyle) === style.id ? 'var(--p-shadow-300, 0 4px 12px rgba(0,0,0,0.15))' : 'var(--p-shadow-100, 0 1px 2px rgba(0,0,0,0.05))', 
                                                        overflow: 'hidden',
                                                        cursor: 'pointer',
                                                        border: (selectingFor === "productPage" ? localSelectorStyle : localCardSelectorStyle) === style.id ? '2px solid var(--p-color-border-info, #008060)' : '1px solid var(--p-color-border-subdued, #ebebeb)',
                                                        transition: 'all 0.15s ease'
                                                    }}
                                                >
                                                    <Box padding="300">
                                                        <InlineStack align="space-between" blockAlign="center">
                                                            <InlineStack gap="200" blockAlign="center">
                                                                <div style={{ width: '16px', height: '16px', borderRadius: '50%', border: '2px solid #ccc', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                                    {(selectingFor === "productPage" ? localSelectorStyle : localCardSelectorStyle) === style.id && <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#008060' }} />}
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
                                </BlockStack>
                            ))}
                        </BlockStack>
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
                        {/* Group Info Card */}
                        <Card>
                            <BlockStack gap="400">
                                <TextField
                                    label="Product group name (optional)"
                                    value={localGroupName}
                                    onChange={setLocalGroupName}
                                    helpText="For internal use only"
                                    autoComplete="off"
                                    maxLength={255}
                                    suffix={<Text tone="subdued">{localGroupName.length}/255</Text>}
                                />
                                <TextField
                                    label="Option name"
                                    value={localOptionName}
                                    onChange={setLocalOptionName}
                                    autoComplete="off"
                                    maxLength={255}
                                    suffix={<Text tone="subdued">{localOptionName.length}/255</Text>}
                                />
                            </BlockStack>
                        </Card>

                        {/* Products Card */}
                        <Card padding="0">
                            <Box padding="400">
                                <InlineStack align="space-between" blockAlign="center">
                                    <Text variant="headingMd">Products</Text>
                                    <InlineStack gap="200">
                                        <Button icon={MagicIcon} onClick={handleAutoFill} variant="tertiary" disabled={localProducts.length === 0}>Auto-fill</Button>
                                        <Button icon={PlusCircleIcon} onClick={handleOpenResourcePicker}>Add products</Button>
                                        <Button icon={OrderIcon} variant="tertiary" />
                                    </InlineStack>
                                </InlineStack>
                            </Box>
                            <Divider />
                            
                            {localProducts.length === 0 ? (
                                <Box padding="1000">
                                    <BlockStack gap="200" align="center">
                                        <Text variant="bodyMd" tone="subdued">No products added yet.</Text>
                                        <Button onClick={handleOpenResourcePicker}>Add products</Button>
                                    </BlockStack>
                                </Box>
                            ) : (
                                <BlockStack>
                                    {localProducts.map((product, idx) => (
                                        <div key={product.productId}>
                                            <Box padding="400">
                                                <InlineStack gap="300" blockAlign="start" wrap={false}>
                                                    <div style={{ paddingBlockStart: '12px' }}>
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
                                                                <Text fontWeight="semibold" variant="bodyMd">{product.title}</Text>
                                                            </InlineStack>
                                                            <InlineStack gap="200" blockAlign="end">
                                                                <div style={{ width: '180px' }}>
                                                                    <TextField
                                                                        label="Option value"
                                                                        placeholder="Option value"
                                                                        value={product.optionValue || ""}
                                                                        onChange={(v) => handleUpdateField(product.productId, "optionValue", v)}
                                                                        autoComplete="off"
                                                                    />
                                                                </div>
                                                                <div style={{ width: '130px' }}>
                                                                    <Select
                                                                        label="Style"
                                                                        options={[
                                                                            { label: 'One color', value: 'one' },
                                                                            { label: 'Two colors', value: 'two' },
                                                                            { label: 'Image', value: 'image' },
                                                                        ]}
                                                                        value={product.style || "one"}
                                                                        onChange={(v) => handleUpdateField(product.productId, "style", v)}
                                                                    />
                                                                </div>
                                                                {/* Swatch Pickers */}
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
                                                    <div style={{ minWidth: '100px' }}>
                                                        <InlineStack gap="100" align="end">
                                                            <Tooltip content="Preview product">
                                                                <Button icon={ViewIcon} variant="tertiary" url={`https://${shop}/products/${product.handle}`} target="_blank" />
                                                            </Tooltip>
                                                            <Tooltip content="Remove">
                                                                <Button icon={DeleteIcon} tone="critical" onClick={() => handleRemoveProduct(product.productId)} />
                                                            </Tooltip>
                                                        </InlineStack>
                                                    </div>
                                                </InlineStack>
                                            </Box>
                                            {idx < localProducts.length - 1 && <Divider />}
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
                                <InlineStack align="space-between" blockAlign="center">
                                    <Text variant="headingSm">Group status</Text>
                                    <Badge tone={localStatus === "active" ? "success" : "info"}>
                                        {localStatus === "active" ? "Active" : "Draft"}
                                    </Badge>
                                </InlineStack>
                                <Select
                                    label="Group Status"
                                    labelHidden
                                    options={[
                                        { label: 'Active', value: 'active' },
                                        { label: 'Draft', value: 'draft' },
                                    ]}
                                    value={localStatus}
                                    onChange={setLocalStatus}
                                />
                            </BlockStack>
                        </Card>

                        {/* Appearance Card */}
                        <Card>
                            <BlockStack gap="300">
                                <Text variant="headingSm">Appearance</Text>
                                <Select
                                    label="Inventory behavior"
                                    options={[
                                        { label: 'Show out of stock', value: 'show' },
                                        { label: 'Hide out of stock', value: 'hide' },
                                    ]}
                                    value={localInventoryBehavior}
                                    onChange={setLocalInventoryBehavior}
                                />
                            </BlockStack>
                        </Card>

                        {/* Preview Product Page */}
                        <Card>
                            <BlockStack gap="200">
                                <Text variant="headingSm">Preview on product page</Text>
                                <InlineStack gap="200" blockAlign="center">
                                    <Text variant="bodySm" tone="subdued">Style: {STYLE_OPTIONS.find(s => s.id === localSelectorStyle)?.label || localSelectorStyle}</Text>
                                    <div style={{ color: '#8c9196' }}>•</div>
                                    <Button variant="plain" onClick={() => { setSelectingFor("productPage"); setShowStyleModal(true); }}>Change</Button>
                                </InlineStack>
                                <Divider />
                                <BlockStack gap="200">
                                    <Text variant="bodySm" tone="subdued" fontWeight="semibold">{localOptionName || "Color"}:</Text>
                                    {renderSidebarPreview(localSelectorStyle, false, localProducts)}
                                    <Box paddingBlockStart="400" />
                                </BlockStack>
                            </BlockStack>
                        </Card>

                        {/* Preview Product Card */}
                        <Card>
                            <BlockStack gap="200">
                                <InlineStack align="space-between" blockAlign="center">
                                    <Text variant="headingSm">Preview on product card</Text>
                                    <div style={{ transform: 'scale(1.2)' }}>
                                        <Checkbox
                                            label=""
                                            labelHidden
                                            checked={localCardSelectorStyle === "same"}
                                            onChange={(v) => setLocalCardSelectorStyle(v ? "same" : "swatch")}
                                        />
                                    </div>
                                </InlineStack>
                                <InlineStack gap="200" blockAlign="center">
                                    <Text variant="bodySm" tone="subdued">Style: {localCardSelectorStyle === "same" ? "Same as product page" : (STYLE_OPTIONS.find(s => s.id === localCardSelectorStyle)?.label || localCardSelectorStyle)}</Text>
                                    <div style={{ color: '#8c9196' }}>•</div>
                                    <Button variant="plain" onClick={() => { setSelectingFor("productCard"); setShowStyleModal(true); }}>Change</Button>
                                </InlineStack>
                                <Divider />
                                <LivePreview 
                                    style={previewOnProductCard ? (localCardSelectorStyle === 'same' ? localSelectorStyle : localCardSelectorStyle) : localCardSelectorStyle} 
                                    optionName={localOptionName} 
                                    products={localProducts}
                                    inventoryBehavior={localInventoryBehavior}
                                />
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

            {/* Sticky Footer Action Bar */}
            <Box 
                 padding="400" 
                 background="bg-surface" 
                 borderColor="border" 
                 borderWidth="025" 
                 borderRadius="300"
                 position="sticky" 
                 insetBlockEnd="0" 
                 zIndex="10"
                 marginBlockStart="800"
            >
                <InlineStack align="space-between" blockAlign="center">
                    <Button variant="primary" tone="critical" onClick={handleDeleteGroup} loading={isLoading && navigation.formData?.get("action") === "deleteGroup"}>Delete</Button>
                    <InlineStack gap="300">
                        <Button variant="primary" size="large" onClick={handleSync} loading={isLoading && navigation.formData?.get("action") === "saveAll"}>Save</Button>
                    </InlineStack>
                </InlineStack>
            </Box>
        </Page>
    );
}

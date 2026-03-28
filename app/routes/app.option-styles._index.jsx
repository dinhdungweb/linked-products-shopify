import { useState, useCallback } from "react";
import {
  Page,
  Card,
  BlockStack,
  Text,
  InlineStack,
  Badge,
  Box,
  Divider,
  Icon,
  Button,
  Grid,
  Tabs,
  Select,
} from "@shopify/polaris";
import { LinkIcon, QuestionCircleIcon, PlusIcon, StoreIcon, MenuHorizontalIcon, ChevronDownIcon } from "@shopify/polaris-icons";
import { TitleBar } from "@shopify/app-bridge-react";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";

export const loader = async ({ request }) => {
  const { authenticate } = await import("../shopify.server");
  const { default: prisma } = await import("../db.server");
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const styleSettings = await prisma.optionStyleSetting.findMany({
    where: { shop },
  });

  return json({ 
    styleSettings: styleSettings.reduce((acc, curr) => {
      acc[curr.styleId] = curr.settings;
      return acc;
    }, {})
  });
};

export default function OptionStylesPage() {
  const { styleSettings } = useLoaderData();
  const [selectedTab, setSelectedTab] = useState(0);
  const [selectedFilter, setSelectedFilter] = useState('all');

  const BASE_SETTINGS = {
    basic: { swatchSize: 32, gap: 10, hideActiveSwatch: false, activeSwatchFirst: false, padding: 0, twoColorStyle: "LT_RB", hoverEffect: "none" },
    border: { radius: 4, width: 1, color: "#dbdfe2", activeColor: "#000000", hoverColor: "#000000", outerWidth: 0, outerRadius: 4, outerPadding: 4, outerColor: "#dbdfe2", outerActiveColor: "#000000", outerHoverColor: "#000000" },
    label: { show: true, layout: "stack", gap: 8, fontSize: 14, fontWeight: "normal", lineHeight: 18, showSelectedVariant: true, selectedVariantFontWeight: "normal" },
    variantName: { show: true, fontSize: 12, fontWeight: "semibold", maxLines: 2 },
    price: { show: false },
    text: { position: "right", gap: 8, width: 50 },
    layout: { marginTop: 0, marginBottom: 10, align: "left", type: "stack", maxSwatches: 100 },
    unavailable: { style: "cross_mark", allowRedirect: false, hideUnmatched: false },
    badge: { show: false, text: "NEW", position: "top-right", fontSize: 10, color: "#ffffff", bgColor: "#000000" },
    shadow: { show: false, color: "rgba(0,0,0,0.1)", blur: 4, spread: 0, offsetX: 0, offsetY: 2 },
  };

  const DEFAULT_SETTINGS_BY_STYLE = {
    image_swatch: { ...BASE_SETTINGS, basic: { ...BASE_SETTINGS.basic, swatchSize: 48, gap: 8 }, border: { ...BASE_SETTINGS.border, radius: 4 } },
    slide_swatch: { ...BASE_SETTINGS, basic: { ...BASE_SETTINGS.basic, swatchSize: 70, gap: 8 }, border: { ...BASE_SETTINGS.border, radius: 4, outerWidth: 0 }, layout: { ...BASE_SETTINGS.layout, type: 'slide' } },
    polaroid_swatch: { ...BASE_SETTINGS, basic: { ...BASE_SETTINGS.basic, swatchSize: 40, padding: 4, gap: 8 }, border: { ...BASE_SETTINGS.border, radius: 0 }, shadow: { ...BASE_SETTINGS.shadow, show: true } },
    color_swatch: { ...BASE_SETTINGS, basic: { ...BASE_SETTINGS.basic, swatchSize: 32, gap: 8 }, border: { ...BASE_SETTINGS.border, radius: 50, width: 2, color: "#ffffff", activeColor: "#ffffff", outerWidth: 2, outerPadding: 2, outerActiveColor: "#5c6ac4", outerRadius: 50, outerColor: "#dddddd" }, label: { ...BASE_SETTINGS.label, show: false } },
    square_color_swatch: { ...BASE_SETTINGS, basic: { ...BASE_SETTINGS.basic, swatchSize: 32, gap: 8 }, border: { ...BASE_SETTINGS.border, radius: 4, width: 2, color: "#ffffff", activeColor: "#ffffff", outerWidth: 2, outerPadding: 2, outerActiveColor: "#5c6ac4", outerRadius: 6, outerColor: "#dddddd" }, label: { ...BASE_SETTINGS.label, show: false } },
    pill_swatch: { ...BASE_SETTINGS, basic: { ...BASE_SETTINGS.basic, padding: 6, gap: 8 }, border: { ...BASE_SETTINGS.border, radius: 20 } },
    button: { ...BASE_SETTINGS, basic: { ...BASE_SETTINGS.basic, padding: 8, gap: 8 }, border: { ...BASE_SETTINGS.border, radius: 0 }, label: { ...BASE_SETTINGS.label, show: false } },
    pill_button: { ...BASE_SETTINGS, basic: { ...BASE_SETTINGS.basic, padding: 8, gap: 8 }, border: { ...BASE_SETTINGS.border, radius: 20 }, label: { ...BASE_SETTINGS.label, show: false } },
    dropdown: { ...BASE_SETTINGS, layout: { ...BASE_SETTINGS.layout, type: 'dropdown' } },
    image_dropdown: { ...BASE_SETTINGS, layout: { ...BASE_SETTINGS.layout, type: 'dropdown' } },
  };

  const previewItems = [
    { name: 'Beige Brown', color: 'https://picsum.photos/id/1027/100/100' },
    { name: 'Black White', color: 'https://picsum.photos/id/1011/100/100' },
    { name: 'Red Rose', color: 'https://picsum.photos/id/1059/100/100' },
    { name: 'Teal Lily', color: 'https://picsum.photos/id/1074/100/100' },
    { name: 'Yellow Bloom', color: 'https://picsum.photos/id/1084/100/100' },
    { name: 'Purple Mini', color: 'https://picsum.photos/id/1069/100/100' }
  ];

  const handleTabChange = useCallback((selectedTabIndex) => setSelectedTab(selectedTabIndex), []);
  const handleFilterChange = useCallback((value) => setSelectedFilter(value), []);

  const tabs = [
    { id: 'product-page', content: 'Product page', panelID: 'product-page-panel' },
    { id: 'product-card', content: 'Product card', panelID: 'product-card-panel' },
  ];

  const filterOptions = [
    { label: 'All', value: 'all' },
    { label: 'In use', value: 'in_use' },
    { label: 'Not in use', value: 'not_in_use' },
  ];

  const images = [
    "https://picsum.photos/id/1027/400/500",
    "https://picsum.photos/id/1011/400/500",
    "https://picsum.photos/id/1059/400/500",
    "https://picsum.photos/id/1074/400/500",
    "https://picsum.photos/id/1084/400/500",
    "https://picsum.photos/id/1069/400/500",
    "https://picsum.photos/id/1062/400/500",
    "https://picsum.photos/id/1012/400/500"
  ];

  const colors = ['#f5f5dc', '#a020f0', '#ffa500', '#008000', '#ffb6c1', '#adff2f', '#ff0000', 'linear-gradient(45deg, #f06, #9f6)'];

  // --- ORIGINAL STATIC PREVIEWS ---
  const imageSwatchPreview = (
    <InlineStack gap="200" wrap={false} align="start" blockAlign="start">
      {images.slice(0, 6).map((img, i) => (
        <div key={i} style={{ width: '48px', height: '48px', flexShrink: 0, border: i === 1 ? '2px solid #000' : '1px solid #ccc', borderRadius: '4px', overflow: 'hidden' }}>
          <img src={img} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
      ))}
    </InlineStack>
  );

  const slideSwatchPreview = (
    <InlineStack gap="200" wrap={false} align="start" blockAlign="start">
      {[
        { name: 'Beige Brown', price: '$12.88' },
        { name: 'Black White', price: '$15.99' },
        { name: 'Red Rose', price: '$19.99' },
        { name: 'Teal Lily', price: '$24.99' },
        { name: 'Yellow Bloom', price: '$18.50' },
        { name: 'Purple Mini', price: '$22.00' }
      ].map((item, i) => (
        <div key={i} style={{ width: '70px', flexShrink: 0, border: i === 1 ? '2px solid #000' : '1px solid #ccc', borderRadius: '4px', backgroundColor: '#fff', overflow: 'hidden' }}>
          <div style={{ width: '100%', height: '80px', backgroundColor: '#f4f4f4', display: 'flex', alignItems: 'flex-start', justifyContent: 'center' }}>
            <img src={images[i]} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'cover' }} />
          </div>
          <div style={{ padding: '4px', textAlign: 'center' }}>
            <div style={{ fontSize: '10px', fontWeight: 'bold', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</div>
            <div style={{ fontSize: '10px', color: '#666' }}>{item.price}</div>
          </div>
        </div>
      ))}
    </InlineStack>
  );

  const polaroidSwatchPreview = (
    <InlineStack gap="200" wrap={false} align="start" blockAlign="start">
      {images.slice(0, 6).map((img, i) => (
        <div key={i} style={{ padding: '4px', backgroundColor: '#fff', border: i === 1 ? '2px solid #000' : '1px solid #ccc', flexShrink: 0, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <div style={{ width: '40px', height: '48px', backgroundColor: '#f4f4f4', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflow: 'hidden' }}>
            <img src={img} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
        </div>
      ))}
    </InlineStack>
  );

  const colorSwatchPreview = (
    <div style={{ padding: '4px' }}>
      <InlineStack gap="200" align="start" blockAlign="start">
        {colors.map((color, i) => (
          <div key={i} style={{
            width: '32px', height: '32px', borderRadius: '50%', flexShrink: 0,
            background: color,
            border: '2px solid #fff',
            outline: i === 1 ? '2px solid #5c6ac4' : '1px solid #ddd',
            outlineOffset: '2px'
          }} />
        ))}
      </InlineStack>
    </div>
  );

  const squareColorSwatchPreview = (
    <div style={{ padding: '4px' }}>
      <InlineStack gap="200" align="start" blockAlign="start">
        {colors.map((color, i) => (
          <div key={i} style={{
            width: '32px', height: '32px', borderRadius: '4px', flexShrink: 0,
            background: color,
            border: '2px solid #fff',
            outline: i === 1 ? '2px solid #5c6ac4' : '1px solid #ddd',
            outlineOffset: '2px'
          }} />
        ))}
      </InlineStack>
    </div>
  );

  const colorPillPreview = (
    <InlineStack gap="200" wrap={false} align="start" blockAlign="start">
      {['Beige', 'Purple', 'Orange', 'Green', 'Yellow', 'Black', 'Red'].map((text, i) => (
        <div key={i} style={{
          display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 12px', flexShrink: 0,
          borderRadius: '20px', backgroundColor: '#fff',
          border: i === 1 ? '2px solid #000' : '1px solid #ccc'
        }}>
          <div style={{ width: '16px', height: '16px', borderRadius: '50%', background: colors[i] || '#000' }} />
          <span style={{ fontSize: '12px', fontWeight: i === 1 ? 'bold' : 'normal' }}>{text}</span>
        </div>
      ))}
    </InlineStack>
  );

  const buttonPreview = (
    <InlineStack gap="200" wrap={false} align="start" blockAlign="start">
      <div style={{ padding: '8px 16px', border: '1px solid #ccc', backgroundColor: '#fff', fontSize: '13px' }}>Beige</div>
      <div style={{ padding: '8px 16px', border: '2px solid #000', backgroundColor: '#000', color: '#fff', fontSize: '13px', fontWeight: 'bold' }}>Dark blue</div>
      <div style={{ padding: '8px 16px', border: '1px solid #ccc', backgroundColor: '#fff', fontSize: '13px' }}>Green</div>
      <div style={{ padding: '8px 16px', border: '1px solid #ddd', backgroundColor: '#fff', color: '#999', fontSize: '13px', textDecoration: 'line-through' }}>Yellow</div>
      <div style={{ padding: '8px 16px', border: '1px solid #ccc', backgroundColor: '#fff', fontSize: '13px' }}>Black</div>
    </InlineStack>
  );

  const pillButtonPreview = (
    <InlineStack gap="200" wrap={false} align="start" blockAlign="start">
      <div style={{ padding: '6px 16px', border: '1px solid #ccc', backgroundColor: '#fff', fontSize: '13px', borderRadius: '20px' }}>Beige</div>
      <div style={{ padding: '6px 16px', border: '2px solid #000', backgroundColor: '#000', color: '#fff', fontSize: '13px', fontWeight: 'bold', borderRadius: '20px' }}>Dark blue</div>
      <div style={{ padding: '6px 16px', border: '1px solid #ccc', backgroundColor: '#fff', fontSize: '13px', borderRadius: '20px' }}>Green</div>
      <div style={{ padding: '6px 16px', border: '2px solid #ddd', backgroundColor: '#fff', color: '#999', fontSize: '13px', textDecoration: 'line-through', borderRadius: '20px' }}>Yellow</div>
      <div style={{ padding: '6px 16px', border: '1px solid #ccc', backgroundColor: '#fff', fontSize: '13px', borderRadius: '20px' }}>Black</div>
    </InlineStack>
  );

  const dropdownPreview = (
    <div style={{ width: '100%', maxWidth: '300px', padding: '10px 14px', border: '1px solid #8c9196', borderRadius: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fff' }}>
      <span style={{ fontSize: '14px' }}>Beige Brown</span>
      <Icon source={ChevronDownIcon} tone="base" />
    </div>
  );

  const imageDropdownPreview = (
    <div style={{ width: '100%', maxWidth: '300px', padding: '6px 14px', border: '1px solid #8c9196', borderRadius: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fff' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <img src={images[0]} alt="" style={{ width: '24px', height: '24px', borderRadius: '4px', objectFit: 'cover' }} />
        <span style={{ fontSize: '14px' }}>Beige Brown</span>
      </div>
      <Icon source={ChevronDownIcon} tone="base" />
    </div>
  );

  const renderStyleCard = (styleId, title, previewNode) => (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--p-color-bg-surface, #fff)', borderRadius: 'var(--p-border-radius-300, 8px)', boxShadow: 'var(--p-shadow-200, 0 1px 3px rgba(0,0,0,0.1), 0 2px 4px rgba(0,0,0,0.05))', overflow: 'hidden' }}>
      <Box padding="300">
        <InlineStack align="space-between" blockAlign="center">
          <InlineStack gap="200" blockAlign="center">
            <Text variant="headingSm" as="h3">{title}</Text>
            <Badge tone="new">Not in use</Badge>
          </InlineStack>
          <InlineStack gap="100" blockAlign="center">
            <Button icon={LinkIcon} size="micro" url={`/app/option-styles/${styleId}`}>Customize</Button>
            <Button variant="plain" icon={MenuHorizontalIcon} accessibilityLabel="Actions" />
          </InlineStack>
        </InlineStack>
      </Box>
      <Divider />
      <div style={{ flex: 1, backgroundColor: 'var(--p-color-bg-surface-secondary, #f4f6f8)', padding: '16px', display: 'flex', flexDirection: 'column', minHeight: '120px' }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-start', overflowX: 'auto', paddingBottom: '4px' }}>
          {previewNode}
        </div>
      </div>
    </div>
  );

  const renderExploreCard = (title, previewNode, asDarkCard = false) => {
    if (asDarkCard) {
      return (
        <div style={{ backgroundColor: '#4a4a4a', color: 'white', borderRadius: '8px', padding: '24px', height: '100%', display: 'flex', flexDirection: 'column', gap: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <Icon source={StoreIcon} tone="textInverse" />
          <Text variant="headingMd" tone="textInverse">Find more styles</Text>
          <Text variant="bodyMd" tone="textInverse">Discover more product page styles to fit your brand, including color swatch, image swatch, button, dropdown.</Text>
          <div style={{ marginTop: 'auto' }}>
            <Button>View all styles</Button>
          </div>
        </div>
      );
    }

    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--p-color-bg-surface, #fff)', borderRadius: 'var(--p-border-radius-300, 8px)', boxShadow: 'var(--p-shadow-200, 0 1px 3px rgba(0,0,0,0.1), 0 2px 4px rgba(0,0,0,0.05))', overflow: 'hidden' }}>
        <div style={{ flex: 1, backgroundColor: 'var(--p-color-bg-surface-secondary, #f4f6f8)', padding: '16px', display: 'flex', flexDirection: 'column', minHeight: '150px' }}>
          <div style={{ flex: 1, display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-start', overflowX: 'hidden' }}>
            {previewNode}
          </div>
        </div>
        <Divider />
        <Box padding="300">
          <InlineStack align="space-between" blockAlign="center">
            <Text variant="headingSm" as="h3">{title}</Text>
            <Button icon={PlusIcon} size="micro">Add</Button>
          </InlineStack>
        </Box>
      </div>
    );
  };

  const renderPreview = (styleId) => {
    const settings = styleSettings[styleId] || DEFAULT_SETTINGS_BY_STYLE[styleId] || BASE_SETTINGS;
    const isSlide = styleId.includes('slide');
    const isButton = styleId.includes('button');
    const isDropdown = styleId.includes('dropdown');

    const getOuterStyle = (isActive) => {
      const b = settings.border;
      if (b.outerWidth <= 0) return {};
      const isRound = styleId.includes('round') || styleId.includes('pill') || styleId.includes('circle') || (styleId === 'color_swatch' && settings.border.radius > 20);
      return {
          padding: `${b.outerPadding}px`,
          border: `${b.outerWidth}px solid ${isActive ? b.outerActiveColor : b.outerColor}`,
          borderRadius: isRound ? '50%' : `${b.outerRadius}px`,
          display: 'inline-flex',
          margin: '2px'
      };
    };

    const getSwatchStyle = (isActive) => {
      const b = settings.border;
      const s = settings.shadow;
      const style = {
        position: 'relative',
        padding: `${settings.basic.padding}px`,
        border: `${b.width}px solid ${isActive ? b.activeColor : b.color}`,
        borderRadius: `${b.radius}px`,
        backgroundColor: '#fff',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        minWidth: isSlide ? '100px' : `${settings.basic.swatchSize}px`,
        minHeight: isSlide ? '140px' : `${settings.basic.swatchSize}px`,
      };
      if (s.show) {
        style.boxShadow = `${s.offsetX}px ${s.offsetY}px ${s.blur}px ${s.spread}px ${s.color}`;
      }
      return style;
    };

    const renderBadge = (isActive) => {
        if (!settings.badge.show || !isActive) return null;
        const b = settings.badge;
        const posStyles = { 'top-left': { top: '-5px', left: '-5px' }, 'top-right': { top: '-5px', right: '-5px' }, 'bottom-left': { bottom: '-5px', left: '-5px' }, 'bottom-right': { bottom: '-5px', right: '-5px' } };
        return <div style={{ position: 'absolute', ...posStyles[b.position], backgroundColor: b.bgColor, color: b.color, fontSize: `${b.fontSize - 2}px`, padding: '1px 4px', borderRadius: '4px', zIndex: 10, fontWeight: 'bold' }}>{b.text}</div>;
    };

    if (isDropdown) {
        return (
            <div style={{ width: '100%', maxWidth: '240px', padding: '10px', border: '1px solid #ddd', borderRadius: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fff' }}>
                <span style={{ fontSize: '13px' }}>Beige Brown</span>
                <Icon source={ChevronDownIcon} tone="base" />
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', gap: `${settings.basic.gap}px`, overflowX: 'auto', width: '100%', padding: '10px 4px' }}>
            {previewItems.slice(0, 6).map((p, i) => {
                const isActive = i === 1;
                const isRound = styleId.includes('round') || styleId.includes('pill') || styleId.includes('circle') || (styleId === 'color_swatch' && settings.border.radius > 20);
                
                return (
                    <div key={i} style={getOuterStyle(isActive)}>
                        <div style={getSwatchStyle(isActive)}>
                            {isActive && renderBadge(isActive)}
                            {!isButton && (
                                <div style={{ 
                                    width: isSlide ? '62px' : `${settings.basic.swatchSize}px`, 
                                    height: isSlide ? '80px' : `${settings.basic.swatchSize}px`, 
                                    backgroundColor: '#eee', borderRadius: isRound ? '50%' : `${settings.border.radius}px`, overflow: 'hidden'
                                }}>
                                    <img src={p.color} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                </div>
                            )}
                            {(settings.label.show || isButton || isSlide) && (
                                <div style={{ marginTop: '4px', textAlign: 'center' }}>
                                    <div style={{ fontSize: '11px', fontWeight: (isActive || i === 1) ? 'bold' : 'normal', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: isSlide ? '90px' : '60px' }}>{p.name}</div>
                                    {isSlide && <div style={{ fontSize: '10px', color: '#666' }}>$19.99</div>}
                                </div>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
  };

  const imageSwatchCardPreview = (
    <InlineStack gap="200" wrap={false} align="start" blockAlign="start">
      {[
        { name: 'Beige Brown', price: '$12.88' },
        { name: 'Black White', price: '$15.99' },
        { name: 'Red Rose', price: '$19.99' },
        { name: 'Teal Lily', price: '$19.99' },
        { name: 'Yellow Bloom', price: '$18.50' },
        { name: 'Purple Mini', price: '$22.00' },
      ].map((item, i) => (
        <div key={i} style={{ padding: '8px', border: i === 1 ? '1px solid #000' : '1px solid #ccc', backgroundColor: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '50%', overflow: 'hidden', backgroundColor: '#f4f4f4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <img src={images[i]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '10px', fontWeight: 'bold' }}>{item.name}</div>
            <div style={{ fontSize: '10px', color: '#666' }}>{item.price}</div>
          </div>
        </div>
      ))}
    </InlineStack>
  );

  const colorSwatchCardPreview = (
    <InlineStack gap="200" wrap={false} align="start" blockAlign="start">
      {['Beige', 'Purple', 'Orange', 'Green', 'Yellow', 'Black', 'Red', 'Combo'].map((name, i) => (
        <div key={i} style={{ padding: '8px', border: i === 1 ? '1px solid #000' : '1px solid #ccc', backgroundColor: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: colors[i] || '#000' }} />
          <div style={{ fontSize: '10px', fontWeight: i === 1 ? 'bold' : 'normal' }}>{name}</div>
        </div>
      ))}
    </InlineStack>
  );

  return (
    <Page fullWidth>
      <TitleBar title="Option styles" />

      <BlockStack gap="600">
        {/* Header Section */}
        <BlockStack gap="200">
          <Text variant="headingXl">Option styles</Text>
          <Text variant="bodyMd" tone="subdued">Customize your product page and product card options.</Text>
        </BlockStack>

        <Box paddingBlockEnd="200">
          <Tabs tabs={tabs} selected={selectedTab} onSelect={handleTabChange} />
          <Divider />
        </Box>

        {/* My Styles Section */}
        <BlockStack gap="400">
          <InlineStack align="space-between" blockAlign="start">
            <BlockStack gap="100">
              <Text variant="headingLg">My styles</Text>
              <Text variant="bodyMd" tone="subdued">Manage and customize your option styles on your product page.</Text>
            </BlockStack>
            <div style={{ width: '120px' }}>
              <Select
                options={filterOptions}
                onChange={handleFilterChange}
                value={selectedFilter}
              />
            </div>
          </InlineStack>

          <Grid>
            <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 3, lg: 6, xl: 6 }}>
              {renderStyleCard("image_swatch", "Image swatch", styleSettings["image_swatch"] ? renderPreview("image_swatch") : imageSwatchPreview)}
            </Grid.Cell>
            <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 3, lg: 12, xl: 12 }}>
              {renderStyleCard("slide_swatch", "Slide swatch (Mobile only)", styleSettings["slide_swatch"] ? renderPreview("slide_swatch") : slideSwatchPreview)}
            </Grid.Cell>
            <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 3, lg: 6, xl: 6 }}>
              {renderStyleCard("polaroid_swatch", "Polaroid swatch", styleSettings["polaroid_swatch"] ? renderPreview("polaroid_swatch") : polaroidSwatchPreview)}
            </Grid.Cell>
            <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 3, lg: 6, xl: 6 }}>
              {renderStyleCard("color_swatch", "Color swatch", styleSettings["color_swatch"] ? renderPreview("color_swatch") : colorSwatchPreview)}
            </Grid.Cell>
            <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 3, lg: 6, xl: 6 }}>
              {renderStyleCard("square_color_swatch", "Square color swatch", styleSettings["square_color_swatch"] ? renderPreview("square_color_swatch") : squareColorSwatchPreview)}
            </Grid.Cell>
            <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 3, lg: 6, xl: 6 }}>
              {renderStyleCard("pill_swatch", "Color swatch in pill button", styleSettings["pill_swatch"] ? renderPreview("pill_swatch") : colorPillPreview)}
            </Grid.Cell>
            <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 3, lg: 6, xl: 6 }}>
              {renderStyleCard("button", "Button", styleSettings["button"] ? renderPreview("button") : buttonPreview)}
            </Grid.Cell>
            <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 3, lg: 6, xl: 6 }}>
              {renderStyleCard("pill_button", "Pill button", styleSettings["pill_button"] ? renderPreview("pill_button") : pillButtonPreview)}
            </Grid.Cell>
            <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 3, lg: 6, xl: 6 }}>
              {renderStyleCard("dropdown", "Dropdown", styleSettings["dropdown"] ? renderPreview("dropdown") : dropdownPreview)}
            </Grid.Cell>
            <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 3, lg: 6, xl: 6 }}>
              {renderStyleCard("image_dropdown", "Image swatch in dropdown", styleSettings["image_dropdown"] ? renderPreview("image_dropdown") : imageDropdownPreview)}
            </Grid.Cell>
          </Grid>
        </BlockStack>

        <Box paddingBlockStart="200" paddingBlockEnd="200">
          <Divider />
        </Box>

        {/* Explore More Styles Section */}
        <BlockStack gap="400">
          <BlockStack gap="100">
            <Text variant="headingLg">Explore more styles</Text>
            <Text variant="bodyMd" tone="subdued">Discover more product page styles to fit your brand.</Text>
          </BlockStack>

          <Grid>
            <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 2, lg: 4, xl: 4 }}>
              {renderExploreCard("Slide swatch (Mobile only)", renderPreview("slide_swatch"))}
            </Grid.Cell>
            <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 2, lg: 4, xl: 4 }}>
              {renderExploreCard("Image swatch", renderPreview("image_swatch"))}
            </Grid.Cell>
            <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 2, lg: 4, xl: 4 }}>
              {renderExploreCard("Polaroid swatch", renderPreview("polaroid_swatch"))}
            </Grid.Cell>
            <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 2, lg: 4, xl: 4 }}>
              {renderExploreCard("Color swatch", renderPreview("color_swatch"))}
            </Grid.Cell>
            <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 2, lg: 4, xl: 4 }}>
              {renderExploreCard("Button", renderPreview("button"))}
            </Grid.Cell>
            <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 2, lg: 4, xl: 4 }}>
              {renderExploreCard("Find more styles", null, true)}
            </Grid.Cell>
          </Grid>
        </BlockStack>

        {/* Footer */}
        <Box paddingBlockEnd="600" paddingBlockStart="400">
          <InlineStack align="center" gap="100">
            <Icon source={QuestionCircleIcon} tone="base" />
            <a href="#" style={{ textDecoration: 'none', color: '#005bd3', fontWeight: '500' }}>Help Center</a>
          </InlineStack>
        </Box>
      </BlockStack>
    </Page>
  );
}

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

  const DEFAULT_SETTINGS = {
    basic: { swatchSize: 26, gap: 6, hideActiveSwatch: false, activeSwatchFirst: false, padding: 0, twoColorStyle: "LT_RB", hoverEffect: "none" },
    border: { radius: 8, width: 1, color: "#dbdfe2", activeColor: "#000000", hoverColor: "#000000", outerWidth: 0, outerRadius: 8, outerPadding: 4, outerColor: "#dbdfe2", outerActiveColor: "#000000", outerHoverColor: "#000000" },
    label: { show: true, layout: "stack", gap: 8, fontSize: 14, fontWeight: "normal", lineHeight: 18, showSelectedVariant: true, selectedVariantFontWeight: "normal" },
    variantName: { show: true, fontSize: 12, fontWeight: "semibold", maxLines: 2 },
    price: { show: false },
    text: { position: "right", gap: 8, width: 50 },
    layout: { marginTop: 0, marginBottom: 10, align: "left", type: "stack", maxSwatches: 100 },
    unavailable: { style: "cross_mark", allowRedirect: false, hideUnmatched: false },
    badge: { show: false, text: "NEW", position: "top-right", fontSize: 10, color: "#ffffff", bgColor: "#000000" },
    shadow: { show: false, color: "rgba(0,0,0,0.1)", blur: 4, spread: 0, offsetX: 0, offsetY: 2 },
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
    const settings = styleSettings[styleId] || DEFAULT_SETTINGS;
    const isSlide = styleId.includes('slide');
    const isButton = styleId.includes('button');
    const isDropdown = styleId.includes('dropdown');

    const getOuterStyle = (isActive) => {
      const b = settings.border;
      if (b.outerWidth <= 0) return {};
      return {
          padding: `${b.outerPadding}px`,
          border: `${b.outerWidth}px solid ${isActive ? b.outerActiveColor : b.outerColor}`,
          borderRadius: `${b.outerRadius}px`,
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
        minWidth: isSlide ? '70px' : `${settings.basic.swatchSize}px`,
        minHeight: isSlide ? '100px' : `${settings.basic.swatchSize}px`,
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
            <div style={{ width: '100%', maxWidth: '200px', padding: '10px', border: '1px solid #ddd', borderRadius: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fff' }}>
                <span style={{ fontSize: '13px' }}>Beige Brown</span>
                <Icon source={ChevronDownIcon} tone="base" />
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', gap: `${settings.basic.gap}px`, overflowX: 'auto', width: '100%', padding: '4px' }}>
            {previewItems.slice(0, 6).map((p, i) => {
                const isActive = i === 1;
                const isRound = styleId.includes('round') || styleId.includes('pill') || styleId.includes('circle');
                return (
                    <div key={i} style={getOuterStyle(isActive)}>
                        <div style={getSwatchStyle(isActive)}>
                            {renderBadge(isActive)}
                            {!isButton && (
                                <div style={{ 
                                    width: isSlide ? '60px' : `${settings.basic.swatchSize}px`, 
                                    height: isSlide ? '60px' : `${settings.basic.swatchSize}px`, 
                                    backgroundColor: '#eee', borderRadius: isRound ? '50%' : '2px', overflow: 'hidden'
                                }}>
                                    <img src={p.color} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                </div>
                            )}
                            {(settings.label.show || isButton || isSlide) && (
                                <div style={{ marginTop: '4px', textAlign: 'center' }}>
                                    <div style={{ fontSize: '10px', fontWeight: (isActive || isButton) ? 'bold' : 'normal', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '60px' }}>{p.name}</div>
                                    {isSlide && <div style={{ fontSize: '9px', color: '#666' }}>$19.99</div>}
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
              {renderStyleCard("image_swatch", "Image swatch", renderPreview("image_swatch"))}
            </Grid.Cell>
            <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 3, lg: 12, xl: 12 }}>
              {renderStyleCard("slide_swatch", "Slide swatch (Mobile only)", renderPreview("slide_swatch"))}
            </Grid.Cell>
            <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 3, lg: 6, xl: 6 }}>
              {renderStyleCard("polaroid_swatch", "Polaroid swatch", renderPreview("polaroid_swatch"))}
            </Grid.Cell>
            <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 3, lg: 6, xl: 6 }}>
              {renderStyleCard("color_swatch", "Color swatch", renderPreview("color_swatch"))}
            </Grid.Cell>
            <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 3, lg: 6, xl: 6 }}>
              {renderStyleCard("square_color_swatch", "Square color swatch", renderPreview("square_color_swatch"))}
            </Grid.Cell>
            <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 3, lg: 6, xl: 6 }}>
              {renderStyleCard("pill_swatch", "Color swatch in pill button", renderPreview("pill_swatch"))}
            </Grid.Cell>
            <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 3, lg: 6, xl: 6 }}>
              {renderStyleCard("button", "Button", renderPreview("button"))}
            </Grid.Cell>
            <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 3, lg: 6, xl: 6 }}>
              {renderStyleCard("pill_button", "Pill button", renderPreview("pill_button"))}
            </Grid.Cell>
            <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 3, lg: 6, xl: 6 }}>
              {renderStyleCard("dropdown", "Dropdown", renderPreview("dropdown"))}
            </Grid.Cell>
            <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 3, lg: 6, xl: 6 }}>
              {renderStyleCard("image_dropdown", "Image swatch in dropdown", renderPreview("image_dropdown"))}
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
              {renderExploreCard("Slide swatch (Mobile only)", slideSwatchPreview)}
            </Grid.Cell>
            <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 2, lg: 4, xl: 4 }}>
              {renderExploreCard("Image swatch card", imageSwatchCardPreview)}
            </Grid.Cell>
            <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 2, lg: 4, xl: 4 }}>
              {renderExploreCard("Polaroid swatch", polaroidSwatchPreview)}
            </Grid.Cell>
            <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 2, lg: 4, xl: 4 }}>
              {renderExploreCard("Color swatch card", colorSwatchCardPreview)}
            </Grid.Cell>
            <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 2, lg: 4, xl: 4 }}>
              {renderExploreCard("Button", buttonPreview)}
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

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
import { 
  BASE_SETTINGS, 
  DEFAULT_SETTINGS_BY_STYLE, 
  renderPreviewContent, 
  PREVIEW_PRODUCTS,
  IMAGES,
  COLORS
} from "../utils/style-utils";

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

  // Cleaned up: settings moved to style-utils.jsx

 // previewItems replaced by PREVIEW_PRODUCTS

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

  // Assets moved to style-utils.jsx
  // --- ORIGINAL STATIC PREVIEWS ---
  // Static preview nodes removed in favor of universal renderPreviewContent

  const buttonPreview = (
    <InlineStack gap="200" wrap={false} align="start" blockAlign="start">
      <div style={{ padding: '8px 16px', border: '1px solid #ccc', backgroundColor: '#fff', fontSize: '13px' }}>Beige</div>
      <div style={{ padding: '8px 16px', border: '2px solid #000', backgroundColor: '#000', color: '#fff', fontSize: '13px', fontWeight: 'bold' }}>Dark blue</div>
      <div style={{ padding: '8px 16px', border: '1px solid #ccc', backgroundColor: '#fff', fontSize: '13px' }}>Green</div>
      <div style={{ padding: '8px 16px', border: '1px solid #ddd', backgroundColor: '#fff', color: '#999', fontSize: '13px', textDecoration: 'line-through' }}>Yellow</div>
      <div style={{ padding: '8px 16px', border: '1px solid #ccc', backgroundColor: '#fff', fontSize: '13px' }}>Black</div>
    </InlineStack>
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
    return renderPreviewContent(styleId, settings);
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
            <img src={IMAGES[i]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
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
          <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: COLORS[i] || '#000' }} />
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

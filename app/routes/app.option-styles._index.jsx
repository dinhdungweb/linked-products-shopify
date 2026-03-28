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
import { LinkIcon, QuestionCircleIcon, PlusIcon, StoreIcon, MenuHorizontalIcon } from "@shopify/polaris-icons";
import { TitleBar } from "@shopify/app-bridge-react";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { 
  BASE_SETTINGS, 
  DEFAULT_SETTINGS_BY_STYLE, 
  PreviewRenderer
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

  const renderStyleCard = (styleId, title) => {
    const settings = styleSettings[styleId] || DEFAULT_SETTINGS_BY_STYLE[styleId] || BASE_SETTINGS;
    return (
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
          <div style={{ flex: '1 1 0%', display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-start', overflowX: 'auto', paddingBottom: '4px' }}>
            <PreviewRenderer styleId={styleId} settings={settings} />
          </div>
        </div>
      </div>
    );
  };

  const renderExploreCard = (styleId, title, asDarkCard = false) => {
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

    const settings = DEFAULT_SETTINGS_BY_STYLE[styleId] || BASE_SETTINGS;

    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--p-color-bg-surface, #fff)', borderRadius: 'var(--p-border-radius-300, 8px)', boxShadow: 'var(--p-shadow-200, 0 1px 3px rgba(0,0,0,0.1), 0 2px 4px rgba(0,0,0,0.05))', overflow: 'hidden' }}>
        <div style={{ flex: 1, backgroundColor: 'var(--p-color-bg-surface-secondary, #f4f6f8)', padding: '16px', display: 'flex', flexDirection: 'column', minHeight: '150px' }}>
          <div style={{ flex: 1, display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-start', overflowX: 'hidden' }}>
            <PreviewRenderer styleId={styleId} settings={settings} />
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

  return (
    <Page fullWidth>
      <TitleBar title="Option styles" />

      <BlockStack gap="600">
        <BlockStack gap="200">
          <Text variant="headingXl">Option styles</Text>
          <Text variant="bodyMd" tone="subdued">Customize your product page and product card options.</Text>
        </BlockStack>

        <Box paddingBlockEnd="200">
          <Tabs tabs={tabs} selected={selectedTab} onSelect={handleTabChange} />
          <Divider />
        </Box>

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
              {renderStyleCard("image_swatch", "Image swatch")}
            </Grid.Cell>
            <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 3, lg: 12, xl: 12 }}>
              {renderStyleCard("slide_swatch", "Slide swatch (Mobile only)")}
            </Grid.Cell>
            <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 3, lg: 6, xl: 6 }}>
              {renderStyleCard("polaroid_swatch", "Polaroid swatch")}
            </Grid.Cell>
            <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 3, lg: 6, xl: 6 }}>
              {renderStyleCard("color_swatch", "Color swatch")}
            </Grid.Cell>
            <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 3, lg: 6, xl: 6 }}>
              {renderStyleCard("square_color_swatch", "Square color swatch")}
            </Grid.Cell>
            <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 3, lg: 6, xl: 6 }}>
              {renderStyleCard("pill_swatch", "Color swatch in pill button")}
            </Grid.Cell>
            <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 3, lg: 6, xl: 6 }}>
              {renderStyleCard("button", "Button")}
            </Grid.Cell>
            <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 3, lg: 6, xl: 6 }}>
              {renderStyleCard("pill_button", "Pill button")}
            </Grid.Cell>
            <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 3, lg: 6, xl: 6 }}>
              {renderStyleCard("dropdown", "Dropdown")}
            </Grid.Cell>
            <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 3, lg: 6, xl: 6 }}>
              {renderStyleCard("image_dropdown", "Image swatch in dropdown")}
            </Grid.Cell>
          </Grid>
        </BlockStack>

        <Box paddingBlockStart="200" paddingBlockEnd="200">
          <Divider />
        </Box>

        <BlockStack gap="400">
          <BlockStack gap="100">
            <Text variant="headingLg">Explore more styles</Text>
            <Text variant="bodyMd" tone="subdued">Discover more product page styles to fit your brand.</Text>
          </BlockStack>

          <Grid>
            <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 2, lg: 4, xl: 4 }}>
              {renderExploreCard("slide_swatch", "Slide swatch (Mobile only)")}
            </Grid.Cell>
            <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 2, lg: 4, xl: 4 }}>
              {renderExploreCard("image_swatch", "Image swatch")}
            </Grid.Cell>
            <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 2, lg: 4, xl: 4 }}>
              {renderExploreCard("polaroid_swatch", "Polaroid swatch")}
            </Grid.Cell>
            <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 2, lg: 4, xl: 4 }}>
              {renderExploreCard("color_swatch", "Color swatch")}
            </Grid.Cell>
            <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 2, lg: 4, xl: 4 }}>
              {renderExploreCard("button", "Button")}
            </Grid.Cell>
            <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 2, lg: 4, xl: 4 }}>
              {renderExploreCard("more", "Find more styles", true)}
            </Grid.Cell>
          </Grid>
        </BlockStack>

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

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
  Popover,
  ActionList,
} from "@shopify/polaris";
import { LinkIcon, QuestionCircleIcon, PlusIcon, StoreIcon, MenuHorizontalIcon, StarIcon, DuplicateIcon, DeleteIcon } from "@shopify/polaris-icons";
import { TitleBar, useSubmit } from "@shopify/app-bridge-react";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit as useRemixSubmit } from "@remix-run/react";
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

  const productGroups = await prisma.productGroup.findMany({
    where: { shop },
    select: { selectorStyle: true, cardSelectorStyle: true }
  });

  const usedStyles = new Set();
  productGroups.forEach(pg => {
    if (pg.selectorStyle) usedStyles.add(pg.selectorStyle);
    if (pg.cardSelectorStyle) usedStyles.add(pg.cardSelectorStyle);
  });

  const appSettings = await prisma.appSetting.findUnique({
    where: { shop },
  }) || await prisma.appSetting.create({
    data: { shop }
  });

  return json({ 
    styleSettings: styleSettings.reduce((acc, curr) => {
      acc[curr.styleId] = curr.settings;
      return acc;
    }, {}),
    usedStyles: Array.from(usedStyles),
    appSettings
  });
};

export const action = async ({ request }) => {
  const { authenticate } = await import("../shopify.server");
  const { default: prisma } = await import("../db.server");
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();
  const actionType = formData.get("action");

  if (actionType === "setDefaultStyle") {
    const styleId = formData.get("styleId");
    const isCard = formData.get("isCard") === "true";

    await prisma.appSetting.update({
      where: { shop },
      data: isCard 
        ? { defaultProductCardStyle: styleId }
        : { defaultProductPageStyle: styleId }
    });

    return json({ success: true });
  }

  return json({ error: "Invalid action" }, { status: 400 });
};

export default function OptionStylesPage() {
  const { styleSettings, usedStyles, appSettings } = useLoaderData();
  const submit = useRemixSubmit();
  const [selectedTab, setSelectedTab] = useState(0);
  const [selectedFilter, setSelectedFilter] = useState('all');
  const [activeMenu, setActiveMenu] = useState(null);

  const toggleMenu = (styleId) => setActiveMenu(activeMenu === styleId ? null : styleId);

  const handleSetDefault = (styleId, isCard) => {
    const formData = new FormData();
    formData.append("action", "setDefaultStyle");
    formData.append("styleId", styleId);
    formData.append("isCard", isCard.toString());
    submit(formData, { method: "POST" });
    setActiveMenu(null);
  };

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

  const productPageStyles = [
    { id: "image_swatch", title: "Image swatch" },
    { id: "slide_swatch", title: "Slide swatch (Mobile only)" },
    { id: "polaroid_swatch", title: "Polaroid swatch" },
    { id: "color_swatch", title: "Color swatch" },
    { id: "square_color_swatch", title: "Square color swatch" },
    { id: "pill_swatch", title: "Color swatch in pill button" },
    { id: "button", title: "Button" },
    { id: "pill_button", title: "Pill button" },
    { id: "dropdown", title: "Dropdown" },
    { id: "image_dropdown", title: "Image swatch in dropdown" },
  ];

  const productCardStyles = [
    { id: "image_swatch_card", title: "Image swatch card" },
    { id: "color_swatch_card", title: "Color swatch card" },
  ];

  const renderStyleCard = (styleId, title) => {
    const settings = styleSettings[styleId] || DEFAULT_SETTINGS_BY_STYLE[styleId] || BASE_SETTINGS;
    const isInUse = usedStyles.includes(styleId);
    const isDefault = selectedTab === 0 
      ? appSettings.defaultProductPageStyle === styleId
      : appSettings.defaultProductCardStyle === styleId;

    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--p-color-bg-surface, #fff)', borderRadius: 'var(--p-border-radius-300, 8px)', boxShadow: 'var(--p-shadow-200, 0 1px 3px rgba(0,0,0,0.1), 0 2px 4px rgba(0,0,0,0.05))', overflow: 'visible', position: 'relative', zIndex: (styleId.includes('dropdown') || activeMenu === styleId) ? 20 : 1 }}>
        <Box padding="300">
          <InlineStack align="space-between" blockAlign="center">
            <InlineStack gap="200" blockAlign="center">
              <Text variant="headingSm" as="h3">{title}</Text>
              <InlineStack gap="100">
                <Badge tone={isInUse ? "success" : "new"}>{isInUse ? "In use" : "Not in use"}</Badge>
                {isDefault && <Badge tone="attention">Default</Badge>}
              </InlineStack>
            </InlineStack>
            <InlineStack gap="100" blockAlign="center">
              <Button icon={LinkIcon} size="micro" url={`/app/option-styles/${styleId}`}>Customize</Button>
              <Popover
                active={activeMenu === styleId}
                activator={<Button variant="plain" icon={MenuHorizontalIcon} onClick={() => toggleMenu(styleId)} />}
                onClose={() => setActiveMenu(null)}
              >
                <ActionList
                  items={[
                    { content: 'Duplicate', icon: DuplicateIcon, disabled: true },
                    { 
                      content: 'Set as default', 
                      icon: StarIcon, 
                      onAction: () => handleSetDefault(styleId, selectedTab === 1),
                      disabled: isDefault
                    },
                    { content: 'Delete', icon: DeleteIcon, destructive: true, disabled: true },
                  ]}
                />
              </Popover>
            </InlineStack>
          </InlineStack>
        </Box>
        <Divider />
        <div style={{ 
          flex: 1, 
          backgroundColor: 'var(--p-color-bg-surface-secondary, #f4f6f8)', 
          padding: '16px', 
          display: 'flex', 
          flexDirection: 'column', 
          minHeight: '120px', 
          overflow: 'visible',
          borderRadius: '0 0 8px 8px' // Thêm bo góc dưới để không bị mất khung box
        }}>
          <div style={{ flex: '1 1 0%', display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-start', overflow: 'visible' }}>
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
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--p-color-bg-surface, #fff)', borderRadius: 'var(--p-border-radius-300, 8px)', boxShadow: 'var(--p-shadow-200, 0 1px 3px rgba(0,0,0,0.1), 0 2px 4px rgba(0,0,0,0.05))', overflow: 'visible', position: 'relative', zIndex: styleId.includes('dropdown') ? 20 : 1 }}>
        <div style={{ 
          flex: 1, 
          backgroundColor: 'var(--p-color-bg-surface-secondary, #f4f6f8)', 
          padding: '16px', 
          display: 'flex', 
          flexDirection: 'column', 
          minHeight: '150px', 
          overflow: 'visible',
          borderRadius: '0 0 8px 8px'
        }}>
          <div style={{ flex: 1, display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-start', overflow: 'visible' }}>
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
            {(selectedTab === 0 ? productPageStyles : productCardStyles)
              .filter(style => {
                const isInUse = usedStyles.includes(style.id);
                if (selectedFilter === 'in_use') return isInUse;
                if (selectedFilter === 'not_in_use') return !isInUse;
                return true;
              })
              .map(style => (
                <Grid.Cell key={style.id} columnSpan={{ xs: 6, sm: 6, md: 3, lg: 6, xl: 6 }}>
                  {renderStyleCard(style.id, style.title)}
                </Grid.Cell>
              ))
            }
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

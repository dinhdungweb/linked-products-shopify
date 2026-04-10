import { useState, useEffect, useCallback, useMemo } from "react";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Box,
  TextField,
  Checkbox,
  Badge,
  Button,
  Tabs,
  Grid,
  Icon,
  Banner,
  Divider,
  InlineGrid,
  EmptyState,
} from "@shopify/polaris";
import {
  SettingsIcon,
  CheckCircleIcon,
  ExternalIcon,
  LanguageIcon,
  InfoIcon,
  PaintBrushFlatIcon,
  MagicIcon,
  EmailIcon,
  CheckIcon,
  XIcon
} from "@shopify/polaris-icons";
import { TitleBar } from "@shopify/app-bridge-react";

export const loader = async ({ request }) => {
  const { authenticate } = await import("../shopify.server");
  const { default: prisma } = await import("../db.server");
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;

  let settings = await prisma.appSetting.findUnique({
    where: { shop },
  });

  const isFirstInstall = !settings;

  if (isFirstInstall) {
    settings = await prisma.appSetting.create({
      data: { shop },
    });
  }

  // Auto-sync metafield on first install hoặc khi metafield chưa tồn tại
  if (isFirstInstall) {
    try {
      const shopData = await admin.graphql(`{ shop { id } }`);
      const shopJson = await shopData.json();
      const shopId = shopJson.data.shop.id;

      // Kiểm tra xem metafield đã tồn tại chưa
      const checkMetafield = await admin.graphql(`
        query {
          shop {
            metafield(namespace: "linked_products", key: "settings") {
              value
            }
          }
        }
      `);
      const checkResult = await checkMetafield.json();
      const existingMetafield = checkResult.data.shop.metafield;

      // Chỉ ghi nếu chưa có metafield
      if (!existingMetafield) {
        await admin.graphql(`
          mutation setSettings($metafields: [MetafieldsSetInput!]!) {
            metafieldsSet(metafields: $metafields) {
              userErrors { field message }
            }
          }
        `, {
          variables: {
            metafields: [{
              namespace: "linked_products",
              key: "settings",
              type: "json",
              ownerId: shopId,
              value: JSON.stringify(settings)
            }]
          }
        });
      }
    } catch (e) {
      // Không block loader nếu sync thất bại
      console.error("[AutoSync] Failed to initialize metafield:", e);
    }
  }

  return json({ settings, shop });
};

export const action = async ({ request }) => {
  const { authenticate } = await import("../shopify.server");
  const { default: prisma } = await import("../db.server");
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();
  const data = Object.fromEntries(formData);

  // Convert types
  const settingsData = {
    appEnabled: data.appEnabled === "true",
    showOnProductCards: data.showOnProductCards === "true",
    applyToCollection: data.applyToCollection === "true",
    applyToSearch: data.applyToSearch === "true",
    applyToHome: data.applyToHome === "true",
    hideMultiOptionOnCards: data.hideMultiOptionOnCards === "true",
    hideInaccessible: data.hideInaccessible === "true",
    removeArchived: data.removeArchived === "true",
    seamlessSwitching: data.seamlessSwitching === "true",
    autoScroll: data.autoScroll === "true",
    enableAutosuggestion: data.enableAutosuggestion === "true",
    notificationEmail: data.notificationEmail,
    selectOptionLabel: data.selectOptionLabel,
    soldOutLabel: data.soldOutLabel,
    unavailableLabel: data.unavailableLabel,
    swatchSize: parseInt(data.swatchSize) || 50,
    itemsGap: parseInt(data.itemsGap) || 8,
    borderRadius: parseInt(data.borderRadius) || 8,
    borderWidth: parseInt(data.borderWidth) || 1,
    borderColor: data.borderColor,
    selectedBorderColor: data.selectedBorderColor,
    showOptionName: data.showOptionName === "true",
    blockPaddingX: parseInt(data.blockPaddingX) || 12,
    blockPaddingY: parseInt(data.blockPaddingY) || 8,
    blockFontSize: parseInt(data.blockFontSize) || 14,
    blockBgColor: data.blockBgColor,
    blockTextColor: data.blockTextColor,
    selectedBgColor: data.selectedBgColor,
    selectedTextColor: data.selectedTextColor,
    customCssProduct: data.customCssProduct,
    customCssCollection: data.customCssCollection,
  };

  const updatedSettings = await prisma.appSetting.upsert({
    where: { shop },
    update: settingsData,
    create: { shop, ...settingsData },
  });

  // Get Shop GID for metafields
  const shopData = await admin.graphql(`{ shop { id } }`);
  const shopJson = await shopData.json();
  const shopId = shopJson.data.shop.id;

  await admin.graphql(`
    mutation setSettings($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        userErrors { field message }
      }
    }
  `, {
    variables: {
      metafields: [{
        namespace: "linked_products",
        key: "settings",
        type: "json",
        ownerId: shopId,
        value: JSON.stringify(updatedSettings)
      }]
    }
  });

  return json({ success: true, settings: updatedSettings });
};

export default function SettingsPage() {
  const { settings: initialSettings, shop } = useLoaderData();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isLoading = navigation.state !== "idle";

  const [selectedTab, setSelectedTab] = useState(0);
  const [showBanner, setShowBanner] = useState(false);

  // Settings State
  const [settings, setSettings] = useState(initialSettings);

  useEffect(() => {
    setSettings(initialSettings);
  }, [initialSettings]);

  const handleSettingChange = useCallback((key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  }, []);

  const handleSave = useCallback(() => {
    const formData = new FormData();
    Object.keys(settings).forEach(key => {
      let value = settings[key];
      if (typeof value === 'number' && isNaN(value)) value = 0;
      if (value === "" && (key.includes('Size') || key.includes('Gap') || key.includes('Radius') || key.includes('Width') || key.includes('Padding'))) value = 0;
      formData.append(key, value);
    });
    submit(formData, { method: "post" });
    setShowBanner(true);
    setTimeout(() => setShowBanner(false), 3000);
  }, [settings, submit]);

  const tabs = useMemo(() => [
    {
      id: "general",
      content: (
        <InlineStack gap="200" align="start" blockAlign="center">
          <Icon source={SettingsIcon} />
          <span>General</span>
        </InlineStack>
      ),
      panelID: "general-panel",
    },
    {
      id: "appearance",
      content: (
        <InlineStack gap="200" align="start" blockAlign="center">
          <Icon source={PaintBrushFlatIcon} />
          <span>Storefront</span>
        </InlineStack>
      ),
      panelID: "appearance-panel",
    },
    {
      id: "theme-setup",
      content: (
        <InlineStack gap="200" align="start" blockAlign="center">
          <Icon source={ExternalIcon} />
          <span>Theme Setup</span>
        </InlineStack>
      ),
      panelID: "theme-setup-panel",
    },
    {
      id: "translation",
      content: (
        <InlineStack gap="200" align="start" blockAlign="center">
          <Icon source={LanguageIcon} />
          <span>Translation</span>
        </InlineStack>
      ),
      panelID: "translation-panel",
    },
  ], []);

  return (
    <Page fullWidth>
      <TitleBar title="App Settings" />
      
      <BlockStack gap="600">
        {/* Header Hero Section */}
        <Box 
          padding="600" 
          background="bg-surface-secondary" 
          borderRadius="300" 
          borderWidth="025" 
          borderColor="border-subdued"
          shadow="sm"
        >
          <InlineStack align="space-between" blockAlign="center">
            <InlineStack gap="300" blockAlign="center">
              <Box padding="200" background="bg-fill-brand-selected" borderRadius="200">
                <Icon source={SettingsIcon} tone="brand" />
              </Box>
              <BlockStack gap="0">
                <Text variant="headingXl" as="h1">Configurations</Text>
                <Text variant="bodyMd" tone="subdued">Manage your preferences, display logic, and theme integration.</Text>
              </BlockStack>
            </InlineStack>
            <InlineStack gap="300">
              <Button 
                variant="primary" 
                size="large" 
                onClick={handleSave} 
                loading={isLoading} 
                icon={CheckCircleIcon}
              >
                Save All Changes
              </Button>
            </InlineStack>
          </InlineStack>
        </Box>

        {showBanner && (
          <Banner tone="success" onDismiss={() => setShowBanner(false)}>
            <p>Settings have been updated successfully.</p>
          </Banner>
        )}

        <Tabs tabs={tabs} selected={selectedTab} onSelect={setSelectedTab}>
          <Box paddingBlockStart="400" paddingBlockEnd="800">
            
            {/* TAB 0: GENERAL */}
            {selectedTab === 0 && (
              <BlockStack gap="600">
                <Card>
                  <InlineStack align="space-between" blockAlign="center">
                    <BlockStack gap="100">
                      <Text variant="headingMd" as="h3">App Visibility</Text>
                      <Text variant="bodyMd" tone="subdued">Control if the linked products are visible on your storefront.</Text>
                    </BlockStack>
                    <InlineStack gap="300" blockAlign="center">
                      <Badge tone={settings.appEnabled ? "success" : "critical"} progress={settings.appEnabled ? "complete" : "incomplete"}>
                        <InlineStack gap="100" blockAlign="center">
                          <Icon source={settings.appEnabled ? CheckCircleIcon : XIcon} tone={settings.appEnabled ? "success" : "critical"} />
                          <Text variant="bodySm" fontWeight="bold">
                            {settings.appEnabled ? "ACTIVE" : "DISABLED"}
                          </Text>
                        </InlineStack>
                      </Badge>
                      <Button 
                        variant="secondary" 
                        onClick={() => handleSettingChange("appEnabled", !settings.appEnabled)}
                        tone={settings.appEnabled ? "critical" : undefined}
                      >
                        {settings.appEnabled ? "Disable App" : "Activate App"}
                      </Button>
                    </InlineStack>
                  </InlineStack>
                </Card>

                <InlineGrid columns={{ xs: 1, md: "2fr 1fr" }} gap="400">
                  <BlockStack gap="400">
                    <Card>
                      <BlockStack gap="400">
                         <Text variant="headingMd" as="h3">Automation & Inventory</Text>
                         <Divider />
                         <Checkbox 
                           label="Hide inaccessible products" 
                           checked={settings.hideInaccessible} 
                           onChange={(v) => handleSettingChange("hideInaccessible", v)} 
                           helpText="Automatically hides draft, archived, or unpublished products from the store selection." 
                         />
                         <Checkbox 
                           label="Remove archived products" 
                           checked={settings.removeArchived} 
                           onChange={(v) => handleSettingChange("removeArchived", v)} 
                           helpText="Clean up your groups by removing products that have been archived in Shopify." 
                         />
                         <Checkbox 
                           label="Auto-suggest groups (AI)" 
                           checked={settings.enableAutosuggestion} 
                           onChange={(v) => handleSettingChange("enableAutosuggestion", v)} 
                           helpText="Use smart logic to suggest product groupings based on title patterns." 
                         />
                      </BlockStack>
                    </Card>

                    <Card>
                       <BlockStack gap="400">
                          <InlineStack gap="200" align="start" blockAlign="center">
                            <Box background="bg-fill-info-secondary" padding="100" borderRadius="100">
                                <Icon source={EmailIcon} tone="info" />
                            </Box>
                            <Text variant="headingMd" as="h3">Communication</Text>
                          </InlineStack>
                          <TextField 
                            label="Notification Email" 
                            value={settings.notificationEmail || ""} 
                            onChange={(v) => handleSettingChange("notificationEmail", v)} 
                            placeholder="admin@yourstore.com" 
                            autoComplete="email" 
                            helpText="We will send sync reports and critical alerts to this address."
                          />
                       </BlockStack>
                    </Card>
                  </BlockStack>

                  <Card background="bg-surface-secondary">
                    <BlockStack gap="400">
                       <Box padding="200" background="bg-fill-info-selected" borderRadius="200" width="40px">
                          <Icon source={InfoIcon} tone="info" />
                       </Box>
                       <Text variant="headingMd">Need Help?</Text>
                       <Text variant="bodyMd" tone="subdued">
                         Setting up linked products helps increase conversion rates by showing available variations directly on collections.
                       </Text>
                       <Button url="https://help.example.com" variant="tertiary" icon={ExternalIcon} target="_blank">Documentation</Button>
                    </BlockStack>
                  </Card>
                </InlineGrid>
              </BlockStack>
            )}

            {/* TAB 1: STOREFRONT */}
            {selectedTab === 1 && (
              <BlockStack gap="500">
                <Card>
                  <BlockStack gap="400">
                    <Text variant="headingMd" as="h2">Product Card Display</Text>
                    <Text variant="bodyMd" tone="subdued">Choose where the linked options appear across your storefront.</Text>
                    <Divider />
                    <Checkbox
                      label="Show options on product cards in collections and grids"
                      checked={settings.showOnProductCards}
                      onChange={(value) => handleSettingChange("showOnProductCards", value)}
                    />
                    
                    {settings.showOnProductCards && (
                      <Box paddingInlineStart="600" padding="400" background="bg-surface-secondary" borderRadius="200">
                        <BlockStack gap="300">
                          <Text variant="bodyMd" fontWeight="semibold">Display on these pages:</Text>
                          <InlineStack gap="600">
                            <Checkbox label="Collection Pages" checked={settings.applyToCollection} onChange={(v) => handleSettingChange("applyToCollection", v)} />
                            <Checkbox label="Search Results" checked={settings.applyToSearch} onChange={(v) => handleSettingChange("applyToSearch", v)} />
                            <Checkbox label="Home Page Sections" checked={settings.applyToHome} onChange={(v) => handleSettingChange("applyToHome", v)} />
                          </InlineStack>
                        </BlockStack>
                      </Box>
                    )}

                    <Checkbox 
                      label="Hide multi-option groups on product cards" 
                      checked={settings.hideMultiOptionOnCards} 
                      onChange={(v) => handleSettingChange("hideMultiOptionOnCards", v)} 
                      helpText="If a product belongs to multiple groups, only show the primary one on cards."
                    />
                  </BlockStack>
                </Card>

                <Card title="Styling & Behavior">
                  <BlockStack gap="400">
                    <Text variant="headingMd" as="h2">Behaviors</Text>
                    <Divider />
                    <InlineGrid columns={{ xs: 1, sm: 2 }} gap="400">
                        <Checkbox 
                          label="Seamless Switching" 
                          checked={settings.seamlessSwitching} 
                          onChange={(v) => handleSettingChange("seamlessSwitching", v)} 
                          helpText="Load variants without refreshing the entire page."
                        />
                        <Checkbox 
                          label="Auto Scroll to Top" 
                          checked={settings.autoScroll} 
                          onChange={(v) => handleSettingChange("autoScroll", v)} 
                          helpText="Scroll back to product details when switching variants."
                        />
                    </InlineGrid>
                  </BlockStack>
                </Card>

                <Card title="Advanced Aesthetics">
                  <BlockStack gap="400">
                    <Text variant="headingMd" as="h2">Custom CSS</Text>
                    <Text variant="bodyMd" tone="subdued">Override default styles by injecting your own CSS blocks.</Text>
                    <Divider />
                    <TextField 
                      label="Product Page CSS" 
                      value={settings.customCssProduct} 
                      onChange={(v) => handleSettingChange("customCssProduct", v)} 
                      multiline={4} 
                      autoComplete="off" 
                      placeholder=".variant-selector { ... }"
                    />
                    <TextField 
                      label="Collection Page CSS" 
                      value={settings.customCssCollection} 
                      onChange={(v) => handleSettingChange("customCssCollection", v)} 
                      multiline={4} 
                      autoComplete="off" 
                      placeholder=".card-swatch { ... }"
                    />
                  </BlockStack>
                </Card>
              </BlockStack>
            )}

            {/* TAB 2: THEME SETUP */}
            {selectedTab === 2 && (
              <BlockStack gap="500">
                <Card>
                   <EmptyState
                     heading="Enable App in Theme Editor"
                     action={{
                       content: 'Open Theme Editor',
                       url: `https://admin.shopify.com/store/${shop.split('.')[0]}/themes/current/editor?context=apps&activateAppId=2dc3da0c1804b6a547c472b2d3b6a6ca/app-card-injector`,
                       external: true,
                     }}
                     image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                   >
                     <p>You must enable the <b>App Embed</b> to allow the variant swatches to render on your storefront. This is a one-time setup required by Shopify.</p>
                   </EmptyState>
                </Card>
                
                <Banner tone="info" icon={MagicIcon}>
                  <p><b>Pro Tip:</b> Use the "App Block" feature in Online Store 2.0 themes to place the swatches exactly where you want on the product page.</p>
                </Banner>
              </BlockStack>
            )}

            {/* TAB 3: TRANSLATION */}
            {selectedTab === 3 && (
              <BlockStack gap="500">
                <Card>
                  <BlockStack gap="400">
                    <Text variant="headingMd" as="h2">Storefront Labels</Text>
                    <Text variant="bodyMd" tone="subdued">Customize how text appears to your customers.</Text>
                    <Divider />
                    <TextField 
                      label="Select Option Label" 
                      value={settings.selectOptionLabel} 
                      onChange={(v) => handleSettingChange("selectOptionLabel", v)} 
                      helpText="Use {option} as a placeholder (e.g., 'View more {option}')." 
                      autoComplete="off" 
                    />
                    <Grid>
                       <Grid.Cell columnSpan={{ xs: 6, md: 3 }}>
                         <TextField label="Sold Out Text" value={settings.soldOutLabel} onChange={(v) => handleSettingChange("soldOutLabel", v)} autoComplete="off" />
                       </Grid.Cell>
                       <Grid.Cell columnSpan={{ xs: 6, md: 3 }}>
                         <TextField label="Unavailable Text" value={settings.unavailableLabel} onChange={(v) => handleSettingChange("unavailableLabel", v)} autoComplete="off" />
                       </Grid.Cell>
                    </Grid>
                  </BlockStack>
                </Card>
              </BlockStack>
            )}

          </Box>
        </Tabs>

        <Divider />
        
        <Box padding="400">
          <InlineStack align="center">
            <Text variant="bodySm" tone="subdued">Variants Linked Products v2.0 • Made with ❤️ for your store</Text>
          </InlineStack>
        </Box>
      </BlockStack>
    </Page>
  );
}

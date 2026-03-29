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
} from "@shopify/polaris";
import {
  SettingsIcon,
  CheckCircleIcon,
  ExternalIcon,
  LanguageIcon,
} from "@shopify/polaris-icons";
import { TitleBar } from "@shopify/app-bridge-react";

export const loader = async ({ request }) => {
  const { authenticate } = await import("../shopify.server");
  const { default: prisma } = await import("../db.server");
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  let settings = await prisma.appSetting.findUnique({
    where: { shop },
  });

  if (!settings) {
    settings = await prisma.appSetting.create({
      data: { shop },
    });
  }

  return json({ settings });
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
  const { settings: initialSettings } = useLoaderData();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isLoading = navigation.state !== "idle";

  const [selectedTab, setSelectedTab] = useState(0);
  const [showBanner, setShowBanner] = useState(false);

  // Settings State initialized only once or when loader data changes
  const [settings, setSettings] = useState(initialSettings);

  // SYNC settings if loader data changes (e.g. after save)
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
      // Cleanup values before saving
      if (typeof value === 'number' && isNaN(value)) value = 0;
      if (value === "" && (key.includes('Size') || key.includes('Gap') || key.includes('Radius') || key.includes('Width') || key.includes('Padding'))) value = 0;
      formData.append(key, value);
    });
    submit(formData, { method: "post" });
    setShowBanner(true);
    setTimeout(() => setShowBanner(false), 3000);
  }, [settings, submit]);

  // Stable Tabs Array
  const tabs = useMemo(() => [
    {
      id: "settings",
      content: (
        <InlineStack gap="200" align="start" blockAlign="center">
          <Icon source={SettingsIcon} />
          <span>General</span>
        </InlineStack>
      ),
      panelID: "settings-panel",
    },
    {
      id: "theme-setup",
      content: (
        <InlineStack gap="200" align="start" blockAlign="center">
          <Icon source={ExternalIcon} />
          <span>Theme setup</span>
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

  // Panel rendering moved directly into the component's main body or controlled by stable structure
  return (
    <Page>
      <TitleBar title="Settings" />

      <BlockStack gap="500">
        <Box paddingBlockEnd="200">
           <InlineStack align="space-between" blockAlign="center">
             <BlockStack gap="200">
                <Text variant="headingXl">Settings</Text>
                <Text variant="bodyMd" tone="subdued">Manage your app settings and visual preferences.</Text>
             </BlockStack>
             <Button variant="primary" size="large" onClick={handleSave} loading={isLoading} icon={CheckCircleIcon}>Save Changes</Button>
           </InlineStack>
        </Box>

        <Tabs tabs={tabs} selected={selectedTab} onSelect={setSelectedTab}>
          <Box paddingBlockStart="500" paddingBlockEnd="800">
             {showBanner && (
               <Box paddingBlockEnd="400">
                 <Banner tone="success" onDismiss={() => setShowBanner(false)}>
                   Settings saved successfully!
                 </Banner>
               </Box>
             )}

             {/* Tab 0: General Settings */}
             {selectedTab === 0 && (
                <BlockStack gap="500">
                    <Layout.AnnotatedSection title="App status" description="Globally turn on or turn off linked options.">
                        <Card>
                        <InlineStack align="space-between" blockAlign="center">
                            <InlineStack gap="200" blockAlign="center">
                            <Text variant="bodyMd">App enabled</Text>
                            <Badge tone={settings.appEnabled ? "success" : "attention"}>{settings.appEnabled ? "On" : "Off"}</Badge>
                            </InlineStack>
                            <Button 
                            tone={settings.appEnabled ? "critical" : "primary"} 
                            variant="secondary"
                            onClick={() => handleSettingChange("appEnabled", !settings.appEnabled)}
                            >
                            {settings.appEnabled ? "Turn off" : "Turn on"}
                            </Button>
                        </InlineStack>
                        </Card>
                    </Layout.AnnotatedSection>

                    <Layout.AnnotatedSection title="Show options on product cards" description="Product cards include those on collection pages, featured products, recommended products, and more.">
                        <Card>
                        <BlockStack gap="400">
                            <Checkbox
                            label="Show options on product cards in collections and grids"
                            checked={settings.showOnProductCards}
                            onChange={(value) => handleSettingChange("showOnProductCards", value)}
                            helpText={
                                <Text variant="bodySm" tone="subdued">
                                Customize option styles in <a href="/app/option-styles">Option styles {'>'} Customize options on product cards</a>
                                </Text>
                            }
                            />
                            {settings.showOnProductCards && (
                            <Box paddingInlineStart="600">
                                <BlockStack gap="200">
                                <Text variant="bodyMd">Apply to these pages</Text>
                                <Grid>
                                    <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3 }}>
                                    <Checkbox label="Collection" checked={settings.applyToCollection} onChange={(v) => handleSettingChange("applyToCollection", v)} />
                                    </Grid.Cell>
                                    <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3 }}>
                                    <Checkbox label="Search" checked={settings.applyToSearch} onChange={(v) => handleSettingChange("applyToSearch", v)} />
                                    </Grid.Cell>
                                    <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3 }}>
                                    <Checkbox label="Home" checked={settings.applyToHome} onChange={(v) => handleSettingChange("applyToHome", v)} />
                                    </Grid.Cell>
                                </Grid>
                                </BlockStack>
                            </Box>
                            )}
                            <Checkbox label="Hide multi-option groups on product cards" checked={settings.hideMultiOptionOnCards} onChange={(v) => handleSettingChange("hideMultiOptionOnCards", v)} />
                        </BlockStack>
                        </Card>
                    </Layout.AnnotatedSection>

                    <Layout.AnnotatedSection title="Hide inaccessible storefront products">
                        <Card>
                        <BlockStack gap="300">
                            <Checkbox label="Hide inaccessible products" checked={settings.hideInaccessible} onChange={(v) => handleSettingChange("hideInaccessible", v)} helpText="Automatically hides draft, archived, or unpublished products from groups." />
                            <Checkbox label="Remove archived products" checked={settings.removeArchived} onChange={(v) => handleSettingChange("removeArchived", v)} helpText="Automatically removes archived products from groups." />
                        </BlockStack>
                        </Card>
                    </Layout.AnnotatedSection>

                    <Layout.AnnotatedSection title="Notification email">
                        <Card><TextField label="Notification email address" value={settings.notificationEmail || ""} onChange={(v) => handleSettingChange("notificationEmail", v)} placeholder="support@example.com" autoComplete="email" /></Card>
                    </Layout.AnnotatedSection>

                    <Layout.AnnotatedSection title="Customize CSS">
                        <Card>
                        <BlockStack gap="400">
                            <TextField label="Custom CSS for product page" value={settings.customCssProduct} onChange={(v) => handleSettingChange("customCssProduct", v)} multiline={4} autoComplete="off" />
                            <TextField label="Custom CSS for collection page" value={settings.customCssCollection} onChange={(v) => handleSettingChange("customCssCollection", v)} multiline={6} autoComplete="off" />
                        </BlockStack>
                        </Card>
                    </Layout.AnnotatedSection>
                </BlockStack>
             )}

             {/* Tab 1: Theme Setup */}
             {selectedTab === 1 && (
                <BlockStack gap="500">
                    <Layout.AnnotatedSection title="App Embed" description="The app must be enabled in your theme settings to display linked options.">
                        <Card>
                        <BlockStack gap="400">
                            <Box padding="400" background="bg-surface-info-secondary" borderRadius="200">
                            <InlineStack gap="300" blockAlign="center"><Icon source={AlertCircleIcon} tone="info" /><Text variant="bodyMd" fontWeight="semibold">Required Action</Text></InlineStack>
                            <Box paddingBlockStart="200"><Text variant="bodyMd">You must enable the app embed in your Shopify Theme Editor for the app to work.</Text></Box>
                            </Box>
                            <Button primary url="https://admin.shopify.com/store/current/themes/current/editor?context=apps" target="_blank">Open Theme Editor</Button>
                        </BlockStack>
                        </Card>
                    </Layout.AnnotatedSection>
                </BlockStack>
             )}

             {/* Tab 2: Translation */}
             {selectedTab === 2 && (
                <BlockStack gap="500">
                <Layout.AnnotatedSection title="Storefront labels" description="Translate or customize labels displayed on your store.">
                    <Card>
                    <BlockStack gap="400">
                        <TextField label="Select option label" value={settings.selectOptionLabel} onChange={(v) => handleSettingChange("selectOptionLabel", v)} helpText="Use {option} as a placeholder for the option name (e.g. Color)." autoComplete="off" />
                        <TextField label="Sold out label" value={settings.soldOutLabel} onChange={(v) => handleSettingChange("soldOutLabel", v)} autoComplete="off" />
                        <TextField label="Unavailable label" value={settings.unavailableLabel} onChange={(v) => handleSettingChange("unavailableLabel", v)} autoComplete="off" />
                    </BlockStack>
                    </Card>
                </Layout.AnnotatedSection>
                </BlockStack>
             )}
          </Box>
        </Tabs>
      </BlockStack>
    </Page>
  );
}

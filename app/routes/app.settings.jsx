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
  Popover,
  ColorPicker,
} from "@shopify/polaris";
import {
  SettingsIcon,
  CheckCircleIcon,
  ExternalIcon,
  LanguageIcon,
  AlertCircleIcon,
} from "@shopify/polaris-icons";
import { TitleBar } from "@shopify/app-bridge-react";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";

// Color conversion helpers moved outside for maximum stability
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

// Stable ColorPickerPopover as a standalone component
const ColorPickerPopover = ({ color, onChange, radius = '4px', label }) => {
    const [active, setActive] = useState(false);
    const toggleActive = useCallback(() => setActive((active) => !active), []);
    const hsb = useMemo(() => hexToHsb(color || '#000000'), [color]);
    
    return (
        <BlockStack gap="200">
            {label && <Text variant="bodyMd">{label}</Text>}
            <Popover
                active={active}
                activator={
                    <div 
                        onClick={toggleActive}
                        style={{ 
                            padding: '6px',
                            border: '1px solid #dcdcdc',
                            borderRadius: radius,
                            cursor: 'pointer',
                            background: '#fff',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            minWidth: '120px'
                        }}
                    >
                        <div style={{ 
                            width: '24px', 
                            height: '24px', 
                            borderRadius: '2px', 
                            background: color || '#000000',
                            border: '1px solid rgba(0,0,0,0.1)'
                        }} />
                        <span style={{ fontSize: '13px', color: '#666', fontFamily: 'monospace' }}>{color || '#000000'}</span>
                    </div>
                }
                onClose={toggleActive}
            >
                <Box padding="300">
                    <BlockStack gap="300">
                        <ColorPicker onChange={(newHsb) => onChange(hsbToHex(newHsb))} color={hsb} allowAlpha={false} />
                        <TextField
                            label="HEX"
                            labelHidden
                            value={color || '#000000'}
                            onChange={onChange}
                            autoComplete="off"
                        />
                    </BlockStack>
                </Box>
            </Popover>
        </BlockStack>
    );
};

export const loader = async ({ request }) => {
  const { authenticate } = await import("../shopify.server");
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
      id: "visual-styles",
      content: (
        <InlineStack gap="200" align="start" blockAlign="center">
          <Icon source={CheckCircleIcon} />
          <span>Visual Styles</span>
        </InlineStack>
      ),
      panelID: "visual-styles-panel",
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

             {/* Tab 1: Visual Styles */}
             {selectedTab === 1 && (
                <BlockStack gap="500">
                    <Layout.AnnotatedSection title="Swatch & Image Sizes">
                        <Card>
                        <BlockStack gap="400">
                            <Grid>
                            <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 6, lg: 6 }}>
                                <TextField id="swatchSize" label="Swatch/Image size (px)" type="number" value={settings.swatchSize?.toString() || ""} onChange={(v) => handleSettingChange("swatchSize", v === "" ? "" : parseInt(v))} autoComplete="off" />
                            </Grid.Cell>
                            <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 6, lg: 6 }}>
                                <TextField id="itemsGap" label="Gap between items (px)" type="number" value={settings.itemsGap?.toString() || ""} onChange={(v) => handleSettingChange("itemsGap", v === "" ? "" : parseInt(v))} autoComplete="off" />
                            </Grid.Cell>
                            </Grid>
                        </BlockStack>
                        </Card>
                    </Layout.AnnotatedSection>

                    <Layout.AnnotatedSection title="Borders & Radius">
                        <Card>
                        <BlockStack gap="400">
                            <Grid>
                            <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 4, lg: 4 }}>
                                <TextField id="borderRadius" label="Border radius (px)" type="number" value={settings.borderRadius?.toString() || ""} onChange={(v) => handleSettingChange("borderRadius", v === "" ? "" : parseInt(v))} autoComplete="off" />
                            </Grid.Cell>
                            <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 4, lg: 4 }}>
                                <TextField id="borderWidth" label="Border width (px)" type="number" value={settings.borderWidth?.toString() || ""} onChange={(v) => handleSettingChange("borderWidth", v === "" ? "" : parseInt(v))} autoComplete="off" />
                            </Grid.Cell>
                            <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 4, lg: 4 }}>
                                <div style={{ paddingTop: '24px' }}>
                                    <Checkbox label="Show option name label" checked={settings.showOptionName} onChange={(v) => handleSettingChange("showOptionName", v)} />
                                </div>
                            </Grid.Cell>
                            </Grid>
                            <Grid>
                            <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 6, lg: 6 }}>
                                <ColorPickerPopover label="Default border color" color={settings.borderColor} onChange={(v) => handleSettingChange("borderColor", v)} />
                            </Grid.Cell>
                            <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 6, lg: 6 }}>
                                <ColorPickerPopover label="Selected border color" color={settings.selectedBorderColor} onChange={(v) => handleSettingChange("selectedBorderColor", v)} />
                            </Grid.Cell>
                            </Grid>
                        </BlockStack>
                        </Card>
                    </Layout.AnnotatedSection>

                    <Layout.AnnotatedSection title="Text Block Styles">
                        <Card>
                        <BlockStack gap="400">
                            <Grid>
                            <Grid.Cell columnSpan={{ xs: 6, sm: 4, md: 4, lg: 4 }}>
                                <TextField id="blockPaddingX" label="Padding X" type="number" value={settings.blockPaddingX?.toString() || ""} onChange={(v) => handleSettingChange("blockPaddingX", v === "" ? "" : parseInt(v))} autoComplete="off" />
                            </Grid.Cell>
                            <Grid.Cell columnSpan={{ xs: 6, sm: 4, md: 4, lg: 4 }}>
                                <TextField id="blockPaddingY" label="Padding Y" type="number" value={settings.blockPaddingY?.toString() || ""} onChange={(v) => handleSettingChange("blockPaddingY", v === "" ? "" : parseInt(v))} autoComplete="off" />
                            </Grid.Cell>
                            <Grid.Cell columnSpan={{ xs: 6, sm: 4, md: 4, lg: 4 }}>
                                <TextField id="blockFontSize" label="Font size" type="number" value={settings.blockFontSize?.toString() || ""} onChange={(v) => handleSettingChange("blockFontSize", v === "" ? "" : parseInt(v))} autoComplete="off" />
                            </Grid.Cell>
                            </Grid>
                            <Grid>
                            <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3 }}>
                                <ColorPickerPopover label="BG color" color={settings.blockBgColor} onChange={(v) => handleSettingChange("blockBgColor", v)} />
                            </Grid.Cell>
                            <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3 }}>
                                <ColorPickerPopover label="Text color" color={settings.blockTextColor} onChange={(v) => handleSettingChange("blockTextColor", v)} />
                            </Grid.Cell>
                            <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3 }}>
                                <ColorPickerPopover label="Selected BG" color={settings.selectedBgColor} onChange={(v) => handleSettingChange("selectedBgColor", v)} />
                            </Grid.Cell>
                            <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3 }}>
                                <ColorPickerPopover label="Selected Text" color={settings.selectedTextColor} onChange={(v) => handleSettingChange("selectedTextColor", v)} />
                            </Grid.Cell>
                            </Grid>
                        </BlockStack>
                        </Card>
                    </Layout.AnnotatedSection>
                </BlockStack>
             )}

             {/* Tab 2: Theme Setup */}
             {selectedTab === 2 && (
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

             {/* Tab 3: Translation */}
             {selectedTab === 3 && (
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

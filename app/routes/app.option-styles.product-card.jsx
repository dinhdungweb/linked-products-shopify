import { useState, useCallback, useEffect } from "react";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation, useActionData, useSearchParams } from "@remix-run/react";
import {
  Page,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Box,
  TextField,
  Checkbox,
  Button,
  Icon,
  Divider,
  RangeSlider,
  ButtonGroup,
  Select,
  Tabs,
  Banner,
  Link,
  Tooltip,
  Grid,
} from "@shopify/polaris";
import {
  InfoIcon,
} from "@shopify/polaris-icons";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";
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

  const appSettings = await prisma.appSetting.findUnique({
    where: { shop },
  }) || await prisma.appSetting.create({ data: { shop } });

  const styleIds = ["button_card", "color_swatch_card", "image_swatch_card", "dropdown_card"];
  const styleSettings = await prisma.optionStyleSetting.findMany({
    where: { shop, styleId: { in: styleIds } },
  });

  const formattedStyles = styleIds.reduce((acc, id) => {
    const found = styleSettings.find(s => s.styleId === id);
    let settings = found?.settings || DEFAULT_SETTINGS_BY_STYLE[id] || BASE_SETTINGS;
    
    // Self-healing migration
    if (settings.swatch?.size && !settings.basic?.swatchSize) {
      settings = {
        ...settings,
        basic: { ...settings.basic, swatchSize: settings.swatch.size },
      };
    }
    if (settings.swatch?.padding !== undefined && settings.basic?.padding === undefined) {
      settings = {
        ...settings,
        basic: { ...settings.basic, padding: settings.swatch.padding },
      };
    }
    
    acc[id] = settings;
    return acc;
  }, {});

  return json({ shop, appSettings, styleSettings: formattedStyles });
};

export const action = async ({ request }) => {
  const { authenticate } = await import("../shopify.server");
  const { default: prisma } = await import("../db.server");
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();
  
  try {
    const appSettings = JSON.parse(formData.get("appSettings"));
    const styleSettings = JSON.parse(formData.get("styleSettings"));

    // Save AppSetting
    await prisma.appSetting.update({
      where: { shop },
      data: {
        cardAlign: appSettings.cardAlign,
        cardMarginTop: parseInt(appSettings.cardMarginTop),
        cardMarginBottom: parseInt(appSettings.cardMarginBottom),
        cardDisplayMode: appSettings.cardDisplayMode,
        cardShowLabel: appSettings.cardShowLabel,
      }
    });

    // Save each style
    for (const [styleId, settings] of Object.entries(styleSettings)) {
      await prisma.optionStyleSetting.upsert({
        where: { shop_styleId: { shop, styleId } },
        update: { settings },
        create: { shop, styleId, settings },
      });
    }

    // Sync to metafields (Simplified for demo)
    const shopData = await admin.graphql(`{ shop { id } }`);
    const shopJson = await shopData.json();
    const shopId = shopJson.data.shop.id;

    // Get existing style_customizations
    const metafieldQuery = await admin.graphql(`query { shop { metafield(namespace: "linked_products", key: "style_customizations") { value } } }`);
    const metafieldResult = await metafieldQuery.json();
    let allStyles = JSON.parse(metafieldResult.data.shop.metafield?.value || "{}");
    
    // Merge new card styles
    Object.assign(allStyles, styleSettings);

    await admin.graphql(`
      mutation setMetafields($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) { userErrors { field message } }
      }
    `, {
      variables: {
        metafields: [
          {
            namespace: "linked_products",
            key: "style_customizations",
            type: "json",
            ownerId: shopId,
            value: JSON.stringify(allStyles)
          },
          {
            namespace: "linked_products",
            key: "app_settings",
            type: "json",
            ownerId: shopId,
            value: JSON.stringify({
                cardAlign: appSettings.cardAlign,
                cardMarginTop: appSettings.cardMarginTop,
                cardMarginBottom: appSettings.cardMarginBottom,
                cardDisplayMode: appSettings.cardDisplayMode,
                cardShowLabel: appSettings.cardShowLabel,
            })
          }
        ]
      }
    });

    return json({ success: true, message: "Settings saved successfully" });
  } catch (error) {
    console.error("Save card settings error:", error);
    return json({ success: false, error: error.message });
  }
};

export default function ProductCardCustomizer() {
  const { appSettings: initialApp, styleSettings: initialStyles } = useLoaderData();
  const [searchParams] = useSearchParams();
  const [selectedTab, setSelectedTab] = useState(0);
  const [appSettings, setAppSettings] = useState(initialApp);
  const [styleSettings, setStyleSettings] = useState(initialStyles);
  
  const submit = useSubmit();
  const navigation = useNavigation();
  const shopify = useAppBridge();
  const actionData = useActionData();
  const isLoading = navigation.state !== "idle";

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab === "color_swatch_card") setSelectedTab(1);
    else if (tab === "image_swatch_card") setSelectedTab(2);
    else if (tab === "dropdown_card") setSelectedTab(3);
    else if (tab === "button_card") setSelectedTab(4);
  }, [searchParams]);

  useEffect(() => {
    if (actionData?.success) shopify.toast.show(actionData.message);
    else if (actionData?.error) shopify.toast.show(actionData.error, { isError: true });
  }, [actionData, shopify]);

  const handleTabChange = useCallback((index) => setSelectedTab(index), []);

  const handleAppUpdate = (key, value) => {
    setAppSettings(prev => ({ ...prev, [key]: value }));
  };

  const handleStyleUpdate = (styleId, section, key, value) => {
    setStyleSettings(prev => ({
      ...prev,
      [styleId]: {
        ...prev[styleId],
        [section]: {
          ...prev[styleId][section],
          [key]: value
        }
      }
    }));
  };

  const handleSave = () => {
    const formData = new FormData();
    formData.append("appSettings", JSON.stringify(appSettings));
    formData.append("styleSettings", JSON.stringify(styleSettings));
    submit(formData, { method: "POST" });
  };

  const tabs = [
    { id: 'general', content: 'General', panelID: 'general' },
    { id: 'color', content: 'Color Swatch', panelID: 'color' },
    { id: 'image', content: 'Image Swatch', panelID: 'image' },
    { id: 'dropdown', content: 'Dropdown', panelID: 'dropdown' },
    { id: 'button', content: 'Button', panelID: 'button' },
  ];

  const renderGeneralTab = () => (
    <BlockStack gap="400">
      <BlockStack gap="200">
        <Text variant="bodyMd">Align</Text>
        <ButtonGroup variant="segmented">
          <Button pressed={appSettings.cardAlign === "left"} onClick={() => handleAppUpdate('cardAlign', 'left')}>Left</Button>
          <Button pressed={appSettings.cardAlign === "center"} onClick={() => handleAppUpdate('cardAlign', 'center')}>Center</Button>
          <Button pressed={appSettings.cardAlign === "right"} onClick={() => handleAppUpdate('cardAlign', 'right')}>Right</Button>
        </ButtonGroup>
      </BlockStack>

      <RangeSlider 
        label={`Margin top (${appSettings.cardMarginTop}px)`} 
        value={appSettings.cardMarginTop} 
        onChange={(v) => handleAppUpdate('cardMarginTop', v)} 
        min={0} max={30} output
      />
      <RangeSlider 
        label={`Margin bottom (${appSettings.cardMarginBottom}px)`} 
        value={appSettings.cardMarginBottom} 
        onChange={(v) => handleAppUpdate('cardMarginBottom', v)} 
        min={0} max={30} output
      />

      <BlockStack gap="200">
        <Text variant="bodyMd">Display as</Text>
        <ButtonGroup variant="segmented">
          <Button pressed={appSettings.cardDisplayMode === "swatches"} onClick={() => handleAppUpdate('cardDisplayMode', 'swatches')}>Swatches</Button>
          <Button pressed={appSettings.cardDisplayMode === "count"} onClick={() => handleAppUpdate('cardDisplayMode', 'count')}>Count only</Button>
        </ButtonGroup>
      </BlockStack>

      <InlineStack align="space-between">
        <Text variant="bodyMd">Show label</Text>
        <Checkbox label="" labelHidden checked={appSettings.cardShowLabel} onChange={(v) => handleAppUpdate('cardShowLabel', v)} />
      </InlineStack>
    </BlockStack>
  );

  const renderSwatchTab = (styleId) => {
    const s = styleSettings[styleId];
    return (
      <BlockStack gap="400">
        <Grid>
            <Grid.Cell columnSpan={{xs: 6}}><TextField type="number" label="Limit (Desktop)" value={s.basic.limitDesktop || 5} onChange={(v) => handleStyleUpdate(styleId, 'basic', 'limitDesktop', v)} autoComplete="off" /></Grid.Cell>
            <Grid.Cell columnSpan={{xs: 6}}><TextField type="number" label="Limit (Mobile)" value={s.basic.limitMobile || 5} onChange={(v) => handleStyleUpdate(styleId, 'basic', 'limitMobile', v)} autoComplete="off" /></Grid.Cell>
        </Grid>

        <BlockStack gap="200">
            <Text variant="bodyMd">Style</Text>
            <ButtonGroup variant="segmented">
                <Button pressed={s.border.radius > 4} onClick={() => handleStyleUpdate(styleId, 'border', 'radius', 20)}>Round</Button>
                <Button pressed={s.border.radius <= 4} onClick={() => handleStyleUpdate(styleId, 'border', 'radius', 0)}>Square</Button>
            </ButtonGroup>
        </BlockStack>

        <RangeSlider label={`Size (${s.basic.swatchSize || s.swatch?.size || 24}px)`} value={s.basic.swatchSize || s.swatch?.size || 24} onChange={(v) => handleStyleUpdate(styleId, 'basic', 'swatchSize', v)} min={14} max={50} output />
        <RangeSlider label={`Padding (${s.basic.padding ?? s.swatch?.padding ?? 0}px)`} value={s.basic.padding ?? s.swatch?.padding ?? 0} onChange={(v) => handleStyleUpdate(styleId, 'basic', 'padding', v)} min={0} max={4} output />
        <RangeSlider label={`Border thickness (${s.border.width}px)`} value={s.border.width} onChange={(v) => handleStyleUpdate(styleId, 'border', 'width', v)} min={0} max={4} output />

        <Text variant="bodyMd" fontWeight="semibold">Border color</Text>
        <Grid>
            <Grid.Cell columnSpan={{xs: 4}}><TextField label="Normal" value={s.border.color} onChange={(v) => handleStyleUpdate(styleId, 'border', 'color', v)} autoComplete="off" /></Grid.Cell>
            <Grid.Cell columnSpan={{xs: 4}}><TextField label="Active" value={s.border.activeColor} onChange={(v) => handleStyleUpdate(styleId, 'border', 'activeColor', v)} autoComplete="off" /></Grid.Cell>
            <Grid.Cell columnSpan={{xs: 4}}><TextField label="Hover" value={s.border.hoverColor || "#5f6772"} onChange={(v) => handleStyleUpdate(styleId, 'border', 'hoverColor', v)} autoComplete="off" /></Grid.Cell>
        </Grid>

        {styleId.includes('color') && (
            <BlockStack gap="200">
                <Text variant="bodyMd">Two color style</Text>
                <ButtonGroup variant="segmented" fullWidth>
                    {['L/R', 'LT/RB', 'T/B', 'LB/RT'].map(type => (
                        <Button key={type} pressed={s.basic.twoColorStyle === type} onClick={() => handleStyleUpdate(styleId, 'basic', 'twoColorStyle', type)}>{type}</Button>
                    ))}
                </ButtonGroup>
            </BlockStack>
        )}

        <BlockStack gap="200">
            <Text variant="bodyMd">Tooltips</Text>
            <ButtonGroup variant="segmented">
                <Button pressed={s.basic.tooltips !== false} onClick={() => handleStyleUpdate(styleId, 'basic', 'tooltips', true)}>Yes</Button>
                <Button pressed={s.basic.tooltips === false} onClick={() => handleStyleUpdate(styleId, 'basic', 'tooltips', false)}>No</Button>
            </ButtonGroup>
        </BlockStack>

        <Select 
            label="Unavailable style" 
            options={[
                {label: 'None', value: 'none'},
                {label: 'Hide', value: 'hide'},
                {label: 'Gray', value: 'gray'},
                {label: 'Overlay', value: 'overlay'},
                {label: 'Cross mark', value: 'cross_mark'}
            ]}
            value={s.basic.unavailableStyle || "cross_mark"}
            onChange={(v) => handleStyleUpdate(styleId, 'basic', 'unavailableStyle', v)}
        />
      </BlockStack>
    );
  };

  const renderDropdownTab = () => {
    const s = styleSettings["dropdown_card"];
    return (
        <BlockStack gap="400">
            <RangeSlider label={`Padding (${s.basic.padding || 8}px)`} value={s.basic.padding || 8} onChange={(v) => handleStyleUpdate("dropdown_card", 'basic', 'padding', v)} min={4} max={20} output />
            
            <Text variant="bodyMd" fontWeight="semibold">Background color</Text>
            <Grid>
                <Grid.Cell columnSpan={{xs: 6}}><TextField label="Normal" value={s.basic.bgColor || "#FFFFFF"} onChange={(v) => handleStyleUpdate("dropdown_card", 'basic', 'bgColor', v)} autoComplete="off" /></Grid.Cell>
                <Grid.Cell columnSpan={{xs: 6}}><TextField label="Active" value={s.basic.bgColorActive || "#eee"} onChange={(v) => handleStyleUpdate("dropdown_card", 'basic', 'bgColorActive', v)} autoComplete="off" /></Grid.Cell>
            </Grid>

            <Text variant="bodyMd" fontWeight="semibold">Text color</Text>
            <Grid>
                <Grid.Cell columnSpan={{xs: 6}}><TextField label="Normal" value={s.label.color} onChange={(v) => handleStyleUpdate("dropdown_card", 'label', 'color', v)} autoComplete="off" /></Grid.Cell>
                <Grid.Cell columnSpan={{xs: 6}}><TextField label="Active" value={s.label.colorActive || "#202020"} onChange={(v) => handleStyleUpdate("dropdown_card", 'label', 'colorActive', v)} autoComplete="off" /></Grid.Cell>
            </Grid>

            <RangeSlider label={`Border thickness (${s.border.width}px)`} value={s.border.width} onChange={(v) => handleStyleUpdate("dropdown_card", 'border', 'width', v)} min={1} max={4} output />
            <TextField label="Border color" value={s.border.color} onChange={(v) => handleStyleUpdate("dropdown_card", 'border', 'color', v)} autoComplete="off" />
        </BlockStack>
    );
  };

  const renderButtonTab = () => {
    const s = styleSettings["button_card"];
    return (
        <BlockStack gap="400">
            <BlockStack gap="200">
                <Text variant="bodyMd">Style</Text>
                <ButtonGroup variant="segmented">
                    <Button pressed={s.border.radius > 4} onClick={() => handleStyleUpdate("button_card", 'border', 'radius', 20)}>Round</Button>
                    <Button pressed={s.border.radius <= 4} onClick={() => handleStyleUpdate("button_card", 'border', 'radius', 0)}>Square</Button>
                </ButtonGroup>
            </BlockStack>
            <RangeSlider label={`Padding (${s.basic.padding}px)`} value={s.basic.padding} onChange={(v) => handleStyleUpdate("button_card", 'basic', 'padding', v)} min={1} max={18} output />
            <RangeSlider label={`Border thickness (${s.border.width}px)`} value={s.border.width} onChange={(v) => handleStyleUpdate("button_card", 'border', 'width', v)} min={1} max={4} output />
            
            <Text variant="bodyMd" fontWeight="semibold">Border color</Text>
            <Grid>
                <Grid.Cell columnSpan={{xs: 4}}><TextField label="Normal" value={s.border.color} onChange={(v) => handleStyleUpdate("button_card", 'border', 'color', v)} autoComplete="off" /></Grid.Cell>
                <Grid.Cell columnSpan={{xs: 4}}><TextField label="Active" value={s.border.activeColor} onChange={(v) => handleStyleUpdate("button_card", 'border', 'activeColor', v)} autoComplete="off" /></Grid.Cell>
                <Grid.Cell columnSpan={{xs: 4}}><TextField label="Hover" value={s.border.hoverColor || "#4f5354"} onChange={(v) => handleStyleUpdate("button_card", 'border', 'hoverColor', v)} autoComplete="off" /></Grid.Cell>
            </Grid>

            <Text variant="bodyMd" fontWeight="semibold">Button color</Text>
            <Grid>
                <Grid.Cell columnSpan={{xs: 6}}><TextField label="Normal" value={s.basic.buttonColor || "#FFFFFF"} onChange={(v) => handleStyleUpdate("button_card", 'basic', 'buttonColor', v)} autoComplete="off" /></Grid.Cell>
                <Grid.Cell columnSpan={{xs: 6}}><TextField label="Active" value={s.basic.buttonColorActive || "#FFFFFF"} onChange={(v) => handleStyleUpdate("button_card", 'basic', 'buttonColorActive', v)} autoComplete="off" /></Grid.Cell>
            </Grid>
        </BlockStack>
    );
  };

  const activeStyleId = [
    null,
    "color_swatch_card",
    "image_swatch_card",
    "dropdown_card",
    "button_card"
  ][selectedTab];

  const activeSettings = activeStyleId ? styleSettings[activeStyleId] : null;

  return (
    <Page
      backAction={{ content: 'Option styles', url: '/app/option-styles' }}
      title="Customize option on product card"
      primaryAction={{ content: 'Save', onClick: handleSave, loading: isLoading }}
    >
      <TitleBar title="Customize option on product card" />
      
      <BlockStack gap="400">
        <Banner icon={InfoIcon}>
          <Text variant="bodyMd">Product card options are disabled by default. To enable them, go to <Link url="/app/settings">Settings &gt; Show options on product cards</Link> to configure options.</Text>
        </Banner>

        <Card padding="0">
            <Box padding="400">
                <Text variant="headingMd">Customize collection option</Text>
            </Box>
            <Divider />
            <Tabs tabs={tabs} selected={selectedTab} onSelect={handleTabChange} fitted />
            
            <div style={{ display: 'flex', minHeight: '500px' }}>
                {/* Left: Settings */}
                <div style={{ width: '450px', borderRight: '1px solid #e1e3e5', padding: '24px', maxHeight: '800px', overflowY: 'auto' }}>
                    {selectedTab === 0 && renderGeneralTab()}
                    {selectedTab === 1 && renderSwatchTab("color_swatch_card")}
                    {selectedTab === 2 && renderSwatchTab("image_swatch_card")}
                    {selectedTab === 3 && renderDropdownTab()}
                    {selectedTab === 4 && renderButtonTab()}
                </div>

                {/* Right: Preview */}
                <div style={{ flex: 1, backgroundColor: '#f9f9f9', padding: '40px', display: 'flex', justifyContent: 'center', alignItems: 'flex-start' }}>
                    <div style={{ width: '320px', backgroundColor: '#fff', border: '1px solid #eee', borderRadius: '4px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
                        <img src="https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-image_large.png?format=webp&v=1530129081" alt="" style={{ width: '100%', aspectRatio: '1/1', objectFit: 'cover' }} />
                        <BlockStack gap="100">
                            <Text variant="bodySm" tone="subdued">T-Shirts Student Casual Good Collocation Tee 100% Cotton</Text>
                            <Text variant="headingSm">$50.00 USD</Text>
                        </BlockStack>
                        
                        {/* Swatches Container with General Settings */}
                        <div style={{ 
                            marginTop: `${appSettings.cardMarginTop}px`, 
                            marginBottom: `${appSettings.cardMarginBottom}px`,
                            display: 'flex',
                            justifyContent: appSettings.cardAlign === 'center' ? 'center' : appSettings.cardAlign === 'right' ? 'flex-end' : 'flex-start'
                        }}>
                            {activeStyleId ? (
                                <PreviewRenderer 
                                    styleId={activeStyleId} 
                                    settings={activeSettings} 
                                    appSettings={appSettings} isCard={true}
                                />
                            ) : (
                                <PreviewRenderer 
                                    styleId="color_swatch_card" 
                                    settings={styleSettings["color_swatch_card"]} 
                                    appSettings={appSettings} isCard={true}
                                />
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </Card>
      </BlockStack>
    </Page>
  );
}


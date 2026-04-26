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
  Divider,
  RangeSlider,
  ButtonGroup,
  Select,
  Tabs,
  Banner,
  Link,
  Grid,
  Popover,
  ColorPicker,
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
import { PRODUCT_PAGE_STYLE_IDS } from "../utils/style-mapping";
import { syncShopSettingsMetafields } from "../settings-sync.server";

const normalizeCardSettings = (settings) => {
  const twoColorMap = { "L/R": "L_R", "LT/RB": "LT_RB", "T/B": "T_B", "LB/RT": "LB_RT" };
  const unavailableStyle = settings.unavailable?.style || settings.basic?.unavailableStyle;
  const blockBg = settings.basic?.blockBg || settings.basic?.buttonColor;
  const blockBgActive = settings.basic?.blockBgActive || settings.basic?.buttonColorActive;
  const blockBgHover = settings.basic?.blockBgHover || settings.basic?.buttonColorHover;
  const labelActiveColor = settings.label?.activeColor || settings.label?.colorActive;

  return {
    ...settings,
    basic: {
      ...settings.basic,
      ...(settings.basic?.twoColorStyle ? { twoColorStyle: twoColorMap[settings.basic.twoColorStyle] || settings.basic.twoColorStyle } : {}),
      ...(unavailableStyle ? { unavailableStyle } : {}),
      ...(blockBg ? { blockBg } : {}),
      ...(blockBgActive ? { blockBgActive } : {}),
      ...(blockBgHover ? { blockBgHover } : {}),
    },
    label: {
      ...(settings.label || {}),
      ...(labelActiveColor ? { activeColor: labelActiveColor } : {}),
    },
    unavailable: {
      ...(settings.unavailable || {}),
      ...(unavailableStyle ? { style: unavailableStyle } : {}),
    },
  };
};

const normalizeHex = (value, fallback = "#000000") => {
  const raw = String(value || fallback).trim();
  const withHash = raw.startsWith("#") ? raw : `#${raw}`;

  if (/^#[0-9a-f]{3}$/i.test(withHash)) {
    return `#${withHash.slice(1).split("").map((char) => `${char}${char}`).join("")}`.toUpperCase();
  }

  if (/^#[0-9a-f]{6}$/i.test(withHash)) {
    return withHash.toUpperCase();
  }

  return fallback.toUpperCase();
};

const hexToHsb = (value) => {
  const hex = normalizeHex(value).slice(1);
  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  let hue = 0;
  if (delta !== 0) {
    if (max === r) hue = 60 * (((g - b) / delta) % 6);
    else if (max === g) hue = 60 * ((b - r) / delta + 2);
    else hue = 60 * ((r - g) / delta + 4);
  }

  return {
    hue: hue < 0 ? hue + 360 : hue,
    saturation: max === 0 ? 0 : delta / max,
    brightness: max,
  };
};

const hsbToHex = ({ hue, saturation, brightness }) => {
  const chroma = brightness * saturation;
  const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = brightness - chroma;
  let r = 0;
  let g = 0;
  let b = 0;

  if (hue < 60) [r, g, b] = [chroma, x, 0];
  else if (hue < 120) [r, g, b] = [x, chroma, 0];
  else if (hue < 180) [r, g, b] = [0, chroma, x];
  else if (hue < 240) [r, g, b] = [0, x, chroma];
  else if (hue < 300) [r, g, b] = [x, 0, chroma];
  else [r, g, b] = [chroma, 0, x];

  return `#${[r, g, b]
    .map((channel) => Math.round((channel + m) * 255).toString(16).padStart(2, "0"))
    .join("")}`.toUpperCase();
};

function ColorField({ label, value, fallback = "#000000", onChange }) {
  const [active, setActive] = useState(false);
  const hex = normalizeHex(value, fallback);

  const activator = (
    <button
      type="button"
      onClick={() => setActive((open) => !open)}
      style={{
        width: "100%",
        minHeight: "38px",
        padding: "8px 10px",
        border: "1px solid #8c9196",
        borderRadius: "6px",
        background: "#ffffff",
        display: "flex",
        alignItems: "center",
        gap: "8px",
        cursor: "pointer",
        textAlign: "left",
      }}
    >
      <span
        style={{
          width: "18px",
          height: "18px",
          borderRadius: "4px",
          border: "1px solid rgba(0,0,0,0.2)",
          background: hex,
          flexShrink: 0,
        }}
      />
      <span style={{ flex: 1, fontSize: "13px" }}>{label}</span>
      <span style={{ fontSize: "12px", color: "#6d7175", fontFamily: "monospace" }}>{hex}</span>
    </button>
  );

  return (
    <Popover active={active} activator={activator} onClose={() => setActive(false)}>
      <Box padding="300">
        <ColorPicker color={hexToHsb(hex)} onChange={(color) => onChange(hsbToHex(color))} />
      </Box>
    </Popover>
  );
}

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
    settings = normalizeCardSettings(settings);
    
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
    const updatedAppSettings = await prisma.appSetting.update({
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
      const normalizedSettings = normalizeCardSettings(settings);
      if (normalizedSettings.basic?.limitDesktop) normalizedSettings.basic.limitDesktop = parseInt(normalizedSettings.basic.limitDesktop);
      if (normalizedSettings.basic?.limitMobile) normalizedSettings.basic.limitMobile = parseInt(normalizedSettings.basic.limitMobile);

      await prisma.optionStyleSetting.upsert({
        where: { shop_styleId: { shop, styleId } },
        update: { settings: normalizedSettings },
        create: { shop, styleId, settings: normalizedSettings },
      });

      styleSettings[styleId] = normalizedSettings;
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

    const productPageStyles = await prisma.optionStyleSetting.findMany({
      where: { shop, styleId: { in: PRODUCT_PAGE_STYLE_IDS } },
    });
    const restoredPageStyleIds = new Set();
    for (const style of productPageStyles) {
      allStyles[style.styleId] = style.settings;
      restoredPageStyleIds.add(style.styleId);
    }

    for (const styleId of PRODUCT_PAGE_STYLE_IDS) {
      if (!restoredPageStyleIds.has(styleId) && allStyles[styleId]?.basic?.limitDesktop !== undefined) {
        delete allStyles[styleId];
      }
    }

    delete allStyles.swatch;
    delete allStyles.pill;

    const metafieldsResponse = await admin.graphql(`
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
          }
        ]
      }
    });

    const metafieldsResult = await metafieldsResponse.json();
    const metafieldsErrors = metafieldsResult.data?.metafieldsSet?.userErrors || [];
    if (metafieldsErrors.length > 0) {
      throw new Error(metafieldsErrors.map((error) => error.message).join(", "));
    }

    await syncShopSettingsMetafields(admin, prisma, shop, updatedAppSettings);

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
        },
        ...(section === 'basic' && key === 'unavailableStyle'
          ? { unavailable: { ...(prev[styleId].unavailable || {}), style: value } }
          : {})
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
                <Button pressed={s.border.radius > 4} onClick={() => handleStyleUpdate(styleId, 'border', 'radius', 50)}>Round</Button>
                <Button pressed={s.border.radius <= 4} onClick={() => handleStyleUpdate(styleId, 'border', 'radius', 0)}>Square</Button>
            </ButtonGroup>
        </BlockStack>

        <RangeSlider label={`Size (${s.basic.swatchSize || s.swatch?.size || 24}px)`} value={s.basic.swatchSize || s.swatch?.size || 24} onChange={(v) => handleStyleUpdate(styleId, 'basic', 'swatchSize', v)} min={14} max={50} output />
        <RangeSlider label={`Padding (${s.basic.padding ?? s.swatch?.padding ?? 0}px)`} value={s.basic.padding ?? s.swatch?.padding ?? 0} onChange={(v) => handleStyleUpdate(styleId, 'basic', 'padding', v)} min={0} max={4} output />
        <RangeSlider label={`Border thickness (${s.border.width}px)`} value={s.border.width} onChange={(v) => handleStyleUpdate(styleId, 'border', 'width', v)} min={0} max={4} output />

        <Text variant="bodyMd" fontWeight="semibold">Border color</Text>
        <Grid>
            <Grid.Cell columnSpan={{xs: 4}}><ColorField label="Normal" value={s.border.color} fallback="#DBDFE2" onChange={(v) => handleStyleUpdate(styleId, 'border', 'color', v)} /></Grid.Cell>
            <Grid.Cell columnSpan={{xs: 4}}><ColorField label="Active" value={s.border.activeColor} fallback="#000000" onChange={(v) => handleStyleUpdate(styleId, 'border', 'activeColor', v)} /></Grid.Cell>
            <Grid.Cell columnSpan={{xs: 4}}><ColorField label="Hover" value={s.border.hoverColor || "#5f6772"} fallback="#5F6772" onChange={(v) => handleStyleUpdate(styleId, 'border', 'hoverColor', v)} /></Grid.Cell>
        </Grid>

        {styleId.includes('color') && (
            <BlockStack gap="200">
                <Text variant="bodyMd">Two color style</Text>
                <ButtonGroup variant="segmented" fullWidth>
                    {[
                        ['L / R', 'L_R'],
                        ['LT / RB', 'LT_RB'],
                        ['T / B', 'T_B'],
                        ['LB / RT', 'LB_RT'],
                    ].map(([label, value]) => (
                        <Button key={value} pressed={s.basic.twoColorStyle === value} onClick={() => handleStyleUpdate(styleId, 'basic', 'twoColorStyle', value)}>{label}</Button>
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
            value={s.unavailable?.style || s.basic.unavailableStyle || "cross_mark"}
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
                <Grid.Cell columnSpan={{xs: 6}}><ColorField label="Normal" value={s.basic.blockBg || "#FFFFFF"} fallback="#FFFFFF" onChange={(v) => handleStyleUpdate("dropdown_card", 'basic', 'blockBg', v)} /></Grid.Cell>
                <Grid.Cell columnSpan={{xs: 6}}><ColorField label="Active" value={s.basic.blockBgActive || "#eee"} fallback="#EEEEEE" onChange={(v) => handleStyleUpdate("dropdown_card", 'basic', 'blockBgActive', v)} /></Grid.Cell>
            </Grid>

            <Text variant="bodyMd" fontWeight="semibold">Text color</Text>
            <Grid>
                <Grid.Cell columnSpan={{xs: 6}}><ColorField label="Normal" value={s.label.color} fallback="#202020" onChange={(v) => handleStyleUpdate("dropdown_card", 'label', 'color', v)} /></Grid.Cell>
                <Grid.Cell columnSpan={{xs: 6}}><ColorField label="Active" value={s.label.colorActive || "#202020"} fallback="#202020" onChange={(v) => handleStyleUpdate("dropdown_card", 'label', 'colorActive', v)} /></Grid.Cell>
            </Grid>

            <RangeSlider label={`Border thickness (${s.border.width}px)`} value={s.border.width} onChange={(v) => handleStyleUpdate("dropdown_card", 'border', 'width', v)} min={1} max={4} output />
            <ColorField label="Border color" value={s.border.color} fallback="#E1E3E5" onChange={(v) => handleStyleUpdate("dropdown_card", 'border', 'color', v)} />
        </BlockStack>
    );
  };

  const renderButtonTab = () => {
    const s = styleSettings["button_card"];
    return (
        <BlockStack gap="400">
            <Grid>
                <Grid.Cell columnSpan={{xs: 6}}><TextField type="number" label="Limit (Desktop)" value={s.basic.limitDesktop || 5} onChange={(v) => handleStyleUpdate("button_card", 'basic', 'limitDesktop', v)} autoComplete="off" /></Grid.Cell>
                <Grid.Cell columnSpan={{xs: 6}}><TextField type="number" label="Limit (Mobile)" value={s.basic.limitMobile || 5} onChange={(v) => handleStyleUpdate("button_card", 'basic', 'limitMobile', v)} autoComplete="off" /></Grid.Cell>
            </Grid>

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
                <Grid.Cell columnSpan={{xs: 4}}><ColorField label="Normal" value={s.border.color} fallback="#DBDFE2" onChange={(v) => handleStyleUpdate("button_card", 'border', 'color', v)} /></Grid.Cell>
                <Grid.Cell columnSpan={{xs: 4}}><ColorField label="Active" value={s.border.activeColor} fallback="#000000" onChange={(v) => handleStyleUpdate("button_card", 'border', 'activeColor', v)} /></Grid.Cell>
                <Grid.Cell columnSpan={{xs: 4}}><ColorField label="Hover" value={s.border.hoverColor || "#4f5354"} fallback="#4F5354" onChange={(v) => handleStyleUpdate("button_card", 'border', 'hoverColor', v)} /></Grid.Cell>
            </Grid>

            <Text variant="bodyMd" fontWeight="semibold">Background color</Text>
            <Grid>
                <Grid.Cell columnSpan={{xs: 4}}><ColorField label="Normal" value={s.basic.blockBg || s.basic.buttonColor || "#FFFFFF"} fallback="#FFFFFF" onChange={(v) => handleStyleUpdate("button_card", 'basic', 'blockBg', v)} /></Grid.Cell>
                <Grid.Cell columnSpan={{xs: 4}}><ColorField label="Active" value={s.basic.blockBgActive || s.basic.buttonColorActive || "#EEEEEE"} fallback="#EEEEEE" onChange={(v) => handleStyleUpdate("button_card", 'basic', 'blockBgActive', v)} /></Grid.Cell>
                <Grid.Cell columnSpan={{xs: 4}}><ColorField label="Hover" value={s.basic.blockBgHover || "#F4F4F4"} fallback="#F4F4F4" onChange={(v) => handleStyleUpdate("button_card", 'basic', 'blockBgHover', v)} /></Grid.Cell>
            </Grid>

            <Text variant="bodyMd" fontWeight="semibold">Text color</Text>
            <Grid>
                <Grid.Cell columnSpan={{xs: 4}}><ColorField label="Normal" value={s.label.color || "#000000"} fallback="#000000" onChange={(v) => handleStyleUpdate("button_card", 'label', 'color', v)} /></Grid.Cell>
                <Grid.Cell columnSpan={{xs: 4}}><ColorField label="Active" value={s.label.activeColor || "#000000"} fallback="#000000" onChange={(v) => handleStyleUpdate("button_card", 'label', 'activeColor', v)} /></Grid.Cell>
                <Grid.Cell columnSpan={{xs: 4}}><ColorField label="Hover" value={s.label.hoverColor || "#000000"} fallback="#000000" onChange={(v) => handleStyleUpdate("button_card", 'label', 'hoverColor', v)} /></Grid.Cell>
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
                                    appSettings={appSettings} 
                                    isCard={true}
                                    hideLabel={true}
                                />
                            ) : (
                                <PreviewRenderer 
                                    styleId="color_swatch_card" 
                                    settings={styleSettings["color_swatch_card"]} 
                                    appSettings={appSettings} 
                                    isCard={true}
                                    hideLabel={true}
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


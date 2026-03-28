import { useState, useCallback, useEffect, useMemo } from "react";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation, useParams } from "@remix-run/react";
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
  Button,
  Icon,
  Grid,
  Divider,
  Collapsible,
  RangeSlider,
  ButtonGroup,
  Select,
  Tooltip,
} from "@shopify/polaris";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  MagicIcon,
  ViewIcon,
  DeleteIcon,
  ArrowLeftIcon,
  InfoIcon,
  TextAlignLeftIcon,
  TextAlignCenterIcon,
  TextAlignRightIcon,
} from "@shopify/polaris-icons";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";

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

const STYLE_NAMES = {
  image_swatch: "Image swatch",
  slide_swatch: "Slide swatch (Mobile only)",
  polaroid_swatch: "Polaroid swatch",
  color_swatch: "Color swatch",
  square_color_swatch: "Square color swatch",
  pill_swatch: "Color swatch in pill button",
  button: "Button",
  pill_button: "Pill button",
  dropdown: "Dropdown",
  image_dropdown: "Image swatch in dropdown",
};

export const loader = async ({ request, params }) => {
  const { authenticate } = await import("../shopify.server");
  const { default: prisma } = await import("../db.server");
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const styleId = params.id;

  let styleSetting = await prisma.optionStyleSetting.findUnique({
    where: { shop_styleId: { shop, styleId } },
  });

  return json({ 
    styleId, 
    settings: styleSetting?.settings || DEFAULT_SETTINGS_BY_STYLE[styleId] || BASE_SETTINGS
  });
};

export const action = async ({ request, params }) => {
  const { authenticate } = await import("../shopify.server");
  const { default: prisma } = await import("../db.server");
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;
  const styleId = params.id;
  const formData = await request.formData();
  const action = formData.get("action");

  if (action === "delete") {
    await prisma.optionStyleSetting.delete({
      where: { shop_styleId: { shop, styleId } },
    });
    return redirect("/app/option-styles");
  }

  const settings = JSON.parse(formData.get("settings"));

  const updated = await prisma.optionStyleSetting.upsert({
    where: { shop_styleId: { shop, styleId } },
    update: { settings },
    create: { shop, styleId, settings },
  });

  // Sync to metafields (Map of styleId -> settings)
  // Get existing metafield first
  const shopData = await admin.graphql(`{ shop { id } }`);
  const shopJson = await shopData.json();
  const shopId = shopJson.data.shop.id;

  const metafieldQuery = await admin.graphql(`
    query getMetafield($ownerId: ID!) {
      shop(id: $ownerId) {
        metafield(namespace: "linked_products", key: "style_customizations") {
          value
        }
      }
    }
  `, { variables: { ownerId: shopId } });
  
  const metafieldResult = await metafieldQuery.json();
  let allStyles = {};
  try {
    allStyles = JSON.parse(metafieldResult.data.shop.metafield?.value || "{}");
  } catch (e) {}
  
  allStyles[styleId] = settings;

  await admin.graphql(`
    mutation setMetafields($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        userErrors { field message }
      }
    }
  `, {
    variables: {
      metafields: [{
        namespace: "linked_products",
        key: "style_customizations",
        type: "json",
        ownerId: shopId,
        value: JSON.stringify(allStyles)
      }]
    }
  });

  return json({ success: true, settings: updated.settings });
};

export default function StyleCustomizerPage() {
  const { styleId, settings: initialSettings } = useLoaderData();
  const [settings, setSettings] = useState(initialSettings);
  const [openSections, setOpenSections] = useState({ basic: true });
  const submit = useSubmit();
  const navigation = useNavigation();
  const shopify = useAppBridge();
  const isLoading = navigation.state !== "idle";

  const toggleSection = (section) => {
    setOpenSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const handleUpdate = (section, key, value) => {
    setSettings(prev => ({
      ...prev,
      [section]: {
        ...prev[section],
        [key]: value
      }
    }));
  };

  const getSwatchStyle = (isActive) => {
    const b = settings.border;
    const s = settings.shadow;
    
    const style = {
      position: 'relative',
      padding: `${settings.basic.padding}px`,
      border: `${b.width}px solid ${isActive ? b.activeColor : (isActive === 'hover' ? b.hoverColor : b.color)}`,
      borderRadius: `${b.radius}px`,
      cursor: 'pointer',
      backgroundColor: '#fff',
      transition: 'all 0.2s ease',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minWidth: `${settings.basic.swatchSize}px`,
      minHeight: `${settings.basic.swatchSize}px`,
    };

    if (s.show) {
      style.boxShadow = `${s.offsetX}px ${s.offsetY}px ${s.blur}px ${s.spread}px ${s.color}`;
    }

    return style;
  };

  const getOuterStyle = (isActive) => {
    const b = settings.border;
    if (b.outerWidth <= 0) return {};

    return {
        padding: `${b.outerPadding}px`,
        border: `${b.outerWidth}px solid ${isActive ? b.outerActiveColor : (isActive === 'hover' ? b.outerHoverColor : b.outerColor)}`,
        borderRadius: `${b.outerRadius}px`,
        display: 'inline-flex',
        margin: '4px'
    };
  };

  const renderBadge = () => {
    if (!settings.badge.show) return null;
    const b = settings.badge;
    const posStyles = {
        'top-left': { top: '-8px', left: '-8px' },
        'top-right': { top: '-8px', right: '-8px' },
        'bottom-left': { bottom: '-8px', left: '-8px' },
        'bottom-right': { bottom: '-8px', right: '-8px' },
    };
    return (
        <div style={{
            position: 'absolute',
            ...posStyles[b.position],
            backgroundColor: b.bgColor,
            color: b.color,
            fontSize: `${b.fontSize}px`,
            padding: '2px 6px',
            borderRadius: '10px',
            zIndex: 10,
            fontWeight: 'bold',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
            whiteSpace: 'nowrap'
        }}>
            {b.text}
        </div>
    );
  };

  const renderPreview = () => {
    const isSlide = styleId.includes('slide');
    const isButton = styleId.includes('button');
    const isDropdown = styleId.includes('dropdown');

    if (isDropdown) {
        return (
            <div style={{ width: '100%', maxWidth: '300px' }}>
                <Select 
                    label="Select Option" 
                    options={previewProducts.map(p => ({ label: p.name, value: p.name }))}
                    value={activeProduct.name}
                />
            </div>
        );
    }

    const containerStyle = { 
        display: 'flex', 
        gap: `${settings.basic.gap}px`, 
        flexWrap: isSlide ? 'nowrap' : 'wrap',
        overflowX: isSlide ? 'auto' : 'visible',
        justifyContent: settings.layout.align === 'center' ? 'center' : (settings.layout.align === 'right' ? 'flex-end' : 'flex-start'),
        padding: '20px',
        width: '100%'
    };

    return (
        <div style={containerStyle}>
            {previewProducts.map((p, i) => {
                const isActive = i === 1;
                const isRound = styleId.includes('round') || styleId.includes('pill') || styleId.includes('circle') || (styleId === 'color_swatch' && settings.border.radius > 20);
                
                return (
                    <div key={i} style={getOuterStyle(isActive)}>
                        <div style={{ 
                            ...getSwatchStyle(isActive), 
                            padding: isButton ? '8px 16px' : `${settings.basic.padding}px`,
                            minWidth: isSlide ? '70px' : `${settings.basic.swatchSize}px`,
                            minHeight: isSlide ? '120px' : `${settings.basic.swatchSize}px`,
                        }}>
                            {isActive && renderBadge()}
                            {!isButton && (
                                <div style={{ 
                                    width: isSlide ? '62px' : `${settings.basic.swatchSize}px`, 
                                    height: isSlide ? '80px' : `${settings.basic.swatchSize}px`, 
                                    backgroundColor: '#eee',
                                    borderRadius: isRound ? '50%' : `${settings.border.radius}px`,
                                    border: '1px solid rgba(0,0,0,0.1)',
                                    position: 'relative',
                                    overflow: 'hidden'
                                }}>
                                    <img src={p.color} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                    {p.style === 'two' && (
                                        <div style={{ 
                                            position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                                            background: `linear-gradient(to bottom right, transparent 50%, ${p.color2} 50%)`
                                        }} />
                                    )}
                                </div>
                            )}
                            {(settings.label.show || isButton || isSlide) && (
                                <div style={{ marginTop: isButton ? 0 : '8px', textAlign: 'center' }}>
                                    <Text variant="bodySm" fontWeight={isActive ? 'bold' : 'regular'}>{p.name}</Text>
                                    {isSlide && <Text variant="bodyXs" tone="subdued">$19.99</Text>}
                                </div>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
  };

  const handleSave = () => {
    const formData = new FormData();
    formData.append("settings", JSON.stringify(settings));
    submit(formData, { method: "POST" });
  };

  const handleDelete = () => {
    if (confirm("Are you sure you want to delete custom settings for this style? It will revert to defaults.")) {
      const formData = new FormData();
      formData.append("action", "delete");
      submit(formData, { method: "POST" });
    }
  };

  // Preview Data
  const previewProducts = [
    { name: 'Beige Brown', color: 'https://picsum.photos/id/1027/400/500', style: 'one' },
    { name: 'Black White', color: 'https://picsum.photos/id/1011/400/500', style: 'one' },
    { name: 'Red Rose', color: 'https://picsum.photos/id/1059/400/500', style: 'one' },
    { name: 'Teal Lily', color: 'https://picsum.photos/id/1074/400/500', style: 'one' },
    { name: 'Yellow Bloom', color: 'https://picsum.photos/id/1084/400/500', style: 'one' },
    { name: 'Purple Mini', color: 'https://picsum.photos/id/1069/400/500', style: 'one' }
  ];

  const activeProduct = previewProducts[1]; // Purple

  return (
    <Page 
        fullWidth 
        backAction={{ content: 'Option styles', url: '/app/option-styles' }}
        title={`Customize ${STYLE_NAMES[styleId] || styleId}`}
    >
      <TitleBar title={`Customize ${STYLE_NAMES[styleId] || styleId}`} />
      
      <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
        {/* Sidebar Accordion */}
        <div style={{ width: '400px', flexShrink: 0 }}>
          <Card padding="0">
            <Box padding="400">
                <BlockStack gap="200">
                    <Text variant="headingMd">Option style customization</Text>
                    <Text variant="bodySm" tone="subdued">Customize linked options on your product page.</Text>
                </BlockStack>
            </Box>
            <Divider />
            
            {/* Basic Settings */}
            <Box padding="0">
                <div onClick={() => toggleSection('basic')} style={{ padding: '16px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text variant="headingSm">Basic settings</Text>
                    <Icon source={openSections.basic ? ChevronUpIcon : ChevronDownIcon} />
                </div>
                <Collapsible open={openSections.basic}>
                    <Box padding="400" paddingBlockStart="0">
                        <BlockStack gap="400">
                            <RangeSlider 
                                label={`Swatch size (${settings.basic.swatchSize}px)`} 
                                value={settings.basic.swatchSize} 
                                onChange={(v) => handleUpdate('basic', 'swatchSize', v)} 
                                min={10} max={100}
                                output
                            />
                            <RangeSlider 
                                label={`Gap (${settings.basic.gap}px)`} 
                                value={settings.basic.gap} 
                                onChange={(v) => handleUpdate('basic', 'gap', v)} 
                                min={0} max={30}
                                output
                            />
                            <InlineStack align="space-between">
                                <Text variant="bodyMd">Hide active swatch</Text>
                                <Checkbox label="" labelHidden checked={settings.basic.hideActiveSwatch} onChange={(v) => handleUpdate('basic', 'hideActiveSwatch', v)} />
                            </InlineStack>
                            <InlineStack align="space-between" blockAlign="center">
                                <InlineStack gap="100">
                                    <Text variant="bodyMd">Always display active swatch first</Text>
                                    <Tooltip content="If enabled, the currently selected variant's swatch will always appear at the beginning of the list.">
                                        <Icon source={InfoIcon} tone="subdued" />
                                    </Tooltip>
                                </InlineStack>
                                <Checkbox label="" labelHidden checked={settings.basic.activeSwatchFirst} onChange={(v) => handleUpdate('basic', 'activeSwatchFirst', v)} />
                            </InlineStack>
                            <RangeSlider 
                                label={`Padding (${settings.basic.padding}px)`} 
                                value={settings.basic.padding} 
                                onChange={(v) => handleUpdate('basic', 'padding', v)} 
                                min={0} max={20}
                                output
                            />
                            <BlockStack gap="200">
                                <Text variant="bodyMd">Two color style</Text>
                                <ButtonGroup variant="segmented">
                                    <Button pressed={settings.basic.twoColorStyle === "L_R"} onClick={() => handleUpdate('basic', 'twoColorStyle', "L_R")}>L / R</Button>
                                    <Button pressed={settings.basic.twoColorStyle === "LT_RB"} onClick={() => handleUpdate('basic', 'twoColorStyle', "LT_RB")}>LT / RB</Button>
                                    <Button pressed={settings.basic.twoColorStyle === "T_B"} onClick={() => handleUpdate('basic', 'twoColorStyle', "T_B")}>T / B</Button>
                                    <Button pressed={settings.basic.twoColorStyle === "LB_RT"} onClick={() => handleUpdate('basic', 'twoColorStyle', "LB_RT")}>LB / RT</Button>
                                </ButtonGroup>
                            </BlockStack>
                            <BlockStack gap="200">
                                <Text variant="bodyMd">Hover effect</Text>
                                <ButtonGroup variant="segmented">
                                    <Button pressed={settings.basic.hoverEffect === "none"} onClick={() => handleUpdate('basic', 'hoverEffect', "none")}>None</Button>
                                    <Button pressed={settings.basic.hoverEffect === "name"} onClick={() => handleUpdate('basic', 'hoverEffect', "name")}>Name</Button>
                                    <Button pressed={settings.basic.hoverEffect === "zoom"} onClick={() => handleUpdate('basic', 'hoverEffect', "zoom")}>Zoom</Button>
                                </ButtonGroup>
                            </BlockStack>
                        </BlockStack>
                    </Box>
                </Collapsible>
            </Box>
            <Divider />

            {/* Border Settings */}
            <Box padding="0">
                <div onClick={() => toggleSection('border')} style={{ padding: '16px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text variant="headingSm">Border settings</Text>
                    <Icon source={openSections.border ? ChevronUpIcon : ChevronDownIcon} />
                </div>
                <Collapsible open={openSections.border}>
                    <Box padding="400" paddingBlockStart="0">
                         <BlockStack gap="400">
                            <RangeSlider label={`Border thickness (${settings.border.width}px)`} value={settings.border.width} onChange={(v) => handleUpdate('border', 'width', v)} min={0} max={4} output />
                            <RangeSlider label={`Border radius (${settings.border.radius}px)`} value={settings.border.radius} onChange={(v) => handleUpdate('border', 'radius', v)} min={0} max={100} output />
                            
                            <Text variant="bodyMd" fontWeight="semibold">Border color</Text>
                            <Grid>
                                <Grid.Cell columnSpan={{xs: 6, sm: 4}}><TextField label="Default" value={settings.border.color} onChange={(v) => handleUpdate('border', 'color', v)} autoComplete="off" /></Grid.Cell>
                                <Grid.Cell columnSpan={{xs: 6, sm: 4}}><TextField label="Active" value={settings.border.activeColor} onChange={(v) => handleUpdate('border', 'activeColor', v)} autoComplete="off" /></Grid.Cell>
                                <Grid.Cell columnSpan={{xs: 6, sm: 4}}><TextField label="Hover" value={settings.border.hoverColor} onChange={(v) => handleUpdate('border', 'hoverColor', v)} autoComplete="off" /></Grid.Cell>
                            </Grid>

                            <Divider />

                            <RangeSlider label={`Outer border thickness (${settings.border.outerWidth}px)`} value={settings.border.outerWidth} onChange={(v) => handleUpdate('border', 'outerWidth', v)} min={0} max={4} output />
                            <RangeSlider label={`Outer border radius (${settings.border.outerRadius}px)`} value={settings.border.outerRadius} onChange={(v) => handleUpdate('border', 'outerRadius', v)} min={0} max={100} output />
                            <RangeSlider label={`Outer padding (${settings.border.outerPadding}px)`} value={settings.border.outerPadding} onChange={(v) => handleUpdate('border', 'outerPadding', v)} min={0} max={30} output />
                            
                            <Text variant="bodyMd" fontWeight="semibold">Outer border color</Text>
                            <Grid>
                                <Grid.Cell columnSpan={{xs: 6, sm: 4}}><TextField label="Default" value={settings.border.outerColor} onChange={(v) => handleUpdate('border', 'outerColor', v)} autoComplete="off" /></Grid.Cell>
                                <Grid.Cell columnSpan={{xs: 6, sm: 4}}><TextField label="Active" value={settings.border.outerActiveColor} onChange={(v) => handleUpdate('border', 'outerActiveColor', v)} autoComplete="off" /></Grid.Cell>
                                <Grid.Cell columnSpan={{xs: 6, sm: 4}}><TextField label="Hover" value={settings.border.outerHoverColor} onChange={(v) => handleUpdate('border', 'outerHoverColor', v)} autoComplete="off" /></Grid.Cell>
                            </Grid>
                         </BlockStack>
                    </Box>
                </Collapsible>
            </Box>
            <Divider />

            {/* Label Settings */}
            <Box padding="0">
                <div onClick={() => toggleSection('label')} style={{ padding: '16px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text variant="headingSm">Label settings</Text>
                    <Icon source={openSections.label ? ChevronUpIcon : ChevronDownIcon} />
                </div>
                <Collapsible open={openSections.label}>
                    <Box padding="400" paddingBlockStart="0">
                        <BlockStack gap="400">
                            <InlineStack align="space-between">
                                <Text variant="bodyMd">Show label</Text>
                                <Checkbox label="" labelHidden checked={settings.label.show} onChange={(v) => handleUpdate('label', 'show', v)} />
                            </InlineStack>
                            <BlockStack gap="200">
                                <Text variant="bodyMd">Label layout</Text>
                                <ButtonGroup variant="segmented">
                                    <Button pressed={settings.label.layout === "stack"} onClick={() => handleUpdate('label', 'layout', "stack")}>Stack</Button>
                                    <Button pressed={settings.label.layout === "inline"} onClick={() => handleUpdate('label', 'layout', "inline")}>Inline</Button>
                                </ButtonGroup>
                            </BlockStack>
                            <RangeSlider label={`Space between label and option (${settings.label.gap}px)`} value={settings.label.gap} onChange={(v) => handleUpdate('label', 'gap', v)} min={0} max={80} output />
                            <RangeSlider label={`Label font size (${settings.label.fontSize}px)`} value={settings.label.fontSize} onChange={(v) => handleUpdate('label', 'fontSize', v)} min={12} max={30} output />
                            <BlockStack gap="200">
                                <Text variant="bodyMd">Option font weight</Text>
                                <ButtonGroup variant="segmented">
                                    <Button pressed={settings.label.fontWeight === "lighter"} onClick={() => handleUpdate('label', 'fontWeight', "lighter")}>Lighter</Button>
                                    <Button pressed={settings.label.fontWeight === "normal"} onClick={() => handleUpdate('label', 'fontWeight', "normal")}>Normal</Button>
                                    <Button pressed={settings.label.fontWeight === "semibold"} onClick={() => handleUpdate('label', 'fontWeight', "semibold")}>Semibold</Button>
                                    <Button pressed={settings.label.fontWeight === "bolder"} onClick={() => handleUpdate('label', 'fontWeight', "bolder")}>Bolder</Button>
                                </ButtonGroup>
                            </BlockStack>
                            <RangeSlider label={`Line height (${settings.label.lineHeight}px)`} value={settings.label.lineHeight} onChange={(v) => handleUpdate('label', 'lineHeight', v)} min={12} max={50} output />
                            <InlineStack align="space-between">
                                <Text variant="bodyMd">Show selected variant name</Text>
                                <Checkbox label="" labelHidden checked={settings.label.showSelectedVariant} onChange={(v) => handleUpdate('label', 'showSelectedVariant', v)} />
                            </InlineStack>
                        </BlockStack>
                    </Box>
                </Collapsible>
            </Box>
            <Divider />

            {/* Price settings */}
            <Box padding="0">
                <div onClick={() => toggleSection('price')} style={{ padding: '16px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text variant="headingSm">Price settings</Text>
                    <Icon source={openSections.price ? ChevronUpIcon : ChevronDownIcon} />
                </div>
                <Collapsible open={openSections.price}>
                    <Box padding="400" paddingBlockStart="0">
                         <InlineStack align="space-between">
                                <Text variant="bodyMd">Show price</Text>
                                <Checkbox label="" labelHidden checked={settings.price.show} onChange={(v) => handleUpdate('price', 'show', v)} />
                        </InlineStack>
                    </Box>
                </Collapsible>
            </Box>
            <Divider />

            {/* Text settings */}
            <Box padding="0">
                <div onClick={() => toggleSection('text')} style={{ padding: '16px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text variant="headingSm">Text settings</Text>
                    <Icon source={openSections.text ? ChevronUpIcon : ChevronDownIcon} />
                </div>
                <Collapsible open={openSections.text}>
                    <Box padding="400" paddingBlockStart="0">
                        <BlockStack gap="400">
                            <BlockStack gap="200">
                                <Text variant="bodyMd">Position</Text>
                                <ButtonGroup variant="segmented">
                                    <Button pressed={settings.text.position === "right"} onClick={() => handleUpdate('text', 'position', "right")}>Right</Button>
                                    <Button pressed={settings.text.position === "bottom"} onClick={() => handleUpdate('text', 'position', "bottom")}>Bottom</Button>
                                </ButtonGroup>
                            </BlockStack>
                            <RangeSlider label={`Text box gap (${settings.text.gap}px)`} value={settings.text.gap} onChange={(v) => handleUpdate('text', 'gap', v)} min={0} max={30} output />
                            <RangeSlider label={`Text box width (${settings.text.width}px)`} value={settings.text.width} onChange={(v) => handleUpdate('text', 'width', v)} min={14} max={300} output />
                        </BlockStack>
                    </Box>
                </Collapsible>
            </Box>
            <Divider />

            {/* Layout settings */}
            <Box padding="0">
                <div onClick={() => toggleSection('layout')} style={{ padding: '16px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text variant="headingSm">Layout settings</Text>
                    <Icon source={openSections.layout ? ChevronUpIcon : ChevronDownIcon} />
                </div>
                <Collapsible open={openSections.layout}>
                    <Box padding="400" paddingBlockStart="0">
                        <BlockStack gap="400">
                            <RangeSlider label={`Margin top (${settings.layout.marginTop}px)`} value={settings.layout.marginTop} onChange={(v) => handleUpdate('layout', 'marginTop', v)} min={0} max={80} output />
                            <RangeSlider label={`Margin bottom (${settings.layout.marginBottom}px)`} value={settings.layout.marginBottom} onChange={(v) => handleUpdate('layout', 'marginBottom', v)} min={0} max={80} output />
                            <BlockStack gap="200">
                                <Text variant="bodyMd">Align</Text>
                                <ButtonGroup variant="segmented">
                                    <Button pressed={settings.layout.align === "left"} onClick={() => handleUpdate('layout', 'align', "left")} icon={TextAlignLeftIcon} />
                                    <Button pressed={settings.layout.align === "center"} onClick={() => handleUpdate('layout', 'align', "center")} icon={TextAlignCenterIcon} />
                                    <Button pressed={settings.layout.align === "right"} onClick={() => handleUpdate('layout', 'align', "right")} icon={TextAlignRightIcon} />
                                </ButtonGroup>
                            </BlockStack>
                            <BlockStack gap="200">
                                <Text variant="bodyMd">Layout</Text>
                                <ButtonGroup variant="segmented">
                                    <Button pressed={settings.layout.type === "stack"} onClick={() => handleUpdate('layout', 'type', "stack")}>Stack</Button>
                                    <Button pressed={settings.layout.type === "slide"} onClick={() => handleUpdate('layout', 'type', "slide")}>Slide</Button>
                                    <Button pressed={settings.layout.type === "slide_mobile"} onClick={() => handleUpdate('layout', 'type', "slide_mobile")}>Slide (Mobile only)</Button>
                                </ButtonGroup>
                            </BlockStack>
                            <TextField 
                                label="Maximum number of swatches to show" 
                                type="number" 
                                value={settings.layout.maxSwatches?.toString()} 
                                onChange={(v) => handleUpdate('layout', 'maxSwatches', parseInt(v))}
                                suffix="swatches"
                                helpText="If the number of swatches exceeds this value, hide the extras and display a + button to expand all swatches."
                                autoComplete="off"
                            />
                        </BlockStack>
                    </Box>
                </Collapsible>
            </Box>
            <Divider />

            {/* Badge settings */}
            <Box padding="0">
                <div onClick={() => toggleSection('badge')} style={{ padding: '16px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text variant="headingSm">Badge settings</Text>
                    <Icon source={openSections.badge ? ChevronUpIcon : ChevronDownIcon} />
                </div>
                <Collapsible open={openSections.badge}>
                    <Box padding="400" paddingBlockStart="0">
                        <BlockStack gap="400">
                            <InlineStack align="space-between">
                                <Text variant="bodyMd">Show badge</Text>
                                <Checkbox label="" labelHidden checked={settings.badge.show} onChange={(v) => handleUpdate('badge', 'show', v)} />
                            </InlineStack>
                            <TextField label="Badge text" value={settings.badge.text} onChange={(v) => handleUpdate('badge', 'text', v)} autoComplete="off" />
                            <Select 
                                label="Position" 
                                options={[
                                    { label: 'Top Left', value: 'top-left' },
                                    { label: 'Top Right', value: 'top-right' },
                                    { label: 'Bottom Left', value: 'bottom-left' },
                                    { label: 'Bottom Right', value: 'bottom-right' }
                                ]}
                                value={settings.badge.position}
                                onChange={(v) => handleUpdate('badge', 'position', v)}
                            />
                            <RangeSlider label={`Font size (${settings.badge.fontSize}px)`} value={settings.badge.fontSize} onChange={(v) => handleUpdate('badge', 'fontSize', v)} min={8} max={20} output />
                            <Grid>
                                <Grid.Cell columnSpan={{xs: 6, sm: 6}}><TextField label="Text color" value={settings.badge.color} onChange={(v) => handleUpdate('badge', 'color', v)} autoComplete="off" /></Grid.Cell>
                                <Grid.Cell columnSpan={{xs: 6, sm: 6}}><TextField label="BG color" value={settings.badge.bgColor} onChange={(v) => handleUpdate('badge', 'bgColor', v)} autoComplete="off" /></Grid.Cell>
                            </Grid>
                        </BlockStack>
                    </Box>
                </Collapsible>
            </Box>
            <Divider />

            {/* Shadow settings */}
            <Box padding="0">
                <div onClick={() => toggleSection('shadow')} style={{ padding: '16px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text variant="headingSm">Shadow settings</Text>
                    <Icon source={openSections.shadow ? ChevronUpIcon : ChevronDownIcon} />
                </div>
                <Collapsible open={openSections.shadow}>
                    <Box padding="400" paddingBlockStart="0">
                        <BlockStack gap="400">
                             <InlineStack align="space-between">
                                <Text variant="bodyMd">Show shadow</Text>
                                <Checkbox label="" labelHidden checked={settings.shadow.show} onChange={(v) => handleUpdate('shadow', 'show', v)} />
                            </InlineStack>
                            <TextField label="Shadow color" value={settings.shadow.color} onChange={(v) => handleUpdate('shadow', 'color', v)} autoComplete="off" />
                            <Grid>
                                <Grid.Cell columnSpan={{xs: 6, sm: 6}}><RangeSlider label="OffsetX" value={settings.shadow.offsetX} onChange={(v) => handleUpdate('shadow', 'offsetX', v)} min={-20} max={20} output /></Grid.Cell>
                                <Grid.Cell columnSpan={{xs: 6, sm: 6}}><RangeSlider label="OffsetY" value={settings.shadow.offsetY} onChange={(v) => handleUpdate('shadow', 'offsetY', v)} min={-20} max={20} output /></Grid.Cell>
                                <Grid.Cell columnSpan={{xs: 6, sm: 6}}><RangeSlider label="Blur" value={settings.shadow.blur} onChange={(v) => handleUpdate('shadow', 'blur', v)} min={0} max={50} output /></Grid.Cell>
                                <Grid.Cell columnSpan={{xs: 6, sm: 6}}><RangeSlider label="Spread" value={settings.shadow.spread} onChange={(v) => handleUpdate('shadow', 'spread', v)} min={-10} max={20} output /></Grid.Cell>
                            </Grid>
                        </BlockStack>
                    </Box>
                </Collapsible>
            </Box>
          </Card>
          
          {/* Footer Actions */}
          <Box paddingBlockStart="400">
            <BlockStack gap="200">
                <Card>
                    <InlineStack align="space-between">
                        <Button tone="critical" onClick={handleDelete} variant="secondary">Delete</Button>
                        <InlineStack gap="200">
                            <Button onClick={() => setSettings(initialSettings)}>Discard</Button>
                            <Button variant="primary" onClick={handleSave} loading={isLoading}>Save</Button>
                        </InlineStack>
                    </InlineStack>
                </Card>
            </BlockStack>
          </Box>
        </div>

        {/* Preview Pane */}
        <div style={{ flex: 1, position: 'sticky', top: '20px' }}>
          <Card>
            <Box padding="400">
                <BlockStack gap="400">
                    <Text variant="headingMd">Preview</Text>
                    
                    <Box padding="600" background="bg-surface-secondary" borderRadius="400" borderWidth="025" borderColor="border">
                        <BlockStack gap="400">
                            {settings.label.show && !styleId.includes('dropdown') && (
                                <Text variant="bodyMd">Color: {activeProduct.name}</Text>
                            )}
                            
                            {renderPreview()}
                        </BlockStack>
                    </Box>
                </BlockStack>
            </Box>
          </Card>
        </div>
      </div>
    </Page>
  );
}

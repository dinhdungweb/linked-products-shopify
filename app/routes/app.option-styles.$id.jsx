import { useState, useCallback, useEffect, useMemo } from "react";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation, Link, useActionData } from "@remix-run/react";
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
  InfoIcon,
  TextAlignLeftIcon,
  TextAlignCenterIcon,
  TextAlignRightIcon,
} from "@shopify/polaris-icons";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import { 
  BASE_SETTINGS, 
  DEFAULT_SETTINGS_BY_STYLE, 
  PreviewRenderer, 
  PREVIEW_PRODUCTS,
  IMAGES,
  COLORS
} from "../utils/style-utils";
import { enqueueStyleCustomizationsSync } from "../sync-jobs.server";

  // Removed redundant helpers, now using style-utils.jsx

const STYLE_NAMES = {
  image_swatch: "Image swatch",
  scroll_swatch: "Scroll swatch (Mobile only)",
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
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const styleId = params.id;
  const formData = await request.formData();
  const action = formData.get("action");

  try {
    if (action === "delete") {
      await prisma.optionStyleSetting.deleteMany({
        where: { shop, styleId },
      });

      await enqueueStyleCustomizationsSync(prisma, shop);

      return redirect("/app/option-styles");
    }

    const settings = JSON.parse(formData.get("settings"));

    const updated = await prisma.optionStyleSetting.upsert({
      where: { shop_styleId: { shop, styleId } },
      update: { settings },
      create: { shop, styleId, settings },
    });

    await enqueueStyleCustomizationsSync(prisma, shop);

    return json({ success: true, message: "Settings saved successfully", settings: updated.settings });
  } catch (error) {
    console.error("Save settings error:", error);
    return json({ success: false, error: error.message || "Failed to save settings" });
  }
};

export default function StyleCustomizerPage() {
  const { styleId, settings: initialSettings } = useLoaderData();
  const [settings, setSettings] = useState(initialSettings);
  const [openSections, setOpenSections] = useState({ basic: true, variantName: false });
  const submit = useSubmit();
  const navigation = useNavigation();
  const shopify = useAppBridge();
  const actionData = useActionData();
  const isLoading = navigation.state !== "idle";

  useEffect(() => {
    if (actionData?.success) {
      shopify.toast.show(actionData.message || "Settings saved");
    } else if (actionData?.error) {
      shopify.toast.show(actionData.error, { isError: true });
    }
  }, [actionData, shopify]);

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

  // Customizer logic

  const renderPreview = () => {
    return <PreviewRenderer styleId={styleId} settings={settings} />;
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

  // previewProducts replaced by PREVIEW_PRODUCTS from style-utils

  const activeProduct = PREVIEW_PRODUCTS[1]; // Purple

  return (
    <Page 
        fullWidth 
        backAction={{ content: 'Option styles', url: '/app/option-styles' }}
        title={`Customize ${STYLE_NAMES[styleId] || styleId}`}
        primaryAction={{
            content: "Save",
            onAction: handleSave,
            loading: isLoading
        }}
        secondaryActions={[
            {
                content: "Discard",
                onAction: () => setSettings(initialSettings),
            },
            {
                content: "Delete",
                destructive: true,
                onAction: handleDelete,
            }
        ]}
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
                <div onClick={() => toggleSection('basic')} style={{ padding: '12px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', width: '100%' }}>
                    <div style={{ flex: 1 }}>
                        <Text variant="headingSm">Basic settings</Text>
                    </div>
                    <Icon source={openSections.basic ? ChevronUpIcon : ChevronDownIcon} />
                </div>
                <Collapsible open={openSections.basic}>
                    <Box padding="400" paddingBlockStart="0">
                        <BlockStack gap="400">
                            <RangeSlider 
                                label={`Swatch size (${settings.basic.swatchSize}px)`} 
                                value={settings.basic.swatchSize} 
                                onChange={(v) => handleUpdate('basic', 'swatchSize', v)} 
                                min={10} max={300}
                                output
                            />
                            
                            {!(styleId === 'color_swatch' || styleId === 'square_color_swatch') && (
                                <>
                                    <BlockStack gap="200">
                                        <Text variant="bodyMd">Aspect ratio</Text>
                                        <ButtonGroup variant="segmented">
                                            {['1:1', '3:4', '9:16', '16:9', '4:3'].map((ratio) => (
                                                <Button 
                                                    key={ratio}
                                                    pressed={settings.basic.aspectRatio === ratio} 
                                                    onClick={() => handleUpdate('basic', 'aspectRatio', ratio)}
                                                >
                                                    {ratio}
                                                </Button>
                                            ))}
                                        </ButtonGroup>
                                    </BlockStack>

                                    <BlockStack gap="200">
                                        <Text variant="bodyMd">Image Position (Vertical)</Text>
                                        <ButtonGroup variant="segmented">
                                            <Button pressed={settings.basic.imagePosition === "top"} onClick={() => handleUpdate('basic', 'imagePosition', "top")}>Top</Button>
                                            <Button pressed={settings.basic.imagePosition === "center"} onClick={() => handleUpdate('basic', 'imagePosition', "center")}>Center</Button>
                                            <Button pressed={settings.basic.imagePosition === "bottom"} onClick={() => handleUpdate('basic', 'imagePosition', "bottom")}>Bottom</Button>
                                        </ButtonGroup>
                                    </BlockStack>
                                </>
                            )}

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
                <div onClick={() => toggleSection('border')} style={{ padding: '12px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', width: '100%' }}>
                    <div style={{ flex: 1 }}>
                        <Text variant="headingSm">Border settings</Text>
                    </div>
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
                <div onClick={() => toggleSection('label')} style={{ padding: '12px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', width: '100%' }}>
                    <div style={{ flex: 1 }}>
                        <Text variant="headingSm">Label settings</Text>
                    </div>
                    <Icon source={openSections.label ? ChevronUpIcon : ChevronDownIcon} />
                </div>
                <Collapsible open={openSections.label}>
                    <Box padding="400" paddingBlockStart="0">
                        <BlockStack gap="400">
                            <InlineStack align="space-between">
                                <Text variant="bodyMd">Show option label (e.g. Color:)</Text>
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
                                <Text variant="bodyMd">Show selected variant name next to label</Text>
                                <Checkbox label="" labelHidden checked={settings.label.showSelectedVariant} onChange={(v) => handleUpdate('label', 'showSelectedVariant', v)} />
                            </InlineStack>
                        </BlockStack>
                    </Box>
                </Collapsible>
            </Box>
            <Divider />
            
            {/* Variant name settings */}
            <Box padding="0">
                <div onClick={() => toggleSection('variantName')} style={{ padding: '12px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', width: '100%' }}>
                    <div style={{ flex: 1 }}>
                        <Text variant="headingSm">Variant name settings</Text>
                    </div>
                    <Icon source={openSections.variantName ? ChevronUpIcon : ChevronDownIcon} />
                </div>
                <Collapsible open={openSections.variantName}>
                    <Box padding="400" paddingBlockStart="0">
                        <BlockStack gap="400">
                            <InlineStack align="space-between">
                                <Text variant="bodyMd">Show name below/inside swatch</Text>
                                <Checkbox label="" labelHidden checked={settings.variantName?.show} onChange={(v) => handleUpdate('variantName', 'show', v)} />
                            </InlineStack>
                            <RangeSlider label={`Text font size (${settings.variantName?.fontSize}px)`} value={settings.variantName?.fontSize} onChange={(v) => handleUpdate('variantName', 'fontSize', v)} min={8} max={30} output />
                            <BlockStack gap="200">
                                <Text variant="bodyMd">Font weight</Text>
                                <ButtonGroup variant="segmented">
                                    <Button pressed={settings.variantName?.fontWeight === "lighter"} onClick={() => handleUpdate('variantName', 'fontWeight', "lighter")}>Lighter</Button>
                                    <Button pressed={settings.variantName?.fontWeight === "normal"} onClick={() => handleUpdate('variantName', 'fontWeight', "normal")}>Normal</Button>
                                    <Button pressed={settings.variantName?.fontWeight === "semibold"} onClick={() => handleUpdate('variantName', 'fontWeight', "semibold")}>Semibold</Button>
                                    <Button pressed={settings.variantName?.fontWeight === "bolder"} onClick={() => handleUpdate('variantName', 'fontWeight', "bolder")}>Bolder</Button>
                                </ButtonGroup>
                            </BlockStack>
                            <RangeSlider label={`Max text lines (${settings.variantName?.maxLines} line)`} value={settings.variantName?.maxLines} onChange={(v) => handleUpdate('variantName', 'maxLines', v)} min={1} max={6} output />
                        </BlockStack>
                    </Box>
                </Collapsible>
            </Box>
            <Divider />

            {/* Price settings */}
            <Box padding="0">
                <div onClick={() => toggleSection('price')} style={{ padding: '12px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', width: '100%' }}>
                    <div style={{ flex: 1 }}>
                        <Text variant="headingSm">Price settings</Text>
                    </div>
                    <Icon source={openSections.price ? ChevronUpIcon : ChevronDownIcon} />
                </div>
                <Collapsible open={openSections.price}>
                    <Box padding="400" paddingBlockStart="0">
                         <BlockStack gap="400">
                            <InlineStack align="space-between">
                                 <Text variant="bodyMd">Show price</Text>
                                 <Checkbox label="" labelHidden checked={settings.price?.show} onChange={(v) => handleUpdate('price', 'show', v)} />
                            </InlineStack>
                            <RangeSlider 
                                label={`Price font size (${settings.price?.fontSize || 10}px)`} 
                                value={settings.price?.fontSize || 10} 
                                onChange={(v) => handleUpdate('price', 'fontSize', v)} 
                                min={8} max={30} 
                                output 
                            />
                            <BlockStack gap="200">
                                <Text variant="bodyMd">Font weight</Text>
                                <ButtonGroup variant="segmented">
                                    <Button pressed={settings.price?.fontWeight === "lighter"} onClick={() => handleUpdate('price', 'fontWeight', "lighter")}>Lighter</Button>
                                    <Button pressed={settings.price?.fontWeight === "normal"} onClick={() => handleUpdate('price', 'fontWeight', "normal")}>Normal</Button>
                                    <Button pressed={settings.price?.fontWeight === "semibold"} onClick={() => handleUpdate('price', 'fontWeight', "semibold")}>Semibold</Button>
                                    <Button pressed={settings.price?.fontWeight === "bolder"} onClick={() => handleUpdate('price', 'fontWeight', "bolder")}>Bolder</Button>
                                </ButtonGroup>
                            </BlockStack>
                            <TextField 
                                label="Price color" 
                                value={settings.price?.color || "#6d7175"} 
                                onChange={(v) => handleUpdate('price', 'color', v)} 
                                autoComplete="off" 
                            />
                         </BlockStack>
                    </Box>
                </Collapsible>
            </Box>
            <Divider />

            {/* Text settings */}
            <Box padding="0">
                <div onClick={() => toggleSection('text')} style={{ padding: '12px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', width: '100%' }}>
                    <div style={{ flex: 1 }}>
                        <Text variant="headingSm">Text settings</Text>
                    </div>
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
                <div onClick={() => toggleSection('layout')} style={{ padding: '12px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', width: '100%' }}>
                    <div style={{ flex: 1 }}>
                        <Text variant="headingSm">Layout settings</Text>
                    </div>
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
                                    <Button pressed={settings.layout.type === "scroll"} onClick={() => handleUpdate('layout', 'type', "scroll")}>Scroll</Button>
                                    <Button pressed={settings.layout.type === "scroll_mobile"} onClick={() => handleUpdate('layout', 'type', "scroll_mobile")}>Scroll (Mobile only)</Button>
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
                <div onClick={() => toggleSection('badge')} style={{ padding: '12px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', width: '100%' }}>
                    <div style={{ flex: 1 }}>
                        <Text variant="headingSm">Badge settings</Text>
                    </div>
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
                <div onClick={() => toggleSection('shadow')} style={{ padding: '12px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', width: '100%' }}>
                    <div style={{ flex: 1 }}>
                        <Text variant="headingSm">Shadow settings</Text>
                    </div>
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
          
          {/* Footer Actions are now in Page actions at the top */}
        </div>

        <div style={{ flex: 1, position: 'sticky', top: '20px', overflow: 'visible' }}>
          <div style={{ 
            backgroundColor: 'var(--p-color-bg-surface, #fff)', 
            borderRadius: 'var(--p-border-radius-300, 8px)', 
            boxShadow: 'var(--p-shadow-100, 0 1px 3px rgba(0,0,0,0.1))',
            padding: '24px',
            border: '1px solid #e1e3e5',
            overflow: 'visible'
          }}>
                <BlockStack gap="400" overflow="visible">
                    <Text variant="headingMd">Preview</Text>
                    
                    <div style={{ overflow: 'visible', width: '100%' }}>
                        <div style={{ 
                            padding: '0', 
                            width: '100%', 
                            display: 'flex', 
                            justifyContent: 'flex-start',
                            alignItems: 'flex-start',
                            overflow: 'visible'
                        }}>
                            {renderPreview()}
                        </div>
                    </div>
                </BlockStack>
          </div>
        </div>
      </div>
    </Page>
  );
}

import { useState, useEffect, useCallback, useMemo } from "react";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation, useActionData } from "@remix-run/react";
import {
  Page,
  Card,
  Text,
  BlockStack,
  InlineStack,
  TextField,
  Checkbox,
  Badge,
  Button,
  Tabs,
  Icon,
  Banner,
  Divider,
  InlineGrid,
} from "@shopify/polaris";
import {
  AppExtensionIcon,
  CheckCircleIcon,
  CodeIcon,
  DesktopIcon,
  ExternalIcon,
  LanguageIcon,
  MagicIcon,
  PaintBrushFlatIcon,
  SaveIcon,
  SettingsIcon,
  StoreOnlineIcon,
  ThemeEditIcon,
} from "@shopify/polaris-icons";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import { enqueueShopSettingsSync } from "../sync-jobs.server";
import { buildThemeEditorUrl } from "../utils/app-embed-status";

export const loader = async ({ request }) => {
  const { authenticate } = await import("../shopify.server");
  const { default: prisma } = await import("../db.server");
  const { session } = await authenticate.admin(request);
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

  if (isFirstInstall) {
    await enqueueShopSettingsSync(prisma, shop);
  }

  return json({ settings, shop, apiKey: process.env.SHOPIFY_API_KEY || "" });
};

export const action = async ({ request }) => {
  const { authenticate } = await import("../shopify.server");
  const { default: prisma } = await import("../db.server");
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();
  const data = Object.fromEntries(formData);

  const settingsData = {
    appEnabled: data.appEnabled === "true",
    showOnProductCards: data.showOnProductCards === "true",
    applyToCollection: data.applyToCollection === "true",
    applyToSearch: data.applyToSearch === "true",
    applyToHome: data.applyToHome === "true",
    selectOptionLabel: data.selectOptionLabel || "{option}",
    soldOutLabel: data.soldOutLabel || "Sold out",
    unavailableLabel: data.unavailableLabel || "Unavailable",
    showOptionName: data.showOptionName === "true",
    customCssProduct: data.customCssProduct || "",
    customCssCollection: data.customCssCollection || "",
  };

  const updatedSettings = await prisma.appSetting.upsert({
    where: { shop },
    update: settingsData,
    create: { shop, ...settingsData },
  });

  await enqueueShopSettingsSync(prisma, shop);

  return json({
    success: true,
    settings: updatedSettings,
    syncWarning: null,
  });
};

function IconBox({ icon, tone = "#2C6ECB", background = "#F4F6F8" }) {
  return (
    <div style={{
      width: "40px",
      height: "40px",
      borderRadius: "10px",
      backgroundColor: background,
      color: tone,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    }}>
      <Icon source={icon} tone="inherit" />
    </div>
  );
}

function MetricCard({ icon, label, value, helpText, tone = "#2C6ECB", background = "#F4F6F8" }) {
  return (
    <Card padding="400">
      <BlockStack gap="300">
        <InlineStack align="space-between" blockAlign="center" wrap={false}>
          <Text as="p" variant="bodySm" tone="subdued">{label}</Text>
          <IconBox icon={icon} tone={tone} background={background} />
        </InlineStack>
        <BlockStack gap="100">
          <Text as="p" variant="headingLg">{value}</Text>
          <Text as="p" variant="bodySm" tone="subdued">{helpText}</Text>
        </BlockStack>
      </BlockStack>
    </Card>
  );
}

function SectionHeader({ icon, title, description, badge }) {
  return (
    <InlineStack align="space-between" blockAlign="start" gap="400">
      <InlineStack gap="300" blockAlign="start" wrap={false}>
        <IconBox icon={icon} />
        <BlockStack gap="100">
          <Text variant="headingMd" as="h2">{title}</Text>
          {description && <Text variant="bodySm" tone="subdued">{description}</Text>}
        </BlockStack>
      </InlineStack>
      {badge}
    </InlineStack>
  );
}

function ToggleRow({ title, description, checked, onChange }) {
  return (
    <div style={{
      border: "1px solid #E3E3E3",
      borderRadius: "12px",
      padding: "14px",
      backgroundColor: "#FAFAFA",
    }}>
      <InlineStack align="space-between" blockAlign="start" gap="400">
        <BlockStack gap="100">
          <Text as="p" variant="bodyMd" fontWeight="semibold">{title}</Text>
          {description && <Text as="p" variant="bodySm" tone="subdued">{description}</Text>}
        </BlockStack>
        <Checkbox label="Toggle setting" labelHidden checked={Boolean(checked)} onChange={onChange} />
      </InlineStack>
    </div>
  );
}

export default function SettingsPage() {
  const { settings: initialSettings, shop, apiKey } = useLoaderData();
  const actionData = useActionData();
  const submit = useSubmit();
  const navigation = useNavigation();
  const shopify = useAppBridge();
  const isSaving = navigation.state !== "idle";

  const [selectedTab, setSelectedTab] = useState(0);
  const [settings, setSettings] = useState(initialSettings);

  useEffect(() => {
    setSettings(initialSettings);
  }, [initialSettings]);

  useEffect(() => {
    if (actionData?.syncWarning) {
      shopify.toast.show("Saved, but storefront sync failed. Try saving again.", { isError: true });
      return;
    }

    if (actionData?.success) {
      shopify.toast.show("Settings updated successfully");
    } else if (actionData?.error) {
      shopify.toast.show(actionData.error, { isError: true });
    }
  }, [actionData, shopify]);

  const handleSettingChange = useCallback((key, value) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }, []);

  const hasChanges = useMemo(
    () => JSON.stringify(settings) !== JSON.stringify(initialSettings),
    [settings, initialSettings],
  );

  const handleSave = useCallback(() => {
    const formData = new FormData();
    Object.keys(settings).forEach((key) => {
      let value = settings[key];
      if (typeof value === "number" && Number.isNaN(value)) value = 0;
      if (value === "" && (key.includes("Size") || key.includes("Gap") || key.includes("Radius") || key.includes("Width") || key.includes("Padding"))) value = 0;
      formData.append(key, value ?? "");
    });

    submit(formData, { method: "post" });
  }, [settings, submit]);

  const themeEditorUrl = buildThemeEditorUrl(shop, apiKey);
  const appStatusLabel = settings.appEnabled ? "Active" : "Disabled";
  const cardStatusLabel = settings.showOnProductCards ? "Enabled" : "Hidden";
  const activeSurfaces = [
    settings.applyToCollection ? "Collections" : null,
    settings.applyToSearch ? "Search" : null,
    settings.applyToHome ? "Home" : null,
  ].filter(Boolean);
  const productCardHelpText = settings.showOnProductCards
    ? activeSurfaces.length > 0 ? activeSurfaces.join(", ") : "No card surfaces selected"
    : "Product card options are hidden";
  const optionLabelPreview = (settings.selectOptionLabel || "{option}").replace("{option}", "Color");

  const tabs = useMemo(() => [
    {
      id: "general",
      content: (
        <InlineStack gap="200" blockAlign="center">
          <Icon source={SettingsIcon} />
          <span>General</span>
        </InlineStack>
      ),
      panelID: "general-panel",
    },
    {
      id: "storefront",
      content: (
        <InlineStack gap="200" blockAlign="center">
          <Icon source={PaintBrushFlatIcon} />
          <span>Storefront</span>
        </InlineStack>
      ),
      panelID: "storefront-panel",
    },
    {
      id: "theme",
      content: (
        <InlineStack gap="200" blockAlign="center">
          <Icon source={ThemeEditIcon} />
          <span>Theme setup</span>
        </InlineStack>
      ),
      panelID: "theme-panel",
    },
    {
      id: "translation",
      content: (
        <InlineStack gap="200" blockAlign="center">
          <Icon source={LanguageIcon} />
          <span>Translation</span>
        </InlineStack>
      ),
      panelID: "translation-panel",
    },
  ], []);

  return (
    <Page fullWidth>
      <TitleBar title="Settings" />

      <div style={{ maxWidth: "1180px", margin: "0 auto", padding: "18px 0 40px" }}>
        <BlockStack gap="500">
          <div style={{
            backgroundColor: "#FFFFFF",
            border: "1px solid #E3E3E3",
            borderRadius: "14px",
            padding: "24px",
            boxShadow: "0 1px 2px rgba(0, 0, 0, 0.04)",
          }}>
            <InlineStack align="space-between" blockAlign="start" gap="500">
              <BlockStack gap="300">
                <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", flexWrap: "wrap", alignSelf: "flex-start" }}>
                  <Badge tone={settings.appEnabled ? "success" : "critical"}>{appStatusLabel}</Badge>
                  {hasChanges && <Badge tone="attention">Unsaved changes</Badge>}
                </div>
                <BlockStack gap="150">
                  <Text variant="heading2xl" as="h1">Settings</Text>
                  <Text variant="bodyMd" tone="subdued">
                    Manage storefront behavior, app visibility, theme setup, and customer-facing labels from one place.
                  </Text>
                </BlockStack>
              </BlockStack>
              <InlineStack gap="300" wrap={false}>
                <Button icon={ExternalIcon} url={themeEditorUrl} external>Theme editor</Button>
                <Button
                  variant="primary"
                  icon={SaveIcon}
                  onClick={handleSave}
                  loading={isSaving}
                  disabled={!hasChanges && !isSaving}
                >
                  Save changes
                </Button>
              </InlineStack>
            </InlineStack>
          </div>

          <InlineGrid columns={{ xs: 1, sm: 2, md: 3 }} gap="400">
            <MetricCard
              icon={StoreOnlineIcon}
              label="App visibility"
              value={appStatusLabel}
              helpText={settings.appEnabled ? "Storefront rendering is allowed" : "Storefront output is disabled"}
              tone={settings.appEnabled ? "#008060" : "#D82C0D"}
              background={settings.appEnabled ? "#EAF8F0" : "#FFF1F0"}
            />
            <MetricCard
              icon={DesktopIcon}
              label="Product cards"
              value={cardStatusLabel}
              helpText={productCardHelpText}
              tone={settings.showOnProductCards ? "#2C6ECB" : "#8A6116"}
            />
            <MetricCard
              icon={LanguageIcon}
              label="Storefront label"
              value={optionLabelPreview}
              helpText="Preview using Color as the option name"
              tone="#8A6116"
            />
          </InlineGrid>

          <Card padding="0">
            <Tabs tabs={tabs} selected={selectedTab} onSelect={setSelectedTab}>
              <div style={{ padding: "20px" }}>
                {selectedTab === 0 && (
                  <InlineGrid columns={{ xs: 1, md: "2fr 1fr" }} gap="500">
                    <BlockStack gap="500">
                      <Card padding="500">
                        <BlockStack gap="400">
                          <SectionHeader
                            icon={AppExtensionIcon}
                            title="App visibility"
                            description="Control whether linked product options can render on your storefront."
                            badge={<Badge tone={settings.appEnabled ? "success" : "critical"}>{appStatusLabel}</Badge>}
                          />
                          <Divider />
                          <ToggleRow
                            title={settings.appEnabled ? "App is active" : "App is disabled"}
                            description="When disabled, the app keeps admin data intact but stops storefront rendering."
                            checked={settings.appEnabled}
                            onChange={(value) => handleSettingChange("appEnabled", value)}
                          />
                        </BlockStack>
                      </Card>

                      <Card padding="500">
                        <BlockStack gap="400">
                          <SectionHeader
                            icon={PaintBrushFlatIcon}
                            title="Storefront defaults"
                            description="Set the default option wording used when new groups are created."
                          />
                          <Divider />
                          <TextField
                            label="Default option label"
                            value={settings.selectOptionLabel || ""}
                            onChange={(value) => handleSettingChange("selectOptionLabel", value)}
                            helpText="Use {option} as a placeholder. Example: Choose {option}."
                            autoComplete="off"
                          />
                        </BlockStack>
                      </Card>
                    </BlockStack>

                    <Card padding="500">
                      <BlockStack gap="400">
                        <IconBox icon={SettingsIcon} tone="#2C6ECB" />
                        <BlockStack gap="100">
                          <Text variant="headingMd" as="h2">Settings sync</Text>
                          <Text variant="bodyMd" tone="subdued">
                            Saving this page writes shop-level metafields so the theme extension can read the latest storefront defaults.
                          </Text>
                        </BlockStack>
                        <Divider />
                        <BlockStack gap="200">
                          <InlineStack align="space-between">
                            <Text as="p" variant="bodySm" tone="subdued">Shop</Text>
                            <Text as="p" variant="bodySm" fontWeight="semibold">{shop}</Text>
                          </InlineStack>
                          <InlineStack align="space-between">
                            <Text as="p" variant="bodySm" tone="subdued">Theme setup</Text>
                            <Badge tone="info">Manual review</Badge>
                          </InlineStack>
                          <InlineStack align="space-between">
                            <Text as="p" variant="bodySm" tone="subdued">Changes</Text>
                            <Badge tone={hasChanges ? "attention" : "success"}>{hasChanges ? "Pending" : "Saved"}</Badge>
                          </InlineStack>
                        </BlockStack>
                      </BlockStack>
                    </Card>
                  </InlineGrid>
                )}

                {selectedTab === 1 && (
                  <BlockStack gap="500">
                    <Card padding="500">
                      <BlockStack gap="400">
                        <SectionHeader
                          icon={DesktopIcon}
                          title="Product card display"
                          description="Choose where linked options appear in product grids."
                          badge={<Badge tone={settings.showOnProductCards ? "success" : "attention"}>{cardStatusLabel}</Badge>}
                        />
                        <Divider />
                        <ToggleRow
                          title="Show options on product cards"
                          description="Display linked product options in collection grids, search results, and selected home sections."
                          checked={settings.showOnProductCards}
                          onChange={(value) => handleSettingChange("showOnProductCards", value)}
                        />
                        {settings.showOnProductCards && (
                          <div style={{
                            border: "1px solid #E3E3E3",
                            borderRadius: "12px",
                            padding: "16px",
                            backgroundColor: "#FAFAFA",
                          }}>
                            <BlockStack gap="300">
                              <Text as="p" variant="bodyMd" fontWeight="semibold">Card surfaces</Text>
                              <InlineGrid columns={{ xs: 1, sm: 3 }} gap="300">
                                <Checkbox label="Collection pages" checked={Boolean(settings.applyToCollection)} onChange={(value) => handleSettingChange("applyToCollection", value)} />
                                <Checkbox label="Search results" checked={Boolean(settings.applyToSearch)} onChange={(value) => handleSettingChange("applyToSearch", value)} />
                                <Checkbox label="Home page sections" checked={Boolean(settings.applyToHome)} onChange={(value) => handleSettingChange("applyToHome", value)} />
                              </InlineGrid>
                            </BlockStack>
                          </div>
                        )}
                      </BlockStack>
                    </Card>

                    <Card padding="500">
                      <BlockStack gap="400">
                        <SectionHeader
                          icon={CheckCircleIcon}
                          title="Product page behavior"
                          description="Control the label shown above product-page linked options."
                        />
                        <Divider />
                        <ToggleRow
                          title="Show option name"
                          description="Show the option label and selected value above storefront options."
                          checked={settings.showOptionName}
                          onChange={(value) => handleSettingChange("showOptionName", value)}
                        />
                      </BlockStack>
                    </Card>

                    <Card padding="500">
                      <BlockStack gap="400">
                        <SectionHeader
                          icon={CodeIcon}
                          title="Custom CSS"
                          description="Inject CSS for advanced storefront overrides."
                        />
                        <Divider />
                        <InlineGrid columns={{ xs: 1, md: 2 }} gap="400">
                          <TextField
                            label="Product page CSS"
                            value={settings.customCssProduct || ""}
                            onChange={(value) => handleSettingChange("customCssProduct", value)}
                            multiline={6}
                            autoComplete="off"
                            placeholder=".linked-product-options { }"
                          />
                          <TextField
                            label="Collection page CSS"
                            value={settings.customCssCollection || ""}
                            onChange={(value) => handleSettingChange("customCssCollection", value)}
                            multiline={6}
                            autoComplete="off"
                            placeholder=".linked-product-card-swatches { }"
                          />
                        </InlineGrid>
                      </BlockStack>
                    </Card>
                  </BlockStack>
                )}

                {selectedTab === 2 && (
                  <InlineGrid columns={{ xs: 1, md: "2fr 1fr" }} gap="500">
                    <Card padding="500">
                      <BlockStack gap="400">
                        <SectionHeader
                          icon={ThemeEditIcon}
                          title="Theme setup"
                          description="Enable the app embed in Shopify's theme editor so storefront assets can load."
                          badge={<Badge tone="info">One-time setup</Badge>}
                        />
                        <Divider />
                        <div style={{
                          border: "1px solid #E3E3E3",
                          borderRadius: "12px",
                          padding: "18px",
                          backgroundColor: "#FAFAFA",
                        }}>
                          <InlineStack align="space-between" blockAlign="center" gap="400">
                            <InlineStack gap="300" blockAlign="center" wrap={false}>
                              <IconBox icon={AppExtensionIcon} tone="#008060" background="#EAF8F0" />
                              <BlockStack gap="100">
                                <Text as="p" variant="bodyMd" fontWeight="semibold">Linked Product Variants app embed</Text>
                                <Text as="p" variant="bodySm" tone="subdued">Open the theme editor and turn on the app embed for your active theme.</Text>
                              </BlockStack>
                            </InlineStack>
                            <Button variant="primary" icon={ExternalIcon} url={themeEditorUrl} external>Open theme editor</Button>
                          </InlineStack>
                        </div>
                        <Banner tone="info" icon={MagicIcon}>
                          <p>For Online Store 2.0 themes, you can also add the app block on product templates when you need exact placement.</p>
                        </Banner>
                      </BlockStack>
                    </Card>

                    <Card padding="500">
                      <BlockStack gap="400">
                        <IconBox icon={CheckCircleIcon} tone="#008060" background="#EAF8F0" />
                        <BlockStack gap="100">
                          <Text variant="headingMd" as="h2">Checklist</Text>
                          <Text variant="bodyMd" tone="subdued">Use this quick review after editing your theme.</Text>
                        </BlockStack>
                        <Divider />
                        <BlockStack gap="300">
                          <InlineStack gap="200" blockAlign="center" wrap={false}>
                            <Icon source={CheckCircleIcon} tone="success" />
                            <Text as="p">App embed is enabled</Text>
                          </InlineStack>
                          <InlineStack gap="200" blockAlign="center" wrap={false}>
                            <Icon source={CheckCircleIcon} tone="success" />
                            <Text as="p">Product template shows options</Text>
                          </InlineStack>
                          <InlineStack gap="200" blockAlign="center" wrap={false}>
                            <Icon source={CheckCircleIcon} tone="success" />
                            <Text as="p">Collection cards match your product card settings</Text>
                          </InlineStack>
                        </BlockStack>
                      </BlockStack>
                    </Card>
                  </InlineGrid>
                )}

                {selectedTab === 3 && (
                  <InlineGrid columns={{ xs: 1, md: "2fr 1fr" }} gap="500">
                    <Card padding="500">
                      <BlockStack gap="400">
                        <SectionHeader
                          icon={LanguageIcon}
                          title="Storefront labels"
                          description="Customize customer-facing text in your storefront options."
                        />
                        <Divider />
                        <InlineGrid columns={{ xs: 1, sm: 2 }} gap="400">
                          <TextField
                            label="Sold out text"
                            value={settings.soldOutLabel || ""}
                            onChange={(value) => handleSettingChange("soldOutLabel", value)}
                            autoComplete="off"
                          />
                          <TextField
                            label="Unavailable text"
                            value={settings.unavailableLabel || ""}
                            onChange={(value) => handleSettingChange("unavailableLabel", value)}
                            autoComplete="off"
                          />
                        </InlineGrid>
                      </BlockStack>
                    </Card>

                    <Card padding="500">
                      <BlockStack gap="400">
                        <SectionHeader
                          icon={StoreOnlineIcon}
                          title="Preview"
                          description="Example customer-facing copy."
                        />
                        <Divider />
                        <BlockStack gap="300">
                          <div style={{ border: "1px solid #E3E3E3", borderRadius: "12px", padding: "14px", backgroundColor: "#FAFAFA" }}>
                            <Text as="p" variant="bodyMd" fontWeight="semibold">{optionLabelPreview}</Text>
                          </div>
                          <div style={{ border: "1px solid #E3E3E3", borderRadius: "12px", padding: "14px", backgroundColor: "#FAFAFA" }}>
                            <Text as="p" variant="bodyMd">{settings.soldOutLabel || "Sold out"}</Text>
                          </div>
                          <div style={{ border: "1px solid #E3E3E3", borderRadius: "12px", padding: "14px", backgroundColor: "#FAFAFA" }}>
                            <Text as="p" variant="bodyMd">{settings.unavailableLabel || "Unavailable"}</Text>
                          </div>
                        </BlockStack>
                      </BlockStack>
                    </Card>
                  </InlineGrid>
                )}
              </div>
            </Tabs>
          </Card>

          <InlineStack align="center">
            <Text variant="bodySm" tone="subdued">Linkify: Product Variants settings</Text>
          </InlineStack>
        </BlockStack>
      </div>
    </Page>
  );
}

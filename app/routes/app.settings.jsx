import { useState, useCallback } from "react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  Text,
  InlineStack,
  Badge,
  Box,
  Divider,
  Icon,
  Button,
  Select,
  TextField,
  Banner,
} from "@shopify/polaris";
import { SettingsIcon, SaveIcon, AlertCircleIcon, RefreshIcon } from "@shopify/polaris-icons";
import { TitleBar } from "@shopify/app-bridge-react";

export default function SettingsPage() {
  const [appStatus, setAppStatus] = useState("enabled");
  const [defaultStyle, setDefaultStyle] = useState("block");
  const [swatchShape, setSwatchShape] = useState("circle");
  const [showBanner, setShowBanner] = useState(false);

  const handleSave = () => {
    setShowBanner(true);
    setTimeout(() => setShowBanner(false), 3000);
  };

  return (
    <Page title="Settings">
      <TitleBar title="Settings">
        <button variant="primary" onClick={handleSave}>Save Settings</button>
      </TitleBar>
      <Layout>
        <Layout.Section>
          <BlockStack gap="500">
            {showBanner && (
              <Banner tone="success" onDismiss={() => setShowBanner(false)}>
                Cài đặt đã được lưu thành công!
              </Banner>
            )}

            <Card>
              <BlockStack gap="400">
                 <Text variant="headingMd">General Status</Text>
                 <InlineStack align="space-between" blockAlign="center">
                    <BlockStack gap="100">
                       <Text variant="bodyMd">Application Status</Text>
                       <Text variant="bodySm" tone="subdued">Enable or disable the linked products functionality on your storefront.</Text>
                    </BlockStack>
                    <Select
                      label="Status"
                      labelHidden
                      options={[
                        { label: "Enabled", value: "enabled" },
                        { label: "Disabled", value: "disabled" },
                      ]}
                      value={appStatus}
                      onChange={setAppStatus}
                    />
                 </InlineStack>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="400">
                 <Text variant="headingMd">Global Defaults</Text>
                 <Text variant="bodyMd" tone="subdued">Set the default behavior for new product groups.</Text>
                 <Grid>
                    <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 6, lg: 6, xl: 6 }}>
                      <Select
                        label="Default Selector Style"
                        options={[
                          { label: "Text Block", value: "block" },
                          { label: "Color Swatch", value: "swatch" },
                          { label: "Product Image", value: "variant_image" },
                        ]}
                        value={defaultStyle}
                        onChange={setDefaultStyle}
                      />
                    </Grid.Cell>
                    <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 6, lg: 6, xl: 6 }}>
                      <Select
                        label="Swatch Shape"
                        options={[
                          { label: "Circle", value: "circle" },
                          { label: "Square", value: "square" },
                        ]}
                        value={swatchShape}
                        onChange={setSwatchShape}
                        disabled={defaultStyle !== "swatch"}
                      />
                    </Grid.Cell>
                 </Grid>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="400">
                 <Text variant="headingMd">Maintenance & Database</Text>
                 <InlineStack align="space-between" blockAlign="center">
                    <BlockStack gap="100">
                       <Text variant="bodyMd">Force Sync Metafields</Text>
                       <Text variant="bodySm" tone="subdued">Recalculate and sync all linked product metafields for all groups.</Text>
                    </BlockStack>
                    <Button icon={RefreshIcon}>Sync All Groups</Button>
                 </InlineStack>
                 <Divider />
                 <InlineStack align="space-between" blockAlign="center">
                    <BlockStack gap="100">
                       <Text variant="bodyMd" tone="critical">Clear App Data</Text>
                       <Text variant="bodySm" tone="subdued">Warning: This will delete all your groups and automation rules.</Text>
                    </BlockStack>
                    <Button tone="critical" variant="secondary">Clear All Data</Button>
                 </InlineStack>
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
        <Layout.Section variant="oneThird">
           <Card>
              <BlockStack gap="300">
                 <Text variant="headingMd">App Information</Text>
                 <InlineStack align="space-between">
                    <Text variant="bodySm" tone="subdued">Version</Text>
                    <Text variant="bodySm" fontWeight="bold">2.4.0 (Stable)</Text>
                 </InlineStack>
                 <InlineStack align="space-between">
                    <Text variant="bodySm" tone="subdued">Prisma Engine</Text>
                    <Text variant="bodySm" fontWeight="bold">PostgreSQL</Text>
                 </InlineStack>
                 <InlineStack align="space-between">
                    <Text variant="bodySm" tone="subdued">Metafield Namespace</Text>
                    <Text variant="bodySm" fontWeight="bold">linked_products</Text>
                 </InlineStack>
                 <Divider />
                 <Box background="bg-surface-warning-secondary" padding="300" borderRadius="200">
                    <InlineStack gap="200" blockAlign="center">
                       <Icon source={AlertCircleIcon} tone="warning" />
                       <Text variant="bodySm">Changes may take up to 30 seconds to reflect on your storefront due to caching.</Text>
                    </InlineStack>
                 </Box>
              </BlockStack>
           </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

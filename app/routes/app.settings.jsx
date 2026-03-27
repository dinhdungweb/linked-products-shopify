import { useState, useCallback } from "react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  Text,
  InlineStack,
  Box,
  Divider,
  Icon,
  Button,
  TextField,
  Banner,
  Checkbox,
  Grid,
  Tabs,
  Badge,
} from "@shopify/polaris";
import { 
  SettingsIcon, 
  ExternalIcon, 
  LanguageIcon,
  AlertCircleIcon,
  CheckCircleIcon,
} from "@shopify/polaris-icons";
import { TitleBar } from "@shopify/app-bridge-react";

export default function SettingsPage() {
  const [selectedTab, setSelectedTab] = useState(0);
  const [showBanner, setShowBanner] = useState(false);

  // Settings State
  const [settings, setSettings] = useState({
    appEnabled: true,
    showOnProductCards: true,
    applyToCollection: true,
    applyToSearch: true,
    applyToHome: false,
    hideMultiOptionOnCards: true,
    hideInaccessible: true,
    removeArchived: false,
    seamlessSwitching: false,
    autoScroll: false,
    enableAutosuggestion: true,
    notificationEmail: "",
    customCssProduct: "",
    customCssCollection: ".king-linked-options-collection__container {\n \n}",
  });

  // Translation State
  const [translations, setTranslations] = useState({
    selectOption: "Select {option}",
    soldOut: "Sold out",
    unavailable: "Unavailable",
  });

  const handleTabChange = useCallback(
    (selectedTabIndex) => setSelectedTab(selectedTabIndex),
    [],
  );

  const handleSettingChange = (key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const handleTranslationChange = (key, value) => {
    setTranslations(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    setShowBanner(true);
    setTimeout(() => setShowBanner(false), 3000);
  };

  const tabs = [
    {
      id: "settings",
      content: (
        <InlineStack gap="200" align="start" blockAlign="center">
          <Icon source={SettingsIcon} />
          <span>Settings</span>
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
  ];

  const renderSettingsTab = () => (
    <BlockStack gap="500">
      {/* App Status */}
      <Layout.AnnotatedSection
        title="App status"
        description="Globally turn on or turn off linked options."
      >
        <Card>
          <InlineStack align="space-between" blockAlign="center">
            <InlineStack gap="200" blockAlign="center">
               <Text variant="bodyMd">App enabled</Text>
               <Badge tone={settings.appEnabled ? "success" : "attention"}>
                 {settings.appEnabled ? "On" : "Off"}
               </Badge>
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

      {/* Show options on product cards */}
      <Layout.AnnotatedSection
        title="Show options on product cards"
        description="Product cards include those on collection pages, featured products, recommended products, and more."
      >
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

            <Checkbox
              label="Hide multi-option groups on product cards"
              checked={settings.hideMultiOptionOnCards}
              onChange={(v) => handleSettingChange("hideMultiOptionOnCards", v)}
            />
          </BlockStack>
        </Card>
      </Layout.AnnotatedSection>

      {/* Hide inaccessible storefront products */}
      <Layout.AnnotatedSection
        title="Hide inaccessible storefront products"
        description="Automatically hides products that aren't accessible to customers, helping prevent 404 errors and broken links."
      >
        <Card>
          <BlockStack gap="300">
             <Checkbox
               label="Hide inaccessible products"
               checked={settings.hideInaccessible}
               onChange={(v) => handleSettingChange("hideInaccessible", v)}
               helpText="Automatically hides draft, archived, or unpublished products from groups."
             />
             <Checkbox
               label="Remove archived products"
               checked={settings.removeArchived}
               onChange={(v) => handleSettingChange("removeArchived", v)}
               helpText="Automatically removes archived products from groups."
             />
          </BlockStack>
        </Card>
      </Layout.AnnotatedSection>

      {/* Storefront Experience */}
      <Layout.AnnotatedSection
        title="Storefront experience"
        description="Enhance the shopping experience with smooth transitions and smart scrolling."
      >
        <Card>
          <BlockStack gap="400">
             <Checkbox
               label="Enable seamless product switching (Beta)"
               checked={settings.seamlessSwitching}
               onChange={(v) => handleSettingChange("seamlessSwitching", v)}
               helpText="Update product details and URL without reloading the page for a smoother experience."
             />
             <Checkbox
               label="Enable auto scroll to previous position"
               checked={settings.autoScroll}
               onChange={(v) => handleSettingChange("autoScroll", v)}
               helpText="Automatically scrolls to where the option was on the previous page after switching."
             />
          </BlockStack>
        </Card>
      </Layout.AnnotatedSection>

      {/* Product Creation */}
      <Layout.AnnotatedSection
        title="Product creation"
        description="Smart tools to speed up your workflow when managing groups."
      >
        <Card>
           <Checkbox
             label="Enable autosuggestion"
             checked={settings.enableAutosuggestion}
             onChange={(v) => handleSettingChange("enableAutosuggestion", v)}
             helpText="Suggest option values based on your past entries while you create new product groups."
           />
        </Card>
      </Layout.AnnotatedSection>

      {/* Notifications */}
      <Layout.AnnotatedSection
        title="Notification email"
        description="Email address for receiving app notifications."
      >
        <Card>
          <TextField
            label="Notification email address"
            value={settings.notificationEmail}
            onChange={(v) => handleSettingChange("notificationEmail", v)}
            placeholder="support@example.com"
            autoComplete="email"
            helpText="Used to receive app notifications such as import/export results."
          />
        </Card>
      </Layout.AnnotatedSection>

      {/* Custom CSS */}
      <Layout.AnnotatedSection
        title="Customize"
        description="Customize CSS to control the app block style."
      >
        <Card>
          <BlockStack gap="400">
            <TextField
              label="Custom CSS for product page"
              value={settings.customCssProduct}
              onChange={(v) => handleSettingChange("customCssProduct", v)}
              multiline={4}
              autoComplete="off"
            />
            <TextField
              label="Custom CSS for collection page"
              value={settings.customCssCollection}
              onChange={(v) => handleSettingChange("customCssCollection", v)}
              multiline={6}
              autoComplete="off"
            />
            <Text variant="bodySm" tone="subdued">
              Need help with styling? Please <a href="/app/support">contact support</a>.
            </Text>
          </BlockStack>
        </Card>
      </Layout.AnnotatedSection>
    </BlockStack>
  );

  const renderThemeSetupTab = () => (
    <BlockStack gap="500">
      <Layout.AnnotatedSection
        title="App Embed"
        description="The app must be enabled in your theme settings to display linked options."
      >
        <Card>
          <BlockStack gap="400">
            <Box padding="400" background="bg-surface-info-secondary" borderRadius="200">
              <InlineStack gap="300" blockAlign="center">
                <Icon source={AlertCircleIcon} tone="info" />
                <Text variant="bodyMd" fontWeight="semibold">Required Action</Text>
              </InlineStack>
              <Box paddingBlockStart="200">
                <Text variant="bodyMd">You must enable the app embed in your Shopify Theme Editor for the app to work.</Text>
              </Box>
            </Box>
            
            <BlockStack gap="200">
              <Text variant="headingSm">Steps to enable:</Text>
              <Text as="p">1. Click the button below to open Theme Editor.</Text>
              <Text as="p">2. Find <b>Linked Product Variants</b> in the App Embeds tab.</Text>
              <Text as="p">3. Toggle it <b>ON</b> and click <b>Save</b>.</Text>
            </BlockStack>

            <Button primary url="https://admin.shopify.com/store/current/themes/current/editor?context=apps" target="_blank">
              Open Theme Editor
            </Button>
          </BlockStack>
        </Card>
      </Layout.AnnotatedSection>
    </BlockStack>
  );

  const renderTranslationTab = () => (
    <BlockStack gap="500">
      <Layout.AnnotatedSection
        title="Storefront labels"
        description="Translate or customize labels displayed on your store."
      >
        <Card>
          <BlockStack gap="400">
            <TextField
              label="Select option label"
              value={translations.selectOption}
              onChange={(v) => handleTranslationChange("selectOption", v)}
              helpText="Use {option} as a placeholder for the option name (e.g. Color)."
              autoComplete="off"
            />
            <TextField
              label="Sold out label"
              value={translations.soldOut}
              onChange={(v) => handleTranslationChange("soldOut", v)}
              autoComplete="off"
            />
            <TextField
              label="Unavailable label"
              value={translations.unavailable}
              onChange={(v) => handleTranslationChange("unavailable", v)}
              autoComplete="off"
            />
          </BlockStack>
        </Card>
      </Layout.AnnotatedSection>
    </BlockStack>
  );

  return (
    <Page>
      <TitleBar title="Settings">
        <button variant="primary" onClick={handleSave}>Save Settings</button>
      </TitleBar>

      <BlockStack gap="500">
        <Box paddingBlockEnd="200">
           <BlockStack gap="200">
              <Text variant="headingXl">Settings</Text>
              <Text variant="bodyMd" tone="subdued">Manage your app settings and preferences.</Text>
           </BlockStack>
        </Box>

        <Tabs tabs={tabs} selected={selectedTab} onSelect={handleTabChange}>
          <Box paddingBlockStart="500" paddingBlockEnd="800">
             {showBanner && (
               <Box paddingBlockEnd="400">
                 <Banner tone="success" onDismiss={() => setShowBanner(false)}>
                   Settings saved successfully!
                 </Banner>
               </Box>
             )}

             {selectedTab === 0 && renderSettingsTab()}
             {selectedTab === 1 && renderThemeSetupTab()}
             {selectedTab === 2 && renderTranslationTab()}
          </Box>
        </Tabs>

        {/* Floating Save Button Bar - Optional UX enhancement */}
        <Box paddingBlockStart="400" paddingBlockEnd="600">
          <InlineStack align="end">
             <Button variant="primary" size="large" onClick={handleSave} icon={CheckCircleIcon}>Save Changes</Button>
          </InlineStack>
        </Box>
      </BlockStack>
    </Page>
  );
}


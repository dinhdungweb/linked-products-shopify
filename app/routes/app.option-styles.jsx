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
  Grid,
} from "@shopify/polaris";
import { ImageIcon, TextIcon, PaintBrushRoundIcon, MenuIcon } from "@shopify/polaris-icons";
import { TitleBar } from "@shopify/app-bridge-react";

export default function OptionStylesPage() {
  const styles = [
    {
      id: "block",
      title: "Text Block",
      icon: TextIcon,
      description: "Clean simple text blocks. Best for sizes or technical specifications.",
      preview: (
        <InlineStack gap="200">
          <Box padding="200" borderStyle="solid" borderWidth="025" borderColor="border" borderRadius="100">
             <Text variant="bodyMd">S</Text>
          </Box>
          <Box padding="200" borderStyle="solid" borderWidth="025" borderColor="border-inverse" borderRadius="100" background="bg-surface-inverse">
             <Text variant="bodyMd" tone="text-inverse">M</Text>
          </Box>
          <Box padding="200" borderStyle="solid" borderWidth="025" borderColor="border" borderRadius="100">
             <Text variant="bodyMd">L</Text>
          </Box>
        </InlineStack>
      )
    },
    {
      id: "swatch",
      title: "Color Swatch",
      icon: PaintBrushRoundIcon,
      description: "Round or square color swatches. Perfect for fashion and home decor.",
      preview: (
        <InlineStack gap="200">
          <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: '#ff0000', border: '2px solid #fff', boxShadow: '0 0 0 1px rgba(0,0,0,0.1)' }} />
          <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: '#0000ff', border: '2px solid #fff', boxShadow: '0 0 0 1px #000' }} />
          <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: '#00ff00', border: '2px solid #fff', boxShadow: '0 0 0 1px rgba(0,0,0,0.1)' }} />
        </InlineStack>
      )
    },
    {
      id: "variant_image",
      title: "Product Image",
      icon: ImageIcon,
      description: "Show actual product images as options. Best for visual variants.",
      preview: (
        <InlineStack gap="200">
          <div style={{ width: '40px', height: '40px', borderRadius: '4px', overflow: 'hidden', border: '1px solid #eee' }}>
            <img src="https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-image_extra_small.png" alt="" style={{ width: '100%' }} />
          </div>
          <div style={{ width: '40px', height: '40px', borderRadius: '4px', overflow: 'hidden', border: '2px solid #000' }}>
            <img src="https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-image_extra_small.png" alt="" style={{ width: '100%' }} />
          </div>
        </InlineStack>
      )
    },
    {
      id: "dropdown",
      title: "Standard Dropdown",
      icon: MenuIcon,
      description: "Classical dropdown selector. Good for long lists of options.",
      preview: (
        <div style={{ width: '150px', padding: '8px', border: '1px solid #ccc', borderRadius: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text variant="bodyMd">Select option...</Text>
          <Icon source={MenuIcon} size="extraSmall" />
        </div>
      )
    }
  ];

  return (
    <Page title="Option Styles">
      <TitleBar title="Option Styles" />
      <Layout>
        <Layout.Section>
          <BlockStack gap="500">
            <Card>
              <BlockStack gap="400">
                 <Text variant="headingLg">Global Style Previews</Text>
                 <Text variant="bodyMd" tone="subdued">
                   These are the available styles for your linked products. You can configure the style for each individual group in the Group Settings.
                 </Text>
              </BlockStack>
            </Card>

            <Grid>
               {styles.map((style) => (
                 <Grid.Cell key={style.id} columnSpan={{ xs: 6, sm: 6, md: 3, lg: 3, xl: 3 }}>
                    <Card height="100%">
                       <BlockStack gap="400">
                          <InlineStack gap="200" blockAlign="center">
                             <Icon source={style.icon} color="base" />
                             <Text variant="headingMd">{style.title}</Text>
                          </InlineStack>
                          <Box minHeight="60px">
                             <Text variant="bodySm" tone="subdued">{style.description}</Text>
                          </Box>
                          <Divider />
                          <Box padding="200">
                             {style.preview}
                          </Box>
                          <Button variant="plain" url="/app/groups">Configure in Groups</Button>
                       </BlockStack>
                    </Card>
                 </Grid.Cell>
               ))}
            </Grid>

            <Card>
               <BlockStack gap="400">
                  <Text variant="headingMd">Custom CSS</Text>
                  <Text variant="bodyMd">
                    Want to customize the styles even further? You can add custom CSS to your theme to match your brand's unique look.
                  </Text>
                  <Box padding="400" background="bg-surface-secondary" borderRadius="200">
                    <pre style={{ fontSize: '12px', margin: 0 }}>
{`.lp-swatch-item {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  transition: transform 0.2s;
}
.lp-swatch-item:hover {
  transform: scale(1.1);
}`}
                    </pre>
                  </Box>
                  <Button variant="plain" url="/app/help">View CSS Documentation</Button>
               </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

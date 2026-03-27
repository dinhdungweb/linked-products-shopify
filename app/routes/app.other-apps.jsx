import {
  Page,
  Layout,
  Card,
  BlockStack,
  Text,
  InlineStack,
  Box,
  Button,
  Grid,
  Thumbnail,
} from "@shopify/polaris";
import { StarFilledIcon, ExternalIcon } from "@shopify/polaris-icons";
import { TitleBar } from "@shopify/app-bridge-react";

export default function OtherAppsPage() {
  const otherApps = [
    {
      title: "SEO Optimizer & Image Fix",
      rating: "5.0",
      reviews: "2,400+",
      desc: "Speed up your store and improve SEO with one-click image optimization and meta tag fixing.",
      icon: "https://cdn.shopify.com/app-store/listing_images/6f88f0a0e9a7e6d2b4f6d7e8/icon/2d7e8b6c.png"
    },
    {
      title: "Bulk Discount & Sales Manager",
      rating: "4.9",
      reviews: "1,850+",
      desc: "Run schedule sales and bulk discounts across your entire store easily.",
      icon: "https://cdn.shopify.com/app-store/listing_images/7e8b6c2d/icon/6f88f0a0.png"
    },
    {
      title: "Order Printer & PDF Invoices",
      rating: "4.8",
      reviews: "950+",
      desc: "Professional PDF invoices, packing slips, and refunds for your orders.",
      icon: "https://cdn.shopify.com/app-store/listing_images/a0e9a7e6/icon/f6d7e8b6.png"
    }
  ];

  return (
    <Page title="Our Other Apps">
      <TitleBar title="Other Apps" />
      <Layout>
        <Layout.Section>
          <BlockStack gap="500">
            <Card>
              <BlockStack gap="400">
                 <Text variant="headingLg">Boost your store even further!</Text>
                 <Text variant="bodyMd" tone="subdued">
                   Explore our collection of top-rated Shopify apps designed to help you grow your business.
                 </Text>
              </BlockStack>
            </Card>

            <Grid>
               {otherApps.map((app, index) => (
                 <Grid.Cell key={index} columnSpan={{ xs: 6, sm: 6, md: 4, lg: 4, xl: 4 }}>
                    <Card height="100%">
                       <BlockStack gap="400">
                          <InlineStack gap="300" blockAlign="center">
                             <Thumbnail source={app.icon || "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-image_extra_small.png"} alt={app.title} size="medium" />
                             <BlockStack gap="050">
                                <Text variant="headingMd">{app.title}</Text>
                                <InlineStack gap="100" blockAlign="center">
                                   <StarFilledIcon style={{ width: '14px', fill: '#FFB800' }} />
                                   <Text variant="bodySm" fontWeight="bold">{app.rating}</Text>
                                   <Text variant="bodySm" tone="subdued">({app.reviews})</Text>
                                </InlineStack>
                             </BlockStack>
                          </InlineStack>
                          <Box minHeight="60px">
                             <Text variant="bodySm" tone="subdued">{app.desc}</Text>
                          </Box>
                          <Button fullWidth icon={ExternalIcon} variant="secondary">View on App Store</Button>
                       </BlockStack>
                    </Card>
                 </Grid.Cell>
               ))}
            </Grid>

            <Box paddingBlock="400">
               <Card background="bg-surface-info-secondary">
                  <InlineStack align="space-between" blockAlign="center">
                     <BlockStack gap="200">
                        <Text variant="headingMd">Bundle Discount</Text>
                        <Text variant="bodyMd">Get 30% OFF when you install any 3 of our apps together!</Text>
                     </BlockStack>
                     <Button variant="primary">Claim Bundle</Button>
                  </InlineStack>
               </Card>
            </Box>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

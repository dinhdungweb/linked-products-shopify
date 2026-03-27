import { useState, useCallback, useEffect } from "react";
import { json } from "@remix-run/node";
import { useSubmit, useNavigation, useActionData } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  Text,
  Button,
  InlineStack,
  Banner,
  Box,
  ProgressBar,
  Icon,
  List,
  CalloutCard,
} from "@shopify/polaris";
import { ProductIcon, MagicIcon, AlertDiamondIcon, CheckCircleIcon } from "@shopify/polaris-icons";
import { useAppBridge, TitleBar } from "@shopify/app-bridge-react";

export async function action({ request }) {
  const { authenticate } = await import("../shopify.server");
  const { default: prisma } = await import("../db.server");

  const { session, admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const actionType = formData.get("action");

  if (actionType === "splitProduct") {
    const productId = formData.get("productId");
    const syncAfterSplit = formData.get("syncAfterSplit") === "true";

    if (!productId) return json({ error: "Product ID is missing" }, { status: 400 });

    try {
      // 1. Fetch source product and its variants
      const response = await admin.graphql(`
        query GetProduct($id: ID!) {
          product(id: $id) {
            id
            title
            bodyHtml
            vendor
            productType
            handle
            tags
            options { name values }
            images(first: 20) {
              edges { node { url } }
            }
            variants(first: 100) {
              edges {
                node {
                  id
                  title
                  price
                  sku
                  barcode
                  weight
                  weightUnit
                  inventoryQuantity
                  selectedOptions { name value }
                  image { url }
                }
              }
            }
          }
        }
      `, { variables: { id: productId } });

      const result = await response.json();
      const product = result.data?.product;

      if (!product) return json({ error: "Source product not found" }, { status: 404 });
      const variants = product.variants.edges.map(e => e.node);

      if (variants.length < 2) {
        return json({ error: "This product only has one variant. No need to split." }, { status: 400 });
      }

      const createdProducts = [];

      // 2. Create a new product for each variant
      for (const variant of variants) {
        // Create product title: "Base Title - Variant Value"
        const variantTitleSuffix = variant.selectedOptions.map(o => o.value).join(" / ");
        const newTitle = `${product.title} - ${variantTitleSuffix}`;

        const createMutation = await admin.graphql(`
          mutation productCreate($input: ProductInput!) {
            productCreate(input: $input) {
              product { id handle title }
              userErrors { field message }
            }
          }
        `, {
          variables: {
            input: {
              title: newTitle,
              bodyHtml: product.bodyHtml,
              vendor: product.vendor,
              productType: product.productType,
              tags: [...product.tags, "splitted-product"],
              variants: [{
                price: variant.price,
                sku: variant.sku,
                barcode: variant.barcode,
                weight: variant.weight,
                weightUnit: variant.weightUnit,
                inventoryQuantities: [{
                   locationId: (await getFirstLocation(admin)),
                   availableQuantity: variant.inventoryQuantity || 0
                }]
              }],
              images: variant.image ? [{ src: variant.image.url }] : (product.images.edges[0] ? [{ src: product.images.edges[0].node.url }] : [])
            }
          }
        });

        const createResult = await createMutation.json();
        if (createResult.data?.productCreate?.product) {
          createdProducts.push({
            id: createResult.data.productCreate.product.id,
            handle: createResult.data.productCreate.product.handle,
            title: createResult.data.productCreate.product.title,
            optionValue: variantTitleSuffix
          });
        }
      }

      // 3. Automatically link them together if requested
      if (syncAfterSplit && createdProducts.length >= 2) {
        const groupName = `Split: ${product.title}`;
        const newGroup = await prisma.productGroup.create({
          data: {
            shop: session.shop,
            name: groupName,
            optionName: product.options[0]?.name || "Option",
            selectorStyle: "block"
          }
        });

        for (let i = 0; i < createdProducts.length; i++) {
          await prisma.productGroupItem.create({
            data: {
              groupId: newGroup.id,
              productId: createdProducts[i].id,
              productHandle: createdProducts[i].handle,
              optionValue: createdProducts[i].optionValue,
              position: i + 1
            }
          });
        }
      }

      return json({ 
        success: true, 
        message: `Successfully split into ${createdProducts.length} separate products!`, 
        createdCount: createdProducts.length 
      });

    } catch (error) {
      console.error("Split Error:", error);
      return json({ error: `Failed to split product: ${error.message}` }, { status: 500 });
    }
  }

  return json({ error: "Invalid action" });
}

async function getFirstLocation(admin) {
  const response = await admin.graphql(`query { locations(first: 1) { edges { node { id } } } }`);
  const result = await response.json();
  return result.data?.locations?.edges[0]?.node?.id;
}

export default function SplitProductsPage() {
  const shopify = useAppBridge();
  const submit = useSubmit();
  const navigation = useNavigation();
  const actionData = useActionData();

  const [selectedProduct, setSelectedProduct] = useState(null);
  const [syncAfterSplit, setSyncAfterSplit] = useState(true);

  const isSplitting = navigation.state !== "idle" && navigation.formData?.get("action") === "splitProduct";

  const handleSelectProduct = useCallback(async () => {
    const selection = await shopify.resourcePicker({
      type: "product",
      multiple: false,
    });

    if (selection && selection.length > 0) {
      setSelectedProduct(selection[0]);
    }
  }, [shopify]);

  const handleRunSplit = useCallback(() => {
    if (!selectedProduct) return;
    if (!confirm(`Split "${selectedProduct.title}" into separate products? This will create new products in your store.`)) return;

    const fd = new FormData();
    fd.append("action", "splitProduct");
    fd.append("productId", selectedProduct.id);
    fd.append("syncAfterSplit", syncAfterSplit.toString());
    submit(fd, { method: "POST" });
  }, [selectedProduct, syncAfterSplit, submit]);

  return (
    <Page title="Split Products">
      <TitleBar title="Split Products" />
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
             {actionData?.success && (
               <Banner tone="success" title="Success!">
                 <p>{actionData.message}</p>
                 {syncAfterSplit && <p>A new Linked Group has been created for these products.</p>}
               </Banner>
             )}
             {actionData?.error && (
               <Banner tone="critical" title="Error splitting product">
                 <p>{actionData.error}</p>
               </Banner>
             )}

             <CalloutCard
               title="Split variants into separate products"
               illustration="https://cdn.shopify.com/s/assets/admin/checkout/settings-customize-533036a56e291244e8035ed8ae6a0e7a.svg"
               primaryAction={{
                 content: "Select Product",
                 onAction: handleSelectProduct,
               }}
             >
               <p>This tool helps you transform each variant of a selected product into its own separate product. Ideal for SEO and creating unique landing pages for each color/style.</p>
             </CalloutCard>

             {selectedProduct && (
               <Card>
                 <BlockStack gap="400">
                   <Text variant="headingMd">Selected Product</Text>
                   <InlineStack gap="400" align="start" blockAlign="center">
                      <Box background="bg-surface-secondary" padding="200" borderRadius="200">
                        <Icon source={ProductIcon} />
                      </Box>
                      <BlockStack gap="050" flex="1">
                        <Text variant="bodyMd" fontWeight="semibold">{selectedProduct.title}</Text>
                        <Text variant="bodySm" tone="subdued">{selectedProduct.variants?.length} variants will be split</Text>
                      </BlockStack>
                      <Button variant="plain" onClick={() => setSelectedProduct(null)}>Remove</Button>
                   </InlineStack>
                   
                   <Divider />
                   
                   <BlockStack gap="200">
                     <Text fontWeight="bold">Options</Text>
                     <List>
                        <List.Item>Create new products for each variant</List.Item>
                        <List.Item>Copy description, vendor, and tags</List.Item>
                        <List.Item>Sync inventory for the first location</List.Item>
                        <List.Item><b>Recommended:</b> Automatically create a linked group</List.Item>
                     </List>
                   </BlockStack>

                   <InlineStack align="space-between">
                     <div style={{ flex: 1 }}>
                       <Text variant="bodyMd">Link products automatically after split</Text>
                     </div>
                     <Button 
                       variant={syncAfterSplit ? "primary" : "secondary"}
                       onClick={() => setSyncAfterSplit(!syncAfterSplit)}
                       pressed={syncAfterSplit}
                     >
                       {syncAfterSplit ? "ON" : "OFF"}
                     </Button>
                   </InlineStack>

                   <Box paddingBlockStart="200">
                     <Button 
                       variant="primary" 
                       fullWidth 
                       loading={isSplitting}
                       onClick={handleRunSplit}
                       icon={MagicIcon}
                     >
                       Split Product Now
                     </Button>
                   </Box>
                 </BlockStack>
               </Card>
             )}
          </BlockStack>
        </Layout.Section>
        <Layout.Section variant="oneThird">
          <Card>
            <BlockStack gap="300">
               <Text variant="headingMd">Why use Split Products?</Text>
               <Text variant="bodySm" tone="subdued">
                 By default, Shopify variants share the same URL. By splitting them, you get:
               </Text>
               <List type="bullet">
                  <List.Item>Unique SEO URLs for each color/style</List.Item>
                  <List.Item>Specific titles and descriptions per variant</List.Item>
                  <List.Item>Better ranking for long-tail keywords</List.Item>
                  <List.Item>Ability to run specific ads for each color</List.Item>
               </List>
               <Box background="bg-surface-info-secondary" padding="300" borderRadius="200">
                  <InlineStack gap="200" blockAlign="center">
                    <Icon source={AlertDiamondIcon} tone="info" />
                    <Text variant="bodySm" fontWeight="bold">Draft the original product manually after splitting to avoid duplicates.</Text>
                  </InlineStack>
               </Box>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

import { useState, useCallback, useEffect } from "react";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation, useActionData, Link } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Button,
  BlockStack,
  Text,
  IndexTable,
  Badge,
  EmptyState,
  Modal,
  FormLayout,
  TextField,
  InlineStack,
  Banner,
  Thumbnail,
  Box,
  Divider,
  Tooltip,
  ProgressBar,
  Icon,
  Tabs,
  CalloutCard,
  Grid,
} from "@shopify/polaris";
import { 
  XIcon, 
  SearchIcon, 
  ViewIcon, 
  DeleteIcon, 
  ImportIcon,
  PlayCircleIcon,
  ClipboardChecklistIcon,
  MegaphoneIcon,
  ChatIcon,
  EmailIcon,
  QuestionCircleIcon,
  PlusCircleIcon,
  AutomationIcon,
  InfoIcon
} from "@shopify/polaris-icons";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import { PLANS } from "../billing.config";

// Loader - Get product groups list
export async function loader({ request }) {
  const { authenticate, MONTHLY_PLAN_BASIC, MONTHLY_PLAN_PRO } = await import("../shopify.server");
  const { default: prisma } = await import("../db.server");
  const { getUsageInfo, confirmSubscription } = await import("../billing.server");

  const { admin, session, billing } = await authenticate.admin(request);
  const shop = session.shop;

  let usageInfo;
  try {
    usageInfo = await getUsageInfo(shop);
  } catch (error) {
    console.error("Initial usage fetch error:", error);
  }

  // Robust & Fast Sync: Check Shopify Billing API status directly
  try {
    const billingCheck = await billing.check({
      isTest: true,
      plans: [MONTHLY_PLAN_BASIC, MONTHLY_PLAN_PRO],
    });

    const currentKnownPlan = usageInfo?.plan || 'free';

    if (billingCheck.hasActivePayment) {
      const activeSub = billingCheck.appSubscriptions[0];
      const planKey = activeSub.name.includes("Pro") ? "pro" : "basic";

      if (planKey !== currentKnownPlan) {
        console.log(`[Dashboard Loader] Plan sync initiated: ${currentKnownPlan} -> ${planKey}`);
        await confirmSubscription(admin, shop, planKey, activeSub);
        usageInfo = await getUsageInfo(shop);
      }
    } else if (currentKnownPlan !== 'free') {
      console.log(`[Dashboard Loader] Syncing back to free plan.`);
      await confirmSubscription(admin, shop, 'free', null);
      usageInfo = await getUsageInfo(shop);
    }
  } catch (error) {
    console.warn("[Dashboard Loader] Billing sync skipped:", error.message);
  }

  const groups = await prisma.productGroup.findMany({
    where: { shop: shop },
    include: {
      _count: { select: { products: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return json({ groups, shop: shop, usageInfo });
}

// Action - Create group, add products, and sync
export async function action({ request }) {
  const { authenticate } = await import("../shopify.server");
  const { default: prisma } = await import("../db.server");
  const { canAddLinks } = await import("../billing.server");

  const { session, admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const actionType = formData.get("action");

  // Create new group with products and sync
  if (actionType === "createWithProducts") {
    const name = formData.get("name");
    const productsJson = formData.get("products");

    if (!name) {
      return json({ error: "Group name is required" }, { status: 400 });
    }

    const products = productsJson ? JSON.parse(productsJson) : [];

    if (products.length < 2) {
      return json({ error: "At least 2 products are required to create a group" }, { status: 400 });
    }

    // Check link limit
    const canAdd = await canAddLinks(session.shop, products.length);
    if (!canAdd) {
      return json({
        error: "You have reached your plan's link limit. Please upgrade to add more products.",
        limitReached: true
      }, { status: 400 });
    }

    // Check if products already belong to another group
    const productIds = products.map((p) => p.id);
    const existingInOtherGroups = await prisma.productGroupItem.findMany({
      where: { productId: { in: productIds } },
      include: { group: { select: { name: true } } },
    });

    if (existingInOtherGroups.length > 0) {
      const conflictMessages = existingInOtherGroups.map((item) => {
        const product = products.find((p) => p.id === item.productId);
        return `"${product?.title || item.productId}" already belongs to group "${item.group.name}"`;
      });
      return json({
        error: `Some products already belong to other groups:\n${conflictMessages.join('\n')}`,
      }, { status: 400 });
    }

    // Create group
    const newGroup = await prisma.productGroup.create({
      data: {
        shop: session.shop,
        name,
        optionName: "Color",
        selectorStyle: "block",
      },
    });

    // Add products to group
    for (let i = 0; i < products.length; i++) {
      await prisma.productGroupItem.create({
        data: {
          groupId: newGroup.id,
          productId: products[i].id,
          productHandle: products[i].handle,
          optionValue: products[i].title,
          position: i + 1,
        },
      });
    }

    // Auto-sync metafields
    try {
      const metafields = [];
      const metafieldValue = products.map((p) => ({
        handle: p.handle,
        title: p.title || "",
        image: p.image || "",
        color: ""
      }));

      for (const product of products) {
        // 1. linked_list metafield
        metafields.push({
          ownerId: product.id,
          namespace: "linked_products",
          key: "linked_list",
          value: JSON.stringify(metafieldValue),
          type: "json",
        });
        // 2. option_value metafield
        metafields.push({
          ownerId: product.id,
          namespace: "linked_products",
          key: "option_value",
          value: product.title || "",
          type: "single_line_text_field",
        });
        // 3. inventory_behavior (default show during creation)
        metafields.push({
          ownerId: product.id,
          namespace: "linked_products",
          key: "inventory_behavior",
          value: "show",
          type: "single_line_text_field",
        });
      }

      // Batching: Shopify limits metafieldsSet to 25 items per call
      const BATCH_SIZE = 25;
      const batches = [];
      for (let i = 0; i < metafields.length; i += BATCH_SIZE) {
        batches.push(metafields.slice(i, i + BATCH_SIZE));
      }

      // Sequential processing: More stable than Promise.all for metafieldsSet
      for (const batch of batches) {
        const metafieldMutation = await admin.graphql(`
          mutation MetafieldsSet($metafields: [MetafieldsSetInput!]!) {
            metafieldsSet(metafields: $metafields) {
              metafields { id }
              userErrors { field message }
            }
          }
        `, {
          variables: { metafields: batch },
        });

        const result = await metafieldMutation.json();
        if (result.data?.metafieldsSet?.userErrors?.length > 0) {
          throw new Error(result.data.metafieldsSet.userErrors[0].message);
        }
      }

      // Mark as synced
      await prisma.productGroup.update({
        where: { id: newGroup.id },
        data: { syncStatus: "synced" },
      });

      return json({ success: true, message: `Group "${name}" created with ${products.length} products and synced successfully!` });
    } catch (error) {
      await prisma.productGroup.update({
        where: { id: newGroup.id },
        data: { syncStatus: "error" },
      });
      return json({ success: true, message: `Group created but sync error: ${error.message}` });
    }
  }

  if (actionType === "delete") {
    const groupId = formData.get("groupId");

    if (!groupId) {
      return json({ error: "Group not found" }, { status: 400 });
    }

    // Lấy danh sách sản phẩm trong nhóm trước khi xóa
    const group = await prisma.productGroup.findUnique({
      where: { id: groupId },
      include: { products: true },
    });

    if (!group) {
      return json({ error: "Group not found" }, { status: 400 });
    }

    // Xóa metafield trên Shopify cho từng sản phẩm
    try {
      const metafieldKeys = [
        "linked_products.linked_list",
        "linked_products.option_value",
        "linked_products.inventory_behavior",
        "linked_products.option_name",
        "linked_products.selector_style",
      ];

      for (const product of group.products) {
        // Lấy metafield IDs của sản phẩm
        const metafieldQuery = await admin.graphql(`
          query GetProductMetafields($productId: ID!) {
            product(id: $productId) {
              metafields(first: 10, namespace: "linked_products") {
                nodes {
                  id
                  key
                }
              }
            }
          }
        `, { variables: { productId: product.productId } });

        const metafieldResult = await metafieldQuery.json();
        const metafieldNodes = metafieldResult.data?.product?.metafields?.nodes || [];

        if (metafieldNodes.length > 0) {
          const metafieldIds = metafieldNodes.map(m => m.id);
          await admin.graphql(`
            mutation MetafieldsDelete($metafields: [MetafieldIdentifierInput!]!) {
              metafieldsDelete(metafields: $metafields) {
                deletedMetafields { ownerId }
                userErrors { field message }
              }
            }
          `, {
            variables: {
              metafields: metafieldIds.map(id => ({ id })),
            },
          });
        }
      }
    } catch (error) {
      console.warn("Warning: Could not clean up metafields:", error.message);
      // Không throw error - vẫn cho phép xóa nhóm trong DB
    }

    await prisma.productGroup.delete({
      where: { id: groupId },
    });

    return json({ success: true, message: "Group and metafields deleted successfully" });
  }

  // Import CSV
  if (actionType === "importCSV") {
    const csvData = formData.get("csvData");
    if (!csvData) {
      return json({ error: "No CSV data provided" }, { status: 400 });
    }

    try {
      const lines = csvData.split("\n").map(l => l.trim()).filter(l => l.length > 0);
      let groupsCreated = 0;
      let errors = [];

      for (const line of lines) {
        const parts = line.split(",").map(s => s.trim()).filter(s => s.length > 0);
        if (parts.length < 3) {
          errors.push(`Skipped line: "${line}" (need at least group name + 2 product handles)`);
          continue;
        }

        const groupName = parts[0];
        const handles = parts.slice(1);

        // Lookup product IDs from handles
        const products = [];
        for (const handle of handles) {
          try {
            const response = await admin.graphql(`
              query GetProductByHandle($handle: String!) {
                productByHandle(handle: $handle) {
                  id
                  title
                  handle
                }
              }
            `, { variables: { handle } });
            const result = await response.json();
            const product = result.data?.productByHandle;
            if (product) {
              products.push(product);
            } else {
              errors.push(`Product not found: "${handle}"`);
            }
          } catch (e) {
            errors.push(`Error looking up product: "${handle}"`);
          }
        }

        if (products.length < 2) {
          errors.push(`Skipped group "${groupName}": found only ${products.length} valid products`);
          continue;
        }

        // Check link limit
        const canAdd = await canAddLinks(session.shop, products.length);
        if (!canAdd) {
          errors.push(`Skipped group "${groupName}": link limit reached`);
          break;
        }

        // Check for conflicts
        const productIds = products.map(p => p.id);
        const existingItems = await prisma.productGroupItem.findMany({
          where: { productId: { in: productIds } },
        });
        if (existingItems.length > 0) {
          errors.push(`Skipped group "${groupName}": some products already belong to another group`);
          continue;
        }

        // Create group
        const newGroup = await prisma.productGroup.create({
          data: { shop: session.shop, name: groupName, optionName: "Color", selectorStyle: "block" },
        });

        for (let i = 0; i < products.length; i++) {
          await prisma.productGroupItem.create({
            data: {
              groupId: newGroup.id,
              productId: products[i].id,
              productHandle: products[i].handle,
              optionValue: products[i].title,
              position: i + 1,
            },
          });
        }

        // Sync metafields
        const metafields = [];
        const metafieldValue = products.map(p => ({ handle: p.handle, title: p.title, image: "", color: "" }));

        for (const product of products) {
          metafields.push(
            { ownerId: product.id, namespace: "linked_products", key: "linked_list", value: JSON.stringify(metafieldValue), type: "json" },
            { ownerId: product.id, namespace: "linked_products", key: "option_value", value: product.title || "", type: "single_line_text_field" },
            { ownerId: product.id, namespace: "linked_products", key: "inventory_behavior", value: "show", type: "single_line_text_field" },
            { ownerId: product.id, namespace: "linked_products", key: "option_name", value: "Color", type: "single_line_text_field" },
            { ownerId: product.id, namespace: "linked_products", key: "selector_style", value: "block", type: "single_line_text_field" },
          );
        }

        const BATCH_SIZE = 25;
        for (let i = 0; i < metafields.length; i += BATCH_SIZE) {
          const batch = metafields.slice(i, i + BATCH_SIZE);
          const mutation = await admin.graphql(`
            mutation MetafieldsSet($metafields: [MetafieldsSetInput!]!) {
              metafieldsSet(metafields: $metafields) {
                metafields { id }
                userErrors { field message }
              }
            }
          `, { variables: { metafields: batch } });
          const mfResult = await mutation.json();
          if (mfResult.data?.metafieldsSet?.userErrors?.length > 0) {
            console.warn("CSV import sync warning:", mfResult.data.metafieldsSet.userErrors);
          }
        }

        await prisma.productGroup.update({
          where: { id: newGroup.id },
          data: { syncStatus: "synced" },
        });

        groupsCreated++;
      }

      const message = `Import completed: ${groupsCreated} groups created.` +
        (errors.length > 0 ? `\n${errors.join("\n")}` : "");
      return json({ success: true, message });
    } catch (error) {
      return json({ error: `Import failed: ${error.message}` }, { status: 500 });
    }
  }

  return json({ error: "Invalid action" }, { status: 400 });
}

export default function Index() {
  const { groups, usageInfo } = useLoaderData();
  const actionData = useActionData();
  const submit = useSubmit();
  const navigation = useNavigation();
  const shopify = useAppBridge();

  const [actionBannerVisible, setActionBannerVisible] = useState(true);

  // Reset banner visibility when actionData changes
  useEffect(() => {
    if (actionData) {
      setActionBannerVisible(true);
    }
  }, [actionData]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [showImportModal, setShowImportModal] = useState(false);
  const [csvData, setCsvData] = useState("");

  const isLoading = navigation.state === "submitting" || navigation.state === "loading";
  const isSyncing = navigation.state !== "idle" && (
    navigation.formData?.get("action") === "createWithProducts"
  );

  // Open Resource Picker to select products
  const handleSelectProducts = useCallback(async () => {
    try {
      const selection = await shopify.resourcePicker({
        type: "product",
        multiple: true,
        action: "select",
      });

      if (selection && selection.length > 0) {
        setSelectedProducts(selection.map((p) => ({
          id: p.id,
          title: p.title,
          handle: p.handle,
          image: p.images?.[0]?.originalSrc || null,
        })));
      }
    } catch (error) {
      console.error("Resource picker error:", error);
    }
  }, [shopify]);

  // Remove product from selected list
  const handleRemoveProduct = useCallback((productId) => {
    setSelectedProducts((prev) => prev.filter((p) => p.id !== productId));
  }, []);

  const handleCreateGroup = useCallback(() => {
    const formData = new FormData();
    formData.append("action", "createWithProducts");
    formData.append("name", newGroupName);
    formData.append("products", JSON.stringify(selectedProducts));
    submit(formData, { method: "POST" });
    // Reset modal state immediately, isLoading will be handled by actionData/navigation.state
    setShowCreateModal(false);
    setNewGroupName("");
    setSelectedProducts([]);
  }, [newGroupName, selectedProducts, submit]);

  const handleDeleteGroup = useCallback((groupId) => {
    if (confirm("Are you sure you want to delete this group?")) {
      const formData = new FormData();
      formData.append("action", "delete");
      formData.append("groupId", groupId);
      submit(formData, { method: "POST" });
    }
  }, [submit]);

  const getSyncStatusBadge = (status) => {
    switch (status) {
      case "synced":
        return <Badge tone="success">Synced</Badge>;
      case "error":
        return <Badge tone="critical">Error</Badge>;
      default:
        return <Badge>Not synced</Badge>;
    }
  };

  return (
    <Page>
      <div style={{ padding: "10px 0" }}>
        <BlockStack gap="500">
          {/* Welcome Section */}
          <Box paddingBlock="200">
            <InlineStack align="space-between" blockAlign="center">
              <BlockStack gap="100">
                <Text variant="headingXl">Welcome 🚀</Text>
                <Text variant="bodyMd" tone="subdued">
                  Link and manage products as SEO-friendly variants with unique URLs, titles, and descriptions.
                </Text>
              </BlockStack>
              <Button variant="primary" icon={PlusCircleIcon} onClick={() => setShowCreateModal(true)}>
                Create new group
              </Button>
            </InlineStack>
          </Box>

          <Layout>
            <Layout.Section>
              <BlockStack gap="400">
                {actionData?.success && actionBannerVisible && (
                  <Banner tone="success" onDismiss={() => setActionBannerVisible(false)}>
                    <p>{actionData.message}</p>
                  </Banner>
                )}
                {/* Setup Guide */}
                <Card>
                  <BlockStack gap="300">
                    <InlineStack align="space-between">
                      <Text variant="headingMd">Setup guide</Text>
                      <Text variant="bodySm" tone="subdued">
                        {groups.length > 0 ? "1/2" : "0/2"} completed
                      </Text>
                    </InlineStack>
                    <ProgressBar 
                      progress={groups.length > 0 ? 50 : 0} 
                      size="small" 
                      tone={groups.length > 0 ? "primary" : "warning"} 
                    />
                    
                    <div style={{ marginTop: "10px" }}>
                      <InlineStack gap="400" align="start" blockAlign="start" wrap={false}>
                        <Box background={groups.length > 0 ? "bg-surface-success" : "bg-surface-secondary"} padding="200" borderRadius="200">
                          <Icon source={ClipboardChecklistIcon} tone={groups.length > 0 ? "success" : "base"} />
                        </Box>
                        <BlockStack gap="050" flex="1">
                          <Text variant="bodyMd" fontWeight="semibold">Create a product group</Text>
                          <Text variant="bodySm" tone="subdued">Group products that should link together. Choose a single-option group, or a multi-option group.</Text>
                          <div style={{ marginTop: "8px" }}>
                            {groups.length > 0 ? (
                               <Button size="slim" url="/app/groups">View Groups</Button>
                            ) : (
                               <Button size="slim" onClick={() => setShowCreateModal(true)}>Create a group</Button>
                            )}
                          </div>
                        </BlockStack>
                      </InlineStack>
                    </div>
                    
                    <Divider />
                    
                    <InlineStack gap="400" align="start" blockAlign="start" wrap={false}>
                      <Box background="bg-surface-secondary" padding="200" borderRadius="200">
                        <Icon source={InfoIcon} />
                      </Box>
                      <BlockStack gap="050" flex="1">
                        <Text variant="bodyMd" fontWeight="semibold">Enable app embed</Text>
                        <Text variant="bodySm" tone="subdued">Linked products won't show on your store until the app embed is active in your theme settings.</Text>
                        <div style={{ marginTop: "8px" }}>
                          <Button size="slim" url="/app/help">Review Guide</Button>
                        </div>
                      </BlockStack>
                    </InlineStack>
                  </BlockStack>
                </Card>

                {/* How to use */}
                <Card padding="0">
                  <Grid>
                    <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 4, lg: 4, xl: 4 }}>
                      <Box padding="400" background="bg-fill-info-secondary" borderRadius="200" height="100%">
                         <BlockStack gap="400" align="center">
                            <Icon source={PlayCircleIcon} tone="info" />
                            <Text variant="headingMd" alignment="center">Tutorial</Text>
                            <Text variant="bodyMd" alignment="center">Learn how to use our app in 2 minutes.</Text>
                            <Button fullWidth url="/app/help">Watch Video</Button>
                         </BlockStack>
                      </Box>
                    </Grid.Cell>
                    <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 8, lg: 8, xl: 8 }}>
                      <Box padding="400">
                        <BlockStack gap="400">
                           <Text variant="headingMd">How to use the app</Text>
                           <Text variant="bodyMd" tone="subdued">Watch a quick walkthrough to get set up faster and avoid common mistakes.</Text>
                           <InlineStack gap="200">
                             <Button variant="secondary" icon={ViewIcon} url="/app/help">Watch video</Button>
                             <Button variant="tertiary" url="/app/help">Learn more</Button>
                           </InlineStack>
                        </BlockStack>
                      </Box>
                    </Grid.Cell>
                  </Grid>
                </Card>

                {/* What's New & Status */}
                <Grid>
                  <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 12, lg: 12, xl: 12 }}>
                     <Card>
                        <BlockStack gap="300">
                          <Text variant="headingMd">App status</Text>
                          <InlineStack align="space-between">
                            <Text variant="bodyMd">App status</Text>
                            <Badge tone="success">Active</Badge>
                          </InlineStack>
                          <InlineStack align="space-between">
                            <Text variant="bodyMd">Collection widget status</Text>
                            <Badge>Ready</Badge>
                          </InlineStack>
                          <InlineStack align="space-between">
                            <Text variant="bodyMd">Manual refresh groups</Text>
                            <Button size="slim" onClick={() => window.location.reload()}>Refresh</Button>
                          </InlineStack>
                          <Divider />
                          <Button variant="plain" url="/app/help">View settings</Button>
                        </BlockStack>
                     </Card>
                  </Grid.Cell>
                </Grid>

                {/* FAQ Section */}
                <Card>
                  <BlockStack gap="400">
                    <InlineStack gap="200" blockAlign="center">
                      <Icon source={QuestionCircleIcon} />
                      <Text variant="headingMd">Need help? FAQ</Text>
                    </InlineStack>
                    <BlockStack gap="200">
                       <Box padding="200" background="bg-surface-secondary" borderRadius="100">
                         <Text variant="bodyMd" fontWeight="semibold">Can I change the position of the options?</Text>
                       </Box>
                       <Box padding="200">
                         <Text variant="bodySm" tone="subdued">Yes, you can drag and drop products within a group details page to change their display order.</Text>
                       </Box>
                       
                       <Box padding="200" background="bg-surface-secondary" borderRadius="100">
                         <Text variant="bodyMd" fontWeight="semibold">How do I show options on collection pages?</Text>
                       </Box>
                       <Box padding="200">
                         <Text variant="bodySm" tone="subdued">Go to Theme Editor, navigate to your Collection page, and add the "Collection Swatches" app block to your product grid.</Text>
                       </Box>

                       <Box padding="200" background="bg-surface-secondary" borderRadius="100">
                         <Text variant="bodyMd" fontWeight="semibold">Can a product belong to multiple groups?</Text>
                       </Box>
                       <Box padding="200">
                         <Text variant="bodySm" tone="subdued">No, to ensure SEO consistency and avoid conflicts, each product can only belong to one linked group at a time.</Text>
                       </Box>
                       
                       <Button variant="plain" url="/app/help">View all FAQs</Button>
                    </BlockStack>
                  </BlockStack>
                </Card>

                {/* Support Cards */}
                <InlineStack gap="400" wrap={false}>
                  <Box flex="1">
                    <Card>
                      <BlockStack gap="200" align="center">
                        <Icon source={EmailIcon} tone="info" />
                        <Text variant="headingSm">Get email support</Text>
                        <Text variant="bodySm" alignment="center">Email us and we'll get back to you as soon as possible.</Text>
                        <Button variant="plain" url="mailto:support@example.com">Contact us</Button>
                      </BlockStack>
                    </Card>
                  </Box>
                  <Box flex="1">
                    <Card>
                      <BlockStack gap="200" align="center">
                        <Icon source={ChatIcon} tone="info" />
                        <Text variant="headingSm">Start live chat</Text>
                        <Text variant="bodySm" alignment="center">Chat with us for a quick solution to your questions.</Text>
                        <Button variant="plain">Chat now</Button>
                      </BlockStack>
                    </Card>
                  </Box>
                </InlineStack>
              </BlockStack>
            </Layout.Section>
            <Layout.Section variant="oneThird">
              <BlockStack gap="400">
                {/* Usage Info Card (moved from top) */}
                <Card background="bg-surface-secondary">
                  <BlockStack gap="300">
                    <Text variant="headingMd">Your Plan</Text>
                    <BlockStack gap="100">
                       <Text variant="bodyMd" fontWeight="bold">
                         {usageInfo.planName} Plan
                       </Text>
                       <Text variant="bodySm" tone="subdued">
                         {usageInfo.used} / {usageInfo.limit === Infinity ? "Unlimited" : usageInfo.limit} links used
                       </Text>
                    </BlockStack>
                    {usageInfo.limit !== Infinity && (
                      <ProgressBar
                        progress={usageInfo.percentage}
                        tone={usageInfo.percentage >= 90 ? "critical" : usageInfo.percentage >= 70 ? "warning" : "primary"}
                        size="small"
                      />
                    )}
                    <Button url="/app/pricing" variant="primary" fullWidth>
                      {usageInfo.plan !== "pro" ? "Upgrade Plan" : "Manage Plan"}
                    </Button>
                  </BlockStack>
                </Card>

                <Card>
                  <BlockStack gap="300">
                     <Text variant="headingMd">Quick Actions</Text>
                      <Button fullWidth textAlign="left" icon={PlusCircleIcon} onClick={() => setShowCreateModal(true)}>Create Group</Button>
                      <Button fullWidth textAlign="left" icon={PlusCircleIcon} url="/app/groups">Manage Groups</Button>
                      <Button fullWidth textAlign="left" icon={AutomationIcon} url="/app/automations">Automations</Button>
                      <Button fullWidth textAlign="left" icon={ImportIcon} onClick={() => setShowImportModal(true)}>Import CSV</Button>
                  </BlockStack>
                </Card>
              </BlockStack>
            </Layout.Section>
          </Layout>
        </BlockStack>
      </div>

      {/* Create Group Modal */}
      <Modal
        open={showCreateModal}
        onClose={() => {
          setShowCreateModal(false);
          setNewGroupName("");
          setSelectedProducts([]);
        }}
        title="Create Product Group"
        primaryAction={{
          content: "Create & Sync",
          onAction: handleCreateGroup,
          loading: isLoading && navigation.formData?.get("action") === "createWithProducts",
          disabled: !newGroupName || selectedProducts.length < 2,
        }}
        secondaryActions={[
          {
            content: "Cancel",
            onAction: () => {
              setShowCreateModal(false);
              setNewGroupName("");
              setSelectedProducts([]);
            },
          },
        ]}
      >
        <Modal.Section>
          <FormLayout>
            <TextField
              label="Group Name"
              value={newGroupName}
              onChange={setNewGroupName}
              placeholder="e.g. T-Shirt Basic Colors"
              autoComplete="off"
              requiredIndicator
            />

            <BlockStack gap="300">
              <Text variant="bodyMd" fontWeight="semibold">
                Products
              </Text>

              {/* Search box + Browse button like Collection */}
              <InlineStack gap="200" blockAlign="center">
                <div style={{ flex: 1, cursor: 'pointer' }} onClick={handleSelectProducts}>
                  <TextField
                    placeholder="Search products"
                    autoComplete="off"
                    readOnly
                    prefix={
                      <Icon source={SearchIcon} tone="subdued" />
                    }
                  />
                </div>
                <Button onClick={handleSelectProducts} variant="secondary">
                  Browse
                </Button>
              </InlineStack>

              {selectedProducts.length === 0 ? (
                <Box padding="400" background="bg-surface-secondary" borderRadius="200">
                  <Text tone="subdued" alignment="center">
                    Select at least 2 products to create a group
                  </Text>
                </Box>
              ) : (
                <Box
                  borderColor="border"
                  borderWidth="025"
                  borderRadius="200"
                  overflow="hidden"
                >
                  {selectedProducts.map((product, index) => (
                    <div key={product.id}>
                      <Box padding="300" background="bg-surface">
                        <InlineStack gap="300" blockAlign="center" wrap={false}>
                          <Text variant="bodyMd" tone="subdued" fontWeight="medium">
                            {index + 1}.
                          </Text>
                          <Thumbnail
                            source={product.image || "https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"}
                            alt={product.title}
                            size="small"
                          />
                          <Box minWidth="0" maxWidth="100%">
                            <Text variant="bodyMd">
                              {product.title}
                            </Text>
                          </Box>
                          <div style={{ marginLeft: 'auto' }}>
                            <Button
                              variant="plain"
                              icon={<Icon source={XIcon} />}
                              onClick={() => handleRemoveProduct(product.id)}
                              accessibilityLabel={`Remove ${product.title}`}
                            />
                          </div>
                        </InlineStack>
                      </Box>
                      {index < selectedProducts.length - 1 && <Divider />}
                    </div>
                  ))}
                </Box>
              )}

              {selectedProducts.length > 0 && selectedProducts.length < 2 && (
                <Banner tone="warning">
                  <p>At least 2 products are required to create a linked group</p>
                </Banner>
              )}
            </BlockStack>
          </FormLayout>
        </Modal.Section>
      </Modal>

      {/* Import CSV Modal */}
      <Modal
        open={showImportModal}
        onClose={() => {
          setShowImportModal(false);
          setCsvData("");
        }}
        title="Import Groups from CSV"
        primaryAction={{
          content: "Import",
          onAction: () => {
            const formData = new FormData();
            formData.append("action", "importCSV");
            formData.append("csvData", csvData);
            submit(formData, { method: "POST" });
            setShowImportModal(false);
            setCsvData("");
          },
          loading: isLoading && navigation.formData?.get("action") === "importCSV",
          disabled: !csvData.trim(),
        }}
        secondaryActions={[{
          content: "Cancel",
          onAction: () => {
            setShowImportModal(false);
            setCsvData("");
          },
        }]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            <Banner tone="info">
              <BlockStack gap="200">
                <p><strong>CSV Format:</strong> Each line creates one group.</p>
                <p><code>Group Name, product-handle-1, product-handle-2, ...</code></p>
                <p><strong>Example:</strong></p>
                <p><code>T-Shirt Colors, red-tshirt, blue-tshirt, green-tshirt</code></p>
                <p><code>Phone Cases, iphone-case-black, iphone-case-white</code></p>
              </BlockStack>
            </Banner>
            <TextField
              label="CSV Data"
              value={csvData}
              onChange={setCsvData}
              multiline={8}
              placeholder={"Group Name, product-handle-1, product-handle-2\nAnother Group, handle-a, handle-b, handle-c"}
              autoComplete="off"
              helpText="Paste your CSV data here. Each line = one new group."
            />
          </BlockStack>
        </Modal.Section>
      </Modal>
    </Page>
  );
}

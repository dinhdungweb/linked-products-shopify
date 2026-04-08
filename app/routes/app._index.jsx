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
  InfoIcon,
  PlusIcon,
  MinusIcon,
  CheckIcon,
  RefreshIcon,
  MenuHorizontalIcon
} from "@shopify/polaris-icons";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import { PLANS } from "../billing.config";

// Loader - Get product groups list
export async function loader({ request }) {
  const { authenticate } = await import("../shopify.server");
  const { default: prisma } = await import("../db.server");
  const { getUsageInfo, confirmSubscription } = await import("../billing.server");

  const { admin, session, billing } = await authenticate.admin(request);
  const shop = session.shop;

  let usageInfo = await getUsageInfo(shop);

  try {
    const billingCheck = await billing.check({
      isTest: true,
      plans: [PLANS.basic.key, PLANS.advanced.key, PLANS.premium.key],
    });

    const currentKnownPlan = usageInfo?.plan || 'free';

    if (billingCheck.hasActivePayment) {
      const activeSub = billingCheck.appSubscriptions[0];
      let planKey = "free";
      const subName = activeSub.name;

      if (subName.includes("Premium") || subName === PLANS.premium.key) planKey = "premium";
      else if (subName.includes("Advanced") || subName === PLANS.advanced.key) planKey = "advanced";
      else if (subName.includes("Basic") || subName === PLANS.basic.key) planKey = "basic";

      if (planKey !== currentKnownPlan) {
        await confirmSubscription(admin, shop, planKey, activeSub);
        usageInfo = await getUsageInfo(shop);
      }
    } else if (currentKnownPlan !== 'free') {
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

  const totalProducts = await prisma.productGroupItem.count({
    where: { group: { shop: shop } }
  });

  // Fetch App Embed Status via direct REST fetch (most stable method)
  let isAppEmbedEnabled = false;
  try {
    const themeResponse = await admin.graphql(`
      query getThemeId {
        themes(first: 1, roles: [MAIN]) {
          nodes { id }
        }
      }
    `);
    const themeData = await themeResponse.json();
    const themeId = themeData.data?.themes?.nodes?.[0]?.id.split('/').pop();

    if (themeId) {
      const restUrl = `https://${shop}/admin/api/2024-04/themes/${themeId}/assets.json?asset[key]=config/settings_data.json`;
      const assetResponse = await fetch(restUrl, {
        headers: { "X-Shopify-Access-Token": session.accessToken },
      });
      
      if (assetResponse.ok) {
        const assetData = await assetResponse.json();
        const settingsValue = assetData.asset?.value;
        if (settingsValue) {
          const settings = JSON.parse(settingsValue);
          const blocks = settings.current?.blocks || {};
          isAppEmbedEnabled = Object.values(blocks).some(block => 
            (block.type?.includes('linked-products') || block.type?.includes('app-card-injector')) && 
            block.disabled === false
          );
        }
      }
    }
  } catch (e) {
    console.warn("Skipping app embed check:", e.message);
    isAppEmbedEnabled = true; // Safety default
  }

  return json({ groups, shop: shop, usageInfo, totalProducts, isAppEmbedEnabled });
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

    // Check group limit
    const canAdd = await canAddLinks(session.shop, 1);
    if (!canAdd) {
      return json({
        error: "You have reached your plan's group limit. Please upgrade to create more product groups.",
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
          const metafieldsToDelete = metafieldNodes.map(m => ({
            namespace: "linked_products",
            key: m.key,
            ownerId: product.productId
          }));

          await admin.graphql(`
            mutation MetafieldsDelete($metafields: [MetafieldIdentifierInput!]!) {
              metafieldsDelete(metafields: $metafields) {
                deletedMetafields { ownerId }
                userErrors { field message }
              }
            }
          `, {
            variables: {
              metafields: metafieldsToDelete,
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

        // Check group limit
        const canAdd = await canAddLinks(session.shop, 1);
        if (!canAdd) {
          errors.push(`Skipped group "${groupName}": group limit reached`);
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
  const { groups, usageInfo, totalProducts, isAppEmbedEnabled, shop } = useLoaderData();
  const actionData = useActionData();
  const submit = useSubmit();
  const navigation = useNavigation();
  const shopify = useAppBridge();

  const isLimitReached = usageInfo?.used >= usageInfo?.limit;

  const StatsCard = ({ title, value, icon, color, progress, subtitle }) => (
    <Card padding="400">
      <BlockStack gap="300">
        <InlineStack align="space-between" blockAlign="center">
          <BlockStack gap="100">
            <Text variant="bodySm" fontWeight="bold" tone="subdued">{title}</Text>
            <Text variant="headingLg" as="h2">{value}</Text>
          </BlockStack>
          <div style={{ backgroundColor: '#F1F1F1', padding: '12px', borderRadius: '12px', color: '#5C5F62' }}>
            <Icon source={icon} tone="inherit" />
          </div>
        </InlineStack>
        {progress !== undefined && (
          <BlockStack gap="100">
            <ProgressBar progress={progress} tone={progress > 90 ? "critical" : "primary"} size="small" />
            <Text variant="bodyXs" tone="subdued">{subtitle}</Text>
          </BlockStack>
        )}
        {!progress && subtitle && <Text variant="bodySm" tone="subdued">{subtitle}</Text>}
      </BlockStack>
    </Card>
  );

  const FAQSection = () => {
    const [openIndex, setOpenIndex] = useState(null);
    const faqs = [
      { question: "Can I change the position of the options?", answer: "Yes! You can use the Theme Editor to drag the 'Linked Product Variants' block to any position." },
      { question: "How do I show options on collection pages?", answer: "Enable the 'App Card Injector' block in your Theme App Embeds settings." },
      { question: "Can a product belong to multiple groups?", answer: "Each product can only belong to one active group to avoid conflicts." }
    ];
    return (
      <Card padding="500">
        <BlockStack gap="400">
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', justifyContent: 'flex-start', width: '100%' }}>
            <div style={{ margin: 0, display: 'flex' }}>
              <Icon source={QuestionCircleIcon} />
            </div>
            <Text variant="headingMd" as="h2">Need help? FAQ</Text>
          </div>
          <BlockStack gap="200">
            {faqs.map((faq, index) => (
              <Box key={index} padding="300" background="bg-surface-secondary" borderRadius="200" cursor="pointer" onClick={() => setOpenIndex(openIndex === index ? null : index)}>
                <BlockStack gap="200">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                    <div style={{ flex: 1 }}>
                      <Text variant="bodyMd" fontWeight="semibold">{faq.question}</Text>
                    </div>
                    <div style={{ marginLeft: '12px', display: 'flex' }}>
                      <Icon source={openIndex === index ? XIcon : PlusIcon} size="extrasmall" />
                    </div>
                  </div>
                  {openIndex === index && <Box paddingBlockStart="200"><Text variant="bodyMd" tone="subdued">{faq.answer}</Text></Box>}
                </BlockStack>
              </Box>
            ))}
          </BlockStack>
        </BlockStack>
      </Card>
    );
  };

  const TutorialCard = () => (
    <Card padding="0">
      <Grid>
        <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 4, lg: 4, xl: 4 }}>
          <Box padding="400" background="bg-surface-secondary" borderRadius="200" height="100%">
            <BlockStack gap="400" align="center" inlineAlign="center">
              <div style={{ color: '#5C5F62' }}>
                <Icon source={PlayCircleIcon} tone="inherit" />
              </div>
              <Text variant="headingMd" alignment="center">Tutorial</Text>
              <Text variant="bodyMd" alignment="center" tone="subdued">Watch our 2-minute quick start guide.</Text>
              <Button fullWidth variant="secondary" onClick={() => window.open('https://youtube.com', '_blank')}>Watch Video</Button>
            </BlockStack>
          </Box>
        </Grid.Cell>
        <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 8, lg: 8, xl: 8 }}>
          <Box padding="500">
            <BlockStack gap="400">
              <Text variant="headingLg" as="h3">How to use the app</Text>
              <Text variant="bodyMd" tone="subdued">A quick walkthrough to get you set up faster and avoid common mistakes.</Text>
              <InlineStack gap="300">
                <Button variant="secondary" icon={ViewIcon} onClick={() => window.open('https://youtube.com', '_blank')}>Watch video</Button>
                <Button variant="tertiary" url="/app/help">Documentation</Button>
              </InlineStack>
            </BlockStack>
          </Box>
        </Grid.Cell>
      </Grid>
    </Card>
  );

  const SupportSideList = () => (
    <BlockStack gap="300">
      <Card padding="400">
        <BlockStack gap="300">
          <InlineStack gap="200" blockAlign="center">
            <div style={{ backgroundColor: '#F1F1F1', padding: '8px', borderRadius: '8px', color: '#5C5F62', display: 'flex' }}><Icon source={EmailIcon} tone="inherit" /></div>
            <Text variant="headingSm" as="h3">Email Support</Text>
          </InlineStack>
          <Text variant="bodySm" tone="subdued">Response time: <Text fontWeight="bold" as="span">Under 24h</Text></Text>
          <Button variant="plain" url="mailto:support@example.com">Contact us</Button>
        </BlockStack>
      </Card>
      <Card padding="400">
        <BlockStack gap="300">
          <InlineStack gap="200" blockAlign="center">
            <div style={{ backgroundColor: '#F1F1F1', padding: '8px', borderRadius: '8px', color: '#5C5F62', display: 'flex' }}><Icon source={ChatIcon} tone="inherit" /></div>
            <Text variant="headingSm" as="h3">Live Chat</Text>
          </InlineStack>
          <Text variant="bodySm" tone="subdued">Chat with us for instant help.</Text>
          <Button variant="plain">Start chat</Button>
        </BlockStack>
      </Card>
    </BlockStack>
  );

  const [actionBannerVisible, setActionBannerVisible] = useState(true);

  // Reset banner visibility when actionData changes
  useEffect(() => {
    if (actionData) {
      setActionBannerVisible(true);
    }
  }, [actionData]);
  const [openFaq, setOpenFaq] = useState(null);
  const toggleFaq = (index) => setOpenFaq(openFaq === index ? null : index);
  const [showImportModal, setShowImportModal] = useState(false);
  const [csvData, setCsvData] = useState("");

  const isLoading = navigation.state === "submitting" || navigation.state === "loading";
  const isSyncing = navigation.state !== "idle" && (
    navigation.formData?.get("action") === "createWithProducts"
  );

  const fetchIdToken = async () => {
    try {
      if (typeof window !== "undefined" && window.shopify && window.shopify.idToken) {
        const idToken = await window.shopify.idToken();
        return { Authorization: `Bearer ${idToken}` };
      }
    } catch (e) { console.error("Token error:", e); }
    return {};
  };



  const handleDeleteGroup = useCallback(async (groupId) => {
    if (confirm("Are you sure you want to delete this group?")) {
      const formData = new FormData();
      formData.append("action", "delete");
      formData.append("groupId", groupId);
      const headers = await fetchIdToken();
      submit(formData, { method: "POST", headers });
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
              <Button variant="primary" icon={PlusCircleIcon} url="/app/groups/new">
                Create new group
              </Button>
            </InlineStack>
          </Box>

          <Layout>
            <Layout.Section>
              <BlockStack gap="500">
                {actionData?.success && actionBannerVisible && (
                  <Banner tone="success" onDismiss={() => setActionBannerVisible(false)}>
                    <p>{actionData.message}</p>
                  </Banner>
                )}

                {/* Dynamic Alerts */}
                {!isAppEmbedEnabled && (
                  <Banner 
                    title="Theme integration required" 
                    tone="warning"
                    action={{ 
                      content: 'Enable in Theme', 
                      onAction: () => {
                        const url = `https://admin.shopify.com/store/${shop.split('.')[0]}/themes/current/editor?context=apps&activateAppId=2dc3da0c1804b6a547c472b2d3b6a6ca/app-card-injector`;
                        window.open(url, '_blank');
                      }
                    }}
                  >
                    <p>App embed is disabled. Enable it to show swatches on your storefront.</p>
                  </Banner>
                )}
                
                {/* Stats Cards Row */}
                <Grid>
                  <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 4, lg: 4, xl: 4 }}>
                    <StatsCard 
                      title="Plan Usage" 
                      value={`${usageInfo?.used || 0} / ${usageInfo?.limit === Infinity ? "∞" : usageInfo?.limit}`}
                      icon={CheckIcon}
                      color="#008060"
                      progress={usageInfo?.limit === Infinity ? 0 : ((usageInfo?.used || 0) / usageInfo?.limit) * 100}
                      subtitle={isLimitReached ? "Limit reached" : "Group capacity"}
                    />
                  </Grid.Cell>
                  <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 4, lg: 4, xl: 4 }}>
                    <StatsCard 
                      title="Linked Products" 
                      value={totalProducts}
                      icon={PlusIcon}
                      color="#2C6ECB"
                      subtitle="Across all groups"
                    />
                  </Grid.Cell>
                  <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 4, lg: 4, xl: 4 }}>
                    <StatsCard 
                      title="App Status" 
                      value={isAppEmbedEnabled ? "Active" : "Disabled"}
                      icon={isAppEmbedEnabled ? CheckIcon : XIcon}
                      color={isAppEmbedEnabled ? "#008060" : "#D82C0D"}
                      subtitle="Storefront visibility"
                    />
                  </Grid.Cell>
                </Grid>

                {/* Premium Setup Guide */}
                <Card padding="500">
                  <BlockStack gap="400">
                    <InlineStack align="space-between" blockAlign="center">
                      <BlockStack gap="100">
                        <Text variant="headingMd" as="h2">Setup guide</Text>
                        <Text variant="bodySm" tone="subdued">Follow these steps to finish your setup.</Text>
                      </BlockStack>
                      <Badge tone={groups.length > 0 && isAppEmbedEnabled ? "success" : "attention"}>
                        {groups.length > 0 && isAppEmbedEnabled ? "2/2 completed" : groups.length > 0 || isAppEmbedEnabled ? "1/2 completed" : "0/2 completed"}
                      </Badge>
                    </InlineStack>
                    
                    <ProgressBar 
                      progress={ (groups.length > 0 ? 50 : 0) + (isAppEmbedEnabled ? 50 : 0) } 
                      size="small" 
                      tone="primary" 
                    />

                    <BlockStack gap="300">
                      {/* Step 1: Create Group */}
                      <Box padding="300" background="bg-surface-secondary" borderRadius="300" borderStyle="solid" borderWidth="025" borderColor="border-subdued">
                        <div style={{ display: 'flex', gap: '16px', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                          <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flex: 1 }}>
                            <div style={{ 
                              backgroundColor: '#FFFFFF', 
                              padding: '10px', 
                              borderRadius: '12px',
                              color: groups.length > 0 ? '#008060' : '#8c9196',
                              display: 'flex',
                              boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                            }}>
                              <Icon source={groups.length > 0 ? CheckIcon : ClipboardChecklistIcon} tone="inherit" />
                            </div>
                            <BlockStack gap="050">
                              <Text variant="bodyMd" fontWeight="bold">Create a product group</Text>
                              <Text variant="bodySm" tone="subdued">Link products together to show them as options.</Text>
                            </BlockStack>
                          </div>
                          <Button variant={groups.length > 0 ? "tertiary" : "primary"} url={groups.length > 0 ? "/app/groups" : "/app/groups/new"}>
                            {groups.length > 0 ? "View Groups" : "Create Group"}
                          </Button>
                        </div>
                      </Box>

                      {/* Step 2: Enable App Embed */}
                      <Box padding="300" background="bg-surface-secondary" borderRadius="300" borderStyle="solid" borderWidth="025" borderColor="border-subdued">
                        <div style={{ display: 'flex', gap: '16px', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                          <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flex: 1 }}>
                            <div style={{ 
                              backgroundColor: '#FFFFFF', 
                              padding: '10px', 
                              borderRadius: '12px',
                              color: isAppEmbedEnabled ? '#008060' : '#8c9196',
                              display: 'flex',
                              boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                            }}>
                              <Icon source={isAppEmbedEnabled ? CheckIcon : AutomationIcon} tone="inherit" />
                            </div>
                            <BlockStack gap="050">
                              <Text variant="bodyMd" fontWeight="bold">Enable app embed</Text>
                              <Text variant="bodySm" tone="subdued">Activate the widget in your theme editor.</Text>
                            </BlockStack>
                          </div>
                          <Button variant={isAppEmbedEnabled ? "tertiary" : "primary"} onClick={() => {
                            const url = `https://admin.shopify.com/store/${shop.split('.')[0]}/themes/current/editor?context=apps&activateAppId=2dc3da0c1804b6a547c472b2d3b6a6ca/app-card-injector`;
                            window.open(url, '_blank');
                          }}>
                            {isAppEmbedEnabled ? "Review Theme" : "Enable Now"}
                          </Button>
                        </div>
                      </Box>
                    </BlockStack>
                  </BlockStack>
                </Card>

                        {/* Tutorial Section moved to Main */}
                <Box paddingBlockStart="200">
                  <TutorialCard />
                </Box>

                <FAQSection />
              </BlockStack>
            </Layout.Section>
            <Layout.Section variant="oneThird">
              <BlockStack gap="400">
                {/* Usage Info Card */}
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
                    <Grid>
                      <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 11, lg: 6, xl: 6 }}>
                        <Button fullWidth textAlign="left" icon={PlusCircleIcon} url="/app/groups/new">Create Group</Button>
                      </Grid.Cell>
                      <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 6, lg: 6, xl: 6 }}>
                        <Button fullWidth textAlign="left" icon={PlusCircleIcon} url="/app/groups">Manage Groups</Button>
                      </Grid.Cell>
                      <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 6, lg: 6, xl: 6 }}>
                        <Button fullWidth textAlign="left" icon={AutomationIcon} url="/app/automations">Automations</Button>
                      </Grid.Cell>
                      <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 6, lg: 6, xl: 6 }}>
                        <Button fullWidth textAlign="left" icon={ImportIcon} onClick={() => setShowImportModal(true)}>Import CSV</Button>
                      </Grid.Cell>
                    </Grid>
                  </BlockStack>
                </Card>

                {/* Support moved below quick actions */}
                <Box paddingBlockStart="100">
                  <Text variant="headingSm" as="h3">Customer Support</Text>
                </Box>
                <SupportSideList />
              </BlockStack>
            </Layout.Section>
          </Layout>
        </BlockStack>
      </div>

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

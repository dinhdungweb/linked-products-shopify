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
  Badge,
  Modal,
  TextField,
  InlineStack,
  Banner,
  Thumbnail,
  Box,
  ProgressBar,
  Icon,
  InlineGrid,
  DropZone,
  Spinner,
} from "@shopify/polaris";
import {
  XIcon,
  ViewIcon,
  ImportIcon,
  PlayCircleIcon,
  ClipboardChecklistIcon,
  ChatIcon,
  EmailIcon,
  QuestionCircleIcon,
  PlusCircleIcon,
  AutomationIcon,
  PlusIcon,
  CheckIcon,
  ExternalIcon,
  NoteIcon,
} from "@shopify/polaris-icons";
import { useAppBridge } from "@shopify/app-bridge-react";
import { PLANS } from "../billing.config";
import { syncGroupMetafields, syncShopActiveHandles } from "../sync.server";
import {
  buildThemeEditorUrl,
  getAppEmbedActionLabel,
  getAppEmbedTone,
  useAppEmbedStatus,
} from "../utils/app-embed-status";

// Loader - Get product groups list
export async function loader({ request }) {
  const { authenticate } = await import("../shopify.server");
  const { default: prisma } = await import("../db.server");
  const { getUsageInfo, confirmSubscription, isBillingTestMode } = await import("../billing.server");

  const { admin, session, billing } = await authenticate.admin(request);
  const shop = session.shop;

  let usageInfo = await getUsageInfo(shop);

  try {
    const billingCheck = await billing.check({
      isTest: isBillingTestMode(),
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

  return json({
    groups,
    shop,
    usageInfo,
    totalProducts,
    apiKey: process.env.SHOPIFY_API_KEY || "",
  });
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
      await syncGroupMetafields(admin, prisma, newGroup.id);

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
    await syncShopActiveHandles(admin, prisma, session.shop);

    return json({ success: true, message: "Group and metafields deleted successfully" });
  }

  if (actionType === "importCSV") {
    const csvData = formData.get("csvData");
    if (!csvData) return json({ error: "No CSV data provided" }, { status: 400 });

    const { canAddLinks } = await import("../billing.server");

    // Fetch global settings for fallback
    const settings = await prisma.appSetting.findUnique({
      where: { shop: session.shop },
    });

    try {
      const allLines = csvData.split("\n").map(l => l.trim()).filter(l => l.length > 0);
      if (allLines.length === 0) return json({ success: true, message: "No data to import" });

      // Check for header
      const hasHeader = allLines[0].toLowerCase().includes("group name") || allLines[0].toLowerCase().includes("option name");
      const dataLines = hasHeader ? allLines.slice(1) : allLines;

      let groupsCreated = 0;
      let errors = [];

      for (const line of dataLines) {
        const parts = line.split(",").map(s => s.trim()).filter(s => s.length > 0);
        
        let groupName = "";
        let optionName = settings?.selectOptionLabel?.replace("{option}", "Color") || "Color";
        let selectorStyle = settings?.defaultProductPageStyle || "image_swatch";
        let cardStyle = "same";
        let status = "active";
        let handles = [];

        if (hasHeader) {
          // Format: Name, Option, Style, Card Style, Status, Handles...
          groupName = parts[0] || "Untitled Group";
          optionName = parts[1] || optionName;
          selectorStyle = parts[2] || selectorStyle;
          cardStyle = parts[3] || "same";
          status = parts[4] || status;
          handles = parts.slice(5);
        } else {
          // Legacy format: Name, Handle1, Handle2...
          if (parts.length < 3) {
            errors.push(`Skipped line: "${line}" (need at least group name + 2 product handles)`);
            continue;
          }
          groupName = parts[0];
          handles = parts.slice(1);
        }

        // Lookup product IDs from handles
        const products = [];
        for (const handle of handles) {
          try {
            const response = await admin.graphql(`
              query GetProductByHandle($handle: String!) {
                productByHandle(handle: $handle) { id title handle }
              }
            `, { variables: { handle } });
            const result = await response.json();
            const product = result.data?.productByHandle;
            if (product) products.push(product);
            else errors.push(`Product not found: "${handle}"`);
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

        // Create group with metadata
        const newGroup = await prisma.productGroup.create({
          data: { 
            shop: session.shop, 
            name: groupName, 
            optionName: optionName, 
            selectorStyle: selectorStyle,
            cardSelectorStyle: cardStyle,
            status: status === "active" ? "active" : "draft"
          },
        });

        for (let i = 0; i < products.length; i++) {
          await prisma.productGroupItem.create({
            data: {
              groupId: newGroup.id,
              productId: products[i].id,
              productHandle: products[i].handle,
              optionValue: products[i].title,
              position: i + 1,
              style: "one",
              customColor: "#FFFFFF"
            },
          });
        }

        // AUTO-SYNC to Shopify using centralized logic
        try {
          await syncGroupMetafields(admin, prisma, newGroup.id);
          groupsCreated++;
        } catch (e) {
          console.warn(`Group "${groupName}" created but sync failed:`, e.message);
          groupsCreated++;
        }
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
  const { groups, usageInfo, totalProducts, shop, apiKey } = useLoaderData();
  const actionData = useActionData();
  const submit = useSubmit();
  const navigation = useNavigation();
  const shopify = useAppBridge();
  const appEmbedStatus = useAppEmbedStatus(shopify);
  const isAppEmbedActive = appEmbedStatus.status === "active";
  const isCheckingAppEmbed = appEmbedStatus.status === "checking";
  const isAppEmbedStepComplete = isAppEmbedActive;
  const shouldShowEmbedBanner = !isCheckingAppEmbed && !isAppEmbedActive;
  const displayedAppEmbedStatus = appEmbedStatus;
  const appEmbedActionLabel = getAppEmbedActionLabel(appEmbedStatus.status);
  const appEmbedStepIcon = isCheckingAppEmbed ? AutomationIcon : (isAppEmbedActive ? CheckIcon : XIcon);
  const appEmbedStepColor = isCheckingAppEmbed ? '#8c9196' : (isAppEmbedActive ? '#008060' : '#D82C0D');
  const themeEditorUrl = buildThemeEditorUrl(shop, apiKey);

  const isLimitReached = usageInfo?.used >= usageInfo?.limit;
  const completedSteps = (groups.length > 0 ? 1 : 0) + (isAppEmbedStepComplete ? 1 : 0);
  const setupProgress = completedSteps * 50;
  const usageLimitLabel = usageInfo?.limit === Infinity ? "Unlimited" : usageInfo?.limit;
  const usageUnitLabel = usageInfo?.limit === 1 ? "group" : "groups";
  const usageProgress = usageInfo?.limit === Infinity
    ? 0
    : Math.min(100, ((usageInfo?.used || 0) / usageInfo?.limit) * 100);

  useEffect(() => {
    if (actionData?.success) {
      const message = actionData.message?.split("\n")[0] || "Action completed";
      shopify.toast.show(message);
    } else if (actionData?.error) {
      shopify.toast.show(actionData.error, { isError: true });
    }
  }, [actionData, shopify]);

  const StatsCard = ({ title, value, icon, color, progress, subtitle }) => (
    <div style={{
      height: '100%',
      backgroundColor: '#FFFFFF',
      border: '1px solid #E3E3E3',
      borderRadius: '12px',
      padding: '18px',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      gap: '16px',
      boxShadow: '0 1px 2px rgba(0, 0, 0, 0.04)'
    }}>
      <InlineStack align="space-between" blockAlign="start">
        <BlockStack gap="100">
          <Text variant="bodySm" fontWeight="semibold" tone="subdued">{title}</Text>
          <Text variant="headingLg" as="h2">{value}</Text>
        </BlockStack>
        <div style={{
          width: '42px',
          height: '42px',
          borderRadius: '10px',
          backgroundColor: `${color}14`,
          color,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <div style={{ display: 'flex' }}>
            <Icon source={icon} tone="inherit" />
          </div>
        </div>
      </InlineStack>

      {progress !== undefined ? (
        <BlockStack gap="150">
          <ProgressBar progress={progress} tone={progress >= 90 ? "critical" : "primary"} size="small" />
          <Text variant="bodyXs" tone="subdued">{subtitle}</Text>
        </BlockStack>
      ) : (
        subtitle && <Text variant="bodySm" tone="subdued">{subtitle}</Text>
      )}
    </div>
  );

  const SetupStep = ({ complete, icon, title, description, actionLabel, actionUrl, onAction, disabled }) => (
    <div style={{
      border: `1px solid ${complete ? '#B7E4C7' : '#E3E3E3'}`,
      borderRadius: '12px',
      backgroundColor: complete ? '#F6FFF9' : '#FFFFFF',
      padding: '16px'
    }}>
      <InlineStack align="space-between" blockAlign="center" gap="400" wrap={false}>
        <InlineStack gap="300" blockAlign="center" wrap={false}>
          <div style={{
            width: '40px',
            height: '40px',
            borderRadius: '10px',
            backgroundColor: complete ? '#E3FCEF' : '#F6F6F7',
            color: complete ? '#008060' : '#6D7175',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}>
            <div style={{ display: 'flex' }}>
              <Icon source={complete ? CheckIcon : icon} tone="inherit" />
            </div>
          </div>
          <BlockStack gap="050">
            <Text variant="bodyMd" fontWeight="semibold">{title}</Text>
            <Text variant="bodySm" tone="subdued">{description}</Text>
          </BlockStack>
        </InlineStack>
        <Button
          variant={complete ? "tertiary" : "primary"}
          url={actionUrl}
          onClick={onAction}
          disabled={disabled}
        >
          {actionLabel}
        </Button>
      </InlineStack>
    </div>
  );

  const QuickAction = ({ icon, title, description, actionLabel = "Open", url, onClick, disabled }) => (
    <div style={{
      border: '1px solid #E3E3E3',
      borderRadius: '12px',
      padding: '14px',
      backgroundColor: disabled ? '#F6F6F7' : '#FFFFFF',
      opacity: disabled ? 0.72 : 1
    }}>
      <BlockStack gap="300">
        <InlineStack gap="300" blockAlign="start" wrap={false}>
          <div style={{
            width: '34px',
            height: '34px',
            borderRadius: '9px',
            backgroundColor: '#F1F4F9',
            color: '#2C6ECB',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}>
            <div style={{ display: 'flex' }}>
              <Icon source={icon} tone="inherit" />
            </div>
          </div>
          <BlockStack gap="050">
            <Text variant="bodyMd" fontWeight="semibold">{title}</Text>
            <Text variant="bodySm" tone="subdued">{description}</Text>
          </BlockStack>
        </InlineStack>
        <Button fullWidth url={url} onClick={onClick} disabled={disabled}>
          {actionLabel}
        </Button>
      </BlockStack>
    </div>
  );

  const FAQSection = () => {
    const [openIndex, setOpenIndex] = useState(null);
    const faqs = [
      { 
        question: "Can I change the position of the options?", 
        answer: "Yes! You can use the Theme Editor to drag the 'Linked Product Variants' block to any position on your product page." 
      },
      { 
        question: "I use PageFly/GemPages/EComposer and the options appear in the wrong place", 
        answer: "Most page builders use custom layouts. You need to drag our App Block directly into your page builder's editor at the specific location you want it to appear." 
      },
      { 
        question: "Can I show options on collection pages?", 
        answer: (
          <Text variant="bodyMd" tone="subdued">
            Yes. Go to <Link to="/app/settings">Settings</Link>, enable <b>Show options on product card</b>, then save. If it still doesn't work, <Link to="mailto:support@example.com">contact us</Link>
          </Text>
        )
      },
      { 
        question: "Can a product be in two product groups?", 
        answer: "To avoid SEO conflicts and broken links, each product can only belong to one active group at a time." 
      },
      { 
        question: "I changed the option style/product group—why don't the options update?", 
        answer: "Changes are usually instant, but Shopify's CDN might cache the previous state. Try refreshing after 1-2 minutes or check if you've saved the group." 
      },
      { 
        question: "Can I make the option style match my theme's variant style?", 
        answer: (
          <Text variant="bodyMd" tone="subdued">
            Absolutely! You can use our <Link to="/app/settings">Settings &gt; Storefront</Link> tab to customize colors and borders, or use the Custom CSS field for advanced styling.
          </Text>
        )
      },
      { 
        question: "Can you help hide Shopify variants?", 
        answer: "Our app links different products together. If you need to hide actual variants of a single product, you might need theme-specific code or a dedicated variant-hiding app." 
      },
      { 
        question: "Can I link to a specific variant (like color) while keeping size?", 
        answer: "Yes! Our engine preserves the URL parameters so that linking between products feels seamless to the customer." 
      }
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
                  {openIndex === index && (
                    <Box paddingBlockStart="200">
                      {typeof faq.answer === 'string' ? (
                        <Text variant="bodyMd" tone="subdued">{faq.answer}</Text>
                      ) : (
                        faq.answer
                      )}
                    </Box>
                  )}
                </BlockStack>
              </Box>
            ))}
          </BlockStack>
        </BlockStack>
      </Card>
    );
  };

  const TutorialCard = () => (
    <div style={{
      backgroundColor: '#FFFFFF',
      borderRadius: '12px',
      overflow: 'hidden',
      border: '1px solid #E3E3E3',
      boxShadow: '0 1px 2px rgba(0, 0, 0, 0.04)'
    }}>
      <div style={{
        padding: '20px',
        display: 'flex',
        gap: '20px',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap'
      }}>
        <div style={{
          width: '240px',
          aspectRatio: '16 / 9',
          borderRadius: '14px',
          backgroundColor: '#F1F4F9',
          color: '#2C6ECB',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          flexShrink: 0,
          overflow: 'hidden'
        }}>
          <div style={{ width: '40px', height: '40px', display: 'flex' }}>
            <Icon source={PlayCircleIcon} tone="inherit" />
          </div>
          <div style={{
            position: 'absolute',
            left: '12px',
            bottom: '10px',
            padding: '3px 8px',
            borderRadius: '100px',
            backgroundColor: 'rgba(32, 34, 35, 0.78)',
            color: '#FFFFFF',
            fontSize: '12px',
            fontWeight: 600
          }}>
            7:31
          </div>
        </div>
        <div style={{ flex: '1 1 280px', minWidth: 0 }}>
          <BlockStack gap="200">
            <InlineStack gap="200" blockAlign="center">
            <div style={{
              padding: '2px 8px',
              borderRadius: '100px',
              backgroundColor: '#EEF4FF',
              color: '#2C6ECB',
              fontSize: '11px',
              fontWeight: '700',
              textTransform: 'uppercase'
            }}>
              Tutorial
            </div>
            </InlineStack>
            <Text variant="headingMd" as="h2">How to use the app</Text>
            <Text variant="bodyMd" tone="subdued">
              Watch a quick walkthrough to get set up faster and avoid common mistakes in product linking.
            </Text>
          </BlockStack>
        </div>
        <div style={{ width: '140px', marginLeft: 'auto' }}>
          <BlockStack gap="200">
            <Button fullWidth variant="primary" icon={PlayCircleIcon} onClick={() => window.open('https://www.youtube.com/watch?v=jO2yBhXzruE', '_blank')}>Watch video</Button>
            <Button fullWidth variant="secondary" icon={ExternalIcon} url="/app/help">Help center</Button>
          </BlockStack>
        </div>
      </div>
    </div>
  );

  const SupportSideList = () => (
    <BlockStack gap="300">
      <Card padding="400" background="bg-surface-secondary">
        <BlockStack gap="300">
          <InlineStack gap="200" blockAlign="center">
            <div style={{ backgroundColor: '#FFFFFF', padding: '8px', borderRadius: '8px', color: '#5C5F62', display: 'flex' }}><Icon source={EmailIcon} tone="inherit" /></div>
            <Text variant="headingSm" as="h3">Email Support</Text>
          </InlineStack>
          <Text variant="bodySm" tone="subdued">Response time: <Text fontWeight="bold" as="span">Under 24h</Text></Text>
          <Button variant="plain" url="mailto:support@example.com">Contact us</Button>
        </BlockStack>
      </Card>
      <Card padding="400" background="bg-surface-secondary">
        <BlockStack gap="300">
          <InlineStack gap="200" blockAlign="center">
            <div style={{ backgroundColor: '#FFFFFF', padding: '8px', borderRadius: '8px', color: '#5C5F62', display: 'flex' }}><Icon source={ChatIcon} tone="inherit" /></div>
            <Text variant="headingSm" as="h3">Live Chat</Text>
          </InlineStack>
          <Text variant="bodySm" tone="subdued">Chat with us for instant help.</Text>
          <Button variant="plain">Start chat</Button>
        </BlockStack>
      </Card>
    </BlockStack>
  );

  const [showImportModal, setShowImportModal] = useState(false);
  const [csvData, setCsvData] = useState("");
  const [file, setFile] = useState(null);

  const isLoading = navigation.state === "submitting" || navigation.state === "loading";
  const isImporting = isLoading && navigation.formData?.get("action") === "importCSV";

  const handleDrop = useCallback(
    (_droppedFiles, acceptedFiles, _rejectedFiles) => {
      if (acceptedFiles.length > 0) {
        const file = acceptedFiles[0];
        setFile(file);
        
        const reader = new FileReader();
        reader.onload = (e) => {
          setCsvData(e.target.result);
        };
        reader.readAsText(file);
      }
    },
    [],
  );

  const handleImportFile = useCallback(async () => {
    if (!csvData) return;
    
    const formData = new FormData();
    formData.append("action", "importCSV");
    formData.append("csvData", csvData);
    
    const headers = await fetchIdToken();
    submit(formData, { method: "POST", headers });
  }, [csvData, submit]);

  useEffect(() => {
    // Tự động đóng modal khi import thành công
    if (actionData?.success && actionData?.message?.includes("Import completed") && showImportModal) {
      setShowImportModal(false);
      setFile(null);
      setCsvData("");
    }
  }, [actionData, showImportModal]);

  const fetchIdToken = async () => {
    try {
      if (typeof window !== "undefined" && window.shopify && window.shopify.idToken) {
        const idToken = await window.shopify.idToken();
        return { Authorization: `Bearer ${idToken}` };
      }
    } catch (e) { console.error("Token error:", e); }
    return {};
  };

  return (
    <Page fullWidth>
      <div style={{ maxWidth: "1180px", margin: "0 auto", padding: "18px 0 40px" }}>
        <BlockStack gap="500">
          <div style={{
            backgroundColor: '#FFFFFF',
            border: '1px solid #E3E3E3',
            borderRadius: '14px',
            padding: '24px',
            boxShadow: '0 1px 2px rgba(0, 0, 0, 0.04)'
          }}>
            <InlineStack align="space-between" blockAlign="start" gap="500">
              <BlockStack gap="300">
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', alignSelf: 'flex-start' }}>
                  <Badge tone="info">{usageInfo.planName} plan</Badge>
                  {isLimitReached && <Badge tone="critical">Limit reached</Badge>}
                </div>
                <BlockStack gap="150">
                  <Text variant="heading2xl" as="h1">Welcome to Linkify: Product Variants</Text>
                  <Text variant="bodyMd" tone="subdued">
                    Manage linked product groups, storefront visibility, and product-card options from one place.
                  </Text>
                </BlockStack>
              </BlockStack>
              <InlineStack gap="300" wrap={false}>
                <Button icon={ViewIcon} url="/app/groups">Manage groups</Button>
                <Button
                  variant="primary"
                  icon={PlusCircleIcon}
                  url={isLimitReached ? undefined : "/app/groups/new"}
                  disabled={isLimitReached}
                >
                  {isLimitReached ? "Limit reached" : "Create group"}
                </Button>
              </InlineStack>
            </InlineStack>
          </div>

          <Layout>
            <Layout.Section>
              <BlockStack gap="500">
                {/* Dynamic Alerts */}
                {shouldShowEmbedBanner && (
                  <Banner
                    title="Theme integration required"
                    tone={getAppEmbedTone(appEmbedStatus.status)}
                    action={{
                      content: getAppEmbedActionLabel(appEmbedStatus.status),
                      onAction: () => {
                        window.open(themeEditorUrl, '_blank');
                      }
                    }}
                  >
                    <p>{appEmbedStatus.description}</p>
                  </Banner>
                )}

                {/* Stats Cards Row */}
                <InlineGrid columns={{ xs: 1, sm: 2, md: 3 }} gap="400">
                  <StatsCard
                    title="Plan usage"
                    value={`${usageInfo?.used || 0} / ${usageLimitLabel ?? 0}`}
                    icon={CheckIcon}
                    color={isLimitReached ? "#D82C0D" : "#008060"}
                    progress={usageProgress}
                    subtitle={isLimitReached ? "Limit reached" : "Group capacity"}
                  />
                  <StatsCard
                    title="Linked products"
                    value={totalProducts}
                    icon={PlusIcon}
                    color="#2C6ECB"
                    subtitle={`${groups.length} product ${groups.length === 1 ? "group" : "groups"}`}
                  />
                  <StatsCard
                    title="App status"
                    value={displayedAppEmbedStatus.label}
                    icon={appEmbedStepIcon}
                    color={appEmbedStepColor}
                    subtitle="Storefront visibility"
                  />
                </InlineGrid>

                {/* Premium Setup Guide */}
                <Card padding="500">
                  <BlockStack gap="400">
                    <InlineStack align="space-between" blockAlign="center">
                      <BlockStack gap="100">
                        <Text variant="headingMd" as="h2">Setup guide</Text>
                        <Text variant="bodySm" tone="subdued">Complete the essentials for a stable storefront setup.</Text>
                      </BlockStack>
                      <Badge tone={groups.length > 0 && isAppEmbedStepComplete ? "success" : "attention"}>
                        {completedSteps}/2 completed
                      </Badge>
                    </InlineStack>

                    <ProgressBar
                      progress={setupProgress}
                      size="small"
                      tone="primary"
                    />

                    <BlockStack gap="300">
                      <SetupStep
                        complete={groups.length > 0}
                        icon={ClipboardChecklistIcon}
                        title="Create a product group"
                        description="Link related products so shoppers can switch between them as options."
                        actionLabel={groups.length > 0 ? "View groups" : (isLimitReached ? "Limit reached" : "Create group")}
                        actionUrl={groups.length > 0 ? "/app/groups" : (isLimitReached ? undefined : "/app/groups/new")}
                        disabled={groups.length === 0 && isLimitReached}
                      />
                      <SetupStep
                        complete={isAppEmbedStepComplete}
                        icon={AutomationIcon}
                        title="Enable app embed"
                        description={displayedAppEmbedStatus.description}
                        actionLabel={appEmbedActionLabel}
                        onAction={() => window.open(themeEditorUrl, '_blank')}
                      />
                    </BlockStack>
                  </BlockStack>
                </Card>

                <TutorialCard />

                <FAQSection />
              </BlockStack>
            </Layout.Section>
            <Layout.Section variant="oneThird">
              <BlockStack gap="400">
                <Card padding="500">
                  <BlockStack gap="400">
                    <InlineStack align="space-between" blockAlign="center">
                      <Text variant="headingMd" as="h2">Current plan</Text>
                      <Badge tone={isLimitReached ? "critical" : "success"}>{usageInfo.planName}</Badge>
                    </InlineStack>
                    <BlockStack gap="150">
                      <Text variant="headingLg" as="p">
                        {usageInfo.used} / {usageLimitLabel} {usageUnitLabel}
                      </Text>
                      <Text variant="bodySm" tone="subdued">
                        {isLimitReached ? "Upgrade to create more product groups." : "Usage is within your plan limit."}
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
                      {usageInfo.plan === "free" ? "Upgrade plan" : "Manage plan"}
                    </Button>
                  </BlockStack>
                </Card>

                <Card padding="500">
                  <BlockStack gap="400">
                    <BlockStack gap="100">
                      <Text variant="headingMd" as="h2">Quick actions</Text>
                      <Text variant="bodySm" tone="subdued">Shortcuts for common admin tasks.</Text>
                    </BlockStack>
                    <BlockStack gap="300">
                      <QuickAction
                        icon={PlusCircleIcon}
                        title="Create group"
                        description="Start a new linked product group."
                        actionLabel={isLimitReached ? "Limit reached" : "Create group"}
                        url={isLimitReached ? undefined : "/app/groups/new"}
                        disabled={isLimitReached}
                      />
                      <QuickAction
                        icon={ViewIcon}
                        title="Manage groups"
                        description="Review, edit, and sync existing groups."
                        actionLabel="Open groups"
                        url="/app/groups"
                      />
                      <QuickAction
                        icon={AutomationIcon}
                        title="Automations"
                        description="Create groups automatically from product rules."
                        actionLabel="Open automations"
                        url="/app/automations"
                      />
                      <QuickAction
                        icon={ImportIcon}
                        title="Import CSV"
                        description="Bulk create groups from product handles."
                        actionLabel="Import CSV"
                        onClick={() => setShowImportModal(true)}
                      />
                    </BlockStack>
                  </BlockStack>
                </Card>

                <BlockStack gap="300">
                  <Text variant="headingMd" as="h2">Customer support</Text>
                  <SupportSideList />
                </BlockStack>
              </BlockStack>
            </Layout.Section>
          </Layout>
        </BlockStack>
      </div>

      {/* Import CSV Modal */}
      <Modal
        open={showImportModal}
        onClose={() => {
          if (isImporting) return;
          setShowImportModal(false);
          setCsvData("");
          setFile(null);
        }}
        title="Import Groups from CSV"
        primaryAction={{
          content: isImporting ? "Importing..." : "Import",
          onAction: handleImportFile,
          loading: isImporting,
          disabled: !csvData.trim() || isImporting,
        }}
        secondaryActions={[{
          content: "Cancel",
          onAction: () => {
            setShowImportModal(false);
            setCsvData("");
            setFile(null);
          },
          disabled: isImporting,
        }]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            {isImporting ? (
               <Box padding="800">
                  <BlockStack gap="400" align="center">
                    <Spinner size="large" />
                    <Text variant="headingMd" as="h2">Importing and syncing your products...</Text>
                    <Text variant="bodyMd" tone="subdued">This may take a moment depending on the number of groups.</Text>
                  </BlockStack>
               </Box>
            ) : (
              <>
                <Banner tone="info">
                  <BlockStack gap="200">
                    <p><strong>CSV Format:</strong> Each line creates one group.</p>
                    <p><code>Group Name, product-handle-1, product-handle-2, ...</code></p>
                    <p><strong>Example:</strong></p>
                    <p><code>T-Shirt Colors, red-tshirt, blue-tshirt, green-tshirt</code></p>
                  </BlockStack>
                </Banner>
                
                <Box paddingBlock="200">
                  <DropZone onDrop={handleDrop} allowMultiple={false} accept=".csv, text/csv">
                    {file ? (
                      <Box padding="400">
                        <InlineStack gap="300" blockAlign="center">
                          <Thumbnail
                            size="small"
                            alt="CSV File"
                            source={NoteIcon}
                          />
                          <BlockStack gap="100">
                            <Text variant="bodyMd" fontWeight="bold">
                              {file.name}
                            </Text>
                            <Text variant="bodySm" tone="subdued">
                              {Math.round(file.size / 1024)} KB
                            </Text>
                          </BlockStack>
                          <Button variant="plain" tone="critical" onClick={(e) => { e.stopPropagation(); setFile(null); setCsvData(""); }}>
                            Remove
                          </Button>
                        </InlineStack>
                      </Box>
                    ) : (
                      <DropZone.FileUpload actionHint="Accepts .csv files" />
                    )}
                  </DropZone>
                </Box>

                <TextField
                  label="Or paste CSV Data here"
                  value={csvData}
                  onChange={setCsvData}
                  multiline={4}
                  placeholder={"Group Name, product-handle-1, product-handle-2"}
                  autoComplete="off"
                  helpText="Each line = one new group."
                />
              </>
            )}
          </BlockStack>
        </Modal.Section>
      </Modal>
    </Page>
  );
}

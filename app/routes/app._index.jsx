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
} from "@shopify/polaris";
import { XIcon, SearchIcon, ViewIcon, DeleteIcon } from "@shopify/polaris-icons";
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

    await prisma.productGroup.delete({
      where: { id: groupId },
    });

    return json({ success: true, message: "Group deleted" });
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
      <TitleBar title="Variants Linked Products">
        <button variant="primary" onClick={() => setShowCreateModal(true)}>
          Create Group
        </button>
      </TitleBar>

      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            {actionData?.success && actionBannerVisible && (
              <Banner tone="success" onDismiss={() => setActionBannerVisible(false)}>
                <p>{actionData.message}</p>
              </Banner>
            )}
            {actionData?.error && actionBannerVisible && (
              <Banner tone="critical" onDismiss={() => setActionBannerVisible(false)}>
                <p style={{ whiteSpace: "pre-line" }}>{actionData.error}</p>
              </Banner>
            )}

            {/* Usage Info Banner */}
            <Card background="bg-surface-secondary">
              <InlineStack align="space-between" blockAlign="center">
                <BlockStack gap="200">
                  <Text variant="headingSm">
                    {usageInfo.planName} Plan: {usageInfo.used} / {usageInfo.limit === Infinity ? "Unlimited" : usageInfo.limit} links used
                  </Text>
                  {usageInfo.limit !== Infinity && (
                    <Box maxWidth="300px">
                      <ProgressBar
                        progress={usageInfo.percentage}
                        tone={usageInfo.percentage >= 90 ? "critical" : usageInfo.percentage >= 70 ? "warning" : "primary"}
                        size="small"
                      />
                    </Box>
                  )}
                </BlockStack>
                {usageInfo.plan !== "pro" && (
                  <Button url="/app/pricing" variant="primary">
                    Upgrade Plan
                  </Button>
                )}
                {usageInfo.plan === "pro" && (
                  <Button url="/app/pricing">Manage Plan</Button>
                )}
              </InlineStack>
            </Card>

            {groups.length === 0 ? (
              <Card>
                <EmptyState
                  heading="Start linking your products"
                  action={{
                    content: "Create first group",
                    onAction: () => setShowCreateModal(true),
                  }}
                  secondaryAction={{
                    content: "View Setup Guide",
                    url: "/app/help",
                  }}
                  image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                >
                  <p>
                    <strong>How it works:</strong> Create product groups to link products together like variants.
                    Metafields will be automatically synced, allowing customers to navigate between linked products easily.
                  </p>
                </EmptyState>
              </Card>
            ) : (
              <>
                <Banner tone="info">
                  <p>
                    Don't see the linked products on your store? Make sure to add the <strong>Linked Products App Block</strong> in your <Link to="/app/help">Setup Guide</Link>.
                  </p>
                </Banner>
                {isSyncing && (
                  <Box paddingBlockEnd="400">
                    <BlockStack gap="100">
                      <Text variant="bodySm" tone="subdued">Creating and syncing group... Please wait.</Text>
                      <ProgressBar size="small" animated progress={45} />
                    </BlockStack>
                  </Box>
                )}
                <Card padding="0">
                  <IndexTable
                    resourceName={{ singular: "group", plural: "groups" }}
                    itemCount={groups.length}
                    headings={[
                      { title: "Group Name" },
                      { title: "Products" },
                      { title: "Status" },
                      { title: "Actions", alignment: "end" },
                    ]}
                    selectable={false}
                  >
                    {groups.map((group, index) => (
                      <IndexTable.Row id={group.id} key={group.id} position={index}>
                        <IndexTable.Cell>
                          <div style={{ maxWidth: '300px' }}>
                            <Text variant="bodyMd" fontWeight="bold" truncate>
                              <Link to={`/app/groups/${group.id}`}>{group.name}</Link>
                            </Text>
                          </div>
                        </IndexTable.Cell>
                        <IndexTable.Cell>{group._count.products}</IndexTable.Cell>
                        <IndexTable.Cell>
                          {getSyncStatusBadge(group.syncStatus)}
                        </IndexTable.Cell>
                        <IndexTable.Cell>
                          <InlineStack gap="100" align="end">
                            <Tooltip content="View details">
                              <Button
                                icon={ViewIcon}
                                url={`/app/groups/${group.id}`}
                                accessibilityLabel="View group"
                              />
                            </Tooltip>
                            <Tooltip content="Delete group">
                              <Button
                                icon={DeleteIcon}
                                tone="critical"
                                onClick={() => handleDeleteGroup(group.id)}
                                loading={isLoading && navigation.formData?.get("action") === "delete" && navigation.formData?.get("groupId") === group.id}
                                accessibilityLabel="Delete group"
                              />
                            </Tooltip>
                          </InlineStack>
                        </IndexTable.Cell>
                      </IndexTable.Row>
                    ))}
                  </IndexTable>
                </Card>
              </>
            )}
          </BlockStack>
        </Layout.Section>
      </Layout>

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
    </Page>
  );
}

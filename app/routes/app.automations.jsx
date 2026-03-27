import { useState, useCallback, useEffect } from "react";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation, useActionData } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  Text,
  Button,
  InlineStack,
  Badge,
  Banner,
  Modal,
  FormLayout,
  TextField,
  Select,
  EmptyState,
  IndexTable,
  Box,
  Divider,
  Tooltip,
  ProgressBar,
  Tabs,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { DeleteIcon, PlayIcon, PauseCircleIcon } from "@shopify/polaris-icons";

// Loader
export async function loader({ request }) {
  const { authenticate } = await import("../shopify.server");
  const { default: prisma } = await import("../db.server");

  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const rules = await prisma.automationRule.findMany({
    where: { shop },
    orderBy: { createdAt: "desc" },
  });

  return json({ rules, shop });
}

// Action
export async function action({ request }) {
  const { authenticate } = await import("../shopify.server");
  const { default: prisma } = await import("../db.server");
  const { canAddLinks } = await import("../billing.server");

  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();
  const actionType = formData.get("action");

  // Create automation rule
  if (actionType === "createRule") {
    const name = formData.get("name");
    const type = formData.get("type");
    const pattern = formData.get("pattern");
    const optionName = formData.get("optionName") || "Color";
    const selectorStyle = formData.get("selectorStyle") || "block";

    if (!name || !type || !pattern) {
      return json({ error: "Name, type, and pattern are required" }, { status: 400 });
    }

    await prisma.automationRule.create({
      data: { shop, name, type, pattern, optionName, selectorStyle },
    });

    return json({ success: true, message: `Rule "${name}" created successfully!` });
  }

  // Delete rule
  if (actionType === "deleteRule") {
    const ruleId = formData.get("ruleId");
    await prisma.automationRule.delete({ where: { id: ruleId } });
    return json({ success: true, message: "Rule deleted" });
  }

  // Toggle status
  if (actionType === "toggleRule") {
    const ruleId = formData.get("ruleId");
    const rule = await prisma.automationRule.findUnique({ where: { id: ruleId } });
    if (!rule) return json({ error: "Rule not found" }, { status: 404 });

    await prisma.automationRule.update({
      where: { id: ruleId },
      data: { status: rule.status === "active" ? "paused" : "active" },
    });
    return json({ success: true, message: `Rule ${rule.status === "active" ? "paused" : "activated"}` });
  }

  // Run automation rule
  if (actionType === "runRule") {
    const ruleId = formData.get("ruleId");
    const rule = await prisma.automationRule.findUnique({ where: { id: ruleId } });
    if (!rule) return json({ error: "Rule not found" }, { status: 404 });

    try {
      let products = [];
      let groupKeyExtractor;

      if (rule.type === "title_pattern") {
        // Fetch all products, group by title pattern
        const regex = new RegExp(rule.pattern, "i");
        const allProducts = await fetchAllProducts(admin);

        // Group products by base title (match group)
        const grouped = {};
        for (const p of allProducts) {
          const match = p.title.match(regex);
          if (match) {
            const baseKey = match[1] || match[0]; // Use first capture group or full match
            if (!grouped[baseKey]) grouped[baseKey] = [];
            grouped[baseKey].push(p);
          }
        }
        products = grouped;
        groupKeyExtractor = (key) => key;

      } else if (rule.type === "tag") {
        // Find all products with the specified tag
        const allProducts = await fetchAllProducts(admin);
        const tagName = rule.pattern.toLowerCase();
        const taggedProducts = allProducts.filter(p =>
          p.tags && p.tags.some(t => t.toLowerCase() === tagName)
        );

        if (taggedProducts.length >= 2) {
          products = { [rule.pattern]: taggedProducts };
        }

      } else if (rule.type === "sku_pattern") {
        const regex = new RegExp(rule.pattern, "i");
        const allProducts = await fetchAllProducts(admin);

        const grouped = {};
        for (const p of allProducts) {
          // Check product SKU from first variant
          const sku = p.sku || "";
          const match = sku.match(regex);
          if (match) {
            const baseKey = match[1] || match[0];
            if (!grouped[baseKey]) grouped[baseKey] = [];
            grouped[baseKey].push(p);
          }
        }
        products = grouped;

      } else if (rule.type === "collection") {
        // Fetch products from a specific collection
        const collectionProducts = await fetchCollectionProducts(admin, rule.pattern);
        if (collectionProducts.length >= 2) {
          products = { [rule.pattern]: collectionProducts };
        }
      }

      let groupsCreated = 0;
      const productGroups = typeof products === "object" ? products : {};

      for (const [groupKey, groupProducts] of Object.entries(productGroups)) {
        if (groupProducts.length < 2) continue;

        // Check if any product already in a group
        const productIds = groupProducts.map(p => p.id);
        const existing = await prisma.productGroupItem.findMany({
          where: { productId: { in: productIds } },
        });
        if (existing.length > 0) continue;

        // Check link limit
        const canAdd = await canAddLinks(shop, groupProducts.length);
        if (!canAdd) break;

        // Create group
        const groupName = `${rule.name} - ${groupKey}`;
        const newGroup = await prisma.productGroup.create({
          data: {
            shop,
            name: groupName,
            optionName: rule.optionName,
            selectorStyle: rule.selectorStyle,
          },
        });

        // Add products
        for (let i = 0; i < groupProducts.length; i++) {
          await prisma.productGroupItem.create({
            data: {
              groupId: newGroup.id,
              productId: groupProducts[i].id,
              productHandle: groupProducts[i].handle,
              optionValue: groupProducts[i].title,
              position: i + 1,
            },
          });
        }

        // Sync metafields for this group
        await syncGroupMetafieldsHelper(admin, prisma, newGroup.id);
        groupsCreated++;
      }

      // Update rule
      await prisma.automationRule.update({
        where: { id: ruleId },
        data: {
          lastRunAt: new Date(),
          groupsCreated: { increment: groupsCreated },
        },
      });

      return json({
        success: true,
        message: groupsCreated > 0
          ? `Automation completed! Created ${groupsCreated} new groups.`
          : "No new groups were created. Products may already be grouped or the pattern didn't match enough products."
      });
    } catch (error) {
      console.error("Automation run error:", error);
      return json({ error: `Automation failed: ${error.message}` }, { status: 500 });
    }
  }

  return json({ error: "Invalid action" }, { status: 400 });
}

// Helper: Fetch all products from Shopify
async function fetchAllProducts(admin) {
  const products = [];
  let cursor = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const query = cursor
      ? `query { products(first: 100, after: "${cursor}") { edges { cursor node { id title handle tags variants(first: 1) { nodes { sku } } } } pageInfo { hasNextPage } } }`
      : `query { products(first: 100) { edges { cursor node { id title handle tags variants(first: 1) { nodes { sku } } } } pageInfo { hasNextPage } } }`;

    const response = await admin.graphql(query);
    const result = await response.json();
    const edges = result.data?.products?.edges || [];

    for (const edge of edges) {
      products.push({
        id: edge.node.id,
        title: edge.node.title,
        handle: edge.node.handle,
        tags: edge.node.tags || [],
        sku: edge.node.variants?.nodes?.[0]?.sku || "",
      });
      cursor = edge.cursor;
    }

    hasNextPage = result.data?.products?.pageInfo?.hasNextPage || false;
  }

  return products;
}

// Helper: Fetch products from a collection
async function fetchCollectionProducts(admin, collectionIdOrHandle) {
  const products = [];

  // Try to find collection by handle or ID
  let collectionGid = collectionIdOrHandle;
  if (!collectionIdOrHandle.startsWith("gid://")) {
    // Search by handle
    const searchResponse = await admin.graphql(`
      query { collectionByHandle(handle: "${collectionIdOrHandle}") { id } }
    `);
    const searchResult = await searchResponse.json();
    collectionGid = searchResult.data?.collectionByHandle?.id;
    if (!collectionGid) return products;
  }

  let cursor = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const query = cursor
      ? `query { collection(id: "${collectionGid}") { products(first: 100, after: "${cursor}") { edges { cursor node { id title handle } } pageInfo { hasNextPage } } } }`
      : `query { collection(id: "${collectionGid}") { products(first: 100) { edges { cursor node { id title handle } } pageInfo { hasNextPage } } } }`;

    const response = await admin.graphql(query);
    const result = await response.json();
    const edges = result.data?.collection?.products?.edges || [];

    for (const edge of edges) {
      products.push({
        id: edge.node.id,
        title: edge.node.title,
        handle: edge.node.handle,
      });
      cursor = edge.cursor;
    }

    hasNextPage = result.data?.collection?.products?.pageInfo?.hasNextPage || false;
  }

  return products;
}

// Helper: Sync metafields for a group
async function syncGroupMetafieldsHelper(admin, prisma, groupId) {
  const group = await prisma.productGroup.findUnique({
    where: { id: groupId },
    include: { products: { orderBy: { position: "asc" } } },
  });

  if (!group || group.products.length < 2) return;

  const metafields = [];
  const metafieldValue = group.products.map(p => ({
    handle: p.productHandle,
    title: p.optionValue || "",
    image: p.customImageUrl || "",
    color: p.customColor || ""
  }));

  for (const product of group.products) {
    metafields.push(
      { ownerId: product.productId, namespace: "linked_products", key: "linked_list", value: JSON.stringify(metafieldValue), type: "json" },
      { ownerId: product.productId, namespace: "linked_products", key: "option_value", value: product.optionValue || "", type: "single_line_text_field" },
      { ownerId: product.productId, namespace: "linked_products", key: "inventory_behavior", value: group.inventoryBehavior || "show", type: "single_line_text_field" },
      { ownerId: product.productId, namespace: "linked_products", key: "option_name", value: group.optionName || "Color", type: "single_line_text_field" },
      { ownerId: product.productId, namespace: "linked_products", key: "selector_style", value: group.selectorStyle || "block", type: "single_line_text_field" },
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

    const result = await mutation.json();
    if (result.data?.metafieldsSet?.userErrors?.length > 0) {
      throw new Error(result.data.metafieldsSet.userErrors[0].message);
    }
  }

  await prisma.productGroup.update({
    where: { id: groupId },
    data: { syncStatus: "synced" },
  });
}

// Helper data for automation types
const AUTOMATION_TYPES = [
  {
    value: "title_pattern",
    label: "Title Pattern",
    description: "Group products by matching title patterns using regex",
    placeholder: "e.g. (.+?)\\s*-\\s*\\w+",
    helpText: "Use regex with capture group. Products matching the same capture group will be grouped together.",
    badge: "Single Option",
  },
  {
    value: "sku_pattern",
    label: "SKU Pattern",
    description: "Group products by matching SKU patterns",
    placeholder: "e.g. (SKU-\\d+)-\\w+",
    helpText: "Products with matching SKU base pattern will be grouped together.",
    badge: "Single Option",
  },
  {
    value: "tag",
    label: "Product Tag",
    description: "Group all products with a specific tag",
    placeholder: "e.g. summer-collection",
    helpText: "All products with this exact tag will be grouped into one group.",
    badge: "Single Option",
  },
  {
    value: "collection",
    label: "Collection",
    description: "Group all products within a collection",
    placeholder: "e.g. summer-tshirts (collection handle)",
    helpText: "All products in this collection will be grouped together.",
    badge: "Single Option",
  },
];

export default function AutomationsPage() {
  const { rules } = useLoaderData();
  const actionData = useActionData();
  const submit = useSubmit();
  const navigation = useNavigation();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedTab, setSelectedTab] = useState(0);
  const [formState, setFormState] = useState({
    name: "",
    type: "title_pattern",
    pattern: "",
    optionName: "Color",
    selectorStyle: "block",
  });
  const [actionBannerVisible, setActionBannerVisible] = useState(true);

  useEffect(() => {
    if (actionData) {
      setActionBannerVisible(true);
    }
  }, [actionData]);

  const isLoading = navigation.state === "submitting" || navigation.state === "loading";

  const tabs = [
    { id: "all", content: "All", panelID: "all" },
    { id: "title_pattern", content: "Title Pattern", panelID: "title_pattern" },
    { id: "sku_pattern", content: "SKU Pattern", panelID: "sku_pattern" },
    { id: "tag", content: "Tag", panelID: "tag" },
    { id: "collection", content: "Collection", panelID: "collection" },
  ];

  const filteredRules = selectedTab === 0
    ? rules
    : rules.filter(r => r.type === tabs[selectedTab].id);

  const handleCreateRule = useCallback(() => {
    const fd = new FormData();
    fd.append("action", "createRule");
    fd.append("name", formState.name);
    fd.append("type", formState.type);
    fd.append("pattern", formState.pattern);
    fd.append("optionName", formState.optionName);
    fd.append("selectorStyle", formState.selectorStyle);
    submit(fd, { method: "POST" });
    setShowCreateModal(false);
    setFormState({ name: "", type: "title_pattern", pattern: "", optionName: "Color", selectorStyle: "block" });
  }, [formState, submit]);

  const handleDeleteRule = useCallback((ruleId) => {
    if (!confirm("Delete this automation rule?")) return;
    const fd = new FormData();
    fd.append("action", "deleteRule");
    fd.append("ruleId", ruleId);
    submit(fd, { method: "POST" });
  }, [submit]);

  const handleToggleRule = useCallback((ruleId) => {
    const fd = new FormData();
    fd.append("action", "toggleRule");
    fd.append("ruleId", ruleId);
    submit(fd, { method: "POST" });
  }, [submit]);

  const handleRunRule = useCallback((ruleId) => {
    if (!confirm("Run this automation? This will create new product groups based on the rule pattern.")) return;
    const fd = new FormData();
    fd.append("action", "runRule");
    fd.append("ruleId", ruleId);
    submit(fd, { method: "POST" });
  }, [submit]);

  const selectedType = AUTOMATION_TYPES.find(t => t.value === formState.type);

  return (
    <Page
      backAction={{ url: "/app" }}
      title="Automations"
      primaryAction={{
        content: "Create Rule",
        onAction: () => setShowCreateModal(true),
      }}
    >
      <TitleBar title="Automations" />

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
                <p>{actionData.error}</p>
              </Banner>
            )}

            <Banner tone="info">
              <p>
                Automations help you bulk-create product groups by detecting patterns in your product titles, SKUs, tags, or collections.
                Create a rule, then click <strong>Run</strong> to scan your products and create groups automatically.
              </p>
            </Banner>

            {/* Automation Type Cards */}
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd">Available Automation Types</Text>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
                  {AUTOMATION_TYPES.map((type) => (
                    <div
                      key={type.value}
                      style={{
                        border: '1px solid #e5e5e5',
                        borderRadius: '8px',
                        padding: '16px',
                      }}
                    >
                      <BlockStack gap="200">
                        <InlineStack gap="200" blockAlign="center">
                          <Text variant="headingSm">{type.label}</Text>
                          <Badge>{type.badge}</Badge>
                        </InlineStack>
                        <Text tone="subdued" variant="bodySm">{type.description}</Text>
                        <Button
                          size="slim"
                          onClick={() => {
                            setFormState(prev => ({ ...prev, type: type.value }));
                            setShowCreateModal(true);
                          }}
                        >
                          Configure
                        </Button>
                      </BlockStack>
                    </div>
                  ))}
                </div>
              </BlockStack>
            </Card>

            {/* Rules List */}
            <Card padding="0">
              {rules.length === 0 ? (
                <Box padding="600">
                  <EmptyState
                    heading="No automation rules yet"
                    action={{
                      content: "Create first rule",
                      onAction: () => setShowCreateModal(true),
                    }}
                    image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                  >
                    <p>Create automation rules to bulk-create product groups.</p>
                  </EmptyState>
                </Box>
              ) : (
                <>
                  <Box padding="400" paddingBlockEnd="0">
                    <Tabs tabs={tabs} selected={selectedTab} onSelect={setSelectedTab} />
                  </Box>
                  <IndexTable
                    resourceName={{ singular: "rule", plural: "rules" }}
                    itemCount={filteredRules.length}
                    headings={[
                      { title: "Rule Name" },
                      { title: "Type" },
                      { title: "Pattern" },
                      { title: "Groups Created" },
                      { title: "Status" },
                      { title: "Actions", alignment: "end" },
                    ]}
                    selectable={false}
                  >
                    {filteredRules.map((rule, index) => (
                      <IndexTable.Row id={rule.id} key={rule.id} position={index}>
                        <IndexTable.Cell>
                          <Text variant="bodyMd" fontWeight="bold">{rule.name}</Text>
                        </IndexTable.Cell>
                        <IndexTable.Cell>
                          <Badge>{AUTOMATION_TYPES.find(t => t.value === rule.type)?.label || rule.type}</Badge>
                        </IndexTable.Cell>
                        <IndexTable.Cell>
                          <div style={{ maxWidth: '200px' }}>
                            <Text variant="bodySm" truncate>
                              <code>{rule.pattern}</code>
                            </Text>
                          </div>
                        </IndexTable.Cell>
                        <IndexTable.Cell>
                          <Text>{rule.groupsCreated}</Text>
                        </IndexTable.Cell>
                        <IndexTable.Cell>
                          <Badge tone={rule.status === "active" ? "success" : undefined}>
                            {rule.status === "active" ? "Active" : "Paused"}
                          </Badge>
                        </IndexTable.Cell>
                        <IndexTable.Cell>
                          <InlineStack gap="100" align="end">
                            <Tooltip content="Run now">
                              <Button
                                icon={PlayIcon}
                                variant="primary"
                                size="slim"
                                onClick={() => handleRunRule(rule.id)}
                                loading={isLoading && navigation.formData?.get("ruleId") === rule.id && navigation.formData?.get("action") === "runRule"}
                                disabled={isLoading}
                                accessibilityLabel="Run rule"
                              />
                            </Tooltip>
                            <Tooltip content={rule.status === "active" ? "Pause" : "Activate"}>
                              <Button
                                icon={PauseCircleIcon}
                                size="slim"
                                onClick={() => handleToggleRule(rule.id)}
                                accessibilityLabel="Toggle rule"
                              />
                            </Tooltip>
                            <Tooltip content="Delete">
                              <Button
                                icon={DeleteIcon}
                                tone="critical"
                                size="slim"
                                onClick={() => handleDeleteRule(rule.id)}
                                accessibilityLabel="Delete rule"
                              />
                            </Tooltip>
                          </InlineStack>
                        </IndexTable.Cell>
                      </IndexTable.Row>
                    ))}
                  </IndexTable>
                </>
              )}
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>

      {/* Create Rule Modal */}
      <Modal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Create Automation Rule"
        primaryAction={{
          content: "Create Rule",
          onAction: handleCreateRule,
          disabled: !formState.name || !formState.pattern,
          loading: isLoading && navigation.formData?.get("action") === "createRule",
        }}
        secondaryActions={[{ content: "Cancel", onAction: () => setShowCreateModal(false) }]}
      >
        <Modal.Section>
          <FormLayout>
            <TextField
              label="Rule Name"
              value={formState.name}
              onChange={(v) => setFormState(prev => ({ ...prev, name: v }))}
              placeholder="e.g. Group T-Shirts by Color"
              autoComplete="off"
              requiredIndicator
            />

            <Select
              label="Automation Type"
              options={AUTOMATION_TYPES.map(t => ({ label: t.label, value: t.value }))}
              value={formState.type}
              onChange={(v) => setFormState(prev => ({ ...prev, type: v }))}
            />

            <TextField
              label="Pattern"
              value={formState.pattern}
              onChange={(v) => setFormState(prev => ({ ...prev, pattern: v }))}
              placeholder={selectedType?.placeholder || ""}
              helpText={selectedType?.helpText || ""}
              autoComplete="off"
              requiredIndicator
            />

            <Divider />

            <InlineStack gap="400" blockAlign="end">
              <div style={{ flex: 1 }}>
                <Select
                  label="Option Name"
                  options={[
                    { label: "Color", value: "Color" },
                    { label: "Size", value: "Size" },
                    { label: "Material", value: "Material" },
                    { label: "Style", value: "Style" },
                    { label: "Type", value: "Type" },
                  ]}
                  value={formState.optionName}
                  onChange={(v) => setFormState(prev => ({ ...prev, optionName: v }))}
                />
              </div>
              <div style={{ flex: 1 }}>
                <Select
                  label="Selector Style"
                  options={[
                    { label: "Text Block", value: "block" },
                    { label: "Color Swatch", value: "swatch" },
                    { label: "Product Image", value: "variant_image" },
                    { label: "Dropdown", value: "dropdown" },
                  ]}
                  value={formState.selectorStyle}
                  onChange={(v) => setFormState(prev => ({ ...prev, selectorStyle: v }))}
                />
              </div>
            </InlineStack>
          </FormLayout>
        </Modal.Section>
      </Modal>
    </Page>
  );
}

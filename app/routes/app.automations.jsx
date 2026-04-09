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
import { DeleteIcon, PlayIcon, PauseCircleIcon, EditIcon } from "@shopify/polaris-icons";
import { runAutomationRule } from "../models/automation.server";

// Loader
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
      if (activeSub.name.includes("Premium")) planKey = "premium";
      else if (activeSub.name.includes("Advanced")) planKey = "advanced";
      else if (activeSub.name.includes("Basic")) planKey = "basic";

      if (planKey !== currentKnownPlan) {
        await confirmSubscription(admin, shop, planKey, activeSub);
        usageInfo = await getUsageInfo(shop);
      }
    } else if (currentKnownPlan !== 'free') {
      await confirmSubscription(admin, shop, 'free', null);
      usageInfo = await getUsageInfo(shop);
    }
  } catch (error) {
    console.warn("[Automations Loader] Billing sync skipped:", error.message);
  }

  const rules = await prisma.automationRule.findMany({
    where: { shop },
    orderBy: { createdAt: "desc" },
  });

  return json({ rules, shop, usageInfo });
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
    const selectorStyle = formData.get("selectorStyle") || "image_swatch";

    if (!name || !type || !pattern) {
      return json({ error: "Name, type, and pattern are required" }, { status: 400 });
    }

    await prisma.automationRule.create({
      data: { shop, name, type, pattern, optionName, selectorStyle },
    });

    return json({ success: true, message: `Rule "${name}" created successfully!` });
  }

  // Update automation rule
  if (actionType === "updateRule") {
    const ruleId = formData.get("ruleId");
    const name = formData.get("name");
    const type = formData.get("type");
    const pattern = formData.get("pattern");
    const optionName = formData.get("optionName") || "Color";
    const selectorStyle = formData.get("selectorStyle") || "image_swatch";

    await prisma.automationRule.update({
      where: { id: ruleId },
      data: { name, type, pattern, optionName, selectorStyle },
    });

    return json({ success: true, message: `Rule "${name}" updated successfully!` });
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
    try {
      const groupsCreated = await runAutomationRule(admin, prisma, ruleId, shop, canAddLinks);
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
  const [editingRuleId, setEditingRuleId] = useState(null);
  const [selectedTab, setSelectedTab] = useState(0);
  const [formState, setFormState] = useState({
    name: "",
    type: "title_pattern",
    pattern: "",
    optionName: "Color",
    selectorStyle: "image_swatch",
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
    fd.append("action", editingRuleId ? "updateRule" : "createRule");
    if (editingRuleId) fd.append("ruleId", editingRuleId);
    fd.append("name", formState.name);
    fd.append("type", formState.type);
    fd.append("pattern", formState.pattern);
    fd.append("optionName", formState.optionName);
    fd.append("selectorStyle", formState.selectorStyle);
    submit(fd, { method: "POST" });
    setShowCreateModal(false);
    setEditingRuleId(null);
    setFormState({ name: "", type: "title_pattern", pattern: "", optionName: "Color", selectorStyle: "image_swatch" });
  }, [formState, submit, editingRuleId]);

  const handleEditRule = useCallback((rule) => {
    setEditingRuleId(rule.id);
    setFormState({
      name: rule.name,
      type: rule.type,
      pattern: rule.pattern,
      optionName: rule.optionName,
      selectorStyle: rule.selectorStyle,
    });
    setShowCreateModal(true);
  }, []);

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
                            <Tooltip content="Edit">
                              <Button
                                icon={EditIcon}
                                size="slim"
                                onClick={() => handleEditRule(rule)}
                                accessibilityLabel="Edit rule"
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
        onClose={() => {
          setFormState({ name: "", type: "title_pattern", pattern: "", optionName: "Color", selectorStyle: "image_swatch" });
        } }]}
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
                    { label: "Image Swatch", value: "image_swatch" },
                    { label: "Color Swatch", value: "color_swatch" },
                    { label: "Square Color Swatch", value: "square_color_swatch" },
                    { label: "Button", value: "button" },
                    { label: "Pill Button", value: "pill_button" },
                    { label: "Dropdown", value: "dropdown" },
                    { label: "Image Dropdown", value: "image_dropdown" },
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

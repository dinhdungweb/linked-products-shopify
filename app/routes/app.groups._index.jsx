import { useState, useCallback, useEffect } from "react";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation, useActionData, Link } from "@remix-run/react";
import {
  Page,
  Card,
  LegacyCard,
  Button,
  BlockStack,
  Text,
  IndexTable,
  Badge,
  EmptyState,
  TextField,
  InlineStack,
  Loading,
  Frame,
  Banner,
  Box,
  Divider,
  ProgressBar,
  Icon,
  Grid,
  Tabs,
  Popover,
  ActionList,
  ButtonGroup,
  Tooltip,
  Modal,
  Thumbnail,
  DropZone,
  Spinner,
  useIndexResourceState,
} from "@shopify/polaris";
import {
  XIcon,
  SearchIcon,
  ViewIcon,
  DeleteIcon,
  ImportIcon,
  ExportIcon,
  PlusIcon,
  FilterIcon,
  QuestionCircleIcon,
  ChevronDownIcon,
  DuplicateIcon,
  MenuHorizontalIcon,
  RefreshIcon,
  CheckIcon,
  NoteIcon,
} from "@shopify/polaris-icons";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import { syncGroupMetafields } from "../sync.server";

export async function loader({ request }) {
  const { authenticate } = await import("../shopify.server");
  const { default: prisma } = await import("../db.server");
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;
  const { getUsageInfo, getGroupsWithinLimit } = await import("../billing.server");

  const usageInfo = await getUsageInfo(shop);
  const allowedIds = await getGroupsWithinLimit(shop);

  const groups = await prisma.productGroup.findMany({
    where: { shop: shop },
    include: {
      products: {
        orderBy: { position: "asc" },
        select: { productId: true, productHandle: true },
      },
      _count: { select: { products: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const totalProducts = groups.reduce((acc, group) => acc + group._count.products, 0);

  // Fetch product images for thumbnails
  const allProductIds = [...new Set(groups.flatMap(g => g.products.map(p => p.productId)))];

  let productImages = {};
  if (allProductIds.length > 0) {
    try {
      const queryIds = allProductIds.slice(0, 200);
      const response = await admin.graphql(`
        query getProductImages($ids: [ID!]!) {
          nodes(ids: $ids) {
            ... on Product {
              id
              featuredImage {
                url
              }
            }
          }
        }
      `, { variables: { ids: queryIds } });

      const result = await response.json();
      const nodes = result.data?.nodes || [];
      nodes.forEach(node => {
        if (node && node.featuredImage) {
          productImages[node.id] = node.featuredImage.url;
        }
      });
    } catch (e) {
      console.error("Error fetching product images for index:", e);
    }
  }

  // Fetch App Embed Status
  let isAppEmbedEnabled = false;
  try {
    const themeResponse = await admin.graphql(`
      query getThemeId {
        themes(first: 1, roles: [MAIN]) {
          nodes {
            id
          }
        }
      }
    `);
    const themeData = await themeResponse.json();
    const themeId = themeData.data?.themes?.nodes?.[0]?.id.split('/').pop();

    if (themeId) {
      const restUrl = `https://${shop}/admin/api/2024-04/themes/${themeId}/assets.json?asset[key]=config/settings_data.json`;
      const assetResponse = await fetch(restUrl, {
        headers: {
          "X-Shopify-Access-Token": session.accessToken,
        },
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
    isAppEmbedEnabled = true; // Safety default
  }

  const enrichedGroups = groups.map(group => ({
    ...group,
    isPlanDisabled: allowedIds !== null && !allowedIds.includes(group.id)
  }));

  return json({ groups: enrichedGroups, shop: shop, usageInfo, totalProducts, productImages, isAppEmbedEnabled });
}

export async function action({ request }) {
  const { authenticate } = await import("../shopify.server");
  const { default: prisma } = await import("../db.server");

  const { session, admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const actionType = formData.get("action");

  if (actionType === "delete") {
    const groupId = formData.get("groupId");
    if (!groupId) return json({ error: "Group not found" }, { status: 400 });

    const group = await prisma.productGroup.findUnique({
      where: { id: groupId },
      include: { products: true },
    });

    if (!group) return json({ error: "Group not found" }, { status: 400 });

    try {
      for (const product of group.products) {
        const metafieldQuery = await admin.graphql(`
          query GetProductMetafields($productId: ID!) {
            product(id: $productId) {
              metafields(first: 10, namespace: "linked_products") {
                nodes { id key }
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
              }
            }
          `, { variables: { metafields: metafieldsToDelete } });
        }
      }
    } catch (error) {
      console.warn("Clean up metafields failed:", error.message);
    }

    await prisma.productGroup.delete({ where: { id: groupId } });
    return json({ success: true, message: "Group deleted successfully" });
  }

  if (actionType === "toggleStatus") {
    const groupId = formData.get("groupId");
    const currentStatus = formData.get("currentStatus");
    const newStatus = currentStatus === "active" ? "draft" : "active";

    await prisma.productGroup.update({
      where: { id: groupId },
      data: { status: newStatus }
    });

    await syncGroupMetafields(admin, prisma, groupId);
    return json({ success: true, message: `Group set to ${newStatus}` });
  }

  if (actionType === "sync") {
    const groupId = formData.get("groupId");
    await syncGroupMetafields(admin, prisma, groupId);
    return json({ success: true, message: "Synced successfully" });
  }

  if (actionType === "importCSV") {
    const csvData = formData.get("csvData");
    if (!csvData) return json({ error: "No CSV data provided" }, { status: 400 });

    const { canAddLinks, getUsageInfo } = await import("../billing.server");
    const usageInfo = await getUsageInfo(session.shop);

    const settings = await prisma.appSetting.findUnique({
      where: { shop: session.shop },
    });

    try {
      const allLines = csvData.split("\n").map(l => l.trim()).filter(l => l.length > 0);
      if (allLines.length === 0) return json({ success: true, message: "No data to import" });

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
          groupName = parts[0] || "Untitled Group";
          optionName = parts[1] || optionName;
          selectorStyle = parts[2] || selectorStyle;
          cardStyle = parts[3] || "same";
          status = parts[4] || status;
          handles = parts.slice(5);
        } else {
          if (parts.length < 3) {
            errors.push(`Skipped line: "${line}" (need at least group name + 2 product handles)`);
            continue;
          }
          groupName = parts[0];
          handles = parts.slice(1);
        }

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

        const canAdd = await canAddLinks(session.shop, 1);
        if (!canAdd) {
          errors.push(`Skipped group "${groupName}": group limit reached`);
          break;
        }

        const productIds = products.map(p => p.id);
        const existingItems = await prisma.productGroupItem.findMany({
          where: { productId: { in: productIds } },
        });
        if (existingItems.length > 0) {
          errors.push(`Skipped group "${groupName}": some products already belong to another group`);
          continue;
        }

        const newGroup = await prisma.productGroup.create({
          data: {
            shop: session.shop,
            name: groupName,
            optionName: optionName,
            selectorStyle: selectorStyle || "image_swatch",
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

        try {
          await syncGroupMetafields(admin, prisma, newGroup.id);
          groupsCreated++;
        } catch (e) {
          groupsCreated++;
        }
      }

      const message = `Import completed: ${groupsCreated} groups created.` + (errors.length > 0 ? `\n${errors.join("\n")}` : "");
      return json({ success: true, message });
    } catch (error) {
      return json({ error: `Import failed: ${error.message}` }, { status: 500 });
    }
  }

  if (actionType === "bulkAction") {
    const selectedIdsStr = formData.get("selectedIds") || "[]";
    const bulkType = formData.get("bulkType");
    const selectedIds = JSON.parse(selectedIdsStr);

    if (selectedIds.length === 0) return json({ error: "No items selected" }, { status: 400 });

    try {
      if (bulkType === "delete") {
        for (const groupId of selectedIds) {
          const group = await prisma.productGroup.findUnique({
            where: { id: groupId },
            include: { products: true },
          });

          if (group) {
            for (const product of group.products) {
              const metafieldQuery = await admin.graphql(`
                query GetProductMetafields($productId: ID!) {
                  product(id: $productId) {
                    metafields(first: 10, namespace: "linked_products") {
                      nodes { id key }
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
                    }
                  }
                `, { variables: { metafields: metafieldsToDelete } });
              }
            }
            await prisma.productGroup.delete({ where: { id: groupId } });
          }
        }
        return json({ success: true, message: `Successfully deleted ${selectedIds.length} groups` });
      }

      if (bulkType === "active" || bulkType === "draft") {
        const newStatus = bulkType;
        for (const groupId of selectedIds) {
          await prisma.productGroup.update({
            where: { id: groupId },
            data: { status: newStatus }
          });
          await syncGroupMetafields(admin, prisma, groupId);
        }
        return json({ success: true, message: `Successfully set ${selectedIds.length} groups to ${newStatus}` });
      }

    } catch (error) {
      return json({ error: `Bulk action failed: ${error.message}` }, { status: 500 });
    }
  }

  return json({ error: "Invalid action" }, { status: 400 });
}

export default function GroupsPage() {
  const { groups, shop, usageInfo, totalProducts, productImages, isAppEmbedEnabled } = useLoaderData();
  const actionData = useActionData();
  const submit = useSubmit();
  const navigation = useNavigation();
  const shopify = useAppBridge();

  const [selectedTab, setSelectedTab] = useState(0);
  const handleTabChange = useCallback((selectedTabIndex) => setSelectedTab(selectedTabIndex), []);

  const [searchValue, setSearchValue] = useState("");
  const [isSearchVisible, setIsSearchVisible] = useState(false);
  const [bannerVisible, setBannerVisible] = useState(true);

  const [filterStatus, setFilterStatus] = useState("all");
  const [isFilterActive, setIsFilterActive] = useState(false);
  const toggleFilterActive = useCallback(() => setIsFilterActive((a) => !a), []);

  const filteredGroups = groups.filter((group) => {
    if (selectedTab === 2) return false;
    if (selectedTab === 3) return false;
    if (filterStatus !== "all" && group.status !== filterStatus) return false;
    if (searchValue !== "") {
      const searchLower = searchValue.toLowerCase();
      const matchName = group.name && group.name.toLowerCase().includes(searchLower);
      const matchOption = group.optionName && group.optionName.toLowerCase().includes(searchLower);
      if (!matchName && !matchOption) return false;
    }
    return true;
  });

  const {
    selectedResources,
    allResourcesSelected,
    handleSelectionChange,
  } = useIndexResourceState(groups);

  const [showImportModal, setShowImportModal] = useState(false);
  const [csvData, setCsvData] = useState("");
  const [file, setFile] = useState(null);
  const [activeBulkAction, setActiveBulkAction] = useState(null);
  const [syncingId, setSyncingId] = useState(null);

  const isLoading = navigation.state !== "idle";
  const isBulkLoading = activeBulkAction !== null || (isLoading && navigation.formData?.get("action") === "bulkAction");
  const isImporting = isLoading && navigation.formData?.get("action") === "importCSV";
  const isLimitReached = usageInfo.limit !== Infinity && usageInfo.used >= usageInfo.limit;

  useEffect(() => {
    if (navigation.state === "idle") {
      setActiveBulkAction(null);
      setSyncingId(null);
    }
  }, [navigation.state]);

  useEffect(() => {
    if (actionData?.success) {
      shopify.toast.show(actionData.message || "Action successful");
    } else if (actionData?.error) {
      shopify.toast.show(actionData.error, { isError: true });
    }
  }, [actionData, shopify]);

  const handleDeleteGroup = useCallback(async (groupId) => {
    if (confirm("Are you sure you want to delete this group?")) {
      const formData = new FormData();
      formData.append("action", "delete");
      formData.append("groupId", groupId);

      let headers = {};
      try {
        if (typeof window !== "undefined" && window.shopify && window.shopify.idToken) {
          const idToken = await window.shopify.idToken();
          headers = { Authorization: `Bearer ${idToken}` };
        }
      } catch (e) { }
      submit(formData, { method: "POST", headers });
    }
  }, [submit]);

  const handleToggleStatus = useCallback(async (groupId, currentStatus) => {
    const formData = new FormData();
    formData.append("action", "toggleStatus");
    formData.append("groupId", groupId);
    formData.append("currentStatus", currentStatus);

    let headers = {};
    try {
      if (typeof window !== "undefined" && window.shopify && window.shopify.idToken) {
        const idToken = await window.shopify.idToken();
        headers = { Authorization: `Bearer ${idToken}` };
      }
    } catch (e) { }
    submit(formData, { method: "POST", headers });
  }, [submit]);

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
    let headers = {};
    try {
      if (typeof window !== "undefined" && window.shopify && window.shopify.idToken) {
        const idToken = await window.shopify.idToken();
        headers = { Authorization: `Bearer ${idToken}` };
      }
    } catch (e) { }
    submit(formData, { method: "POST", headers });
  }, [csvData, submit]);

  useEffect(() => {
    if (actionData?.success && actionData?.message?.includes("Import completed") && showImportModal) {
      setShowImportModal(false);
      setFile(null);
      setCsvData("");
    }
  }, [actionData, showImportModal]);

  const handleSyncGroup = useCallback(async (groupId) => {
    setSyncingId(groupId);
    const formData = new FormData();
    formData.append("action", "sync");
    formData.append("groupId", groupId);
    let headers = {};
    try {
      if (typeof window !== "undefined" && window.shopify && window.shopify.idToken) {
        const idToken = await window.shopify.idToken();
        headers = { Authorization: `Bearer ${idToken}` };
      }
    } catch (e) { }
    submit(formData, { method: "POST", headers });
  }, [submit]);

  const handleBulkAction = useCallback(async (bulkType) => {
    setActiveBulkAction(bulkType);
    const formData = new FormData();
    formData.append("action", "bulkAction");
    formData.append("bulkType", bulkType);
    formData.append("selectedIds", JSON.stringify(selectedResources));
    let headers = {};
    try {
      if (typeof window !== "undefined" && window.shopify && window.shopify.idToken) {
        const idToken = await window.shopify.idToken();
        headers = { Authorization: `Bearer ${idToken}` };
      }
    } catch (e) { }
    submit(formData, { method: "POST", headers });
  }, [selectedResources, submit]);

  const handleExport = useCallback(() => {
    const header = "Group Name,Option Name,Selector Style,Card Style,Status,Product Handles\n";
    const csvRows = groups.map(group => {
      const handles = group.products.map(p => p.productHandle).filter(Boolean);
      const row = [
        group.name || "Untitled Group",
        group.optionName || "Color",
        group.selectorStyle || "button",
        group.cardSelectorStyle || "same",
        group.status || "active",
        ...handles
      ];
      return row.join(",");
    });
    if (csvRows.length === 0) {
      shopify.toast.show("No groups to export", { isError: true });
      return;
    }
    shopify.toast.show("Exporting groups...");
    const blob = new Blob([header + csvRows.join("\n")], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.setAttribute('hidden', '');
    a.setAttribute('href', url);
    a.setAttribute('download', `linked-products-export-${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [groups, shopify]);

  const tabs = [
    { id: 'all', content: 'All', panelID: 'all-groups' },
    { id: 'single', content: 'Single option', panelID: 'single-option' },
    { id: 'multi', content: 'Multi option', panelID: 'multi-option' },
    { id: 'subcategory', content: 'Subcategory', panelID: 'subcategory' },
  ];

  const ActionMenu = ({ groupId }) => {
    const [active, setActive] = useState(false);
    const toggleActive = useCallback(() => setActive((a) => !a), []);
    const group = groups.find(g => g.id === groupId);
    const status = group?.status || "active";

    return (
      <Popover
        active={active}
        activator={
          <Button
            onClick={(e) => { e.stopPropagation(); toggleActive(); }}
            icon={MenuHorizontalIcon}
            variant="tertiary"
          />
        }
        onClose={toggleActive}
      >
        <ActionList
          actionRole="menuitem"
          items={[
            { content: 'Edit group', icon: ViewIcon, url: `/app/groups/${groupId}` },
            {
              content: status === "active" ? 'Set as draft' : 'Set as active',
              icon: status === "active" ? XIcon : CheckIcon,
              onAction: () => { handleToggleStatus(groupId, status); toggleActive(); }
            },
            { content: 'Delete', icon: DeleteIcon, destructive: true, onAction: () => { handleDeleteGroup(groupId); toggleActive(); } },
          ]}
        />
      </Popover>
    );
  };

  const ProductThumbnailGroup = ({ productIds, totalCount }) => {
    const imagesToShow = productIds.slice(0, 4);
    const remainingCount = totalCount - imagesToShow.length;

    return (
      <InlineStack gap="100" blockAlign="center">
        {imagesToShow.map((p, idx) => (
          <div key={p.productId} style={{
            width: '36px',
            height: '36px',
            borderRadius: '8px',
            overflow: 'hidden',
            border: '1px solid #e1e3e5',
            backgroundColor: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            {productImages[p.productId] ? (
              <img src={productImages[p.productId]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <Icon source={SearchIcon} tone="subdued" size="small" />
            )}
          </div>
        ))}
        {remainingCount > 0 && (
          <div style={{ marginLeft: '4px' }}>
            <Text variant="bodySm" tone="subdued">+{remainingCount}</Text>
          </div>
        )}
      </InlineStack>
    );
  };

  return (
    <Frame>
      <Page fullWidth>
        <Box paddingBlockEnd="400">
          <BlockStack gap="500">
            {usageInfo.isOverLimit && (
              <Banner tone="critical" title="Plan limit exceeded">
                <p>
                  Your current plan only supports <strong>{usageInfo.limit}</strong> groups.
                  We have temporarily disabled <strong>{usageInfo.used - usageInfo.limit}</strong> of your oldest groups on the storefront.
                </p>
                <div style={{ marginTop: '10px' }}>
                  <Button url="/app/pricing" variant="primary">Upgrade Plan Now</Button>
                </div>
              </Banner>
            )}

            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="start">
                <BlockStack gap="100">
                  <Text variant="headingXl" as="h1">Product groups</Text>
                  <Text variant="bodyMd" tone="subdued">Product groups combine multiple product listings into variant options.</Text>
                </BlockStack>
                <InlineStack gap="200">
                  <ButtonGroup>
                    <Button icon={ExportIcon} onClick={handleExport}>Export</Button>
                    <Button icon={ImportIcon} onClick={() => setShowImportModal(true)}>Import</Button>
                  </ButtonGroup>
                  {isLimitReached ? (
                    <Tooltip content="You have reached the product group limit for your current plan.">
                      <Button variant="primary" icon={PlusIcon} disabled>Create group</Button>
                    </Tooltip>
                  ) : (
                    <Button variant="primary" icon={PlusIcon} url="/app/groups/new">Create group</Button>
                  )}
                </InlineStack>
              </InlineStack>

              {!isAppEmbedEnabled && (
                <Banner
                  title="App embed is disabled"
                  tone="warning"
                  action={{
                    content: 'Enable in Theme',
                    onAction: () => {
                      const url = `https://admin.shopify.com/store/${shop.split('.')[0]}/themes/current/editor?context=apps&activateAppId=2dc3da0c1804b6a547c472b2d3b6a6ca/app-card-injector`;
                      window.open(url, '_blank');
                    }
                  }}
                >
                  <p>Please enable the app embed to show product swatches on your storefront.</p>
                </Banner>
              )}

              <Box background={isLimitReached ? "bg-surface-caution" : "bg-surface"} padding="400" borderRadius="300" borderColor={isLimitReached ? "border-caution" : "border"} borderWidth="025">
                <InlineStack align="space-between" blockAlign="center">
                  <Box flex="1">
                    <BlockStack gap="100">
                      <Text variant="bodySm" fontWeight="bold" tone="subdued">Created product groups</Text>
                      <Text variant="bodyMd" tone={isLimitReached ? "caution" : "default"}>{groups.length} groups</Text>
                    </BlockStack>
                  </Box>
                  <div style={{ width: '1px', height: '40px', backgroundColor: 'var(--p-color-border-subdued)', margin: '0 20px' }} />
                  <Box flex="1">
                    <BlockStack gap="100">
                      <Text variant="bodySm" fontWeight="bold" tone="subdued">Remaining product groups</Text>
                      <InlineStack gap="100" blockAlign="center">
                        <Text variant="bodyMd" tone={isLimitReached ? "caution" : "subdued"}>
                          {usageInfo.limit === Infinity ? "Unlimited" : Math.max(0, usageInfo.limit - groups.length)} groups
                        </Text>
                        <div style={{ color: '#8c9196' }}>•</div>
                        <Button variant="plain" tone={isLimitReached ? "caution" : "info"} size="micro" url="/app/pricing">Upgrade</Button>
                      </InlineStack>
                    </BlockStack>
                  </Box>
                  <div style={{ width: '1px', height: '40px', backgroundColor: 'var(--p-color-border-subdued)', margin: '0 20px' }} />
                  <Box flex="1">
                    <BlockStack gap="100">
                      <Text variant="bodySm" fontWeight="bold" tone="subdued">Total products</Text>
                      <Text variant="bodyMd">{totalProducts} products</Text>
                    </BlockStack>
                  </Box>
                </InlineStack>
              </Box>
            </BlockStack>
          </BlockStack>
        </Box>

        <LegacyCard>
          <Box paddingBlock="0">
            <InlineStack align="space-between" blockAlign="center">
              <div style={{ flex: 1 }}>
                <Tabs tabs={tabs} selected={selectedTab} onSelect={handleTabChange} suppressContent={true} />
              </div>
              <Box paddingInlineEnd="300">
                <InlineStack gap="100" blockAlign="center">
                  {!isSearchVisible ? null : (
                    <div style={{ width: '200px', marginRight: '8px' }}>
                      <TextField
                        prefix={<Icon source={SearchIcon} tone="subdued" />}
                        suffix={<Button icon={XIcon} variant="tertiary" onClick={() => { setIsSearchVisible(false); setSearchValue(""); }} />}
                        value={searchValue}
                        onChange={setSearchValue}
                        placeholder="Search..."
                        autoComplete="off"
                        label="Search"
                        labelHidden
                        size="slim"
                      />
                    </div>
                  )}
                  <Button
                    icon={SearchIcon}
                    variant={isSearchVisible ? "secondary" : "tertiary"}
                    onClick={() => setIsSearchVisible(!isSearchVisible)}
                  />
                  <Popover
                    active={isFilterActive}
                    activator={
                      <Button icon={FilterIcon} variant={filterStatus !== "all" ? "secondary" : "tertiary"} onClick={toggleFilterActive}>
                        Filter {filterStatus !== "all" ? `(${filterStatus})` : ""}
                      </Button>
                    }
                    onClose={toggleFilterActive}
                  >
                    <ActionList
                      actionRole="menuitem"
                      items={[
                        { content: 'All statuses', onAction: () => { setFilterStatus("all"); toggleFilterActive(); } },
                        { content: 'Active', onAction: () => { setFilterStatus("active"); toggleFilterActive(); } },
                        { content: 'Draft', onAction: () => { setFilterStatus("draft"); toggleFilterActive(); } },
                      ]}
                    />
                  </Popover>
                </InlineStack>
              </Box>
            </InlineStack>
          </Box>

          {filteredGroups.length === 0 ? (
            <EmptyState
              heading="No product groups found"
              action={isLimitReached ? undefined : { content: 'Create group', url: '/app/groups/new', variant: 'primary' }}
              image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
            >
              {isLimitReached ? (
                <BlockStack gap="200">
                  <p>You've reached the limit of the <b>{usageInfo.planName}</b>. Please upgrade to continue.</p>
                  <Button url="/app/pricing" variant="primary">Upgrade Plan Now</Button>
                </BlockStack>
              ) : (
                <p>Start by creating your first group to link products together.</p>
              )}
            </EmptyState>
          ) : (
            <IndexTable
              resourceName={{ singular: "group", plural: "groups" }}
              itemCount={filteredGroups.length}
              headings={[
                { title: "Product group" },
                { title: "Products" },
                { title: "Total products" },
                { title: "Type" },
                { title: "Option name" },
                { title: "Status" },
                { title: "Created" },
                { title: "", alignment: 'end' },
              ]}
              selectable={true}
              selectedItemsCount={allResourcesSelected ? 'All' : selectedResources.length}
              onSelectionChange={handleSelectionChange}
              promotedBulkActions={[
                {
                  content: 'Set as active',
                  onAction: () => handleBulkAction('active'),
                  loading: isBulkLoading && (activeBulkAction === 'active' || navigation.formData?.get("bulkType") === 'active'),
                },
                {
                  content: 'Set as draft',
                  onAction: () => handleBulkAction('draft'),
                  loading: isBulkLoading && (activeBulkAction === 'draft' || navigation.formData?.get("bulkType") === 'draft'),
                },
              ]}
              bulkActions={[
                {
                  content: 'Delete',
                  onAction: () => {
                    if (confirm(`Are you sure you want to delete ${selectedResources.length} groups?`)) {
                      handleBulkAction('delete');
                    }
                  },
                  loading: isBulkLoading && (activeBulkAction === 'delete' || navigation.formData?.get("bulkType") === 'delete'),
                },
              ]}
            >
              {filteredGroups.map((group, index) => (
                <IndexTable.Row
                  id={group.id}
                  key={group.id}
                  selected={selectedResources.includes(group.id)}
                  position={index}
                >
                  <IndexTable.Cell>
                    <Link
                      to={`/app/groups/${group.id}`}
                      style={{ textDecoration: 'none', color: 'inherit' }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Text variant="bodyMd" fontWeight="semibold">{group.name || "Untitled Group"}</Text>
                    </Link>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <ProductThumbnailGroup
                      productIds={group.products}
                      totalCount={group._count.products}
                    />
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <Text tone="subdued" variant="bodyMd">{group._count.products} products</Text>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <Text tone="subdued" variant="bodyMd">Single option</Text>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <Text variant="bodyMd">{group.optionName}</Text>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <InlineStack gap="200" blockAlign="center">
                      {group.status === "active" ? (
                        <Badge tone={group.isPlanDisabled ? "attention" : "success"}>
                          {group.isPlanDisabled ? "Paused by Plan" : "Active"}
                        </Badge>
                      ) : (
                        <Badge tone="subdued">Draft</Badge>
                      )}
                      {group.isPlanDisabled && (
                        <Tooltip content="This group is disabled because it exceeds your plan limit.">
                          <Icon source={QuestionCircleIcon} tone="caution" />
                        </Tooltip>
                      )}
                    </InlineStack>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <Text tone="subdued" variant="bodyMd">{new Date(group.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</Text>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <InlineStack align="end" gap="100" onClick={(e) => e.stopPropagation()}>
                      <Button icon={DuplicateIcon} variant="tertiary" />
                      <Button
                        icon={RefreshIcon}
                        variant="tertiary"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSyncGroup(group.id);
                        }}
                        loading={syncingId === group.id || (isLoading && navigation.formData?.get("groupId") === group.id && navigation.formData?.get("action") === "sync")}
                      />
                      <ActionMenu groupId={group.id} />
                    </InlineStack>
                  </IndexTable.Cell>
                </IndexTable.Row>
              ))}
            </IndexTable>
          )}
        </LegacyCard>

        <Box paddingBlock="800">
          <InlineStack align="center" gap="100">
            <Icon source={QuestionCircleIcon} tone="subdued" />
            <Button variant="plain" url="/app/help">Help Center</Button>
          </InlineStack>
        </Box>

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
    </Frame>
  );
}

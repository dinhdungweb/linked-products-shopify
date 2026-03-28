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
  Grid,
  Tabs,
  Popover,
  ActionList,
  ButtonGroup,
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
  ExternalSmallIcon,
  DuplicateIcon,
  MenuHorizontalIcon,
  RefreshIcon,
  DiamondIcon,
} from "@shopify/polaris-icons";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";

export async function loader({ request }) {
  const { authenticate } = await import("../shopify.server");
  const { default: prisma } = await import("../db.server");
  const { getUsageInfo } = await import("../billing.server");

  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;
  const usageInfo = await getUsageInfo(shop);

  const groups = await prisma.productGroup.findMany({
    where: { shop: shop },
    include: {
      products: {
        take: 5,
        orderBy: { position: "asc" },
        select: { productId: true },
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
      // Chunk IDs to avoid query complexity limits if there are huge amounts (though IndexTable usually shows 50)
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

  return json({ groups, shop: shop, usageInfo, totalProducts, productImages });
}

// Action (copied from index for delete/import support here too)
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
          const metafieldIds = metafieldNodes.map(m => m.id);
          await admin.graphql(`
            mutation MetafieldsDelete($metafields: [MetafieldIdentifierInput!]!) {
              metafieldsDelete(metafields: $metafields) {
                deletedMetafields { ownerId }
                userErrors { field message }
              }
            }
          `, { variables: { metafields: metafieldIds.map(id => ({ id })) } });
        }
      }
    } catch (error) {
      console.warn("Clean up metafields failed:", error.message);
    }

    await prisma.productGroup.delete({ where: { id: groupId } });
    return json({ success: true, message: "Group deleted successfully" });
  }

  return json({ error: "Invalid action" }, { status: 400 });
}

export default function GroupsPage() {
  const { groups, usageInfo, totalProducts, productImages } = useLoaderData();
  const actionData = useActionData();
  const submit = useSubmit();
  const navigation = useNavigation();
  const shopify = useAppBridge();

  const [selectedTab, setSelectedTab] = useState(0);
  const handleTabChange = useCallback((selectedTabIndex) => setSelectedTab(selectedTabIndex), []);

  const [searchValue, setSearchValue] = useState("");
  const [isSearchVisible, setIsSearchVisible] = useState(false);
  const [bannerVisible, setBannerVisible] = useState(true);

  const isLoading = navigation.state !== "idle";

  const handleDeleteGroup = useCallback((groupId) => {
    if (confirm("Are you sure you want to delete this group?")) {
      const formData = new FormData();
      formData.append("action", "delete");
      formData.append("groupId", groupId);
      submit(formData, { method: "POST" });
    }
  }, [submit]);

  const tabs = [
    { id: 'all', content: 'All', panelID: 'all-groups' },
    { id: 'single', content: 'Single option', panelID: 'single-option' },
    { id: 'multi', content: 'Multi option', panelID: 'multi-option' },
    { id: 'subcategory', content: 'Subcategory', panelID: 'subcategory' },
  ];

  const ActionMenu = ({ groupId }) => {
    const [active, setActive] = useState(false);
    const toggleActive = useCallback(() => setActive((a) => !a), []);

    return (
      <Popover
        active={active}
        activator={<Button onClick={toggleActive} icon={MenuHorizontalIcon} variant="tertiary" />}
        onClose={toggleActive}
      >
        <ActionList
          actionRole="menuitem"
          items={[
            { content: 'Edit group', icon: ViewIcon, url: `/app/groups/${groupId}` },
            { content: 'Set as draft', icon: XIcon },
            { content: 'Delete', icon: DeleteIcon, destructive: true, onAction: () => handleDeleteGroup(groupId) },
          ]}
        />
      </Popover>
    );
  };

  const ProductThumbnailGroup = ({ productIds }) => {
    const imagesToShow = productIds.slice(0, 4);
    const remainingCount = productIds.length - imagesToShow.length;

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

  const [filterStatus, setFilterStatus] = useState("all");
  const [isFilterActive, setIsFilterActive] = useState(false);
  const toggleFilterActive = useCallback(() => setIsFilterActive((a) => !a), []);

  const filteredGroups = groups.filter((group) => {
    // Tab filter
    if (selectedTab === 2) return false;
    if (selectedTab === 3) return false;

    // Status filter
    if (filterStatus !== "all" && group.status !== filterStatus) return false;

    // Search filter
    if (searchValue !== "") {
      const searchLower = searchValue.toLowerCase();
      const matchName = group.name && group.name.toLowerCase().includes(searchLower);
      const matchOption = group.optionName && group.optionName.toLowerCase().includes(searchLower);
      if (!matchName && !matchOption) return false;
    }

    return true;
  });

  return (
    <Page fullWidth>
      {/* Header Section */}
      <Box paddingBlockEnd="400">
        <BlockStack gap="400">
          <InlineStack align="space-between" blockAlign="start">
            <BlockStack gap="100">
              <Text variant="headingXl" as="h1">Product groups</Text>
              <Text variant="bodyMd" tone="subdued">Product groups combine multiple product listings into variant options.</Text>
            </BlockStack>
            <InlineStack gap="200">
              <ButtonGroup>
                <Button icon={ExportIcon}>Export</Button>
                <Button icon={ImportIcon}>Import</Button>
                <Button icon={RefreshIcon} disabled>Bulk update options</Button>
              </ButtonGroup>
              <Button variant="primary" icon={PlusIcon} url="/app/groups/new">Create group</Button>
            </InlineStack>
          </InlineStack>

          {bannerVisible && (
            <Banner tone="info" onDismiss={() => setBannerVisible(false)}>
              <InlineStack gap="200" blockAlign="center">
                <Text variant="bodyMd">App embed is enabled. Learn how to configure it.</Text>
                <Button variant="plain">Learn more</Button>
              </InlineStack>
            </Banner>
          )}

          {/* Stats Row */}
          <Box background="bg-surface" padding="400" borderRadius="300" borderColor="border" borderWidth="025">
            <InlineStack align="space-between" blockAlign="center">
              <Box flex="1">
                <BlockStack gap="100">
                  <Text variant="bodySm" fontWeight="bold" tone="subdued">Created product groups</Text>
                  <Text variant="bodyMd">{groups.length} groups</Text>
                </BlockStack>
              </Box>
              <div style={{ width: '1px', height: '40px', backgroundColor: 'var(--p-color-border-subdued)', margin: '0 20px' }} />
              <Box flex="1">
                <BlockStack gap="100">
                  <Text variant="bodySm" fontWeight="bold" tone="subdued">Remaining product groups</Text>
                  <InlineStack gap="100" blockAlign="center">
                    <Text variant="bodyMd" tone="subdued">{usageInfo.limit === Infinity ? "Unlimited" : Math.max(0, usageInfo.limit - groups.length)} groups</Text>
                    <div style={{ color: '#8c9196' }}>•</div>
                    <Button variant="plain" tone="info" size="micro">Upgrade</Button>
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
      </Box>

      {/* Main Content Card */}
      <Card padding="0">
        <Box paddingInline="300" paddingBlock="200">
          <InlineStack align="space-between" blockAlign="center">
            <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
               {!isSearchVisible ? (
                  <Tabs tabs={tabs} selected={selectedTab} onSelect={handleTabChange} />
               ) : (
                  <div style={{ flex: 1, marginRight: '16px' }}>
                    <TextField
                      prefix={<Icon source={SearchIcon} tone="subdued" />}
                      suffix={<Button icon={XIcon} variant="tertiary" onClick={() => { setIsSearchVisible(false); setSearchValue(""); }} />}
                      value={searchValue}
                      onChange={setSearchValue}
                      placeholder="Search product groups..."
                      autoComplete="off"
                      label="Search"
                      labelHidden
                    />
                  </div>
               )}
            </div>
            <InlineStack gap="100">
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
          </InlineStack>
        </Box>
        <Divider />

        {filteredGroups.length === 0 ? (
          <EmptyState
            heading="No product groups found"
            action={{ content: 'Create group', url: '/app/groups/new', variant: 'primary' }}
            image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
          >
            <p>Start by creating your first group to link products together.</p>
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
            selectable={false}
          >
            {filteredGroups.map((group, index) => (
              <IndexTable.Row id={group.id} key={group.id} position={index}>
                <IndexTable.Cell>
                  <Link to={`/app/groups/${group.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                    <Text variant="bodyMd" fontWeight="semibold">{group.name || "Untitled Group"}</Text>
                  </Link>
                </IndexTable.Cell>
                <IndexTable.Cell>
                  <ProductThumbnailGroup productIds={group.products} />
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
                  <Badge tone={group.status === "active" ? "success" : "attention"}>
                    <InlineStack gap="100" blockAlign="center">
                      <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: group.status === "active" ? '#008060' : '#8c9196' }} />
                      {group.status === "active" ? "Active" : "Draft"}
                    </InlineStack>
                  </Badge>
                </IndexTable.Cell>
                <IndexTable.Cell>
                  <Text tone="subdued" variant="bodyMd">{new Date(group.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</Text>
                </IndexTable.Cell>
                <IndexTable.Cell>
                   <InlineStack align="end" gap="100">
                      <Button icon={DuplicateIcon} variant="tertiary" />
                      <Button icon={RefreshIcon} variant="tertiary" />
                      <ActionMenu groupId={group.id} />
                   </InlineStack>
                </IndexTable.Cell>
              </IndexTable.Row>
            ))}
          </IndexTable>
        )}
      </Card>

      {/* Footer Footer */}
      <Box paddingBlock="800">
        <InlineStack align="center" gap="100">
          <Icon source={QuestionCircleIcon} tone="subdued" />
          <Button variant="plain" url="/app/help">Help Center</Button>
        </InlineStack>
      </Box>
    </Page>
  );
}

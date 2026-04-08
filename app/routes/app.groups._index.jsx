import { useState, useCallback, useEffect } from "react";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation, useActionData, Link } from "@remix-run/react";
import {
  Page,
  Card,
  Button,
  BlockStack,
  Text,
  IndexTable,
  Badge,
  EmptyState,
  TextField,
  InlineStack,
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
  CheckIcon,
} from "@shopify/polaris-icons";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import { syncGroupMetafields } from "../sync.server";

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

  // Fetch App Embed Status via direct REST fetch (most stable method, bypasses library/schema issues)
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
    console.warn("Skipping app embed check due to fetch error:", e.message);
    isAppEmbedEnabled = true; // Safety default
  }
  
  return json({ groups, shop: shop, usageInfo, totalProducts, productImages, isAppEmbedEnabled });
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

  const isLoading = navigation.state !== "idle";
  const isLimitReached = usageInfo.limit !== Infinity && usageInfo.used >= usageInfo.limit;

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
      } catch (e) {}

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
    } catch (e) {}

    submit(formData, { method: "POST", headers });
  }, [submit]);

  const handleSyncGroup = useCallback(async (groupId) => {
    const formData = new FormData();
    formData.append("action", "sync");
    formData.append("groupId", groupId);

    let headers = {};
    try {
      if (typeof window !== "undefined" && window.shopify && window.shopify.idToken) {
        const idToken = await window.shopify.idToken();
        headers = { Authorization: `Bearer ${idToken}` };
      }
    } catch (e) {}

    submit(formData, { method: "POST", headers });
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
    const group = groups.find(g => g.id === groupId);
    const status = group?.status || "active";

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
            width: '40px', 
            height: '40px', 
            borderRadius: '10px', 
            overflow: 'hidden', 
            border: '1.5px solid #f1f1f1',
            backgroundColor: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'transform 0.2s ease',
            cursor: 'pointer'
          }}
          onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.1)'}
          onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
          >
            {productImages[p.productId] ? (
              <img src={productImages[p.productId]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <Icon source={SearchIcon} tone="subdued" size="small" />
            )}
          </div>
        ))}
        {remainingCount > 0 && (
          <div style={{ 
            marginLeft: '4px',
            backgroundColor: '#f6f6f7',
            padding: '4px 8px',
            borderRadius: '12px'
          }}>
            <Text variant="bodySm" fontWeight="bold" tone="subdued">+{remainingCount}</Text>
          </div>
        )}
      </InlineStack>
    );
  };

  const StatsCard = ({ title, value, icon, color, progress, subtitle }) => (
    <Card padding="400">
      <BlockStack gap="300">
        <InlineStack align="space-between" blockAlign="center">
          <BlockStack gap="100">
            <Text variant="bodySm" fontWeight="bold" tone="subdued">{title}</Text>
            <Text variant="headingLg" as="h2">{value}</Text>
          </BlockStack>
          <div style={{ 
            backgroundColor: `${color}15`, 
            padding: '12px', 
            borderRadius: '12px',
            color: color
          }}>
            <Icon source={icon} tone="inherit" />
          </div>
        </InlineStack>
        {progress !== undefined && (
          <BlockStack gap="100">
            <ProgressBar progress={progress} tone={progress > 90 ? "critical" : progress > 70 ? "caution" : "success"} size="small" />
            <Text variant="bodyXs" tone="subdued">{subtitle}</Text>
          </BlockStack>
        )}
        {subtitle && progress === undefined && (
          <Text variant="bodySm" tone="subdued">{subtitle}</Text>
        )}
      </BlockStack>
    </Card>
  );

  const FAQSection = () => {
    const [openIndex, setOpenIndex] = useState(null);
    const faqs = [
      { 
        question: "Can I change the position of the options?", 
        answer: "Yes! You can use the Theme Editor to drag the 'Linked Product Variants' block to any position within your Product Information section." 
      },
      { 
        question: "How do I show options on collection pages?", 
        answer: "Enable the 'App Card Injector' block in your Theme App Embeds settings. The app will automatically find product cards and inject swatches." 
      },
      { 
        question: "Can a product belong to multiple groups?", 
        answer: "Currently, each product can only belong to one active product group to avoid display conflicts on the storefront." 
      }
    ];

    return (
      <Card padding="500">
        <BlockStack gap="400">
          <InlineStack gap="200" blockAlign="center">
            <Icon source={QuestionCircleIcon} tone="base" />
            <Text variant="headingMd" as="h2">Need help? FAQ</Text>
          </InlineStack>
          <BlockStack gap="200">
            {faqs.map((faq, index) => (
              <Box 
                key={index} 
                padding="300" 
                background="bg-surface-secondary" 
                borderRadius="200"
                cursor="pointer"
                onClick={() => setOpenIndex(openIndex === index ? null : index)}
              >
                <BlockStack gap="200">
                  <InlineStack align="space-between">
                    <Text variant="bodyMd" fontWeight="semibold">{faq.question}</Text>
                    <Icon source={openIndex === index ? XIcon : PlusIcon} size="extrasmall" />
                  </InlineStack>
                  {openIndex === index && (
                    <Box paddingBlockStart="200">
                      <Text variant="bodyMd" tone="subdued">{faq.answer}</Text>
                    </Box>
                  )}
                </BlockStack>
              </Box>
            ))}
          </BlockStack>
          <div style={{ textAlign: 'center', marginTop: '10px' }}>
            <Button variant="plain">View all FAQs</Button>
          </div>
        </BlockStack>
      </Card>
    );
  };

  const SupportSection = () => (
    <Grid>
      <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 6, lg: 6, xl: 6 }}>
        <Card padding="500">
          <BlockStack gap="300">
            <InlineStack gap="200" blockAlign="center">
              <div style={{ backgroundColor: '#EBEFFD', padding: '8px', borderRadius: '8px', color: '#2C6ECB' }}>
                <Icon source={ImportIcon} tone="inherit" />
              </div>
              <Text variant="headingMd" as="h3">Get email support</Text>
            </InlineStack>
            <Text variant="bodyMd" tone="subdued">Email us and we'll get back to you as soon as possible.</Text>
            <div style={{ marginTop: '10px' }}>
              <Button variant="plain">Contact us</Button>
            </div>
          </BlockStack>
        </Card>
      </Grid.Cell>
      <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 6, lg: 6, xl: 6 }}>
        <Card padding="500">
          <BlockStack gap="300">
            <InlineStack gap="200" blockAlign="center">
              <div style={{ backgroundColor: '#E7F5EF', padding: '8px', borderRadius: '8px', color: '#008060' }}>
                <Icon source={MenuHorizontalIcon} tone="inherit" />
              </div>
              <Text variant="headingMd" as="h3">Start live chat</Text>
            </InlineStack>
            <Text variant="bodyMd" tone="subdued">Chat with us for a quick solution to your questions.</Text>
            <div style={{ marginTop: '10px' }}>
              <Button variant="plain">Chat now</Button>
            </div>
          </BlockStack>
        </Card>
      </Grid.Cell>
    </Grid>
  );

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
      <TitleBar title="Dashboard" />
      
      <BlockStack gap="600">
        {/* Header & Main Actions */}
        <InlineStack align="space-between" blockAlign="center">
          <BlockStack gap="100">
            <Text variant="headingXl" as="h1">Product groups</Text>
            <Text variant="bodyMd" tone="subdued">Manage your product listing variants and storefront displays.</Text>
          </BlockStack>
          <InlineStack gap="300">
            <ButtonGroup>
              <Button icon={ExportIcon}>Export</Button>
              <Button icon={ImportIcon}>Import</Button>
            </ButtonGroup>
            {isLimitReached ? (
              <Tooltip content="Limit reached for your current plan.">
                <Button variant="primary" icon={PlusIcon} disabled>Create group</Button>
              </Tooltip>
            ) : (
              <Button variant="primary" icon={PlusIcon} url="/app/groups/new">Create group</Button>
            )}
          </InlineStack>
        </InlineStack>

        {/* Dynamic Banners */}
        <BlockStack gap="300">
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
              <p>The app embed is currently disabled. Enable it to show swatches on your storefront.</p>
            </Banner>
          )}

          {isLimitReached && (
            <Banner 
              title="Plan limit reached" 
              tone="critical"
              action={{ content: 'Upgrade Now', url: '/app/pricing' }}
            >
              <p>You've used all {usageInfo.limit} groups in your <b>{usageInfo.planName}</b>. Upgrade to continue creating.</p>
            </Banner>
          )}
        </BlockStack>

        {/* Premium Stats Grid */}
        <Grid>
          <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 4, lg: 4, xl: 4 }}>
            <StatsCard 
              title="Usage Status" 
              value={`${usageInfo.used} / ${usageInfo.limit === Infinity ? "∞" : usageInfo.limit}`}
              icon={CheckIcon}
              color="#008060"
              progress={usageInfo.limit === Infinity ? 0 : (usageInfo.used / usageInfo.limit) * 100}
              subtitle={isLimitReached ? "Limit reached" : `${Math.max(0, usageInfo.limit - usageInfo.used)} groups remaining`}
            />
          </Grid.Cell>
          <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 4, lg: 4, xl: 4 }}>
            <StatsCard 
              title="Global Products" 
              value={totalProducts}
              icon={PlusIcon}
              color="#2C6ECB"
              subtitle="Linked across all groups"
            />
          </Grid.Cell>
          <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 4, lg: 4, xl: 4 }}>
            <StatsCard 
              title="App Integration" 
              value={isAppEmbedEnabled ? "Active" : "Inactive"}
              icon={isAppEmbedEnabled ? CheckIcon : XIcon}
              color={isAppEmbedEnabled ? "#008060" : "#D82C0D"}
              subtitle={isAppEmbedEnabled ? "Live on your theme" : "Requires activation"}
            />
          </Grid.Cell>
        </Grid>

        {/* Main Content Area */}
        <Card padding="0">
          <Box paddingInline="400" paddingBlock="400">
            <InlineStack align="space-between" blockAlign="center">
              <div style={{ flex: 1 }}>
                {!isSearchVisible ? (
                  <Tabs tabs={tabs} selected={selectedTab} onSelect={handleTabChange} />
                ) : (
                  <TextField
                    prefix={<Icon source={SearchIcon} tone="subdued" />}
                    suffix={<Button icon={XIcon} variant="tertiary" onClick={() => { setIsSearchVisible(false); setSearchValue(""); }} />}
                    value={searchValue}
                    onChange={setSearchValue}
                    placeholder="Search groups..."
                    autoComplete="off"
                    label="Search"
                    labelHidden
                  />
                )}
              </div>
              <InlineStack gap="200">
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
              heading="Start building your variant groups"
              action={isLimitReached ? undefined : { content: 'Create first group', url: '/app/groups/new' }}
              image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
            >
              <p>Connect your product listings to create a seamless variant switching experience.</p>
            </EmptyState>
          ) : (
            <IndexTable
              resourceName={{ singular: "group", plural: "groups" }}
              itemCount={filteredGroups.length}
              headings={[
                { title: "Group name" },
                { title: "Thumbnails" },
                { title: "Items" },
                { title: "Status" },
                { title: "Last updated" },
                { title: "", alignment: 'end' },
              ]}
              selectable={false}
            >
              {filteredGroups.map((group, index) => (
                <IndexTable.Row id={group.id} key={group.id} position={index}>
                  <IndexTable.Cell>
                    <Link to={`/app/groups/${group.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                      <Text variant="bodyMd" fontWeight="bold">{group.name || "Unnamed Group"}</Text>
                      <Text variant="bodyXs" tone="subdued">{group.optionName}</Text>
                    </Link>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <ProductThumbnailGroup 
                      productIds={group.products} 
                      totalCount={group._count.products} 
                    />
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <Badge tone="info">{group._count.products} Products</Badge>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <Badge tone={group.status === "active" ? "success" : "attention"}>
                      {group.status === "active" ? "Active" : "Draft"}
                    </Badge>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <Text tone="subdued" variant="bodySm">{new Date(group.createdAt).toLocaleDateString()}</Text>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <InlineStack align="end" gap="200">
                      <Button 
                        icon={RefreshIcon} 
                        variant="tertiary" 
                        onClick={() => handleSyncGroup(group.id)}
                        loading={isLoading && navigation.formData?.get("groupId") === group.id && navigation.formData?.get("action") === "sync"}
                      />
                      <ActionMenu groupId={group.id} />
                    </InlineStack>
                  </IndexTable.Cell>
                </IndexTable.Row>
              ))}
            </IndexTable>
          )}
        </Card>

        {/* FAQ & Support Section */}
        <BlockStack gap="400">
          <FAQSection />
          <SupportSection />
        </BlockStack>

        <Box paddingBlock="600">
          <InlineStack align="center" gap="100">
            <Icon source={QuestionCircleIcon} tone="subdued" />
            <Text variant="bodySm" tone="subdued">Need more help? Visit our Documentation or Contact Support.</Text>
          </InlineStack>
        </Box>
      </BlockStack>
    </Page>
  );
}

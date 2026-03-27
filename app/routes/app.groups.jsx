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
} from "@shopify/polaris-icons";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";

export async function loader({ request }) {
  const { authenticate } = await import("../shopify.server");
  const { default: prisma } = await import("../db.server");
  const { getUsageInfo } = await import("../billing.server");

  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const usageInfo = await getUsageInfo(shop);

  const groups = await prisma.productGroup.findMany({
    where: { shop: shop },
    include: {
      _count: { select: { products: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const totalProducts = groups.reduce((acc, group) => acc + group._count.products, 0);

  return json({ groups, shop: shop, usageInfo, totalProducts });
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
  const { groups, usageInfo, totalProducts } = useLoaderData();
  const actionData = useActionData();
  const submit = useSubmit();
  const navigation = useNavigation();
  const shopify = useAppBridge();

  const [selectedTab, setSelectedTab] = useState(0);
  const handleTabChange = useCallback((selectedTabIndex) => setSelectedTab(selectedTabIndex), []);

  const [actionBannerVisible, setActionBannerVisible] = useState(true);
  useEffect(() => { if (actionData) setActionBannerVisible(true); }, [actionData]);

  const isLoading = navigation.state === "submitting" || navigation.state === "loading";

  const handleDeleteGroup = useCallback((groupId) => {
    if (confirm("Are you sure you want to delete this group?")) {
      const formData = new FormData();
      formData.append("action", "delete");
      formData.append("groupId", groupId);
      submit(formData, { method: "POST" });
    }
  }, [submit]);

  const [isSearchActive, setIsSearchActive] = useState(false);
  const [searchValue, setSearchValue] = useState("");

  const tabs = [
    { id: 'all', content: 'All', accessibilityLabel: 'All product groups', panelID: 'all-groups-panel' },
    { id: 'single', content: 'Single option', panelID: 'single-option-panel' },
    { id: 'multi', content: 'Multi option', panelID: 'multi-option-panel' },
    { id: 'subcategory', content: 'Subcategory', panelID: 'subcategory-panel' },
  ];

  const getSyncStatusBadge = (status) => {
    switch (status) {
      case "synced": return <Badge tone="success">Synced</Badge>;
      case "error": return <Badge tone="critical">Error</Badge>;
      default: return <Badge>Not synced</Badge>;
    }
  };

  return (
    <Page fullWidth>
      <TitleBar title="Product groups" />
      
      <BlockStack gap="500">
        {/* Header Section */}
        <InlineStack align="space-between" blockAlign="start">
          <BlockStack gap="100">
            <Text variant="headingXl">Product groups</Text>
            <Text variant="bodyMd" tone="subdued">Product groups combine multiple product listings into variant options.</Text>
          </BlockStack>
          <InlineStack gap="200">
             <Button icon={ExportIcon}>Export</Button>
             <Button icon={ImportIcon}>Import</Button>
             <Button icon={PlusIcon}>Bulk update options</Button>
             <Button variant="primary" url="/app" icon={PlusIcon}>Create group</Button>
          </InlineStack>
        </InlineStack>

        {/* Stats Bar */}
        <Grid>
          <Grid.Cell columnSpan={{ xs: 6, sm: 4, md: 4, lg: 4 }}>
            <Card>
              <BlockStack gap="100">
                 <Text variant="headingSm">Created product groups</Text>
                 <Text variant="headingLg">{groups.length} groups</Text>
              </BlockStack>
            </Card>
          </Grid.Cell>
          <Grid.Cell columnSpan={{ xs: 6, sm: 4, md: 4, lg: 4 }}>
            <Card>
              <BlockStack gap="100">
                 <Text variant="headingSm">Remaining product groups</Text>
                 <InlineStack gap="200">
                    <Text variant="headingLg">{usageInfo.limit === Infinity ? "Unlimited" : usageInfo.limit - groups.length} groups</Text>
                    <Link to="/app/pricing" style={{ color: '#005bd3', textDecoration: 'none', fontSize: '14px', alignSelf: 'center' }}>Upgrade</Link>
                 </InlineStack>
              </BlockStack>
            </Card>
          </Grid.Cell>
          <Grid.Cell columnSpan={{ xs: 6, sm: 4, md: 4, lg: 4 }}>
            <Card>
              <BlockStack gap="100">
                 <Text variant="headingSm">Total products</Text>
                 <Text variant="headingLg">{totalProducts} products</Text>
              </BlockStack>
            </Card>
          </Grid.Cell>
        </Grid>

        {/* Groups Content */}
        <Card padding="0">
          {isSearchActive ? (
            <BlockStack>
               <Box padding="400">
                  <InlineStack align="space-between" blockAlign="center" gap="400">
                     <div style={{ flex: 1 }}>
                        <TextField
                          placeholder="Search product groups"
                          prefix={<Icon source={SearchIcon} />}
                          value={searchValue}
                          onChange={setSearchValue}
                          autoComplete="off"
                        />
                     </div>
                     <Button variant="plain" onClick={() => setIsSearchActive(false)}>Cancel</Button>
                  </InlineStack>
                  <Box paddingBlockStart="300">
                     <InlineStack gap="200">
                        <Button icon={ChevronDownIcon} iconPosition="right">Status</Button>
                        <Button icon={ChevronDownIcon} iconPosition="right">Product count</Button>
                     </InlineStack>
                  </Box>
               </Box>
               <Divider />
            </BlockStack>
          ) : (
            <div style={{ position: 'relative' }}>
              <Tabs tabs={tabs} selected={selectedTab} onSelect={handleTabChange} />
              <div style={{ position: 'absolute', top: '8px', right: '16px', zIndex: 1 }}>
                 <InlineStack gap="100">
                    <Button variant="tertiary" icon={SearchIcon} onClick={() => setIsSearchActive(true)} />
                    <Button variant="tertiary" icon={FilterIcon} />
                 </InlineStack>
              </div>
              <Divider />
            </div>
          )}
             
          {groups.length === 0 ? (
            <Box padding="1000">
              <BlockStack gap="500" align="center">
                <Thumbnail
                  source="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                  size="large"
                  alt="Empty groups"
                />
                <BlockStack gap="200" align="center">
                    <Text variant="headingMd" alignment="center">Product groups</Text>
                    <Text variant="bodyMd" tone="subdued" alignment="center">
                      Create a product group to link listings together. <Link to="/app/help">Learn more</Link>
                    </Text>
                </BlockStack>
                <Button variant="primary" url="/app">Create group</Button>
              </BlockStack>
            </Box>
          ) : (
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
                        <Link to={`/app/groups/${group.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>{group.name}</Link>
                      </Text>
                    </div>
                  </IndexTable.Cell>
                  <IndexTable.Cell>{group._count.products}</IndexTable.Cell>
                  <IndexTable.Cell>{getSyncStatusBadge(group.syncStatus)}</IndexTable.Cell>
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
                          loading={isLoading && navigation.formData?.get("groupId") === group.id}
                          accessibilityLabel="Delete group"
                        />
                      </Tooltip>
                    </InlineStack>
                  </IndexTable.Cell>
                </IndexTable.Row>
              ))}
            </IndexTable>
          )}
        </Card>

        {/* Footer */}
        <Box paddingBlockEnd="400">
           <InlineStack align="center" gap="100">
             <Icon source={QuestionCircleIcon} tone="base" />
             <Link to="/app/help" style={{ textDecoration: 'none', color: '#005bd3', fontWeight: '500' }}>Help Center</Link>
           </InlineStack>
        </Box>
      </BlockStack>
    </Page>
  );
}

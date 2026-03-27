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

  const [isSearchActive, setIsSearchActive] = useState(false);
  const [searchValue, setSearchValue] = useState("");

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
    { id: 'all', content: 'All', accessibilityLabel: 'All product groups', panelID: 'all-groups-panel' },
    { id: 'active', content: 'Active', panelID: 'active-groups-panel' },
    { id: 'draft', content: 'Draft', panelID: 'draft-groups-panel' },
  ];

  return (
    <Page fullWidth>
      <Box paddingBlockEnd="400">
        <BlockStack gap="200">
          <InlineStack align="space-between" blockAlign="center">
            <Text variant="headingLg">Product groups</Text>
            <InlineStack gap="200">
              <Button icon={ExportIcon}>Export</Button>
              <Button icon={ImportIcon}>Import</Button>
              <Button variant="primary" url="/app/groups/new">Create group</Button>
            </InlineStack>
          </InlineStack>
          <Text variant="bodyMd" tone="subdued">Manage your linked product variants and their display settings</Text>
        </BlockStack>
      </Box>

      <BlockStack gap="400">
        {actionData?.message && <Banner tone="success"><p>{actionData.message}</p></Banner>}

        <Grid>
          <Grid.Cell columnSpan={{ xs: 6, sm: 4, md: 4, lg: 4 }}>
            <Card>
              <BlockStack gap="100">
                <Text variant="bodySm" tone="subdued" fontWeight="semibold">Total groups</Text>
                <Text variant="headingLg">{groups.length}</Text>
              </BlockStack>
            </Card>
          </Grid.Cell>
          <Grid.Cell columnSpan={{ xs: 6, sm: 4, md: 4, lg: 4 }}>
            <Card>
              <BlockStack gap="100">
                <Text variant="bodySm" tone="subdued" fontWeight="semibold">Linked products</Text>
                <Text variant="headingLg">{totalProducts}</Text>
              </BlockStack>
            </Card>
          </Grid.Cell>
          <Grid.Cell columnSpan={{ xs: 6, sm: 4, md: 4, lg: 4 }}>
            <Card>
              <BlockStack gap="100">
                <Text variant="bodySm" tone="subdued" fontWeight="semibold">Plan usage</Text>
                <InlineStack gap="200" blockAlign="center">
                  <Text variant="headingLg">{usageInfo.limit === Infinity ? "Unlimited" : `${groups.length}/${usageInfo.limit}`}</Text>
                  <Badge tone="info" size="small">Pro</Badge>
                </InlineStack>
              </BlockStack>
            </Card>
          </Grid.Cell>
        </Grid>

        <Card padding="0">
          <Tabs tabs={tabs} selected={selectedTab} onSelect={handleTabChange} />
          <Divider />
          <Box padding="300">
            <InlineStack align="space-between" blockAlign="center">
              <div style={{ flex: 1, maxWidth: '400px' }}>
                <TextField
                  placeholder="Search groups"
                  prefix={<Icon source={SearchIcon} />}
                  value={searchValue}
                  onChange={setSearchValue}
                  autoComplete="off"
                  label="Search"
                  labelHidden
                />
              </div>
              <InlineStack gap="200">
                <Button icon={FilterIcon}>Filter</Button>
              </InlineStack>
            </InlineStack>
          </Box>
          <Divider />

          {groups.length === 0 ? (
            <Box padding="1000">
              <EmptyState
                heading="No product groups found"
                action={{ content: 'Create group', url: '/app/groups/new', variant: 'primary' }}
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <p>Start by creating your first group to link products together.</p>
              </EmptyState>
            </Box>
          ) : (
            <IndexTable
              resourceName={{ singular: "group", plural: "groups" }}
              itemCount={groups.length}
              headings={[
                { title: "Group name" },
                { title: "Option" },
                { title: "Products" },
                { title: "Status" },
                { title: "Sync", alignment: "center" },
                { title: "Actions", alignment: "end" },
              ]}
              selectable={false}
            >
              {groups.map((group, index) => (
                <IndexTable.Row id={group.id} key={group.id} position={index}>
                  <IndexTable.Cell>
                    <Link to={`/app/groups/${group.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                      <Text variant="bodyMd" fontWeight="bold" truncate>{group.name || "Untitled Group"}</Text>
                    </Link>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <Badge tone="info" size="small">{group.optionName}</Badge>
                  </IndexTable.Cell>
                  <IndexTable.Cell>{group._count.products} products</IndexTable.Cell>
                  <IndexTable.Cell>
                    <Badge tone={group.status === "active" ? "success" : "attention"}>
                      {group.status === "active" ? "Active" : "Draft"}
                    </Badge>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                     <InlineStack align="center">
                        <Icon source={ImportIcon} tone={group.syncStatus === "synced" ? "success" : "subdued"} />
                     </InlineStack>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <InlineStack gap="100" align="end">
                      <Tooltip content="Edit">
                        <Button icon={ViewIcon} url={`/app/groups/${group.id}`} variant="tertiary" />
                      </Tooltip>
                      <Tooltip content="Delete">
                        <Button 
                          icon={DeleteIcon} 
                          tone="critical" 
                          variant="tertiary" 
                          onClick={() => handleDeleteGroup(group.id)} 
                          loading={isLoading && navigation.formData?.get("groupId") === group.id}
                        />
                      </Tooltip>
                    </InlineStack>
                  </IndexTable.Cell>
                </IndexTable.Row>
              ))}
            </IndexTable>
          )}
        </Card>
      </BlockStack>

      <Box paddingBlock="800">
        <InlineStack align="center" gap="100">
          <Text variant="bodySm" tone="subdued">Need help? </Text>
          <Link to="/app/help">Contact support</Link>
        </InlineStack>
      </Box>
    </Page>
  );
}

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
import { XIcon, SearchIcon, ViewIcon, DeleteIcon, ImportIcon } from "@shopify/polaris-icons";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";

// Loader
export async function loader({ request }) {
  const { authenticate } = await import("../shopify.server");
  const { default: prisma } = await import("../db.server");

  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const groups = await prisma.productGroup.findMany({
    where: { shop: shop },
    include: {
      _count: { select: { products: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return json({ groups, shop: shop });
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
  const { groups } = useLoaderData();
  const actionData = useActionData();
  const submit = useSubmit();
  const navigation = useNavigation();
  const shopify = useAppBridge();

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

  const getSyncStatusBadge = (status) => {
    switch (status) {
      case "synced": return <Badge tone="success">Synced</Badge>;
      case "error": return <Badge tone="critical">Error</Badge>;
      default: return <Badge>Not synced</Badge>;
    }
  };

  return (
    <Page title="Product Groups">
      <TitleBar title="Product Groups">
        <button variant="primary" onClick={() => window.location.href = "/app"}>
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

            {groups.length === 0 ? (
              <Card>
                <EmptyState
                  heading="No product groups found"
                  action={{
                    content: "Create your first group",
                    url: "/app",
                  }}
                  image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                >
                  <p>Check your dashboard or use automations to create groups.</p>
                </EmptyState>
              </Card>
            ) : (
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
              </Card>
            )}
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

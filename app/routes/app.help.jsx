import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import {
    Page,
    Layout,
    Card,
    BlockStack,
    Text,
    List,
    Box,
    Banner,
    Button,
    InlineStack,
    Icon,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { ExternalIcon, CheckIcon, PlayIcon } from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
    const { session } = await authenticate.admin(request);
    return json({ shop: session.shop });
};

export default function HelpPage() {
    const { shop } = useLoaderData();

    return (
        <Page title="Setup Guide">
            <TitleBar title="Setup Guide" />
            <Layout>
                <Layout.Section>
                    <BlockStack gap="500">
                        <Banner tone="info" title="Important: Enable the App in Theme Editor">
                            <p>
                                To display linked products on your store, you must manually add the "Linked Products" block to your Product Page in the Shopify Theme Editor.
                            </p>
                        </Banner>

                        <Card>
                            <BlockStack gap="400">
                                <Text variant="headingLg" as="h2">Step 1: Open Theme Editor</Text>
                                <Text as="p">
                                    Click the button below to open your current theme's customization page.
                                </Text>
                                <InlineStack align="start">
                                    <Button
                                        variant="primary"
                                        icon={ExternalIcon}
                                        onClick={() => window.open(`https://${shop}/admin/themes/current/editor?template=product`, '_blank')}
                                    >
                                        Open Theme Editor
                                    </Button>
                                </InlineStack>
                            </BlockStack>
                        </Card>

                        <Card>
                            <BlockStack gap="400">
                                <Text variant="headingLg" as="h2">Step 2: Add App Block</Text>
                                <Text as="p">
                                    Once the editor is open, follow these sub-steps:
                                </Text>
                                <List type="number">
                                    <List.Item>Navigate to the <b>Product Information</b> section on the left sidebar.</List.Item>
                                    <List.Item>Click on <b>Add block</b>.</List.Item>
                                    <List.Item>Under the <b>Apps</b> tab, search for and select <b>Linked Products</b>.</List.Item>
                                    <List.Item>Drag the block to your desired position (usually below the Cart button).</List.Item>
                                </List>
                                <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                                    <InlineStack gap="200" align="start" blockAlign="center">
                                        <Icon source={PlayIcon} tone="base" />
                                        <Text fontWeight="bold">Pro Tip: Put it where it's most visible to customers!</Text>
                                    </InlineStack>
                                </Box>
                            </BlockStack>
                        </Card>

                        <Card>
                            <BlockStack gap="400">
                                <Text variant="headingLg" as="h2">Step 3: Save Changes</Text>
                                <Text as="p">
                                    Don't forget to click the <b>Save</b> button in the top right corner of the Theme Editor to make the changes live on your store.
                                </Text>
                                <InlineStack gap="200" align="start">
                                    <Icon source={CheckIcon} tone="success" />
                                    <Text tone="success" fontWeight="bold">You're all set! Your linked products will now appear on product pages.</Text>
                                </InlineStack>
                            </BlockStack>
                        </Card>
                    </BlockStack>
                </Layout.Section>

                <Layout.Section variant="oneThird">
                    <Card>
                        <BlockStack gap="300">
                            <Text variant="headingMd" as="h2">Need more help?</Text>
                            <Text as="p">If you encounter any issues during setup, please check our FAQ or contact support.</Text>
                            <Button url="/app/support">Go to Support</Button>
                        </BlockStack>
                    </Card>
                </Layout.Section>
            </Layout>
        </Page>
    );
}

import { useState, useCallback } from "react";
import {
    Page,
    Layout,
    Card,
    BlockStack,
    Text,
    Icon,
    InlineStack,
    Box,
    Divider,
    Collapsible,
    Button,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { QuestionCircleIcon, EmailIcon, ChatIcon, ChevronDownIcon, ChevronUpIcon } from "@shopify/polaris-icons";

function FAQItem({ title, children, id }) {
    const [open, setOpen] = useState(false);
    const handleToggle = useCallback(() => setOpen((open) => !open), []);

    return (
        <BlockStack gap="200">
            <Button
                variant="plain"
                onClick={handleToggle}
                ariaExpanded={open}
                ariaControls={id}
                fullWidth
                textAlign="left"
            >
                <InlineStack gap="200" align="start" blockAlign="center">
                    <Text variant="headingMd" as="span">{title}</Text>
                    <Icon source={open ? ChevronUpIcon : ChevronDownIcon} />
                </InlineStack>
            </Button>
            <Collapsible
                open={open}
                id={id}
                transition={{ duration: '500ms', timingFunction: 'ease-in-out' }}
                expandOnPrint
            >
                <Box paddingBlockStart="200" paddingBlockEnd="400">
                    <Text as="p" tone="subdued">
                        {children}
                    </Text>
                </Box>
            </Collapsible>
            <Divider />
        </BlockStack>
    );
}

export default function SupportPage() {
    return (
        <Page title="Support & FAQ">
            <TitleBar title="Support & FAQ" />
            <Layout>
                <Layout.Section>
                    <BlockStack gap="500">
                        <Card>
                            <BlockStack gap="400">
                                <Text variant="headingLg" as="h2">Frequently Asked Questions</Text>
                                <Box paddingBlockStart="200">
                                    <BlockStack gap="400">
                                        <FAQItem id="faq-1" title="How do I create my first product group?">
                                            Go to the <b>Dashboard</b>, click on <b>Create Group</b>, give it a name, and select the products you want to link together. Once saved, they will be automatically synced.
                                        </FAQItem>
                                        <FAQItem id="faq-2" title="Why are my linked products not showing on my store?">
                                            The most common reason is that the <b>Linked Products App Block</b> hasn't been added to your theme. Please follow the steps in our <a href="/app/help">Setup Guide</a>.
                                        </FAQItem>
                                        <FAQItem id="faq-3" title="What are the differences between plans?">
                                            The <b>Free</b> plan allows 1 product group. The <b>Basic</b> plan ($6.99) increases this to 100 groups, the <b>Advanced</b> plan ($14.99) supports up to 500 groups, and the <b>Premium</b> plan ($34.99) gives you unlimited groups with priority support.
                                        </FAQItem>
                                        <FAQItem id="faq-4" title="Can I use all swatch styles on a free plan?">
                                            Yes! All plans, including the Free version, have full access to all visual styles (Circle, Square, Polaroid, Button, etc.) and layout options (Grid, List, Carousel). We believe design flexibility should be available to everyone.
                                        </FAQItem>
                                    </BlockStack>
                                </Box>
                            </BlockStack>
                        </Card>

                        <Card>
                            <BlockStack gap="400">
                                <Text variant="headingLg" as="h2">Still need help?</Text>
                                <Text as="p">Our support team is happy to assist you with any questions or technical issues.</Text>

                                <Divider />

                                <InlineStack gap="600" align="start">
                                    <Box>
                                        <InlineStack gap="200" blockAlign="center">
                                            <Icon source={EmailIcon} tone="base" />
                                            <BlockStack>
                                                <Text variant="headingMd">Email Support</Text>
                                                <Text tone="subdued">support@bluepeaks.top</Text>
                                                <Text variant="bodySm">Response within 24 hours</Text>
                                            </BlockStack>
                                        </InlineStack>
                                    </Box>

                                    <Box>
                                        <InlineStack gap="200" blockAlign="center">
                                            <Icon source={ChatIcon} tone="base" />
                                            <BlockStack>
                                                <Text variant="headingMd">Dashboard Chat</Text>
                                                <Text tone="subdued">Available on Premium Plan</Text>
                                                <Text variant="bodySm">Real-time Priority Response</Text>
                                            </BlockStack>
                                        </InlineStack>
                                    </Box>
                                </InlineStack>
                            </BlockStack>
                        </Card>
                    </BlockStack>
                </Layout.Section>

                <Layout.Section variant="oneThird">
                    <Card background="bg-surface-secondary">
                        <BlockStack gap="300">
                            <Box align="center">
                                <Icon source={QuestionCircleIcon} tone="info" size="large" />
                            </Box>
                            <Text variant="headingMd" as="h2" alignment="center">Knowledge Base</Text>
                            <Text as="p" alignment="center">
                                Access our full documentation for deep dives into all features and best practices.
                            </Text>
                        </BlockStack>
                    </Card>
                </Layout.Section>
            </Layout>
        </Page>
    );
}

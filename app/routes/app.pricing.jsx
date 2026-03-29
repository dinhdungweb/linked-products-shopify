import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation, useSearchParams, useActionData, useRouteError } from "@remix-run/react";
import {
    Page,
    Layout,
    Card,
    BlockStack,
    Text,
    Badge,
    Banner,
    Divider,
    ProgressBar,
    InlineGrid,
    Button,
    InlineStack,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { PLANS } from "../billing.config";

export const loader = async ({ request }) => {
    // Dynamic import to strictly prevent server code in client bundle
    const { authenticate, MONTHLY_PLAN_BASIC, MONTHLY_PLAN_PRO } = await import("../shopify.server");
    const { getUsageInfo, confirmSubscription } = await import("../billing.server");

    const { admin, session, billing } = await authenticate.admin(request);
    const shop = session.shop;

    let usageInfo;
    try {
        usageInfo = await getUsageInfo(shop);
    } catch (error) {
        console.error("Error in loader:", error);
        throw error;
    }

    console.log(`[Pricing Loader] Checking subscription status for ${shop}. Local plan: ${usageInfo.plan}`);

    // Robust & Fast Sync: Check Shopify Billing API status directly
    try {
        const billingCheck = await billing.check({
            isTest: true,
            plans: [MONTHLY_PLAN_BASIC, MONTHLY_PLAN_PRO],
        });

        const currentKnownPlan = usageInfo.plan || 'free';

        if (billingCheck.hasActivePayment) {
            const activeSub = billingCheck.appSubscriptions[0];
            const planKey = activeSub.name.includes("Pro") ? "pro" : "basic";

            // Only update DB if plan has actually changed to save time/resources
            if (planKey !== currentKnownPlan) {
                console.log(`[Pricing Loader] Plan change detected (${currentKnownPlan} -> ${planKey}). Syncing...`);
                await confirmSubscription(admin, shop, planKey, activeSub);
                // Refresh usage info after sync to reflect change in UI
                usageInfo = await getUsageInfo(shop);
            } else {
                console.log(`[Pricing Loader] Plan matches Shopify. Skipping extra sync.`);
            }
        } else if (currentKnownPlan !== 'free') {
            // If DB says paid but Shopify says no, sync back to free
            console.log(`[Pricing Loader] Paid subscription not found on Shopify. Syncing to free.`);
            await confirmSubscription(admin, shop, 'free', null);
            usageInfo = await getUsageInfo(shop);
        }
    } catch (billingError) {
        console.warn("[Pricing Loader] Billing sync skipped:", billingError.message);
    }

    return json({
        shop,
        usageInfo,
        plans: PLANS,
    });
};

export function ErrorBoundary() {
    const error = useRouteError();
    console.error("Pricing Page Error:", error);
    return (
        <Page title="Error">
            <Layout>
                <Layout.Section>
                    <Banner tone="critical">
                        <p>There was an error loading the pricing page.</p>
                        <p>{error.message || (typeof error === 'string' ? error : 'Check console for details')}</p>
                    </Banner>
                </Layout.Section>
            </Layout>
        </Page>
    );
}

export const action = async ({ request }) => {
    console.log("Pricing action triggered");
    const { authenticate, MONTHLY_PLAN_BASIC, MONTHLY_PLAN_PRO } = await import("../shopify.server");
    const { cancelSubscription } = await import("../billing.server");

    const { billing, session, admin } = await authenticate.admin(request);
    const shop = session.shop;
    const formData = await request.formData();
    const actionValue = formData.get("action");
    const plan = formData.get("plan");

    console.log(`Action: ${actionValue}, Plan: ${plan}, Shop: ${shop}`);

    if (actionValue === "subscribe") {
        if (plan === "free") {
            try {
                const { createSubscription } = await import("../billing.server");
                await createSubscription(admin, "free", shop);
                return json({ success: true, message: "Changed to Free plan successfully." });
            } catch (error) {
                return json({ error: error.message }, { status: 400 });
            }
        }

        const planName = plan === "pro" ? MONTHLY_PLAN_PRO : MONTHLY_PLAN_BASIC;

        try {
            console.log(`[Pricing] Action: subscribe, Plan: ${plan}, Map to: ${planName}, Shop: ${shop}`);

            // billing.request will throw a RedirectResponse if successful
            await billing.request({
                plan: planName,
                isTest: true,
                returnUrl: `https://${shop}/admin/apps/${process.env.SHOPIFY_APP_HANDLE || 'variants-linked-products'}/app/pricing?plan=${plan}`,
            });
        } catch (error) {
            if (error instanceof Response) {
                console.log("[Pricing] Redirect response detected, allowing Remix to handle redirection.");
                throw error;
            }
            console.error("[Pricing] Billing request error:", error.message || error);
            return json({ error: `Billing Error: ${error.message || "Could not process request"}` }, { status: 400 });
        }
    }

    if (actionValue === "cancel") {
        try {
            await cancelSubscription(admin, shop);
            return json({ success: true, message: "Subscription cancelled. You are now on the Free plan." });
        } catch (error) {
            console.error("Cancel error:", error);
            return json({ error: error.message }, { status: 400 });
        }
    }

    return json({ error: "Unknown action" }, { status: 400 });
};

export default function PricingPage() {
    const { usageInfo } = useLoaderData();
    const actionData = useActionData();
    const submit = useSubmit();
    const navigation = useNavigation();
    const [searchParams] = useSearchParams();
    const isSubmitting = navigation.state === "submitting";

    const handleSubscribe = (planKey) => {
        const formData = new FormData();
        formData.append("action", "subscribe");
        formData.append("plan", planKey);
        submit(formData, { method: "POST" });
    };

    const handleCancel = () => {
        if (confirm("Are you sure you want to cancel your subscription? You will be downgraded to the Free plan.")) {
            const formData = new FormData();
            formData.append("action", "cancel");
            submit(formData, { method: "POST" });
        }
    };

    // Check if just upgraded
    const justUpgraded = searchParams.get("plan") && searchParams.get("charge_id");

    return (
        <Page backAction={{ url: "/app" }} title="Pricing Plans">
            <TitleBar title="Pricing Plans" />

            <Layout>
                <Layout.Section>
                    <BlockStack gap="400">
                        {/* Error Banner */}
                        {actionData?.error && (
                            <Banner tone="critical" onDismiss={() => { }}>
                                <p>{actionData.error}</p>
                            </Banner>
                        )}

                        {/* Success Message from Action */}
                        {actionData?.message && (
                            <Banner tone="success" onDismiss={() => { }}>
                                <p>{actionData.message}</p>
                            </Banner>
                        )}

                        {justUpgraded && (
                            <Banner tone="success" onDismiss={() => { }}>
                                <p>🎉 Welcome! Your plan has been activated successfully!</p>
                            </Banner>
                        )}

                        {/* Usage Stats */}
                        <Card>
                            <BlockStack gap="300">
                                <Text variant="headingMd">Current Usage</Text>
                                <InlineStack gap="200" align="space-between">
                                    <Text>
                                        <Text as="span" fontWeight="bold">{usageInfo.used}</Text>
                                        {usageInfo.limit === Infinity ? (
                                            <Text as="span" tone="subdued"> links used (Unlimited)</Text>
                                        ) : (
                                            <Text as="span" tone="subdued"> / {usageInfo.limit} links</Text>
                                        )}
                                    </Text>
                                    <Badge tone={usageInfo.plan === "pro" ? "success" : usageInfo.plan === "basic" ? "info" : undefined}>
                                        {usageInfo.planName} Plan
                                    </Badge>
                                </InlineStack>
                                {usageInfo.limit !== Infinity && (
                                    <ProgressBar
                                        progress={usageInfo.percentage}
                                        tone={usageInfo.percentage >= 90 ? "critical" : usageInfo.percentage >= 70 ? "warning" : "primary"}
                                    />
                                )}
                            </BlockStack>
                        </Card>

                        {/* Plan Cards */}
                        {/* Plan Cards */}
                        <InlineGrid columns={{ xs: 1, md: 3 }} gap="400" alignItems="start">
                            {/* Free Plan */}
                            <Card>
                                <BlockStack gap="400">
                                    <BlockStack gap="100">
                                        <Text variant="headingLg">Free</Text>
                                        <Text variant="heading2xl">$0</Text>
                                        <Text tone="subdued">Forever free</Text>
                                    </BlockStack>

                                    <Divider />

                                    <BlockStack gap="200">
                                        <Text>✓ Up to 100 linked products</Text>
                                        <Text>✓ All selector styles</Text>
                                        <Text>✓ Theme customization</Text>
                                        <Text tone="subdued">✗ Priority support</Text>
                                    </BlockStack>

                                    <Button
                                        fullWidth
                                        disabled={usageInfo.plan === "free"}
                                        onClick={() => handleSubscribe("free")}
                                        loading={isSubmitting}
                                    >
                                        {usageInfo.plan === "free" ? "Current Plan" : "Downgrade"}
                                    </Button>
                                </BlockStack>
                            </Card>

                            {/* Basic Plan */}
                            <Card>
                                <BlockStack gap="400">
                                    <BlockStack gap="100">
                                        <InlineStack gap="200" blockAlign="center">
                                            <Text variant="headingLg">Basic</Text>
                                            <Badge tone="info">Popular</Badge>
                                        </InlineStack>
                                        <Text variant="heading2xl">$3.99</Text>
                                        <Text tone="subdued">per month</Text>
                                    </BlockStack>

                                    <Divider />

                                    <BlockStack gap="200">
                                        <Text>✓ Up to 500 linked products</Text>
                                        <Text>✓ All selector styles</Text>
                                        <Text>✓ Theme customization</Text>
                                        <Text>✓ Email support</Text>
                                    </BlockStack>

                                    {usageInfo.plan === "basic" ? (
                                        <Button fullWidth disabled>Current Plan</Button>
                                    ) : usageInfo.plan === "pro" ? (
                                        <Button fullWidth onClick={() => handleSubscribe("basic")} loading={isSubmitting}>
                                            Downgrade
                                        </Button>
                                    ) : (
                                        <Button fullWidth variant="primary" onClick={() => handleSubscribe("basic")} loading={isSubmitting}>
                                            Upgrade
                                        </Button>
                                    )}
                                </BlockStack>
                            </Card>

                            {/* Pro Plan */}
                            <Card background="bg-surface-success-subdued">
                                <BlockStack gap="400">
                                    <BlockStack gap="100">
                                        <InlineStack gap="200" blockAlign="center">
                                            <Text variant="headingLg">Pro</Text>
                                            <Badge tone="success">Best Value</Badge>
                                        </InlineStack>
                                        <Text variant="heading2xl">$6.99</Text>
                                        <Text tone="subdued">per month</Text>
                                    </BlockStack>

                                    <Divider />

                                    <BlockStack gap="200">
                                        <Text fontWeight="bold">✓ Unlimited linked products</Text>
                                        <Text>✓ All selector styles</Text>
                                        <Text>✓ Theme customization</Text>
                                        <Text>✓ Priority support</Text>
                                    </BlockStack>

                                    {usageInfo.plan === "pro" ? (
                                        <Button fullWidth disabled>Current Plan</Button>
                                    ) : (
                                        <Button fullWidth variant="primary" onClick={() => handleSubscribe("pro")} loading={isSubmitting}>
                                            Upgrade
                                        </Button>
                                    )}
                                </BlockStack>
                            </Card>
                        </InlineGrid>

                        {/* Cancel subscription */}
                        {usageInfo.plan !== "free" && (
                            <Card>
                                <InlineStack gap="400" align="space-between" blockAlign="center">
                                    <BlockStack gap="100">
                                        <Text variant="headingMd">Cancel Subscription</Text>
                                        <Text tone="subdued">You will be downgraded to the Free plan with 100 links limit.</Text>
                                    </BlockStack>
                                    <Button tone="critical" onClick={handleCancel} loading={isSubmitting}>
                                        Cancel Subscription
                                    </Button>
                                </InlineStack>
                            </Card>
                        )}
                    </BlockStack>
                </Layout.Section>
            </Layout>
        </Page>
    );
}

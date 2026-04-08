import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation, useSearchParams, useActionData } from "@remix-run/react";
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
    Button,
    InlineStack,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { PLANS } from "../billing.config";

export const loader = async ({ request }) => {
    const { authenticate } = await import("../shopify.server");
    const { getUsageInfo, confirmSubscription } = await import("../billing.server");

    const { admin, session, billing } = await authenticate.admin(request);
    const shop = session.shop;

    let usageInfo = await getUsageInfo(shop);

    try {
        const billingCheck = await billing.check({
            isTest: true,
            plans: [PLANS.basic.key, PLANS.advanced.key, PLANS.premium.key],
        });

        const currentKnownPlan = usageInfo.plan || 'free';

        if (billingCheck.hasActivePayment) {
            const activeSub = billingCheck.appSubscriptions[0];
            let planKey = "free";
            
            // Map subscription names OR keys to our internal plan keys
            const subName = activeSub.name;
            if (subName.includes("Premium") || subName === PLANS.premium.key) planKey = "premium";
            else if (subName.includes("Advanced") || subName === PLANS.advanced.key) planKey = "advanced";
            else if (subName.includes("Basic") || subName === PLANS.basic.key) planKey = "basic";

            if (planKey !== currentKnownPlan) {
                await confirmSubscription(admin, shop, planKey, activeSub);
                usageInfo = await getUsageInfo(shop);
            }
        } else if (currentKnownPlan !== 'free') {
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

export const action = async ({ request }) => {
    const { authenticate } = await import("../shopify.server");
    const { cancelSubscription } = await import("../billing.server");

    let admin, session, billing;
    try {
        const auth = await authenticate.admin(request);
        admin = auth.admin;
        session = auth.session;
        billing = auth.billing;
    } catch (error) {
        console.error("[Pricing] Authentication Error Details:", {
            message: error.message,
            stack: error.stack,
            requestUrl: request.url,
            headers: Object.fromEntries(request.headers)
        });
        throw error;
    }
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

        // Map plan parameter to internal keys
        const requestedPlan = PLANS[plan] || PLANS.basic;
        const planKey = requestedPlan.key; // Example: 'basic_plan'

        try {
            console.log(`[Pricing] Action: subscribe, Original plan: ${plan}, Selected key: ${planKey}`);
            
            const url = new URL(request.url);
            // Force HTTPS for returnUrl as Shopify billing requires it
            const origin = url.origin.replace('http://', 'https://');
            const returnUrl = `${origin}/app/pricing?plan=${plan}`;

            console.log(`[Pricing] Calling billing.request with plan: ${planKey}, returnUrl: ${returnUrl}`);

            return await billing.request({
                plan: planKey,
                isTest: true,
                test: true,
                returnUrl,
            });
        } catch (error) {
            if (error instanceof Response) throw error;
            console.error("[Pricing] Billing request error:", error);
            if (error.stack) console.error("[Pricing] Error stack:", error.stack);
            
            // Try to extract as much info as possible
            const errorMessage = error.message || (typeof error === 'string' ? error : "Unknown billing error");
            
            return json({ 
                error: `Billing Error: ${errorMessage}`,
                details: error.response?.data || error.data || null
            }, { status: 400 });
        }
    }

    if (actionValue === "cancel") {
        try {
            await cancelSubscription(admin, shop);
            return json({ success: true, message: "Subscription cancelled successfully." });
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
        submit(formData, { method: "POST", action: `?${searchParams.toString()}` });
    };

    const handleCancel = () => {
        if (confirm("Are you sure you want to cancel your subscription?")) {
            const formData = new FormData();
            formData.append("action", "cancel");
            submit(formData, { method: "POST", action: `?${searchParams.toString()}` });
        }
    };

    const justUpgraded = searchParams.get("plan") && searchParams.get("charge_id");

    return (
        <Page backAction={{ url: "/app" }} title="Pricing Plans">
            <TitleBar title="Pricing Plans" />

            <Layout>
                <Layout.Section>
                    <BlockStack gap="400">
                        {actionData?.error && <Banner tone="critical"><p>{actionData.error}</p></Banner>}
                        {(actionData?.message || justUpgraded) && (
                            <Banner tone="success"><p>{actionData?.message || "🎉 Your plan has been activated successfully!"}</p></Banner>
                        )}

                        <Card>
                            <BlockStack gap="300">
                                <Text variant="headingMd">Current Usage</Text>
                                <InlineStack gap="200" align="space-between">
                                    <Text>
                                        <Text as="span" fontWeight="bold">{usageInfo.used}</Text>
                                        {usageInfo.limit === Infinity ? (
                                            <Text as="span" tone="subdued"> groups used (Unlimited)</Text>
                                        ) : (
                                            <Text as="span" tone="subdued"> / {usageInfo.limit} groups</Text>
                                        )}
                                    </Text>
                                    <Badge tone={usageInfo.plan === "premium" ? "success" : "info"}>
                                        {usageInfo.planName} Plan
                                    </Badge>
                                </InlineStack>
                                {usageInfo.limit !== Infinity && (
                                    <ProgressBar
                                        progress={usageInfo.percentage}
                                        tone={usageInfo.percentage >= 90 ? "critical" : "primary"}
                                    />
                                )}
                            </BlockStack>
                        </Card>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px' }}>
                            {/* Free */}
                            <Card>
                                <BlockStack gap="400">
                                    <BlockStack gap="100">
                                        <Text variant="headingLg">Free</Text>
                                        <Text variant="heading2xl">$0</Text>
                                        <Text tone="subdued">Forever free</Text>
                                    </BlockStack>
                                    <Divider />
                                    <BlockStack gap="200">
                                        <Text>✓ 1 product group</Text>
                                        <Text>✓ Create single-option groups</Text>
                                        <Text>✓ Show option on product card</Text>
                                        <Text>✓ Translations</Text>
                                    </BlockStack>
                                    <Button fullWidth disabled={usageInfo.plan === "free"} onClick={() => handleSubscribe("free")} loading={isSubmitting}>
                                        {usageInfo.plan === "free" ? "Current Plan" : "Downgrade"}
                                    </Button>
                                </BlockStack>
                            </Card>

                            {/* Basic */}
                            <Card>
                                <BlockStack gap="400">
                                    <BlockStack gap="100">
                                        <Text variant="headingLg">Basic</Text>
                                        <Text variant="heading2xl">$7.99</Text>
                                        <Text tone="subdued">per month</Text>
                                    </BlockStack>
                                    <Divider />
                                    <BlockStack gap="200">
                                        <Text>✓ 100 product groups</Text>
                                        <Text>✓ Create single-option groups</Text>
                                        <Text>✓ Import / export groups</Text>
                                        <Text>✓ Show option on product card</Text>
                                        <Text>✓ Translations</Text>
                                        <Text>✓ Auto-sync information</Text>
                                        <Text>✓ Title Pattern Automation</Text>
                                    </BlockStack>
                                    <Button fullWidth variant="primary" onClick={() => handleSubscribe("basic")} loading={isSubmitting} disabled={usageInfo.plan === "basic"}>
                                        {usageInfo.plan === "basic" ? "Current Plan" : "Select Plan"}
                                    </Button>
                                </BlockStack>
                            </Card>

                            {/* Advanced */}
                            <Card>
                                <div style={{ position: 'relative' }}>
                                    <div style={{ position: 'absolute', top: '-15px', right: '0' }}>
                                        <Badge tone="success">Most popular</Badge>
                                    </div>
                                    <BlockStack gap="400">
                                        <BlockStack gap="100">
                                            <Text variant="headingLg">Advanced</Text>
                                            <Text variant="heading2xl">$15.99</Text>
                                            <Text tone="subdued">per month</Text>
                                        </BlockStack>
                                        <Divider />
                                        <BlockStack gap="200">
                                            <Text>✓ 500 product groups</Text>
                                            <Text>✓ Multi-option groups</Text>
                                            <Text>✓ Subcategory groups</Text>
                                            <Text>✓ Featured product support</Text>
                                            <Text>✓ All automation features</Text>
                                            <Text>✓ Import / export / sync</Text>
                                        </BlockStack>
                                        <Button fullWidth variant="primary" onClick={() => handleSubscribe("advanced")} loading={isSubmitting} disabled={usageInfo.plan === "advanced"}>
                                            {usageInfo.plan === "advanced" ? "Current Plan" : "Select Plan"}
                                        </Button>
                                    </BlockStack>
                                </div>
                            </Card>

                            {/* Premium */}
                            <Card>
                                <BlockStack gap="400">
                                    <BlockStack gap="100">
                                        <Text variant="headingLg">Premium</Text>
                                        <Text variant="heading2xl">$35.99</Text>
                                        <Text tone="subdued">per month</Text>
                                    </BlockStack>
                                    <Divider />
                                    <BlockStack gap="200">
                                        <Text fontWeight="bold">✓ Unlimited product groups</Text>
                                        <Text>✓ Seamless product switching</Text>
                                        <Text>✓ Scheduled automation</Text>
                                        <Text>✓ Conditional swatch image</Text>
                                        <Text>✓ Manage groups via API</Text>
                                        <Text>✓ All Advanced features</Text>
                                    </BlockStack>
                                    <Button fullWidth variant="primary" onClick={() => handleSubscribe("premium")} loading={isSubmitting} disabled={usageInfo.plan === "premium"}>
                                        {usageInfo.plan === "premium" ? "Current Plan" : "Select Plan"}
                                    </Button>
                                </BlockStack>
                            </Card>
                        </div>

                        {usageInfo.plan !== "free" && (
                            <Card>
                                <InlineStack align="space-between">
                                    <Text>Need to downgrade? You can return to the Free plan anytime.</Text>
                                    <Button tone="critical" onClick={handleCancel}>Cancel Plan</Button>
                                </InlineStack>
                            </Card>
                        )}
                    </BlockStack>
                </Layout.Section>
            </Layout>
        </Page>
    );
}

import { useEffect } from "react";
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

    // Important: Get host from URL in loader since it's present on initial load
    const url = new URL(request.url);
    const host = url.searchParams.get("host");

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
        host, // Return host to frontend
        usageInfo,
        plans: PLANS,
    });
};

export const action = async ({ request }) => {
    const { authenticate } = await import("../shopify.server");
    const { cancelSubscription } = await import("../billing.server");

    const { admin, session } = await authenticate.admin(request);
    const formData = await request.formData();
    const actionValue = formData.get("action");
    const plan = formData.get("plan");
    const shop = formData.get("shop") || session.shop;
    const host = formData.get("host");

    console.log(`Action: ${actionValue}, Plan: ${plan}, Shop: ${shop}, Host: ${host}`);

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

        const requestedPlan = PLANS[plan] || PLANS.basic;
        const planKey = requestedPlan.key;

        try {
            const url = new URL(request.url);
            const origin = url.origin.replace('http://', 'https://');
            // Explicitly use the host and shop from formData to ensure it's never null
            const returnUrl = `${origin}/app/pricing?plan=${plan}&shop=${shop}&host=${host}`;
            
            console.log(`[Pricing] Requesting billing. ReturnUrl: ${returnUrl}`);

            const response = await admin.graphql(`
                mutation appSubscriptionCreate($name: String!, $lineItems: [AppSubscriptionLineItemInput!]!, $returnUrl: URL!, $test: Boolean) {
                    appSubscriptionCreate(name: $name, lineItems: $lineItems, returnUrl: $returnUrl, test: $test) {
                        userErrors {
                            field
                            message
                        }
                        confirmationUrl
                    }
                }
            `, {
                variables: {
                    name: planKey,
                    test: true,
                    returnUrl: returnUrl,
                    lineItems: [{
                        plan: {
                            appRecurringPricingDetails: {
                                price: {
                                    amount: requestedPlan.price,
                                    currencyCode: 'USD'
                                },
                                interval: 'EVERY_30_DAYS'
                            }
                        }
                    }]
                }
            });

            const responseJson = await response.json();
            
            if (responseJson.data?.appSubscriptionCreate?.userErrors?.length > 0) {
                const errorMsg = responseJson.data.appSubscriptionCreate.userErrors.map(e => e.message).join(", ");
                return json({ error: `Shopify Error: ${errorMsg}` }, { status: 400 });
            }

            const confirmationUrl = responseJson.data?.appSubscriptionCreate?.confirmationUrl;
            if (confirmationUrl) {
                return json({ confirmationUrl });
            }

            return json({ error: "Failed to create subscription confirmation URL." }, { status: 400 });
        } catch (error) {
            console.error("[Pricing] Manual GraphQL Error:", error);
            return json({ error: `System Error: ${error.message}` }, { status: 500 });
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
    const { usageInfo, shop, host } = useLoaderData();
    const actionData = useActionData();
    const submit = useSubmit();
    const navigation = useNavigation();
    const [searchParams] = useSearchParams();
    const isSubmitting = navigation.state === "submitting";
 
    useEffect(() => {
        if (actionData?.confirmationUrl) {
            if (typeof window !== "undefined") {
              if (window.shopify && window.shopify.navigation) {
                  window.shopify.navigation.utils.open(actionData.confirmationUrl, { target: "top" });
              } else {
                  window.top.location.href = actionData.confirmationUrl;
              }
            }
        }
    }, [actionData]);

    const handleSubscribe = async (planKey) => {
        const formData = new FormData();
        formData.append("action", "subscribe");
        formData.append("plan", planKey);
        formData.append("shop", shop);
        
        // Robust host detection
        let currentHost = host || searchParams.get("host");
        if (!currentHost && typeof window !== "undefined" && window.shopify?.config?.host) {
            currentHost = window.shopify.config.host;
        }
        formData.append("host", currentHost || ""); 
        
        let headers = {};
        try {
          if (typeof window !== "undefined" && window.shopify && window.shopify.idToken) {
            const idToken = await window.shopify.idToken();
            headers = { Authorization: `Bearer ${idToken}` };
          }
        } catch (e) {}

        submit(formData, { 
          method: "POST", 
          action: `?${searchParams.toString()}`,
          headers: headers
        });
    };
 
    const handleCancel = async () => {
        if (confirm("Are you sure you want to cancel your subscription?")) {
            const formData = new FormData();
            formData.append("action", "cancel");
            formData.append("shop", shop);
            
            let currentHost = host || searchParams.get("host");
            if (!currentHost && typeof window !== "undefined" && window.shopify?.config?.host) {
                currentHost = window.shopify.config.host;
            }
            formData.append("host", currentHost || "");

            let headers = {};
            try {
              if (typeof window !== "undefined" && window.shopify && window.shopify.idToken) {
                const idToken = await window.shopify.idToken();
                headers = { Authorization: `Bearer ${idToken}` };
              }
            } catch (e) {}

            submit(formData, { 
              method: "POST", 
              action: `?${searchParams.toString()}`,
              headers: headers
            });
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
                            <Banner tone="success"><p>{actionData?.message || "Your plan has been activated successfully!"}</p></Banner>
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
                            <div style={{ transform: 'scale(1)', transition: 'transform 0.2s' }}>
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
                            </div>

                            {/* Basic */}
                            <div style={{ transform: 'scale(1)', transition: 'transform 0.2s' }}>
                                <Card>
                                    <BlockStack gap="400">
                                        <BlockStack gap="100">
                                            <Text variant="headingLg">Basic</Text>
                                            <Text variant="heading2xl">$6.99</Text>
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
                            </div>

                            {/* Advanced */}
                            <div style={{ transform: 'scale(1.02)', transition: 'transform 0.2s', zIndex: 1 }}>
                                <Card>
                                    <div style={{ position: 'relative' }}>
                                        <div style={{ position: 'absolute', top: '-15px', right: '0' }}>
                                            <Badge tone="success">Most popular</Badge>
                                        </div>
                                        <BlockStack gap="400">
                                            <BlockStack gap="100">
                                                <Text variant="headingLg">Advanced</Text>
                                                <Text variant="heading2xl">$14.99</Text>
                                                <Text tone="subdued">per month</Text>
                                            </BlockStack>
                                            <Divider />
                                            <BlockStack gap="200">
                                                <Text>✓ 500 product groups</Text>
                                                <Text>✓ Custom swatch styles (Images, Pills)</Text>
                                                <Text>✓ Bulk group management (CSV)</Text>
                                                <Text>✓ Priority auto-sync updates</Text>
                                                <Text>✓ All automation features</Text>
                                                <Text>✓ Import / export / sync</Text>
                                                <Text>✓ Advanced search and filtering</Text>
                                                <Text fontWeight="bold" tone="info">✓ Includes all Basic features</Text>
                                            </BlockStack>
                                            <Button fullWidth variant="primary" onClick={() => handleSubscribe("advanced")} loading={isSubmitting} disabled={usageInfo.plan === "advanced"}>
                                                {usageInfo.plan === "advanced" ? "Current Plan" : "Select Plan"}
                                            </Button>
                                        </BlockStack>
                                    </div>
                                </Card>
                            </div>

                            {/* Premium */}
                            <div style={{ 
                                scale: '1.05', 
                                border: '2px solid #5c6ac4', 
                                borderRadius: '12px', 
                                boxShadow: '0 4px 12px rgba(92, 106, 196, 0.2)',
                                overflow: 'hidden',
                                transition: 'all 0.3s ease'
                            }}>
                                <Card>
                                    <div style={{ position: 'relative' }}>
                                        <div style={{ position: 'absolute', top: '-15px', right: '0' }}>
                                            <Badge tone="attention">Best Value</Badge>
                                        </div>
                                        <BlockStack gap="400">
                                            <BlockStack gap="100">
                                                <Text variant="headingLg">Premium</Text>
                                                <Text variant="heading2xl" tone="primary">$34.99</Text>
                                                <Text tone="subdued">per month</Text>
                                            </BlockStack>
                                            <Divider />
                                            <BlockStack gap="200">
                                                <Text fontWeight="bold">✓ Unlimited product groups</Text>
                                                <Text>✓ Seamless product switching (Hot-swap)</Text>
                                                <Text>✓ Custom CSS support for full design</Text>
                                                <Text>✓ Premium Layout options (Carousel, Grid)</Text>
                                                <Text>✓ 24/7 Priority Support</Text>
                                                <Text>✓ Advanced custom styling options</Text>
                                                <Text>✓ White-labeling options</Text>
                                                <Text fontWeight="bold" tone="success">✓ Includes all Advanced features</Text>
                                            </BlockStack>
                                            <Button 
                                                fullWidth 
                                                variant="primary" 
                                                size="large"
                                                onClick={() => handleSubscribe("premium")} 
                                                loading={isSubmitting} 
                                                disabled={usageInfo.plan === "premium"}
                                            >
                                                {usageInfo.plan === "premium" ? "Current Plan" : "Select Premium"}
                                            </Button>
                                        </BlockStack>
                                    </div>
                                </Card>
                            </div>
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

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
    Icon,
    Box,
} from "@shopify/polaris";
import { CheckIcon, InfoIcon } from "@shopify/polaris-icons";
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
                const { cancelSubscription } = await import("../billing.server");
                await cancelSubscription(admin, shop);
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
    const isSubmitting = navigation.state !== "idle" && navigation.formData?.get("action") === "subscribe";
    const justUpgraded = searchParams.get("upgraded") === "true";
 
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



    const FeatureItem = ({ text, secondary = false, isDark = false }) => (
        <InlineStack gap="200" align="start" blockAlign="start">
            <div style={{
                marginTop: '2px',
                padding: '2px',
                borderRadius: '50%',
                backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(92, 106, 196, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
            }}>
                <Icon source={CheckIcon} tone={isDark ? "info" : "primary"} size="small" />
            </div>
            <div style={{ flex: 1 }}>
                <Text variant="bodyMd" tone={isDark ? "base" : (secondary ? "subdued" : "base")}>
                    {text}
                </Text>
            </div>
        </InlineStack>
    );

    return (
        <Page fullWidth>
            <style>{`
                .pricing-card {
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    height: 100%;
                    display: flex;
                    flex-direction: column;
                    border-radius: 20px;
                    border: 1px solid #e1e3e5;
                    background: white;
                    padding: 32px;
                    cursor: default;
                }
                .pricing-card:hover {
                    transform: translateY(-8px);
                    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
                }
                .pricing-card.featured {
                    border: 2px solid #5c6ac4;
                    position: relative;
                }
                .pricing-card.premium {
                    background: linear-gradient(145deg, #1a1c23 0%, #2d313e 100%);
                    color: white;
                    border: none;
                }
                .pricing-card.premium p, .pricing-card.premium span, .pricing-card.premium h2 {
                    color: white !important;
                }
                .premium-glow {
                    position: relative;
                }
                .premium-glow::before {
                    content: '';
                    position: absolute;
                    top: -2px; left: -2px; right: -2px; bottom: -2px;
                    background: linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%);
                    z-index: -1;
                    border-radius: 22px;
                    opacity: 0.6;
                }
                .feature-list {
                    margin-top: 24px;
                    margin-bottom: 32px;
                    flex: 1;
                }
                .price-text {
                    font-size: 40px;
                    font-weight: 800;
                    letter-spacing: -0.02em;
                }
                .plan-header {
                    text-align: center;
                    margin-bottom: 48px;
                    padding-top: 24px;
                }
            `}</style>
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
                                        {usageInfo.planName.includes("Plan") ? usageInfo.planName : `${usageInfo.planName} Plan`}
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

                        <div className="plan-header">
                            <BlockStack gap="200">
                                <Text variant="heading3xl" as="h1">Choose the perfect plan for your business</Text>
                                <Text variant="bodyLg" tone="subdued">Scale your variant linking and automation as your store grows.</Text>
                            </BlockStack>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '24px', alignItems: 'stretch', padding: '0 10px 40px 10px' }}>
                            {/* Free */}
                            <div className="pricing-card">
                                <BlockStack gap="400" flex="1">
                                    <BlockStack gap="100">
                                        <Text variant="headingLg">Free</Text>
                                        <div className="price-text">$0</div>
                                        <Text tone="subdued">Forever free</Text>
                                    </BlockStack>
                                    <Divider />
                                    <div className="feature-list">
                                        <BlockStack gap="300">
                                            <FeatureItem text="1 product group limit" />
                                            <FeatureItem text="Single-option grouping" />
                                            <div style={{ paddingLeft: '32px' }}>
                                                <FeatureItem text="All Swatch Styles included" secondary />
                                                <FeatureItem text="All Display Layouts included" secondary />
                                            </div>
                                            <FeatureItem text="Product card swatches" />
                                            <FeatureItem text="Localized labels" />
                                        </BlockStack>
                                    </div>
                                    <Button fullWidth onClick={() => handleSubscribe("free")} loading={isSubmitting} disabled={usageInfo.plan === "free"}>
                                        {usageInfo.plan === "free" ? "Active" : "Downgrade"}
                                    </Button>
                                </BlockStack>
                            </div>

                            {/* Basic */}
                            <div className="pricing-card featured">
                                <BlockStack gap="400" flex="1">
                                    <BlockStack gap="100">
                                        <Text variant="headingLg">Basic</Text>
                                        <div className="price-text">$6.99</div>
                                        <Text tone="subdued">per month</Text>
                                    </BlockStack>
                                    <Divider />
                                    <div className="feature-list">
                                        <BlockStack gap="300">
                                            <FeatureItem text="100 product groups limit" />
                                            <FeatureItem text="CSV Import & Export" />
                                            <FeatureItem text="Automatic Metafield Sync" />
                                            <FeatureItem text="Basic Automation rules" />
                                            <div style={{ marginTop: '8px' }}>
                                                <Text fontWeight="semibold" tone="info" variant="bodySm">Includes all Free features</Text>
                                            </div>
                                        </BlockStack>
                                    </div>
                                    <Button fullWidth variant="primary" onClick={() => handleSubscribe("basic")} loading={isSubmitting} disabled={usageInfo.plan === "basic"}>
                                        {usageInfo.plan === "basic" ? "Active" : "Select Basic"}
                                    </Button>
                                </BlockStack>
                            </div>

                            {/* Advanced */}
                            <div className="pricing-card" style={{ border: '2px solid #9c6ade' }}>
                                <div style={{ position: 'absolute', top: '-12px', left: '50%', transform: 'translateX(-50%)' }}>
                                    <Badge tone="success">Most Popular</Badge>
                                </div>
                                <BlockStack gap="400" flex="1">
                                    <BlockStack gap="100">
                                        <Text variant="headingLg">Advanced</Text>
                                        <div className="price-text" style={{ color: '#9c6ade' }}>$14.99</div>
                                        <Text tone="subdued">per month</Text>
                                    </BlockStack>
                                    <Divider />
                                    <div className="feature-list">
                                        <BlockStack gap="300">
                                            <FeatureItem text="500 product groups limit" />
                                            <FeatureItem text="Regex Batch Automation" />
                                            <FeatureItem text="Priority Metafield Sync" />
                                            <FeatureItem text="Priority Developer Support" />
                                            <div style={{ marginTop: '8px' }}>
                                                <Text fontWeight="semibold" tone="info" variant="bodySm">Includes all Basic features</Text>
                                            </div>
                                        </BlockStack>
                                    </div>
                                    <Button fullWidth variant="primary" onClick={() => handleSubscribe("advanced")} loading={isSubmitting} disabled={usageInfo.plan === "advanced"}>
                                        {usageInfo.plan === "advanced" ? "Active" : "Go Advanced"}
                                    </Button>
                                </BlockStack>
                            </div>

                            {/* Premium */}
                            <div className="premium-glow">
                                <div className="pricing-card premium">
                                    <div style={{ position: 'absolute', top: '12px', right: '12px' }}>
                                        <Badge tone="attention">Ultimate</Badge>
                                    </div>
                                    <BlockStack gap="400" flex="1">
                                        <BlockStack gap="100">
                                            <Text variant="headingLg">Premium</Text>
                                            <div className="price-text" style={{ color: '#ffc96b' }}>$34.99</div>
                                            <Text tone="subdued">per month</Text>
                                        </BlockStack>
                                        <Divider />
                                        <div className="feature-list">
                                            <BlockStack gap="300">
                                                <FeatureItem text="Unlimited product groups" isDark />
                                                <FeatureItem text="Hot-swap Variant Switching" isDark />
                                                <FeatureItem text="Custom CSS (Global & Page)" isDark />
                                                <FeatureItem text="Premium Support Chat" isDark />
                                                <div style={{ marginTop: '8px' }}>
                                                    <Text fontWeight="semibold" tone="success" variant="bodySm">Ultimate Power & Scale</Text>
                                                </div>
                                            </BlockStack>
                                        </div>
                                        <Button 
                                            fullWidth 
                                            size="large"
                                            onClick={() => handleSubscribe("premium")} 
                                            loading={isSubmitting} 
                                            disabled={usageInfo.plan === "premium"}
                                        >
                                            {usageInfo.plan === "premium" ? "Active" : "Select Premium"}
                                        </Button>
                                    </BlockStack>
                                </div>
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

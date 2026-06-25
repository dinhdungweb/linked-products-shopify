import { useEffect } from "react";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation, useSearchParams, useActionData } from "@remix-run/react";
import {
    Page,
    Card,
    BlockStack,
    Text,
    Badge,
    Divider,
    ProgressBar,
    Button,
    InlineStack,
    InlineGrid,
    Icon,
} from "@shopify/polaris";
import {
    CashDollarIcon,
    ChartDonutIcon,
    CheckIcon,
    CreditCardIcon,
    ProductListIcon,
    StarFilledIcon,
} from "@shopify/polaris-icons";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import { PLANS } from "../billing.config";

const PLAN_ORDER = ["free", "basic", "advanced", "premium"];

const PLAN_DETAILS = {
    free: {
        eyebrow: "For first setup",
        description: "Validate linked product groups with every storefront display style included.",
        features: [
            "1 product group",
            "Product page options",
            "Product card options",
            "All swatch and button styles",
        ],
    },
    basic: {
        eyebrow: "For growing catalogs",
        description: "Create more groups and manage bulk setup with CSV import and export.",
        features: [
            "100 product groups",
            "CSV import and export",
            "Basic automation rules",
            "Automatic metafield sync",
        ],
    },
    advanced: {
        eyebrow: "Recommended",
        description: "Scale larger catalogs with stronger automation and priority sync.",
        features: [
            "500 product groups",
            "Batch automation with detection rules",
            "Priority data synchronization",
            "Priority developer support",
        ],
    },
    premium: {
        eyebrow: "For high-volume stores",
        description: "Remove group limits and unlock the highest support tier for larger teams.",
        features: [
            "Unlimited product groups",
            "Hot-swap product switching",
            "Custom CSS support",
            "Live chat support dashboard",
        ],
    },
};

function getPlanName(plan) {
    return plan.name.replace(" Plan", "");
}

function isUnlimitedLimit(limit, planKey) {
    return limit === Infinity || (limit == null && planKey === "premium");
}

function getLimitLabel(planKey, limit) {
    if (isUnlimitedLimit(limit, planKey)) return "Unlimited";
    return `${limit} ${limit === 1 ? "group" : "groups"}`;
}

function getUsageProgress(usageInfo) {
    if (isUnlimitedLimit(usageInfo.limit, usageInfo.plan)) return 0;
    if (!usageInfo.limit) return 0;
    return Math.min(100, Math.max(0, usageInfo.percentage || 0));
}

function FeatureItem({ children }) {
    return (
        <InlineStack gap="200" blockAlign="start" wrap={false}>
            <div style={{
                width: "20px",
                height: "20px",
                borderRadius: "6px",
                backgroundColor: "#EAF8F0",
                color: "#008060",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                marginTop: "1px",
            }}>
                <Icon source={CheckIcon} tone="success" />
            </div>
            <Text as="p" variant="bodyMd">{children}</Text>
        </InlineStack>
    );
}

function MetricCard({ icon, label, value, helpText, tone = "#2C6ECB" }) {
    return (
        <Card padding="400">
            <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center" wrap={false}>
                    <Text as="p" variant="bodySm" tone="subdued">{label}</Text>
                    <div style={{
                        width: "36px",
                        height: "36px",
                        borderRadius: "10px",
                        backgroundColor: "#F4F6F8",
                        color: tone,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                    }}>
                        <Icon source={icon} tone="inherit" />
                    </div>
                </InlineStack>
                <BlockStack gap="100">
                    <Text as="p" variant="headingLg">{value}</Text>
                    <Text as="p" variant="bodySm" tone="subdued">{helpText}</Text>
                </BlockStack>
            </BlockStack>
        </Card>
    );
}

function PlanCard({ planKey, plan, usageInfo, isSubmitting, onSubscribe }) {
    const currentPlanIndex = PLAN_ORDER.indexOf(usageInfo.plan);
    const targetPlanIndex = PLAN_ORDER.indexOf(planKey);
    const isCurrent = usageInfo.plan === planKey;
    const isPopular = planKey === "advanced";
    const planName = getPlanName(plan);
    const isDowngrade = targetPlanIndex < currentPlanIndex;
    const buttonLabel = isCurrent
        ? "Current plan"
        : planKey === "free"
            ? "Downgrade to free"
            : isDowngrade
                ? `Switch to ${planName}`
                : `Upgrade to ${planName}`;

    return (
        <div style={{
            width: "100%",
            minHeight: "518px",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            gap: "18px",
            backgroundColor: "#FFFFFF",
            border: "1px solid #E3E3E3",
            borderRadius: "12px",
            padding: "20px",
            boxShadow: "0 1px 2px rgba(0, 0, 0, 0.04)",
        }}>
            <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="start" wrap={false}>
                    <BlockStack gap="100">
                        <Text as="h2" variant="headingLg">{planName}</Text>
                        <Text as="p" variant="bodySm" tone="subdued">{PLAN_DETAILS[planKey].eyebrow}</Text>
                    </BlockStack>
                    {isCurrent ? (
                        <Badge tone="success">Current</Badge>
                    ) : isPopular ? (
                        <Badge tone="info">Popular</Badge>
                    ) : null}
                </InlineStack>

                <BlockStack gap="100">
                    <InlineStack gap="100" blockAlign="end">
                        <Text as="p" variant="heading2xl">${plan.price}</Text>
                        {plan.price > 0 && <Text as="p" tone="subdued">/ month</Text>}
                    </InlineStack>
                    <Text as="p" variant="bodySm" tone="subdued">
                        {plan.price === 0 ? "Forever free" : "Billed every 30 days"}
                    </Text>
                    {plan.price > 0 && (
                        <Text as="p" variant="bodySm" tone="success">
                            Includes 3-day free trial
                        </Text>
                    )}
                </BlockStack>

                <Text as="p" variant="bodyMd" tone="subdued">
                    {PLAN_DETAILS[planKey].description}
                </Text>
            </BlockStack>

            <div style={{
                border: "1px solid #E3E3E3",
                borderRadius: "10px",
                padding: "12px",
                backgroundColor: isPopular ? "#F1F8FF" : "#FAFAFA",
            }}>
                <BlockStack gap="100">
                    <Text as="p" variant="bodySm" tone="subdued">Group capacity</Text>
                    <Text as="p" variant="headingMd">{getLimitLabel(planKey, plan.groupLimit)}</Text>
                </BlockStack>
            </div>

            <Divider />

            <BlockStack gap="300">
                {PLAN_DETAILS[planKey].features.map((feature) => (
                    <FeatureItem key={feature}>{feature}</FeatureItem>
                ))}
            </BlockStack>

            <div style={{ marginTop: "auto", paddingTop: "8px" }}>
                <Button
                    fullWidth
                    variant={isCurrent ? undefined : "primary"}
                    disabled={isCurrent}
                    loading={isSubmitting}
                    onClick={() => onSubscribe(planKey)}
                >
                    {buttonLabel}
                </Button>
            </div>
        </div>
    );
}

export const loader = async ({ request }) => {
    const { authenticate } = await import("../shopify.server");
    const { getUsageInfo, confirmSubscription, isBillingTestMode } = await import("../billing.server");

    const url = new URL(request.url);
    const host = url.searchParams.get("host");

    const { admin, session, billing } = await authenticate.admin(request);
    const shop = session.shop;

    let usageInfo = await getUsageInfo(shop);

    try {
        const response = await admin.graphql(`
            query {
                currentAppInstallation {
                    activeSubscriptions {
                        id
                        name
                        status
                        test
                    }
                }
            }
        `);
        const result = await response.json();
        const activeSubscriptions = result.data?.currentAppInstallation?.activeSubscriptions || [];
        const activeSub = activeSubscriptions.find(sub => sub.status === "ACTIVE");

        const currentKnownPlan = usageInfo.plan || "free";

        if (activeSub) {
            let planKey = "free";

            const subName = activeSub.name;
            if (subName.includes("Premium") || subName === PLANS.premium.key) planKey = "premium";
            else if (subName.includes("Advanced") || subName === PLANS.advanced.key) planKey = "advanced";
            else if (subName.includes("Basic") || subName === PLANS.basic.key) planKey = "basic";

            if (planKey !== currentKnownPlan) {
                await confirmSubscription(admin, shop, planKey, activeSub);
                usageInfo = await getUsageInfo(shop);
            }
        } else if (currentKnownPlan !== "free") {
            await confirmSubscription(admin, shop, "free", null);
            usageInfo = await getUsageInfo(shop);
        }
    } catch (billingError) {
        console.warn("[Pricing Loader] Billing sync skipped:", billingError.message);
    }

    return json({
        shop,
        host,
        usageInfo,
    });
};

export const action = async ({ request }) => {
    const { authenticate } = await import("../shopify.server");
    const { cancelSubscription, isBillingTestMode } = await import("../billing.server");

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
            const origin = url.origin.replace("http://", "https://");
            const returnUrl = `${origin}/app/pricing?plan=${plan}&shop=${shop}&host=${host}`;

            console.log(`[Pricing] Requesting billing. ReturnUrl: ${returnUrl}`);

            const response = await admin.graphql(`
                mutation appSubscriptionCreate($name: String!, $lineItems: [AppSubscriptionLineItemInput!]!, $returnUrl: URL!, $test: Boolean, $trialDays: Int, $replacementBehavior: AppSubscriptionReplacementBehavior) {
                    appSubscriptionCreate(name: $name, lineItems: $lineItems, returnUrl: $returnUrl, test: $test, trialDays: $trialDays, replacementBehavior: $replacementBehavior) {
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
                    test: isBillingTestMode(),
                    returnUrl: returnUrl,
                    trialDays: 3,
                    replacementBehavior: "APPLY_IMMEDIATELY",
                    lineItems: [{
                        plan: {
                            appRecurringPricingDetails: {
                                price: {
                                    amount: requestedPlan.price,
                                    currencyCode: "USD",
                                },
                                interval: "EVERY_30_DAYS",
                            },
                        },
                    }],
                },
            });

            const responseJson = await response.json();

            if (responseJson.data?.appSubscriptionCreate?.userErrors?.length > 0) {
                const errorMsg = responseJson.data.appSubscriptionCreate.userErrors.map((e) => e.message).join(", ");
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
    const shopify = useAppBridge();
    const [searchParams] = useSearchParams();
    const isSubmitting = navigation.state !== "idle" && navigation.formData?.get("action") === "subscribe";
    const isCancelling = navigation.state !== "idle" && navigation.formData?.get("action") === "cancel";
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

    useEffect(() => {
        if (actionData?.error) {
            shopify.toast.show(actionData.error, { isError: true });
        } else if (actionData?.message) {
            shopify.toast.show(actionData.message);
        } else if (justUpgraded) {
            shopify.toast.show("Your plan has been activated successfully");
        }
    }, [actionData, justUpgraded, shopify]);

    const getIdTokenHeaders = async () => {
        try {
            if (typeof window !== "undefined" && window.shopify && window.shopify.idToken) {
                const idToken = await window.shopify.idToken();
                return { Authorization: `Bearer ${idToken}` };
            }
        } catch (error) {
            console.warn("[Pricing] Unable to attach ID token:", error?.message);
        }

        return {};
    };

    const getCurrentHost = () => {
        let currentHost = host || searchParams.get("host");
        if (!currentHost && typeof window !== "undefined" && window.shopify?.config?.host) {
            currentHost = window.shopify.config.host;
        }
        return currentHost || "";
    };

    const handleSubscribe = async (planKey) => {
        const formData = new FormData();
        formData.append("action", "subscribe");
        formData.append("plan", planKey);
        formData.append("shop", shop);
        formData.append("host", getCurrentHost());

        submit(formData, {
            method: "POST",
            action: `?${searchParams.toString()}`,
            headers: await getIdTokenHeaders(),
        });
    };

    const handleCancel = async () => {
        if (confirm("Are you sure you want to cancel your subscription?")) {
            const formData = new FormData();
            formData.append("action", "cancel");
            formData.append("shop", shop);
            formData.append("host", getCurrentHost());

            submit(formData, {
                method: "POST",
                action: `?${searchParams.toString()}`,
                headers: await getIdTokenHeaders(),
            });
        }
    };

    const currentPlan = PLANS[usageInfo.plan] || PLANS.free;
    const currentPlanName = getPlanName(currentPlan);
    const usageProgress = getUsageProgress(usageInfo);
    const isUnlimited = isUnlimitedLimit(usageInfo.limit, usageInfo.plan);
    const usageLimitLabel = getLimitLabel(usageInfo.plan, usageInfo.limit);
    const remainingGroups = isUnlimited ? "Unlimited" : Math.max(0, (usageInfo.limit || 0) - (usageInfo.used || 0));
    const isLimitReached = !isUnlimited && (usageInfo.used || 0) >= (usageInfo.limit || 0);
    const usageTone = isLimitReached ? "critical" : usageProgress >= 80 ? "warning" : "primary";

    return (
        <Page fullWidth>
            <TitleBar title="Billing" />

            <div style={{ maxWidth: "1180px", margin: "0 auto", padding: "18px 0 40px" }}>
                <BlockStack gap="500">
                    <div style={{
                        backgroundColor: "#FFFFFF",
                        border: "1px solid #E3E3E3",
                        borderRadius: "14px",
                        padding: "24px",
                        boxShadow: "0 1px 2px rgba(0, 0, 0, 0.04)",
                    }}>
                        <InlineStack align="space-between" blockAlign="start" gap="500">
                            <BlockStack gap="300">
                                <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", flexWrap: "wrap", alignSelf: "flex-start" }}>
                                    <Badge tone="info">{currentPlanName} plan</Badge>
                                    {isLimitReached && <Badge tone="critical">Limit reached</Badge>}
                                </div>
                                <BlockStack gap="150">
                                    <Text variant="heading2xl" as="h1">Billing and plans</Text>
                                    <Text variant="bodyMd" tone="subdued">
                                        Choose how many linked product groups your store can keep active.
                                    </Text>
                                </BlockStack>
                            </BlockStack>
                            <InlineStack gap="300" wrap={false}>
                                <Button url="/app/groups">Manage groups</Button>
                                <Button variant="primary" url="/app/support">Contact support</Button>
                            </InlineStack>
                        </InlineStack>
                    </div>

                    <InlineGrid columns={{ xs: 1, sm: 2, md: 3 }} gap="400">
                        <MetricCard
                            icon={CreditCardIcon}
                            label="Current plan"
                            value={currentPlanName}
                            helpText={currentPlan.price === 0 ? "Free plan active" : `$${currentPlan.price} every 30 days`}
                            tone="#2C6ECB"
                        />
                        <MetricCard
                            icon={ProductListIcon}
                            label="Group usage"
                            value={`${usageInfo.used || 0} / ${usageLimitLabel}`}
                            helpText={isLimitReached ? "Plan limit reached" : "Active product groups"}
                            tone={isLimitReached ? "#D82C0D" : "#008060"}
                        />
                        <MetricCard
                            icon={ChartDonutIcon}
                            label="Remaining"
                            value={isUnlimited ? "Unlimited" : `${remainingGroups}`}
                            helpText={isUnlimited ? "No group cap on this plan" : `${remainingGroups} groups available`}
                            tone="#8A6116"
                        />
                    </InlineGrid>

                    <Card padding="500">
                        <BlockStack gap="300">
                            <InlineStack align="space-between" blockAlign="center">
                                <BlockStack gap="100">
                                    <Text variant="headingMd" as="h2">Usage overview</Text>
                                    <Text variant="bodySm" tone="subdued">
                                        Product groups beyond your plan limit are paused on the storefront until you upgrade or reduce usage.
                                    </Text>
                                </BlockStack>
                                <Badge tone={isLimitReached ? "critical" : "success"}>
                                    {isLimitReached ? "Action needed" : "Within limit"}
                                </Badge>
                            </InlineStack>
                            {!isUnlimited && (
                                <ProgressBar
                                    progress={usageProgress}
                                    tone={usageTone}
                                    size="small"
                                />
                            )}
                        </BlockStack>
                    </Card>

                    <BlockStack gap="300">
                        <InlineStack align="space-between" blockAlign="end">
                            <BlockStack gap="100">
                                <Text variant="headingLg" as="h2">Plans</Text>
                                <Text variant="bodySm" tone="subdued">
                                    Upgrade when your catalog needs more active linked product groups.
                                </Text>
                            </BlockStack>
                            <InlineStack gap="100" blockAlign="center">
                                <Icon source={CashDollarIcon} tone="subdued" />
                                <Text variant="bodySm" tone="subdued">Monthly billing in USD</Text>
                            </InlineStack>
                        </InlineStack>

                        <InlineGrid columns={{ xs: 1, sm: 2, md: 4 }} gap="400">
                            {PLAN_ORDER.map((planKey) => (
                                <PlanCard
                                    key={planKey}
                                    planKey={planKey}
                                    plan={PLANS[planKey]}
                                    usageInfo={usageInfo}
                                    isSubmitting={isSubmitting}
                                    onSubscribe={handleSubscribe}
                                />
                            ))}
                        </InlineGrid>
                    </BlockStack>

                    <InlineGrid columns={{ xs: 1, md: usageInfo.plan !== "free" ? 2 : 1 }} gap="400">
                        <Card padding="500">
                            <div style={{ display: "flex", alignItems: "flex-start", gap: "14px" }}>
                                <div style={{
                                    width: "36px",
                                    height: "36px",
                                    borderRadius: "10px",
                                    backgroundColor: "#EAF8F0",
                                    color: "#008060",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    flexShrink: 0,
                                }}>
                                    <Icon source={StarFilledIcon} tone="inherit" />
                                </div>
                                <BlockStack gap="100">
                                    <Text variant="headingMd" as="h2">All plans include storefront styling</Text>
                                    <Text variant="bodyMd" tone="subdued">
                                        Color swatches, image swatches, dropdowns, buttons, product page settings, and product card settings remain available on every plan.
                                    </Text>
                                </BlockStack>
                            </div>
                        </Card>

                        {usageInfo.plan !== "free" && (
                            <Card padding="500">
                                <InlineStack align="space-between" blockAlign="center" gap="400">
                                    <BlockStack gap="100">
                                        <Text variant="headingMd" as="h2">Need to downgrade?</Text>
                                        <Text variant="bodyMd" tone="subdued">
                                            You can return to the Free plan anytime. Your groups remain in admin, but only the free limit stays active.
                                        </Text>
                                    </BlockStack>
                                    <Button tone="critical" onClick={handleCancel} loading={isCancelling}>Cancel plan</Button>
                                </InlineStack>
                            </Card>
                        )}
                    </InlineGrid>
                </BlockStack>
            </div>
        </Page>
    );
}

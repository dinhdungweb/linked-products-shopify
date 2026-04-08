// Plan definitions - Shared between server and client
export const PLANS = {
    free: {
        name: "Free",
        key: "free_plan",
        price: 0,
        groupLimit: 1,
        interval: null,
    },
    basic: {
        name: "Basic Plan",
        key: "basic-plan",
        price: 7.99,
        groupLimit: 100,
        interval: "EVERY_30_DAYS",
    },
    advanced: {
        name: "Advanced Plan",
        key: "advanced-plan",
        price: 15.99,
        groupLimit: 500,
        interval: "EVERY_30_DAYS",
    },
    premium: {
        name: "Premium Plan",
        key: "premium-plan",
        price: 35.99,
        groupLimit: Infinity,
        interval: "EVERY_30_DAYS",
    },
};

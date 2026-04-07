// Plan definitions - Shared between server and client
export const PLANS = {
    free: {
        name: "Free",
        price: 0,
        groupLimit: 1,
        interval: null,
    },
    basic: {
        name: "Basic",
        price: 7.99,
        groupLimit: 100,
        interval: "EVERY_30_DAYS",
    },
    advanced: {
        name: "Advanced",
        price: 15.99,
        groupLimit: 500,
        interval: "EVERY_30_DAYS",
    },
    premium: {
        name: "Premium",
        price: 35.99,
        groupLimit: Infinity,
        interval: "EVERY_30_DAYS",
    },
};

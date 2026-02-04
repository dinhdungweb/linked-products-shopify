// Plan definitions - Shared between server and client
export const PLANS = {
    free: {
        name: "Free",
        price: 0,
        linkLimit: 100,
        interval: null,
    },
    basic: {
        name: "Basic",
        price: 3.99,
        linkLimit: 500,
        interval: "EVERY_30_DAYS",
    },
    pro: {
        name: "Pro",
        price: 6.99,
        linkLimit: Infinity,
        interval: "EVERY_30_DAYS",
    },
};

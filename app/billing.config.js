// Plan definitions - Shared between server and client
export const PLANS = {
    free: {
        name: "Free",
        key: "free",
        price: 0,
        groupLimit: 1,
        interval: null,
    },
    basic: {
        name: "Monthly Basic Plan",
        key: "Monthly Basic Plan",
        price: 7.99,
        groupLimit: 100,
        interval: "EVERY_30_DAYS",
    },
    advanced: {
        name: "Monthly Advanced Plan",
        key: "Monthly Advanced Plan",
        price: 15.99,
        groupLimit: 500,
        interval: "EVERY_30_DAYS",
    },
    premium: {
        name: "Monthly Premium Plan",
        key: "Monthly Premium Plan",
        price: 35.99,
        groupLimit: Infinity,
        interval: "EVERY_30_DAYS",
    },
};

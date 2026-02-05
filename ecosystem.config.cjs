module.exports = {
    apps: [
        {
            name: "variants-linked-products",
            script: "npm",
            args: "run start",
            env: {
                NODE_ENV: "production",
                // PORT: 3000 // Uncomment if you want to force a specific port here, otherwise it takes from .env
            },
            watch: false,
            autorestart: true,
            max_memory_restart: '1G',
            error_file: './logs/err.log',
            out_file: './logs/out.log',
            log_date_format: 'YYYY-MM-DD HH:mm:ss'
        },
    ],
};

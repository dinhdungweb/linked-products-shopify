module.exports = {
    apps: [
        {
            name: "variants-linked-products",
            script: "npm",
            args: "run start",
            env: {
                NODE_ENV: "production",
                PORT: 3001,
            },
            watch: false,
            autorestart: true,
            max_memory_restart: '1G',
            error_file: './logs/err.log',
            out_file: './logs/out.log',
            log_date_format: 'YYYY-MM-DD HH:mm:ss'
        },
        {
            name: "variants-linked-products-sync-worker",
            script: "npm",
            args: "run worker:sync",
            env: {
                NODE_ENV: "production",
            },
            watch: false,
            autorestart: true,
            max_memory_restart: '512M',
            error_file: './logs/worker-err.log',
            out_file: './logs/worker-out.log',
            log_date_format: 'YYYY-MM-DD HH:mm:ss'
        },
    ],
};

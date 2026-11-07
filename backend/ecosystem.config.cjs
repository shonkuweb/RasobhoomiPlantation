module.exports = {
    apps: [{
        name: 'ecommerce-app',
        cwd: __dirname,
        script: 'server.js',
        // LocalAuth and the persistent outbox must have one owning process.
        instances: 1,
        exec_mode: 'fork',
        env: {
            NODE_ENV: 'development',
            DB_TYPE: 'sqlite'
        },
        env_production: {
            NODE_ENV: 'production',
            DB_TYPE: 'postgres',
            // Ensure DATABASE_URL and PHONEPE keys are set in the environment or here
        }
    }]
};

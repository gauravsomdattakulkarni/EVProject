module.exports = {
  apps: [
    {
      name: "satmat-ev",
      script: "server.ts",
      interpreter: "tsx",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "500M",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
        APP_URL: "https://evcharger.satmatgroup.com"
      }
    }
  ]
};

module.exports = {
  apps: [
    {
      name: "ling-frontend",
      script: "serve",
      env: {
        PM2_SERVE_PATH: "dist",
        PM2_SERVE_PORT: 3001,
        PM2_SERVE_SPA: "true",
        NO_UPDATE_NOTIFIER: "1",
      },
      // Prevent tight restart loops when port is still occupied
      kill_timeout: 3000, // 3s for old process to release port
      restart_delay: 2000, // 2s pause before restarting
      max_restarts: 10, // cap restarts within min_uptime window
      min_uptime: 5000, // process must live 5s+ to reset restart counter
      // Logging
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      merge_logs: true,
    },
  ],
};

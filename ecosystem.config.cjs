module.exports = {
  apps: [{
    name: "smailpro-inbox",
    script: "./server/dist/index.js",
    cwd: __dirname,
    instances: 1,
    autorestart: true,
    max_memory_restart: "600M",
    env: {
      NODE_ENV: "production"
    }
  }]
};

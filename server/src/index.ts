import { app } from "./app.js";
import { config } from "./config.js";
import { prisma } from "./db.js";
import { startAutoForwardScheduler, stopAutoForwardScheduler } from "./services/scheduler.js";

const server = app.listen(config.PORT, config.HOST, () => {
  console.log(`SmailPro Inbox listening on http://${config.HOST}:${config.PORT}`);
  startAutoForwardScheduler();
});

const shutdown = async () => {
  stopAutoForwardScheduler();
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

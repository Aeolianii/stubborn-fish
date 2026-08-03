import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";

async function start(): Promise<void> {
  const config = loadConfig();
  const app = await buildApp({
    config,
    logger: true,
    publicDirectory: process.cwd()
  });

  const close = async (): Promise<void> => {
    await app.close();
    process.exit(0);
  };

  process.once("SIGINT", () => {
    void close();
  });
  process.once("SIGTERM", () => {
    void close();
  });

  await app.listen(config.server);
}

start().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : "服务启动失败"
  );
  process.exit(1);
});

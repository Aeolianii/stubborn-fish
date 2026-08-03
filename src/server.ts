import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const app = await buildApp({ config, logger: true });

  await app.listen({
    host: config.server.host,
    port: config.server.port
  });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

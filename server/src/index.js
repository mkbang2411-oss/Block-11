import { config } from "./config.js";
import { createStorage, initWithRetry } from "./storage/index.js";
import { createApp } from "./app.js";
import { runCleanup } from "./photoService.js";

const storage = createStorage();
await initWithRetry(storage); // chờ tối đa ~60 giây nếu SeaweedFS đang khởi động
console.log("[storage]", storage.name);

const app = createApp(storage);
await runCleanup(storage).catch((e) => console.error("[cleanup]", e.message)); // dọn dở dang sau restart
setInterval(
  () => runCleanup(storage).catch((e) => console.error("[cleanup]", e.message)),
  config.cleanup.intervalMs,
).unref();

app.listen(config.port, () =>
  console.log(`[server] http://localhost:${config.port}`),
);

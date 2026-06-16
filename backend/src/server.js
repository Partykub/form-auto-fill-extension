import "dotenv/config";

import { createApp } from "./app.js";

const port = Number.parseInt(process.env.PORT ?? "3000", 10);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error("PORT must be an integer between 1 and 65535");
  process.exit(1);
}

const app = createApp();

app.listen(port, () => {
  console.log(`Form Auto Fill backend listening on http://localhost:${port}`);
});

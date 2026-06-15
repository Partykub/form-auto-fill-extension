import "dotenv/config";

import { createApp } from "./app.js";

const port = Number.parseInt(process.env.PORT ?? "3000", 10);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error("PORT must be an integer between 1 and 65535");
  process.exit(1);
}

if (!process.env.OPENAI_API_KEY) {
  console.warn("OPENAI_API_KEY is not configured. Embedding features will be unavailable.");
}

const app = createApp();

app.listen(port, () => {
  console.log(`Form Auto Fill backend listening on http://localhost:${port}`);
});


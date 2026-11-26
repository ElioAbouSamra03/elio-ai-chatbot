import http from "node:http";
import { config, isAiConfigured } from "./src/config.js";
import { handleRequest } from "./src/app.js";

const server = http.createServer(handleRequest);

server.listen(config.port, () => {
  console.log(`\n  Elio AI Chatbot running at http://localhost:${config.port}\n`);
  console.log(`  Chat model:      ${config.google.chatModel}`);
  console.log(`  Fallback models: ${config.google.fallbackModels.join(", ") || "none"}`);
  console.log(`  Embedding model: ${config.google.embeddingModel}`);
  if (!isAiConfigured()) {
    console.warn("\n  ⚠  GOOGLE_API_KEY is not set. Copy .env.example to .env and add your free key.\n");
  }
});

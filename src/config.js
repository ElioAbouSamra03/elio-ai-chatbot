import { existsSync } from "node:fs";

// Node.js (>= 20.12) can read .env files natively, no extra package needed.
if (existsSync(".env")) process.loadEnvFile(".env");

const toInt = (value, fallback) => {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

export const config = {
  port: toInt(process.env.PORT, 3000),
  google: {
    apiKey: process.env.GOOGLE_API_KEY || "",
    chatModel: process.env.CHAT_MODEL || "gemini-flash-latest",
    // Tried in order if the main model is overloaded (503) or rate-limited (429).
    fallbackModels: (process.env.FALLBACK_CHAT_MODELS || "gemini-3.1-flash-lite,gemini-3.5-flash-lite")
      .split(",")
      .map((m) => m.trim())
      .filter(Boolean),
    embeddingModel: process.env.EMBEDDING_MODEL || "gemini-embedding-001",
  },
  rag: {
    chunkSize: toInt(process.env.CHUNK_SIZE, 1000),
    chunkOverlap: toInt(process.env.CHUNK_OVERLAP, 150),
    topK: toInt(process.env.TOP_K, 4),
    historyTurns: toInt(process.env.HISTORY_TURNS, 6),
  },
  upload: {
    maxFileSizeMb: toInt(process.env.MAX_FILE_SIZE_MB, 10),
    maxFiles: toInt(process.env.MAX_FILES_PER_UPLOAD, 5),
    allowedExtensions: [".pdf", ".txt", ".md", ".docx", ".csv"],
  },
  session: {
    // Sessions (documents + chat history) are dropped after this much inactivity.
    ttlMinutes: toInt(process.env.SESSION_TTL_MINUTES, 120),
  },
};

export const isAiConfigured = () => Boolean(config.google.apiKey);

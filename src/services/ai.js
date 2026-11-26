import { ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { config, isAiConfigured } from "../config.js";
import { AppError } from "../utils/errors.js";

let embeddings = null;
let chatModel = null;

const requireKey = () => {
  if (!isAiConfigured()) {
    throw new AppError(
      "GOOGLE_API_KEY is not set. Add your free Gemini key to the .env file and restart the server.",
      503,
      "NOT_CONFIGURED"
    );
  }
};

/** Gemini embedding model (text -> vector), created on first use. */
export function getEmbeddings() {
  if (!embeddings) {
    requireKey();
    embeddings = new GoogleGenerativeAIEmbeddings({
      apiKey: config.google.apiKey,
      model: config.google.embeddingModel,
    });
  }
  return embeddings;
}

const createChatModel = (model) =>
  new ChatGoogleGenerativeAI({
    apiKey: config.google.apiKey,
    model,
    temperature: 0.2, // low = sticks closer to the document text
    maxRetries: 0, // fail fast and let the fallback models take over
  });

/**
 * Gemini chat model, created on first use.
 * If the main model is busy (503) or rate-limited (429), LangChain's
 * withFallbacks() automatically retries the same request on the next model.
 */
export function getChatModel() {
  if (!chatModel) {
    requireKey();
    const [main, ...fallbacks] = [config.google.chatModel, ...config.google.fallbackModels].map(createChatModel);
    chatModel = fallbacks.length ? main.withFallbacks({ fallbacks }) : main;
  }
  return chatModel;
}

/** Lets tests swap in fake models so they run without an API key. */
export function setModelsForTesting({ embeddings: e, chatModel: c }) {
  embeddings = e;
  chatModel = c;
}

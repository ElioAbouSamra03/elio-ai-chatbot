import { readJson, sendJson } from "../http/helpers.js";
import { answerQuestion } from "../services/ragChain.js";
import { AppError, toAiError } from "../utils/errors.js";

const MAX_QUESTION_LENGTH = 2000;

/** POST /api/chat  { "question": "..." } */
export async function ask(req, res, { session }) {
  const { question } = await readJson(req);
  const text = typeof question === "string" ? question.trim() : "";

  if (!text) throw new AppError("Please type a question first.", 400, "EMPTY_QUERY");
  if (text.length > MAX_QUESTION_LENGTH) {
    throw new AppError(`Questions are limited to ${MAX_QUESTION_LENGTH} characters.`, 400, "QUERY_TOO_LONG");
  }
  if (!session.documents.size || !session.vectorStore) {
    throw new AppError("Upload at least one document before asking a question.", 400, "NO_DOCUMENTS");
  }

  let result;
  try {
    result = await answerQuestion({ vectorStore: session.vectorStore, history: session.history, question: text });
  } catch (err) {
    console.error("[chat]", err.message);
    throw toAiError(err);
  }

  session.history.push({ role: "user", content: text }, { role: "ai", content: result.answer, sources: result.sources });
  sendJson(res, 200, result);
}

/** GET /api/chat  -> the session's conversation history */
export function history(req, res, { session }) {
  sendJson(res, 200, { history: session.history });
}

/** DELETE /api/chat  -> clears the conversation (documents are kept) */
export function clear(req, res, { session }) {
  session.history = [];
  sendJson(res, 200, { history: [] });
}

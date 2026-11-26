import path from "node:path";
import { fileURLToPath } from "node:url";
import { config, isAiConfigured } from "./config.js";
import { sendJson, serveStatic } from "./http/helpers.js";
import { getSession } from "./services/sessionStore.js";
import { AppError } from "./utils/errors.js";
import * as documents from "./routes/documents.js";
import * as chat from "./routes/chat.js";

const PUBLIC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../public");
const SESSION_ID_PATTERN = /^[a-zA-Z0-9-]{8,64}$/;

/* ---------- API routes ---------- */

const health = (req, res) =>
  sendJson(res, 200, {
    ok: true,
    aiConfigured: isAiConfigured(),
    chatModel: config.google.chatModel,
    embeddingModel: config.google.embeddingModel,
    allowedExtensions: config.upload.allowedExtensions,
    maxFileSizeMb: config.upload.maxFileSizeMb,
  });

// [method, path pattern, handler, needsSession]
const routes = [
  ["GET", "/api/health", health, false],
  ["GET", "/api/documents", documents.list, true],
  ["POST", "/api/documents", documents.upload, true],
  ["DELETE", "/api/documents", documents.removeAll, true],
  ["DELETE", "/api/documents/:id", documents.remove, true],
  ["GET", "/api/chat", chat.history, true],
  ["POST", "/api/chat", chat.ask, true],
  ["DELETE", "/api/chat", chat.clear, true],
];

/** Matches "/api/documents/:id" against "/api/documents/abc" -> { id: "abc" } */
function matchPath(pattern, pathname) {
  const a = pattern.split("/");
  const b = pathname.split("/");
  if (a.length !== b.length) return null;
  const params = {};
  for (let i = 0; i < a.length; i++) {
    if (a[i].startsWith(":")) params[a[i].slice(1)] = decodeURIComponent(b[i]);
    else if (a[i] !== b[i]) return null;
  }
  return params;
}

function findRoute(method, pathname) {
  let pathMatched = false;
  for (const [m, pattern, handler, needsSession] of routes) {
    const params = matchPath(pattern, pathname);
    if (!params) continue;
    pathMatched = true;
    if (m === method) return { handler, params, needsSession };
  }
  return pathMatched ? { methodNotAllowed: true } : null;
}

/* ---------- request handler ---------- */

export async function handleRequest(req, res) {
  const { pathname } = new URL(req.url, "http://localhost");

  try {
    if (!pathname.startsWith("/api/")) {
      if (req.method === "GET" && (await serveStatic(req, res, PUBLIC_DIR))) return;
      throw new AppError("Not found.", 404, "NOT_FOUND");
    }

    const route = findRoute(req.method, pathname);
    if (!route) throw new AppError("Not found.", 404, "NOT_FOUND");
    if (route.methodNotAllowed) throw new AppError("Method not allowed.", 405, "METHOD_NOT_ALLOWED");

    const context = { params: route.params };
    if (route.needsSession) {
      const sessionId = req.headers["x-session-id"];
      if (!SESSION_ID_PATTERN.test(sessionId || "")) {
        throw new AppError("Missing or invalid X-Session-Id header.", 400, "NO_SESSION");
      }
      context.session = getSession(sessionId);
    }

    await route.handler(req, res, context);
  } catch (err) {
    const appErr = err instanceof AppError ? err : new AppError("Something went wrong on the server.", 500, "SERVER_ERROR");
    if (!(err instanceof AppError)) console.error(err);
    if (!res.headersSent) sendJson(res, appErr.status, { error: { code: appErr.code, message: appErr.message } });
    else res.end();
  }
}

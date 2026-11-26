import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { AppError } from "../utils/errors.js";

export function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
  });
  res.end(body);
}

/** Reads the raw request body into a Buffer, rejecting bodies over `limitBytes`. */
export function readBody(req, limitBytes) {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers["content-length"] || 0);
    if (declared > limitBytes) {
      req.resume(); // discard
      return reject(tooLarge(limitBytes));
    }
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limitBytes) {
        req.destroy();
        reject(tooLarge(limitBytes));
      } else {
        chunks.push(chunk);
      }
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

const tooLarge = (limitBytes) =>
  new AppError(`Upload is too large (max ${Math.round(limitBytes / 1024 / 1024)} MB).`, 413, "TOO_LARGE");

export async function readJson(req, limitBytes = 100 * 1024) {
  const raw = await readBody(req, limitBytes);
  if (!raw.length) return {};
  try {
    return JSON.parse(raw.toString("utf8"));
  } catch {
    throw new AppError("Request body must be valid JSON.", 400, "INVALID_JSON");
  }
}

/**
 * Parses a multipart/form-data upload using the Fetch API built into Node.js
 * (Response.formData), so no upload library is needed.
 */
export async function readFormData(req, limitBytes) {
  const contentType = req.headers["content-type"] || "";
  if (!contentType.startsWith("multipart/form-data")) {
    throw new AppError("Expected a multipart/form-data upload.", 400, "BAD_UPLOAD");
  }
  const body = await readBody(req, limitBytes);
  try {
    return await new Response(body, { headers: { "Content-Type": contentType } }).formData();
  } catch {
    throw new AppError("Could not read the uploaded files.", 400, "BAD_UPLOAD");
  }
}

/* ---------- static files (the Bootstrap front end in /public) ---------- */

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

export async function serveStatic(req, res, publicDir) {
  const urlPath = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  const filePath = path.join(publicDir, urlPath === "/" ? "index.html" : urlPath);

  // Block path traversal (e.g. /../server.js).
  if (!filePath.startsWith(publicDir + path.sep)) return false;

  try {
    const info = await stat(filePath);
    if (!info.isFile()) return false;
    const data = await readFile(filePath);
    res.writeHead(200, {
      "Content-Type": MIME_TYPES[path.extname(filePath)] || "application/octet-stream",
      "Content-Length": data.length,
    });
    res.end(data);
    return true;
  } catch {
    return false;
  }
}

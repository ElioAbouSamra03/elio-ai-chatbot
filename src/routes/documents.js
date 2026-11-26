import { config } from "../config.js";
import { readFormData, sendJson } from "../http/helpers.js";
import { getExtension, isSupportedFile, loadAndSplit } from "../services/documentLoader.js";
import {
  addDocument,
  listDocuments,
  newDocumentId,
  removeAllDocuments,
  removeDocument,
} from "../services/sessionStore.js";
import { AppError, toAiError } from "../utils/errors.js";

const MB = 1024 * 1024;

/** GET /api/documents */
export function list(req, res, { session }) {
  sendJson(res, 200, { documents: listDocuments(session) });
}

/**
 * POST /api/documents  (multipart field name: "files", one or more files)
 * Each file is processed on its own, so one bad file doesn't block the others.
 */
export async function upload(req, res, { session }) {
  const { maxFileSizeMb, maxFiles } = config.upload;
  const form = await readFormData(req, maxFileSizeMb * MB * maxFiles + MB);
  const files = form.getAll("files").filter((f) => typeof f === "object" && f.name);

  if (!files.length) throw new AppError("Please choose at least one file to upload.", 400, "NO_FILES");
  if (files.length > maxFiles) {
    throw new AppError(`You can upload up to ${maxFiles} files at a time.`, 400, "TOO_MANY_FILES");
  }

  const uploaded = [];
  const errors = [];

  for (const file of files) {
    try {
      if (!isSupportedFile(file.name)) {
        throw new AppError(
          `"${file.name}" is not a supported file type. Use ${config.upload.allowedExtensions.join(", ")}.`,
          415,
          "UNSUPPORTED_FILE"
        );
      }
      if (file.size === 0) throw new AppError(`"${file.name}" is empty.`, 422, "EMPTY_DOCUMENT");
      if (file.size > maxFileSizeMb * MB) {
        throw new AppError(`"${file.name}" is larger than ${maxFileSizeMb} MB.`, 413, "TOO_LARGE");
      }

      const id = newDocumentId();
      const chunks = await loadAndSplit({ name: file.name, blob: file }, id);

      let doc;
      try {
        doc = await addDocument(
          session,
          { id, name: file.name, type: getExtension(file.name).slice(1), size: file.size },
          chunks
        );
      } catch (err) {
        throw toAiError(err); // embedding call failed
      }
      uploaded.push(doc);
    } catch (err) {
      if (!(err instanceof AppError)) console.error(err);
      errors.push({ file: file.name, message: err instanceof AppError ? err.message : "Upload failed." });
    }
  }

  // 207-style result: report what worked and what didn't.
  sendJson(res, uploaded.length ? 201 : 422, {
    uploaded,
    errors,
    documents: listDocuments(session),
  });
}

/** DELETE /api/documents/:id */
export function remove(req, res, { session, params }) {
  if (!removeDocument(session, params.id)) {
    throw new AppError("Document not found.", 404, "NOT_FOUND");
  }
  sendJson(res, 200, { documents: listDocuments(session) });
}

/** DELETE /api/documents */
export function removeAll(req, res, { session }) {
  removeAllDocuments(session);
  sendJson(res, 200, { documents: [] });
}

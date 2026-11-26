import path from "node:path";
import { Document } from "@langchain/core/documents";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { TextLoader } from "@langchain/classic/document_loaders/fs/text";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { DocxLoader } from "@langchain/community/document_loaders/fs/docx";
import { CSVLoader } from "@langchain/community/document_loaders/fs/csv";
import { config } from "../config.js";
import { AppError } from "../utils/errors.js";

// CSV rows are small, so we group them before embedding (fewer API calls).
const CSV_ROWS_PER_GROUP = 20;

export const getExtension = (filename) => path.extname(filename || "").toLowerCase();

export const isSupportedFile = (filename) =>
  config.upload.allowedExtensions.includes(getExtension(filename));

/** Picks the LangChain document loader for a file extension. */
function createLoader(ext, blob) {
  switch (ext) {
    case ".pdf":
      return new PDFLoader(blob, { splitPages: true }); // one Document per page
    case ".docx":
      return new DocxLoader(blob);
    case ".csv":
      return new CSVLoader(blob); // one Document per row
    case ".txt":
    case ".md":
      return new TextLoader(blob);
    default:
      return null;
  }
}

/** Merges consecutive CSV row Documents into groups and records the row range. */
function groupCsvRows(rowDocs) {
  const groups = [];
  for (let i = 0; i < rowDocs.length; i += CSV_ROWS_PER_GROUP) {
    const slice = rowDocs.slice(i, i + CSV_ROWS_PER_GROUP);
    groups.push(
      new Document({
        pageContent: slice.map((d, j) => `Row ${i + j + 1}:\n${d.pageContent}`).join("\n\n"),
        metadata: { rows: `${i + 1}-${i + slice.length}` },
      })
    );
  }
  return groups;
}

/**
 * Parses an uploaded file with a LangChain loader and splits it into chunks
 * ready for embedding.
 *
 * @param {{ name: string, blob: Blob }} file
 * @param {string} docId  id used to find/remove this document's chunks later
 * @returns {Promise<Document[]>}
 */
export async function loadAndSplit({ name, blob }, docId) {
  const ext = getExtension(name);
  const loader = createLoader(ext, blob);
  if (!loader) {
    throw new AppError(
      `"${name}" is not supported. Allowed types: ${config.upload.allowedExtensions.join(", ")}`,
      415,
      "UNSUPPORTED_FILE"
    );
  }

  let docs;
  try {
    docs = await loader.load();
  } catch {
    throw new AppError(`Could not read "${name}". The file may be corrupted.`, 422, "PARSE_ERROR");
  }

  if (ext === ".csv") docs = groupCsvRows(docs);
  docs = docs.filter((d) => d.pageContent.trim().length > 0);

  if (!docs.length) {
    throw new AppError(
      `No readable text found in "${name}". Scanned/image-only PDFs are not supported.`,
      422,
      "EMPTY_DOCUMENT"
    );
  }

  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: config.rag.chunkSize,
    chunkOverlap: config.rag.chunkOverlap,
  });
  const chunks = await splitter.splitDocuments(docs);

  // Keep only the metadata we use for citing sources.
  return chunks.map(
    (chunk, i) =>
      new Document({
        pageContent: chunk.pageContent,
        metadata: {
          docId,
          source: name,
          chunk: i + 1,
          ...(chunk.metadata.loc?.pageNumber && ext === ".pdf" ? { page: chunk.metadata.loc.pageNumber } : {}),
          ...(chunk.metadata.rows ? { rows: chunk.metadata.rows } : {}),
        },
      })
  );
}

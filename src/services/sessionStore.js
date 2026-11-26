import { randomUUID } from "node:crypto";
import { MemoryVectorStore } from "@langchain/classic/vectorstores/memory";
import { config } from "../config.js";
import { getEmbeddings } from "./ai.js";

/**
 * Every browser tab gets its own session: its own Memory Vector Store,
 * its own list of uploaded documents and its own chat history.
 * Everything lives in RAM and disappears when the server stops.
 *
 * Session shape:
 * {
 *   vectorStore: MemoryVectorStore | null,
 *   documents: Map<docId, { id, name, type, size, chunks, uploadedAt }>,
 *   history: Array<{ role: "user" | "ai", content: string }>,
 *   lastActive: number
 * }
 */
const sessions = new Map();

export function getSession(sessionId) {
  let session = sessions.get(sessionId);
  if (!session) {
    session = { vectorStore: null, documents: new Map(), history: [], lastActive: Date.now() };
    sessions.set(sessionId, session);
  }
  session.lastActive = Date.now();
  return session;
}

/** Embeds the chunks and adds them to the session's vector store. */
export async function addDocument(session, fileInfo, chunks) {
  if (!session.vectorStore) {
    session.vectorStore = new MemoryVectorStore(getEmbeddings());
  }
  await session.vectorStore.addDocuments(chunks);

  const doc = { ...fileInfo, chunks: chunks.length, uploadedAt: new Date().toISOString() };
  session.documents.set(doc.id, doc);
  return doc;
}

export function removeDocument(session, docId) {
  if (!session.documents.delete(docId)) return false;
  if (session.vectorStore) {
    // MemoryVectorStore keeps its vectors in a plain array; drop this document's chunks.
    session.vectorStore.memoryVectors = session.vectorStore.memoryVectors.filter(
      (v) => v.metadata.docId !== docId
    );
  }
  return true;
}

export function removeAllDocuments(session) {
  session.documents.clear();
  session.vectorStore = null;
}

export const listDocuments = (session) => [...session.documents.values()];

export const newDocumentId = () => randomUUID();

// Drop idle sessions so memory doesn't grow forever.
const ttlMs = config.session.ttlMinutes * 60 * 1000;
setInterval(() => {
  const now = Date.now();
  for (const [id, s] of sessions) if (now - s.lastActive > ttlMs) sessions.delete(id);
}, 10 * 60 * 1000).unref();

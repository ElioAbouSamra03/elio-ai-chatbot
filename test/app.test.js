// End-to-end API tests with fake AI models (no API key or internet needed).
// Run with: npm test
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { readFile } from "node:fs/promises";
import { FakeListChatModel, SyntheticEmbeddings } from "@langchain/core/utils/testing";
import { setModelsForTesting } from "../src/services/ai.js";
import { handleRequest } from "../src/app.js";

const SAMPLES = new URL("../sample-docs/", import.meta.url);
const SESSION = { "X-Session-Id": "test-session-0001" };
let server;
let base;

before(async () => {
  setModelsForTesting({
    embeddings: new SyntheticEmbeddings({ vectorSize: 64 }),
    // The fake LLM returns these answers in order (condense step uses one when there's history).
    chatModel: new FakeListChatModel({
      responses: ["Merge sort runs in O(n log n) in all cases [1].", "standalone question", "Binary search only works on a sorted array [1]."],
    }),
  });
  server = http.createServer(handleRequest);
  await new Promise((r) => server.listen(0, r));
  base = `http://localhost:${server.address().port}`;
});

after(() => server.close());

const call = (method, path, body, headers = SESSION) =>
  fetch(base + path, {
    method,
    headers: body instanceof FormData ? headers : { ...headers, "Content-Type": "application/json" },
    body: body instanceof FormData ? body : body && JSON.stringify(body),
  }).then(async (r) => ({ status: r.status, data: await r.json() }));

const formWith = async (...names) => {
  const form = new FormData();
  for (const n of names) form.append("files", new Blob([await readFile(new URL(n, SAMPLES))]), n);
  return form;
};

test("serves the front end", async () => {
  const res = await fetch(base + "/");
  assert.equal(res.status, 200);
  assert.match(await res.text(), /Elio AI Chatbot/);
});

test("blocks path traversal", async () => {
  const res = await fetch(base + "/..%2fserver.js");
  assert.equal(res.status, 404);
});

test("requires a session id", async () => {
  const { status } = await call("GET", "/api/documents", undefined, {});
  assert.equal(status, 400);
});

test("rejects questions before any upload", async () => {
  const { status, data } = await call("POST", "/api/chat", { question: "hi" });
  assert.equal(status, 400);
  assert.equal(data.error.code, "NO_DOCUMENTS");
});

test("uploads PDF, DOCX, CSV and TXT", async () => {
  const form = await formWith(
    "operating-systems-notes.pdf",
    "senior-project-proposal.docx",
    "semester-courses.csv",
    "algorithms-cheatsheet.txt"
  );
  const { status, data } = await call("POST", "/api/documents", form);
  assert.equal(status, 201);
  assert.equal(data.errors.length, 0);
  assert.equal(data.documents.length, 4);
  for (const d of data.documents) assert.ok(d.chunks > 0, `${d.name} has chunks`);
});

test("rejects unsupported files but keeps good ones", async () => {
  const form = new FormData();
  form.append("files", new Blob(["MZ..."]), "virus.exe");
  const { status, data } = await call("POST", "/api/documents", form);
  assert.equal(status, 422);
  assert.match(data.errors[0].message, /not a supported file type/);
});

test("rejects empty queries", async () => {
  const { status, data } = await call("POST", "/api/chat", { question: "   " });
  assert.equal(status, 400);
  assert.equal(data.error.code, "EMPTY_QUERY");
});

test("answers with sources and keeps history", async () => {
  const first = await call("POST", "/api/chat", { question: "What is the time complexity of merge sort?" });
  assert.equal(first.status, 200);
  assert.match(first.data.answer, /O\(n log n\)/);
  assert.ok(first.data.sources.length > 0);
  assert.ok(first.data.sources[0].source);
  assert.ok(first.data.sources[0].location);

  const second = await call("POST", "/api/chat", { question: "And binary search?" });
  assert.equal(second.status, 200);

  const { data } = await call("GET", "/api/chat");
  assert.equal(data.history.length, 4);
});

test("PDF chunks carry page numbers", async () => {
  const { data } = await call("POST", "/api/chat", { question: "page replacement algorithms" });
  // FakeListChatModel cycles responses; we only care about the retrieved sources here.
  const pdfSources = data.sources.filter((s) => s.source.endsWith(".pdf"));
  for (const s of pdfSources) assert.match(s.location, /^page \d+$/);
});

test("clears chat history but keeps documents", async () => {
  await call("DELETE", "/api/chat");
  const chat = await call("GET", "/api/chat");
  assert.equal(chat.data.history.length, 0);
  const docs = await call("GET", "/api/documents");
  assert.equal(docs.data.documents.length, 4);
});

test("removes one document and then all", async () => {
  const { data } = await call("GET", "/api/documents");
  const removed = await call("DELETE", `/api/documents/${data.documents[0].id}`);
  assert.equal(removed.data.documents.length, 3);

  const all = await call("DELETE", "/api/documents");
  assert.equal(all.data.documents.length, 0);
});

test("other sessions are isolated", async () => {
  const { data } = await call("GET", "/api/documents", undefined, { "X-Session-Id": "another-session-02" });
  assert.equal(data.documents.length, 0);
});

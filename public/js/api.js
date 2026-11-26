// Thin wrapper around the backend REST API.

const SESSION_KEY = "elio-ai-chatbot-session-id";

/** One session per browser tab (sessionStorage), so each tab has its own docs + chat. */
function getSessionId() {
  let id = sessionStorage.getItem(SESSION_KEY);
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

async function request(method, url, body) {
  const headers = { "X-Session-Id": getSessionId() };
  let payload = body;
  if (body && !(body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }

  let res;
  try {
    res = await fetch(url, { method, headers, body: payload });
  } catch {
    throw new Error("Can't reach the server. Is it running?");
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok && !data.uploaded) {
    throw new Error(data.error?.message || `Request failed (${res.status}).`);
  }
  return data;
}

export const api = {
  health: () => request("GET", "/api/health"),

  listDocuments: () => request("GET", "/api/documents"),
  uploadDocuments(files) {
    const form = new FormData();
    for (const f of files) form.append("files", f);
    return request("POST", "/api/documents", form);
  },
  removeDocument: (id) => request("DELETE", `/api/documents/${encodeURIComponent(id)}`),
  removeAllDocuments: () => request("DELETE", "/api/documents"),

  getHistory: () => request("GET", "/api/chat"),
  ask: (question) => request("POST", "/api/chat", { question }),
  clearHistory: () => request("DELETE", "/api/chat"),
};

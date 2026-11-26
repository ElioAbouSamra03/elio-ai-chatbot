// DOM rendering helpers. No framework: plain JavaScript + Bootstrap classes.

const $ = (sel) => document.querySelector(sel);

export const els = {
  messages: $("#messages"),
  emptyState: $("#emptyState"),
  chatForm: $("#chatForm"),
  questionInput: $("#questionInput"),
  sendBtn: $("#sendBtn"),
  clearChatBtn: $("#clearChatBtn"),
  themeToggle: $("#themeToggle"),
  fileInput: $("#fileInput"),
  dropzone: $("#dropzone"),
  uploadStatus: $("#uploadStatus"),
  docList: $("#docList"),
  docCount: $("#docCount"),
  docCountBadge: $("#docCountBadge"),
  noDocs: $("#noDocs"),
  removeAllBtn: $("#removeAllBtn"),
  configAlert: $("#configAlert"),
  allowedTypes: $("#allowedTypes"),
  toastContainer: $("#toastContainer"),
};

/* ---------- safe text formatting ---------- */

const escapeHtml = (s) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** Inline formatting on already-escaped text: **bold**, *italic*, `code`, [1] citations. */
const formatInline = (s) =>
  s
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>")
    .replace(/\[(\d+(?:\s*,\s*\d+)*)\]/g, (_, nums) =>
      nums
        .split(",")
        .map((n) => `<span class="badge rounded-pill text-bg-primary cite">${n.trim()}</span>`)
        .join("")
    );

/**
 * Minimal Markdown-like renderer for AI answers (paragraphs, bullet and numbered lists,
 * headings). Text is HTML-escaped first, so model output can never inject markup.
 */
export function renderRichText(text) {
  const lines = escapeHtml(text).split("\n");
  let html = "";
  let list = null; // "ul" | "ol" | null
  let para = [];

  const flushPara = () => {
    if (para.length) html += `<p>${formatInline(para.join("<br>"))}</p>`;
    para = [];
  };
  const closeList = () => {
    if (list) html += `</${list}>`;
    list = null;
  };

  for (const raw of lines) {
    const line = raw.trim();
    const bullet = line.match(/^[-*•]\s+(.*)/);
    const numbered = line.match(/^\d+[.)]\s+(.*)/);
    const heading = line.match(/^#{1,6}\s+(.*)/);

    if (bullet || numbered) {
      flushPara();
      const type = bullet ? "ul" : "ol";
      if (list !== type) {
        closeList();
        html += `<${type} class="mb-2">`;
        list = type;
      }
      html += `<li>${formatInline((bullet || numbered)[1])}</li>`;
    } else if (heading) {
      flushPara();
      closeList();
      html += `<p class="fw-semibold mb-1">${formatInline(heading[1])}</p>`;
    } else if (!line) {
      flushPara();
      closeList();
    } else {
      closeList();
      para.push(line);
    }
  }
  flushPara();
  closeList();
  return html;
}

/* ---------- chat messages ---------- */

const timeNow = () => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export function scrollToBottom() {
  els.messages.scrollTop = els.messages.scrollHeight;
}

function sourcesHtml(sources, id) {
  if (!sources?.length) return "";
  const cards = sources
    .map(
      (s) => `
      <div class="source-card">
        <div class="d-flex justify-content-between gap-2">
          <span class="fw-semibold text-truncate">
            <span class="badge rounded-pill text-bg-primary me-1">${s.ref}</span>
            <i class="bi bi-file-earmark-text"></i> ${escapeHtml(s.source)}
          </span>
          <span class="text-body-secondary text-nowrap">${escapeHtml(s.location)}</span>
        </div>
        <div class="excerpt">${escapeHtml(s.excerpt)}</div>
      </div>`
    )
    .join("");

  const files = [...new Set(sources.map((s) => s.source))];
  return `
    <div class="sources mt-2">
      <button class="btn btn-sm btn-outline-primary py-0" type="button"
              data-bs-toggle="collapse" data-bs-target="#${id}" aria-expanded="false">
        <i class="bi bi-journal-text"></i> Sources: ${files.map(escapeHtml).join(", ")}
      </button>
      <div class="collapse" id="${id}">
        <div class="d-flex flex-column gap-2 mt-2">${cards}</div>
      </div>
    </div>`;
}

let messageCounter = 0;

/**
 * Adds a chat bubble.
 * @param {"user"|"ai"} role
 * @param {string} text
 * @param {{ sources?: object[], error?: boolean }} [opts]
 */
export function addMessage(role, text, { sources, error } = {}) {
  els.emptyState.classList.add("d-none");
  const id = `src-${++messageCounter}`;
  const el = document.createElement("div");
  el.className = `msg ${role}${error ? " error" : ""}`;
  el.innerHTML = `
    <div class="avatar"><i class="bi ${role === "user" ? "bi-person-fill" : error ? "bi-exclamation-triangle" : "bi-robot"}"></i></div>
    <div class="min-w-0">
      <div class="bubble">${role === "user" ? escapeHtml(text) : renderRichText(text)}</div>
      ${role === "ai" ? sourcesHtml(sources, id) : ""}
      <div class="msg-time text-body-secondary mt-1 ${role === "user" ? "text-end" : ""}">${timeNow()}</div>
    </div>`;
  els.messages.appendChild(el);
  scrollToBottom();
  return el;
}

/** Shows the animated "AI is typing" bubble; returns a function that removes it. */
export function showTyping() {
  const el = document.createElement("div");
  el.className = "msg ai";
  el.innerHTML = `
    <div class="avatar"><i class="bi bi-robot"></i></div>
    <div class="bubble typing" role="status" aria-label="Generating answer">
      <span></span><span></span><span></span>
    </div>`;
  els.messages.appendChild(el);
  scrollToBottom();
  return () => el.remove();
}

export function clearMessages() {
  els.messages.querySelectorAll(".msg").forEach((m) => m.remove());
  els.emptyState.classList.remove("d-none");
}

/* ---------- documents list ---------- */

const FILE_ICONS = { pdf: "bi-file-earmark-pdf text-danger", docx: "bi-file-earmark-word text-primary", csv: "bi-file-earmark-spreadsheet text-success", txt: "bi-file-earmark-text", md: "bi-markdown" };

const formatSize = (bytes) =>
  bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

export function renderDocuments(docs) {
  els.docList.innerHTML = docs
    .map(
      (d) => `
      <li class="list-group-item d-flex align-items-center gap-2">
        <i class="bi ${FILE_ICONS[d.type] || "bi-file-earmark"} fs-5"></i>
        <div class="flex-grow-1 min-w-0">
          <div class="doc-name fw-semibold" title="${escapeHtml(d.name)}">${escapeHtml(d.name)}</div>
          <div class="text-body-secondary">${formatSize(d.size)} · ${d.chunks} chunk${d.chunks === 1 ? "" : "s"}</div>
        </div>
        <button class="btn btn-sm btn-outline-danger border-0" data-remove-id="${d.id}"
                title="Remove document" aria-label="Remove ${escapeHtml(d.name)}">
          <i class="bi bi-x-lg"></i>
        </button>
      </li>`
    )
    .join("");

  els.docCount.textContent = `(${docs.length})`;
  els.docCountBadge.textContent = docs.length;
  els.docCountBadge.classList.toggle("d-none", docs.length === 0);
  els.noDocs.classList.toggle("d-none", docs.length > 0);
  els.removeAllBtn.classList.toggle("d-none", docs.length === 0);
}

/* ---------- loading states ---------- */

export function setUploading(isUploading) {
  els.uploadStatus.classList.toggle("d-none", !isUploading);
  els.dropzone.classList.toggle("disabled", isUploading);
}

export function setAsking(isAsking) {
  els.sendBtn.disabled = isAsking;
  els.questionInput.disabled = isAsking;
  els.sendBtn.innerHTML = isAsking
    ? '<span class="spinner-border spinner-border-sm" role="status" aria-label="Loading"></span>'
    : '<i class="bi bi-send-fill"></i>';
}

/* ---------- toasts ---------- */

export function toast(message, type = "danger") {
  const el = document.createElement("div");
  el.className = `toast align-items-center text-bg-${type} border-0`;
  el.setAttribute("role", "alert");
  el.innerHTML = `
    <div class="d-flex">
      <div class="toast-body">${escapeHtml(message)}</div>
      <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
    </div>`;
  els.toastContainer.appendChild(el);
  const t = new bootstrap.Toast(el, { delay: 5000 });
  el.addEventListener("hidden.bs.toast", () => el.remove());
  t.show();
}

/* ---------- theme ---------- */

export function applyTheme(theme) {
  document.documentElement.setAttribute("data-bs-theme", theme);
  els.themeToggle.innerHTML = `<i class="bi ${theme === "dark" ? "bi-sun" : "bi-moon-stars"}"></i>`;
  try {
    localStorage.setItem("theme", theme);
  } catch {
    /* storage unavailable: theme still applies for this page */
  }
}

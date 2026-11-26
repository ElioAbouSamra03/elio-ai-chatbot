// Front-end controller: wires the UI to the API.
import { api } from "./api.js";
import {
  els,
  addMessage,
  showTyping,
  clearMessages,
  renderDocuments,
  setUploading,
  setAsking,
  toast,
  applyTheme,
} from "./ui.js";

const state = {
  allowedExtensions: [".pdf", ".txt", ".md", ".docx", ".csv"],
  maxFileSizeMb: 10,
  documents: [],
  busy: false,
};

/* ---------- documents ---------- */

const extOf = (name) => (name.match(/\.[^.]+$/)?.[0] || "").toLowerCase();

async function uploadFiles(fileList) {
  const files = [...fileList];
  if (!files.length) return;

  // Validate on the client first for instant feedback (the server checks again).
  const valid = [];
  for (const f of files) {
    if (!state.allowedExtensions.includes(extOf(f.name))) {
      toast(`"${f.name}" is not supported. Allowed: ${state.allowedExtensions.join(", ")}`);
    } else if (f.size === 0) {
      toast(`"${f.name}" is empty.`);
    } else if (f.size > state.maxFileSizeMb * 1024 * 1024) {
      toast(`"${f.name}" is larger than ${state.maxFileSizeMb} MB.`);
    } else {
      valid.push(f);
    }
  }
  if (!valid.length) return;

  setUploading(true);
  try {
    const result = await api.uploadDocuments(valid);
    state.documents = result.documents;
    renderDocuments(state.documents);
    result.errors?.forEach((e) => toast(e.message));
    if (result.uploaded?.length) {
      const names = result.uploaded.map((d) => d.name).join(", ");
      toast(`Ready: ${names}`, "success");
      els.questionInput.focus();
    }
  } catch (err) {
    toast(err.message);
  } finally {
    setUploading(false);
    els.fileInput.value = ""; // allow re-uploading the same file
  }
}

async function removeDocument(id) {
  try {
    const { documents } = await api.removeDocument(id);
    state.documents = documents;
    renderDocuments(documents);
  } catch (err) {
    toast(err.message);
  }
}

async function removeAllDocuments() {
  if (!confirm("Remove all uploaded documents?")) return;
  try {
    await api.removeAllDocuments();
    state.documents = [];
    renderDocuments([]);
  } catch (err) {
    toast(err.message);
  }
}

/* ---------- chat ---------- */

async function askQuestion(event) {
  event.preventDefault();
  if (state.busy) return;

  const question = els.questionInput.value.trim();
  if (!question) {
    toast("Please type a question first.", "warning");
    els.questionInput.focus();
    return;
  }
  if (!state.documents.length) {
    toast("Upload at least one document before asking a question.", "warning");
    return;
  }

  addMessage("user", question);
  els.questionInput.value = "";
  autoResize();

  state.busy = true;
  setAsking(true);
  const hideTyping = showTyping();
  try {
    const { answer, sources } = await api.ask(question);
    hideTyping();
    addMessage("ai", answer, { sources });
  } catch (err) {
    hideTyping();
    addMessage("ai", err.message, { error: true });
  } finally {
    state.busy = false;
    setAsking(false);
    els.questionInput.focus();
  }
}

async function clearChat() {
  try {
    await api.clearHistory();
    clearMessages();
  } catch (err) {
    toast(err.message);
  }
}

function autoResize() {
  const ta = els.questionInput;
  ta.style.height = "auto";
  ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
}

/* ---------- events ---------- */

function bindEvents() {
  els.chatForm.addEventListener("submit", askQuestion);
  els.questionInput.addEventListener("input", autoResize);
  els.questionInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      els.chatForm.requestSubmit();
    }
  });

  els.clearChatBtn.addEventListener("click", clearChat);
  els.themeToggle.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-bs-theme");
    applyTheme(current === "dark" ? "light" : "dark");
  });

  els.fileInput.addEventListener("change", () => uploadFiles(els.fileInput.files));
  els.removeAllBtn.addEventListener("click", removeAllDocuments);
  els.docList.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-remove-id]");
    if (btn) removeDocument(btn.dataset.removeId);
  });

  // Drag & drop upload
  ["dragenter", "dragover"].forEach((type) =>
    els.dropzone.addEventListener(type, (e) => {
      e.preventDefault();
      els.dropzone.classList.add("dragover");
    })
  );
  ["dragleave", "drop"].forEach((type) =>
    els.dropzone.addEventListener(type, (e) => {
      e.preventDefault();
      els.dropzone.classList.remove("dragover");
    })
  );
  els.dropzone.addEventListener("drop", (e) => uploadFiles(e.dataTransfer.files));
}

/* ---------- start ---------- */

async function init() {
  applyTheme(document.documentElement.getAttribute("data-bs-theme") || "light");
  bindEvents();

  try {
    const health = await api.health();
    state.allowedExtensions = health.allowedExtensions;
    state.maxFileSizeMb = health.maxFileSizeMb;
    els.allowedTypes.textContent = `${health.allowedExtensions.map((e) => e.slice(1).toUpperCase()).join(", ")} · max ${health.maxFileSizeMb} MB`;
    els.fileInput.accept = health.allowedExtensions.join(",");
    els.configAlert.classList.toggle("d-none", health.aiConfigured);

    // Restore this tab's session after a page refresh.
    const [{ documents }, { history }] = await Promise.all([api.listDocuments(), api.getHistory()]);
    state.documents = documents;
    renderDocuments(documents);
    history.forEach((m) => addMessage(m.role, m.content, { sources: m.sources }));
  } catch (err) {
    toast(err.message);
  }
}

init();

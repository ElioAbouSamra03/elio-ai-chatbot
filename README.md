# Elio AI Chatbot: Responsive AI Document Chatbot (RAG)

Upload your own documents (PDF, DOCX, TXT, MD, CSV) and ask questions about them.
Answers are generated **only from the uploaded content** using Retrieval-Augmented Generation (RAG), and each answer shows the document sources it used.

**Stack:** JavaScript · Node.js · LangChain.js · Bootstrap 5 · Memory Vector Store · Google Gemini API (free tier)

---

## Features

**Required**
- Responsive Bootstrap chat interface (sidebar becomes a slide-out panel on mobile)
- Document upload (button or drag and drop)
- Supports **PDF, TXT, MD, DOCX, CSV**
- Chat with user and AI message bubbles
- Conversation history for the session (kept after a page refresh in the same tab)
- Loading indicators (typing animation while answering, spinner while indexing)
- Error handling for unsupported, empty or oversized files, empty questions, asking before uploading, missing API key and rate limits

**Additional**
- Shows the **document source** (file + page / rows / section) for every answer, with excerpts
- **Multiple documents** at once, each removable individually
- **Dark / Light mode** (remembered in the browser)
- **Clear chat** history
- Upload new documents any time **without restarting**
- Follow-up questions understand context ("what about sick leave?")
- Each browser tab is its own isolated session

---

## How the RAG pipeline works

```
Upload ─► LangChain loader ─► Text splitter ─► Gemini embeddings ─► Memory Vector Store
                                                                          │
Question ─► (rewrite follow-ups with history) ─► similarity search ◄──────┘
                                                        │ top 4 chunks
                                                        ▼
                         Prompt: "answer ONLY from this context, cite [n]" ─► Gemini ─► Answer + sources
```

1. **Load**: LangChain document loaders read the file (`PDFLoader`, `DocxLoader`, `CSVLoader`, `TextLoader`).
2. **Split**: `RecursiveCharacterTextSplitter` cuts the text into ~1000-character chunks with overlap.
3. **Embed & store**: each chunk is turned into a vector with `gemini-embedding-001` and stored in LangChain's `MemoryVectorStore`.
4. **Retrieve**: the question is embedded and the 4 most similar chunks are found.
5. **Generate**: the chunks are put into a prompt that tells Gemini to answer only from them, or reply that the answer isn't in the documents.

---

## Setup

### Requirements
- **Node.js 22 or newer** (`node -v`)
- A **free Google Gemini API key**

### 1. Get a free API key
1. Go to <https://aistudio.google.com/app/apikey> and sign in with a Google account.
2. Click **Create API key** and copy it. No credit card needed.

### 2. Install and configure
```bash
git clone https://github.com/<your-username>/elio-ai-chatbot.git
cd elio-ai-chatbot
npm install
cp .env.example .env        # Windows: copy .env.example .env
```
Open `.env` and set:
```
GOOGLE_API_KEY=your_key_here
```

### 3. Run
```bash
npm start
```
Open <http://localhost:3000>.

### 4. Try it
Upload the files in [`sample-docs/`](sample-docs) (my CS study notes) and ask, for example:
- *What are the four conditions for a deadlock?* (PDF)
- *What is thrashing?* (PDF)
- *Which hardware is used in the senior project and what is the budget?* (DOCX)
- *Which courses do I have on Tuesday and what grade did I get in Database Systems?* (CSV)
- *What is the worst-case complexity of quick sort?* (TXT)
- *Who won the World Cup in 2022?* → should answer that it's not in the documents

### Run the tests (no API key needed)
```bash
npm test
```
The tests use LangChain's fake models, so they run offline.

---

## Project structure

```
elio-ai-chatbot/
├── server.js                     # Starts the Node.js HTTP server
├── src/
│   ├── config.js                 # Settings from .env
│   ├── app.js                    # Request router, static files, error responses
│   ├── http/helpers.js           # JSON, body reading, multipart parsing, static serving
│   ├── routes/
│   │   ├── documents.js          # Upload / list / remove documents
│   │   └── chat.js               # Ask a question / history / clear
│   ├── services/
│   │   ├── ai.js                 # Gemini chat + embedding models (LangChain)
│   │   ├── documentLoader.js     # LangChain loaders + text splitter
│   │   ├── sessionStore.js       # Per-session MemoryVectorStore, documents, history
│   │   └── ragChain.js           # Prompts + retrieval + answer generation
│   └── utils/errors.js           # AppError + friendly AI error messages
├── public/                       # Front end (Bootstrap 5 + vanilla JS)
│   ├── index.html
│   ├── css/styles.css
│   └── js/
│       ├── api.js                # Calls to the backend
│       ├── ui.js                 # Rendering (messages, sources, documents, toasts, theme)
│       └── app.js                # Event handling / app logic
├── sample-docs/                  # Sample study notes (PDF, DOCX, CSV, TXT)
├── test/app.test.js              # API tests with fake models
├── .env.example
└── package.json
```

The server uses only Node.js built-ins (`http`, `fetch`'s `FormData` parsing, `process.loadEnvFile`) plus LangChain.js. `pdf-parse`, `mammoth` and `d3-dsv` are installed only because LangChain's PDF, DOCX and CSV loaders require them.

---

## API

All `/api` routes except `/api/health` need an `X-Session-Id` header (the front end creates one per tab).

| Method | Route | Description |
|---|---|---|
| GET | `/api/health` | Server status, models, allowed file types |
| GET | `/api/documents` | List uploaded documents |
| POST | `/api/documents` | Upload files (multipart field `files`, up to 5) |
| DELETE | `/api/documents/:id` | Remove one document |
| DELETE | `/api/documents` | Remove all documents |
| POST | `/api/chat` | `{ "question": "..." }` → `{ answer, sources[] }` |
| GET | `/api/chat` | Conversation history |
| DELETE | `/api/chat` | Clear conversation history |

Errors look like `{ "error": { "code": "EMPTY_QUERY", "message": "Please type a question first." } }`.

---

## Notes and limits

- **Memory storage**: documents and chats live in RAM. Restarting the server clears them, which is expected for the Memory Vector Store. Idle sessions are removed after 2 hours.
- **Scanned PDFs** (images only) have no text to read and are rejected with a clear message.
- **Free tier limits / busy servers**: Gemini's free tier has per-minute and daily limits, and its servers are sometimes overloaded (error 503). The app automatically retries the question on the fallback models in `FALLBACK_CHAT_MODELS`, and only shows an error if all of them fail.
- Settings like chunk size, number of retrieved chunks and models can be changed in `.env`.

---

## Demo video checklist (2–3 min)

1. `npm start`, open the app, toggle dark/light mode.
2. Upload a PDF, then the DOCX, CSV and TXT (show the indexing spinner).
3. Drag an unsupported file (e.g. a `.png`) onto the upload box → error toast. Press Enter with an empty box → error.
4. Ask 3–4 questions, open **Sources** to show the file and page used.
5. Ask a follow-up ("and sick leave?") and an off-topic question (should say it's not in the documents).
6. Remove a document, upload another one without restarting, click **Clear chat**.
7. Resize the window / phone view to show the responsive layout.

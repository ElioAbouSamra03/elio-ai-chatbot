import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { HumanMessage, AIMessage } from "@langchain/core/messages";
import { config } from "../config.js";
import { getChatModel } from "./ai.js";

export const NOT_FOUND_ANSWER =
  "I couldn't find the answer to that in the uploaded documents.";

/* Step 1: turn a follow-up ("what about its price?") into a standalone question
 * so the vector search finds the right chunks. Only used when there is history. */
const condensePrompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    "Given the chat history and a follow-up question, rewrite the follow-up as a " +
      "standalone question that can be understood without the history. " +
      "Do NOT answer it. Return only the rewritten question.",
  ],
  new MessagesPlaceholder("history"),
  ["human", "{question}"],
]);

/* Step 2: answer using ONLY the retrieved context. */
const answerPrompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    "You are a document assistant. Answer the user's question using ONLY the context below, " +
      "which comes from documents the user uploaded.\n" +
      "Rules:\n" +
      "- Do not use outside knowledge. If the context does not contain the answer, reply exactly: " +
      `"${NOT_FOUND_ANSWER}"\n` +
      "- Cite the sources you used inline like [1] or [2], matching the numbers in the context.\n" +
      "- Be concise. Use short paragraphs or bullet points when helpful.\n\n" +
      "Context:\n{context}",
  ],
  new MessagesPlaceholder("history"),
  ["human", "{question}"],
]);

const toMessages = (history) =>
  history
    .slice(-config.rag.historyTurns * 2)
    .map((m) => (m.role === "user" ? new HumanMessage(m.content) : new AIMessage(m.content)));

const describeLocation = (meta) => {
  if (meta.page) return `page ${meta.page}`;
  if (meta.rows) return `rows ${meta.rows}`;
  return `section ${meta.chunk}`;
};

const formatContext = (results) =>
  results
    .map(([doc], i) => `[${i + 1}] (${doc.metadata.source}, ${describeLocation(doc.metadata)})\n${doc.pageContent}`)
    .join("\n\n---\n\n");

/**
 * Retrieval-Augmented Generation:
 *   question -> (rewrite with history) -> vector search -> prompt with chunks -> LLM -> answer
 *
 * @returns {Promise<{ answer: string, sources: object[] }>}
 */
export async function answerQuestion({ vectorStore, history, question }) {
  const llm = getChatModel();
  const historyMessages = toMessages(history);

  let searchQuery = question;
  if (historyMessages.length) {
    const condenseChain = condensePrompt.pipe(llm).pipe(new StringOutputParser());
    searchQuery = (await condenseChain.invoke({ history: historyMessages, question })).trim() || question;
  }

  // Each result is [Document, similarityScore].
  const results = await vectorStore.similaritySearchWithScore(searchQuery, config.rag.topK);
  if (!results.length) return { answer: NOT_FOUND_ANSWER, sources: [] };

  const answerChain = answerPrompt.pipe(llm).pipe(new StringOutputParser());
  const answer = (
    await answerChain.invoke({ context: formatContext(results), history: historyMessages, question })
  ).trim();

  const sources = answer.startsWith(NOT_FOUND_ANSWER.slice(0, 30))
    ? []
    : results.map(([doc, score], i) => ({
        ref: i + 1,
        source: doc.metadata.source,
        location: describeLocation(doc.metadata),
        score: Number(score.toFixed(3)),
        excerpt: doc.pageContent.length > 300 ? `${doc.pageContent.slice(0, 300)}…` : doc.pageContent,
      }));

  return { answer, sources };
}

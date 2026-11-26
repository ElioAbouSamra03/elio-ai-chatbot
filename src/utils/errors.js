/**
 * An error that is safe to show to the user, with an HTTP status code.
 */
export class AppError extends Error {
  constructor(message, status = 400, code = "BAD_REQUEST") {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
  }
}

/**
 * Turns errors thrown by the Gemini SDK into friendly AppErrors.
 */
export function toAiError(err) {
  if (err instanceof AppError) return err;
  const msg = String(err?.message || err);

  if (/429|quota|rate limit|RESOURCE_EXHAUSTED/i.test(msg)) {
    return new AppError(
      "The free AI quota is temporarily exhausted. Wait a minute and try again.",
      429,
      "RATE_LIMITED"
    );
  }
  if (/503|overloaded|high demand|UNAVAILABLE/i.test(msg)) {
    return new AppError(
      "Gemini's free servers are busy right now. Please try again in a few seconds.",
      503,
      "AI_BUSY"
    );
  }
  if (/API key|API_KEY_INVALID|PERMISSION_DENIED|401|403/i.test(msg)) {
    return new AppError(
      "The Google API key is missing or invalid. Check GOOGLE_API_KEY in your .env file.",
      401,
      "INVALID_API_KEY"
    );
  }
  if (/404|not found/i.test(msg) && /model/i.test(msg)) {
    return new AppError(
      "The configured Gemini model was not found. Check CHAT_MODEL / EMBEDDING_MODEL in .env.",
      500,
      "MODEL_NOT_FOUND"
    );
  }
  return new AppError("The AI service failed to respond. Please try again.", 502, "AI_ERROR");
}

import { useRef, useState, type FormEvent } from "react";
import "./AIAssistantPage.css";
import { api } from "../api/client";
import type { AIChatResponse } from "../types/api";

const starterQuestions = [
  "Summarize the building right now.",
  "Which zone has the highest CO₂?",
  "Which zones have active alerts?",
  "Which zone is using the most power?",
];

type ConversationMessage =
  | { id: number; role: "user"; text: string }
  | { id: number; role: "assistant"; text: string; response: AIChatResponse };

export function AIAssistantPage() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const submitting = useRef(false);
  const nextMessageId = useRef(0);

  function messageId() {
    nextMessageId.current += 1;
    return nextMessageId.current;
  }

  async function ask(question: string) {
    const trimmed = question.trim();
    if (!trimmed || submitting.current) return;

    submitting.current = true;
    setInput("");
    setMessages((current) => [
      ...current,
      { id: messageId(), role: "user", text: trimmed },
    ]);
    setIsLoading(true);
    setError(null);
    try {
      const response = await api.chat(trimmed);
      setMessages((current) => [
        ...current,
        { id: messageId(), role: "assistant", text: response.answer, response },
      ]);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "The AI assistant is temporarily unavailable.",
      );
    } finally {
      submitting.current = false;
      setIsLoading(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void ask(input);
  }

  return (
    <section className="page assistant-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">BuildingOps tools · Gemini</p>
          <h1>AI Building Assistant</h1>
          <p className="muted">
            Ask operational questions grounded in persisted simulated readings
            and active alerts.
          </p>
        </div>
      </header>
      <aside className="assistant-notice">
        Building readings are simulated. The assistant can inspect read-only
        telemetry and alerts; it cannot control equipment.
      </aside>
      <section
        className="assistant-card"
        aria-label="AI Building Assistant conversation"
      >
        {messages.length === 0 && (
          <div className="assistant-welcome">
            <h2>What would you like to investigate?</h2>
            <div className="assistant-starters" aria-label="Starter questions">
              {starterQuestions.map((question) => (
                <button
                  key={question}
                  className="assistant-starter"
                  type="button"
                  onClick={() => void ask(question)}
                  disabled={isLoading}
                >
                  {question}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.length > 0 && (
          <div className="assistant-conversation" aria-live="polite">
            {messages.map((message) => (
              <article
                key={message.id}
                className={`assistant-message assistant-message--${message.role}`}
              >
                <p className="assistant-message__role">
                  {message.role === "user" ? "You" : "AI Building Assistant"}
                </p>
                <p className="assistant-message__text">{message.text}</p>
                {message.role === "assistant" && (
                  <div className="assistant-message__metadata">
                    <span>
                      {message.response.grounded
                        ? "Grounded in BuildingOps data"
                        : "Assistant status"}
                    </span>
                    {message.response.sources.length > 0 && (
                      <span>
                        Data checked: {message.response.sources.join(", ")}
                      </span>
                    )}
                    <span>Model: {message.response.model}</span>
                  </div>
                )}
              </article>
            ))}
            {isLoading && (
              <div
                className="assistant-message assistant-message--assistant"
                role="status"
              >
                Checking BuildingOps data…
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="assistant-error" role="alert">
            {error}
          </div>
        )}

        <form className="assistant-form" onSubmit={submit}>
          <label htmlFor="assistant-message">Question</label>
          <textarea
            id="assistant-message"
            value={input}
            maxLength={2000}
            rows={3}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Ask about current conditions, alerts, or zone history"
            disabled={isLoading}
          />
          <div className="assistant-form__footer">
            <span>{input.length}/2000</span>
            <button type="submit" disabled={isLoading || !input.trim()}>
              {isLoading ? "Investigating…" : "Send"}
            </button>
          </div>
        </form>
      </section>
    </section>
  );
}

// Chatbot.jsx — Global floating chatbot widget (visible on all pages)
import { useEffect, useRef, useState } from "react";
import { apiFetch, useAuth } from "../App";

const QUICK_QUESTIONS = [
  "How to apply for connection?",
  "How is my bill calculated?",
  "How to file a complaint?",
  "Reconnection procedure?",
];

export default function Chatbot() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([
    { role: "model", text: "👋 नमस्कार! I'm CiviCare Assistant. Ask me anything about water connections, bills, or complaints." }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      inputRef.current?.focus();
    }
  }, [messages, open]);

  // Build history in Gemini format (exclude the greeting to save tokens)
  function buildHistory() {
    return messages.slice(1).map(m => ({ role: m.role, text: m.text }));
  }

  async function sendMessage(text) {
    const msg = (text || input).trim();
    if (!msg || loading) return;
    setInput("");

    const userMsg = { role: "user", text: msg };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    try {
      const endpoint = user ? "/chatbot/message-authenticated" : "/chatbot/message";
      const data = await apiFetch(endpoint, {
        method: "POST",
        body: JSON.stringify({
          message: msg,
          history: buildHistory(),
        }),
      });
      setMessages(prev => [...prev, { role: "model", text: data.response }]);
    } catch {
      setMessages(prev => [...prev, {
        role: "model",
        text: "⚠️ Sorry, I'm having trouble right now. Please try again or call the helpline: 1916."
      }]);
    } finally {
      setLoading(false);
    }
  }

  const showQuickQuestions = messages.length === 1 && !loading;

  return (
    <div className="chatbot-container">
      {open && (
        <div className="chatbot-window">
          <div className="chatbot-header">
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 18 }}>💧</span>
              <div>
                <h4 style={{ margin: 0, fontSize: 14 }}>CiviCare Assistant</h4>
                <div style={{ fontSize: 10, opacity: 0.8 }}>
                  {user ? `${user.name} · ${user.property_number || user.role}` : "Public · No login required"}
                </div>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              style={{ background: "transparent", border: "none", color: "white", cursor: "pointer", fontSize: "1.1rem" }}
            >✕</button>
          </div>

          <div className="chatbot-messages">
            {messages.map((msg, i) => (
              <div key={i} className={`chat-msg ${msg.role === "user" ? "user" : "bot"}`}>
                {msg.text}
              </div>
            ))}
            {loading && (
              <div className="chat-msg bot" style={{ opacity: 0.6 }}>
                <span style={{ display: "inline-flex", gap: 3 }}>
                  <span className="typing-dot" />
                  <span className="typing-dot" style={{ animationDelay: "0.15s" }} />
                  <span className="typing-dot" style={{ animationDelay: "0.3s" }} />
                </span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick question chips — only shown at start */}
          {showQuickQuestions && (
            <div style={{ padding: "0 10px 8px", display: "flex", flexDirection: "column", gap: 5 }}>
              {QUICK_QUESTIONS.map((q) => (
                <button
                  key={q}
                  onClick={() => sendMessage(q)}
                  style={{
                    background: "var(--amber-50)", border: "1px solid var(--amber-200)",
                    borderRadius: 8, padding: "6px 10px", fontSize: "0.78rem",
                    cursor: "pointer", textAlign: "left", color: "var(--amber-700)",
                  }}
                >
                  {q}
                </button>
              ))}
            </div>
          )}

          <div className="chatbot-input">
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && sendMessage()}
              placeholder="Ask in English, मराठी, or हिंदी..."
              disabled={loading}
            />
            <button onClick={() => sendMessage()} disabled={loading || !input.trim()}>
              Send
            </button>
          </div>
        </div>
      )}

      <button
        className="chatbot-button"
        onClick={() => setOpen(o => !o)}
        title="Chat with CiviCare Assistant"
      >
        {open ? "✕" : "💬"}
      </button>
    </div>
  );
}

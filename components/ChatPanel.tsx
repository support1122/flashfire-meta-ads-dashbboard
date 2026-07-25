"use client";

import { useState, useRef, useEffect } from "react";
import { MessageCircle, X, Send } from "lucide-react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export default function ChatPanel() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send() {
    const msg = input.trim();
    if (!msg || loading) return;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: msg }]);
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg }),
      });
      const json = await res.json();
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: json.answer ?? json.error ?? "Something went wrong." },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Failed to reach the server." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 bg-[var(--accent)] text-white rounded-full w-11 h-11 flex items-center justify-center shadow-lg hover:opacity-90 transition-opacity z-50"
        aria-label="Open chat"
      >
        <MessageCircle size={18} />
      </button>

      {open && (
        <div className="fixed bottom-20 right-5 w-80 max-h-[480px] bg-[var(--surface)] border border-[var(--border)] rounded-[12px] shadow-xl flex flex-col z-50">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
            <div className="text-[13px] font-semibold">Ask about your ads</div>
            <button onClick={() => setOpen(false)} className="text-[var(--text-muted)] hover:text-[var(--text)]">
              <X size={14} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5">
            {messages.length === 0 && (
              <p className="text-[12px] text-[var(--text-muted)] text-center mt-4">
                Ask anything about your Meta ads performance.
              </p>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] rounded-lg px-3 py-2 text-[12px] leading-relaxed ${
                    m.role === "user"
                      ? "bg-[var(--accent)] text-white"
                      : "bg-[var(--surface-2)] text-[var(--text)]"
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-[var(--surface-2)] rounded-lg px-3 py-2 text-[12px] text-[var(--text-muted)]">
                  Thinking…
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <div className="flex gap-2 px-3 py-3 border-t border-[var(--border)]">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder="Ask a question…"
              className="flex-1 border border-[var(--border)] rounded-lg px-3 py-1.5 text-[12px] bg-[var(--surface)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
            />
            <button
              onClick={send}
              disabled={loading || !input.trim()}
              className="bg-[var(--accent)] text-white rounded-lg px-3 py-1.5 hover:opacity-90 disabled:opacity-40 transition-opacity"
            >
              <Send size={13} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}

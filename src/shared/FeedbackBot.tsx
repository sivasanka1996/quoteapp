import { useState } from "react";
import { FEEDBACK_STATUS_LABEL, type FeedbackStatus } from "../types";
import { useFeedback } from "./useFeedback";
import { formatDate } from "../format";
import "./FeedbackBot.css";

// Floating "report a problem" bot — see docs/feedbackbot.md. Writes to the
// open `feedback` collection; a GitHub Actions bot picks up pending entries,
// makes the code change, and pushes it live on its own. No review gate here
// by design — Siva's call, see docs/feedbackbot.md's "Decisions made".
export function FeedbackBot() {
  const { feedback, addFeedback } = useFeedback();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [justSent, setJustSent] = useState(false);

  async function handleSend() {
    if (!text.trim() || sending) return;
    setSending(true);
    await addFeedback(text, window.location.pathname);
    setSending(false);
    setText("");
    setJustSent(true);
    setTimeout(() => setJustSent(false), 2500);
  }

  return (
    <>
      <button
        className="fb-fab"
        onClick={() => setOpen(true)}
        aria-label="Give feedback"
      >
        <BotIcon />
      </button>

      {open && (
        <div className="fb-overlay" onClick={() => setOpen(false)}>
          <div className="fb-panel" onClick={(e) => e.stopPropagation()}>
            <div className="fb-top">
              <div className="fb-ident">
                <h2>Feedback</h2>
                <p className="fb-sub">
                  Tell it what's wrong or what you want changed — it reads the
                  code, fixes it, and the app updates on its own.
                </p>
              </div>
              <button className="fb-close" onClick={() => setOpen(false)} aria-label="Close">
                ×
              </button>
            </div>

            <div className="fb-compose">
              <textarea
                className="fb-input"
                value={text}
                placeholder="e.g. the discount field should start at 0, not blank…"
                onChange={(e) => setText(e.target.value)}
                rows={3}
              />
              <button
                className="fb-send"
                onClick={handleSend}
                disabled={!text.trim() || sending}
              >
                {sending ? "Sending…" : justSent ? "Sent ✓" : "Send feedback"}
              </button>
            </div>

            {feedback.length > 0 && (
              <div className="fb-history">
                <h3>Recent feedback</h3>
                <div className="fb-list">
                  {feedback.slice(0, 15).map((f) => (
                    <div className="fb-row" key={f.id}>
                      <div className="fb-row-top">
                        <span className={`fb-badge fb-badge-${f.status}`}>
                          {FEEDBACK_STATUS_LABEL[f.status as FeedbackStatus]}
                        </span>
                        <span className="fb-row-date">{formatDate(f.createdAt)}</span>
                      </div>
                      <p className="fb-row-text">{f.text}</p>
                      {f.result && <p className="fb-row-result">{f.result}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function BotIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="8" width="16" height="12" rx="3" />
      <path d="M12 8V4M9 4h6" />
      <circle cx="9" cy="14" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="15" cy="14" r="1.2" fill="currentColor" stroke="none" />
      <path d="M9 17.5h6" />
    </svg>
  );
}

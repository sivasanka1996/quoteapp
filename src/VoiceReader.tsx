import { useState } from "react";
import "./VoiceReader.css";

export interface VoiceItem {
  name: string;
  qty: number;
  rate: number | null;
}

interface Props {
  onAdd: (item: VoiceItem) => void;
  onClose: () => void;
}

type Stage = "idle" | "listening" | "confirming" | "error";

// Declare browser SpeechRecognition types
interface ISpeechRecognition extends EventTarget {
  lang: string; continuous: boolean; interimResults: boolean; maxAlternatives: number;
  start(): void; stop(): void;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}
declare global {
  interface Window {
    SpeechRecognition: new () => ISpeechRecognition;
    webkitSpeechRecognition: new () => ISpeechRecognition;
  }
}

function parseTranscript(text: string): VoiceItem {
  const t = text.trim();

  // Extract leading number as qty: "6 wire" or "6- wire"
  const qtyMatch = t.match(/^(\d+)\s*[-–]?\s+/);
  const qty = qtyMatch ? parseInt(qtyMatch[1]) : 1;
  const rest = (qtyMatch ? t.slice(qtyMatch[0].length) : t).trim();

  // Extract rate after keywords or trailing number
  const rateMatch =
    rest.match(/(?:rate|at|₹|rs\.?|price)\s*(\d[\d,]*(?:\.\d+)?)\s*$/i) ||
    rest.match(/\s+(\d[\d,]*(?:\.\d+)?)\s*$/);
  const rate = rateMatch ? parseFloat(rateMatch[1].replace(/,/g, "")) : null;
  const name = (rateMatch
    ? rest.slice(0, rest.length - rateMatch[0].length)
    : rest
  ).trim();

  return { name: name || t, qty, rate };
}

export function VoiceReaderPanel({ onAdd, onClose }: Props) {
  const [stage, setStage] = useState<Stage>("idle");
  const [transcript, setTranscript] = useState("");
  const [item, setItem] = useState<VoiceItem>({ name: "", qty: 1, rate: null });
  const [error, setError] = useState("");

  function startListening() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      setError("Voice input is not supported in this browser. Try Chrome.");
      setStage("error");
      return;
    }

    const recognition = new SR();
    recognition.lang = "te-IN"; // Telugu + English mix
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    setStage("listening");
    setError("");

    recognition.onresult = (e) => {
      const text = e.results[0][0].transcript;
      setTranscript(text);
      setItem(parseTranscript(text));
      setStage("confirming");
    };

    recognition.onerror = (e) => {
      if (e.error === "no-speech") {
        setError("No speech detected — try again.");
      } else if (e.error === "not-allowed") {
        setError("Microphone permission denied. Please allow mic access.");
      } else {
        setError(`Voice error: ${e.error}`);
      }
      setStage("error");
    };

    recognition.onend = () => {
      if (stage === "listening") setStage("idle");
    };

    recognition.start();
  }

  function handleAdd() {
    if (item.name.trim()) {
      onAdd(item);
      onClose();
    }
  }

  return (
    <div className="vr-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="vr-panel">
        <div className="vr-header">
          <span className="vr-title">Add by voice</span>
          <button className="vr-close" onClick={onClose}>✕</button>
        </div>

        {(stage === "idle" || stage === "error") && (
          <div className="vr-prompt">
            <button className="vr-mic-btn" onClick={startListening}>
              🎤
              <span>Tap and speak</span>
              <small>e.g. "6 wire 1.5sq rate 1650"</small>
            </button>
            {error && <p className="vr-error-text">{error}</p>}
            <p className="vr-hint">Telugu and English both work</p>
          </div>
        )}

        {stage === "listening" && (
          <div className="vr-listening">
            <div className="vr-pulse">🎤</div>
            <span>Listening…</span>
            <small>Speak now</small>
          </div>
        )}

        {stage === "confirming" && (
          <div className="vr-confirm">
            <div className="vr-heard">
              <span className="vr-heard-label">I heard:</span>
              <span className="vr-heard-text">"{transcript}"</span>
            </div>

            <div className="vr-fields">
              <label className="vr-field">
                <span>Item name</span>
                <input
                  className="vr-input-name"
                  value={item.name}
                  placeholder="Item name"
                  onChange={(e) => setItem((p) => ({ ...p, name: e.target.value }))}
                />
              </label>
              <div className="vr-field-row">
                <label className="vr-field">
                  <span>Qty</span>
                  <input
                    className="vr-input-num"
                    value={item.qty}
                    inputMode="numeric"
                    onChange={(e) => setItem((p) => ({ ...p, qty: parseInt(e.target.value) || 1 }))}
                  />
                </label>
                <label className="vr-field">
                  <span>Rate</span>
                  <input
                    className="vr-input-num"
                    value={item.rate ?? ""}
                    inputMode="decimal"
                    placeholder="—"
                    onChange={(e) =>
                      setItem((p) => ({
                        ...p,
                        rate: e.target.value.trim() === "" ? null : parseFloat(e.target.value) || null,
                      }))
                    }
                  />
                </label>
              </div>
            </div>

            <button className="vr-add-btn" onClick={handleAdd} disabled={!item.name.trim()}>
              Add to quote
            </button>
            <button className="vr-retry-btn" onClick={startListening}>
              🎤 Try again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

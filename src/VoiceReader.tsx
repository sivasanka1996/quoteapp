import { useEffect, useRef, useState } from "react";
import {
  parseTranscript,
  VOICE_LANG_KEY,
  type VoiceItem,
  type VoiceLang,
} from "./voiceParse";
import "./VoiceReader.css";

export type { VoiceItem } from "./voiceParse";

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

export function VoiceReaderPanel({ onAdd, onClose }: Props) {
  const [stage, setStage] = useState<Stage>("idle");
  const [transcript, setTranscript] = useState("");
  const [alternatives, setAlternatives] = useState<string[]>([]);
  const [item, setItem] = useState<VoiceItem>({ name: "", qty: 1, rate: null });
  const [error, setError] = useState("");
  const [lang, setLang] = useState<VoiceLang>(
    () =>
      (localStorage.getItem(VOICE_LANG_KEY) as VoiceLang | null) ?? "en-IN"
  );

  // onend reads stage through a ref — a captured `stage` is stale by the time
  // recognition ends, which used to leave the panel stuck on "Listening…"
  const stageRef = useRef(stage);
  useEffect(() => {
    stageRef.current = stage;
  }, [stage]);

  function pickLang(next: VoiceLang) {
    setLang(next);
    localStorage.setItem(VOICE_LANG_KEY, next);
  }

  function applyTranscript(text: string) {
    setTranscript(text);
    setItem(parseTranscript(text));
  }

  function startListening() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      setError("Voice input is not supported in this browser. Try Chrome.");
      setStage("error");
      return;
    }

    const recognition = new SR();
    // One model only — the Web Speech API has no mixed-language mode. en-IN
    // handles Indian-accented English and returns Latin script + ASCII digits.
    recognition.lang = lang;
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 3;

    setStage("listening");
    setError("");
    setAlternatives([]);

    recognition.onresult = (e) => {
      const result = e.results[0];
      const heard: string[] = [];
      for (let i = 0; i < result.length; i++) {
        const alt = result[i]?.transcript?.trim();
        if (alt && !heard.includes(alt)) heard.push(alt);
      }
      applyTranscript(heard[0] ?? "");
      setAlternatives(heard);
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
      if (stageRef.current === "listening") setStage("idle");
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
            <LangToggle lang={lang} onPick={pickLang} />
            <button className="vr-mic-btn" onClick={startListening}>
              🎤
              <span>Tap and speak</span>
              <small>
                {lang === "en-IN"
                  ? 'e.g. "6 wire 1.5sq rate 1650"'
                  : 'ఉదా. "6 వైర్ 1.5sq రేటు 1650"'}
              </small>
            </button>
            {error && <p className="vr-error-text">{error}</p>}
            <p className="vr-hint">
              {lang === "en-IN"
                ? "Speaking English keeps item names in English"
                : "పేర్లు తెలుగులో వస్తాయి — కస్టమర్ కోట్‌లో మార్చాల్సి ఉంటుంది"}
            </p>
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

            {alternatives.length > 1 && (
              <div className="vr-alts">
                <span className="vr-alts-label">Or did you mean:</span>
                <div className="vr-alts-row">
                  {alternatives
                    .filter((a) => a !== transcript)
                    .map((alt) => (
                      <button
                        key={alt}
                        className="vr-alt-chip"
                        onClick={() => applyTranscript(alt)}
                      >
                        {alt}
                      </button>
                    ))}
                </div>
              </div>
            )}

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
            <LangToggle lang={lang} onPick={pickLang} />
            <button className="vr-retry-btn" onClick={startListening}>
              🎤 Try again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function LangToggle({
  lang,
  onPick,
}: {
  lang: VoiceLang;
  onPick: (l: VoiceLang) => void;
}) {
  return (
    <div className="vr-lang" role="group" aria-label="Speech language">
      <button
        className={`vr-lang-btn ${lang === "en-IN" ? "is-active" : ""}`}
        aria-pressed={lang === "en-IN"}
        onClick={() => onPick("en-IN")}
      >
        English
      </button>
      <button
        className={`vr-lang-btn ${lang === "te-IN" ? "is-active" : ""}`}
        aria-pressed={lang === "te-IN"}
        onClick={() => onPick("te-IN")}
      >
        తెలుగు
      </button>
    </div>
  );
}

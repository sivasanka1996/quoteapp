import { useEffect, useRef, useState } from "react";
import {
  parseTranscript,
  VOICE_LANG_KEY,
  type VoiceItem,
  type VoiceLang,
} from "./voiceParse";
import { parseQty } from "./types";
import { log } from "./log/logger";
import "./VoiceReader.css";

export type { VoiceItem } from "./voiceParse";

interface Props {
  onAdd: (item: VoiceItem) => void;
  onClose: () => void;
}

/**
 * `starting` exists because the microphone is not instant.
 *
 * Measured in Chrome on 2026-08-12: `start()` returned immediately but
 * `audiostart` did not fire for **3785ms**. The panel used to jump straight to
 * "Listening… Speak now", so a short phrase — which is what an order line is —
 * was finished and gone before Chrome was recording anything. The mic then
 * opened, caught the tail of the room, and reported that it heard a sound but
 * no words. Long rambling sentences worked, which is what made it look random.
 *
 * Nothing may invite Dad to speak until `audiostart` has actually fired.
 */
type Stage = "idle" | "starting" | "listening" | "confirming" | "error";

// Declare browser SpeechRecognition types
interface ISpeechRecognition extends EventTarget {
  lang: string; continuous: boolean; interimResults: boolean; maxAlternatives: number;
  start(): void; stop(): void;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  // The lifecycle events, declared because they are the only way to tell three
  // very different failures apart: the microphone never opened, it opened but
  // no sound arrived, or sound arrived and was not recognised as words.
  onaudiostart: (() => void) | null;
  onsoundstart: (() => void) | null;
  onspeechstart: (() => void) | null;
}

/**
 * What to tell Dad for each Web Speech error code.
 *
 * `network` matters more than it looks: Chrome does not recognise speech on the
 * device, it uploads the audio to Google. No signal means no voice input, and
 * "Voice error: network" does not tell anyone that.
 */
function messageForError(code: string, lang: VoiceLang): string {
  switch (code) {
    case "no-speech":
      return "No speech detected — try again.";
    case "not-allowed":
    case "service-not-allowed":
      return "Microphone permission denied. Please allow mic access.";
    case "audio-capture":
      return "No microphone found. Check one is connected and not in use by another app.";
    case "network":
      return "Voice input needs an internet connection — the browser sends the audio to Google to recognise it.";
    case "language-not-supported":
      return lang === "te-IN"
        ? "This browser cannot recognise Telugu. Switch to English and try again."
        : "This browser cannot recognise English (India). Switch language and try again.";
    case "aborted":
      return "Listening was interrupted before anything was said.";
    default:
      return `Voice error: ${code}`;
  }
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
  // Qty/rate held as the text being typed, parsed only at commit (handleAdd).
  // A number re-parsed on every keystroke gets its DOM value stomped by React
  // mid-edit — "2." becomes "2" before the "5" is ever typed, silently turning
  // 2.5 into 25 (and, with the old `|| 1` fallback, "0." into 1).
  const [qtyRaw, setQtyRaw] = useState("1");
  const [rateRaw, setRateRaw] = useState("");
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

  // Per-session facts, so `onend` can say WHY nothing came back rather than
  // dropping silently to idle.
  const heardSoundRef = useRef(false);
  const gotSpeechRef = useRef(false);
  /** The best transcript so far, final or not — see `onend`. */
  const salvageRef = useRef<string[]>([]);
  /** Live words while speaking, so the mic is visibly working. */
  const [interim, setInterim] = useState("");

  function pickLang(next: VoiceLang) {
    setLang(next);
    localStorage.setItem(VOICE_LANG_KEY, next);
  }

  function applyTranscript(text: string) {
    setTranscript(text);
    const parsed = parseTranscript(text);
    setItem(parsed);
    setQtyRaw(String(parsed.qty));
    setRateRaw(parsed.rate != null ? String(parsed.rate) : "");
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
    // On, so the words appear as they are spoken. Two reasons, both learned the
    // hard way: it is the only feedback that the mic is genuinely live, and a
    // session that ends without a FINAL result still leaves something to
    // salvage rather than throwing away words Chrome had already recognised.
    recognition.interimResults = true;
    recognition.maxAlternatives = 3;

    setStage("starting");
    setError("");
    setAlternatives([]);
    setInterim("");
    heardSoundRef.current = false;
    gotSpeechRef.current = false;
    salvageRef.current = [];
    const startedAt = Date.now();
    log.info("voice", "listening started", { lang });

    // Diagnostics, not decoration. Voice is the one feature no automated check
    // in this repo can reach — it needs a human at a microphone — so when it
    // fails for Dad in a shop, these three lines are the only evidence there
    // will ever be about which half broke.
    // THE moment that matters: not before this is anything being recorded.
    recognition.onaudiostart = () => {
      setStage("listening");
      log.info("voice", "microphone opened", { lang, ms: Date.now() - startedAt });
    };
    recognition.onsoundstart = () => {
      heardSoundRef.current = true;
      log.debug("voice", "sound detected", { lang });
    };
    recognition.onspeechstart = () => {
      gotSpeechRef.current = true;
      log.debug("voice", "speech detected", { lang });
    };

    recognition.onresult = (e) => {
      // With interim results on, the last entry is the newest state of the
      // utterance — earlier ones are superseded drafts of the same words.
      const result = e.results[e.results.length - 1] ?? e.results[0];
      if (!result) return;

      const heard: string[] = [];
      for (let i = 0; i < result.length; i++) {
        const alt = result[i]?.transcript?.trim();
        if (alt && !heard.includes(alt)) heard.push(alt);
      }
      if (heard.length === 0) return;

      // Kept whether final or not, so `onend` has something to fall back on.
      salvageRef.current = heard;

      if (!result.isFinal) {
        setInterim(heard[0]);
        return;
      }

      finish(heard, "final result");
    };

    /** Commit a transcript and move to the confirm screen. */
    function finish(heard: string[], why: string) {
      applyTranscript(heard[0] ?? "");
      setAlternatives(heard);
      setInterim("");
      setStage("confirming");
      log.info("voice", "transcript received", {
        lang,
        why,
        alternatives: heard.length,
        transcript: heard[0] ?? "",
        ms: Date.now() - startedAt,
      });
    }

    recognition.onerror = (e) => {
      setError(messageForError(e.error, lang));
      setStage("error");
      log.warn("voice", "recognition error", {
        lang,
        error: e.error,
        heardSound: heardSoundRef.current,
        ms: Date.now() - startedAt,
      });
    };

    recognition.onend = () => {
      log.info("voice", "recognition ended", {
        lang,
        stage: stageRef.current,
        heardSound: heardSoundRef.current,
        gotSpeech: gotSpeechRef.current,
        ms: Date.now() - startedAt,
      });

      // Still mid-session here means recognition stopped without a FINAL
      // result and without an error — Chrome does this. Anything already
      // recognised is used rather than thrown away; only a genuinely empty
      // session becomes a message, and it names which half failed.
      if (stageRef.current === "starting" || stageRef.current === "listening") {
        if (salvageRef.current.length > 0) {
          finish(salvageRef.current, "salvaged on end, no final result");
          return;
        }
        setError(
          heardSoundRef.current
            ? "Heard something but could not make out any words. Wait for “Listening” before you start speaking, then try again."
            : "The microphone did not pick up any sound. Check it is not muted or in use by another app, then try again."
        );
        setStage("error");
      }
    };

    try {
      recognition.start();
    } catch (e) {
      // start() throws if a previous recognition is still running.
      setError("Voice input is already running — wait a moment and try again.");
      setStage("error");
      log.error("voice", "could not start recognition", e, { lang });
    }
  }

  function handleAdd() {
    if (item.name.trim()) {
      onAdd({
        name: item.name,
        qty: parseQty(qtyRaw) || 1,
        rate: rateRaw.trim() === "" ? null : (parseFloat(rateRaw) || null),
      });
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

        {/* Deliberately does NOT say "speak" — the mic is not open yet, and
            anything said now is not being recorded. */}
        {stage === "starting" && (
          <div className="vr-listening vr-starting">
            <div className="vr-pulse">⏳</div>
            <span>Starting microphone…</span>
            <small>Wait for “Listening”</small>
          </div>
        )}

        {stage === "listening" && (
          <div className="vr-listening">
            <div className="vr-pulse">🎤</div>
            <span>Listening…</span>
            {interim ? (
              <small className="vr-interim">“{interim}”</small>
            ) : (
              <small>Speak now</small>
            )}
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
                    value={qtyRaw}
                    inputMode="decimal"
                    onChange={(e) => setQtyRaw(e.target.value)}
                  />
                </label>
                <label className="vr-field">
                  <span>Rate</span>
                  <input
                    className="vr-input-num"
                    value={rateRaw}
                    inputMode="decimal"
                    placeholder="—"
                    onChange={(e) => setRateRaw(e.target.value)}
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

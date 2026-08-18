import { useEffect, useRef, useState } from "react";
import {
  parseTranscript,
  parseIntent,
  VOICE_LANG_KEY,
  type VoiceItem,
  type VoiceLang,
} from "./voiceParse";
import { matchLines, isAmbiguous, type LineMatch } from "./parse/matchLines";
import { parseQty } from "./types";
import { log } from "./log/logger";
import "./VoiceReader.css";

export type { VoiceItem } from "./voiceParse";

interface Props {
  onAdd: (item: VoiceItem) => void;
  /** The quote's current lines, so a spoken change can find its target. */
  lines: { id: number; name: string }[];
  onSet: (id: number, field: "rate" | "qty", value: number) => void;
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

export function VoiceReaderPanel({ onAdd, lines, onSet, onClose }: Props) {
  const [stage, setStage] = useState<Stage>("idle");
  const [transcript, setTranscript] = useState("");
  const [alternatives, setAlternatives] = useState<string[]>([]);
  const [item, setItem] = useState<VoiceItem>({ name: "", qty: 1, rate: null });
  // A spoken "change X to Y" waiting on Dad to confirm which line, or that he
  // meant to change one at all — nothing reaches the quote without this step,
  // same as every other voice path in this panel.
  const [pendingSet, setPendingSet] = useState<
    { field: "rate" | "qty"; value: number; choices: LineMatch[] } | null
  >(null);
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
  const warmStreamRef = useRef<MediaStream | null>(null);

  /** The running session, so the Stop button can end it. */
  const recognitionRef = useRef<ISpeechRecognition | null>(null);
  /** True once Dad has tapped Stop — suppresses the keep-listening restart. */
  const stoppingRef = useRef(false);
  /** Everything finalised so far, across pauses and restarts. */
  const finalTextRef = useRef("");
  /** How many separate utterances make up `finalTextRef`. */
  const segmentsRef = useRef(0);
  const restartsRef = useRef(0);

  /**
   * Open the microphone as soon as the panel appears, before it is needed.
   *
   * THE MEASUREMENT THIS EXISTS FOR: `recognition.start()` returned instantly
   * but `audiostart` did not fire for **3785ms**, and nothing is recorded until
   * it does. Most of that is the operating system bringing up a cold audio
   * device — a cost paid once, not per recognition.
   *
   * So it is paid here instead, during the second or two Dad spends looking at
   * the panel and deciding what to say, rather than after he has tapped and
   * started talking. The stream is held (not stopped immediately) so the device
   * stays up for a retry, and released the moment the panel closes.
   *
   * It also moves the permission prompt to panel-open, which is the better
   * place for it: being asked before speaking beats being asked after.
   *
   * Best effort by design. If this fails the panel still works exactly as it
   * did — `startListening` makes no assumption that it succeeded.
   */
  useEffect(() => {
    let cancelled = false;
    const startedAt = Date.now();

    navigator.mediaDevices
      ?.getUserMedia({ audio: true })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        warmStreamRef.current = stream;
        log.info("voice", "microphone warmed", { ms: Date.now() - startedAt });
      })
      .catch((e: unknown) => {
        // Not fatal: recognition will ask for the mic itself and report its own
        // error. Worth a line, because a denial here explains a later failure.
        log.warn("voice", "could not warm the microphone", {
          reason: e instanceof Error ? e.name : String(e),
          ms: Date.now() - startedAt,
        });
      });

    return () => {
      cancelled = true;
      warmStreamRef.current?.getTracks().forEach((t) => t.stop());
      warmStreamRef.current = null;
      // Closing the panel must release the microphone. Without this, a
      // continuous session keeps the recording indicator lit after the sheet
      // has gone, and the restart loop above would keep reopening it.
      stoppingRef.current = true;
      try {
        recognitionRef.current?.stop();
      } catch {
        /* already stopped */
      }
      recognitionRef.current = null;
    };
  }, []);

  function pickLang(next: VoiceLang) {
    setLang(next);
    localStorage.setItem(VOICE_LANG_KEY, next);
  }

  /** Puts a parsed item on screen — shared by the first transcript and by
   *  picking an alternative off the confirm screen. */
  function applyItem(text: string, parsed: VoiceItem) {
    setTranscript(text);
    setItem(parsed);
    setQtyRaw(String(parsed.qty));
    setRateRaw(parsed.rate != null ? String(parsed.rate) : "");
  }

  // Used by the alternatives chips on the confirm screen. Deliberately still
  // goes straight to parseTranscript, not parseIntent: by the time a chip is
  // tappable, intent has already been decided as "add" (a "set" never reaches
  // the confirm screen — see `finish` below), so re-parsing here only ever
  // needs to redo the item/qty/rate split.
  function applyTranscript(text: string) {
    applyItem(text, parseTranscript(text));
  }

  function startListening() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      setError("Voice input is not supported in this browser. Try Chrome.");
      setStage("error");
      return;
    }

    const recognition = new SR();
    recognitionRef.current = recognition;
    // One model only — the Web Speech API has no mixed-language mode. en-IN
    // handles Indian-accented English and returns Latin script + ASCII digits.
    recognition.lang = lang;
    // ON, so the microphone belongs to Dad rather than to Google's endpointer.
    //
    // With this false, the speech service decides when you have finished — it
    // finalises at the first pause it judges long enough, and that judgement
    // shifts with background noise and how confident it is that the sentence is
    // complete. The API exposes no threshold to tune. In practice a line got
    // cut off the moment Dad drew breath, which is exactly when someone reading
    // an order slip aloud pauses to find the next line.
    //
    // Continuous means it keeps listening across pauses and stops when told.
    recognition.continuous = true;
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
    setPendingSet(null);
    heardSoundRef.current = false;
    gotSpeechRef.current = false;
    salvageRef.current = [];
    stoppingRef.current = false;
    finalTextRef.current = "";
    segmentsRef.current = 0;
    restartsRef.current = 0;
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
      // In continuous mode `results` accumulates across the whole session, and
      // `resultIndex` marks what is new since the last event. Anything before
      // it is already banked in finalTextRef.
      let pending = "";
      let lastAlternatives: string[] = [];

      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        if (!result) continue;
        const text = result[0]?.transcript?.trim() ?? "";
        if (!text) continue;

        if (result.isFinal) {
          finalTextRef.current = `${finalTextRef.current} ${text}`.trim();
          segmentsRef.current += 1;
          const alts: string[] = [];
          for (let j = 0; j < result.length; j++) {
            const alt = result[j]?.transcript?.trim();
            if (alt && !alts.includes(alt)) alts.push(alt);
          }
          lastAlternatives = alts;
        } else {
          pending = `${pending} ${text}`.trim();
        }
      }

      // Everything heard so far, banked plus in-flight, shown live.
      const sofar = `${finalTextRef.current} ${pending}`.trim();
      if (sofar) {
        setInterim(sofar);
        // Alternatives are only meaningful while the whole utterance is one
        // segment. Once Dad has paused, they describe a fragment, so the
        // combined text is the only honest single option.
        salvageRef.current =
          segmentsRef.current <= 1 && lastAlternatives.length > 0
            ? lastAlternatives
            : [sofar];
      }
      // Deliberately does NOT finish here. Dad decides when he is done.
    };

    /**
     * Commit a transcript.
     *
     * A spoken change ("change wire rate to 1800") that matches a line in the
     * quote goes to the disambiguation/confirm step below instead of the
     * normal add screen. Everything else — including a change that matched
     * nothing — takes the add path exactly as before.
     */
    function finish(heard: string[], why: string) {
      const finalText = heard[0] ?? "";
      const intent = parseIntent(finalText);

      if (intent.kind === "set") {
        const matches = matchLines(intent.target, lines);
        if (matches.length > 0) {
          // One clear winner still goes to the confirm step — nothing reaches
          // the quote without Dad seeing it first, which is how this panel
          // has always worked.
          setTranscript(finalText);
          setInterim("");
          setStage("idle");
          setPendingSet({ field: intent.field, value: intent.value, choices: matches.slice(0, 4) });
          log.info("voice", "set intent matched", {
            lang,
            why,
            field: intent.field,
            value: intent.value,
            choices: matches.length,
            ms: Date.now() - startedAt,
          });
          return;
        }
        // Nothing matched, so this was probably an item name after all. Fall
        // through and treat it as an add rather than telling him it failed.
      }

      applyItem(finalText, intent.kind === "add" ? intent.item : parseTranscript(finalText));
      setAlternatives(heard);
      setInterim("");
      setStage("confirming");
      log.info("voice", "transcript received", {
        lang,
        why,
        alternatives: heard.length,
        transcript: finalText,
        ms: Date.now() - startedAt,
      });
    }

    recognition.onerror = (e) => {
      // A silent stretch is not a failure any more — it is Dad thinking, or
      // finding the next line on the slip. `onend` follows and puts the
      // microphone straight back. Anything else is a real error.
      if (e.error === "no-speech" && !stoppingRef.current) {
        log.debug("voice", "no speech yet, still listening", { lang });
        return;
      }
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
        stopped: stoppingRef.current,
        heardSound: heardSoundRef.current,
        gotSpeech: gotSpeechRef.current,
        chars: finalTextRef.current.length,
        ms: Date.now() - startedAt,
      });

      if (stageRef.current !== "starting" && stageRef.current !== "listening") {
        return;
      }

      // Dad tapped Stop, or Chrome ended by itself with words already banked.
      if (stoppingRef.current || salvageRef.current.length > 0) {
        if (salvageRef.current.length > 0) {
          finish(salvageRef.current, stoppingRef.current ? "stopped by user" : "ended with words banked");
          return;
        }
        setError(
          heardSoundRef.current
            ? "Heard something but could not make out any words. Try again."
            : "The microphone did not pick up any sound. Check it is not muted or in use by another app, then try again."
        );
        setStage("error");
        return;
      }

      // Nothing said yet and Dad has not tapped Stop, so he is not finished.
      // Chrome gives up on silence; put the microphone straight back rather
      // than making him tap again. Capped, so a dead mic cannot spin forever.
      if (restartsRef.current < 5) {
        restartsRef.current += 1;
        log.info("voice", "still waiting, restarting the microphone", {
          lang,
          restart: restartsRef.current,
        });
        try {
          recognition.start();
          return;
        } catch (err) {
          log.warn("voice", "could not restart", { reason: String(err) });
        }
      }

      setError(
        heardSoundRef.current
          ? "Heard something but could not make out any words. Try again."
          : "Did not hear anything. Tap the microphone and speak when it says Listening."
      );
      setStage("error");
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

  /**
   * Dad says when he is finished.
   *
   * `stop()` rather than `abort()`: stop finalises the audio already captured
   * and delivers it, abort throws it away. The last word spoken before the tap
   * must survive the tap.
   */
  function stopListening() {
    stoppingRef.current = true;
    log.info("voice", "stop tapped", { lang, chars: finalTextRef.current.length });
    try {
      recognitionRef.current?.stop();
    } catch (e) {
      log.warn("voice", "could not stop cleanly", { reason: String(e) });
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
          <span className="vr-title">{pendingSet ? "Change by voice" : "Add by voice"}</span>
          <button className="vr-close" onClick={onClose}>✕</button>
        </div>

        {(stage === "idle" || stage === "error") && !pendingSet && (
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
          <button
            type="button"
            className="vr-listening vr-stop-btn"
            onClick={stopListening}
          >
            <div className="vr-pulse">🎤</div>
            <span>Listening… tap to finish</span>
            {interim ? (
              <small className="vr-interim">“{interim}”</small>
            ) : (
              <small>Speak now — pause as long as you like</small>
            )}
          </button>
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

        {pendingSet && (
          <div className="vr-set">
            <div className="vr-set-hd">
              {isAmbiguous(pendingSet.choices)
                ? "Which item did you mean?"
                : "Change this item?"}
            </div>
            {pendingSet.choices.map((c) => (
              <button
                key={c.id}
                className="vr-set-choice"
                onClick={() => {
                  onSet(c.id, pendingSet.field, pendingSet.value);
                  setPendingSet(null);
                  onClose();
                }}
              >
                <span className="vr-set-name">{c.name || "(unnamed item)"}</span>
                <span className="vr-set-change">
                  {pendingSet.field === "rate" ? "rate" : "qty"} → {pendingSet.value}
                </span>
              </button>
            ))}
            <button className="vr-set-cancel" onClick={() => setPendingSet(null)}>
              Cancel
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

import { useRef, useState } from "react";
import { type CompanySettings } from "./useCompanySettings";
import { exportLogs } from "./log/export";
import { isDebugEnabled, setDebug, log } from "./log/logger";
import * as LogBuffer from "./log/buffer";
import { clearPersisted } from "./log/idb";
import "./CompanySettings.css";

interface Props {
  settings: CompanySettings;
  onChange: (patch: Partial<CompanySettings>) => void;
  onClose: () => void;
}

export function CompanySettingsPanel({ settings, onChange, onClose }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [debugOn, setDebugOn] = useState(isDebugEnabled());
  const [logNote, setLogNote] = useState("");
  const [logCount, setLogCount] = useState(LogBuffer.count());

  function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      onChange({ logoDataUrl: reader.result as string });
    };
    reader.readAsDataURL(file);
  }

  function handleExport(kind: "info" | "error") {
    const n = exportLogs(kind);
    setLogNote(
      n > 0
        ? `Saved ${n} line${n === 1 ? "" : "s"} to your Downloads folder.`
        : "Nothing to export yet."
    );
  }

  function handleToggleDebug() {
    const next = !debugOn;
    setDebug(next);
    setDebugOn(next);
    log.info("ui", `detailed logging turned ${next ? "on" : "off"}`);
    setLogCount(LogBuffer.count());
    setLogNote(
      next
        ? "Detailed logging is on. Do the thing that went wrong, then export."
        : "Detailed logging is off."
    );
  }

  async function handleClearLogs() {
    LogBuffer.clear();
    await clearPersisted();
    setLogCount(0);
    setLogNote("Cleared.");
  }

  return (
    <div className="cs-overlay" onClick={onClose}>
      <div className="cs-panel" onClick={(e) => e.stopPropagation()}>
        <div className="cs-header">
          <h2>Company Details</h2>
          <button className="cs-close" onClick={onClose}>✕</button>
        </div>

        <div className="cs-body">
          {/* Logo */}
          <div className="cs-logo-row">
            {settings.logoDataUrl ? (
              <img className="cs-logo-preview" src={settings.logoDataUrl} alt="logo" />
            ) : (
              <div className="cs-logo-placeholder">No logo</div>
            )}
            <div className="cs-logo-actions">
              <button className="cs-btn-upload" onClick={() => fileRef.current?.click()}>
                Upload logo
              </button>
              {settings.logoDataUrl && (
                <button className="cs-btn-remove" onClick={() => onChange({ logoDataUrl: "" })}>
                  Remove
                </button>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={handleLogoUpload}
              />
              <span className="cs-logo-hint">PNG / JPG, any size</span>
            </div>
          </div>

          <Field
            label="Company name"
            value={settings.name}
            placeholder="e.g. Sri Lakshmi Electricals"
            onChange={(v) => onChange({ name: v })}
          />
          <Field
            label="Address line 1"
            value={settings.addressLine1}
            placeholder="Street / area"
            onChange={(v) => onChange({ addressLine1: v })}
          />
          <Field
            label="Address line 2"
            value={settings.addressLine2}
            placeholder="City, State, PIN"
            onChange={(v) => onChange({ addressLine2: v })}
          />
          <Field
            label="Phone"
            value={settings.phone}
            placeholder="+91 98765 43210"
            onChange={(v) => onChange({ phone: v })}
          />
          <Field
            label="GSTIN"
            value={settings.gstin}
            placeholder="22AAAAA0000A1Z5"
            onChange={(v) => onChange({ gstin: v.toUpperCase() })}
          />
          <Field
            label="Validity"
            value={settings.validity}
            placeholder="Valid for 15 days from the date above"
            onChange={(v) => onChange({ validity: v })}
          />
          <TextArea
            label="Terms"
            value={settings.terms}
            placeholder={"Payment: 50% advance, balance on delivery\nDelivery: 3–4 working days"}
            onChange={(v) => onChange({ terms: v })}
          />

          {/*
            Diagnostics. This is the half of PI-5 Dad actually touches: when
            something goes wrong, Siva asks him to tap Export and send the
            file. The wording avoids the word "log" in the hint on purpose —
            "what the app was doing" is what it means to him.
          */}
          <div className="cs-diag">
            <div className="cs-diag-head">
              <span className="cs-diag-title">Diagnostics</span>
              <span className="cs-diag-count">
                {logCount} record{logCount === 1 ? "" : "s"}
              </span>
            </div>
            <p className="cs-diag-hint">
              A record of what the app was doing. Send this to Siva if something
              looks wrong.
            </p>
            <div className="cs-diag-actions">
              <button className="cs-btn-upload" onClick={() => handleExport("error")}>
                Export problems
              </button>
              <button className="cs-btn-upload" onClick={() => handleExport("info")}>
                Export everything
              </button>
              <button
                className="cs-btn-toggle"
                aria-pressed={debugOn}
                onClick={handleToggleDebug}
              >
                Detailed logging: {debugOn ? "On" : "Off"}
              </button>
              <button className="cs-btn-remove" onClick={handleClearLogs}>
                Clear
              </button>
            </div>
            {logNote && <p className="cs-diag-note">{logNote}</p>}
          </div>
        </div>

        <div className="cs-footer">
          <span className="cs-save-note">Saved automatically</span>
          <button className="cs-btn-done" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="cs-field">
      <span>{label}</span>
      <input
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function TextArea({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="cs-field">
      <span>{label}</span>
      <textarea
        rows={4}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

import { useRef } from "react";
import { type CompanySettings } from "./useCompanySettings";
import "./CompanySettings.css";

interface Props {
  settings: CompanySettings;
  onChange: (patch: Partial<CompanySettings>) => void;
  onClose: () => void;
}

export function CompanySettingsPanel({ settings, onChange, onClose }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);

  function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      onChange({ logoDataUrl: reader.result as string });
    };
    reader.readAsDataURL(file);
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

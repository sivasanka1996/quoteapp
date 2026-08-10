import { useState, useEffect } from "react";
import { log } from "./log/logger";

export interface CompanySettings {
  name: string;
  addressLine1: string;
  addressLine2: string;
  phone: string;
  gstin: string;
  validity: string;     // "Valid for 15 days from the date above."
  terms: string;        // free multi-line block, printed under the totals
  logoDataUrl: string; // base64 data URL or ""
}

const STORAGE_KEY = "quoteapp_company";

const defaults: CompanySettings = {
  name: "",
  addressLine1: "",
  addressLine2: "",
  phone: "",
  gstin: "",
  validity: "",
  terms: "",
  logoDataUrl: "",
};

function load(): CompanySettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    return { ...defaults, ...JSON.parse(raw) };
  } catch (e) {
    // Storage layer (spec §2.4): log, return the default, never fatal.
    log.error("ui", "company settings could not be read", e);
    return defaults;
  }
}

export function useCompanySettings() {
  const [settings, setSettings] = useState<CompanySettings>(load);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (e) {
      // This one is not hypothetical: the logo is stored as a base64 data URL
      // in the same blob, so a big photo can pass the ~5 MB quota and throw
      // QuotaExceededError from inside an effect — which React turns into a
      // blank screen. Settings stay live in memory for the session.
      log.error("ui", "company settings could not be saved", e, {
        logoBytes: settings.logoDataUrl.length,
      });
    }
  }, [settings]);

  function update(patch: Partial<CompanySettings>) {
    setSettings((prev) => ({ ...prev, ...patch }));
  }

  return { settings, update };
}

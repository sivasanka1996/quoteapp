import { useState, useEffect } from "react";

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
  } catch {
    return defaults;
  }
}

export function useCompanySettings() {
  const [settings, setSettings] = useState<CompanySettings>(load);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  function update(patch: Partial<CompanySettings>) {
    setSettings((prev) => ({ ...prev, ...patch }));
  }

  return { settings, update };
}

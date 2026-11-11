import { useState } from "react";
import { Dashboard } from "./Dashboard";
import { HomeScreen } from "./HomeScreen";
import { CustomerScreen } from "./CustomerScreen";
import { QuoteEditor } from "./QuoteEditor";
import { IdeaTracker } from "./IdeaTracker";
import { AppHeader } from "./AppHeader";
import { CompanySettingsPanel } from "./CompanySettings";
import { useCompanySettings } from "./useCompanySettings";
import { type Customer, type QuoteDoc } from "./types";
import { type ReadItem } from "./readImage";

// Top-level app areas — see docs/ROADMAP.md. Pricing/Billing aren't built yet,
// so their Dashboard tiles are disabled and have no render branch below.
type Section = "dashboard" | "quotations" | "ideas";

// Quotations' own nested flow, same shape as before Section routing existed —
// kept alive across navigation so leaving and re-entering Quotations resumes
// wherever the user left off.
type QuotationsScreen =
  | { name: "home" }
  | { name: "customer"; customer: Customer }
  | { name: "quote"; customer: Customer; quote: QuoteDoc | null; initialItems?: ReadItem[] };

export function AppRouter() {
  const [section, setSection] = useState<Section>("dashboard");
  const [quotationsScreen, setQuotationsScreen] = useState<QuotationsScreen>({ name: "home" });
  const [showSettings, setShowSettings] = useState(false);
  const { settings: company, update: updateCompany } = useCompanySettings();

  return (
    <>
      <AppHeader
        onOpenSettings={() => setShowSettings(true)}
        onOpenIdeas={() => setSection("ideas")}
      />

      {section === "dashboard" && (
        <Dashboard onOpenQuotations={() => setSection("quotations")} />
      )}

      {section === "ideas" && (
        <IdeaTracker onBack={() => setSection("dashboard")} />
      )}

      {section === "quotations" && quotationsScreen.name === "home" && (
        <HomeScreen
          onBack={() => setSection("dashboard")}
          onSelectCustomer={(customer) => setQuotationsScreen({ name: "customer", customer })}
        />
      )}

      {section === "quotations" && quotationsScreen.name === "customer" && (
        <CustomerScreen
          customer={quotationsScreen.customer}
          onBack={() => setQuotationsScreen({ name: "home" })}
          onNewQuote={() =>
            setQuotationsScreen({ name: "quote", customer: quotationsScreen.customer, quote: null })
          }
          onNewQuoteFromItems={(items) =>
            setQuotationsScreen({
              name: "quote",
              customer: quotationsScreen.customer,
              quote: null,
              initialItems: items,
            })
          }
          onOpenQuote={(quote) =>
            setQuotationsScreen({ name: "quote", customer: quotationsScreen.customer, quote })
          }
        />
      )}

      {section === "quotations" && quotationsScreen.name === "quote" && (
        <QuoteEditor
          customer={quotationsScreen.customer}
          existingQuote={quotationsScreen.quote}
          initialItems={quotationsScreen.initialItems}
          onBack={() =>
            setQuotationsScreen({ name: "customer", customer: quotationsScreen.customer })
          }
        />
      )}

      {showSettings && (
        <CompanySettingsPanel
          settings={company}
          onChange={updateCompany}
          onClose={() => setShowSettings(false)}
        />
      )}
    </>
  );
}

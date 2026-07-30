import { useState } from "react";
import { HomeScreen } from "./HomeScreen";
import { CustomerScreen } from "./CustomerScreen";
import { QuoteEditor } from "./QuoteEditor";
import { AppHeader } from "./AppHeader";
import { CompanySettingsPanel } from "./CompanySettings";
import { useCompanySettings } from "./useCompanySettings";
import { type Customer, type QuoteDoc } from "./types";
import { type ReadItem } from "./readImage";

type Screen =
  | { name: "home" }
  | { name: "customer"; customer: Customer }
  | { name: "quote"; customer: Customer; quote: QuoteDoc | null; initialItems?: ReadItem[] };

export function AppRouter() {
  const [screen, setScreen] = useState<Screen>({ name: "home" });
  const [showSettings, setShowSettings] = useState(false);
  const { settings: company, update: updateCompany } = useCompanySettings();

  return (
    <>
      <AppHeader onOpenSettings={() => setShowSettings(true)} />

      {screen.name === "home" && (
        <HomeScreen
          onSelectCustomer={(customer) => setScreen({ name: "customer", customer })}
        />
      )}

      {screen.name === "customer" && (
        <CustomerScreen
          customer={screen.customer}
          onBack={() => setScreen({ name: "home" })}
          onNewQuote={() =>
            setScreen({ name: "quote", customer: screen.customer, quote: null })
          }
          onNewQuoteFromItems={(items) =>
            setScreen({
              name: "quote",
              customer: screen.customer,
              quote: null,
              initialItems: items,
            })
          }
          onOpenQuote={(quote) =>
            setScreen({ name: "quote", customer: screen.customer, quote })
          }
        />
      )}

      {screen.name === "quote" && (
        <QuoteEditor
          customer={screen.customer}
          existingQuote={screen.quote}
          initialItems={screen.initialItems}
          onBack={() =>
            setScreen({ name: "customer", customer: screen.customer })
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

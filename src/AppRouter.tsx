import { useState } from "react";
import { HomeScreen } from "./HomeScreen";
import { CustomerScreen } from "./CustomerScreen";
import { QuoteEditor } from "./QuoteEditor";
import { AppHeader } from "./AppHeader";
import { CompanySettingsPanel } from "./CompanySettings";
import { useCompanySettings } from "./useCompanySettings";
import { useCustomers } from "./useCustomers";
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
  // Owned here, not in HomeScreen, for two reasons: the copy sheet on
  // CustomerScreen needs the list to offer another customer, and HomeScreen
  // unmounts on every navigation, so keeping the listener there tore it down
  // and re-established it each time Dad opened a customer.
  const { customers, loading: customersLoading, addCustomer } = useCustomers();

  return (
    <>
      <AppHeader onOpenSettings={() => setShowSettings(true)} />

      {screen.name === "home" && (
        <HomeScreen
          customers={customers}
          loading={customersLoading}
          addCustomer={addCustomer}
          onSelectCustomer={(customer) => setScreen({ name: "customer", customer })}
        />
      )}

      {screen.name === "customer" && (
        <CustomerScreen
          customer={screen.customer}
          customers={customers}
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
          // `screen.customer` is a snapshot taken when the row was tapped and
          // nothing else refreshes it, so an edit has to land here or the screen
          // keeps showing what Dad just corrected. QuoteEditor reads the
          // customer from this same object, which is why fixing a phone number
          // fixes it on quotations already saved.
          onCustomerChange={(customer) => setScreen({ name: "customer", customer })}
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

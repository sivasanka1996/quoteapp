import { useState } from "react";
import { HomeScreen } from "./HomeScreen";
import { CustomerScreen } from "./CustomerScreen";
import { QuoteEditor } from "./QuoteEditor";
import { type Customer, type QuoteDoc } from "./types";
import { type ReadItem } from "./readImage";

type Screen =
  | { name: "home" }
  | { name: "customer"; customer: Customer }
  | { name: "quote"; customer: Customer; quote: QuoteDoc | null; initialItems?: ReadItem[] };

export function AppRouter() {
  const [screen, setScreen] = useState<Screen>({ name: "home" });

  if (screen.name === "home") {
    return (
      <HomeScreen
        onSelectCustomer={(customer) =>
          setScreen({ name: "customer", customer })
        }
      />
    );
  }

  if (screen.name === "customer") {
    const { customer } = screen;
    return (
      <CustomerScreen
        customer={customer}
        onBack={() => setScreen({ name: "home" })}
        onNewQuote={() => setScreen({ name: "quote", customer, quote: null })}
        onNewQuoteFromImage={(items) => setScreen({ name: "quote", customer, quote: null, initialItems: items })}
        onOpenQuote={(quote) => setScreen({ name: "quote", customer, quote })}
      />
    );
  }

  // quote screen
  const { customer, quote, initialItems } = screen;
  return (
    <QuoteEditor
      customer={customer}
      existingQuote={quote}
      initialItems={initialItems}
      onBack={() => setScreen({ name: "customer", customer })}
    />
  );
}

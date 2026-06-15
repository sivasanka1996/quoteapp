import { useState } from "react";
import { HomeScreen } from "./HomeScreen";
import { CustomerScreen } from "./CustomerScreen";
import { QuoteEditor } from "./QuoteEditor";
import { type Customer, type QuoteDoc } from "./types";

type Screen =
  | { name: "home" }
  | { name: "customer"; customer: Customer }
  | { name: "quote"; customer: Customer; quote: QuoteDoc | null };

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
        onOpenQuote={(quote) => setScreen({ name: "quote", customer, quote })}
      />
    );
  }

  // quote screen
  const { customer, quote } = screen;
  return (
    <QuoteEditor
      customer={customer}
      existingQuote={quote}
      onBack={() => setScreen({ name: "customer", customer })}
    />
  );
}

import { useEffect, useState } from "react";
import { Dashboard } from "./dashboard/Dashboard";
import { HomeScreen } from "./quotations/HomeScreen";
import { CustomerScreen } from "./quotations/CustomerScreen";
import { QuoteEditor } from "./quotations/QuoteEditor";
import { IdeaTracker } from "./ideas/IdeaTracker";
import { AppHeader } from "./shared/AppHeader";
import { CompanySettingsPanel } from "./shared/CompanySettings";
import { useCompanySettings } from "./shared/useCompanySettings";
import { useCustomers } from "./shared/useCustomers";
import { useQuotes } from "./shared/useQuotes";
import { type ReadItem } from "./readImage";

// Real browser URLs for every section/screen — see docs/ROADMAP.md. No
// router library: the app only needs 6 route shapes, so a path is parsed
// into a Route on load and on every popstate, and navigate() pushes new
// paths via the plain History API. Revisit with a real router if the route
// count grows past what this can comfortably express.
type Route =
  | { name: "dashboard" }
  | { name: "ideas" }
  | { name: "quotations-home" }
  | { name: "quotations-customer"; customerId: string }
  | { name: "quotations-quote-new"; customerId: string }
  | { name: "quotations-quote"; customerId: string; quoteId: string };

function parsePath(pathname: string): Route {
  const parts = pathname.split("/").filter(Boolean);

  if (parts[0] === "ideas") return { name: "ideas" };

  if (parts[0] === "quotation") {
    if (parts[1] === "customer" && parts[2]) {
      const customerId = parts[2];
      if (parts[3] === "quote" && parts[4] === "new") {
        return { name: "quotations-quote-new", customerId };
      }
      if (parts[3] === "quote" && parts[4]) {
        return { name: "quotations-quote", customerId, quoteId: parts[4] };
      }
      return { name: "quotations-customer", customerId };
    }
    return { name: "quotations-home" };
  }

  return { name: "dashboard" };
}

function pathFor(route: Route): string {
  switch (route.name) {
    case "dashboard":
      return "/";
    case "ideas":
      return "/ideas";
    case "quotations-home":
      return "/quotation";
    case "quotations-customer":
      return `/quotation/customer/${route.customerId}`;
    case "quotations-quote-new":
      return `/quotation/customer/${route.customerId}/quote/new`;
    case "quotations-quote":
      return `/quotation/customer/${route.customerId}/quote/${route.quoteId}`;
  }
}

export function AppRouter() {
  const [route, setRoute] = useState<Route>(() => parsePath(window.location.pathname));
  const [showSettings, setShowSettings] = useState(false);
  const { settings: company, update: updateCompany } = useCompanySettings();
  const { customers, loading: customersLoading } = useCustomers();

  // Keep Route in sync with the browser's own back/forward buttons.
  useEffect(() => {
    function onPopState() {
      setRoute(parsePath(window.location.pathname));
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  function navigate(next: Route) {
    const path = pathFor(next);
    if (path !== window.location.pathname) {
      window.history.pushState(null, "", path);
    }
    setRoute(next);
  }

  const needsCustomer =
    route.name === "quotations-customer" ||
    route.name === "quotations-quote-new" ||
    route.name === "quotations-quote";
  const activeCustomerId = needsCustomer ? route.customerId : null;
  const activeCustomer = customers.find((c) => c.id === activeCustomerId) ?? null;
  const { quotes: activeCustomerQuotes } = useQuotes(activeCustomerId ?? "");
  const activeQuote =
    route.name === "quotations-quote"
      ? activeCustomerQuotes.find((q) => q.id === route.quoteId) ?? null
      : null;

  // A stale/unknown customer id in the URL (deleted customer, typo, old
  // bookmark) falls back to the Quotations list for rendering purposes...
  const customerNotFound = needsCustomer && !customersLoading && !activeCustomer;
  const effectiveRoute: Route = customerNotFound ? { name: "quotations-home" } : route;
  // ...and this just corrects the address bar to match, without touching
  // React state (rendering already fell back above).
  useEffect(() => {
    if (customerNotFound) {
      const path = pathFor({ name: "quotations-home" });
      if (path !== window.location.pathname) {
        window.history.replaceState(null, "", path);
      }
    }
  }, [customerNotFound]);

  // Image/voice-reader results that pre-fill a brand new quote — kept in
  // memory only, since an array of scanned items has no URL representation.
  // Lost on refresh, which is fine: it's a same-session hand-off, not
  // bookmarkable state.
  const [pendingNewQuoteItems, setPendingNewQuoteItems] = useState<ReadItem[] | undefined>();

  return (
    <>
      <AppHeader
        onOpenSettings={() => setShowSettings(true)}
        onOpenIdeas={() => navigate({ name: "ideas" })}
      />

      {effectiveRoute.name === "dashboard" && (
        <Dashboard onOpenQuotations={() => navigate({ name: "quotations-home" })} />
      )}

      {effectiveRoute.name === "ideas" && (
        <IdeaTracker onBack={() => navigate({ name: "dashboard" })} />
      )}

      {effectiveRoute.name === "quotations-home" && (
        <HomeScreen
          onBack={() => navigate({ name: "dashboard" })}
          onSelectCustomer={(customer) =>
            navigate({ name: "quotations-customer", customerId: customer.id })
          }
        />
      )}

      {needsCustomer && customersLoading && <div className="route-loading" aria-busy="true" />}

      {effectiveRoute.name === "quotations-customer" && activeCustomer && (
        <CustomerScreen
          customer={activeCustomer}
          onBack={() => navigate({ name: "quotations-home" })}
          onNewQuote={() => {
            setPendingNewQuoteItems(undefined);
            navigate({ name: "quotations-quote-new", customerId: activeCustomer.id });
          }}
          onNewQuoteFromItems={(items) => {
            setPendingNewQuoteItems(items);
            navigate({ name: "quotations-quote-new", customerId: activeCustomer.id });
          }}
          onOpenQuote={(quote) =>
            navigate({ name: "quotations-quote", customerId: activeCustomer.id, quoteId: quote.id })
          }
        />
      )}

      {effectiveRoute.name === "quotations-quote-new" && activeCustomer && (
        <QuoteEditor
          customer={activeCustomer}
          existingQuote={null}
          initialItems={pendingNewQuoteItems}
          onBack={() => navigate({ name: "quotations-customer", customerId: activeCustomer.id })}
        />
      )}

      {effectiveRoute.name === "quotations-quote" && activeCustomer && (
        <QuoteEditor
          customer={activeCustomer}
          existingQuote={activeQuote}
          onBack={() => navigate({ name: "quotations-customer", customerId: activeCustomer.id })}
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

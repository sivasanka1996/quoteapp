import { useEffect, useState } from "react";
import { Dashboard } from "./dashboard/Dashboard";
import { HomeScreen } from "./quotations/HomeScreen";
import { CustomerScreen } from "./quotations/CustomerScreen";
import { QuoteEditor } from "./quotations/QuoteEditor";
import { IdeaTracker } from "./ideas/IdeaTracker";
import { PricingScreen } from "./pricing/PricingScreen";
import { BillingHomeScreen } from "./billing/BillingHomeScreen";
import { BillingCustomerScreen } from "./billing/BillingCustomerScreen";
import { InvoiceEditor } from "./billing/InvoiceEditor";
import { AppHeader } from "./shared/AppHeader";
import { CompanySettingsPanel } from "./shared/CompanySettings";
import { useCompanySettings } from "./shared/useCompanySettings";
import { useCustomers } from "./shared/useCustomers";
import { useQuotes } from "./shared/useQuotes";
import { useInvoices } from "./shared/useInvoices";
import { type ReadItem } from "./readImage";
import { type UILine, type QuoteDoc } from "./types";

// Real browser URLs for every section/screen — see docs/ROADMAP.md. No
// router library: the app only needs 6 route shapes, so a path is parsed
// into a Route on load and on every popstate, and navigate() pushes new
// paths via the plain History API. Revisit with a real router if the route
// count grows past what this can comfortably express.
type Route =
  | { name: "dashboard" }
  | { name: "ideas" }
  | { name: "pricing" }
  | { name: "quotations-home" }
  | { name: "quotations-customer"; customerId: string }
  | { name: "quotations-quote-new"; customerId: string }
  | { name: "quotations-quote"; customerId: string; quoteId: string }
  | { name: "billing-home" }
  | { name: "billing-customer"; customerId: string }
  | { name: "billing-invoice-new"; customerId: string }
  | { name: "billing-invoice"; customerId: string; invoiceId: string };

function parsePath(pathname: string): Route {
  const parts = pathname.split("/").filter(Boolean);

  if (parts[0] === "ideas") return { name: "ideas" };

  if (parts[0] === "pricing") return { name: "pricing" };

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

  if (parts[0] === "billing") {
    if (parts[1] === "customer" && parts[2]) {
      const customerId = parts[2];
      if (parts[3] === "invoice" && parts[4] === "new") {
        return { name: "billing-invoice-new", customerId };
      }
      if (parts[3] === "invoice" && parts[4]) {
        return { name: "billing-invoice", customerId, invoiceId: parts[4] };
      }
      return { name: "billing-customer", customerId };
    }
    return { name: "billing-home" };
  }

  return { name: "dashboard" };
}

function pathFor(route: Route): string {
  switch (route.name) {
    case "dashboard":
      return "/";
    case "ideas":
      return "/ideas";
    case "pricing":
      return "/pricing";
    case "quotations-home":
      return "/quotation";
    case "quotations-customer":
      return `/quotation/customer/${route.customerId}`;
    case "quotations-quote-new":
      return `/quotation/customer/${route.customerId}/quote/new`;
    case "quotations-quote":
      return `/quotation/customer/${route.customerId}/quote/${route.quoteId}`;
    case "billing-home":
      return "/billing";
    case "billing-customer":
      return `/billing/customer/${route.customerId}`;
    case "billing-invoice-new":
      return `/billing/customer/${route.customerId}/invoice/new`;
    case "billing-invoice":
      return `/billing/customer/${route.customerId}/invoice/${route.invoiceId}`;
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
    route.name === "quotations-quote" ||
    route.name === "billing-customer" ||
    route.name === "billing-invoice-new" ||
    route.name === "billing-invoice";
  const isBillingRoute =
    route.name === "billing-customer" ||
    route.name === "billing-invoice-new" ||
    route.name === "billing-invoice";
  const activeCustomerId = needsCustomer ? route.customerId : null;
  const activeCustomer = customers.find((c) => c.id === activeCustomerId) ?? null;
  const { quotes: activeCustomerQuotes } = useQuotes(activeCustomerId ?? "");
  const activeQuote =
    route.name === "quotations-quote"
      ? activeCustomerQuotes.find((q) => q.id === route.quoteId) ?? null
      : null;
  const { invoices: activeCustomerInvoices } = useInvoices(activeCustomerId ?? "");
  const activeInvoice =
    route.name === "billing-invoice"
      ? activeCustomerInvoices.find((inv) => inv.id === route.invoiceId) ?? null
      : null;

  // A stale/unknown customer id in the URL (deleted customer, typo, old
  // bookmark) falls back to that flow's home list for rendering purposes...
  const customerNotFound = needsCustomer && !customersLoading && !activeCustomer;
  const fallbackRoute: Route = isBillingRoute ? { name: "billing-home" } : { name: "quotations-home" };
  const effectiveRoute: Route = customerNotFound ? fallbackRoute : route;
  // ...and this just corrects the address bar to match, without touching
  // React state (rendering already fell back above).
  useEffect(() => {
    if (customerNotFound) {
      const path = pathFor(isBillingRoute ? { name: "billing-home" } : { name: "quotations-home" });
      if (path !== window.location.pathname) {
        window.history.replaceState(null, "", path);
      }
    }
  }, [customerNotFound, isBillingRoute]);

  // Image/voice-reader results that pre-fill a brand new quote/invoice — kept
  // in memory only, since an array of scanned items has no URL representation.
  // Lost on refresh, which is fine: it's a same-session hand-off, not
  // bookmarkable state.
  const [pendingNewQuoteItems, setPendingNewQuoteItems] = useState<ReadItem[] | undefined>();
  const [pendingNewInvoiceItems, setPendingNewInvoiceItems] = useState<ReadItem[] | undefined>();
  // "Convert to Invoice" hand-off from an accepted quote — same kind of
  // same-session-only state, read once by InvoiceEditor's lazy initial
  // lines and otherwise ignored. See docs/billing.md.
  const [pendingConvert, setPendingConvert] = useState<
    { customerId: string; lines: UILine[]; quoteId: string } | undefined
  >();

  return (
    <>
      <AppHeader
        onOpenSettings={() => setShowSettings(true)}
        onOpenIdeas={() => navigate({ name: "ideas" })}
      />

      {effectiveRoute.name === "dashboard" && (
        <Dashboard
          onOpenQuotations={() => navigate({ name: "quotations-home" })}
          onOpenPricing={() => navigate({ name: "pricing" })}
          onOpenBilling={() => navigate({ name: "billing-home" })}
        />
      )}

      {effectiveRoute.name === "ideas" && (
        <IdeaTracker onBack={() => navigate({ name: "dashboard" })} />
      )}

      {effectiveRoute.name === "pricing" && (
        <PricingScreen onBack={() => navigate({ name: "dashboard" })} />
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
          onConvertToInvoice={(quote: QuoteDoc) => {
            setPendingNewInvoiceItems(undefined);
            setPendingConvert({ customerId: activeCustomer.id, lines: quote.lines, quoteId: quote.id });
            navigate({ name: "billing-invoice-new", customerId: activeCustomer.id });
          }}
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

      {effectiveRoute.name === "billing-home" && (
        <BillingHomeScreen
          onBack={() => navigate({ name: "dashboard" })}
          onSelectCustomer={(customer) =>
            navigate({ name: "billing-customer", customerId: customer.id })
          }
        />
      )}

      {effectiveRoute.name === "billing-customer" && activeCustomer && (
        <BillingCustomerScreen
          customer={activeCustomer}
          onBack={() => navigate({ name: "billing-home" })}
          onNewInvoice={() => {
            setPendingNewInvoiceItems(undefined);
            setPendingConvert(undefined);
            navigate({ name: "billing-invoice-new", customerId: activeCustomer.id });
          }}
          onNewInvoiceFromItems={(items) => {
            setPendingNewInvoiceItems(items);
            setPendingConvert(undefined);
            navigate({ name: "billing-invoice-new", customerId: activeCustomer.id });
          }}
          onOpenInvoice={(invoice) =>
            navigate({ name: "billing-invoice", customerId: activeCustomer.id, invoiceId: invoice.id })
          }
        />
      )}

      {effectiveRoute.name === "billing-invoice-new" && activeCustomer && (
        <InvoiceEditor
          customer={activeCustomer}
          existingInvoice={null}
          initialItems={pendingConvert?.customerId === activeCustomer.id ? undefined : pendingNewInvoiceItems}
          initialLines={pendingConvert?.customerId === activeCustomer.id ? pendingConvert.lines : undefined}
          fromQuoteId={pendingConvert?.customerId === activeCustomer.id ? pendingConvert.quoteId : undefined}
          onBack={() => navigate({ name: "billing-customer", customerId: activeCustomer.id })}
        />
      )}

      {effectiveRoute.name === "billing-invoice" && activeCustomer && (
        <InvoiceEditor
          customer={activeCustomer}
          existingInvoice={activeInvoice}
          onBack={() => navigate({ name: "billing-customer", customerId: activeCustomer.id })}
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

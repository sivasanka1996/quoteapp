import "./AppHeader.css";

interface Props {
  onOpenSettings: () => void;
}

/** The persistent app bar shown on every screen. */
export function AppHeader({ onOpenSettings }: Props) {
  return (
    <header className="ah">
      <div className="ah-inner">
        <div className="ah-brand">
          <span className="ah-logo" aria-hidden="true">Q</span>
          <span className="ah-titles">
            <span className="ah-title">Quotation App</span>
            <span className="ah-sub">Manage your customer quotes</span>
          </span>
        </div>
        <button
          className="ah-icon-btn"
          onClick={onOpenSettings}
          aria-label="Company settings"
          title="Company settings"
        >
          <GearIcon />
        </button>
      </div>
    </header>
  );
}

function GearIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="3.2" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2M6 6l1.4 1.4M16.6 16.6L18 18M18 6l-1.4 1.4M7.4 16.6L6 18"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

"use client";

import {
  Inbox,
  Check,
  LockKeyhole,
  LogOut,
  Monitor,
  Moon,
  PenLine,
  RefreshCw,
  Search,
  Sun,
  User,
} from "lucide-react";
import { useEffect, useRef, useState, type RefObject } from "react";
import type { Bucket } from "../../lib/taxonomy";
import type { ThemePreference } from "../hooks/useTheme";
import { BucketTabs, type TabId } from "./BucketTabs";

type Props = {
  buckets: Bucket[];
  counts: Record<string, number>;
  unsortedCount: number;
  activeTab: TabId;
  onSelectTab: (tab: TabId) => void;
  onNewBucket: () => void;
  query: string;
  onQueryChange: (query: string) => void;
  searchRef: RefObject<HTMLInputElement | null>;
  onReclassify: () => void;
  reclassifyDisabled: boolean;
  mode: "gmail" | "demo";
  email: string | null;
  classifierConfigured: boolean;
  theme: ThemePreference;
  onThemeChange: (theme: ThemePreference) => void;
  onSwitchToDemo: () => void;
  onDisconnect: () => void;
  /** "Learn my voice" before a profile exists, "Voice profile" after. */
  voiceLabel: string;
  voiceStale: boolean;
  onVoice: () => void;
};

const THEME_OPTIONS: Array<{ id: ThemePreference; label: string; icon: typeof Sun }> = [
  { id: "snow", label: "Snow", icon: Sun },
  { id: "carbon", label: "Carbon", icon: Moon },
  { id: "system", label: "Match system", icon: Monitor },
];

export function TopBar({
  buckets,
  counts,
  unsortedCount,
  activeTab,
  onSelectTab,
  onNewBucket,
  query,
  onQueryChange,
  searchRef,
  onReclassify,
  reclassifyDisabled,
  mode,
  email,
  classifierConfigured,
  theme,
  onThemeChange,
  onSwitchToDemo,
  onDisconnect,
  voiceLabel,
  voiceStale,
  onVoice,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    window.addEventListener("mousedown", onPointerDown);
    return () => window.removeEventListener("mousedown", onPointerDown);
  }, [menuOpen]);

  return (
    <header className="top-bar">
      <div className="brand-lockup">
        <strong>Inbox Concierge</strong>
        {mode === "demo" && <span className="mode-chip">Demo inbox</span>}
        {!classifierConfigured && <span className="mode-chip chip-warning">Heuristic classifier</span>}
        {voiceStale && (
          <button type="button" className="mode-chip chip-warning chip-action" onClick={onVoice}>
            New sent mail · voice profile is stale
          </button>
        )}
      </div>

      <BucketTabs
        buckets={buckets}
        counts={counts}
        unsortedCount={unsortedCount}
        activeTab={activeTab}
        onSelectTab={onSelectTab}
        onNewBucket={onNewBucket}
      />

      <div className="top-actions">
        <div className="search-control">
          <Search size={14} aria-hidden="true" />
          <input
            ref={searchRef}
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search"
            aria-label="Search threads"
          />
          <kbd>/</kbd>
        </div>
        <button
          type="button"
          className="button-secondary reclassify-button"
          onClick={onReclassify}
          disabled={reclassifyDisabled}
        >
          <RefreshCw size={13} aria-hidden="true" /> Reclassify
        </button>
        <div className="account-menu" ref={menuRef}>
          <button
            type="button"
            className="icon-button account-button"
            aria-label="Account and settings"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <User size={15} aria-hidden="true" />
          </button>
          {menuOpen && (
            <div className="menu-popover" role="menu">
              <div className="menu-identity">
                <strong>{mode === "gmail" ? (email ?? "Google connected") : "Demo inbox"}</strong>
                <span>{mode === "gmail" ? "gmail.readonly" : "50 fixture threads"}</span>
              </div>
              <div className="menu-section mono">Theme</div>
              {THEME_OPTIONS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  className="menu-row"
                  role="menuitemradio"
                  aria-checked={theme === id}
                  onClick={() => onThemeChange(id)}
                >
                  <Icon size={14} aria-hidden="true" /> {label}
                  {theme === id && <Check size={13} className="menu-check" aria-hidden="true" />}
                </button>
              ))}
              <div className="menu-divider" />
              <button
                type="button"
                className="menu-row"
                onClick={() => {
                  setMenuOpen(false);
                  onVoice();
                }}
              >
                <PenLine size={14} aria-hidden="true" /> {voiceLabel}
                {voiceStale && <span className="menu-stale-dot" aria-label="stale" />}
              </button>
              <div className="menu-divider" />
              {mode === "gmail" ? (
                <>
                  <button type="button" className="menu-row" onClick={onSwitchToDemo}>
                    <Inbox size={14} aria-hidden="true" /> Switch to demo inbox
                  </button>
                  <button type="button" className="menu-row menu-danger" onClick={onDisconnect}>
                    <LogOut size={14} aria-hidden="true" /> Disconnect Google
                  </button>
                </>
              ) : (
                <a className="menu-row" href="/api/google/start">
                  <LockKeyhole size={14} aria-hidden="true" /> Connect Gmail
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

// Shared "@-mention"-style searchable file picker (ported from gemihub's
// MarkdownFilePicker, adapted to Obsidian's vault file list). Renders a button
// showing the current selection; clicking opens an inline dropdown with a search
// box and a filtered, keyboard-navigable list of matching vault files.

import { useState, useRef, useMemo, useEffect, useCallback } from "react";
import { FileText, ChevronDown, X } from "lucide-react";
import { t } from "src/i18n";

export interface FilePickerProps {
  /** Currently selected vault path (empty = nothing selected). */
  value: string;
  onChange: (path: string) => void;
  /** Candidate vault paths to choose from (already filtered by extension). */
  paths: string[];
  placeholder?: string;
  /** Search box placeholder. */
  searchPlaceholder?: string;
}

/**
 * Searchable file picker. Filtering is a case-insensitive substring match on the
 * full path, capped at 50 results. The dropdown closes on selection, Escape, or
 * an outside click.
 */
export function FilePicker({
  value,
  onChange,
  paths,
  placeholder,
  searchPlaceholder,
}: FilePickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q ? paths.filter((p) => p.toLowerCase().includes(q)) : paths;
    return base.slice(0, 50);
  }, [paths, query]);

  // Keep the highlighted row in range as the filter narrows.
  useEffect(() => {
    setActiveIndex((i) => Math.min(i, Math.max(0, filtered.length - 1)));
  }, [filtered.length]);

  // Focus the search box when the dropdown opens.
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    activeDocument.addEventListener("mousedown", onDown);
    return () => activeDocument.removeEventListener("mousedown", onDown);
  }, [open]);

  const select = useCallback(
    (path: string) => {
      onChange(path);
      setQuery("");
      setOpen(false);
    },
    [onChange],
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const pick = filtered[activeIndex];
      if (pick) select(pick);
    }
  };

  return (
    <div className="llm-hub-db-picker" ref={wrapperRef}>
      <button
        type="button"
        className="llm-hub-db-picker-button"
        onClick={() => setOpen((o) => !o)}
        title={value || placeholder || t("dashboard.selectPlaceholder")}
      >
        <FileText size={13} className="llm-hub-db-picker-leadicon" />
        <span className="llm-hub-db-picker-label">
          {value || placeholder || t("dashboard.selectPlaceholder")}
        </span>
        {value ? (
          <X
            size={13}
            className="llm-hub-db-picker-clear"
            onClick={(e) => {
              e.stopPropagation();
              onChange("");
            }}
          />
        ) : (
          <ChevronDown size={13} className="llm-hub-db-picker-caret" />
        )}
      </button>

      {open && (
        <div className="llm-hub-db-picker-menu">
          <input
            ref={inputRef}
            type="text"
            className="llm-hub-db-picker-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={searchPlaceholder || t("dashboard.searchPlaceholder")}
          />
          <div className="llm-hub-db-picker-list">
            {filtered.length === 0 ? (
              <div className="llm-hub-db-picker-empty">{t("dashboard.noFiles")}</div>
            ) : (
              filtered.map((p, i) => (
                <button
                  type="button"
                  key={p}
                  className={`llm-hub-db-picker-item${
                    p === value ? " is-selected" : ""
                  }${i === activeIndex ? " is-active" : ""}`}
                  onMouseEnter={() => setActiveIndex(i)}
                  onClick={() => select(p)}
                >
                  <FileText size={12} className="llm-hub-db-picker-itemicon" />
                  <span className="llm-hub-db-picker-itemlabel">{p}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

// Dropdown that takes several selections. Built on <details> so the panel opens
// and closes natively — no click-outside listener, no focus trap to maintain.
//
// Empty selection means "all", so a board opens complete rather than blank, and
// the summary says so. Both dashboards use this, and both pass the selection to
// /api/export so the file matches what is on screen.

export type MultiOption = { value: string; label: string; hint?: string };

export default function MultiSelect({
  label,
  allLabel,
  options,
  selected,
  onChange,
}: {
  label: string;
  allLabel: string;
  options: MultiOption[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const toggle = (v: string) =>
    onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);

  const summary =
    selected.length === 0
      ? allLabel
      : selected.length === 1
        ? (options.find((o) => o.value === selected[0])?.label ?? "1 selected")
        : `${selected.length} selected`;

  return (
    <div className="filter-group">
      <label>{label}</label>
      <details className="multi">
        <summary>{summary}</summary>
        <div className="multi-panel">
          <button type="button" className="multi-clear" onClick={() => onChange([])}>
            {allLabel}
          </button>
          {options.map((o) => (
            <label key={o.value} className="multi-row">
              <input type="checkbox" checked={selected.includes(o.value)} onChange={() => toggle(o.value)} />
              <span>
                {o.label}
                {o.hint ? <span className="muted"> ({o.hint})</span> : null}
              </span>
            </label>
          ))}
        </div>
      </details>
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";

// One table cell you can edit in place: it reads as plain text, shows an outline
// on hover, and turns into an input on click. Enter saves, Escape cancels.
//
// The caller owns the write — `onSave` returns the error string to show, or null
// on success — so the same component serves the Library (writes `products`) and
// First Pass (routes to products or the channel row depending on mapping) without
// knowing anything about either.

export type CellKind = "text" | "number" | "boolean";

export default function EditableCell({
  value,
  onSave,
  kind = "text",
  placeholder,
  title,
  disabled,
  width = 110,
}: {
  value: string | null;
  onSave: (next: string) => Promise<string | null>;
  kind?: CellKind;
  placeholder?: string;
  /** Tooltip — used to say where the write lands when that isn't obvious. */
  title?: string;
  disabled?: boolean;
  width?: number;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [shown, setShown] = useState(value);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const commit = (next: string) => {
    if (next === (shown ?? "")) {
      setEditing(false);
      return;
    }
    setErr(null);
    start(async () => {
      const error = await onSave(next);
      if (error) setErr(error);
      else {
        setShown(next.trim() === "" ? null : next.trim());
        setEditing(false);
      }
    });
  };

  if (disabled) return <>{shown ?? "—"}</>;

  if (!editing) {
    return (
      <button
        type="button"
        className="cell-edit"
        title={title ?? "Click to edit"}
        onClick={() => {
          setDraft(shown ?? "");
          setEditing(true);
          setErr(null);
        }}
      >
        {shown ?? <span className="muted">—</span>}
      </button>
    );
  }

  if (kind === "boolean") {
    return (
      <select
        autoFocus
        className="cell-input"
        value={draft}
        disabled={pending}
        onChange={(e) => {
          setDraft(e.target.value);
          commit(e.target.value);
        }}
        onBlur={() => setEditing(false)}
      >
        <option value="">—</option>
        <option value="true">Yes</option>
        <option value="false">No</option>
      </select>
    );
  }

  return (
    <span style={{ display: "inline-block" }}>
      <input
        autoFocus
        className="cell-input"
        style={{ width }}
        value={draft}
        placeholder={placeholder}
        inputMode={kind === "number" ? "decimal" : undefined}
        disabled={pending}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit(draft);
          if (e.key === "Escape") setEditing(false);
        }}
        // Blur-to-save would fire while clicking away mid-thought; require Enter.
        onBlur={() => !pending && !err && setEditing(false)}
      />
      {err ? <div className="cell-err">{err}</div> : null}
    </span>
  );
}

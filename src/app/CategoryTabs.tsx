"use client";

import { useTransition } from "react";
import { CATEGORY_KEYS, CATEGORY_LABEL, type CategoryKey } from "@/lib/category";
import { setCategory } from "./category-actions";

// Global product-line switch. Every page reads the same cookie-backed category,
// so flipping this swaps the whole app (Dashboard, Channel, Library, First Pass,
// INIU, Roadmap, counts) between Power Banks and Chargers — same layout and
// interactions, completely separate data.
export default function CategoryTabs({ active }: { active: CategoryKey }) {
  const [pending, start] = useTransition();

  return (
    <div className={`cat-tabs${pending ? " pending" : ""}`} role="tablist" aria-label="Product line">
      {CATEGORY_KEYS.map((k) => (
        <button
          key={k}
          role="tab"
          aria-selected={k === active}
          className={`cat-tab${k === active ? " active" : ""}`}
          disabled={pending}
          onClick={() => {
            if (k !== active) start(() => setCategory(k));
          }}
        >
          {CATEGORY_LABEL[k]}
        </button>
      ))}
    </div>
  );
}

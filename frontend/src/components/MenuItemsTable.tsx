"use client";

/**
 * One category's items, as a collapsible and sortable section.
 *
 * Extracted because the menu page rendered this table twice — once for
 * categorised items and once for the uncategorised — in near-identical blocks
 * of eighty lines. Collapsing and sorting would have meant writing both twice
 * more, and the second copy is always the one that drifts.
 *
 * Two things this fixes beyond the duplication:
 *
 * **It collapses.** A real venue menu runs to two hundred items. Finding
 * "Premium Spirits" meant scrolling past every beer, and on a phone — which is
 * where an owner actually does this — that is most of a minute.
 *
 * **The drag handle is gone.** Every row rendered a GripVertical that nothing
 * was wired to, so the table advertised a running order it could not set.
 * Sorting here is a view: it changes what the owner sees while they work and
 * never what a guest's menu shows. Leaving a fake grip beside it would have
 * made that distinction impossible to read.
 */

import { ChevronDown, ChevronRight, Edit2, ToggleLeft, ToggleRight, Trash2 } from "lucide-react";

import { formatNGN } from "@/lib/utils";
import {
  COLUMN_LABEL,
  type SortDirection,
  type SortKey,
  sortItems,
} from "@/lib/menuSort";

export interface TableItem {
  id: string;
  name: string;
  description: string | null;
  price: number;
  item_type: "drink" | "food" | "other";
  is_available: boolean;
  order_count: number;
  stock_quantity?: number | null;
  image_url: string | null;
}

/** Which columns carry a heading that can be clicked. `name` is the row itself
 *  rather than a narrow column, so it sits with the image. */
const SORTABLE: SortKey[] = ["name", "type", "price", "sold", "stock"];

// Generic over the item type rather than taking TableItem directly. The table
// only reads the fields TableItem names, but the page's own MenuItem carries
// more — and handlers like onEdit expect that fuller shape back. Narrowing to
// TableItem on the way in makes them unassignable, which is exactly what the
// compiler said when this was not generic.
export function MenuItemsTable<T extends TableItem>({
  title,
  items,
  collapsed,
  onToggleCollapsed,
  sort,
  onSort,
  onEdit,
  onDelete,
  onToggleAvailability,
  muted = false,
}: {
  title: string;
  items: T[];
  collapsed: boolean;
  onToggleCollapsed: () => void;
  sort: { key: SortKey | null; direction: SortDirection };
  onSort: (key: SortKey) => void;
  onEdit: (item: T) => void;
  onDelete: (id: string) => void;
  onToggleAvailability: (item: T) => void;
  muted?: boolean;
}) {
  const ordered = sortItems(items, sort.key, sort.direction);
  const offSale = items.filter((i) => !i.is_available).length;

  return (
    <section>
      {/* The whole heading is the control, so it is a large target on a phone
          rather than a chevron somebody has to aim at. */}
      <button
        onClick={onToggleCollapsed}
        aria-expanded={!collapsed}
        className="w-full flex items-center gap-2.5 mb-3 text-left"
      >
        {collapsed ? (
          <ChevronRight size={16} style={{ color: "var(--muted)", flexShrink: 0 }} />
        ) : (
          <ChevronDown size={16} style={{ color: "var(--muted)", flexShrink: 0 }} />
        )}
        <h2
          className="font-display font-semibold"
          style={{ color: muted ? "var(--muted)" : "var(--text)" }}
        >
          {title}
        </h2>
        <span className="badge-muted">{items.length}</span>
        {offSale > 0 && (
          <span className="badge-amber">{offSale} off sale</span>
        )}
      </button>

      {!collapsed && (
        <div className="card overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: "var(--bg-surface)" }}>
                  {/* Image column — no heading, nothing to sort by. */}
                  <th className="w-12" />
                  {SORTABLE.map((key) => {
                    const active = sort.key === key;
                    return (
                      <th
                        key={key}
                        className="px-4 py-2 text-left"
                        aria-sort={
                          active
                            ? sort.direction === "asc"
                              ? "ascending"
                              : "descending"
                            : "none"
                        }
                      >
                        <button
                          onClick={() => onSort(key)}
                          className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wider"
                          style={{ color: active ? "var(--teal)" : "var(--muted)" }}
                        >
                          {COLUMN_LABEL[key]}
                          {/* The arrow only appears on the active column. A
                              permanent pair of faint arrows on every heading
                              reads as decoration and stops meaning anything. */}
                          {active && (
                            <span aria-hidden="true">
                              {sort.direction === "asc" ? "↑" : "↓"}
                            </span>
                          )}
                        </button>
                      </th>
                    );
                  })}
                  <th className="px-4 py-2 text-left">
                    <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
                      On sale
                    </span>
                  </th>
                  <th className="w-20" />
                </tr>
              </thead>
              <tbody>
                {ordered.map((item, idx) => (
                  <tr
                    key={item.id}
                    className={`${idx > 0 ? "border-t border-border" : ""} hover:bg-bg-hover/40`}
                    // Dimmed rather than hidden: an owner looking for something
                    // they took off sale needs to find it, not wonder whether
                    // it was deleted.
                    style={{ opacity: item.is_available ? 1 : 0.55 }}
                  >
                    <td className="px-3 py-2.5 w-12">
                      {item.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.image_url}
                          alt={item.name}
                          className="w-10 h-10 rounded-lg object-cover"
                          style={{ border: "1px solid rgba(255,255,255,0.08)" }}
                        />
                      ) : (
                        <div
                          className="w-10 h-10 rounded-lg flex items-center justify-center text-lg"
                          style={{
                            background: "rgba(255,255,255,0.04)",
                            border: "1px solid rgba(255,255,255,0.06)",
                          }}
                        >
                          {item.item_type === "drink" ? "🍸" : item.item_type === "food" ? "🍽️" : "✨"}
                        </div>
                      )}
                    </td>

                    <td className="px-4 py-3">
                      <p className="font-medium" style={{ color: "var(--text)" }}>
                        {item.name}
                      </p>
                      {item.description && (
                        <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
                          {item.description}
                        </p>
                      )}
                    </td>

                    <td className="px-4 py-3">
                      <span
                        className={`badge-${item.item_type === "drink" ? "teal" : item.item_type === "food" ? "amber" : "muted"}`}
                      >
                        {item.item_type}
                      </span>
                    </td>

                    <td className="px-4 py-3 font-semibold tabular-nums" style={{ color: "var(--text)" }}>
                      {formatNGN(item.price)}
                    </td>

                    <td className="px-4 py-3 text-xs tabular-nums" style={{ color: "var(--muted)" }}>
                      {item.order_count > 0 ? item.order_count : "—"}
                    </td>

                    <td className="px-4 py-3 text-xs tabular-nums" style={{ color: "var(--muted)" }}>
                      {/* An em dash, not a nought. Nobody having entered a
                          stock level is a different fact from none being left,
                          and the sort keeps them apart too. */}
                      {item.stock_quantity == null ? "—" : item.stock_quantity}
                    </td>

                    <td className="px-4 py-3">
                      <button
                        onClick={() => onToggleAvailability(item)}
                        aria-label={
                          item.is_available
                            ? `Take ${item.name} off sale`
                            : `Put ${item.name} back on sale`
                        }
                      >
                        {item.is_available ? (
                          <ToggleRight size={22} style={{ color: "var(--teal)" }} />
                        ) : (
                          <ToggleLeft size={22} style={{ color: "var(--muted)" }} />
                        )}
                      </button>
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <button
                          onClick={() => onEdit(item)}
                          aria-label={`Edit ${item.name}`}
                          className="p-1.5 rounded-lg transition-colors"
                          style={{ color: "var(--muted)" }}
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          onClick={() => onDelete(item.id)}
                          aria-label={`Delete ${item.name}`}
                          className="p-1.5 rounded-lg transition-colors"
                          style={{ color: "var(--muted)" }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

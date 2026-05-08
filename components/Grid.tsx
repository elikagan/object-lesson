'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { Item } from '@/lib/types';
import { FILTER_OPTIONS } from '@/lib/types';
import { thumbUrl, heroOf, isItemNew, filterItems } from '@/lib/items';

/**
 * Grid + filter dropdown.
 *
 * Mirrors v1: single active filter (no multi-select), categories + Under $400.
 * Sold items shown at the end when filter = "all", hidden in other filters.
 */
export function Grid({ items }: { items: Item[] }) {
  const [filter, setFilter] = useState<string>('all');
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  const filtered = filterItems(items, filter);
  const filterLabel = FILTER_OPTIONS.find((o) => o.value === filter)?.label ?? 'All';

  return (
    <>
      <div className="filter-bar">
        <div className="filter-wrap" ref={wrapRef}>
          <button
            className="filter-btn"
            onClick={(e) => {
              e.stopPropagation();
              setOpen((v) => !v);
            }}
          >
            <svg className="filter-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="4" y1="21" x2="4" y2="14" />
              <line x1="4" y1="10" x2="4" y2="3" />
              <line x1="12" y1="21" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12" y2="3" />
              <line x1="20" y1="21" x2="20" y2="16" />
              <line x1="20" y1="12" x2="20" y2="3" />
              <line x1="1" y1="14" x2="7" y2="14" />
              <line x1="9" y1="8" x2="15" y2="8" />
              <line x1="17" y1="16" x2="23" y2="16" />
            </svg>
            <span>{filterLabel}</span>
          </button>
          <div className={`filter-dropdown${open ? ' open' : ''}`}>
            {FILTER_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                className={`filter-opt${filter === opt.value ? ' active' : ''}`}
                onClick={() => {
                  setFilter(opt.value);
                  setOpen(false);
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <main>
        {filtered.length === 0 ? (
          <p className="empty show">Nothing here yet.</p>
        ) : (
          <div className="grid" id="product-grid">
            {filtered.map((item, i) => {
              const isSold = !!item.is_sold;
              const showNew = isItemNew(item) && !isSold;
              const showHold = item.is_hold && !isSold;
              const heroSrc = thumbUrl(heroOf(item));
              return (
                <Link
                  key={item.id}
                  className={`card${isSold ? ' card--sold' : ''}`}
                  href={`/item/${item.id}`}
                  style={{ animationDelay: `${i * 0.04}s` }}
                >
                  <div className="card-image">
                    {heroSrc && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={heroSrc} alt={item.title} loading="lazy" />
                    )}
                    {showNew && <span className="card-new">New</span>}
                    {showHold && <span className="card-hold">On Hold</span>}
                    {isSold && <span className="card-sold">Sold</span>}
                  </div>
                  <div className="card-title">{item.title}</div>
                  <div className="card-price">${Number(item.price).toLocaleString()}</div>
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </>
  );
}

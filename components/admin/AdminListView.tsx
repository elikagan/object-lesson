'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Sortable from 'sortablejs';
import type { Item } from '@/lib/types';
import { thumbUrl, heroOf, formatId, isItemNew } from '@/lib/items';

/**
 * Admin list view — matches v1 admin/index.html lines 47-85 + app.js renderList()
 * verbatim. Wired to v2 API routes.
 *
 * Behavior parity with v1:
 *   - Topbar: logo center, version label + hamburger menu right
 *   - Item list: drag handle, swipe-to-delete, click anywhere else to edit
 *   - Archive section (sold items) collapsible
 *   - FAB "+" button bottom right
 *   - Hamburger menu items: Analytics, Sales, Gift Certificates, Marketing, Settings
 *     (those screens still link to v1 admin until ported in a follow-up)
 */
export function AdminListView({ items: initialItems, version }: { items: Item[]; version: string }) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [menuOpen, setMenuOpen] = useState(false);
  const [archiveCollapsed, setArchiveCollapsed] = useState(true);
  const [openSwipeId, setOpenSwipeId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const sortableRef = useRef<Sortable | null>(null);
  const swipeStartRef = useRef<{ id: string; x: number; y: number; locked: boolean | null } | null>(null);

  // Set up Sortable for drag-reorder of active items
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    async function saveOrder(orderedActiveIds: string[]) {
      // Each item gets its own PATCH (single-row update — the architectural fix).
      const updates = orderedActiveIds.map((id, idx) =>
        fetch(`/api/admin/items/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ display_order: idx }),
        }),
      );
      await Promise.all(updates);
      router.refresh();
    }
    const instance = Sortable.create(el, {
      handle: '.item-drag',
      ghostClass: 'sortable-ghost',
      animation: 200,
      filter: '.archive-header, .archive-items',
      onMove(evt) {
        return (
          !evt.related.classList.contains('archive-header') &&
          !evt.related.classList.contains('archive-items')
        );
      },
      onEnd: () => {
        const rows = el.querySelectorAll<HTMLElement>(':scope > .swipe-wrap > .item-row');
        const newIds = Array.from(rows).map((r) => r.dataset.id!).filter(Boolean);
        void saveOrder(newIds);
      },
    });
    sortableRef.current = instance;
    return () => {
      try {
        instance.destroy();
      } catch {
        // Sortable can throw if the DOM element was already unmounted by React
        // StrictMode's double-invocation; safe to ignore.
      }
      if (sortableRef.current === instance) sortableRef.current = null;
    };
  }, [items, router]);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.menu-wrap')) setMenuOpen(false);
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [menuOpen]);

  // Close swipe on outside touch
  useEffect(() => {
    if (!openSwipeId) return;
    const onTouchStart = (e: TouchEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest(`.swipe-wrap[data-id="${openSwipeId}"]`)) setOpenSwipeId(null);
    };
    document.addEventListener('touchstart', onTouchStart, { passive: true });
    return () => document.removeEventListener('touchstart', onTouchStart);
  }, [openSwipeId]);

  async function deleteItem(id: string) {
    const item = items.find((i) => i.id === id);
    if (!item) return;
    if (!confirm(`Delete ${item.title || 'this item'}?`)) return;
    const res = await fetch(`/api/admin/items/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      alert('Delete failed');
      return;
    }
    setItems((arr) => arr.filter((i) => i.id !== id));
  }

  // Touch handlers for swipe-to-reveal-delete
  function onSwipeStart(e: React.TouchEvent<HTMLDivElement>, id: string) {
    const t = e.touches[0];
    swipeStartRef.current = { id, x: t.clientX, y: t.clientY, locked: null };
  }

  function onSwipeMove(e: React.TouchEvent<HTMLDivElement>, id: string) {
    const start = swipeStartRef.current;
    if (!start || start.id !== id) return;
    const t = e.touches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    // Lock direction on first significant move
    if (start.locked === null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
      start.locked = Math.abs(dx) > Math.abs(dy);
      if (!start.locked) swipeStartRef.current = null;
    }
  }

  function onSwipeEnd(e: React.TouchEvent<HTMLDivElement>, id: string) {
    const start = swipeStartRef.current;
    swipeStartRef.current = null;
    if (!start || !start.locked) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    if (dx < -40) setOpenSwipeId(id);
    else if (dx > 40 && openSwipeId === id) setOpenSwipeId(null);
  }

  function onRowClick(e: React.MouseEvent, id: string) {
    const target = e.target as HTMLElement;
    if (target.closest('.item-drag')) return;
    if (openSwipeId === id) {
      setOpenSwipeId(null);
      return;
    }
    router.push(`/admin/items/${id}`);
  }

  const active = items.filter((i) => !i.is_sold);
  const sold = items.filter((i) => i.is_sold);

  return (
    <div id="view-list" className="view">
      <header className="topbar">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/OL_logo.svg" alt="Object Lesson" className="topbar-logo" />
        <div className="topbar-actions">
          <span className="version-label">{version}</span>
          <div className="menu-wrap">
            <button
              className="icon-btn"
              aria-label="Menu"
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen((v) => !v);
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
            <div className={`menu-dropdown${menuOpen ? '' : ' hidden'}`}>
              {/* Analytics / Gift Certificates / Marketing remain wired to the v1 hash routes
                  until their respective sub-views ship in the AUDIT.md backlog. */}
              <a className="menu-item" href="https://objectlesson.la/admin/#analytics" target="_blank" rel="noopener noreferrer">
                <MenuIcon name="analytics" />
                Analytics
              </a>
              <a className="menu-item" href="/admin/sales">
                <MenuIcon name="sales" />
                Sales
              </a>
              <a className="menu-item" href="https://objectlesson.la/admin/#giftcerts" target="_blank" rel="noopener noreferrer">
                <MenuIcon name="giftcerts" />
                Gift Certificates
              </a>
              <a className="menu-item" href="https://objectlesson.la/admin/#marketing" target="_blank" rel="noopener noreferrer">
                <MenuIcon name="marketing" />
                Marketing
              </a>
              <button
                className="menu-item"
                onClick={async () => {
                  await fetch('/api/admin/auth', { method: 'DELETE' });
                  router.replace('/admin');
                  router.refresh();
                }}
              >
                <MenuIcon name="settings" />
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="item-list" ref={listRef}>
        {items.length === 0 ? (
          <div className="list-empty">No items yet. Tap + to add one.</div>
        ) : (
          <>
            {active.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                openSwipeId={openSwipeId}
                onSwipeStart={onSwipeStart}
                onSwipeMove={onSwipeMove}
                onSwipeEnd={onSwipeEnd}
                onRowClick={onRowClick}
                onDelete={deleteItem}
              />
            ))}
            {sold.length > 0 && (
              <>
                <div
                  className={`archive-header${archiveCollapsed ? ' collapsed' : ''}`}
                  onClick={() => setArchiveCollapsed((v) => !v)}
                >
                  <span>Archive</span>
                  <span className="archive-count">{sold.length}</span>
                  <svg className="archive-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </div>
                <div className={`archive-items${archiveCollapsed ? ' collapsed' : ''}`}>
                  {sold.map((item) => (
                    <ItemRow
                      key={item.id}
                      item={item}
                      openSwipeId={openSwipeId}
                      onSwipeStart={onSwipeStart}
                      onSwipeMove={onSwipeMove}
                      onSwipeEnd={onSwipeEnd}
                      onRowClick={onRowClick}
                      onDelete={deleteItem}
                    />
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>

      <button
        className="fab"
        aria-label="Add item"
        onClick={() => router.push('/admin/items/new')}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>
    </div>
  );
}

function ItemRow({
  item,
  openSwipeId,
  onSwipeStart,
  onSwipeMove,
  onSwipeEnd,
  onRowClick,
  onDelete,
}: {
  item: Item;
  openSwipeId: string | null;
  onSwipeStart: (e: React.TouchEvent<HTMLDivElement>, id: string) => void;
  onSwipeMove: (e: React.TouchEvent<HTMLDivElement>, id: string) => void;
  onSwipeEnd: (e: React.TouchEvent<HTMLDivElement>, id: string) => void;
  onRowClick: (e: React.MouseEvent, id: string) => void;
  onDelete: (id: string) => void;
}) {
  const heroSrc = thumbUrl(heroOf(item));
  const isOpen = openSwipeId === item.id;
  let badge: React.ReactNode = null;
  if (item.is_sold) badge = <span className="item-sold">Sold</span>;
  else if (item.is_hold) badge = <span className="item-hold">Hold</span>;
  else if (isItemNew(item)) badge = <span className="item-new">New</span>;

  return (
    <div
      className="swipe-wrap"
      data-id={item.id}
      onTouchStart={(e) => onSwipeStart(e, item.id)}
      onTouchMove={(e) => onSwipeMove(e, item.id)}
      onTouchEnd={(e) => onSwipeEnd(e, item.id)}
    >
      <div className="swipe-behind">
        <button
          className="swipe-delete"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(item.id);
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
            <path d="M10 11v6" />
            <path d="M14 11v6" />
            <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
          </svg>
        </button>
      </div>
      <div
        className="item-row"
        data-id={item.id}
        style={{ transform: isOpen ? 'translateX(-72px)' : undefined }}
        onClick={(e) => onRowClick(e, item.id)}
      >
        <div className="item-drag">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="9" cy="6" r="1" />
            <circle cx="15" cy="6" r="1" />
            <circle cx="9" cy="12" r="1" />
            <circle cx="15" cy="12" r="1" />
            <circle cx="9" cy="18" r="1" />
            <circle cx="15" cy="18" r="1" />
          </svg>
        </div>
        <div className="item-thumb">
          {heroSrc && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={heroSrc} alt="" />
          )}
        </div>
        <div className="item-info">
          <div className="item-name">{item.title || 'Untitled'}</div>
          <div className="item-meta">
            <span className="item-id">{formatId(item.id)}</span> · ${Number(item.price || 0).toLocaleString()}
          </div>
        </div>
        {badge}
        {item.posted_by && <span className="item-poster">{item.posted_by}</span>}
        <span className="item-category">{item.category || ''}</span>
      </div>
    </div>
  );
}

function MenuIcon({ name }: { name: string }) {
  switch (name) {
    case 'analytics':
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="20" x2="18" y2="10" />
          <line x1="12" y1="20" x2="12" y2="4" />
          <line x1="6" y1="20" x2="6" y2="14" />
        </svg>
      );
    case 'sales':
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="1" x2="12" y2="23" />
          <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
        </svg>
      );
    case 'giftcerts':
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="8" width="18" height="13" rx="2" />
          <path d="M12 8V21" />
          <path d="M3 12h18" />
        </svg>
      );
    case 'marketing':
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
          <polyline points="22,6 12,13 2,6" />
        </svg>
      );
    case 'settings':
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      );
    default:
      return null;
  }
}

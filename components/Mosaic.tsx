'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Item } from '@/lib/types';
import { thumbUrl, heroOf } from '@/lib/items';

/**
 * Decorative shuffling mosaic shown above the grid.
 *
 * Behavior (ported from v1):
 *   - 18 cells on desktop, 12 on tablet, 6 on mobile.
 *   - Each cell is a flip-card — front and back faces. Flipping shows the back face
 *     with a new image; the next flip shows the front face with the next-next image.
 *   - A "deck" holds items not currently on screen. Flipping pulls from the deck and
 *     pushes the displaced item back onto the deck (after the flip animation finishes,
 *     so the same item never appears in two cells at once).
 *   - Flip every 1s; flip 2-3 cells (mobile) or 4-5 (desktop) per tick.
 *   - Pause when tab is hidden (resumed on visibilitychange).
 */

const FLIP_INTERVAL_MS = 1000;
const FLIP_ANIM_MS = 700;
const DESKTOP_FLIPS = 4;
const MOBILE_FLIPS = 2;

type Cell = {
  index: number;
  flipped: boolean;
  currentItem: Item;
  animating: boolean;
  /** The image displayed on the currently hidden face (the one about to come into view). */
  hiddenImage: string | null;
};

function visibleCellCount(width: number) {
  if (width <= 559) return 6;
  if (width <= 959) return 12;
  return 18;
}

function flipBaseCount(width: number) {
  return width <= 559 ? MOBILE_FLIPS : DESKTOP_FLIPS;
}

export function Mosaic({ items }: { items: Item[] }) {
  const eligible = useMemo(
    () => items.filter((i) => !i.is_sold && (i.hero_image || (i.images && i.images.length > 0))),
    [items],
  );

  // Stable shuffle for the initial cell assignment so React can re-render without churn.
  // Generated client-side after mount to avoid hydration mismatch.
  const [cells, setCells] = useState<Cell[]>([]);
  const deckRef = useRef<Item[]>([]);
  const cellsRef = useRef<Cell[]>([]);

  useEffect(() => {
    if (eligible.length < 4) return;

    const shuffled = [...eligible].sort(() => Math.random() - 0.5);
    const cellCount = Math.min(18, shuffled.length);
    const initial: Cell[] = [];
    for (let i = 0; i < cellCount; i++) {
      initial.push({
        index: i,
        flipped: false,
        currentItem: shuffled[i],
        animating: false,
        hiddenImage: null,
      });
    }
    deckRef.current = shuffled.slice(cellCount);
    cellsRef.current = initial;
    // Initial setup from props — intentional set-during-effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCells(initial);
  }, [eligible]);

  // Flip loop
  useEffect(() => {
    if (cells.length < 4) return;

    let timer: ReturnType<typeof setInterval> | null = null;
    let stopped = false;

    function tick() {
      if (stopped) return;
      const w = window.innerWidth;
      const vis = visibleCellCount(w);
      const available = cellsRef.current.filter((c) => c.index < vis && !c.animating);
      if (available.length < 2) return;

      const base = flipBaseCount(w);
      const want = Math.random() < 0.5 ? base : base + 1;
      const count = Math.min(want, available.length, deckRef.current.length);
      if (count === 0) return;

      const toFlip = [...available].sort(() => Math.random() - 0.5).slice(0, count);

      // Build the next cells state synchronously
      const next = [...cellsRef.current];
      for (const cell of toFlip) {
        const newItem = deckRef.current.shift();
        if (!newItem) continue;
        const oldItem = cell.currentItem;
        const updated: Cell = {
          ...cell,
          animating: true,
          flipped: !cell.flipped,
          currentItem: newItem,
          hiddenImage: thumbUrl(heroOf(newItem)),
        };
        next[cell.index] = updated;

        // After animation, mark cell idle and return old item to deck
        const oldCellState = cell;
        setTimeout(() => {
          if (stopped) return;
          const refCell = cellsRef.current[oldCellState.index];
          if (refCell) {
            const finalized: Cell = {
              ...refCell,
              animating: false,
            };
            cellsRef.current[oldCellState.index] = finalized;
            setCells([...cellsRef.current]);
          }
          deckRef.current.push(oldItem);
        }, FLIP_ANIM_MS + 50);
      }
      cellsRef.current = next;
      setCells(next);
    }

    function start() {
      if (timer) return;
      timer = setInterval(tick, FLIP_INTERVAL_MS);
    }
    function stop() {
      if (timer) clearInterval(timer);
      timer = null;
    }
    start();

    function onVisibility() {
      if (document.hidden) stop();
      else start();
    }
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      stopped = true;
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
    // We deliberately depend only on cells.length so the loop doesn't restart every flip.
  }, [cells.length]);

  if (eligible.length < 4) return null;

  return (
    <div className="mosaic" id="mosaic">
      {cells.map((cell) => {
        const frontSrc = thumbUrl(heroOf(cell.currentItem));
        const backSrc = cell.hiddenImage ?? frontSrc;
        // Display logic: when flipped=false, front shows currentItem.
        // When flipped=true, back shows currentItem (front shows the previous item — but
        // since we update both faces visually each flip via hiddenImage, this is simpler:
        // we show currentItem on whichever face is forward at the moment.)
        return (
          <Link key={cell.index} className="mosaic-cell" href={`/item/${cell.currentItem.id}`}>
            <div className={`mosaic-inner${cell.flipped ? ' flipped' : ''}`}>
              <div className="mosaic-face mosaic-front">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={cell.flipped ? backSrc : frontSrc} alt="" loading="lazy" />
              </div>
              <div className="mosaic-face mosaic-back">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={cell.flipped ? frontSrc : backSrc} alt="" loading="lazy" />
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

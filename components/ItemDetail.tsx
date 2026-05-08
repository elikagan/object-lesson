'use client';

import { useEffect, useRef, useState } from 'react';
import type { Item } from '@/lib/types';
import { imgUrl, formatId, isItemNew } from '@/lib/items';
import { createClient } from '@/lib/supabase/client';

const PHONE = '3104985138';
const EMAIL = 'eli@objectlesson.la';
// During Phase 3, the new site still calls the v1 worker for checkout.
// In Phase 5 this gets replaced with /api/checkout (a Next.js route).
const CHECKOUT_URL = 'https://ol-checkout.objectlesson.workers.dev/checkout';

type Discount = { code: string; type: 'percent' | 'fixed'; value: number } | null;

/**
 * Item detail page — sliding carousel + thumbnails + buy/inquire flow.
 *
 * The carousel is a touch-draggable strip with thumbnail navigation. Buy Now
 * gates behind email capture (first time) then redirects to Square checkout.
 * Inquire opens SMS on mobile or mailto on desktop.
 */
export function ItemDetail({ item, justPurchased }: { item: Item; justPurchased: boolean }) {
  const images = (item.images ?? []).map(imgUrl);
  const heroIdx = Math.max(
    0,
    images.findIndex((u) => u === imgUrl(item.hero_image)),
  );
  const [index, setIndex] = useState(heroIdx);
  const [discount, setDiscount] = useState<Discount>(null);
  const [discountInput, setDiscountInput] = useState('');
  const [discountError, setDiscountError] = useState(false);
  const [discountSubmitting, setDiscountSubmitting] = useState(false);
  const [emailGateOpen, setEmailGateOpen] = useState(false);
  const [emailGateInput, setEmailGateInput] = useState('');
  const [emailGateSubmitting, setEmailGateSubmitting] = useState(false);
  const [buying, setBuying] = useState(false);
  const [scrollHintHidden, setScrollHintHidden] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);

  // Touch swipe state
  const trackRef = useRef<HTMLDivElement>(null);
  const carouselRef = useRef<HTMLDivElement>(null);

  // Hide scroll hint after first scroll
  useEffect(() => {
    function onScroll() {
      if (window.scrollY > 50) setScrollHintHidden(true);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Touch drag carousel
  useEffect(() => {
    if (images.length < 2) return;
    const carousel = carouselRef.current;
    const track = trackRef.current;
    if (!carousel || !track) return;

    let startX = 0;
    let startY = 0;
    let dragging = false;
    let locked = false;
    let carouselW = 0;

    function onTouchStart(e: TouchEvent) {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      dragging = true;
      locked = false;
      carouselW = carousel!.offsetWidth;
      track!.classList.remove('animating');
    }
    function onTouchMove(e: TouchEvent) {
      if (!dragging) return;
      const dx = e.touches[0].clientX - startX;
      const dy = e.touches[0].clientY - startY;
      if (!locked && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
        locked = true;
        if (Math.abs(dy) > Math.abs(dx)) {
          dragging = false;
          return;
        }
      }
      if (locked) {
        e.preventDefault();
        let offset = dx;
        if ((index === 0 && dx > 0) || (index === images.length - 1 && dx < 0)) {
          offset = dx * 0.3;
        }
        const pct = ((-index * carouselW + offset) / carouselW) * 100;
        track!.style.transform = `translateX(${pct}%)`;
      }
    }
    function onTouchEnd(e: TouchEvent) {
      if (!dragging) return;
      dragging = false;
      const dx = e.changedTouches[0].clientX - startX;
      const threshold = carouselW * 0.2;
      let target = index;
      if (dx < -threshold && index < images.length - 1) target = index + 1;
      else if (dx > threshold && index > 0) target = index - 1;
      slideTo(target, true);
    }

    carousel.addEventListener('touchstart', onTouchStart, { passive: true });
    carousel.addEventListener('touchmove', onTouchMove, { passive: false });
    carousel.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      carousel.removeEventListener('touchstart', onTouchStart);
      carousel.removeEventListener('touchmove', onTouchMove);
      carousel.removeEventListener('touchend', onTouchEnd);
    };
    // index intentionally tracked so handlers see fresh value
  }, [index, images.length]);

  // Update transform on index change (animated)
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    track.classList.add('animating');
    track.style.transform = `translateX(${-index * 100}%)`;
  }, [index]);

  function slideTo(i: number, animate: boolean) {
    const track = trackRef.current;
    if (!track) return;
    if (animate) track.classList.add('animating');
    else track.classList.remove('animating');
    track.style.transform = `translateX(${-i * 100}%)`;
    setIndex(i);
  }

  const isMobile =
    typeof window !== 'undefined' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  const inquireMsg = `Hi, I'm interested in ${item.title} for $${Number(item.price).toLocaleString()}. (item ${formatId(item.id)})`;
  const inquireHref = isMobile
    ? `sms:${PHONE}&body=${encodeURIComponent(inquireMsg)}`
    : `mailto:${EMAIL}?subject=${encodeURIComponent('Inquiry: ' + item.title)}&body=${encodeURIComponent(inquireMsg)}`;

  const hasPrice = Number(item.price) > 0;
  const wasPurchased = justPurchased;
  const showSold = wasPurchased || item.is_sold;
  const showHold = !showSold && item.is_hold;
  const showBuy = !showSold && !showHold && hasPrice;

  // Discounted price
  const originalPrice = Number(item.price);
  let discountedPrice: number | null = null;
  if (discount && originalPrice > 0) {
    discountedPrice =
      discount.type === 'percent'
        ? originalPrice * (1 - discount.value / 100)
        : Math.max(0, originalPrice - discount.value);
  }

  async function applyDiscount() {
    const code = discountInput.trim().toUpperCase();
    if (!code) return;
    setDiscountSubmitting(true);
    setDiscountError(false);
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('discount_codes')
        .select('code, type, value, max_uses, used_count')
        .eq('code', code)
        .eq('is_active', true)
        .limit(1);
      if (error || !data || data.length === 0) {
        setDiscountError(true);
        setTimeout(() => setDiscountError(false), 2000);
        return;
      }
      const d = data[0] as { code: string; type: 'percent' | 'fixed'; value: number; max_uses: number | null; used_count: number };
      if (d.max_uses && d.used_count >= d.max_uses) {
        setDiscountError(true);
        setTimeout(() => setDiscountError(false), 2000);
        return;
      }
      setDiscount({ code: d.code, type: d.type, value: Number(d.value) });
    } finally {
      setDiscountSubmitting(false);
    }
  }

  function removeDiscount() {
    setDiscount(null);
    setDiscountInput('');
  }

  async function proceedToCheckout() {
    setBuying(true);
    try {
      const body: Record<string, unknown> = {
        title: item.title,
        price: Number(item.price),
        itemId: item.id,
      };
      if (discount) body.discountCode = discount.code;
      const res = await fetch(CHECKOUT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        alert(data.error || 'Checkout unavailable. Please inquire directly.');
        setBuying(false);
      }
    } catch {
      alert('Checkout unavailable. Please inquire directly.');
      setBuying(false);
    }
  }

  function onBuyClick() {
    if (typeof window === 'undefined') return;
    if (localStorage.getItem('ol_email_collected')) {
      proceedToCheckout();
    } else {
      setEmailGateOpen(true);
    }
  }

  async function onEmailGateSubmit() {
    const email = emailGateInput.trim();
    if (!email) return;
    setEmailGateSubmitting(true);
    try {
      const supabase = createClient();
      await supabase.from('emails').insert({
        email,
        source: 'abandoned_cart',
        item_id: item.id,
      });
    } catch {
      /* non-critical */
    }
    localStorage.setItem('ol_email_collected', '1');
    localStorage.setItem('ol_email_dismissed', '1');
    proceedToCheckout();
  }

  async function onShareClick() {
    if (typeof window === 'undefined') return;
    const shareUrl = `${window.location.origin}/item/${item.id}`;
    const shareData = {
      title: item.title,
      text: `${item.title} — $${Number(item.price).toLocaleString()}`,
      url: shareUrl,
    };
    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch {
        /* user cancelled */
      }
    } else {
      try {
        await navigator.clipboard.writeText(shareUrl);
        setShareCopied(true);
        setTimeout(() => setShareCopied(false), 1500);
      } catch {
        /* clipboard blocked */
      }
    }
  }

  return (
    <>
      <div className={`detail-scroll-hint${scrollHintHidden ? ' hidden' : ''}`}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>
      <div className="detail-body">
        <div className="detail-gallery">
          <div className="detail-carousel" ref={carouselRef}>
            <div className="detail-track" ref={trackRef}>
              {images.map((src, i) => (
                <div key={i} className="detail-slide">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt={`${item.title}${i > 0 ? ` — detail ${i + 1}` : ''}`} draggable={false} />
                </div>
              ))}
            </div>
          </div>
          {images.length > 1 && (
            <div className="detail-thumbs">
              {images.map((src, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={i}
                  src={src}
                  alt=""
                  className={`detail-thumb${i === index ? ' active' : ''}`}
                  onClick={() => slideTo(i, true)}
                />
              ))}
            </div>
          )}
        </div>

        <div className="detail-info">
          {showSold && <span className="detail-sold">Sold</span>}
          {showHold && <span className="detail-hold">On Hold</span>}
          {!showSold && !showHold && isItemNew(item) && <span className="detail-new">New</span>}
          <h1 className="detail-title">{item.title}</h1>
          <div className={`detail-price${discount ? ' discounted' : ''}`}>
            ${Number(item.price).toLocaleString()}
          </div>
          {discountedPrice !== null && (
            <div className="detail-discount-price">
              ${discountedPrice.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
            </div>
          )}
          {item.size && <div className="detail-size">{item.size}</div>}
          {(item.maker || item.condition) && (
            <div className="detail-meta">
              {item.maker && <span className="detail-maker">{item.maker}</span>}
              {item.condition && <span className="detail-condition">{item.condition}</span>}
            </div>
          )}
          {item.description && <p className="detail-desc">{item.description}</p>}

          {showBuy && (
            <div className="detail-discount">
              {!discount ? (
                <div className="discount-input-wrap">
                  <input
                    type="text"
                    className="discount-input"
                    placeholder="Discount or gift certificate code"
                    value={discountInput}
                    onChange={(e) => setDiscountInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        applyDiscount();
                      }
                    }}
                    style={{ borderColor: discountError ? '#c00' : undefined }}
                  />
                  <button
                    className="discount-apply"
                    onClick={applyDiscount}
                    disabled={discountSubmitting}
                  >
                    {discountSubmitting ? '...' : 'Apply'}
                  </button>
                </div>
              ) : (
                <div className="discount-applied" style={{ display: 'flex' }}>
                  <span className="discount-badge">
                    {discount.code} —{' '}
                    {discount.type === 'percent' ? `${discount.value}% off` : `$${discount.value} off`}
                  </span>
                  <button className="discount-remove" onClick={removeDiscount}>
                    ×
                  </button>
                </div>
              )}
            </div>
          )}

          {!emailGateOpen ? (
            <div className="detail-actions">
              {showBuy && (
                <button className="detail-buy" onClick={onBuyClick} disabled={buying}>
                  {buying ? 'Processing...' : 'Buy Now'}
                </button>
              )}
              {!showSold && (
                <a className="detail-inquire" href={inquireHref}>
                  Inquire
                </a>
              )}
              <button
                className={`detail-share${shareCopied ? ' copied' : ''}`}
                onClick={onShareClick}
                aria-label="Share"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                  <polyline points="16 6 12 2 8 6" />
                  <line x1="12" y1="2" x2="12" y2="15" />
                </svg>
              </button>
            </div>
          ) : (
            <div className="detail-email-gate" style={{ display: 'block' }}>
              <p className="email-gate-label">Enter your email to complete purchase</p>
              <div className="email-gate-row">
                <input
                  type="email"
                  className="email-gate-input"
                  placeholder="you@email.com"
                  value={emailGateInput}
                  onChange={(e) => setEmailGateInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      onEmailGateSubmit();
                    }
                  }}
                  required
                />
                <button
                  className="email-gate-btn"
                  onClick={onEmailGateSubmit}
                  disabled={emailGateSubmitting}
                >
                  {emailGateSubmitting ? 'Processing...' : 'Continue to Checkout'}
                </button>
              </div>
            </div>
          )}

          {showBuy && (
            <p className="detail-shipping">
              Free pickup in Pasadena. LA delivery available.
              <br />
              Shipping at lowest available rate — calculated after purchase.
            </p>
          )}

          {wasPurchased && (
            <div className="detail-purchased" style={{ display: 'block' }}>
              <p className="purchased-thanks">Thank you for your purchase!</p>
              <p className="purchased-info">
                Your item will be available for pickup at Object Lesson at the{' '}
                <strong>Pasadena Antique Center</strong>.
              </p>
              <p className="purchased-info">
                To arrange other pickup or shipping options,{' '}
                <a
                  href={`sms:${PHONE}?body=${encodeURIComponent(`Hi! I just purchased "${item.title}" from Object Lesson. `)}`}
                >
                  send us a text
                </a>
                .
              </p>
            </div>
          )}

          <div className="detail-id">{formatId(item.id)}</div>
        </div>
      </div>
    </>
  );
}

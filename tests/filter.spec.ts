import { test, expect } from '@playwright/test';
import { filterItems } from '@/lib/items';
import { FILTER_OPTIONS } from '@/lib/types';
import type { Item } from '@/lib/types';

/**
 * P0-8 — filter dropdown parity. Three layers of verification:
 *
 *   1. Unit-style assertions on filterItems() against a fixture set.
 *   2. FILTER_OPTIONS has all 9 v1 options.
 *   3. Browser test: dropdown click-outside-closes behavior on the live grid.
 */

function makeItem(over: Partial<Item> = {}): Item {
  return {
    id: 'x',
    title: 'x',
    description: '',
    price: 100,
    size: '',
    category: 'wall-art',
    maker: '',
    condition: '',
    dealer_code: '',
    posted_by: '',
    is_new: false,
    is_hold: false,
    is_sold: false,
    hero_image: null,
    images: [],
    display_order: 0,
    created_at: '',
    updated_at: '',
    ...over,
  };
}

test('FILTER_OPTIONS includes all 9 v1 options in the correct order', () => {
  const values = FILTER_OPTIONS.map((o) => o.value);
  expect(values).toEqual([
    'all',
    'under-400',
    'wall-art',
    'object',
    'ceramic',
    'furniture',
    'light',
    'sculpture',
    'misc',
  ]);
});

test("'all' filter returns available items first, sold items last", () => {
  const items: Item[] = [
    makeItem({ id: 'a', price: 100 }),
    makeItem({ id: 'b', price: 200, is_sold: true }),
    makeItem({ id: 'c', price: 300 }),
    makeItem({ id: 'd', price: 400, is_sold: true }),
  ];
  const result = filterItems(items, 'all');
  expect(result.map((r) => r.id)).toEqual(['a', 'c', 'b', 'd']);
});

test("'under-400' filter returns non-sold items with 0 < price < 400", () => {
  const items: Item[] = [
    makeItem({ id: 'a', price: 100 }),           // include
    makeItem({ id: 'b', price: 0 }),             // exclude (price = 0)
    makeItem({ id: 'c', price: 399 }),           // include
    makeItem({ id: 'd', price: 400 }),           // exclude (price = 400, boundary)
    makeItem({ id: 'e', price: 500 }),           // exclude
    makeItem({ id: 'f', price: 200, is_sold: true }), // exclude (sold)
    makeItem({ id: 'g', price: -50 }),           // exclude (negative)
  ];
  const result = filterItems(items, 'under-400');
  expect(result.map((r) => r.id).sort()).toEqual(['a', 'c']);
});

test('category filters exclude sold items and other categories', () => {
  const items: Item[] = [
    makeItem({ id: 'wa1', category: 'wall-art' }),
    makeItem({ id: 'wa2', category: 'wall-art', is_sold: true }),
    makeItem({ id: 'cer', category: 'ceramic' }),
    makeItem({ id: 'lit', category: 'light' }),
  ];
  expect(filterItems(items, 'wall-art').map((r) => r.id)).toEqual(['wa1']);
  expect(filterItems(items, 'ceramic').map((r) => r.id)).toEqual(['cer']);
  expect(filterItems(items, 'light').map((r) => r.id)).toEqual(['lit']);
});

test('homepage filter dropdown shows all 9 options and closes on outside click', async ({ page }) => {
  await page.goto('/');
  // Click filter button to open dropdown.
  const filterBtn = page.locator('button.filter-btn').first();
  await filterBtn.click();
  await expect(page.locator('.filter-dropdown.open')).toBeVisible();

  // All 9 options must be in the dropdown, in the same order.
  const labels = await page.locator('.filter-dropdown .filter-opt').allInnerTexts();
  expect(labels).toEqual([
    'All',
    'Under $400',
    'Wall Art',
    'Object',
    'Ceramic',
    'Furniture',
    'Light',
    'Sculpture',
    'Misc',
  ]);

  // Click outside the dropdown → it closes.
  await page.mouse.click(50, 400);
  await expect(page.locator('.filter-dropdown.open')).toHaveCount(0);
});

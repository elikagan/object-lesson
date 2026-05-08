-- Migration 0001: Create items table + storage bucket + helper exec function.
--
-- Run this ONCE in the Supabase SQL editor. After it succeeds, the migration
-- script (scripts/migrate-inventory.ts) can populate data, and future
-- migrations can be applied programmatically via the _supa_exec function below.

-- ─────────────────────────────────────────────────────────────────────────
-- Items table — replaces v1's inventory.json
-- ─────────────────────────────────────────────────────────────────────────

create extension if not exists moddatetime;

create table if not exists public.items (
  id            text primary key,                 -- '000079' format preserved
  title         text not null,
  description   text not null default '',
  price         numeric(12,2) not null default 0,
  size          text not null default '',
  category      text not null,
  maker         text not null default '',
  condition     text not null default '',         -- 'New' | 'Like New' | 'Good' | 'Fair' | ''
  dealer_code   text not null default '',
  posted_by     text not null default '',
  is_new        boolean not null default false,
  is_hold       boolean not null default false,
  is_sold       boolean not null default false,
  hero_image    text,                             -- storage path (relative)
  images        text[] not null default '{}',     -- array of storage paths
  display_order integer not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Sanity constraint on category — keeps typos out of the data
alter table public.items
  drop constraint if exists items_category_check;
alter table public.items
  add constraint items_category_check
  check (category in ('wall-art', 'object', 'ceramic', 'furniture', 'light', 'sculpture', 'misc'));

-- Sanity constraint on condition
alter table public.items
  drop constraint if exists items_condition_check;
alter table public.items
  add constraint items_condition_check
  check (condition in ('New', 'Like New', 'Good', 'Fair', ''));

create index if not exists items_display_order_idx on public.items (display_order);
create index if not exists items_active_idx on public.items (is_sold, is_hold);
create index if not exists items_category_idx on public.items (category) where is_sold = false;

-- Auto-update updated_at on row update
drop trigger if exists items_updated_at on public.items;
create trigger items_updated_at
  before update on public.items
  for each row execute function moddatetime(updated_at);

-- ─────────────────────────────────────────────────────────────────────────
-- Row-Level Security
-- Public can read non-hidden items; only service_role can write.
-- ─────────────────────────────────────────────────────────────────────────

alter table public.items enable row level security;

drop policy if exists "items_public_read" on public.items;
create policy "items_public_read"
  on public.items for select
  to anon, authenticated
  using (true);

-- No INSERT/UPDATE/DELETE policies for anon — only service_role bypasses RLS.

-- ─────────────────────────────────────────────────────────────────────────
-- Storage bucket for product images
-- ─────────────────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

-- Public read access on the product-images bucket
drop policy if exists "Public read access" on storage.objects;
create policy "Public read access"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'product-images');

-- ─────────────────────────────────────────────────────────────────────────
-- Helper function: _supa_exec — service_role-only arbitrary SQL.
-- Lets us apply future migrations programmatically without needing the
-- dashboard SQL editor again.
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public._supa_exec(sql text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  execute sql;
end;
$$;

-- Lock it down: only service_role can call it.
revoke all on function public._supa_exec(text) from public;
revoke all on function public._supa_exec(text) from anon, authenticated;
grant execute on function public._supa_exec(text) to service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- Migrations log: track what migrations have been applied
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public._migrations (
  filename text primary key,
  applied_at timestamptz not null default now()
);

alter table public._migrations enable row level security;
-- No policies — only service_role can read/write.

insert into public._migrations (filename) values ('0001_create_items_and_storage.sql')
on conflict (filename) do nothing;

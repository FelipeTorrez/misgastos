-- MisGastos — Initial Schema v0.1
-- Ejecutar con: supabase db push o psql
enable extension if not exists "pgcrypto";

-- Categories (system + user)
create table categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  name text not null,
  slug text not null,
  parent_id uuid references categories(id),
  type text not null check (type in ('expense','income','transfer','debt','subscription')),
  is_system boolean default false,
  created_at timestamptz default now(),
  unique(slug, user_id)
);

-- Accounts
create table accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  type text not null check (type in ('checking','vista','savings','credit_card','cash','digital_wallet','investment')),
  currency text not null default 'CLP',
  include_in_balance boolean default true,
  credit_limit bigint,
  last4 text,
  icon text,
  color text,
  created_at timestamptz default now()
);

-- Financial sources
create table financial_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('gmail','android_notification','manual','pdf','ios_share')),
  config jsonb default '{}',
  status text default 'active',
  created_at timestamptz default now()
);

-- Raw events (inmutable)
create table raw_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_id uuid references financial_sources(id),
  source text not null,
  external_id text,
  sender text,
  subject text,
  raw_content text not null,
  received_at timestamptz default now(),
  metadata jsonb default '{}',
  created_at timestamptz default now(),
  unique(source, external_id)
);

-- Transactions
create table transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid references accounts(id),
  category_id uuid references categories(id),
  raw_event_id uuid references raw_events(id),
  merchant text,
  amount bigint not null,
  currency text not null default 'CLP',
  type text not null check (type in ('expense','income','transfer')),
  payment_method text check (payment_method in ('debit_card','credit_card','transfer','cash','unknown')),
  status text not null default 'pending_review' check (status in ('pending_ai','pending_review','confirmed','corrected','ignored','duplicate')),
  confidence double precision default 0.5,
  duplicate_of uuid references transactions(id),
  transfer_group_id uuid,
  from_account_id uuid references accounts(id),
  to_account_id uuid references accounts(id),
  installment_number int,
  installment_total int,
  original_amount bigint,
  remaining_installments int,
  is_recurring_candidate boolean default false,
  date timestamptz not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Budgets
create table budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid not null references categories(id),
  amount bigint not null,
  period text not null default 'monthly',
  month date not null,
  created_at timestamptz default now(),
  unique(user_id, category_id, month)
);

-- Rules
create table rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  merchant_normalized text not null,
  preferred_category_id uuid references categories(id),
  preferred_merchant_alias text,
  hits_count int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, merchant_normalized)
);

-- Seed categories sistema
insert into categories (name, slug, type, is_system) values
('Vivienda','vivienda','expense',true),('Alimentación','alimentacion','expense',true),
('Supermercado','supermercado','expense',true),('Transporte','transporte','expense',true),
('Salud','salud','expense',true),('Educación','educacion','expense',true),
('Entretenimiento','entretenimiento','expense',true),('Restaurantes','restaurantes','expense',true),
('Compras','compras','expense',true),('Suscripciones','suscripciones','subscription',true),
('Deudas','deudas','debt',true),('Servicios','servicios','expense',true),
('Transferencias','transferencias','transfer',true),('Otros','otros','expense',true);

-- RLS
alter table accounts enable row level security;
alter table transactions enable row level security;
alter table raw_events enable row level security;
alter table budgets enable row level security;
alter table rules enable row level security;
alter table financial_sources enable row level security;

create policy "users own accounts" on accounts for all using (auth.uid() = user_id);
create policy "users own transactions" on transactions for all using (auth.uid() = user_id);
create policy "users own raw_events" on raw_events for all using (auth.uid() = user_id);
create policy "users own budgets" on budgets for all using (auth.uid() = user_id);
create policy "users own rules" on rules for all using (auth.uid() = user_id);
create policy "users own sources" on financial_sources for all using (auth.uid() = user_id);

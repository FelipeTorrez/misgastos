-- MisGastos — User settings for billing cycle (Phase: filtro ciclo de facturación)
create table public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  billing_cycle_day int not null default 20 check (billing_cycle_day between 1 and 28),
  -- tri-estado:
  --   null  = nunca configurado (mostrar prompt de onboarding)
  --   false = usuario rechazó (no preguntar de nuevo, usar mes calendario)
  --   true  = activo (usar ciclo de facturación como default)
  billing_cycle_enabled boolean,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.user_settings enable row level security;

create policy "users own settings" on public.user_settings
  for all using (auth.uid() = user_id);

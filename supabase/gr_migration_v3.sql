-- Migration V3
alter table public.gr_profiles add column if not exists permissions jsonb;
alter table public.gr_control_entries add column if not exists admin_override boolean not null default false;
alter table public.gr_control_entries add column if not exists override_reason text;

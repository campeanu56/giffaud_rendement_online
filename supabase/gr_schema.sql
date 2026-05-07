-- Schéma Supabase V2 - Application Rendement Giffaud / Les Epesses
-- À exécuter dans Supabase > SQL Editor pour une nouvelle installation.
-- Tables préfixées gr_ pour éviter de mélanger avec l'application AgroForce déjà existante.

create extension if not exists pgcrypto;

-- Nettoyage optionnel pour repartir à zéro : décommente uniquement si besoin.
-- drop view if exists public.gr_weekly_summary_view;
-- drop view if exists public.gr_entries_calculated_view;
-- drop table if exists public.gr_audit_logs cascade;
-- drop table if exists public.gr_weekly_product_quantities cascade;
-- drop table if exists public.gr_control_entries cascade;
-- drop table if exists public.gr_weekly_headers cascade;
-- drop table if exists public.gr_products cascade;
-- drop table if exists public.gr_sites cascade;
-- drop table if exists public.gr_profiles cascade;

create table if not exists public.gr_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  role text not null default 'lecture' check (role in ('admin','responsable_afp','responsable_giffaud','lecture')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create or replace function public.gr_get_my_role()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select role from public.gr_profiles where id = auth.uid() and active = true limit 1;
$$;

create or replace function public.gr_is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(public.gr_get_my_role() = 'admin', false);
$$;

create or replace function public.gr_can_edit_saisie()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(public.gr_get_my_role() in ('admin','responsable_afp','responsable_giffaud'), false);
$$;

create table if not exists public.gr_sites (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  client_name text not null default 'Maison Giffaud',
  prestataire_name text not null default 'AgroForce Prestation',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.gr_products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort_order int not null default 100,
  active boolean not null default true,
  qte_ref numeric not null default 10,
  rendement_ref_g numeric not null,
  coefficient_lundi numeric not null default 1.2,
  tolerance_basse numeric not null default 0.20,
  tolerance_haute numeric not null default 0.20,
  seuil_bonus_2 numeric not null default 0.40,
  seuil_bonus_3 numeric not null default 0.60,
  seuil_malus_1 numeric not null default 0.40,
  seuil_malus_2 numeric not null default 0.60,
  seuil_malus_3 numeric not null default 0.80,
  bonus_1 numeric not null default 0.03,
  bonus_2 numeric not null default 0.06,
  bonus_3 numeric not null default 0.09,
  malus_1 numeric not null default -0.05,
  malus_2 numeric not null default -0.10,
  malus_3 numeric not null default -0.15,
  malus_4 numeric not null default -0.20,
  prix_unitaire_eur numeric not null default 0,
  qte_travaille_source text,
  product_note text,
  synthese_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.gr_weekly_headers (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.gr_sites(id) on delete cascade,
  week_start_date date not null,
  iso_week int not null,
  year int not null,
  client_name text not null default 'Maison Giffaud',
  prestataire_name text not null default 'AgroForce Prestation',
  status text not null default 'brouillon' check (status in ('brouillon','validée')),
  locked boolean not null default false,
  week_note text,
  created_by uuid references auth.users(id),
  validated_by uuid references auth.users(id),
  validated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(site_id, week_start_date)
);

create table if not exists public.gr_control_entries (
  id uuid primary key default gen_random_uuid(),
  weekly_id uuid not null references public.gr_weekly_headers(id) on delete cascade,
  product_id uuid not null references public.gr_products(id),
  day_index int not null,
  work_date date not null,
  qte_ref_snapshot numeric,
  qte_comptee numeric,
  poids_total_g numeric,
  presence_afp boolean not null default false,
  presence_giffaud boolean not null default false,
  commentaire_terrain text,
  note text,
  created_by uuid references auth.users(id) default auth.uid(),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(weekly_id, product_id, day_index)
);

alter table public.gr_control_entries drop constraint if exists gr_control_entries_day_index_check;
alter table public.gr_control_entries add constraint gr_control_entries_day_index_check check (day_index between 1 and 6);

alter table public.gr_products add column if not exists product_note text;
alter table public.gr_products add column if not exists synthese_note text;
alter table public.gr_weekly_headers add column if not exists week_note text;
alter table public.gr_control_entries add column if not exists commentaire_terrain text;

create table if not exists public.gr_weekly_product_quantities (
  id uuid primary key default gen_random_uuid(),
  weekly_id uuid not null references public.gr_weekly_headers(id) on delete cascade,
  product_id uuid not null references public.gr_products(id),
  qte_travaille numeric,
  commentaire_synthese text,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  unique(weekly_id, product_id)
);

alter table public.gr_weekly_product_quantities add column if not exists commentaire_synthese text;

create table if not exists public.gr_audit_logs (
  id bigserial primary key,
  table_name text not null,
  row_id uuid,
  action text not null,
  user_id uuid default auth.uid(),
  payload jsonb,
  created_at timestamptz not null default now()
);

insert into public.gr_sites (name, client_name, prestataire_name)
values ('Les Epesses', 'Maison Giffaud', 'AgroForce Prestation')
on conflict (name) do nothing;

with seed(name, sort_order, qte_ref, rendement_ref_g, coefficient_lundi, tolerance_basse, tolerance_haute, seuil_bonus_2, seuil_bonus_3, seuil_malus_1, seuil_malus_2, seuil_malus_3, bonus_1, bonus_2, bonus_3, malus_1, malus_2, malus_3, malus_4, prix_unitaire_eur, qte_travaille_source, synthese_note) as (
  values
  ('Os d’épaule', 1, 10, 60, 1.2, .20, .20, .40, .60, .40, .60, .80, .03, .06, .09, -.05, -.10, -.15, -.20, .37, 'Épaule A/J', 'Base QTE travaillée : Épaule A/J'),
  ('Os d’échine', 2, 10, 50, 1.2, .20, .20, .40, .60, .40, .60, .80, .03, .06, .09, -.05, -.10, -.15, -.20, .26, 'Échine désossée + N° de Longes A', 'Base QTE travaillée : Échine désossée + N° de Longes A'),
  ('Os de lombaire', 3, 10, 45, 1.2, .20, .20, .40, .60, .40, .60, .80, .03, .06, .09, -.05, -.10, -.15, -.20, .42, 'Carré A + Carré B + Longes A', 'Base QTE travaillée : Carré A + Carré B + Longes A'),
  ('Os de jambon', 4, 10, 60, 1.2, .20, .20, .40, .60, .40, .60, .80, .03, .06, .09, -.05, -.10, -.15, -.20, .41, 'Jambon 1D', 'Base QTE travaillée : Jambon 1D'),
  ('Bardière', 5, 10, 130, 1.2, .20, .20, .40, .60, .40, .60, .80, .03, .06, .09, -.05, -.10, -.15, -.20, .37, 'Lève bardière', 'Base QTE travaillée : Lève bardière'),
  ('Gras de jambon', 6, 10, 170, 1.2, .20, .20, .40, .60, .40, .60, .80, .03, .06, .09, -.05, -.10, -.15, -.20, .34, 'Jambon 2D', 'Base QTE travaillée : Jambon 2D'),
  ('Gras d’épaule', 7, 10, 140, 1.2, .20, .20, .40, .60, .40, .60, .80, .03, .06, .09, -.05, -.10, -.15, -.20, .29, 'Préparation épaule', 'Base QTE travaillée : Préparation épaule')
)
insert into public.gr_products
(name, sort_order, qte_ref, rendement_ref_g, coefficient_lundi, tolerance_basse, tolerance_haute, seuil_bonus_2, seuil_bonus_3, seuil_malus_1, seuil_malus_2, seuil_malus_3, bonus_1, bonus_2, bonus_3, malus_1, malus_2, malus_3, malus_4, prix_unitaire_eur, qte_travaille_source, synthese_note)
select * from seed s
where not exists (select 1 from public.gr_products p where p.name = s.name);

create or replace view public.gr_entries_calculated_view
with (security_invoker = true)
as
select
  e.*,
  p.name as product_name,
  p.qte_ref,
  p.rendement_ref_g,
  case when e.day_index = 1 then p.rendement_ref_g * p.coefficient_lundi else p.rendement_ref_g end as rendement_ref_utilise_g,
  case when e.qte_comptee is not null and e.qte_comptee <> 0 and e.poids_total_g is not null then e.poids_total_g / e.qte_comptee end as rendement_reel_g_piece,
  case when e.qte_comptee is not null and e.qte_comptee <> 0 and e.poids_total_g is not null then (e.poids_total_g / e.qte_comptee) / (case when e.day_index = 1 then p.rendement_ref_g * p.coefficient_lundi else p.rendement_ref_g end) - 1 end as ecart_vs_ref,
  case when e.qte_comptee is null and e.poids_total_g is null and coalesce(e.presence_afp, false) = false and coalesce(e.presence_giffaud, false) = false then null else (e.qte_comptee = p.qte_ref and e.presence_afp and e.presence_giffaud) end as conforme,
  case
    when e.qte_comptee is null and e.poids_total_g is null and coalesce(e.presence_afp, false) = false and coalesce(e.presence_giffaud, false) = false then null
    when e.qte_comptee = p.qte_ref and e.presence_afp and e.presence_giffaud then 'Rendement exploitable'
    else concat_ws(' ; ',
      case when e.qte_comptee is distinct from p.qte_ref then 'quantité de pièces non respectée' end,
      case when not e.presence_afp then 'absence responsable AFP' end,
      case when not e.presence_giffaud then 'absence responsable Giffaud' end
    )
  end as commentaire_conformite
from public.gr_control_entries e
join public.gr_products p on p.id = e.product_id;

create or replace view public.gr_weekly_summary_view
with (security_invoker = true)
as
with c as (
  select * from public.gr_entries_calculated_view
), agg as (
  select
    weekly_id,
    product_id,
    product_name,
    avg(rendement_reel_g_piece) filter (where rendement_reel_g_piece is not null) as moyenne_hebdo_g_piece,
    count(*) filter (where conforme is false) as jours_non_conformes,
    avg(rendement_ref_utilise_g) filter (where conforme is true) as ref_hebdo_utilisee_g,
    count(*) filter (where rendement_reel_g_piece is not null) as nb_lignes_saisies
  from c
  group by weekly_id, product_id, product_name
)
select
  a.*,
  q.qte_travaille,
  q.commentaire_synthese,
  p.prix_unitaire_eur,
  case
    when a.nb_lignes_saisies = 0 or a.jours_non_conformes > 0 or a.ref_hebdo_utilisee_g is null then null
    when a.moyenne_hebdo_g_piece < a.ref_hebdo_utilisee_g * (1 - p.seuil_bonus_3) then p.bonus_3
    when a.moyenne_hebdo_g_piece < a.ref_hebdo_utilisee_g * (1 - p.seuil_bonus_2) then p.bonus_2
    when a.moyenne_hebdo_g_piece < a.ref_hebdo_utilisee_g * (1 - p.tolerance_basse) then p.bonus_1
    when a.moyenne_hebdo_g_piece <= a.ref_hebdo_utilisee_g * (1 + p.tolerance_haute) then 0
    when a.moyenne_hebdo_g_piece <= a.ref_hebdo_utilisee_g * (1 + p.seuil_malus_1) then p.malus_1
    when a.moyenne_hebdo_g_piece <= a.ref_hebdo_utilisee_g * (1 + p.seuil_malus_2) then p.malus_2
    when a.moyenne_hebdo_g_piece <= a.ref_hebdo_utilisee_g * (1 + p.seuil_malus_3) then p.malus_3
    else p.malus_4
  end as taux_bonus_malus_final,
  case when q.qte_travaille is null then null else q.qte_travaille * (
    case
      when a.nb_lignes_saisies = 0 or a.jours_non_conformes > 0 or a.ref_hebdo_utilisee_g is null then null
      when a.moyenne_hebdo_g_piece < a.ref_hebdo_utilisee_g * (1 - p.seuil_bonus_3) then p.bonus_3
      when a.moyenne_hebdo_g_piece < a.ref_hebdo_utilisee_g * (1 - p.seuil_bonus_2) then p.bonus_2
      when a.moyenne_hebdo_g_piece < a.ref_hebdo_utilisee_g * (1 - p.tolerance_basse) then p.bonus_1
      when a.moyenne_hebdo_g_piece <= a.ref_hebdo_utilisee_g * (1 + p.tolerance_haute) then 0
      when a.moyenne_hebdo_g_piece <= a.ref_hebdo_utilisee_g * (1 + p.seuil_malus_1) then p.malus_1
      when a.moyenne_hebdo_g_piece <= a.ref_hebdo_utilisee_g * (1 + p.seuil_malus_2) then p.malus_2
      when a.moyenne_hebdo_g_piece <= a.ref_hebdo_utilisee_g * (1 + p.seuil_malus_3) then p.malus_3
      else p.malus_4
    end)
  end as qte_bonus_malus,
  case when q.qte_travaille is null then null else q.qte_travaille * (
    case
      when a.nb_lignes_saisies = 0 or a.jours_non_conformes > 0 or a.ref_hebdo_utilisee_g is null then null
      when a.moyenne_hebdo_g_piece < a.ref_hebdo_utilisee_g * (1 - p.seuil_bonus_3) then p.bonus_3
      when a.moyenne_hebdo_g_piece < a.ref_hebdo_utilisee_g * (1 - p.seuil_bonus_2) then p.bonus_2
      when a.moyenne_hebdo_g_piece < a.ref_hebdo_utilisee_g * (1 - p.tolerance_basse) then p.bonus_1
      when a.moyenne_hebdo_g_piece <= a.ref_hebdo_utilisee_g * (1 + p.tolerance_haute) then 0
      when a.moyenne_hebdo_g_piece <= a.ref_hebdo_utilisee_g * (1 + p.seuil_malus_1) then p.malus_1
      when a.moyenne_hebdo_g_piece <= a.ref_hebdo_utilisee_g * (1 + p.seuil_malus_2) then p.malus_2
      when a.moyenne_hebdo_g_piece <= a.ref_hebdo_utilisee_g * (1 + p.seuil_malus_3) then p.malus_3
      else p.malus_4
    end) * p.prix_unitaire_eur
  end as montant_eur
from agg a
join public.gr_products p on p.id = a.product_id
left join public.gr_weekly_product_quantities q on q.weekly_id = a.weekly_id and q.product_id = a.product_id;

alter table public.gr_profiles enable row level security;
alter table public.gr_sites enable row level security;
alter table public.gr_products enable row level security;
alter table public.gr_weekly_headers enable row level security;
alter table public.gr_control_entries enable row level security;
alter table public.gr_weekly_product_quantities enable row level security;
alter table public.gr_audit_logs enable row level security;

drop policy if exists gr_profiles_select on public.gr_profiles;
create policy gr_profiles_select on public.gr_profiles for select to authenticated using (id = auth.uid() or public.gr_is_admin());
drop policy if exists gr_profiles_admin_insert on public.gr_profiles;
create policy gr_profiles_admin_insert on public.gr_profiles for insert to authenticated with check (public.gr_is_admin());
drop policy if exists gr_profiles_admin_update on public.gr_profiles;
create policy gr_profiles_admin_update on public.gr_profiles for update to authenticated using (public.gr_is_admin()) with check (public.gr_is_admin());

drop policy if exists gr_sites_select on public.gr_sites;
create policy gr_sites_select on public.gr_sites for select to authenticated using (public.gr_get_my_role() is not null);
drop policy if exists gr_sites_admin_all on public.gr_sites;
create policy gr_sites_admin_all on public.gr_sites for all to authenticated using (public.gr_is_admin()) with check (public.gr_is_admin());

drop policy if exists gr_products_select on public.gr_products;
create policy gr_products_select on public.gr_products for select to authenticated using (public.gr_get_my_role() is not null);
drop policy if exists gr_products_admin_all on public.gr_products;
create policy gr_products_admin_all on public.gr_products for all to authenticated using (public.gr_is_admin()) with check (public.gr_is_admin());

drop policy if exists gr_weekly_select on public.gr_weekly_headers;
create policy gr_weekly_select on public.gr_weekly_headers for select to authenticated using (public.gr_get_my_role() is not null);
drop policy if exists gr_weekly_edit on public.gr_weekly_headers;
create policy gr_weekly_edit on public.gr_weekly_headers for insert to authenticated with check (public.gr_can_edit_saisie());
drop policy if exists gr_weekly_update on public.gr_weekly_headers;
create policy gr_weekly_update on public.gr_weekly_headers for update to authenticated using (public.gr_can_edit_saisie()) with check (public.gr_can_edit_saisie());

drop policy if exists gr_entries_select on public.gr_control_entries;
create policy gr_entries_select on public.gr_control_entries for select to authenticated using (public.gr_get_my_role() is not null);
drop policy if exists gr_entries_edit on public.gr_control_entries;
create policy gr_entries_edit on public.gr_control_entries for insert to authenticated with check (public.gr_can_edit_saisie());
drop policy if exists gr_entries_update on public.gr_control_entries;
create policy gr_entries_update on public.gr_control_entries for update to authenticated using (public.gr_can_edit_saisie()) with check (public.gr_can_edit_saisie());

drop policy if exists gr_quantities_select on public.gr_weekly_product_quantities;
create policy gr_quantities_select on public.gr_weekly_product_quantities for select to authenticated using (public.gr_get_my_role() is not null);
drop policy if exists gr_quantities_edit on public.gr_weekly_product_quantities;
create policy gr_quantities_edit on public.gr_weekly_product_quantities for insert to authenticated with check (public.gr_can_edit_saisie());
drop policy if exists gr_quantities_update on public.gr_weekly_product_quantities;
create policy gr_quantities_update on public.gr_weekly_product_quantities for update to authenticated using (public.gr_can_edit_saisie()) with check (public.gr_can_edit_saisie());

drop policy if exists gr_audit_select on public.gr_audit_logs;
create policy gr_audit_select on public.gr_audit_logs for select to authenticated using (public.gr_is_admin());
drop policy if exists gr_audit_insert on public.gr_audit_logs;
create policy gr_audit_insert on public.gr_audit_logs for insert to authenticated with check (public.gr_get_my_role() is not null);

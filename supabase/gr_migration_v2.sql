-- Migration V2 — Rendement Giffaud
-- À exécuter seulement si tu avais déjà installé la V1 dans Supabase.
-- Si c'est une nouvelle installation, exécute directement gr_schema.sql.

alter table if exists public.gr_control_entries
  drop constraint if exists gr_control_entries_day_index_check;

alter table if exists public.gr_control_entries
  add constraint gr_control_entries_day_index_check check (day_index between 1 and 6);

alter table if exists public.gr_control_entries
  add column if not exists commentaire_terrain text;

alter table if exists public.gr_products
  add column if not exists product_note text;

alter table if exists public.gr_products
  add column if not exists synthese_note text;

alter table if exists public.gr_weekly_product_quantities
  add column if not exists commentaire_synthese text;

alter table if exists public.gr_weekly_headers
  add column if not exists week_note text;

update public.gr_products set qte_travaille_source = 'Épaule A/J', synthese_note = coalesce(synthese_note, 'Base QTE travaillée : Épaule A/J') where name = 'Os d’épaule';
update public.gr_products set qte_travaille_source = 'Échine désossée + N° de Longes A', synthese_note = coalesce(synthese_note, 'Base QTE travaillée : Échine désossée + N° de Longes A') where name = 'Os d’échine';
update public.gr_products set qte_travaille_source = 'Carré A + Carré B + Longes A', synthese_note = coalesce(synthese_note, 'Base QTE travaillée : Carré A + Carré B + Longes A') where name = 'Os de lombaire';
update public.gr_products set qte_travaille_source = 'Jambon 1D', synthese_note = coalesce(synthese_note, 'Base QTE travaillée : Jambon 1D') where name = 'Os de jambon';
update public.gr_products set qte_travaille_source = 'Lève bardière', synthese_note = coalesce(synthese_note, 'Base QTE travaillée : Lève bardière') where name = 'Bardière';
update public.gr_products set qte_travaille_source = 'Jambon 2D', synthese_note = coalesce(synthese_note, 'Base QTE travaillée : Jambon 2D') where name = 'Gras de jambon';
update public.gr_products set qte_travaille_source = 'Préparation épaule', synthese_note = coalesce(synthese_note, 'Base QTE travaillée : Préparation épaule') where name = 'Gras d’épaule';

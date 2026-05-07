# Installation — Nouveau GitHub + nouvelle Supabase + nouveau Vercel

Ce dossier est prévu pour un dépôt GitHub dédié : `giffaud_rendement_online`.

Dans GitHub, les fichiers doivent être directement à la racine du dépôt :

- `index.html`
- `app.js`
- `styles.css`
- `config.js`
- `manifest.json`
- `vercel.json`
- dossier `assets/`
- dossier `supabase/`

Si tu utilises ce dépôt dédié, ne mets pas le dossier complet `giffaud_rendement_online_v2` dans GitHub. Il faut mettre le contenu du dossier.

## Ordre recommandé

1. Créer le nouveau projet Supabase.
2. Exécuter `supabase/gr_schema.sql` dans Supabase > SQL Editor.
3. Créer ton utilisateur admin dans Supabase > Authentication > Users.
4. Mettre ton utilisateur en admin avec la requête SQL indiquée plus bas.
5. Récupérer l'URL Supabase et la clé anon public.
6. Modifier `config.js` dans GitHub avec ces deux valeurs.
7. Importer le dépôt GitHub dans Vercel.
8. Déployer.
9. Tester la connexion.

## Requête pour te mettre admin

Remplace les trois valeurs :

- `UUID_UTILISATEUR_SUPABASE`
- `ton-email@exemple.fr`
- `Marius Campeanu`

```sql
insert into public.gr_profiles (id, email, full_name, role, active)
values ('UUID_UTILISATEUR_SUPABASE', 'ton-email@exemple.fr', 'Marius Campeanu', 'admin', true)
on conflict (id) do update set role = 'admin', active = true;
```

## Réglages Vercel si les fichiers sont à la racine du dépôt

- Framework Preset : Other
- Root Directory : laisser vide / racine du dépôt
- Build Command : vide
- Output Directory : vide
- Install Command : vide

## Réglages Vercel si tu mets les fichiers dans un sous-dossier

- Root Directory : nom exact du sous-dossier, par exemple `giffaud_rendement_online_v2`

Mais pour éviter les erreurs, le plus simple est de mettre les fichiers directement à la racine du dépôt.

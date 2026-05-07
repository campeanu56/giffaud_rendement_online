# Déploiement — Application Rendement Giffaud / Les Epesses V2

## 1. Où mettre le dossier dans GitHub

Ajoute ce dossier comme un dossier séparé de ton application existante :

```text
agroforce_tache_online/
giffaud_rendement_online/
```

Pour cette V2, tu peux renommer le dossier `giffaud_rendement_online_v2` en :

```text
giffaud_rendement_online
```

Dans GitHub, Vercel devra pointer sur ce dossier.

## 2. Supabase

### Cas A — Nouvelle installation

1. Va dans Supabase.
2. Ouvre **SQL Editor**.
3. Copie-colle tout le contenu de :

```text
supabase/gr_schema.sql
```

4. Clique sur **Run**.

### Cas B — Tu avais déjà installé la V1

1. Va dans Supabase.
2. Ouvre **SQL Editor**.
3. Exécute uniquement :

```text
supabase/gr_migration_v2.sql
```

Cette migration ajoute :

- le samedi dans les contrôles ;
- les commentaires terrain ;
- les notes de synthèse par produit ;
- la note globale de semaine ;
- les colonnes produit nécessaires aux commentaires.

## 3. Création de l’admin

1. Supabase > Authentication > Users.
2. Crée ton utilisateur avec email + mot de passe.
3. Copie son UUID.
4. Dans SQL Editor, exécute :

```sql
insert into public.gr_profiles (id, email, full_name, role, active)
values ('UUID_UTILISATEUR_SUPABASE', 'ton-email@exemple.fr', 'Marius Campeanu', 'admin', true)
on conflict (id) do update set role = 'admin', active = true;
```

## 4. Configuration de l’application

Ouvre `config.js` et remplace :

```js
supabaseUrl: "https://REMPLACER-PAR-VOTRE-PROJET.supabase.co",
supabaseAnonKey: "REMPLACER-PAR-VOTRE-ANON-KEY"
```

Les valeurs sont dans Supabase > Project Settings > API.

## 5. Vercel

Crée un **nouveau projet Vercel** pour cette application, sans remplacer ton application existante.

Réglages recommandés :

| Réglage | Valeur |
|---|---|
| Framework Preset | Other |
| Root Directory | `giffaud_rendement_online` |
| Build Command | vide |
| Output Directory | vide |
| Install Command | vide |

Ensuite clique sur **Deploy**.

## 6. Connexion

La connexion se fait par email + mot de passe Supabase.

L’application utilise `signInWithPassword`, donc elle ne dépend pas des emails de magic link et évite le blocage `Email rate limit exceeded`.

## 7. Rôles prévus

| Rôle | Accès |
|---|---|
| admin | accès complet, produits, seuils, verrouillage, utilisateurs |
| responsable_afp | saisie rendement + synthèse |
| responsable_giffaud | saisie rendement + synthèse |
| lecture | lecture seule |

## 8. Contrôle après mise en ligne

1. Connecte-toi avec l’admin.
2. Vérifie que les 7 produits apparaissent.
3. Va dans **Liste produits** et vérifie les prix et seuils.
4. Va dans **Saisie rendement**.
5. Saisis une ligne sur lundi pour vérifier le coefficient 1,20.
6. Saisis une ligne sur samedi pour vérifier que la V2 accepte bien le 6e jour.
7. Ouvre **Récap jour**.
8. Ouvre **Synthèse finale** et renseigne la QTE travaillée.
9. Vérifie le montant en euros.
10. Teste sur téléphone.

# Analyse du fichier Excel — outil_rendement_bonus_malus_hebdo_sem.xlsm

## Structure réelle analysée

Le fichier contient 3 feuilles :

1. `Saisie_Hebdo`
2. `Synthese`
3. `Parametres`

Le fichier contient un projet VBA (`xl/vbaProject.bin`), mais le calcul utile est porté par les formules Excel. Nombre de formules relevées :

| Feuille | Nombre de formules |
|---|---:|
| Saisie_Hebdo | 280 |
| Synthese | 102 |
| Parametres | 0 |
| **Total** | **382** |

## Feuille `Parametres`

Cette feuille sert de catalogue produits + grille de calcul bonus/malus.

| Produit | Qté réf. | Rendement réf. g/pièce | Prix € utilisé en synthèse |
|---|---:|---:|---:|
| Os d’épaule | 10 | 60 | 0,37 € |
| Os d’échine | 10 | 50 | 0,26 € |
| Os de lombaire | 10 | 45 | 0,42 € |
| Os de jambon | 10 | 60 | 0,41 € |
| Bardière | 10 | 130 | 0,37 € |
| Gras de jambon | 10 | 170 | 0,34 € |
| Gras d’épaule | 10 | 140 | 0,29 € |

Seuils repris dans l’application :

| Règle | Valeur Excel |
|---|---:|
| Tolérance basse neutre | 20 % |
| Tolérance haute neutre | 20 % |
| Seuil bonus 2 sous réf. | 40 % |
| Seuil bonus 3 sous réf. | 60 % |
| Seuil malus 1 au-dessus réf. | 40 % |
| Seuil malus 2 au-dessus réf. | 60 % |
| Seuil malus 3 au-dessus réf. | 80 % |
| Bonus 1 | +3 % |
| Bonus 2 | +6 % |
| Bonus 3 | +9 % |
| Malus 1 | -5 % |
| Malus 2 | -10 % |
| Malus 3 | -15 % |
| Malus 4 | -20 % |

Dans l’application V2, tous ces paramètres sont modifiables dans le module **Liste produits**.

## Feuille `Saisie_Hebdo`

La saisie Excel était organisée du lundi au vendredi. La V2 ajoute le samedi.

Colonnes de saisie terrain :

- Qté comptée
- Poids total relevé en grammes
- Présence Responsable AFP
- Présence Responsable Giffaud
- Commentaire terrain ajouté dans l’application V2

Colonnes calculées :

- Rendement réf. g/pièce
- Rendement réel g/pièce
- Écart vs réf.
- Statut conformité
- Commentaire
- Note journalière
- Résultat

Particularité confirmée : le lundi applique un coefficient de 1,20 sur le rendement de référence.

Exemple :

- Os d’échine : référence paramètre 50 g/pièce.
- Lundi : référence utilisée = 50 × 1,20 = 60 g/pièce.
- Mardi à samedi : référence utilisée = 50 g/pièce.

## Logique journalière reprise

### Rendement réel

`rendement réel = poids total relevé / quantité comptée`

### Conformité

Une ligne est conforme uniquement si :

1. quantité comptée = quantité référence ;
2. présence responsable AFP = Oui ;
3. présence responsable Giffaud = Oui.

Si une condition manque, le rendement est non exploitable pour le bonus/malus.

### Note journalière

| Zone | Calcul | Résultat |
|---|---|---:|
| Rendement < réf. × 40 % | très inférieur à la référence | +9 % |
| Rendement < réf. × 60 % | inférieur à la référence | +6 % |
| Rendement < réf. × 80 % | légèrement inférieur | +3 % |
| Rendement ≤ réf. × 120 % | zone neutre | 0 % |
| Rendement ≤ réf. × 140 % | malus 1 | -5 % |
| Rendement ≤ réf. × 160 % | malus 2 | -10 % |
| Rendement ≤ réf. × 180 % | malus 3 | -15 % |
| Rendement > réf. × 180 % | malus 4 | -20 % |

La V2 utilise les valeurs de chaque produit. Si tu modifies les seuils d’un produit, les calculs futurs suivent la nouvelle grille.

## Feuille `Synthese`

La synthèse Excel calcule :

- moyenne hebdomadaire par produit ;
- nombre de jours non conformes ;
- commentaire semaine ;
- bonus/malus final ;
- QTE travaillée ;
- QTE bonus/malus ;
- montant en euros ;
- référence hebdomadaire utilisée.

### Condition de blocage

Si un produit a au moins un jour non conforme, le bonus/malus final du produit est bloqué.

### Référence hebdomadaire utilisée

La formule Excel utilise la moyenne des références journalières des lignes conformes. Le lundi à 1,20 entre donc dans la moyenne si le lundi est conforme.

## Commentaires Excel repris dans l’application

Commentaires de la synthèse, repris en notes produit / base QTE travaillée :

| Cellule Excel | Commentaire |
|---|---|
| M5 | Épaule A/J |
| M6 | Échine désossée + N° de Longes A |
| M7 | Carré A + Carré B + Longes A |
| M8 | Jambon 1D |
| M9 | Lève bardière |
| M10 | Jambon 2D |
| M11 | Préparation épaule |
| O12 | Prise en compte uniquement des semaines conformes |

Commentaires de la feuille `Parametres` : les cellules B4 à B10 indiquent que la quantité de référence est par défaut à 10 et doit être modifiable si la quantité de contrôle change. C’est repris dans le module Liste produits.

## Éléments ajoutés dans la V2

- Samedi ajouté à la saisie, au récap journalier et à la synthèse.
- Module **Récap jour** pour vérifier une journée.
- Module **Calendrier 2026** avec les jours fériés France métropolitaine.
- Notes produit visibles en synthèse.
- Commentaires de synthèse par produit.
- Note globale de synthèse par semaine.
- Liste produits complète avec modification des produits, prix, seuils, bonus et malus.

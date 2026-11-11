# Fichiers de test

| Fichier | Contenu | Ce qu'il teste |
|---|---|---|
| `notes_python.txt` | Texte simple (boucles, fonctions) | Chemin le plus simple, sans OCR |
| `cours_sql_mixte.pdf` | 3 pages : texte natif sur les jointures SQL, puis une capture d'écran en image avec un code secret, puis un schéma en image | PDF qui mélange texte et images |
| `cours_reseau_scanne.pdf` | 1 page qui est uniquement une image (HTTPS port 443) | PDF scanné, bascule en OCR |
| `photosynthese.png` | Image de texte sur la photosynthèse | OCR d'une image seule |

## Questions de contrôle

Dépose les 4 fichiers (`POST /api/documents`), puis pose ces questions à `POST /api/ask` :

| Question | Réponse attendue | Source | Résultat avec le code actuel |
|---|---|---|---|
| Que garde un INNER JOIN ? | Les lignes présentes dans les deux tables | `cours_sql_mixte.pdf` (texte natif, page 1) | doit marcher |
| Quel est le port par défaut de HTTPS ? | 443 | `cours_reseau_scanne.pdf` (OCR) | doit marcher |
| Où se déroule la photosynthèse ? | Dans les chloroplastes | `photosynthese.png` (OCR) | doit marcher |
| Quel est le code secret du laboratoire ? | TANGO-47 | `cours_sql_mixte.pdf`, image page 2 | doit échouer : le texte de l'image n'est pas lu |
| Quelle table est reliée à la table clients ? | La table commandes | `cours_sql_mixte.pdf`, schéma page 3 | doit échouer : le schéma n'est pas lu |

Les deux dernières lignes servent de test de régression : elles passeront quand l'extraction page par page et la lecture des images seront ajoutées.

## Lancer le test automatique

```bash
npm run test:extract
```

Affiche pour chaque fichier la méthode d'extraction utilisée, le nombre de caractères et la présence des marqueurs `TANGO-47`, `Table clients` et `443`. L'OCR télécharge les données de langue au premier lancement : il faut une connexion internet.

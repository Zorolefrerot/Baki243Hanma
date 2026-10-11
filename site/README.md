# Site vitrine ShopFlow RDC

Site de présentation du projet : `index.html` (accueil) et `tutoriel.html` (tutoriel illustré pas à pas).

## Contenu

- Page d'accueil : fonctionnalités, téléchargement (iPhone / Android / Windows), FAQ, contact (WhatsApp +243 84 564 471, shopflowrdc@gmail.com).
- Tutoriel : installation + 8 étapes illustrées par des maquettes de l'application (boutique, articles & photos, stock, commandes, livraisons WhatsApp, tableau de bord, hors connexion, paramètres).

## Technique

- HTML statique autonome : polices (Jakarta, Inter) intégrées en base64, styles et maquettes inclus — aucune dépendance externe, aucun build.
- `embed_fonts.py` réintègre les polices depuis `fonts-tmp/` si vous modifiez les pages (remplace le marqueur `/*FONT_FACES*/`).

## Mise en ligne

Servir le dossier `site/` comme site statique (Render Static Site, Netlify, nginx…) ou simplement ouvrir `index.html` dans un navigateur.

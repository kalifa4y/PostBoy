# Guide de Configuration Turso / LibSQL pour PostBoy

Ce guide explique comment configurer la base de données cloud persistante **Turso** pour PostBoy, utilisable à distance depuis votre PC et votre smartphone, avec un coût de **0€** (Offre Starter gratuite de Turso).

---

## 1. Création de la Base de Données

Vous pouvez créer votre base de données soit via le tableau de bord Web, soit via le CLI Turso.

### Option A : Via l'interface Web (Recommandé - simple et rapide)
1. Rendez-vous sur [turso.tech](https://turso.tech) et connectez-vous (avec votre compte GitHub ou Google).
2. Cliquez sur **Create Database**.
3. Nommez la base : `postboy-db`.
4. Sélectionnez la région la plus proche (ex: `fra` - Frankfurt ou `cdg` - Paris).
5. Validez la création.

### Option B : Via le CLI Turso (Optionnel sur terminal)
Si vous installez le CLI Turso :
```bash
# Authentification
turso auth login

# Création de la base
turso db create postboy-db --location fra
```

---

## 2. Obtenir l'URL de connexion et le Token d'authentification

### Via l'interface Web Turso :
1. Rendez-vous dans la page de détails de votre base `postboy-db`.
2. Copiez la **Database URL** (commence par `libsql://postboy-db-...turso.io`).
3. Cliquez sur **Generate Token** (ou **Create Token**).
4. Copiez le token JWT généré.

### Via le CLI :
```bash
# Obtenir l'URL
turso db show postboy-db --url

# Obtenir un token d'accès
turso db tokens create postboy-db
```

---

## 3. Configurer l'environnement PostBoy (`.env`)

Créez ou modifiez le fichier `.env` à la racine du projet (et/ou dans `server/.env`) avec vos identifiants réels :

```env
# URL de la base Turso (libsql://...)
TURSO_DATABASE_URL=libsql://postboy-db-votre-compte.turso.io

# Token d'authentification Turso (JWT)
TURSO_AUTH_TOKEN=votre_token_jwt_ici
```

> **IMPORTANT : Sécurité des Secrets**
> Ne commitez **JAMAIS** votre token Turso ni votre fichier `.env` sur Git ! Le fichier `.env` est d'ailleurs déjà ignoré par `.gitignore`.

---

## 4. Initialiser le Schéma de la Base Turso

Une fois les variables renseignées dans `.env`, lancez l'initialisation du schéma à distance :

```bash
npm run db:init
```

Le script :
- Se connecte automatiquement à votre instance Turso en utilisant `@libsql/client`.
- Crée toutes les tables nécessaires (`campaigns`, `videos`, `publications`, `notifications`, `settings`).
- Applique les migrations non-destructives (colonnes `hashtags`, `notes`, workflow manuel).

---

## 5. Mode Hybride Local (Fallback)

Si `TURSO_DATABASE_URL` n'est pas renseignée dans votre `.env`, PostBoy bascule automatiquement et de manière transparente sur la base locale SQLite stockée dans `data/postboy.db` (`file:data/postboy.db`).
Vous pouvez donc continuer à développer et exécuter les tests localement sans connexion internet si besoin.

---

## 6. État Actuel & Vérification en Production (Phase 7)

Votre base de données Turso est actuellement **active, initialisée et prête pour la production** :
* **Instance :** `libsql://postboy-db-kalf91y.aws-us-east-1.turso.io`
* **Tables vérifiées :** `settings`, `campaigns`, `videos`, `publications`, `notifications`.
* **Schéma :** Toutes les colonnes de publication manuelle (`caption`, `hashtags`, `notes`, `scheduled_at`, `published_at`, `post_url`, etc.) sont présentes.

Pour tester la connectivité à tout moment sans modifier de données :
```bash
npm --prefix server run db:init
```


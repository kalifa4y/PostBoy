# POSTBOY — GUIDE DE DÉPLOIEMENT EN PRODUCTION SUR VERCEL

Ce guide détaille la mise en ligne de **PostBoy** sur Vercel à l'adresse **`https://postboy.vercel.app`**.

---

## 1. ARCHITECTURE EN PRODUCTION

* **Frontend :** Application Vite React compilée dans `client/dist`, servie comme une Single Page Application (SPA) ultra-rapide avec routage HTML5.
* **Backend API :** Fastify exécuté en mode **Serverless Function** (`api/index.ts`) gérant tous les endpoints `/api/*`.
* **Base de données :** Instance cloud persistante **Turso** (`libsql://...`), connectée directement via `@libsql/client` sans aucun état local requis.
* **Vercel Cron :** 3 tâches automatiques pour la discipline quotidienne (06:00, toutes les 30 min, 22:00 UTC / Bamako).
* **Vidéos :** 100% conservées sur votre ordinateur personnel. Aucun stockage vidéo cloud n'est utilisé.

---

## 2. VARIABLES D'ENVIRONNEMENT À DÉFINIR SUR VERCEL

Dans les paramètres de votre projet Vercel (**Settings** → **Environment Variables**) ou via le CLI, ajoutez les variables suivantes :

| Variable | Exemple / Valeur | Description |
| :--- | :--- | :--- |
| `TURSO_DATABASE_URL` | `libsql://postboy-db-kalf91y.aws-us-east-1.turso.io` | URL de votre base de données Turso Cloud |
| `TURSO_AUTH_TOKEN` | `eyJhbGciOi...` | Jeton d'accès JWT généré par Turso |
| `CLIENT_URL` | `https://postboy.vercel.app` | URL de production pour les autorisations CORS |
| `DEFAULT_TIMEZONE` | `Africa/Bamako` | Fuseau horaire de référence (UTC+0) |
| `CRON_SECRET` | `votre_cle_secrete_aleatoire` | Clé secrète protégeant les routes `/api/cron/*` |
| `SMTP_HOST` | `smtp.gmail.com` | Serveur SMTP pour les rappels de discipline |
| `SMTP_PORT` | `587` | Port SMTP (587 avec TLS) |
| `SMTP_SECURE` | `false` | `false` pour port 587 (STARTTLS) |
| `SMTP_USER` | `votre-adresse@gmail.com` | Identifiant de connexion SMTP |
| `SMTP_PASSWORD` | `votre-mot-de-passe-d-application` | Mot de passe d'application SMTP |
| `SMTP_FROM` | `PostBoy <notifications@votre-domaine.com>` | Expéditeur affiché dans les emails |
| `NOTIFICATION_EMAIL` | `votre-email@gmail.com` | Votre adresse email personnelle de réception |

> **Rappel de sécurité :** Ces variables sont chiffrées par Vercel et ne doivent **jamais** être commitées dans le dépôt Git.

---

## 3. DÉPLOIEMENT

### Option A : Déploiement via le Dashboard Web Vercel (Recommandé)

1. Rendez-vous sur [vercel.com](https://vercel.com) et connectez-vous avec votre compte GitHub (`kalifa4y`).
2. Cliquez sur **Add New...** → **Project**.
3. Importez votre dépôt Git : `kalifa4y/PostBoy`.
4. Configurez le projet :
   * **Project Name :** `postboy` (pour obtenir `https://postboy.vercel.app`).
   * **Framework Preset :** `Other` (le fichier `vercel.json` à la racine configure automatiquement le build et les sorties).
   * **Root Directory :** `./` (laisser par défaut).
5. Dépliez la section **Environment Variables** et saisissez les variables listées ci-dessus.
6. Cliquez sur **Deploy**.

---

### Option B : Déploiement via le CLI Vercel

Si vous préférez déployer directement depuis votre terminal local :

```bash
# 1. Lier le projet local au projet Vercel
vercel link

# 2. Configurer les variables d'environnement
vercel env add TURSO_DATABASE_URL production
vercel env add TURSO_AUTH_TOKEN production
vercel env add CLIENT_URL production
vercel env add CRON_SECRET production
vercel env add DEFAULT_TIMEZONE production

# 3. Lancer le déploiement en production
vercel --prod
```

---

## 4. VÉRIFICATION POST-DÉPLOIEMENT

Le projet est déjà déployé et vérifié en production sur : **`https://postboy-inky.vercel.app`** (alias principal attribué par Vercel) ainsi que sur `https://postboy-kalifas-projects.vercel.app`.

1. **Vérification de l'API Santé :**
   Accédez à : `https://postboy-inky.vercel.app/api/health`
   * Résultat en production : `{"status":"ok","service":"PostBoy API","version":"0.1.0","database":"connected","activeTimezone":"Africa/Bamako","tablesCount":5,"tables":["settings","campaigns","videos","publications","notifications"]}`
2. **Vérification de la base Turso :**
   Accédez à : `https://postboy-inky.vercel.app/api/campaigns`
   * Résultat : `{"status":"success","campaigns":[]}` (connecté à Turso AWS US-East-1).
3. **Vérification du Frontend :**
   Accédez à : `https://postboy-inky.vercel.app/`
   * Résultat : Chargement instantané du Dashboard PostBoy depuis PC ou smartphone, avec navigation fluide (Dashboard, Publications, Calendrier, Vidéothèque, Campagnes, Paramètres).
4. **Vérification de la protection Cron :**
   * `curl https://postboy-inky.vercel.app/api/cron/morning` → `401 Unauthorized` (`Invalid or missing cron authorization key`).
   * `curl https://postboy-inky.vercel.app/api/cron/morning?key=VOTRE_CRON_SECRET` → `200 OK` (`job: "morning"`).
5. **Vérification des tâches Cron sur Vercel :**
   Dans le tableau de bord Vercel du projet PostBoy (**Settings** → **Cron Jobs**), les 3 tâches quotidiennes sont actives :
   * `/api/cron/morning` (`0 6 * * *` — 06:00 UTC)
   * `/api/cron/check-reminders` (`0 14 * * *` — 14:00 UTC)
   * `/api/cron/evening` (`0 22 * * *` — 22:00 UTC)

> **Note sur le plan Vercel Hobby :** Vercel restreint les crons automatiques à des fréquences quotidiennes au minimum (1 fois par jour max). Si un rappel toutes les 30 minutes est nécessaire, un ping externe gratuit (ex: cron-job.org ou GitHub Actions) peut appeler `https://postboy-inky.vercel.app/api/cron/check-reminders?key=CRON_SECRET`.

---

## 5. DÉVELOPPEMENT LOCAL (SUR VOTRE PC)

Pour continuer à travailler localement avec vos vidéos sur votre PC :

```bash
npm run dev
```

L'interface locale reste accessible sur `http://localhost:5173` et communique avec le serveur local sur le port `3001`. Les deux environnements (local et production) partagent la même base de données Turso Cloud !

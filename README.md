# PostBoy 🚀

> **Cockpit de planification et de discipline quotidienne pour créateurs de contenu & clippers.**  
> *5 publications par jour • 5 campagnes distinctes • Zéro friction.*

---

## 📌 Présentation

**PostBoy** est un outil de productivité et de planification conçu sur mesure pour les créateurs de contenu vidéo court (*TikTok, Instagram Reels, YouTube Shorts*).

Son rôle est clair et précis :
- **Organiser** vos campagnes de clipping et thématiques.
- **Déclarer et planifier** vos créneaux de publication en quelques secondes grâce à un wizard étape par étape (*« une décision à la fois »*).
- **Suivre votre discipline quotidienne** : l'objectif de **5 publications par jour issues de 5 campagnes différentes**.
- **Copier en 1 clic** vos légendes et hashtags pour publier manuellement sur vos réseaux sans perdre de temps.
- **Recevoir des rappels par email** (rappel avant créneau, briefing matinal à 06:00, bilan du soir à 22:00).

### 🎯 Ce que PostBoy ne fait PAS (et pourquoi)
- **Pas d'upload cloud de vos vidéos** : vos fichiers vidéo restent à 100% sur votre machine locale.
- **Pas de publication automatique (bot) ni d'OAuth complexe** : évite les suspensions de comptes TikTok/Instagram et préserve le reach algorithmique naturel en favorisant la publication manuelle guidée.
- **Pas d'intelligence artificielle superflue** : une interface rapide, prédictible et sans distraction.

---

## ✨ Fonctionnalités Clés

1. **Wizards Modernes Guidés**
   - **Nouvelle publication en 4 étapes simples** :
     1. Sélection visuelle de la campagne.
     2. Choix de la plateforme (*TikTok, Instagram, YouTube*).
     3. Sélection du créneau (*Aujourd'hui, Demain ou Date personnalisée + raccourcis d'heures optimales*).
     4. Aperçu et validation instantanée.
   - **Création de campagne guidée** : nom, palette de couleurs personnalisée et hashtags par défaut.

2. **Tableau de Bord & Discipline 5/5**
   - Jauge de progression quotidienne en temps réel (*X / 5 publications*).
   - Indicateur de diversité (*X / 5 campagnes distinctes*).
   - Tâches prioritaires à publier immédiatement avec bouton de copie rapide.

3. **Calendrier & Planning**
   - Vue chronologique interactive de vos publications planifiées.
   - Filtres par plateforme, campagne et état (*Brouillon, Planifiée, Publiée, En retard*).

4. **Alertes & Rappels par Email (SMTP)**
   - Briefing du matin à 06:00 avec la liste des publications du jour.
   - Alertes préventives avant l'heure programmée.
   - Alertes de retard si une publication n'a pas été marquée comme postée.
   - Bilan du soir à 22:00 avec le taux d'atteinte de l'objectif quotidien.

5. **Design & Ergonomie Oshun Web Studio**
   - Thème sombre épuré avec l'accent vert emblématique `#08EB08`.
   - Typographies soignées (*Google Sans Flex* & *Cal Sans*).
   - Zéro emoji, icônes vectorielles SVG cohérentes (*Lucide React*).
   - Totalement responsive (*Mobile 375px, Tablette 768px, Desktop 1280px+*).

---

## 🛠️ Stack Technique

- **Frontend** : React 18, TypeScript, Vite, Tailwind CSS, Lucide React.
- **Backend** : Node.js, Fastify, TypeScript.
- **Base de données** : LibSQL / SQLite (compatible Turso Cloud pour l'accès multi-appareils et SQLite local en développement).
- **Notifications** : Nodemailer (intégration SMTP avec chiffrement TLS).
- **Tests** : Vitest (98 tests automatisés couvrant les routes d'API, le calendrier, les campagnes et les notifications).
- **Déploiement** : Vercel (Frontend SPA + Serverless Functions + Vercel Cron).

---

## 🚀 Démarrage Rapide (Développement Local)

### 1. Prérequis
- [Node.js](https://nodejs.org/) (version 18 ou supérieure recommandée)
- npm (version 9 ou supérieure)

### 2. Installation
Clonez le dépôt et installez l'ensemble des dépendances :

```bash
git clone https://github.com/kalifa4y/PostBoy.git
cd PostBoy
npm install
```

### 3. Configuration des variables d'environnement
Copiez le fichier d'exemple et configurez vos paramètres :

```bash
cp .env.example .env
```

Variables principales dans `.env` :
```env
PORT=3001
HOST=127.0.0.1
DEFAULT_TIMEZONE=Africa/Bamako
DATABASE_PATH=./data/postboy.db

# Optionnel : Turso Cloud DB (si utilisé à la place de SQLite local)
# TURSO_DATABASE_URL=libsql://...
# TURSO_AUTH_TOKEN=...

# Optionnel : Notifications SMTP
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=votre-email@gmail.com
SMTP_PASSWORD=votre-mot-de-passe-application
SMTP_FROM=PostBoy <notifications@votre-domaine.com>
NOTIFICATION_EMAIL=votre-email-personnel@gmail.com
```

### 4. Initialisation de la base de données
Créez les tables et initialisez les paramètres de configuration :

```bash
npm run db:init
```

### 5. Lancer l'environnement de développement
Lancez simultanément le serveur d'API Fastify et le client Vite :

```bash
npm run dev
```

L'application est accessible sur :
- **Frontend** : [http://localhost:5173](http://localhost:5173)
- **API Backend** : [http://localhost:3001](http://localhost:3001)
- **Vérification de santé** : [http://localhost:3001/api/health](http://localhost:3001/api/health)

---

## 🧪 Tests Automatisés

Pour exécuter la suite de tests complète (98 tests d'intégration et unitaires) :

```bash
npm test
```

Pour compiler le frontend en production :

```bash
npm --prefix client run build
```

---

## 🌐 Déploiement en Production (Vercel + Turso)

L'application est optimisée pour être hébergée sur **Vercel** avec une base de données cloud **Turso (LibSQL)**.

Guides détaillés disponibles dans le dossier `docs/` :
- [Déploiement sur Vercel (`docs/VERCEL_DEPLOY.md`)](docs/VERCEL_DEPLOY.md)
- [Configuration de la base de données Turso (`docs/TURSO_SETUP.md`)](docs/TURSO_SETUP.md)
- [Automatisation des Cron & Emails (`docs/CRON_AND_EMAILS.md`)](docs/CRON_AND_EMAILS.md)

---

## 📁 Structure du Projet

```text
PostBoy/
├── api/                   # Handlers serverless pour Vercel (/api/*)
├── client/                # Application Frontend React + Vite
│   ├── src/
│   │   ├── components/    # Composants d'interface (wizards, layout, visual cards)
│   │   ├── views/         # Vues principales (Dashboard, Campagnes, Publications, Calendrier, Paramètres)
│   │   ├── types/         # Types TypeScript du domaine métier
│   │   └── ...
│   └── package.json
├── server/                # Backend Fastify pour le développement local
│   ├── src/
│   │   ├── db/            # Adaptateur LibSQL/SQLite et schémas
│   │   ├── routes/        # Endpoints REST (campaigns, publications, calendar, settings, cron)
│   │   ├── services/      # Services métier (emailService, scheduler)
│   │   └── ...
│   ├── tests/             # 98 tests automatisés Vitest
│   └── package.json
├── docs/                  # Guides de configuration et de déploiement
├── .env.example           # Gabarit de configuration d'environnement
├── vercel.json            # Configuration du routage et des crons Vercel
└── README.md              # Documentation principale du projet
```

---

## 🛡️ Licence & Confidentialité

Projet propriétaire développé par **Oshun Web Studio** pour **Kalf**.  
Toutes les données de clipping et vidéos restent la propriété stricte de l'utilisateur.

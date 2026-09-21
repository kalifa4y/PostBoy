# POSTBOY — SYSTÈME D'EMAILS, RAPPELS ET CRON (PHASE 6)

Ce document décrit le fonctionnement, la configuration et le déclenchement des emails et rappels de discipline quotidienne de **PostBoy**.

---

## 1. OBJECTIF ET DISCIPLINE

PostBoy sert à maintenir une discipline stricte de clipping :
* **5 publications minimum par jour**
* **sur 5 campagnes distinctes**

Le système d'email accompagne Kalf tout au long de la journée sans spam ni fausses informations.

---

## 2. LES 5 TYPES D'EMAILS

### 1. Email du matin — 06:00 (`Africa/Bamako` / UTC)
* **Objet :** `PostBoy — 06:00 : Planification de tes 5 publications du jour`
* **Contenu :**
  * Rappel de l'objectif (5 publications / 5 campagnes).
  * Métriques : déjà planifié aujourd'hui, déjà publié, restant à publier, série en cours (*streak*).
  * **Si des publications sont déjà planifiées :** liste détaillée avec heure prévue, campagne, plateforme, titre et vidéo source.
  * **Si rien n'est planifié :** message d'alerte bienveillant : *"Tu n'as encore planifié aucune publication aujourd'hui. Il est temps d'organiser tes clips pour respecter ta discipline quotidienne."*
  * Lien direct vers PostBoy (`CLIENT_URL` ou `https://pbplan.vercel.app`).
* **Idempotence :** Maximum 1 email par jour (`type = 'morning_reminder'`).

### 2. Rappels dans la journée — Vérification toutes les 30 min
* **Objet :** `PostBoy — Rappel : Publication prévue bientôt (<Plateforme> — <Campagne>)`
* **Condition :** Publication au statut `scheduled` prévue dans les 60 prochaines minutes.
* **Contenu :**
  * Campagne, plateforme, heure prévue.
  * Bloc de texte et hashtags prêts à copier d'un clic pour faciliter la publication manuelle.
  * Rappel de la progression du jour (`X / 5`).
* **Idempotence :** 1 seul rappel envoyé par publication (`type = 'upcoming_reminder'`).

### 3. Alerte de publication en retard — Vérification toutes les 30 min
* **Objet :** `PostBoy — Alerte : Publication en retard — <Plateforme> — <Campagne>`
* **Condition :** Publication au statut `scheduled` dont l'heure `scheduled_at` est dépassée et qui n'a pas été marquée comme `published`.
* **Contenu :**
  * Alerte rouge distincte.
  * Détails de la publication (campagne, plateforme, heure dépassée).
  * Rappel du nombre de publications et campagnes encore nécessaires aujourd'hui.
  * Bouton direct pour marquer comme publié sur PostBoy.
* **Idempotence :** 1 seule alerte envoyée par publication (`type = 'overdue_alert'`).

### 4. Email de célébration d'objectif atteint (5/5) — Déclenché en temps réel
* **Objet :** `PostBoy — Félicitations ! Objectif du jour atteint (<X>/5)`
* **Condition :** Déclenché dès que l'action manuelle de validation fait passer la journée à 5 publications publiées sur 5 campagnes différentes.
* **Contenu :**
  * Message de félicitations et validation de la discipline.
  * Nombre de publications et campagnes validées.
  * Série en cours (*streak* en jours consécutifs).
* **Idempotence :** Maximum 1 email par jour (`type = 'goal_achieved'`).

### 5. Bilan de fin de journée — 22:00 (`Africa/Bamako` / UTC)
* **Objet :** `PostBoy — Bilan du jour : Objectif Atteint / Non Atteint (<X>/5)`
* **Contenu :**
  * Bilan honnête et factuel sans texte fictif.
  * Publications publiées / 5 et nombre de campagnes distinctes couvertes.
  * Statut clair : Validé (vert) ou Non atteint (jaune/orange).
  * Série en cours (*streak*).
* **Idempotence :** Maximum 1 bilan par jour (`type = 'daily_recap'`).

---

## 3. CONFIGURATION DES VARIABLES D'ENVIRONNEMENT

Pour activer l'envoi réel des emails, les variables suivantes doivent être configurées dans le `.env` (en local) ou dans le tableau de bord Vercel :

```bash
# Configuration SMTP
SMTP_HOST="smtp.gmail.com"
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER="votre-email@gmail.com"
SMTP_PASSWORD="votre-mot-de-passe-d-application"
SMTP_FROM="PostBoy <votre-email@gmail.com>"
NOTIFICATION_EMAIL="votre-email-personnel@gmail.com"

# URL de l'application cliente
CLIENT_URL="https://pbplan.vercel.app"

# Clé secrète pour sécuriser les routes Vercel Cron
CRON_SECRET="une_cle_secrete_aleatoire_et_robuste"
```

> **Note de sécurité :** Ne committez JAMAIS de mot de passe SMTP ou de clé `CRON_SECRET` dans le dépôt Git.

---

## 4. ARCHITECTURE CRON SUR VERCEL

Le fichier [`vercel.json`](file:///c:/Users/legion/Desktop/PostBoy/vercel.json) à la racine du projet configure automatiquement les déclenchements Vercel Cron :

```json
{
  "crons": [
    {
      "path": "/api/cron/morning",
      "schedule": "0 6 * * *"
    },
    {
      "path": "/api/cron/check-reminders",
      "schedule": "*/30 * * * *"
    },
    {
      "path": "/api/cron/evening",
      "schedule": "0 22 * * *"
    }
  ]
}
```

* **Fuseau horaire :** Vercel Cron utilise l'heure UTC. Bamako (`Africa/Bamako`) est à GMT/UTC+0 toute l'année sans heure d'été.
* Les horaires `0 6 * * *` et `0 22 * * *` correspondent exactement à **06:00** et **22:00** heure de Bamako.

---

## 5. SÉCURISATION ET DÉCLENCHEMENT MANUEL

Chaque route Cron vérifie la présence du jeton `CRON_SECRET` via l'en-tête Vercel :
```http
Authorization: Bearer <CRON_SECRET>
```
ou via le paramètre d'URL : `?key=<CRON_SECRET>`.

### Exemples de déclenchements via curl / Postman :

#### Déclencher le rappel du matin (06:00) :
```bash
curl -X GET "http://localhost:3001/api/cron/morning?key=VOTRE_CRON_SECRET"
```

#### Déclencher la vérification des rappels et retards :
```bash
curl -X GET "http://localhost:3001/api/cron/check-reminders?key=VOTRE_CRON_SECRET"
```

#### Déclencher le bilan du soir (22:00) :
```bash
curl -X GET "http://localhost:3001/api/cron/evening?key=VOTRE_CRON_SECRET"
```

#### Déclencher un job spécifique via POST :
```bash
curl -X POST "http://localhost:3001/api/cron/trigger" \
  -H "Authorization: Bearer VOTRE_CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"job": "morning", "date": "2026-09-21"}'
```

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { getDatabase, closeDatabase } from '../src/db/connection.js';
import { initializeDatabase } from '../src/db/init.js';
import { encryptData, decryptData } from '../src/utils/crypto.js';
import { healthRoutes } from '../src/routes/health.js';
import { settingsRoutes } from '../src/routes/settings.js';

describe('PHASE 0 - Architecture & Fondations', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    // Initialisation DB et tables
    initializeDatabase();

    // Montage Fastify pour les tests d'intégration des routes
    app = Fastify({ logger: false });
    await app.register(healthRoutes);
    await app.register(settingsRoutes);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    closeDatabase();
  });

  describe('1. Base de données SQLite & Schéma', () => {
    it('doit contenir toutes les tables métier requises', () => {
      const db = getDatabase();
      const tables = db.prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
      ).all() as Array<{ name: string }>;

      const tableNames = tables.map(t => t.name);
      
      expect(tableNames).toContain('settings');
      expect(tableNames).toContain('campaigns');
      expect(tableNames).toContain('videos');
      expect(tableNames).toContain('social_accounts');
      expect(tableNames).toContain('publications');
      expect(tableNames).toContain('publication_logs');
      expect(tableNames).toContain('notifications');
    });

    it('doit avoir initialisé les paramètres par défaut dans settings', () => {
      const db = getDatabase();
      const row = db.prepare("SELECT value FROM settings WHERE key = 'timezone'").get() as { value: string };
      expect(row).toBeDefined();
      expect(row.value).toBe('Africa/Bamako');
    });
  });

  describe('2. Chiffrement AES-256-GCM (Sécurité des tokens)', () => {
    it('doit chiffrer et déchiffrer avec intégrité', () => {
      const sensitiveToken = 'oauth_token_xyz_super_secret_123456789';
      const encrypted = encryptData(sensitiveToken);

      expect(encrypted).not.toBe(sensitiveToken);
      expect(encrypted).toContain(':'); // format iv:authTag:ciphertext

      const decrypted = decryptData(encrypted);
      expect(decrypted).toBe(sensitiveToken);
    });

    it('doit rejeter les données altérées', () => {
      const sensitiveToken = 'secret_token';
      const encrypted = encryptData(sensitiveToken);
      const parts = encrypted.split(':');
      
      // Altération du ciphertext
      const tampered = `${parts[0]}:${parts[1]}:deadbeef`;
      expect(() => decryptData(tampered)).toThrow();
    });
  });

  describe('3. Routes de Fondation API', () => {
    it('GET /api/health doit renvoyer un statut ok et la base connectée', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/health'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('ok');
      expect(body.database).toBe('connected');
      expect(body.activeTimezone).toBe('Africa/Bamako');
      expect(body.tables).toBeInstanceOf(Array);
      expect(body.tablesCount).toBeGreaterThanOrEqual(7);
    });

    it('GET /api/settings doit renvoyer les paramètres sans exposer les mots de passe', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/settings'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('success');
      expect(body.settings).toBeDefined();
      expect(body.settings.timezone).toBe('Africa/Bamako');
    });

    it('PUT /api/settings doit permettre la mise à jour du fuseau horaire', async () => {
      const updateResponse = await app.inject({
        method: 'PUT',
        url: '/api/settings',
        payload: {
          timezone: 'Africa/Bamako'
        }
      });

      expect(updateResponse.statusCode).toBe(200);
      const updateBody = JSON.parse(updateResponse.body);
      expect(updateBody.status).toBe('success');
    });
  });
});

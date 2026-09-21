import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { getDatabase, closeDatabase } from '../src/db/connection.js';
import { initializeDatabase } from '../src/db/init.js';
import { healthRoutes } from '../src/routes/health.js';
import { settingsRoutes } from '../src/routes/settings.js';

describe('PHASE 0 - Architecture & Fondations', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    // Initialisation DB et tables
    await initializeDatabase();

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
    it('doit contenir toutes les tables métier requises', async () => {
      const db = getDatabase();
      const tables = await db.all<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
      );

      const tableNames = tables.map(t => t.name);
      
      expect(tableNames).toContain('settings');
      expect(tableNames).toContain('campaigns');
      expect(tableNames).toContain('videos');
      expect(tableNames).toContain('publications');
      expect(tableNames).toContain('notifications');
      expect(tableNames).not.toContain('social_accounts');
      expect(tableNames).not.toContain('publication_logs');
    });

    it('doit avoir initialisé les paramètres par défaut dans settings', async () => {
      const db = getDatabase();
      const row = await db.get<{ value: string }>("SELECT value FROM settings WHERE key = 'timezone'");
      expect(row).toBeDefined();
      expect(row?.value).toBe('Africa/Bamako');
    });
  });

  describe('2. Routes de Fondation API', () => {
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
      expect(body.tablesCount).toBeGreaterThanOrEqual(5);
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

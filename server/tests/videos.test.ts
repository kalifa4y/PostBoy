import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import fs from 'node:fs';
import path from 'node:path';
import { getDatabase, closeDatabase } from '../src/db/connection.js';
import { initializeDatabase } from '../src/db/init.js';
import { videoRoutes } from '../src/routes/videos.js';

describe('PHASE 3 - Bibliothèque de Vidéos & Import Multiple', () => {
  let app: FastifyInstance;
  const projectRoot = path.basename(process.cwd()) === 'server'
    ? path.resolve(process.cwd(), '..')
    : process.cwd();
  const uploadsDir = path.resolve(projectRoot, 'uploads');

  beforeAll(async () => {
    await initializeDatabase();
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    app = Fastify({ logger: false });
    await app.register(multipart, {
      limits: {
        fileSize: 1024 * 1024 * 1024,
        files: 100
      }
    });
    await app.register(fastifyStatic, {
      root: uploadsDir,
      prefix: '/uploads/'
    });
    await app.register(videoRoutes);
    await app.ready();

    // Nettoyage préalable des vidéos de test
    const db = getDatabase();
    await db.run("DELETE FROM videos WHERE original_name LIKE 'test_clip_%'");
  });

  afterAll(async () => {
    const db = getDatabase();
    await db.run("DELETE FROM videos WHERE original_name LIKE 'test_clip_%'");
    await app.close();
    closeDatabase();
  });

  let uploadedVideoId = '';
  let uploadedVideoFilename = '';
  let testCampaignId = 'camp_test_p3';

  // 1. Liste vide
  it('1. GET /api/videos doit renvoyer une liste de vidéos', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/videos'
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('success');
    expect(Array.isArray(body.videos)).toBe(true);
  });

  // 2. Import d'une vidéo avec métadonnées
  it('2. POST /api/videos/upload doit importer une vidéo unitaire et enregistrer les métadonnées', async () => {
    // Création d'une campagne de test pour l'association
    const db = getDatabase();
    await db.run(`
      INSERT OR REPLACE INTO campaigns (id, name, color)
      VALUES (?, 'P3_CAMPAIGN', '#08EB08')
    `, [testCampaignId]);

    const boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW';
    const fakeVideoContent = Buffer.from('FAKEMP4VIDEOCONTENT_TEST_1234567890');
    
    const payload = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="test_clip_01.mp4"\r\nContent-Type: video/mp4\r\n\r\n`),
      fakeVideoContent,
      Buffer.from(`\r\n--${boundary}--\r\n`)
    ]);

    const res = await app.inject({
      method: 'POST',
      url: `/api/videos/upload?campaign_id=${testCampaignId}`,
      headers: {
        'content-type': `multipart/form-data; boundary=${boundary}`
      },
      payload
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('success');
    expect(body.uploadedCount).toBe(1);
    expect(body.failedCount).toBe(0);
    expect(body.uploaded[0].original_name).toBe('test_clip_01.mp4');
    expect(body.uploaded[0].campaign_id).toBe(testCampaignId);
    expect(body.uploaded[0].status).toBe('ready');
    expect(body.uploaded[0].file_size).toBe(fakeVideoContent.length);

    uploadedVideoId = body.uploaded[0].id;
    uploadedVideoFilename = body.uploaded[0].filename;

    // Vérifier que le fichier physique existe réellement dans uploads/
    const physicalPath = path.join(uploadsDir, uploadedVideoFilename);
    expect(fs.existsSync(physicalPath)).toBe(true);
  });

  // 3. Récupération d'une vidéo par ID
  it('3. GET /api/videos/:id doit récupérer la vidéo et les infos de campagne', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/videos/${uploadedVideoId}`
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('success');
    expect(body.video.id).toBe(uploadedVideoId);
    expect(body.video.campaign_name).toBe('P3_CAMPAIGN');
  });

  // 4. Import multiple (lot de 3 vidéos) avec résilience
  it('4. POST /api/videos/upload doit gérer limport de plusieurs vidéos simultanées', async () => {
    const boundary = '----WebKitFormBoundaryMultiTest';
    const clipA = Buffer.from('CLIP_A_DATA');
    const clipB = Buffer.from('CLIP_B_DATA');

    const payload = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="test_clip_multi_A.mp4"\r\nContent-Type: video/mp4\r\n\r\n`),
      clipA,
      Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="test_clip_multi_B.webm"\r\nContent-Type: video/webm\r\n\r\n`),
      clipB,
      Buffer.from(`\r\n--${boundary}--\r\n`)
    ]);

    const res = await app.inject({
      method: 'POST',
      url: '/api/videos/upload',
      headers: {
        'content-type': `multipart/form-data; boundary=${boundary}`
      },
      payload
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.uploadedCount).toBe(2);
    expect(body.failedCount).toBe(0);

    // Nettoyage immédiat des fichiers physiques créés pour le test multi
    for (const v of body.uploaded) {
      const p = path.join(uploadsDir, v.filename);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
  });

  // 5. Rejet d'un fichier invalide (extension interdite ex: .exe ou .txt)
  it('5. POST /api/videos/upload doit rejeter les fichiers non vidéo', async () => {
    const boundary = '----WebKitFormBoundaryInvalid';
    const fakeScript = Buffer.from('console.log("malicious");');

    const payload = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="test_clip_invalid.exe"\r\nContent-Type: application/x-msdownload\r\n\r\n`),
      fakeScript,
      Buffer.from(`\r\n--${boundary}--\r\n`)
    ]);

    const res = await app.inject({
      method: 'POST',
      url: '/api/videos/upload',
      headers: {
        'content-type': `multipart/form-data; boundary=${boundary}`
      },
      payload
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.uploadedCount).toBe(0);
    expect(body.failedCount).toBe(1);
    expect(body.failed[0].reason).toContain('Format non supporté');
  });

  // 6. Recherche et filtrage par campagne
  it('6. GET /api/videos?campaign_id=... doit filtrer les vidéos correctement', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/videos?campaign_id=${testCampaignId}`
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.videos.some((v: any) => v.id === uploadedVideoId)).toBe(true);

    // Recherche par mot clé
    const resSearch = await app.inject({
      method: 'GET',
      url: '/api/videos?search=test_clip_01'
    });
    expect(resSearch.statusCode).toBe(200);
    expect(JSON.parse(resSearch.body).videos.length).toBeGreaterThanOrEqual(1);
  });

  // 7. Modification de la campagne associée
  it('7. PUT /api/videos/:id doit permettre de dissocier ou modifier la campagne', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/api/videos/${uploadedVideoId}`,
      payload: {
        campaign_id: 'unassigned',
        notes: 'Vidéo mise en réserve'
      }
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.video.campaign_id).toBeNull();
    expect(body.video.notes).toBe('Vidéo mise en réserve');
  });

  // 8. Protection de suppression si liée à une publication
  it('8. DELETE /api/videos/:id doit refuser la suppression si une publication y est liée', async () => {
    const db = getDatabase();
    await db.run(`
      INSERT INTO publications (id, video_id, platform, title, status)
      VALUES ('pub_linked_p3', ?, 'tiktok', 'Clip lié', 'scheduled')
    `, [uploadedVideoId]);

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/videos/${uploadedVideoId}`
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).message).toContain('publication(s) lui sont actuellement associées');

    // Nettoyage de la publication de test
    await db.run("DELETE FROM publications WHERE id = 'pub_linked_p3'");
  });

  // 9. Suppression sécurisée du fichier physique et de la base
  it('9. DELETE /api/videos/:id doit supprimer le fichier disque et lentrée SQLite', async () => {
    const physicalPath = path.join(uploadsDir, uploadedVideoFilename);
    expect(fs.existsSync(physicalPath)).toBe(true);

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/videos/${uploadedVideoId}`
    });

    expect(res.statusCode).toBe(200);

    // Vérifier la suppression physique sur disque
    expect(fs.existsSync(physicalPath)).toBe(false);

    // Vérifier la suppression dans la base
    const db = getDatabase();
    const row = await db.get('SELECT id FROM videos WHERE id = ?', [uploadedVideoId]);
    expect(row).toBeUndefined();
  });
});

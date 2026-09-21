import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

const projectRoot = path.basename(process.cwd()) === 'server' 
  ? path.resolve(process.cwd(), '..') 
  : process.cwd();

dotenv.config({ path: path.resolve(projectRoot, '.env') });
dotenv.config();

const rawDbPath = process.env.DATABASE_PATH || './data/postboy.db';
const resolvedDbPath = path.isAbsolute(rawDbPath) 
  ? rawDbPath 
  : path.resolve(projectRoot, rawDbPath);

// S'assurer que le dossier parent existe
const dbDir = path.dirname(resolvedDbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

let dbInstance: DatabaseSync | null = null;

export function getDatabase(): DatabaseSync {
  if (!dbInstance) {
    dbInstance = new DatabaseSync(resolvedDbPath);
    // Optimisations de performance et intégrité
    dbInstance.exec('PRAGMA journal_mode = WAL;');
    dbInstance.exec('PRAGMA foreign_keys = ON;');
    dbInstance.exec('PRAGMA busy_timeout = 5000;');
  }
  return dbInstance;
}

export function closeDatabase(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

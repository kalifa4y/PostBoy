import { createClient, Client, InStatement, InArgs, ResultSet } from '@libsql/client';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

const projectRoot = path.basename(process.cwd()) === 'server'
  ? path.resolve(process.cwd(), '..')
  : process.cwd();

dotenv.config({ path: path.resolve(projectRoot, '.env') });
dotenv.config();

export class LibSqlDatabase {
  constructor(public client: Client) {}

  async all<T = any>(sql: string, args: InArgs = []): Promise<T[]> {
    const res = await this.client.execute({ sql, args });
    return res.rows.map(row => ({ ...row })) as unknown as T[];
  }

  async get<T = any>(sql: string, args: InArgs = []): Promise<T | undefined> {
    const res = await this.client.execute({ sql, args });
    if (res.rows.length === 0) return undefined;
    return { ...res.rows[0] } as unknown as T;
  }

  async run(sql: string, args: InArgs = []): Promise<{ changes: number; lastInsertRowid?: bigint }> {
    const res = await this.client.execute({ sql, args });
    return {
      changes: res.rowsAffected,
      lastInsertRowid: res.lastInsertRowid
    };
  }

  async exec(sql: string): Promise<void> {
    await this.client.executeMultiple(sql);
  }

  async batch(stmts: InStatement[]): Promise<ResultSet[]> {
    return this.client.batch(stmts, 'write');
  }

  close(): void {
    this.client.close();
  }
}

let dbInstance: LibSqlDatabase | null = null;

export function getDatabase(customUrl?: string, customToken?: string): LibSqlDatabase {
  if (!dbInstance) {
    const isTest = process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST);
    let url = customUrl || (isTest ? (process.env.TURSO_TEST_DATABASE_URL || ':memory:') : process.env.TURSO_DATABASE_URL);
    let authToken = customToken || (isTest ? process.env.TURSO_TEST_AUTH_TOKEN : process.env.TURSO_AUTH_TOKEN);

    if (!url) {
      const rawDbPath = process.env.DATABASE_PATH || './data/postboy.db';
      const resolvedDbPath = path.isAbsolute(rawDbPath)
        ? rawDbPath
        : path.resolve(projectRoot, rawDbPath);

      const dbDir = path.dirname(resolvedDbPath);
      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
      }

      url = `file:${resolvedDbPath.replace(/\\/g, '/')}`;
    }

    const client = createClient({
      url,
      authToken
    });

    dbInstance = new LibSqlDatabase(client);
  }
  return dbInstance;
}

export function setDatabase(db: LibSqlDatabase | null): void {
  dbInstance = db;
}

export function closeDatabase(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}


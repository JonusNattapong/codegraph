/**
 * SQLite Adapter
 *
 * Thin wrapper over Node's built-in `node:sqlite` (`DatabaseSync`) or the
 * `better-sqlite3` npm package, exposed through a uniform `SqliteDatabase`
 * interface so the rest of the codebase is storage-agnostic.
 *
 * Primary backend: `node:sqlite` (shipped with Node 22.5+).
 * Fallback:       `better-sqlite3` (npm package, used when node:sqlite lacks FTS5).
 */

export interface SqliteStatement {
  run(...params: any[]): { changes: number; lastInsertRowid: number | bigint };
  get(...params: any[]): any;
  all(...params: any[]): any[];
  /**
   * Lazily yield result rows one at a time instead of materializing the whole
   * set with `all()`. Use for unbounded scans (e.g. every function/method node)
   * so memory stays O(1) in the row count rather than O(rows) — see #610, where
   * `all()`-ing every symbol on a dense project spiked the heap into an OOM.
   */
  iterate(...params: any[]): IterableIterator<any>;
}

export interface SqliteDatabase {
  prepare(sql: string): SqliteStatement;
  exec(sql: string): void;
  pragma(str: string, options?: { simple?: boolean }): any;
  transaction<T>(fn: (...args: any[]) => T): (...args: any[]) => T;
  close(): void;
  readonly open: boolean;
}

/**
 * The active SQLite backend. Extended when better-sqlite3 is used as a fallback
 * on platforms where node:sqlite's FTS5 support is unavailable.
 */
export type SqliteBackend = 'node-sqlite' | 'better-sqlite3';

/**
 * Wraps Node's built-in `node:sqlite` (`DatabaseSync`) to match the
 * better-sqlite3 interface the rest of the code expects.
 *
 * node:sqlite is real SQLite compiled into Node, so it supports WAL, FTS5,
 * mmap, and `@named` params natively — the only shims needed are the
 * better-sqlite3 conveniences node:sqlite omits: a `.pragma()` helper, a
 * `.transaction()` helper, and `open` (node:sqlite exposes `isOpen`).
 */
class NodeSqliteAdapter implements SqliteDatabase {
  private _db: any;

  constructor(dbPath: string) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { DatabaseSync } = require('node:sqlite');
    this._db = new DatabaseSync(dbPath);
  }

  get open(): boolean {
    return this._db.isOpen;
  }

  prepare(sql: string): SqliteStatement {
    // node:sqlite matches better-sqlite3's calling convention (variadic
    // positional args, or a single object for @named params), so params forward
    // through unchanged.
    const stmt = this._db.prepare(sql);
    return {
      run(...params: any[]) {
        const r = stmt.run(...params);
        return {
          changes: Number(r?.changes ?? 0),
          lastInsertRowid: r?.lastInsertRowid ?? 0,
        };
      },
      get(...params: any[]) {
        return stmt.get(...params);
      },
      all(...params: any[]) {
        return stmt.all(...params);
      },
      iterate(...params: any[]) {
        return stmt.iterate(...params);
      },
    };
  }

  exec(sql: string): void {
    this._db.exec(sql);
  }

  pragma(str: string, options?: { simple?: boolean }): any {
    const trimmed = str.trim();
    // Write pragma ("key = value"): node:sqlite is real SQLite, so every pragma
    // (WAL, mmap, synchronous, …) applies as-is.
    if (trimmed.includes('=')) {
      this._db.exec(`PRAGMA ${trimmed}`);
      return;
    }
    // Read pragma. Default: the row object (e.g. { journal_mode: 'wal' }).
    // `{ simple: true }` returns just the single column value, like better-sqlite3.
    const row = this._db.prepare(`PRAGMA ${trimmed}`).get();
    if (options?.simple) {
      return row && typeof row === 'object' ? Object.values(row)[0] : row;
    }
    return row;
  }

  transaction<T>(fn: (...args: any[]) => T): (...args: any[]) => T {
    return (...args: any[]) => {
      this._db.exec('BEGIN');
      try {
        const result = fn(...args);
        this._db.exec('COMMIT');
        return result;
      } catch (error) {
        this._db.exec('ROLLBACK');
        throw error;
      }
    };
  }

  close(): void {
    // node:sqlite's DatabaseSync.close() throws if already closed; make it
    // idempotent to match better-sqlite3 (callers may close more than once).
    if (this._db.isOpen) this._db.close();
  }
}

/**
 * Wraps the `better-sqlite3` npm package to match the `SqliteDatabase` interface.
 * Used as a fallback on platforms where node:sqlite's FTS5 support is unavailable
 * but better-sqlite3 is installed.
 */
class BetterSqlite3Adapter implements SqliteDatabase {
  private _db: any;

  constructor(dbPath: string) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Database = require('better-sqlite3');
    this._db = new Database(dbPath);
    this._db.pragma('journal_mode = WAL');
  }

  get open(): boolean {
    return this._db.open;
  }

  prepare(sql: string): SqliteStatement {
    const stmt = this._db.prepare(sql);
    return {
      run(...params: any[]) {
        const r = stmt.run(...params);
        return { changes: r.changes, lastInsertRowid: r.lastInsertRowid };
      },
      get(...params: any[]) { return stmt.get(...params); },
      all(...params: any[]) { return stmt.all(...params); },
      iterate(...params: any[]) { return stmt.iterate(...params); },
    };
  }

  exec(sql: string): void { this._db.exec(sql); }

  pragma(str: string, options?: { simple?: boolean }): any {
    const trimmed = str.trim();
    if (trimmed.includes('=')) {
      this._db.pragma(trimmed);
      return;
    }
    const row = this._db.pragma(trimmed, { simple: true });
    if (options?.simple) return row;
    return row;
  }

  transaction<T>(fn: (...args: any[]) => T): (...args: any[]) => T {
    return this._db.transaction(fn);
  }

  close(): void { this._db.close(); }
}

/**
 * Create a database connection backed by `node:sqlite` with a fallback to
 * `better-sqlite3` when FTS5 is not available in the built-in module.
 *
 * Returns the active backend alongside the db so each `DatabaseConnection` can
 * report it per-instance — MCP can open multiple project DBs in one process, so
 * a process-global would race.
 */
export function createDatabase(dbPath: string): { db: SqliteDatabase; backend: SqliteBackend } {
  // 1. Try node:sqlite first (the primary backend on Node 22.5+)
  let nodeErr: string | null = null;
  try {
    const db = new NodeSqliteAdapter(dbPath);
    // On some Node.js builds (e.g. Windows), node:sqlite opens successfully but
    // FTS5 is not compiled in. Test it immediately with a throwaway virtual table.
    try {
      db.exec('CREATE VIRTUAL TABLE _codegg_fts5_test USING fts5(content)');
      db.exec('DROP TABLE _codegg_fts5_test');
      return { db, backend: 'node-sqlite' };
    } catch (ftsErr) {
      db.close();
      nodeErr = `node:sqlite opened but FTS5 is unavailable: ${ftsErr instanceof Error ? ftsErr.message : String(ftsErr)}`;
    }
  } catch (error) {
    nodeErr = error instanceof Error ? error.message : String(error);
  }

  // 2. Fall back to better-sqlite3 (npm package, has FTS5 on all platforms)
  try {
    return { db: new BetterSqlite3Adapter(dbPath), backend: 'better-sqlite3' };
  } catch {
    // better-sqlite3 is optional — if absent, report the original node:sqlite error
    throw new Error(
      'Failed to open SQLite database.\n' +
      'CodeGG requires either:\n' +
      `  - node:sqlite with FTS5 (Node.js 22.5+): ${nodeErr}\n` +
      '  - The better-sqlite3 npm package (npm install better-sqlite3)\n' +
      'Run on Node 22.5+, or install the self-contained CodeGG release.'
    );
  }
}

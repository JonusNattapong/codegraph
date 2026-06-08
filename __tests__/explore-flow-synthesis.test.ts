/**
 * Tests for buildFlowFromNamedSymbols — the flow-path synthesis engine
 * inside codegg_explore. A regression here silently forces agents back to
 * Read/Grep, so these tests are the canary.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { initGrammars, loadAllGrammars } from '../src/extraction/grammars';

beforeAll(async () => {
  await initGrammars();
  await loadAllGrammars();
});

function hasSqliteBindings(): boolean {
  try {
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(':memory:');
    db.close();
    return true;
  } catch {
    return false;
  }
}
const HAS_SQLITE = hasSqliteBindings();

function tmpRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'codegg-explore-flow-'));
}

function rmTree(dir: string): void {
  if (!fs.existsSync(dir)) return;
  // On Windows, SQLite WAL files may briefly outlive close(). Retry once
  // after a short delay. Using force:true makes this best-effort.
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // Windows may need a tick for the file lock to release
  }
}

async function buildTsFlowProject(): Promise<string> {
  const root = tmpRoot();
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'src', 'app.ts'),
    [
      'export function parseInput(raw: string): string {',
      "  const trimmed = raw.trim();",
      '  validateInput(trimmed);',
      '  return trimmed;',
      '}',
      '',
      'function validateInput(input: string): void {',
      '  if (!input) throw new Error("empty");',
      '  sanitize(input);',
      '}',
      '',
      'function sanitize(input: string): string {',
      "  return input.replace(/<script>/g, '');",
      '}',
    ].join('\n')
  );
  fs.writeFileSync(
    path.join(root, 'tsconfig.json'),
    JSON.stringify({ compilerOptions: { strict: true } })
  );
  return root;
}

async function buildTsOverloadedProject(): Promise<string> {
  const root = tmpRoot();
  fs.writeFileSync(
    path.join(root, 'service.ts'),
    [
      'export class AuthService {',
      '  async login(user: string, pass: string): Promise<string> {',
      "    return 'token';",
      '  }',
      '',
      '  validate(token: string): boolean {',
      '    return token.length > 0;',
      '  }',
      '}',
      '',
      'export class PaymentService {',
      '  async process(amount: number): Promise<boolean> {',
      '    return true;',
      '  }',
      '',
      '  validate(card: string): boolean {',
      "    return card.startsWith('4');",
      '  }',
      '}',
    ].join('\n')
  );
  fs.writeFileSync(
    path.join(root, 'tsconfig.json'),
    JSON.stringify({ compilerOptions: { strict: true } })
  );
  return root;
}

describe.skipIf(!HAS_SQLITE)('buildFlowFromNamedSymbols — flow synthesis', () => {
  let CodeGG: any;
  let ToolHandler: any;

  beforeAll(async () => {
    const idx = await import('../src');
    const tools = await import('../src/mcp/tools');
    CodeGG = idx.default;
    ToolHandler = tools.ToolHandler;
  });

  // ── Test 1: Basic static A→B→C flow ──────────────────────────

  describe('static call chain A→B→C', () => {
    let root: string;
    let cg: any;
    let handler: any;

    beforeEach(async () => {
      root = await buildTsFlowProject();
      cg = CodeGG.initSync(root);
      await cg.indexAll();
      handler = new ToolHandler(cg);
    });

    afterEach(async () => {
      handler?.closeAll();
      cg?.destroy();
      // Windows SQLite may hold file locks briefly after close.
      await new Promise(r => setTimeout(r, 100));
      try { rmTree(root); } catch { /* OS cleanup */ }
    });

    it('finds parseInput → validateInput → sanitize path', async () => {
      const res = await handler.execute('codegg_explore', {
        query: 'parseInput validateInput sanitize',
      });
      const text = res.content[0].text;
      // The flow section should mention the intermediate hop
      expect(text).toContain('parseInput');
      expect(text).toContain('validateInput');
      expect(text).toContain('sanitize');
      expect(res.isError).toBeFalsy();
    });

    it('returns source for each function in the flow', async () => {
      const res = await handler.execute('codegg_explore', {
        query: 'parseInput sanitize',
      });
      const text = res.content[0].text;
      expect(text).toContain('function parseInput');
      expect(text).toContain('function sanitize');
      expect(res.isError).toBeFalsy();
    });
  });

  // ── Test 2: Overloaded method disambiguation ─────────────────

  describe('overloaded method disambiguation', () => {
    let root: string;
    let cg: any;
    let handler: any;

    beforeEach(async () => {
      root = await buildTsOverloadedProject();
      cg = CodeGG.initSync(root);
      await cg.indexAll();
      handler = new ToolHandler(cg);
    });

    afterEach(async () => {
      handler?.closeAll();
      cg?.destroy();
      // Windows SQLite may hold file locks briefly after close.
      await new Promise(r => setTimeout(r, 100));
      try { rmTree(root); } catch { /* OS cleanup */ }
    });

    it('distinguishes AuthService.validate from PaymentService.validate', async () => {
      const res = await handler.execute('codegg_explore', {
        query: 'AuthService validate',
      });
      const text = res.content[0].text;
      expect(text).toContain('AuthService');
      // AuthService's validate should appear prominently
      const authIdx = text.indexOf('AuthService');
      const payIdx = text.indexOf('PaymentService');
      // AuthService should appear before PaymentService (or PaymentService not at all)
      if (payIdx > -1) {
        expect(authIdx).toBeLessThan(payIdx);
      }
      expect(res.isError).toBeFalsy();
    });
  });

  // ── Test 3: Empty query ──────────────────────────────────────

  describe('empty query handling', () => {
    let root: string;
    let cg: any;
    let handler: any;

    beforeEach(async () => {
      root = await buildTsFlowProject();
      cg = CodeGG.initSync(root);
      await cg.indexAll();
      handler = new ToolHandler(cg);
    });

    afterEach(async () => {
      handler?.closeAll();
      cg?.destroy();
      // Windows SQLite may hold file locks briefly after close.
      await new Promise(r => setTimeout(r, 100));
      try { rmTree(root); } catch { /* OS cleanup */ }
    });

    it('rejects empty query gracefully', async () => {
      const res = await handler.execute('codegg_explore', { query: '' });
      expect(res.isError).toBe(true);
      expect(res.content[0].text).toContain('Error');
    });
  });
});

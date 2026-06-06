/**
 * CODEGG_MCP_TOOLS allowlist — lets an operator (or an A/B harness) trim the
 * exposed MCP tool surface without touching the client config. Inert when unset.
 * Filtering happens in ListTools (getTools) and is enforced again on execute().
 */
import { describe, it, expect, afterEach } from 'vitest';
import { ToolHandler } from '../src/mcp/tools';

const ENV = 'CODEGG_MCP_TOOLS';

describe('CODEGG_MCP_TOOLS allowlist', () => {
  const original = process.env[ENV];
  afterEach(() => {
    if (original === undefined) delete process.env[ENV];
    else process.env[ENV] = original;
  });

  const listed = () => new ToolHandler(null).getTools().map(t => t.name).sort();

  it('exposes the full tool surface when unset', () => {
    delete process.env[ENV];
    const all = listed();
    expect(all).toContain('codegg_explore');
    expect(all).not.toContain('codegg_context');
    expect(all).not.toContain('codegg_trace');
    expect(all.length).toBeGreaterThanOrEqual(8);
  });

  it('filters ListTools to the allowlisted short names', () => {
    process.env[ENV] = 'explore,search,node';
    expect(listed()).toEqual(['codegg_explore', 'codegg_node', 'codegg_search']);
  });

  it('accepts fully-qualified codegg_ names and ignores whitespace', () => {
    process.env[ENV] = ' codegg_explore , search ';
    expect(listed()).toEqual(['codegg_explore', 'codegg_search']);
  });

  it('treats an empty/whitespace value as unset (full surface)', () => {
    process.env[ENV] = '   ';
    expect(listed().length).toBeGreaterThanOrEqual(8);
  });

  it('rejects a disabled tool on execute (defense in depth)', async () => {
    process.env[ENV] = 'node';
    const res = await new ToolHandler(null).execute('codegg_explore', {});
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/disabled via CODEGG_MCP_TOOLS/);
  });

  it('lets an allowlisted tool past the guard', async () => {
    process.env[ENV] = 'search';
    // No CodeGG attached, so it fails *after* the allowlist guard — the
    // "disabled" message must NOT appear, proving the guard passed it through.
    const res = await new ToolHandler(null).execute('codegg_search', { query: 'x' });
    expect(res.content[0].text).not.toMatch(/disabled via CODEGG_MCP_TOOLS/);
  });
});

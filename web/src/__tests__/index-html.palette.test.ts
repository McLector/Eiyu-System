// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PALETTE, PALETTES, PALETTE_STORAGE_KEY } from '../palette';

// The page's own markup and its inline script, read from index.html. The script runs before first paint, so its
// behaviour is checked by running it against this page's storage and root element.
const html = readFileSync(path.resolve(import.meta.dirname, '..', '..', 'index.html'), 'utf-8').replace(/\r\n/g, '\n');
const parsed = new DOMParser().parseFromString(html, 'text/html');
const inlineScripts = [...parsed.querySelectorAll('script')].filter(node => !node.hasAttribute('src'));
const script = inlineScripts[0];
const body = script?.textContent ?? '';
const staticPalette = parsed.documentElement.dataset.palette;
const listedIds = [...(body.match(/\[([^\]]*)\]/)?.[1] ?? '').matchAll(/['"]([^'"]*)['"]/g)].map(match => match[1]);
const root = () => document.documentElement;

function runInlineScript() {
  new Function(body)();
}

beforeEach(() => {
  window.localStorage.clear();
  // Start from the page's own markup, as the browser does before the script runs.
  if (staticPalette) root().dataset.palette = staticPalette;
  else delete root().dataset.palette;
});
afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
  delete root().dataset.palette;
});

describe('web/index.html palette before first paint', () => {
  it('marks the page root System blue, the shared default, before any script runs', () => {
    expect(staticPalette).toBe(DEFAULT_PALETTE);
    expect(DEFAULT_PALETTE).toBe('blue');
  });

  it('has exactly one inline script, in the head, classic and not deferred', () => {
    expect(inlineScripts).toHaveLength(1);
    expect(parsed.head.contains(script)).toBe(true);
    expect(script.hasAttribute('async')).toBe(false);
    expect(script.hasAttribute('defer')).toBe(false);
    expect(script.hasAttribute('type') && script.getAttribute('type') !== 'text/javascript').toBe(false);
  });

  it('wraps the storage read in try/catch so blocked storage cannot break the page', () => {
    expect(body).toMatch(/try\s*\{/);
    expect(body).toMatch(/\}\s*catch\s*\(/);
  });

  it('lists the same palette ids, in the same order, as PALETTES', () => {
    expect(listedIds).toEqual(PALETTES.map(p => p.id));
  });

  describe('a stored palette', () => {
    it.each(PALETTES.map(p => p.id).filter(id => id !== 'blue' && id !== 'cyan'))('is applied to the page root: %s', id => {
      window.localStorage.setItem(PALETTE_STORAGE_KEY, id);
      runInlineScript();
      expect(root().dataset.palette).toBe(id);
    });

    it('keeps blue on the page root when blue is stored', () => {
      window.localStorage.setItem(PALETTE_STORAGE_KEY, 'blue');
      runInlineScript();
      expect(root().dataset.palette).toBe('blue');
    });

    it('removes the attribute when cyan is stored, because cyan is the page with no attribute', () => {
      window.localStorage.setItem(PALETTE_STORAGE_KEY, 'cyan');
      runInlineScript();
      expect(root().hasAttribute('data-palette')).toBe(false);
    });
  });

  describe('anything that is not a palette leaves blue in place', () => {
    it.each(['', 'BLUE', ' jade', 'jade ', 'crimson', 'null', 'constructor', '__proto__', 'toString', '<script>'])('for the stored value %j', value => {
      window.localStorage.setItem(PALETTE_STORAGE_KEY, value);
      runInlineScript();
      expect(root().dataset.palette).toBe('blue');
    });

    it('keeps blue when nothing is stored', () => {
      runInlineScript();
      expect(root().dataset.palette).toBe('blue');
    });
  });

  describe('blocked storage', () => {
    it('keeps blue, and does not throw, when reading storage throws', () => {
      window.localStorage.setItem(PALETTE_STORAGE_KEY, 'jade');
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('denied', 'SecurityError'); });
      expect(() => runInlineScript()).not.toThrow();
      expect(root().dataset.palette).toBe('blue');
    });

    it('keeps blue, and does not throw, when reaching localStorage itself throws (site data blocked)', () => {
      vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => { throw new DOMException('denied', 'SecurityError'); });
      expect(() => runInlineScript()).not.toThrow();
      expect(root().dataset.palette).toBe('blue');
    });
  });
});

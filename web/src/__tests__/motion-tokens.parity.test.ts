import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { MOTION } from '@eiyu/shared';

const css = readFileSync(path.resolve(import.meta.dirname, '..', 'index.css'), 'utf-8').replace(/\r\n/g, '\n');
const root = css.match(/:root\s*\{([^}]*)\}/)?.[1] ?? '';
const value = (name: string) => root.match(new RegExp(`${name}\\s*:\\s*([^;]+);`))?.[1].replace(/\s+/g, ' ').trim();
const bezier = (points: readonly number[]) => `cubic-bezier(${points.join(', ')})`;

describe('shared MOTION matches web/src/index.css', () => {
  it.each([
    ['--dur-press', MOTION.durPress],
    ['--dur-fast', MOTION.durFast],
    ['--dur-base', MOTION.durBase],
    ['--dur-slow', MOTION.durSlow],
  ])('%s is %ims', (name, ms) => {
    expect(value(name), `${name} missing from :root`).toBe(`${ms}ms`);
  });
  it.each([
    ['--ease-out', MOTION.easeOut],
    ['--ease-in-out', MOTION.easeInOut],
    ['--ease-drawer', MOTION.easeDrawer],
  ])('%s is the same curve', (name, points) => {
    expect(value(name), `${name} missing from :root`).toBe(bezier(points));
  });
});

import viteConfig from './vite.config';

// Kept apart from vite.config.ts: defineConfig from 'vitest/config' pulls in a second copy of Vite's types here.
// Form tests take 1 to 4 s alone; with 100+ files running at once the default 5 s limit timed out a different one each run.
export default { ...viteConfig, test: { testTimeout: 20_000 } };

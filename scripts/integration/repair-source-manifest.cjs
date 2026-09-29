// Hash the reviewable source snapshot without copying local fixture credentials.
const { createHash } = require('node:crypto');
const { readFileSync, writeFileSync, mkdirSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { execFileSync } = require('node:child_process');

const root = resolve(__dirname, '../..');
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
const allowed = /^(?:backend\/supabase\/|packages\/shared\/src\/|web\/src\/|mobile\/(?:app|components|contexts|lib)\/|scripts\/integration\/|supabase\/tests\/)/;
const extension = /\.(?:ts|tsx|sql|cjs)$/;
const paths = git('ls-files', '-z', '-m', '-o', '--exclude-standard')
  .split('\0').filter(Boolean).map((path) => path.replaceAll('\\', '/'))
  .filter((path) => allowed.test(path) && extension.test(path)).sort();
const files = paths.map((path) => {
  const bytes = readFileSync(join(root, path));
  return { path, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
});
const snapshotSha256 = createHash('sha256')
  .update(files.map(({ path, sha256 }) => `${path}\0${sha256}\n`).join(''))
  .digest('hex');
const manifest = {
  baseHead: git('rev-parse', 'HEAD').trim(),
  branch: git('branch', '--show-current').trim(),
  scope: 'Modified and untracked runtime, test, SQL, and integration source; excludes docs, artifacts, ignored local credentials, and generated output.',
  fileCount: files.length,
  snapshotSha256,
  files,
};
const output = join(root, 'docs/plans/board-refresh/review-evidence/2026-09-29-source-snapshot.json');
mkdirSync(resolve(output, '..'), { recursive: true });
writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`);
process.stdout.write(`${files.length} files; SHA-256 ${snapshotSha256}\n`);

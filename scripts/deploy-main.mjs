import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const read = (command, args, cwd) => execFileSync(command, args, { cwd, encoding: 'utf8' }).trim();
const run = (command, args, cwd) => execFileSync(command, args, { cwd, stdio: 'inherit' });
const root = read('git', ['rev-parse', '--show-toplevel']);
run('git', ['fetch', 'origin', 'main'], root);
const commit = read('git', ['rev-parse', 'origin/main'], root);
if (read('git', ['rev-parse', 'HEAD'], root) !== commit) throw new Error('Commit and push the intended changes to main before deploying.');
const dirty = read('git', ['status', '--porcelain', '--untracked-files=all', '--', 'src', 'public', 'scripts', 'package.json', 'package-lock.json', 'next.config.ts', 'tsconfig.json', 'next-env.d.ts'], root);
if (dirty) throw new Error('Commit all application changes before deploying main.');
const runs = JSON.parse(read('gh', ['run', 'list', '--workflow', 'ci.yml', '--branch', 'main', '--commit', commit, '--limit', '1', '--json', 'status,conclusion'], root));
if (runs[0]?.status !== 'completed' || runs[0]?.conclusion !== 'success') throw new Error('Wait for the main CI checks to pass before deploying.');

const temporary = mkdtempSync(join(tmpdir(), 'beautiful-church-main-'));
const checkout = join(temporary, 'checkout');
let created = false;
try {
  run('git', ['worktree', 'add', '--detach', checkout, commit], root); created = true;
  run('vercel', ['link', '--yes', '--project', 'beautiful-church', '--scope', 'dewdews-projects'], checkout);
  // Recheck after setup so a newly pushed main is not silently replaced by an older commit.
  const remote = read('git', ['ls-remote', 'origin', 'refs/heads/main'], root).split(/\s+/)[0];
  if (remote !== commit) throw new Error('Remote main changed during setup; update the checkout and retry.');
  console.log(`Deploying verified main commit ${commit}`);
  run('vercel', ['deploy', '--prod', '--yes', '--scope', 'dewdews-projects', '--meta', `deploymentCommit=${commit}`, '--meta', 'deploymentBranch=main'], checkout);
} finally {
  if (created) run('git', ['worktree', 'remove', '--force', checkout], root);
  rmSync(temporary, { recursive: true, force: true });
}

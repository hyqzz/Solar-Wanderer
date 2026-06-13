// 向 awesome 清单提交收录 PR：fork → 建分支 → 精确字符串插入 → 开 PR。
// 使用 gh CLI（已认证）。仅改单文件，经 GitHub API，不污染本地工作目录。
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const GH = 'C:\\Program Files\\GitHub CLI\\gh.exe';
const gh = (args, opts = {}) => execFileSync(GH, args, { encoding: 'utf8', ...opts }).trim();
const ghJson = (args) => JSON.parse(gh(args));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const TARGETS = [
  {
    upstream: 'orbitalindex/awesome-space',
    path: 'README.md',
    branch: 'add-solar-wanderer',
    // 插在 SpaceEngine 之前（字母序：Solar < Space）
    anchor: '* [SpaceEngine](https://spaceengine.org)',
    newLine: '* [Solar Wanderer](https://sw.icodestar.net) - A 1:1 real-time, browser-based solar system explorer using NASA JPL ephemerides. Seamless landing from orbit to walking on the surface, ray-marched atmospheres, and coverage out to the Oort Cloud. ([source](https://github.com/hyqzz/Solar-Wanderer))\n',
    prTitle: 'Add Solar Wanderer to Astronomy → Visualization',
    prBody: `Adds [Solar Wanderer](https://sw.icodestar.net) to the **Astronomy → Visualization** list.

It's a 1:1 real-time solar system explorer that runs entirely in the browser (no install), with planet positions computed from NASA JPL ephemerides and cross-checked against the JPL Horizons API. It sits naturally alongside Celestia, Gaia Sky, NASA Eyes and Harmony of the Spheres.

- Live: https://sw.icodestar.net
- Source (MIT): https://github.com/hyqzz/Solar-Wanderer

Entry inserted in alphabetical order. Thanks for maintaining this list! 🚀`,
  },
  {
    upstream: 'terkelg/awesome-creative-coding',
    path: 'readme.md',
    branch: 'add-solar-wanderer',
    // Inspiration 节末尾（Folds2d 之后）插入
    anchor: '- [Folds2d](https://folds2d.tumblr.com/) - Tumblr with curves, surfaces, scalar and vector fields.',
    after: true,
    newLine: '\n- [Solar Wanderer](https://sw.icodestar.net) - Interactive 1:1 real-time solar system you can fly through in the browser, built with Three.js; NASA JPL-accurate, seamless orbit-to-surface landing.',
    prTitle: 'Add Solar Wanderer to Inspiration',
    prBody: `Adds [Solar Wanderer](https://sw.icodestar.net) to **Inspiration**.

A 1:1 real-time, browser-based solar system explorer built with Three.js — floating-origin + log-depth rendering from 0.5 m to light-years, ray-marched atmospheres, seamless orbit-to-surface landing. Open source (MIT): https://github.com/hyqzz/Solar-Wanderer

Hope it's a good fit alongside the other interactive showcases here. Thanks for curating this list!`,
  },
];

async function ensureFork(upstream) {
  const name = upstream.split('/')[1];
  try { gh(['api', `repos/hyqzz/${name}`]); return name; } catch {}
  console.log(`  forking ${upstream}…`);
  gh(['repo', 'fork', upstream, '--clone=false']);
  for (let i = 0; i < 30; i++) {
    await sleep(2000);
    try { gh(['api', `repos/hyqzz/${name}`]); return name; } catch {}
  }
  throw new Error('fork not ready: ' + upstream);
}

const compareUrls = [];
for (const t of TARGETS) {
  console.log(`\n=== ${t.upstream} ===`);
  const name = await ensureFork(t.upstream);
  const defBranch = gh(['api', `repos/${t.upstream}`, '--jq', '.default_branch']);

  // 分支是否已存在并已含改动？
  let branchHasChange = false;
  try {
    const bf = ghJson(['api', `repos/hyqzz/${name}/contents/${t.path}?ref=${t.branch}`]);
    branchHasChange = Buffer.from(bf.content, 'base64').toString('utf8').includes('sw.icodestar.net');
  } catch {}

  if (!branchHasChange) {
    try { gh(['repo', 'sync', `hyqzz/${name}`, '--source', t.upstream]); } catch { console.log('  (sync skipped)'); }
    const file = ghJson(['api', `repos/hyqzz/${name}/contents/${t.path}?ref=${defBranch}`]);
    const content = Buffer.from(file.content, 'base64').toString('utf8');
    if (!content.includes(t.anchor)) { console.log('  ❌ anchor not found, skip'); continue; }
    const replacement = t.after ? (t.anchor + t.newLine) : (t.newLine + t.anchor);
    const updated = content.replace(t.anchor, replacement);

    const baseSha = gh(['api', `repos/hyqzz/${name}/git/ref/heads/${defBranch}`, '--jq', '.object.sha']);
    try { gh(['api', `repos/hyqzz/${name}/git/refs`, '-f', `ref=refs/heads/${t.branch}`, '-f', `sha=${baseSha}`]); }
    catch { console.log('  (branch exists)'); }

    const dir = mkdtempSync(join(tmpdir(), 'awpr-'));
    const bodyFile = join(dir, 'body.json');
    writeFileSync(bodyFile, JSON.stringify({
      message: 'Add Solar Wanderer',
      content: Buffer.from(updated, 'utf8').toString('base64'),
      sha: file.sha, branch: t.branch,
    }));
    gh(['api', `repos/hyqzz/${name}/contents/${t.path}`, '--method', 'PUT', '--input', bodyFile]);
    console.log('  ✅ commit pushed to fork branch');
  } else {
    console.log('  ✅ fork branch already has the change');
  }

  // 尝试自动开 PR；fine-grained PAT 无第三方仓库 PR 权限时，给出一键链接
  const dir = mkdtempSync(join(tmpdir(), 'awpr-'));
  const prBodyFile = join(dir, 'pr.md');
  writeFileSync(prBodyFile, t.prBody);
  try {
    const prUrl = gh(['pr', 'create', '--repo', t.upstream, '--head', `hyqzz:${t.branch}`,
      '--base', defBranch, '--title', t.prTitle, '--body-file', prBodyFile]);
    console.log(`  ✅ PR opened: ${prUrl}`);
  } catch {
    const url = `https://github.com/${t.upstream}/compare/${defBranch}...hyqzz:${name}:${t.branch}?expand=1`;
    compareUrls.push({ upstream: t.upstream, url });
    console.log(`  ⚠ token can't open cross-repo PR. One-click: ${url}`);
  }
}
if (compareUrls.length) {
  console.log('\n=== 一键开 PR（点开后页面已预填，点 Create pull request 即可）===');
  for (const c of compareUrls) console.log(`• ${c.upstream}\n  ${c.url}`);
}
console.log('\nDone.');

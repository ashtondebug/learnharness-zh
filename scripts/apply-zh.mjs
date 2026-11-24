#!/usr/bin/env node
/**
 * LearnHarness 简体中文汉化补丁 / Chinese localization patch for LearnHarness
 *
 * 用法 / Usage:
 *   node scripts/apply-zh.mjs                 # 自动定位安装目录并汉化
 *   node scripts/apply-zh.mjs --target <DIR>  # 指定 .../resources/server/standalone
 *   node scripts/apply-zh.mjs --dry-run       # 只统计，不写文件
 *   node scripts/apply-zh.mjs --restore       # 还原为英文原版
 *   node scripts/apply-zh.mjs --backup-only   # 只做备份
 *
 * 原理：安装目录只带 Next.js 编译产物（.next），界面文案是其中的字符串字面量。
 * 本脚本用「引号内完整字面量」精确替换，服务端 SSR chunk 与浏览器 chunk 同时替换，
 * 以保证 React 水合一致；插件清单只改 name/description 两个字段。
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
const DICT_PATH = path.join(REPO, 'dict', 'dict.json');
const PLUGIN_LABELS = path.join(REPO, 'plugins', 'zh-labels.json');
const BACKUP_DIRNAME = '.lh-zh-backup';
const MARKER = path.join(BACKUP_DIRNAME, 'manifest.json');

// ---------------------------------------------------------------- CLI 参数 ----
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const opt = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };

const MODE = flag('--restore') ? 'restore'
  : flag('--backup-only') ? 'backup'
  : 'apply';
const DRY = flag('--dry-run');

// ------------------------------------------------------------ 安装目录定位 ----
function detectStandalone() {
  const explicit = opt('--target') || process.env.LEARNHARNESS_STANDALONE;
  if (explicit) return path.resolve(explicit);
  const candidates = [
    // Windows
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'learnharness', 'resources', 'server', 'standalone'),
    path.join('C:\\Program Files', 'LearnHarness', 'resources', 'server', 'standalone'),
    // macOS
    '/Applications/LearnHarness.app/Contents/Resources/server/standalone',
    path.join(os.homedir(), 'Applications', 'LearnHarness.app', 'Contents', 'Resources', 'server', 'standalone'),
    // Linux
    '/opt/LearnHarness/resources/server/standalone',
    path.join(os.homedir(), '.local', 'share', 'learnharness', 'resources', 'server', 'standalone'),
  ];
  for (const c of candidates) {
    if (c && fs.existsSync(path.join(c, '.next'))) return c;
  }
  return null;
}

const TARGET = detectStandalone();
if (!TARGET) {
  console.error('找不到 LearnHarness 安装目录。请用 --target 指定 …/resources/server/standalone');
  process.exit(1);
}
const NEXT = path.join(TARGET, '.next');
const BACKUP = path.join(TARGET, BACKUP_DIRNAME);
if (!fs.existsSync(NEXT)) {
  console.error(`不是有效的安装目录（缺 .next）：${TARGET}`);
  process.exit(1);
}
console.log(`安装目录 / target: ${TARGET}`);
console.log(`模式 / mode: ${MODE}${DRY ? ' (dry-run)' : ''}`);

const EXT = /\.(js|mjs|cjs|rsc)$/;
function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (EXT.test(e.name)) acc.push(p);
  }
  return acc;
}

// -------------------------------------------------------------- 备份 / 还原 ----
function backup() {
  fs.mkdirSync(BACKUP, { recursive: true });
  const files = walk(NEXT);
  let bytes = 0;
  for (const f of files) {
    const dst = path.join(BACKUP, 'next', path.relative(NEXT, f));
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(f, dst);
    bytes += fs.statSync(f).size;
  }
  fs.writeFileSync(path.join(BACKUP, 'manifest.json'), JSON.stringify({
    createdAt: new Date().toISOString(),
    target: TARGET,
    files: files.length,
    bytes,
  }, null, 2));
  console.log(`已备份 ${files.length} 个文件（${(bytes / 1048576).toFixed(1)} MB）→ ${BACKUP}`);
}

function restore() {
  if (!fs.existsSync(path.join(BACKUP, 'next'))) {
    console.error(`没有找到备份：${BACKUP}`);
    process.exit(1);
  }
  let n = 0;
  for (const f of walk(path.join(BACKUP, 'next'))) {
    fs.copyFileSync(f, path.join(NEXT, path.relative(path.join(BACKUP, 'next'), f)));
    n++;
  }
  console.log(`已还原 ${n} 个文件为英文原版。请清空 Electron 缓存后重启应用。`);
}

// ------------------------------------------------------------------ 补丁引擎 ----
const dict = Object.assign(Object.create(null), JSON.parse(fs.readFileSync(DICT_PATH, 'utf8')));
const RISKY_PATH = path.join(REPO, 'dict', 'risky-keys.json');
const risky = new Set(fs.existsSync(RISKY_PATH) ? Object.keys(JSON.parse(fs.readFileSync(RISKY_PATH, 'utf8'))) : []);
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const SAFE_MODE = flag('--safe');

// 绝大多数文案全局替换；风险词条（同时被当作对象键/枚举值/导出名的短词）只在明确的界面属性位置替换。
const allKeys = Object.keys(dict).filter(k => typeof dict[k] === 'string' && dict[k] !== k && k.trim() !== '');
const globalKeys = allKeys
  .filter(k => !risky.has(k))
  .filter(k => !SAFE_MODE || /\s/.test(k))
  .sort((a, b) => b.length - a.length);
const riskyKeys = allKeys.filter(k => risky.has(k)).sort((a, b) => b.length - a.length);

const GLOBAL = globalKeys.length
  ? new RegExp(`(["'])(\\s?)(${globalKeys.map(esc).join('|')})(\\s?)\\1`, 'g')
  : null;
const PROPS = 'label|"aria-label"|ariaLabel|placeholder|title|description|heading|subtitle|tooltip|emptyText|children|text|verb|noun|summary';
const ANCHORED = riskyKeys.length
  ? new RegExp(`((?:${PROPS})\\s*:\\s*)(["'])(${riskyKeys.map(esc).join('|')})\\2`, 'g')
  : null;
// 模板字符串里的静态前缀（例如 `Empty = ${hex}`）
const RAW = [['Empty = ', '空 = ']];

const stats = { files: 0, changed: 0, sentence: 0, word: 0, raw: 0, guardKey: 0, guardExport: 0 };

if (MODE === 'backup') { backup(); process.exit(0); }
if (MODE === 'restore') { restore(); process.exit(0); }
// 首次汉化前先备份（已备份则保留第一次的原始副本）
if (!DRY && !fs.existsSync(path.join(BACKUP, 'manifest.json'))) backup();

for (const f of walk(NEXT)) {
  stats.files++;
  const src = fs.readFileSync(f, 'utf8');
  let n = 0;
  let out = src;

  if (GLOBAL) {
    out = out.replace(GLOBAL, (m, q, lead, key, trail, offset) => {
      const val = dict[key];
      if (typeof val !== 'string') return m;
      // 保护 1：ES 模块再导出的符号名（Object.defineProperty(r,"X",…)）
      const prefix = out.slice(Math.max(0, offset - 80), offset);
      if (/defineProperty\(\s*[\w$.]+\s*,\s*$/.test(prefix)) { stats.guardExport++; return m; }
      // 保护 2：对象键位置（{"X": …）不替换
      let i = offset - 1;
      while (i >= 0 && /\s/.test(out[i])) i--;
      let j = offset + m.length;
      while (j < out.length && /\s/.test(out[j])) j++;
      if (out[j] === ':' && (out[i] === '{' || out[i] === ',')) { stats.guardKey++; return m; }
      n++; stats.sentence++;
      return q + lead + val + trail + q;
    });
  }

  if (ANCHORED) {
    out = out.replace(ANCHORED, (m, pre, q, key) => {
      const val = dict[key];
      if (typeof val !== 'string') return m;
      n++; stats.word++;
      return pre + q + val + q;
    });
  }

  for (const [from, to] of RAW) {
    const c = out.split(from).length - 1;
    if (c > 0) { out = out.split(from).join(to); n += c; stats.raw += c; }
  }

  if (n) { if (!DRY) fs.writeFileSync(f, out, 'utf8'); stats.changed++; }
}

// ------------------------------------------------------------------ 插件清单 ----
let plugins = 0;
if (fs.existsSync(PLUGIN_LABELS)) {
  const labels = JSON.parse(fs.readFileSync(PLUGIN_LABELS, 'utf8'));
  for (const [id, patch] of Object.entries(labels)) {
    const p = path.join(TARGET, 'core-plugins', id, 'manifest.json');
    if (!fs.existsSync(p)) continue;
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (j.name === patch.name) continue;
    j.name = patch.name;
    if ('description' in j) j.description = patch.description;
    if (!DRY) fs.writeFileSync(p, JSON.stringify(j, null, '\t') + '\n', 'utf8');
    plugins++;
  }
}

console.log('\n=== 结果 / result ===');
console.log(`扫描 ${stats.files} 个编译文件，改动 ${stats.changed} 个`);
console.log(`整句替换 ${stats.sentence} 处 | 属性位替换 ${stats.word} 处 | 模板前缀 ${stats.raw} 处 | 插件清单 ${plugins} 个`);
console.log(`跳过：模块导出名 ${stats.guardExport} 处、对象键位置 ${stats.guardKey} 处`);
if (!DRY) {
  console.log('\n下一步：退出 LearnHarness，清空 %APPDATA%\\LearnHarness\\Cache 等缓存，再启动。');
}

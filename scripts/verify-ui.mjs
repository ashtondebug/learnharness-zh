/**
 * 逐页截图并列出残留英文 —— 用来检查汉化覆盖率。
 * 依赖 puppeteer-core（随 LearnHarness 一起安装，本脚本复用它）。
 *
 * 用法：node scripts/verify-ui.mjs [http://127.0.0.1:PORT] [输出目录]
 * 需要本机有 Chromium 内核浏览器（默认用 Edge，可用 EDGE_PATH 覆盖）。
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const standalone = process.env.LEARNHARNESS_STANDALONE
  || path.join(process.env.LOCALAPPDATA || '', 'Programs', 'learnharness', 'resources', 'server', 'standalone');
const require = createRequire(path.join(standalone, 'package.json'));
const puppeteer = require('puppeteer-core');

const BASE = process.argv[2] || 'http://127.0.0.1:3811';
const OUTDIR = process.argv[3] || path.join(HERE, '..', 'shots');
const EDGE = process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
fs.mkdirSync(OUTDIR, { recursive: true });

const BRANDS = /^(LearnHarness|Learning Harness|ChatGPT|Claude( Code)?|Anthropic|OpenAI|DeepSeek|Google|GitHub|Brave|Exa|Firecrawl|Groq|Grok|Baseten|Cerebras|Deepgram|Fireworks|Kimi|Hugging Face|Meta|Ollama|Pi|Tavily|Together|MiniMax|Moonshot|Qwen|Z\.AI|xAI|API|CLI|URL|JSON|HTML|SVG|PDF|Markdown|CSS|SDK|MCP|token)$/i;

const browser = await puppeteer.launch({
  executablePath: EDGE, headless: true,
  args: ['--no-sandbox', '--disable-gpu'], defaultViewport: { width: 1500, height: 1000 },
});
const page = await browser.newPage();

async function clickAny(labels) {
  for (const t of labels) {
    const ok = await page.evaluate((t) => {
      const els = [...document.querySelectorAll('button,a,[role="button"],[role="tab"]')];
      const hit = els.find(e => {
        const s = (e.innerText || e.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().toLowerCase();
        return s === t.toLowerCase() || s.startsWith(t.toLowerCase());
      });
      if (!hit) return false;
      hit.click(); return true;
    }, t);
    if (ok) return t;
  }
  return null;
}

const report = [];
async function snap(name) {
  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: path.join(OUTDIR, `${name}.png`) });
  const lines = await page.evaluate(() => [...new Set(document.body.innerText.split('\n').map(s => s.trim()).filter(Boolean))]);
  const en = lines.filter(l => /[A-Za-z]{3,}/.test(l) && !/[\u4e00-\u9fff]/.test(l) && !BRANDS.test(l) && l.length < 120);
  report.push(`${name}: lines=${lines.length} englishLeft=${en.length}`);
  for (const l of en.slice(0, 20)) report.push('   EN ' + JSON.stringify(l));
}

await page.goto(BASE + '/', { waitUntil: 'networkidle2', timeout: 60000 });
await snap('01-home');
if (await clickAny(['设置', 'Settings'])) {
  await snap('02-settings');
  for (const [labels, file] of [
    [['外观', 'Appearance'], '03-appearance'],
    [['代理', 'Agent'], '04-agent'],
    [['键盘', 'Keyboard'], '05-keyboard'],
    [['插件', 'Plugins'], '06-plugins'],
  ]) {
    if (await clickAny(labels)) await snap(file);
  }
  await page.keyboard.press('Escape');
}
if (await clickAny(['推理链', 'Chains'])) await snap('07-chains');

console.log(report.join('\n'));
fs.writeFileSync(path.join(OUTDIR, 'verify-report.txt'), report.join('\n'), 'utf8');
await browser.close();

import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire('C:\\Users\\kjld2\\AppData\\Local\\Programs\\learnharness\\resources\\server\\standalone\\package.json');
const puppeteer = require('puppeteer-core');

const OUT = 'C:\\Users\\kjld2\\OneDrive\\文档\\learnharness-zh\\docs\\images';
const RAW = 'C:\\Users\\kjld2\\OneDrive\\文档\\lh-zh\\raw';
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(RAW, { recursive: true });

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = process.env.BASE || 'http://127.0.0.1:3811';
const PREFIX = process.argv[2] || 'zh';
const dest = RAW; // 原始截图先落在 raw/，合成后再进 docs/images

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: true,
  args: ['--no-sandbox', '--disable-gpu', '--window-size=1500,1000', '--lang=zh-CN', '--force-device-scale-factor=1'],
  defaultViewport: { width: 1500, height: 1000, deviceScaleFactor: 1 },
});
const page = await browser.newPage();

async function clickAny(labels) {
  for (const t of labels) {
    const ok = await page.evaluate((t) => {
      const els = [...document.querySelectorAll('button,a,[role="button"],[role="tab"]')];
      const hit = els.find(e => {
        const s = (e.innerText || e.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().toLowerCase();
        const q = t.toLowerCase();
        return s === q || s.startsWith(q);
      });
      if (!hit) return false;
      hit.click();
      return true;
    }, t);
    if (ok) return t;
  }
  return null;
}
async function shot(name) {
  await new Promise(r => setTimeout(r, 1100));
  await page.screenshot({ path: path.join(dest, `${PREFIX}-${name}.png`) });
  console.log(`shot ${PREFIX}-${name}.png`);
}

await page.goto(BASE + '/', { waitUntil: 'networkidle2', timeout: 60000 });
await shot('home');

const settings = await clickAny(['设置', 'Settings']);
console.log('settings:', settings);
if (settings) {
  await shot('settings');
  const app = await clickAny(['外观', 'Appearance']);
  console.log('appearance:', app);
  if (app) await shot('appearance');
  const agent = await clickAny(['代理', 'Agent']);
  console.log('agent:', agent);
  if (agent) await shot('agent');
  await page.keyboard.press('Escape');
}
await browser.close();
console.log('done', PREFIX);

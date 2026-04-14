import puppeteer from '/home/keisukeshima/.nvm/versions/node/v24.7.0/lib/node_modules/@mermaid-js/mermaid-cli/node_modules/puppeteer/lib/esm/puppeteer/puppeteer.js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const config = JSON.parse(readFileSync(resolve(root, 'examples/sample-config.json'), 'utf8'));

const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});

const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 2 });

const fileUrl = `file://${resolve(root, 'wbs-planner.html')}`;
await page.goto(fileUrl, { waitUntil: 'networkidle0' });

await page.evaluate((cfg) => {
  localStorage.setItem('gantt-gen-cfg', JSON.stringify(cfg));
}, config);

await page.reload({ waitUntil: 'networkidle0' });

await page.waitForSelector('#gantt rect', { timeout: 10000 });
await new Promise(r => setTimeout(r, 500));

// #preview の overflow を外してコンテンツ全体をビューポートに展開
const contentHeight = await page.evaluate(() => {
  const preview = document.getElementById('preview');
  preview.style.overflow = 'visible';
  preview.style.height = 'auto';
  document.body.style.height = 'auto';
  document.body.style.overflow = 'visible';
  return document.getElementById('export-area').scrollHeight;
});

await page.setViewport({ width: 1600, height: contentHeight + 200, deviceScaleFactor: 2 });
await new Promise(r => setTimeout(r, 300));

const area = await page.$('#export-area');
if (!area) throw new Error('#export-area not found');

await area.screenshot({
  path: resolve(root, 'screenshots/gantt-chart.png'),
  type: 'png',
});

console.log('✅ screenshots/gantt-chart.png を生成しました');
await browser.close();

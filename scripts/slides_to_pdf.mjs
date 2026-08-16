import { resolve } from 'node:path';
import puppeteer from 'puppeteer-core';

const HTML_PATH = resolve('F:/代码文件/vibe coder/无界应用-教育智能体/初赛提交材料/方案PPT.html');
const PDF_PATH = resolve('F:/代码文件/vibe coder/无界应用-教育智能体/初赛提交材料/方案PPT.pdf');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--force-device-scale-factor=1'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1454, height: 817 });
await page.goto('file://' + HTML_PATH, { waitUntil: 'networkidle2', timeout: 60000 });
// Wait for webfonts + images to fully load before printing
await page.evaluate(async () => {
  await document.fonts.ready;
  const imgs = Array.from(document.images);
  await Promise.all(imgs.map(i => i.complete ? Promise.resolve() : new Promise(r => { i.onload = i.onerror = r; })));
});
await new Promise(r => setTimeout(r, 800));
await page.pdf({
  path: PDF_PATH,
  printBackground: true,
  preferCSSPageSize: true,
});
await browser.close();
console.log('PDF saved:', PDF_PATH);

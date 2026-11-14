import { readFileSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = join(root, 'dist');
const read = file => readFileSync(join(dist, file), 'utf8');
const mime = { '.webp': 'webp', '.jpg': 'jpeg', '.jpeg': 'jpeg', '.png': 'png', '.avif': 'avif' };
const dataURL = file => `data:image/${mime[extname(file)]};base64,${readFileSync(join(dist, file)).toString('base64')}`;

function replace(html, token, replacement) {
  if (!html.includes(token)) throw new Error(`Preview: index.html template changed at ${token}`);
  return html.replace(token, () => replacement);
}

const catalog = JSON.parse(read('data/catalog.json'));
const embedded = new Map();
for (const { image } of catalog.objects) {
  if (!image?.file.startsWith('assets/objects/')) continue;
  if (!embedded.has(image.file)) embedded.set(image.file, dataURL(image.file));
  image.file = embedded.get(image.file);
}
const data = JSON.stringify(catalog).replace(/</g, '\\u003c');
const styles = read('styles.css');
const app = read('app.js');
if (/<\/style/i.test(styles) || /<\/script/i.test(app)) {
  throw new Error('Preview: styles or app contain a closing HTML tag that cannot be inlined.');
}
let page = read('index.html');
page = replace(page, '<link rel="manifest" href="./app.webmanifest">', '');
page = replace(page, '<link rel="apple-touch-icon" href="./assets/icons/apple-touch-icon.png">',
  `<link rel="icon" href="${dataURL('assets/icons/atlas-192.png')}">`);
page = replace(page, '<link rel="stylesheet" href="./styles.css">', `<style>\n${styles}\n</style>`);
page = replace(page, '<script src="./pwa.js" defer></script>', '');
page = replace(page, '<script type="module" src="./app.js"></script>',
  `<script type="application/json" id="atlas-embedded-catalog">${data}</script>\n<script type="module">\n${app}\n</script>`);

const output = process.argv[2] || join(root, 'space-atlas-preview.html');
writeFileSync(output, page);
console.log(`미리보기 생성 · ${output} · 로컬 이미지 파일 ${embedded.size}`);

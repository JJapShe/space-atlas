import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const imageDir = join(root, 'dist/assets/objects');
const maxBytes = 8 * 1024 * 1024;
const idPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const imageTypes = {
  'image/png': ['png', bytes => bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))],
  'image/jpeg': ['jpg', bytes => bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]))],
  'image/webp': ['webp', bytes => bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP'],
  'image/avif': ['avif', bytes => bytes.toString('ascii', 4, 8) === 'ftyp' && ['avif', 'avis'].includes(bytes.toString('ascii', 8, 12))]
};

function secureUrl(address) {
  const url = new URL(address);
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('HTTPS 주소를 사용하세요.');
  return url;
}

async function fetchImage(address) {
  const signal = AbortSignal.timeout(20_000);
  let url = secureUrl(address);
  for (let redirects = 0; redirects <= 4; redirects += 1) {
    const response = await fetch(url, { redirect: 'manual', signal });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      await response.body?.cancel();
      const next = response.headers.get('location');
      if (!next) throw new Error('리디렉션 주소가 없습니다.');
      url = secureUrl(new URL(next, url));
      continue;
    }
    try {
      const mime = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
      const format = Object.hasOwn(imageTypes, mime) ? imageTypes[mime] : null;
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      if (!format) throw new Error(`지원하지 않는 이미지 형식: ${mime || '없음'}`);
      if (Number(response.headers.get('content-length')) > maxBytes) throw new Error('이미지가 8 MiB를 넘습니다.');
      if (!response.body) throw new Error('이미지 내용이 없습니다.');

      const chunks = [];
      let size = 0;
      for await (const chunk of response.body) {
        size += chunk.length;
        if (size > maxBytes) throw new Error('이미지가 8 MiB를 넘습니다.');
        chunks.push(chunk);
      }
      const bytes = Buffer.concat(chunks);
      const [extension, matches] = format;
      if (!matches(bytes)) throw new Error('응답 형식과 이미지 내용이 일치하지 않습니다.');
      return { bytes, extension };
    } catch (error) {
      if (response.body && !response.body.locked) await response.body.cancel().catch(() => {});
      throw error;
    }
  }
  throw new Error('리디렉션이 너무 많습니다.');
}

async function readManifest(name) {
  const path = join(root, 'content', name);
  try {
    const images = JSON.parse((await readFile(path, 'utf8')).replace(/^\uFEFF/, ''));
    return { path, images };
  } catch (error) {
    if (name === 'gallery.json' && error.code === 'ENOENT') return { path, images: {} };
    throw error;
  }
}

async function prepareManifest(manifest, records, usedFiles, downloaded) {
  const remote = records.filter(({ image }) => typeof image?.file === 'string' && image.file.startsWith('https://'));
  let localCount = 0;
  let failCount = 0;
  for (const { id, basename, image } of remote) {
    try {
      if (!idPattern.test(id) || !['photo', 'processed', 'illustration'].includes(image.kind)
        || !['sourceUrl', 'originalUrl', 'licenseUrl'].every(field => secureUrl(image[field]))
        || !['credit', 'license', 'checkedAt'].every(field => image[field]?.trim())) {
        throw new Error('이미지 ID와 출처·이용 조건을 확인하세요.');
      }
      const address = image.file;
      let file = downloaded.get(address);
      if (!file) {
        const { bytes, extension } = await fetchImage(address);
        const suffix = usedFiles.has(`assets/objects/${basename}.${extension}`)
          ? `-${createHash('sha256').update(bytes).digest('hex').slice(0, 12)}`
          : '';
        const filename = `${basename}${suffix}.${extension}`;
        const target = join(imageDir, filename);
        const temporary = `${target}.${process.pid}.tmp`;
        await writeFile(temporary, bytes);
        await rename(temporary, target);
        file = `assets/objects/${filename}`;
        usedFiles.add(file);
        downloaded.set(address, file);
      }
      image.file = file;
      localCount += 1;
      console.log(`${basename} · ${file}`);
    } catch (error) {
      failCount += 1;
      console.error(`${basename} · ${error.message}`);
    }
  }
  if (localCount > 0) {
    const temporary = `${manifest.path}.${process.pid}.tmp`;
    await writeFile(temporary, `${JSON.stringify(manifest.images, null, 2)}\n`);
    await rename(temporary, manifest.path);
  }
  return { localCount, failCount };
}

async function main() {
  const [representatives, gallery] = await Promise.all([readManifest('images.json'), readManifest('gallery.json')]);
  const primary = Object.entries(representatives.images).map(([id, image]) => ({ id, basename: id, image }));
  const additional = Object.entries(gallery.images).flatMap(([id, images]) =>
    images.map((image, index) => ({ id, basename: `${id}--${index + 1}`, image })));
  const usedFiles = new Set([...primary, ...additional].map(({ image }) => image?.file));
  await mkdir(imageDir, { recursive: true });
  const downloaded = new Map();
  const primaryResult = await prepareManifest(representatives, primary, usedFiles, downloaded);
  const galleryResult = await prepareManifest(gallery, additional, usedFiles, downloaded);
  const localCount = primaryResult.localCount + galleryResult.localCount;
  const failCount = primaryResult.failCount + galleryResult.failCount;
  console.log(`이미지 등록 · 기기 저장 가능 ${localCount} · 온라인 전용 유지 ${failCount}`);
  if (localCount > 0) console.log('node scripts/build.mjs를 실행해 도감과 오프라인 버전을 갱신하세요.');
  if (failCount > 0) process.exitCode = 1;
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});

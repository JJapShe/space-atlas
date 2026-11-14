import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const content = join(root, 'content');
const dist = join(root, 'dist');
const slug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const workerMarker = /^const CACHE_VERSION = '(?:development|[a-f0-9]{16})';$/m;
const imageKinds = new Set(['photo', 'processed', 'illustration', 'ai-illustration']);
const localImage = /^assets\/objects\/[a-z0-9][a-z0-9_-]*\.(?:webp|jpe?g|png|avif)$/;

function check(condition, context, message) {
  if (!condition) throw new Error(`${context} — ${message}`);
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nonempty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function text(value, context) {
  check(nonempty(value), context, '빈 문자열이나 누락된 값이 있습니다.');
}

function list(value, context) {
  check(Array.isArray(value), context, '배열이어야 합니다.');
  return value;
}

function texts(value, context) {
  list(value, context).forEach((entry, index) => text(entry, `${context}[${index}]`));
}

function https(value, context) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${context} — 유효한 HTTPS URL을 입력하세요.`);
  }
  check(url.protocol === 'https:' && !url.username && !url.password, context, '유효한 HTTPS URL을 입력하세요.');
}

function entries(value, context) {
  check(isRecord(value), context, 'JSON 객체여야 합니다.');
  return Object.entries(value);
}

function readJSON(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''));
  } catch (error) {
    throw new Error(`${path} — ${error.message}`);
  }
}

function register(records, items, context) {
  for (const item of list(items, context)) {
    const id = item?.id;
    check(isRecord(item) && slug.test(id ?? ''), context, `잘못된 ID: ${id}`);
    check(!records.has(id), context, `중복 ID: ${id}`);
    text(item.name, `${context}/${id}.name`);
    records.set(id, item);
  }
}

function mergeSources(sources, part, filename) {
  for (const [id, source] of entries(part, `${filename}.sources`)) {
    const context = `${filename}.sources.${id}`;
    check(isRecord(source) && slug.test(id), context, '유효한 출처 ID와 객체가 필요합니다.');
    text(source.name, `${context}.name`);
    https(source.url, `${context}.url`);
    check(!sources.has(id) || sources.get(id).url === source.url, context, '같은 출처 ID가 다른 URL을 가리킵니다.');
    if (!sources.has(id)) sources.set(id, source);
  }
}

function sourceList(ids, sources, context) {
  texts(ids, context);
  check(ids.length > 0, context, '공식 출처를 한 개 이상 연결하세요.');
  check(new Set(ids).size === ids.length, context, '중복 출처 ID가 있습니다.');
  for (const id of ids) check(sources.has(id), context, `등록되지 않은 출처: ${id}`);
}

function validateDetail(item, sources) {
  const context = item.id;
  text(item.en, `${context}.en`);
  texts(item.aliases, `${context}.aliases`);
  text(item.intro, `${context}.intro`);
  text(item.prompt, `${context}.prompt`);
  sourceList(item.sources, sources, `${context}.sources`);
  const facts = list(item.facts, `${context}.facts`);
  check(facts.length >= 2, context, '기본 또는 심화 정보가 두 개 이상 필요합니다.');
  const labels = new Set();
  for (const [index, fact] of facts.entries()) {
    const factPath = `${context}.facts[${index}]`;
    check(isRecord(fact), factPath, 'JSON 객체여야 합니다.');
    text(fact.label, `${factPath}.label`);
    text(fact.value, `${factPath}.value`);
    check(!labels.has(fact.label), factPath, `중복 항목: ${fact.label}`);
    labels.add(fact.label);
    check(sources.has(fact.source), factPath, `등록되지 않은 출처: ${fact.source}`);
    for (const key of ['detail', 'estimated']) {
      check(fact[key] === undefined || typeof fact[key] === 'boolean', factPath, `${key}은(는) 불리언이어야 합니다.`);
    }
  }
  item.sources = [...new Set([...item.sources, ...facts.map(fact => fact.source)])];
}

function validateImage(image, id) {
  const context = `images.${id}`;
  check(isRecord(image) && imageKinds.has(image.kind), context, '지원하지 않는 이미지 종류입니다.');
  for (const key of ['file', 'caption', 'credit', 'license', 'alt', 'changes', 'checkedAt']) {
    text(image[key], `${context}.${key}`);
  }
  const checkedDate = new Date(image.checkedAt);
  check(/^\d{4}-\d{2}-\d{2}$/.test(image.checkedAt) && Number.isFinite(checkedDate.getTime())
    && checkedDate.toISOString().slice(0, 10) === image.checkedAt,
  context, 'checkedAt은 실제 확인일(YYYY-MM-DD)이어야 합니다.');

  const local = localImage.test(image.file);
  if (local) {
    const asset = join(dist, image.file);
    check(existsSync(asset) && readFileSync(asset).length > 0, context, `대표 이미지 파일을 찾을 수 없습니다: ${image.file}`);
  } else {
    https(image.file, `${context}.file`);
  }

  if (image.kind === 'ai-illustration') {
    check(local, context, 'AI 상상도는 프로젝트 내부 파일이어야 합니다.');
    text(image.generator, `${context}.generator`);
    text(image.generationPrompt, `${context}.generationPrompt`);
    for (const key of ['sourceUrl', 'licenseUrl', 'originalUrl']) {
      if (image[key] != null) https(image[key], `${context}.${key}`);
    }
  } else {
    for (const key of ['sourceUrl', 'licenseUrl', 'originalUrl']) https(image[key], `${context}.${key}`);
  }
  return local;
}

function writeAtomically(path, value) {
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, value);
  renameSync(temporary, path);
}

function build({ verifyOnly }) {
  const structure = readJSON(join(content, 'structure.json'));
  const images = readJSON(join(content, 'images.json'));
  const shards = readdirSync(content).filter(filename => filename.endsWith('.json')
    && !['structure.json', 'images.json'].includes(filename)).sort();
  check(shards.length > 0, 'content', '천체 데이터를 한 파일 이상 작성하세요.');
  const sources = new Map();
  const categories = new Map();
  const regions = new Map();
  const objects = new Map();
  const phenomena = new Map();
  const relations = [...list(structure.relations ?? [], 'structure.relations')];

  register(categories, structure.categories, 'structure.categories');
  register(regions, structure.regions, 'structure.regions');
  register(phenomena, structure.phenomena, 'structure.phenomena');
  mergeSources(sources, structure.sources, 'structure.json');
  for (const filename of shards) {
    const part = readJSON(join(content, filename));
    register(objects, part.objects, `${filename}.objects`);
    relations.push(...list(part.relations, `${filename}.relations`));
    mergeSources(sources, part.sources, filename);
  }

  for (const category of categories.values()) {
    text(category.summary, `${category.id}.summary`);
    if (category.aliases !== undefined) texts(category.aliases, `${category.id}.aliases`);
    texts(category.traits, `${category.id}.traits`);
    check(category.traits.length >= 2, category.id, '분류의 특징을 두 가지 이상 적으세요.');
    sourceList(category.sources, sources, `${category.id}.sources`);
    check([...objects.values()].some(item => item.category === category.id), category.id, '연결된 천체가 없습니다.');
  }
  for (const region of regions.values()) {
    text(region.summary, `${region.id}.summary`);
    sourceList(region.sources, sources, `${region.id}.sources`);
    texts(region.objects, `${region.id}.objects`);
    check(new Set(region.objects).size === region.objects.length, region.id, '지역에 천체가 중복되었습니다.');
    for (const id of region.objects) {
      const item = objects.get(id);
      check(item, region.id, `존재하지 않는 천체: ${id}`);
      check(!item.region || item.region === region.id, region.id, `${id}의 region과 서로 다릅니다.`);
      item.region = region.id;
    }
  }
  for (const item of objects.values()) {
    validateDetail(item, sources);
    check(categories.has(item.category), item.id, `등록되지 않은 분류: ${item.category}`);
    if (item.region) {
      const region = regions.get(item.region);
      check(region, item.id, `등록되지 않은 지역: ${item.region}`);
      if (!region.objects.includes(item.id)) region.objects.push(item.id);
    }
    check(item.image === undefined, item.id, '이미지 정보는 content/images.json에 등록하세요.');
  }
  for (const item of phenomena.values()) {
    check(!objects.has(item.id), item.id, '천체와 밤하늘 현상에 같은 ID를 사용할 수 없습니다.');
    text(item.summary, `${item.id}.summary`);
    validateDetail(item, sources);
  }

  const edges = new Set();
  for (const relation of relations) {
    check(isRecord(relation), 'relations', '관계는 JSON 객체여야 합니다.');
    const { from, to, forward, reverse } = relation;
    const context = `relations ${from} → ${to}`;
    check(from !== to, context, '자기 자신과 연결할 수 없습니다.');
    for (const id of [from, to]) check(objects.has(id) || phenomena.has(id), context, `존재하지 않는 천체 또는 현상: ${id}`);
    text(forward, `${context}.forward`);
    text(reverse, `${context}.reverse`);
    const edge = [from, to].sort().join('/');
    check(!edges.has(edge), context, '같은 천체 쌍을 양쪽에 중복 등록하지 마세요.');
    edges.add(edge);
  }

  const localAssets = new Set();
  let localCount = 0;
  let remoteCount = 0;
  for (const [id, image] of entries(images, 'images.json')) {
    const item = objects.get(id);
    check(item, `images.${id}`, '존재하지 않는 천체의 이미지입니다.');
    if (validateImage(image, id)) {
      localAssets.add(image.file);
      localCount += 1;
    } else {
      remoteCount += 1;
    }
    item.image = image;
  }

  const catalog = {
    categories: [...categories.values()],
    regions: [...regions.values()],
    phenomena: [...phenomena.values()],
    objects: [...objects.values()],
    relations,
    sources: Object.fromEntries(sources)
  };
  const files = ['index.html', 'app.js', 'styles.css', 'pwa.js', 'app.webmanifest',
    'assets/icons/atlas-192.png', 'assets/icons/atlas-512.png', 'assets/icons/apple-touch-icon.png',
    ...localAssets].sort();
  const workerFile = join(dist, 'sw.js');
  const worker = readFileSync(workerFile, 'utf8');
  check(workerMarker.test(worker), 'dist/sw.js', '서비스 워커의 CACHE_VERSION 선언을 확인하세요.');
  const canonicalWorker = worker.replace(workerMarker, "const CACHE_VERSION = 'development';");
  const digest = createHash('sha256').update(JSON.stringify(catalog)).update('\0').update(canonicalWorker);
  for (const filename of files) {
    digest.update('\0').update(filename).update('\0').update(readFileSync(join(dist, filename)));
  }
  const cacheVersion = digest.digest('hex').slice(0, 16);
  if (!verifyOnly) {
    mkdirSync(join(dist, 'data'), { recursive: true });
    writeAtomically(join(dist, 'data/catalog.json'), JSON.stringify({ ...catalog, cacheVersion }));
    const nextWorker = canonicalWorker.replace(workerMarker, `const CACHE_VERSION = '${cacheVersion}';`);
    if (worker !== nextWorker) writeAtomically(workerFile, nextWorker);
  }
  const missing = catalog.objects.length - localCount - remoteCount;
  console.log(`${verifyOnly ? '검사' : '빌드'} 완료 · 천체 ${catalog.objects.length} · 분류 ${categories.size} · 지역 ${regions.size} · 현상 ${phenomena.size} · 관계 ${relations.length}`);
  console.log(`대표 이미지 · 오프라인 ${localCount} · 온라인 전용 ${remoteCount} · 미등록 ${missing} · 캐시 ${cacheVersion}`);
}

try {
  build({ verifyOnly: process.argv.includes('--check') });
} catch (error) {
  console.error(`도감 빌드 실패 · ${error.message}`);
  process.exitCode = 1;
}

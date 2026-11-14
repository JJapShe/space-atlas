const main = document.querySelector('#main-content');
const queryInput = document.querySelector('#site-query');
const announcement = document.querySelector('#announcement');
const offlineStatus = document.querySelector('#offline-status');
const embeddedCatalog = document.getElementById('atlas-embedded-catalog');
const scrollPositions = new Map();
const favoriteKey = 'space-atlas:favorites';
const favoriteIds = readFavorites();

let data;
let catalog;
let categories;
let regions;
let phenomena;
let activeHash;
let previousView;

const types = {
  observation: '관측 이미지', photograph: '촬영 이미지', photo: '촬영 이미지', processed: '관측 이미지 재구성',
  composite: '관측 이미지 합성', 'spacecraft-photo': '탐사선 촬영', 'telescope-observation': '망원경 관측',
  illustration: '상상도', 'official-illustration': '상상도', 'artist-illustration': '상상도',
  'ai-illustration': 'AI 상상도', ai: 'AI 상상도', reconstruction: '관측으로 재구성',
  diagram: '설명 그림', map: '지도'
};

const planetIds = ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'];
const planetColors = ['#a7a5aa', '#d4aa74', '#81b8f5', '#e68e63', '#cda783', '#e8ca92', '#86d4dc', '#6d96ef'];
const comparisons = {
  size: {
    heading: '크기 비교', unit: '평균 지름', note: '같은 비율로 그린 원의 지름을 비교해요.',
    measurement: 'diameterKm',
    source: 'https://ssd.jpl.nasa.gov/planets/phys_par.html'
  },
  distance: {
    heading: '거리 비교', unit: '태양까지의 평균 거리', note: '막대 길이는 태양에서 각 행성까지의 평균 거리에 비례해요.',
    measurement: 'solarDistanceKm',
    source: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/'
  }
};

function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function readFavorites() {
  try {
    const ids = JSON.parse(localStorage.getItem(favoriteKey));
    return new Set(Array.isArray(ids) ? ids : []);
  } catch {
    return new Set();
  }
}

function route() {
  const [path = '', query = ''] = location.hash.slice(1).split('?');
  const [view = '', id = ''] = path.split('/');
  return { view: view || 'home', id, params: new URLSearchParams(query) };
}

function navigate(hash) {
  if (location.hash === hash) return;
  scrollPositions.set(activeHash, window.scrollY);
  location.hash = hash;
}

function catalogHash(query = '', region = '', category = '') {
  const params = new URLSearchParams();
  if (query) params.set('q', query);
  if (region) params.set('region', region);
  const suffix = params.toString() ? `?${params}` : '';
  return `#${category ? `category/${category}` : 'catalog'}${suffix}`;
}

function makeIndex(entries) {
  return new Map((Array.isArray(entries) ? entries : Object.values(entries || {})).map(entry => [entry.id, entry]));
}

function source(id) {
  return Array.isArray(data.sources) ? data.sources.find(item => item.id === id) : data.sources?.[id];
}

function externalLink(url, label) {
  if (!/^https:\/\//i.test(url || '')) return escapeHTML(label);
  return `<a href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer">${escapeHTML(label)} <span aria-hidden="true">↗</span></a>`;
}

function sourceLink(id) {
  const entry = source(id);
  return entry ? externalLink(entry.url, entry.name || entry.title) : '';
}

function categoryName(id) {
  return categories.get(id)?.name || '';
}

function imageType(image) {
  const type = image.kind || image.type;
  return image.kindLabel || image.typeLabel || types[type] || (type?.includes('-') ? '천체 이미지' : type) || '천체 이미지';
}

function imagePath(file) {
  const asset = /^(?:(?:\.\/)?assets\/|https:\/\/)/.test(file || '');
  const embeddedAsset = embeddedCatalog && /^data:image\/(?:webp|png|jpeg|avif);base64,/.test(file || '');
  return asset || embeddedAsset ? file : '';
}

function imageFile(item) {
  return imagePath(item?.image?.file) || imagePath(item?.image?.remoteFile);
}

function remoteOnly(item) {
  return imageFile(item).startsWith('https://');
}

function featuredObject(items) {
  return items.find(item => imageFile(item) && !remoteOnly(item)) || items.find(imageFile) || items[0];
}

function schematic(item) {
  const color = item.id === 'sun' ? '#ffd58c' : planetColors[planetIds.indexOf(item.id)];
  return `<div class="schematic" data-category="${escapeHTML(item.category)}" data-object="${escapeHTML(item.id)}"${color ? ` style="--schematic-color:${color}"` : ''} aria-hidden="true">
    <span class="schematic-body"></span>
  </div>`;
}

function visual(item, layout = 'card', image = item.image, imageIndex) {
  const file = imageFile({ image });
  const eager = ['hero', 'detail', 'enlarged'].includes(layout);
  const remote = imagePath(image?.remoteFile);
  const fallback = remote && remote !== file ? ` data-remote="${escapeHTML(remote)}"` : '';
  const schematicLabel = item.id === 'sun' || planetIds.includes(item.id) ? '태양계 개념 그림' : '천체 분류 그림';
  return `<figure class="object-visual visual-${layout}">
    ${schematic(item)}
    ${file ? `<img src="${escapeHTML(file)}"${fallback} alt="${escapeHTML(image.alt || item.name)}" loading="${eager ? 'eager' : 'lazy'}" decoding="async"${layout === 'hero' ? ' fetchpriority="high"' : ''}>` : ''}
    ${file && imageIndex !== undefined ? `<button class="photo-expand" type="button" data-image-index="${imageIndex}" aria-haspopup="dialog" aria-label="${escapeHTML(image.alt || item.name)} 이미지 크게 보기"><span>⛶ 크게 보기</span></button>` : ''}
    <figcaption class="visual-caption">
      <span class="schematic-label visual-type">${schematicLabel}</span><span class="photo-status schematic-label">${file ? '' : '사진 자료 없음'}</span>
      ${file ? `<span class="photo-label visual-type">${escapeHTML(imageType(image))}${file.startsWith('https://') ? ' · 인터넷 필요' : ''}</span>${image.credit ? `<span class="photo-label visual-credit">${escapeHTML(image.credit)}</span>` : ''}` : ''}
    </figcaption>
  </figure>`;
}

function favoriteButton(item, layout = 'card') {
  const saved = favoriteIds.has(item.id);
  return `<button type="button" class="favorite-button favorite-${layout}" data-favorite="${escapeHTML(item.id)}" aria-label="${escapeHTML(item.name)} 즐겨찾기" aria-pressed="${saved}"><span aria-hidden="true">${saved ? '♥' : '♡'}</span>${layout === 'detail' ? '<span>즐겨찾기</span>' : ''}</button>`;
}

function objectCard(item) {
  return `<article class="object-card">
    <a href="#object/${escapeHTML(item.id)}" class="object-link">
      ${visual(item)}
      <div class="card-copy"><span class="card-category">${escapeHTML(categoryName(item.category))}</span><h3>${escapeHTML(item.name)} <span aria-hidden="true">↗</span></h3><p>${escapeHTML(item.intro)}</p></div>
    </a>
    ${favoriteButton(item)}
  </article>`;
}

function cardGrid(items, message = '아직 이곳에 등록된 천체가 없어요.') {
  return items.length ? `<div class="object-grid">${items.map(objectCard).join('')}</div>` : `<p class="empty-state">${escapeHTML(message)}</p>`;
}

function categoryCards() {
  return [...categories.values()].map(entry => {
    const first = featuredObject([...catalog.values()].filter(item => item.category === entry.id));
    return `<article class="category-card"><a href="#category/${escapeHTML(entry.id)}">
      ${visual(first)}
      <div class="category-card-copy"><h3>${escapeHTML(entry.name)} <span aria-hidden="true">↗</span></h3><p>${escapeHTML(entry.summary)}</p></div>
    </a></article>`;
  }).join('');
}

function home() {
  const preferred = ['saturn', 'jupiter', 'carina-nebula', 'earth'].map(id => catalog.get(id)).filter(Boolean);
  const feature = featuredObject([...preferred, ...catalog.values()]);
  return `<section class="hero">
    <div class="hero-copy">
      <p class="hero-eyebrow">어린이 우주 도감</p>
      <h1>우주를<br>펼쳐 봐요.</h1>
      <p>태양계의 행성부터 먼 은하까지,<br>관측 사진을 따라 우주를 탐험해요.</p>
      <div class="hero-actions"><a class="button button-primary" href="#solar">태양계 탐험 <span aria-hidden="true">→</span></a><a class="button button-secondary" href="#catalog">천체 도감 <span aria-hidden="true">↗</span></a></div>
    </div>
    ${feature ? `<a class="hero-feature" href="#object/${escapeHTML(feature.id)}" aria-label="${escapeHTML(feature.name)} 자세히 보기">${visual(feature, 'hero')}<span class="hero-object-name">${escapeHTML(feature.name)} <span aria-hidden="true">↗</span></span></a>` : '<div class="hero-feature missing-visual" aria-hidden="true"><span class="placeholder-orbit"></span></div>'}
  </section>
  <section class="home-solar"><div class="section-heading"><h2>태양계부터 출발해요</h2><a href="#solar">태양계 탐험 <span aria-hidden="true">→</span></a></div>${mapPanel()}</section>
  <section class="home-categories"><div class="section-heading"><h2>어떤 천체가 궁금해요?</h2><a href="#catalog">전체 천체 도감 <span aria-hidden="true">→</span></a></div><div class="category-grid">${categoryCards()}</div></section>`;
}

function searchKey(value) {
  return String(value || '').normalize('NFKC').toLocaleLowerCase().replace(/[\s·._\-–—]/g, '');
}

function searchTerms(item) {
  const category = categories.get(item.category);
  const region = regions.get(item.region);
  return [item.name, item.en, ...(item.aliases || []), category?.name, ...(category?.aliases || []), region?.name].map(searchKey);
}

function regionContains(region, item) {
  if (!region) return true;
  if (region.id === 'outside-solar') return !solarMember(item);
  if (item.region === region.id || region.objects?.includes(item.id)) return true;
  if (/^(solar|solar-system)$/.test(region.id)) return solarMember(item);
  return false;
}

function catalogView(current) {
  const category = current.view === 'category' ? categories.get(current.id) : null;
  if (current.view === 'category' && !category) return missingPage();
  const rawQuery = current.params.get('q') || '';
  const query = searchKey(rawQuery);
  const selectedRegion = current.params.get('region') || '';
  const regionFilters = [{ id: 'solar', name: '태양계' }, { id: 'outside-solar', name: '태양계 밖' }, ...regions.values()];
  const region = regionFilters.find(entry => entry.id === selectedRegion);
  const matches = [...catalog.values()].filter(item => (!category || item.category === category.id) && regionContains(region, item) && (!query || searchTerms(item).some(term => term.includes(query))));
  const matchingPhenomena = !category && !selectedRegion ? [...phenomena.values()].filter(item => !query || searchTerms(item).some(term => term.includes(query))) : [];
  const feature = category && featuredObject([...catalog.values()].filter(item => item.category === category.id));
  const filters = [{ id: '', name: '모두' }, ...categories.values()].map(entry => `<a href="${escapeHTML(catalogHash(rawQuery, selectedRegion, entry.id))}" class="filter-chip"${(category?.id || '') === entry.id ? ' aria-current="page"' : ''}>${escapeHTML(entry.name)}</a>`).join('');
  return `<section class="page-intro${feature ? ' category-intro' : ''}"><div><h1>${escapeHTML(category?.name || '천체 도감')}</h1>
    <p>${escapeHTML(category?.summary || '이름으로 찾거나 궁금한 천체 종류를 골라요.')}</p>
    ${category?.traits?.length ? `<ul class="traits">${category.traits.map(trait => `<li>${escapeHTML(trait)}</li>`).join('')}</ul>` : ''}</div>
    ${feature ? `<a class="category-feature" href="#object/${escapeHTML(feature.id)}" aria-label="${escapeHTML(feature.name)} 자세히 보기">${visual(feature)}<span class="hero-object-name">${escapeHTML(feature.name)} <span aria-hidden="true">↗</span></span></a>` : ''}</section>
    <section aria-label="천체 필터와 결과">
      <nav class="filter-chips" aria-label="천체 종류">${filters}</nav>
      <div class="results-bar"><p>${rawQuery ? `<strong>‘${escapeHTML(rawQuery)}’</strong> 검색 · ` : ''}<strong>${matches.length}</strong>개 천체${rawQuery ? ` <a href="${escapeHTML(catalogHash('', selectedRegion, category?.id))}">검색 지우기</a>` : ''}</p>
      <label for="region-filter">지역 <select id="region-filter"><option value="">모든 지역</option>${regionFilters.map(entry => `<option value="${escapeHTML(entry.id)}"${selectedRegion === entry.id ? ' selected' : ''}>${escapeHTML(entry.name)}</option>`).join('')}</select></label></div>
      ${matches.length || !matchingPhenomena.length ? cardGrid(matches, '찾는 천체가 없어요. 다른 이름이나 종류로 찾아봐요.') : ''}
    </section>
    ${matchingPhenomena.length ? `<section class="linked-section"><h2>밤하늘과 현상</h2><div class="relation-list">${matchingPhenomena.map(item => `<a href="#phenomenon/${escapeHTML(item.id)}">${escapeHTML(item.name)} <span aria-hidden="true">↗</span></a>`).join('')}</div></section>` : ''}`;
}

function solarMember(item) {
  const within = entry => entry && !/outside|beyond|galaxy|exoplanet/.test(entry.id) && !/태양계 밖|은하/.test(entry.name);
  return Boolean(planetIds.includes(item.id) || item.id === 'sun' || within(regions.get(item.region)) || [...regions.values()].some(entry => within(entry) && entry.objects?.includes(item.id)) || (data.relations || []).some(relation => relation.from === 'sun' && relation.to === item.id));
}

function solarNode(item, index) {
  const color = index === -1 ? '#ffd58c' : planetColors[index];
  const moons = linksFor(item.id).filter(link => /moon|satellite/.test(link.entry.category) || /위성/.test(categoryName(link.entry.category)));
  return `<li class="solar-node" style="--planet-color:${color || '#a7bed0'}">
    <a href="#object/${escapeHTML(item.id)}" class="solar-node-link"><span class="planet-dot planet-${escapeHTML(item.id)}" aria-hidden="true"></span><strong>${escapeHTML(item.name)}</strong><span aria-hidden="true">↗</span></a>
    ${moons.length ? `<details class="moon-links"><summary>위성 ${moons.length}</summary><div>${moons.map(link => `<a href="#object/${escapeHTML(link.entry.id)}">${escapeHTML(link.entry.name)}</a>`).join('')}</div></details>` : ''}
  </li>`;
}

function regionFor(pattern) {
  return [...regions.values()].find(entry => pattern.test(`${entry.id} ${entry.name}`));
}

function mapRegion(entry, id, fallback) {
  const content = `<span class="region-icon" data-region="${id}" aria-hidden="true"></span><strong>${escapeHTML(entry?.name || fallback)}</strong>`;
  return `<li class="region-point">${entry ? `<a href="#region/${escapeHTML(entry.id)}">${content}</a>` : `<span>${content}</span>`}</li>`;
}

function comparisonPanel(mode) {
  const entry = comparisons[mode];
  const items = planetIds.map(id => catalog.get(id)).filter(item => item?.measurements?.[entry.measurement] > 0);
  if (!items.length) return '';
  const maximum = Math.max(...items.map(item => item.measurements[entry.measurement]));
  return `<section class="comparison-panel" id="comparison-panel" aria-labelledby="compare-heading"><h2 id="compare-heading">${entry.unit}</h2><p>${entry.note}</p>
    <div class="comparison-items ${mode}">${items.map(item => {
      const amount = item.measurements[entry.measurement];
      const value = mode === 'distance' ? `${Number((amount / 149597870.7).toFixed(2))} AU` : `${Math.round(amount).toLocaleString('ko-KR')} km`;
      return `<a href="#object/${escapeHTML(item.id)}" class="comparison-item"><span class="comparison-graphic ${mode}" aria-hidden="true" style="--proportion:${100 * amount / maximum}%;--planet-color:${planetColors[planetIds.indexOf(item.id)]}"><span></span></span><strong>${escapeHTML(item.name)}</strong><span>약 ${value}</span></a>`;
    }).join('')}</div>
    ${mode === 'distance' ? '<p class="comparison-unit">1 AU는 태양과 지구 사이의 평균 거리를 나타내는 데 쓰는 단위예요.</p>' : ''}<p class="comparison-source">${externalLink(entry.source, 'NASA 수치 자료')}</p></section>`;
}

function mapPanel(mode = '') {
  const sun = catalog.get('sun');
  const asteroids = regionFor(/asteroid-belt|소행성대|소행성 띠/i);
  const kuiper = regionFor(/kuiper|카이퍼/i);
  const scattered = regionFor(/scattered|산란원반/i);
  const oort = regionFor(/oort|오르트/i);
  const sequence = ids => ids.map(id => catalog.get(id)).filter(Boolean).map(item => solarNode(item, planetIds.indexOf(item.id))).join('');
  const regionsOnMap = [regionFor(/inner-planets|안쪽 행성/i), regionFor(/outer-planets|바깥쪽 행성/i)].filter(Boolean);
  return `<section class="solar-map" aria-labelledby="solar-map-heading">
      <div class="section-heading"><h2 id="solar-map-heading">태양계 지도</h2><span>크기와 거리는 실제 비율과 달라요.</span></div>
      <ol class="solar-track" aria-label="태양에서 멀어지는 순서">${sun ? solarNode(sun, -1) : ''}${sequence(planetIds.slice(0, 4))}${mapRegion(asteroids, 'asteroid-belt', '소행성대')}${sequence(planetIds.slice(4))}${mapRegion(kuiper, 'kuiper-belt', '카이퍼대')}${mapRegion(scattered, 'scattered-disk', '산란원반')}${mapRegion(oort, 'oort-cloud', '오르트 구름')}</ol>
      ${regionsOnMap.length ? `<nav class="map-regions" aria-label="행성이 모인 곳">${regionsOnMap.map(entry => `<a href="#region/${escapeHTML(entry.id)}">${escapeHTML(entry.name)} <span aria-hidden="true">↗</span></a>`).join('')}</nav>` : ''}
      <nav class="compare-actions" aria-label="태양계 비교">${Object.entries(comparisons).map(([id, comparison]) => `<a class="button button-secondary" href="#solar${mode === id ? '' : `?compare=${id}`}"${mode === id ? ' aria-current="page"' : ''}>${comparison.heading}</a>`).join('')}</nav>
    </section>`;
}

function solarView(current) {
  const requested = current.params.get('compare');
  const mode = Object.hasOwn(comparisons, requested) ? requested : '';
  const extras = [...catalog.values()].filter(item => solarMember(item) && !planetIds.includes(item.id) && item.id !== 'sun');
  return `<section class="page-intro"><h1>태양계 탐험</h1><p>태양에서 출발해 가까운 행성부터 차례로 만나 봐요.</p></section>
    ${mapPanel(mode)}
    ${mode ? comparisonPanel(mode) : ''}
    ${extras.length ? `<section class="linked-section"><div class="section-heading"><h2>태양계에서 더 만나 봐요</h2></div>${cardGrid(extras)}</section>` : ''}`;
}

function lookup(id) {
  for (const [type, index] of [['object', catalog], ['category', categories], ['region', regions], ['phenomenon', phenomena]]) {
    const entry = index.get(id);
    if (entry) return { type, entry };
  }
  return null;
}

function linksFor(id) {
  return (data.relations || []).flatMap(relation => {
    const from = relation.from === id;
    if (!from && relation.to !== id) return [];
    const result = lookup(from ? relation.to : relation.from);
    return result ? [{ ...result, label: from ? relation.forward : relation.reverse }] : [];
  });
}

function relationList(id) {
  const links = linksFor(id);
  if (!links.length) return '';
  return `<section class="linked-section" aria-label="연결된 천체와 장소"><h2>연결된 천체</h2><div class="relation-list">${links.map(({ entry, type, label }) => `<a href="#${type}/${escapeHTML(entry.id)}"><span><small>${escapeHTML(label)}</small><strong>${escapeHTML(entry.name)}</strong></span><span aria-hidden="true">↗</span></a>`).join('')}</div></section>`;
}

function coreFacts(item) {
  return (item.facts || []).filter(fact => fact.detail !== true).slice(0, 3).map(fact => `<div><dt>${escapeHTML(fact.label)}</dt><dd>${escapeHTML(fact.value)}${fact.estimated && !/약|추정/.test(fact.value) ? ' <small>추정</small>' : ''}</dd></div>`).join('');
}

function factList(item, heading = '숫자로 더 알아보기') {
  if (!item.facts?.length) return '';
  return `<details class="detail-disclosure"><summary>${heading}</summary><dl class="fact-list">${item.facts.map(fact => {
    const citation = sourceLink(fact.source);
    return `<div><dt>${escapeHTML(fact.label)}</dt><dd><strong>${escapeHTML(fact.value)}</strong>${fact.estimated ? '<span class="estimate-tag">추정</span>' : ''}${typeof fact.detail === 'string' ? `<p>${escapeHTML(fact.detail)}</p>` : ''}${citation ? `<small>자료 ${citation}</small>` : ''}</dd></div>`;
  }).join('')}</dl></details>`;
}

function imageCitation(image) {
  const changes = image.changes || image.modifications;
  const links = [image.sourceUrl && externalLink(image.sourceUrl, '원본 이미지와 설명'), image.license && externalLink(image.licenseUrl, image.license)].filter(Boolean);
  return `<p>${escapeHTML(image.caption)}${image.credit ? ` · ${escapeHTML(image.credit)}` : ''}</p>${links.length ? `<p>${links.join(' · ')}</p>` : ''}${changes ? `<p>이미지 변경 내역 · ${escapeHTML(changes)}</p>` : ''}`;
}

function citations(item) {
  const contentSources = (item.sources || []).map(sourceLink).filter(Boolean);
  if (!item.image && !contentSources.length) return '';
  return `<details class="detail-disclosure citation-disclosure"><summary>사진과 자료 출처</summary><div class="citation-content">
    ${item.image ? `<h3>대표 이미지</h3>${imageCitation(item.image)}` : ''}
    ${contentSources.length ? `<h3>본문 자료</h3><ul>${contentSources.map(link => `<li>${link}</li>`).join('')}</ul>` : ''}
  </div></details>`;
}

function imageGallery(item) {
  if (!item.gallery?.length) return '';
  return `<section class="linked-section photo-gallery"><h2>이미지 더 보기</h2><div class="photo-grid">${item.gallery.map((image, index) => `<div>
    ${visual(item, 'gallery', image, index + 1)}<div class="gallery-caption"><p>${escapeHTML(image.caption)}</p>${image.sourceUrl ? externalLink(image.sourceUrl, '이미지 출처') : ''}</div>
  </div>`).join('')}</div></section>`;
}

function objectView(item) {
  if (!item) return missingPage();
  const region = regions.get(item.region);
  const facts = coreFacts(item);
  const returnLink = /^#(?:catalog|category\/|favorites|solar|region\/)/.test(previousView || '') ? `<a href="${escapeHTML(previousView)}" class="return-link">← 이전 목록</a>` : '';
  return `<nav class="breadcrumbs" aria-label="현재 위치">${returnLink}<a href="#catalog">천체 도감</a><span aria-hidden="true">/</span><a href="#category/${escapeHTML(item.category)}">${escapeHTML(categoryName(item.category))}</a>${solarMember(item) ? '<span aria-hidden="true">/</span><a href="#solar">태양계 탐험</a>' : ''}${region && !/^(solar|solar-system)$/.test(region.id) ? `<span aria-hidden="true">/</span><a href="#region/${escapeHTML(region.id)}">${escapeHTML(region.name)}</a>` : ''}</nav>
    <article class="detail-page"><div class="detail-hero">${visual(item, 'detail', item.image, 0)}<div class="detail-copy"><p class="detail-category">${escapeHTML(categoryName(item.category))}</p><h1>${escapeHTML(item.name)}</h1>${item.en ? `<p class="detail-english" lang="en">${escapeHTML(item.en)}</p>` : ''}<p class="detail-intro">${escapeHTML(item.intro)}</p>${favoriteButton(item, 'detail')}</div></div>
    ${item.prompt ? `<section class="observation-note"><h2>${imageFile(item) ? '원본 이미지에서 찾아봐요' : '생각해 봐요'}</h2><p>${escapeHTML(item.prompt)}</p></section>` : ''}
    ${facts ? `<dl class="core-facts">${facts}</dl>` : ''}${imageGallery(item)}${factList(item)}${relationList(item.id)}${citations(item)}</article>
    <dialog class="photo-dialog" aria-labelledby="photo-dialog-title"></dialog>`;
}

function groupView(item, type) {
  if (!item) return missingPage();
  const items = [...catalog.values()].filter(entry => (item.objects || []).includes(entry.id) || (type === 'region' && entry.region === item.id));
  const facts = coreFacts(item);
  return `<nav class="breadcrumbs" aria-label="현재 위치"><a href="${type === 'region' && !/밖|외계|은하/.test(item.name) ? '#solar' : '#catalog'}">${type === 'region' && !/밖|외계|은하/.test(item.name) ? '태양계 탐험' : '천체 도감'}</a></nav><section class="page-intro"><h1>${escapeHTML(item.name)}</h1><p>${escapeHTML(item.intro || item.summary)}</p></section>
    ${item.prompt ? `<section class="observation-note"><h2>생각해 봐요</h2><p>${escapeHTML(item.prompt)}</p></section>` : ''}${facts ? `<dl class="core-facts">${facts}</dl>` : ''}${factList(item, '더 알아보기')}${relationList(item.id)}${items.length ? `<section class="linked-section"><h2>이곳에서 만나는 천체</h2>${cardGrid(items)}</section>` : ''}${citations(item)}`;
}

function favorites() {
  return `<section class="page-intro"><h1>즐겨찾기</h1><p>하트를 눌러 모은 천체를 다시 만나 봐요.</p></section>${cardGrid([...favoriteIds].map(id => catalog.get(id)).filter(Boolean), '아직 담은 천체가 없어요. 마음에 드는 천체의 하트를 눌러요.')}`;
}

function about() {
  const onlineImages = [...catalog.values()].flatMap(item => [item.image, ...(item.gallery || [])]).filter(image => remoteOnly({ image })).length;
  return `<section class="page-intro"><h1>설치 · 사진과 자료 안내</h1></section><div class="about-grid">
    <section><h2>iPad에 설치하기</h2>${embeddedCatalog ? '<p>홈 화면 앱을 설치하려면 HTTPS에 게시된 우주 아틀라스 주소가 필요해요.</p>' : '<ol><li>Safari에서 우주 아틀라스를 열어요.</li><li>공유 버튼을 누르고 ‘홈 화면에 추가’를 선택해요.</li><li>‘웹 앱으로 열기’를 켠 뒤 ‘추가’를 눌러요.</li><li>홈 화면 아이콘으로 온라인에서 처음 열고, 하단의 ‘오프라인 준비 완료’를 확인해요.</li></ol>'}<p>${externalLink('https://support.apple.com/ko-kr/guide/ipad/ipad8f1f7a29/ipados', 'Apple 설치 안내')}</p></section>
    <section><h2>사진과 상상도</h2><p>이미지 옆에 어떻게 얻었는지 적었어요. 여러 장을 합치거나 눈에 보이지 않는 빛을 색으로 바꾼 관측 자료도 있어요. 기관의 상상도와 AI 상상도에는 각각 이름을 붙였어요.</p><p>천체 상세에서 사진의 원본, 이용 조건과 숫자의 출처를 볼 수 있어요.</p></section>
    <section><h2>인터넷 없이 탐험하기</h2><p>${embeddedCatalog ? '이 파일에 들어 있는 천체 글, 검색과 연결, 사진은 오프라인에서 볼 수 있어요.' : '준비가 끝나면 천체 글, 검색과 연결, 앱에 포함된 사진을 오프라인에서 볼 수 있어요.'}${onlineImages ? ` ‘인터넷 필요’가 붙은 이미지 ${onlineImages}개와 고화질 원본, 외부 자료를 보려면 인터넷에 연결해 주세요.` : ' 고화질 원본과 외부 자료를 보려면 인터넷에 연결해 주세요.'} 즐겨찾기는 사용 중인 기기에 저장돼요.</p></section>
  </div>`;
}

function missingPage() {
  return '<section class="page-intro"><h1>여기에는 천체가 없어요.</h1><p><a class="button button-primary" href="#catalog">천체 도감으로 가기</a></p></section>';
}

function render({ focus = false, restore = false } = {}) {
  if (!data) return;
  const current = route();
  const views = {
    home, solar: () => solarView(current), catalog: () => catalogView(current), category: () => catalogView(current),
    object: () => objectView(catalog.get(current.id)), region: () => groupView(regions.get(current.id), 'region'),
    phenomenon: () => groupView(phenomena.get(current.id), 'phenomenon'), favorites, about
  };
  main.innerHTML = (Object.hasOwn(views, current.view) ? views[current.view] : missingPage)();
  queryInput.value = current.params.get('q') || '';
  document.querySelectorAll('[data-nav]').forEach(link => {
    const active = link.dataset.nav === current.view || (link.dataset.nav === 'catalog' && current.view === 'category');
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  const title = main.querySelector('h1')?.textContent;
  document.title = current.view === 'home' || !title ? '우주 아틀라스 · Space Atlas' : `${title} · 우주 아틀라스`;
  activeHash = location.hash || '#home';
  if (focus) main.focus({ preventScroll: true });
  if (restore) window.scrollTo(0, scrollPositions.get(activeHash) || 0);
  if (restore && current.view === 'solar' && current.params.has('compare') && !scrollPositions.has(activeHash)) {
    document.querySelector('#comparison-panel')?.scrollIntoView({ block: 'nearest' });
  }
}

document.querySelector('#site-search').addEventListener('submit', event => {
  event.preventDefault();
  navigate(catalogHash(queryInput.value.trim()));
});

document.querySelector('.skip-link').addEventListener('click', event => {
  event.preventDefault();
  main.focus();
  main.scrollIntoView();
});

document.addEventListener('click', event => {
  const opener = event.target.closest('[data-image-index]');
  if (opener) {
    const item = catalog.get(route().id);
    const image = [item.image, ...(item.gallery || [])][Number(opener.dataset.imageIndex)];
    const dialog = main.querySelector('.photo-dialog');
    const displayed = opener.closest('.object-visual').querySelector('img');
    const enlarged = { ...image, file: displayed.getAttribute('src') };
    dialog.innerHTML = `<header><h2 id="photo-dialog-title">${escapeHTML(item.name)} 이미지</h2><form method="dialog"><button class="button button-secondary" autofocus>닫기 <span aria-hidden="true">×</span></button></form></header>
      ${visual(item, 'enlarged', enlarged)}<div class="citation-content">${imageCitation(image)}${image.originalUrl && image.originalUrl !== image.sourceUrl ? `<p>${externalLink(image.originalUrl, '원본 크기로 열기')}</p>` : ''}</div>`;
    dialog.showModal();
    return;
  }
  const favorite = event.target.closest('[data-favorite]');
  if (favorite && catalog) {
    const id = favorite.dataset.favorite;
    const added = !favoriteIds.has(id);
    if (added) favoriteIds.add(id);
    else favoriteIds.delete(id);
    let saved = true;
    try {
      localStorage.setItem(favoriteKey, JSON.stringify([...favoriteIds]));
    } catch {
      saved = false;
    }
    announcement.textContent = saved ? `${catalog.get(id).name} ${added ? '즐겨찾기에 담았어요.' : '즐겨찾기에서 뺐어요.'}` : '이 기기에 즐겨찾기를 저장할 수 없어요.';
    if (route().view === 'favorites') render({ focus: true });
    else {
      favorite.setAttribute('aria-pressed', String(added));
      favorite.firstElementChild.textContent = added ? '♥' : '♡';
    }
    return;
  }
  const internalLink = event.target.closest('a[href^="#"]');
  if (internalLink && !event.defaultPrevented && event.button === 0 && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) {
    scrollPositions.set(activeHash, window.scrollY);
  }
});

main.addEventListener('change', event => {
  if (event.target.id !== 'region-filter') return;
  const current = route();
  navigate(catalogHash(current.params.get('q'), event.target.value, current.view === 'category' ? current.id : ''));
});

main.addEventListener('load', event => {
  if (event.target.tagName !== 'IMG') return;
  event.target.closest('.object-visual')?.classList.add('has-photo');
}, true);

main.addEventListener('error', event => {
  if (event.target.tagName !== 'IMG') return;
  if (event.target.dataset.remote) {
    const remote = event.target.dataset.remote;
    delete event.target.dataset.remote;
    event.target.src = remote;
    return;
  }
  const figure = event.target.closest('.object-visual');
  if (!figure) return;
  event.target.remove();
  figure.classList.remove('has-photo');
  figure.querySelector('.photo-status').textContent = '사진을 불러오지 못했어요';
}, true);

if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
window.addEventListener('hashchange', () => {
  scrollPositions.set(activeHash, window.scrollY);
  previousView = activeHash;
  render({ focus: true, restore: true });
});

function setOfflineState(state) {
  const labels = { ready: '오프라인 준비 완료', preparing: '오프라인 준비 중', error: '오프라인 준비를 다시 시도해 주세요', unsupported: '이 브라우저에서는 오프라인 저장을 사용할 수 없어요', unavailable: '오프라인 저장을 준비하지 못했어요' };
  const text = Object.hasOwn(labels, state) ? labels[state] : '';
  offlineStatus.textContent = text;
  offlineStatus.hidden = !text;
  offlineStatus.dataset.state = state || '';
}

window.addEventListener('atlas-offline', event => setOfflineState(event.detail?.state));
setOfflineState(window.atlasOfflineState);

try {
  if (embeddedCatalog) data = JSON.parse(embeddedCatalog.textContent);
  else {
    const response = await fetch('./data/catalog.json');
    if (!response.ok) throw new Error(`Catalog returned ${response.status}`);
    data = await response.json();
  }
  catalog = makeIndex(data.objects);
  categories = makeIndex(data.categories);
  regions = makeIndex(data.regions);
  phenomena = makeIndex(data.phenomena);
  render();
} catch (error) {
  console.error(error);
  main.innerHTML = '<section class="page-intro"><h1>도감을 불러오지 못했어요.</h1><p>인터넷에 연결한 뒤 페이지를 다시 열어 주세요.</p></section>';
}

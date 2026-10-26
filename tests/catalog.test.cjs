const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const catalogContext = {window:{}};
vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/categories.js'), 'utf8'), catalogContext);
const categories = catalogContext.window.KOREA_CATALOG.categories;
const start = html.indexOf('const P = [');
const end = html.indexOf('\n];', start) + 3;
const context = vm.createContext({CATS:categories, city:'seoul', active:new Set(), query:'', encodeURIComponent});
vm.runInContext(html.slice(start,end) + '\nthis.places = P;',context);
const places = context.places;
const visibleStart = html.indexOf('function visible(p)');
vm.runInContext(html.slice(visibleStart,html.indexOf('\nfunction renderChips()',visibleStart)), context);
const urlStart = html.indexOf('function mapUrl(p)');
vm.runInContext(html.slice(urlStart,html.indexOf('\nfunction showCard(',urlStart)),context);

function find({city='seoul', active=[], query=''}) {
  context.city=city; context.active=new Set(active); context.query=query;
  return places.filter(p => context.visible(p));
}

test('every card has a unique identity, a category and a usable point in its city', () => {
  assert.equal(new Set(places.map(p=>p.kr)).size,places.length);
  const bounds={seoul:[36.9,38.1,126.5,127.6],busan:[34.9,35.5,128.7,129.5],doha:[25.1,25.5,51.3,51.8]};
  for (const p of places) {
    assert.ok(categories[p.k],p.n+' lacks a category');
    assert.ok(p.mapNote && p.mapKind,p.n+' lacks location context');
    const [south,north,west,east]=bounds[p.c];
    assert.ok(Number.isFinite(p.lat)&&p.lat>=south&&p.lat<=north,p.n+' has wrong latitude');
    assert.ok(Number.isFinite(p.lng)&&p.lng>=west&&p.lng<=east,p.n+' has wrong longitude');
  }
});

test('climbing, cycling and hiking are independent filters', () => {
  const climbs=find({active:['climbing']});
  assert.equal(climbs.length,3);
  assert.ok(climbs.every(p=>/클라이밍|탄산마그네슘/.test(p.kr)));
  const cycling=find({active:['cycling']});
  assert.equal(cycling.length,4);
  assert.equal(find({active:['hike']}).some(p=>cycling.includes(p)),false);
  assert.equal(find({active:['climbing','cycling']}).length,7);
});

test('search understands category names and everyday aliases and intersects with filters', () => {
  assert.equal(find({query:'велики'}).length,4);
  const climbingSearch=find({query:'скалодром'});
  assert.ok(find({active:['climbing']}).every(p=>climbingSearch.includes(p)));
  assert.equal(find({query:'скалодром',active:['climbing']}).length,3);
  assert.equal(find({query:'велики',active:['climbing']}).length,0);
  assert.equal(find({query:'не существующее место 999999'}).length,0);
});

test('city filters expose all city records, including newly located Busan places', () => {
  for (const city of ['seoul','busan','doha']) {
    assert.equal(find({city}).length,places.filter(p=>p.c===city).length);
  }
  assert.ok(find({city:'busan'}).some(p=>p.kr==='민락수변공원'));
  assert.ok(find({city:'busan'}).some(p=>p.kr==='이우환 공간'));
});

test('route and format anchors are labelled, and external maps search a real name or address', () => {
  for (const p of places) {
    assert.ok(['place','approximate','area','route','format','campus'].includes(p.mapKind));
    const url=new URL(context.mapUrl(p));
    const query=url.searchParams.get('query');
    assert.ok(query && !query.includes('null') && !query.includes('undefined'),p.n);
  }
  const cycle=places.find(p=>p.n.startsWith('Веломаршрут'));
  assert.equal(cycle.mapKind,'route');
  assert.equal(places.find(p=>p.kr==='PC방').mapKind,'format');
});

const selectionStart = html.indexOf('function mapSelection()');
vm.runInContext(html.slice(selectionStart,html.indexOf('\nfunction renderMap()',selectionStart)),context);

test('map retains every city point when categories or search narrow the cards', () => {
  find({active:['climbing']});
  let selection=context.mapSelection();
  assert.equal(selection.items.length,192);
  assert.equal(selection.matchedIds.length,3);
  assert.equal(selection.filterActive,true);
  find({query:'не существующее место 999999'});
  selection=context.mapSelection();
  assert.equal(selection.items.length,192);
  assert.equal(selection.matchedIds.length,0);
  for (const [city,total] of [['seoul',192],['busan',25],['doha',5]]) {
    find({city});
    selection=context.mapSelection();
    assert.equal(selection.items.length,total);
    assert.equal(selection.matchedIds.length,total);
    assert.equal(selection.filterActive,false);
  }
});

test('every detailed category has its own local pictogram', () => {
  const iconContext={window:{}};
  vm.runInNewContext(fs.readFileSync(path.join(root,'assets/place-icons.js'),'utf8'),iconContext);
  const icons=iconContext.window.KOREA_PLACE_ICONS;
  assert.deepEqual(Object.keys(icons).sort(),Object.keys(categories).sort());
  assert.equal(new Set(Object.values(icons)).size,Object.keys(categories).length);
  for (const icon of Object.values(icons)) {
    assert.ok(icon.includes('currentColor'));
    assert.ok(!/<script|href=|on\w+=/.test(icon));
  }
});


test('coat hunt includes each named shop once and keeps designer stores outside the vintage category', () => {
  const hunt=find({query:'шуба'});
  assert.equal(hunt.length,9);
  const names=['아케호무666','루트홍대','아카이브엑스','유코빈티지','홍대빈티지B1','발발빈티지 가로수길','폭스빈티지 압구정','썸띵 빈티지','무신사 엠프티 성수'];
  for (const kr of names) assert.equal(hunt.filter(p=>p.kr===kr).length,1,kr);
  assert.equal(hunt.find(p=>p.kr==='무신사 엠프티 성수').k,'shops');
  const selection=context.mapSelection();
  assert.equal(selection.items.length,192);
  assert.equal(selection.matchedIds.length,9);
});

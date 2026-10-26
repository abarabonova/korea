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
const context = vm.createContext({CATS:categories, city:'seoul', active:new Set(), query:'', topOnly:false, encodeURIComponent});
vm.runInContext(html.slice(start,end) + '\nthis.places = P;',context);
const places = context.places;
const visibleStart = html.indexOf('function visible(p)');
vm.runInContext(html.slice(visibleStart,html.indexOf('\nfunction renderChips()',visibleStart)), context);
const urlStart = html.indexOf('function mapUrl(p)');
vm.runInContext(html.slice(urlStart,html.indexOf('\nfunction showCard(',urlStart)),context);

function find({city='seoul', active=[], query='', topOnly=false}) {
  context.city=city; context.active=new Set(active); context.query=query; context.topOnly=topOnly;
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
  assert.equal(selection.items.length,195);
  assert.equal(selection.matchedIds.length,3);
  assert.equal(selection.filterActive,true);
  find({query:'не существующее место 999999'});
  selection=context.mapSelection();
  assert.equal(selection.items.length,195);
  assert.equal(selection.matchedIds.length,0);
  for (const [city,total] of [['seoul',195],['busan',25],['doha',5]]) {
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
  assert.equal(selection.items.length,195);
  assert.equal(selection.matchedIds.length,9);
});


test('the first twenty cards follow the user ranking and every remaining place appears once', () => {
  find({});
  const ordered=context.catalogItems();
  const expected=['리움미술관','언리미티드 에디션 18','국립현대미술관','홍대 R3 패션거리','힙지로','팝업스토어','액티브모드 홍대','서울시립미술관 서소문본관','문래창작촌','서울숲 → 뚝섬 → 반포 → 노들섬','피크닉','문화비축기지','아모레퍼시픽미술관','북한산 대남문 코스','잠실 → 석촌호수 → 올림픽공원','서서울미술관','릴리데이지','코인노래방','선유도공원','송은'];
  assert.deepEqual(Array.from(ordered.slice(0,20),([p])=>p.kr),expected);
  assert.deepEqual(Array.from(ordered.slice(0,20),([p])=>p.priority.rank),Array.from({length:20},(_,i)=>i+1));
  assert.equal(new Set(ordered.map(([,i])=>i)).size,195);
  assert.equal(places.filter(p=>p.priority).length,20);
});

test('top twenty filter intersects with categories without dropping city map points or renumbering', () => {
  assert.equal(find({topOnly:true}).length,20);
  let selection=context.mapSelection();
  assert.equal(selection.items.length,195);
  assert.equal(selection.matchedIds.length,20);
  assert.equal(selection.filterActive,true);
  find({topOnly:true,active:['galleries']});
  assert.deepEqual(Array.from(context.catalogItems(),([p])=>p.priority.rank),[11,12,20]);
  selection=context.mapSelection();
  assert.equal(selection.items.length,195);
  assert.equal(selection.matchedIds.length,3);
  find({city:'busan'});
  assert.ok(context.catalogItems().every(([p])=>!p.priority));
});

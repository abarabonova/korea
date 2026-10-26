/* Interactive map. Coordinates and categories are bundled; no runtime geocoding. */
window.createPlaceMap = function ({places, categories, icons, photos, onShowCard, mapUrl}) {
  const host = document.getElementById('map');
  const hint = document.getElementById('mapHint');
  const tileStatus = document.getElementById('map-tile-status');
  const body = document.getElementById('map-body');
  const toggle = document.getElementById('toggle-map');
  const fitButton = document.getElementById('fit-map');
  const title = document.getElementById('mapTitle');
  const cityNames = {seoul:'Сеул', busan:'Пусан', doha:'Доха'};
  const defaults = {seoul:[37.55,126.99], busan:[35.16,129.10], doha:[25.29,51.54]};
  const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let map, clusters, priorityClusters, tiles, currentCity, currentItems = [], currentSelection, signature = '', needsFit = true;
  const markers = new Map();

  function popup(p, index) {
    const box = document.createElement('div');
    box.className = 'place-popup';
    const heading = document.createElement('div'); heading.className = 'popup-heading';
    const titleBlock = document.createElement('div');
    titleBlock.innerHTML = (p.priority ? '<p class="popup-priority-label">№' + p.priority.rank + ' · ' + escape(p.priority.level) + '</p>' : '') + '<h3>' + escape(p.priority?.title || p.n) + '</h3><p class="popup-meta">' + escape(categories[p.k].label) + ' · ' + escape(p.a) + '</p>';
    heading.append(titleBlock);
    const photo = photos[p.kr]?.photos?.[0];
    if (photo) {
      const image = document.createElement('img');
      image.src = photo.src; image.alt = photo.alt; image.width = 76; image.height = 76;
      image.addEventListener('error', () => image.remove(), {once:true});
      const figure = document.createElement('div'); figure.className = 'popup-figure'; figure.append(image);
      const source = document.createElement('a');
      source.href = photo.source; source.target = '_blank'; source.rel = 'noopener noreferrer';
      source.className = 'popup-photo-source'; source.textContent = 'Источник ↗';
      figure.append(source); heading.append(figure);
    }
    box.append(heading);
    const text = document.createElement('div');
    text.className = 'popup-copy';
    text.innerHTML = (p.priority ? '<p class="popup-priority-reason">' + escape(p.priority.why) + '</p>' : '') + '<p class="popup-desc">' + escape(p.d) + '</p>'
      + '<p class="popup-price">' + escape(p.pr) + '</p>'
      + '<p class="popup-location">' + escape(p.mapNote) + '</p>';
    const actions = document.createElement('div'); actions.className = 'popup-actions';
    const card = document.createElement('button'); card.type = 'button'; card.textContent = 'Карточка ниже ↓';
    card.addEventListener('click', () => onShowCard(index));
    const external = document.createElement('a'); external.href = mapUrl(p); external.target = '_blank'; external.rel = 'noopener noreferrer'; external.textContent = 'Маршрут ↗';
    actions.append(card, external); text.append(actions); box.append(text);
    return box;
  }

  function ensureMap() {
    if (map) return true;
    if (!window.L || !L.markerClusterGroup) {
      host.textContent = 'Не удалось загрузить карту. Все места доступны в карточках ниже.';
      hint.textContent = 'Попробуй обновить страницу.';
      fitButton.disabled = true;
      return false;
    }
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    map = L.map(host, {scrollWheelZoom:false, zoomControl:false, maxZoom:19, zoomAnimation:!reducedMotion, fadeAnimation:!reducedMotion});
    map.createPane('priorityPane').style.zIndex = '625';
    map.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noopener">Leaflet</a>');
    L.control.zoom({position:'topright',zoomInTitle:'Приблизить',zoomOutTitle:'Отдалить'}).addTo(map);
    tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom:19, attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
      updateWhenIdle:true, keepBuffer:1
    }).addTo(map);
    tiles.on('tileerror', () => { tileStatus.hidden = false; });
    // Keep the explanation visible after a failed tile; markers and popups still work.
    const createClusters = (priority = false) => L.markerClusterGroup({
      clusterPane:priority ? 'priorityPane' : 'markerPane',
      maxClusterRadius:priority ? 28 : 60, showCoverageOnHover:false, spiderfyOnMaxZoom:true,
      animate:!reducedMotion, spiderfyDistanceMultiplier:1.8,
      iconCreateFunction: cluster => {
        const children = cluster.getAllChildMarkers();
        const matching = children.filter(marker => marker.options.placeMatched).length;
        const counts = new Map();
        children.forEach(marker => {
          const key = marker.options.placeCategory;
          const count = counts.get(key) || {total:0,matched:0};
          count.total++; count.matched += Number(marker.options.placeMatched); counts.set(key,count);
        });
        const types = [...counts].sort((a,b) => (b[1].matched-a[1].matched) || (b[1].total-a[1].total));
        const shown = types.slice(0,2);
        const ranks = priority ? children.map(marker => marker.options.priorityRank).sort((a,b) => a-b) : [];
        const label = (priority ? 'Топ-20: группа из ' + children.length + ' мест. Номера: ' + ranks.join(', ') + '. ' : 'Группа из ' + children.length + ' мест. ') + shown.map(([key,count]) => categories[key].label + ': ' + count.total).join('; ')
          + (types.length > shown.length ? '; ещё категорий: ' + (types.length-shown.length) : '')
          + (currentSelection.filterActive ? '. Подходят фильтрам: ' + matching : '') + '. Приблизить';
        const symbols = shown.map(([key]) => '<svg viewBox="0 0 24 24" style="color:' + categories[key].color + '" aria-hidden="true">' + icons[key] + '</svg>').join('');
        return L.divIcon({className:'place-cluster' + (priority ? ' priority-cluster' : '') + (currentSelection.filterActive ? (matching ? ' filter-match' : ' filter-other') : ''),
          html:'<span class="cluster-content" role="img" data-place-count="' + children.length + '"' + (priority ? ' data-priority-count="' + children.length + '"' : '') + ' aria-label="' + escape(label) + '" title="' + escape(label) + '"><span class="cluster-symbols">' + symbols + '</span><b class="cluster-count">' + (priority ? 'Топ ' : '') + children.length + '</b></span>',
          iconSize:[48,48]});
      }
    });
    clusters = createClusters(); priorityClusters = createClusters(true);
    map.addLayer(clusters); map.addLayer(priorityClusters);
    map.on('focus', () => host.classList.add('map-focused'));
    new ResizeObserver(() => { if (!body.hidden && map) map.invalidateSize({pan:false}); }).observe(host);
    return true;
  }

  function fit() {
    if (!map || body.hidden) { needsFit = true; return; }
    map.closePopup();
    map.invalidateSize({pan:false});
    if (currentItems.length) {
      map.fitBounds(currentItems.map(({p}) => [p.lat,p.lng]), {padding:[32,32], maxZoom:15, animate:false});
    } else map.setView(defaults[currentCity],12,{animate:false});
    needsFit = false;
  }

  function update(selection) {
    const {city,items,matchedIds,filterActive} = selection;
    currentSelection = selection;
    const matched = new Set(matchedIds);
    title.textContent = cityNames[city];
    const nextSignature = city + ':' + items.map(({i}) => i).join(',') + ':' + filterActive + ':' + matchedIds.join(',');
    const changed = nextSignature !== signature;
    const changedCity = currentCity !== city;
    currentCity = city; currentItems = items;
    const total = places.filter(p => p.c === city).length;
    host.dataset.visiblePlaces = String(items.length);
    host.dataset.totalPlaces = String(total);
    host.dataset.matchedPlaces = String(matched.size);
    host.dataset.filterActive = String(filterActive);
    const priorityCount = items.filter(({p}) => p.priority).length;
    host.dataset.priorityPlaces = String(priorityCount);
    document.getElementById('map-priority-legend').hidden = !priorityCount;
    hint.textContent = 'На карте все точки города: ' + total + '.'
      + (filterActive ? ' Выделено по фильтрам: ' + matched.size + '. Остальные точки тоже доступны.' : '')
      + ' Значок — тип места, число — группа точек: нажми, чтобы приблизить. Пунктир — ориентир; уточни адрес перед поездкой.';
    fitButton.disabled = !items.length;
    if (changedCity) { tileStatus.hidden = true; needsFit = true; }
    if (body.hidden) { signature = ''; return; }
    if (!ensureMap()) return;
    if (!changed && signature) return;
    map.closePopup(); clusters.clearLayers(); priorityClusters.clearLayers(); markers.clear();
    const layers = items.map(({p,i}) => {
      const cat = categories[p.k];
      const approximate = p.mapKind !== 'place';
      const filterClass = filterActive ? (matched.has(i) ? ' filter-match' : ' filter-other') : '';
      const displayName = p.priority ? '№' + p.priority.rank + ' · ' + p.priority.title : p.n;
      const icon = L.divIcon({className:'place-pin' + (p.priority ? ' priority-pin' : '') + (approximate ? ' approximate' : '') + filterClass,
        html:'<span' + (p.priority ? ' data-priority-rank="' + p.priority.rank + '"' : '') + ' style="--pin-color:' + cat.color + '"><svg viewBox="0 0 24 24" aria-hidden="true">' + icons[p.k] + '</svg>' + (p.priority ? '<b class="pin-rank" aria-hidden="true">' + p.priority.rank + '</b>' : '') + '</span>', iconSize:[34,34], iconAnchor:[17,17]});
      const marker = L.marker([p.lat,p.lng],{icon,title:displayName,alt:displayName,keyboard:true,riseOnHover:true,pane:p.priority ? 'priorityPane' : 'markerPane',priorityRank:p.priority?.rank,placeCategory:p.k,placeMatched:filterActive && matched.has(i)});
      marker.bindTooltip('<strong>' + escape(displayName) + '</strong><br>' + escape(cat.label) + '<br>' + escape(p.pr)
        + (p.priority ? '<br><small class="tooltip-priority">' + escape(p.priority.why) + '</small>' : '')
        + (approximate ? '<br><small>Ориентир · уточни адрес</small>' : ''), {direction:'top',offset:[0,-15],className:'place-tooltip',opacity:1});
      marker.on('tooltipopen', event => {
        const tooltip = event.tooltip;
        const width = tooltip.getElement().getBoundingClientRect().width;
        const point = map.latLngToContainerPoint(marker.getLatLng());
        const x = Math.max(width/2+10,Math.min(host.clientWidth-width/2-10,point.x));
        tooltip.setLatLng(map.containerPointToLatLng([x,point.y]));
      });
      marker.bindPopup(() => popup(p,i), {maxWidth:Math.min(440,host.clientWidth-44),minWidth:Math.min(340,host.clientWidth-44),maxHeight:Math.max(220,host.clientHeight-70),autoPanPadding:[18,18]});
      marker.on('popupopen', event => {
        marker.closeTooltip();
        const close = event.popup.getElement().querySelector('.leaflet-popup-close-button');
        if (close) { close.setAttribute('aria-label','Закрыть карточку'); close.title = 'Закрыть карточку'; }
      });
      markers.set(i,marker); return marker;
    });
    clusters.addLayers(layers.filter(marker => !marker.options.priorityRank));
    priorityClusters.addLayers(layers.filter(marker => marker.options.priorityRank));
    signature = nextSignature;
    if (changedCity || needsFit) fit();
  }

  toggle.addEventListener('click', () => {
    body.hidden = !body.hidden;
    toggle.setAttribute('aria-expanded',String(!body.hidden));
    toggle.textContent = body.hidden ? 'Развернуть карту' : 'Свернуть карту';
    if (!body.hidden) { signature = ''; update(currentSelection); }
  });
  fitButton.addEventListener('click',fit);
  document.getElementById('retry-map-tiles').addEventListener('click', () => { tileStatus.hidden = true; if (tiles) tiles.redraw(); });

  return {
    update,
    focus(index) {
      if (body.hidden) { body.hidden = false; toggle.setAttribute('aria-expanded','true'); toggle.textContent = 'Свернуть карту'; signature = ''; update(currentSelection); }
      if (!map) return;
      const marker = markers.get(index);
      if (!marker) return;
      document.getElementById('map-section').scrollIntoView({behavior:'smooth',block:'start'});
      map.invalidateSize({pan:false});
      const group = marker.options.priorityRank ? priorityClusters : clusters;
      group.zoomToShowLayer(marker, () => marker.openPopup());
    }
  };
};

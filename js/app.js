//
// filename: app.js 
//

import { SCRIPT_URL, CATEGORIES } from './config.js';
import { initDB, saveMarker, getAllMarkers, deleteMarker, syncPendingMarkers } from './db.js';
import { exportToGPX } from './exporter.js';

// Globalt tillstånd
let selectedCategory = CATEGORIES[0];
let selectedAmount = 'Rikligt med fynd';
let savedPlaces = [];
let markerMap = new Map();
let userPositionMarker = null;
let userAccuracyCircle = null;
let currentCoords = null;
let currentAccuracy = 0;
let currentPhotoBase64 = null;

// Initiera kartan centrerad på Sverige
const map = L.map('map', { zoomControl: false }).setView([62.0, 15.0], 5);

setTimeout(() => {
  map.invalidateSize();
}, 100);

L.control.zoom({ position: 'bottomright' }).addTo(map);

// Initiera och ladda sparade markörer när sidan har laddats
document.addEventListener('DOMContentLoaded', async () => {
  try {
    await initDB();

    // 1. Ladda först det som finns sparat lokalt i IndexedDB
    const stored = await getAllMarkers();
    stored.forEach(place => addPlaceToMap(place));

    // 2. Hämta befintliga poster från Google Sheets (Kod.gs)
    if (navigator.onLine) {
      const res = await fetch(SCRIPT_URL);
      const remoteData = await res.json();
      
      if (Array.isArray(remoteData)) {
        for (const item of remoteData) {
          if (!item.id || !item.lat || !item.lng) continue;

          const formatted = {
            id: String(item.id),
            lat: Number(item.lat),
            lng: Number(item.lng),
            title: item.title || 'Skogsfynd',
            categoryGroup: item.category || 'Övrigt',
            category: item.category || 'Övrigt',
            description: item.description || '',
            timestamp: item.timestamp || '',
            syncStatus: 'synced'
          };
          
          await saveMarker(formatted);
          addPlaceToMap(formatted);
        }
      }
    }

    await syncPendingMarkers();
  } catch (err) {
    console.error("Fel vid laddning av markörer:", err);
  }
});



// -----------------------------------------------------------------
// 1. Kartlager & Kartväljare
// -----------------------------------------------------------------
const tileLayers = {
  topo: L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
    maxZoom: 17,
    attribution: '© OpenTopoMap'
  }),
  satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 18,
    attribution: '© Esri'
  }),
  osm: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap'
  })
};

let activeLayer = tileLayers.topo;
activeLayer.addTo(map);

const toggleBtn = document.getElementById('map-selector-toggle');
const menu = document.getElementById('map-selector-menu');
const currentMapName = document.getElementById('current-map-name');

if (toggleBtn && menu) {
  toggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    menu.classList.toggle('hidden');
  });

  document.addEventListener('click', () => {
    menu.classList.add('hidden');
  });

  document.querySelectorAll('.map-option-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const layerKey = btn.getAttribute('data-tile');

      map.removeLayer(activeLayer);
      activeLayer = tileLayers[layerKey];
      activeLayer.addTo(map);

      const names = { topo: 'Skogstopo', satellite: 'Satellitvy', osm: 'Standardkarta' };
      if (currentMapName) currentMapName.innerText = names[layerKey];

      document.querySelectorAll('.map-option-btn').forEach(b => {
        b.classList.remove('border-emerald-500', 'bg-emerald-50/50');
        b.classList.add('border-transparent');
      });
      btn.classList.remove('border-transparent');
      btn.classList.add('border-emerald-500', 'bg-emerald-50/50');

      menu.classList.add('hidden');
    });
  });
}

// -----------------------------------------------------------------
// 2. Ikoner & Stilmallar
// -----------------------------------------------------------------
const mushroomIcon = L.divIcon({
  className: 'custom-marker',
  html: `
    <div style="position: relative; width: 36px; height: 36px;">
      <div style="position: absolute; bottom: 0; left: 18px; width: 3px; height: 10px; background: white; transform: translateX(-50%);"></div>
      <div style="font-size: 24px; position: absolute; top: -5px; left: 0px;">🍄</div>
    </div>
  `,
  iconSize: [36, 36],
  iconAnchor: [18, 36],
  popupAnchor: [0, -36]
});

const myLocationIcon = L.divIcon({
  className: 'my-location-marker',
  html: `
    <div style="position: relative; width: 22px; height: 22px;">
      <div style="position: absolute; width: 22px; height: 22px; background: rgba(59, 130, 246, 0.4); border-radius: 50%; animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
      <div style="position: absolute; top: 3px; left: 3px; width: 16px; height: 16px; background: #2563eb; border: 3px solid white; border-radius: 50%; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>
    </div>
  `,
  iconSize: [22, 22],
  iconAnchor: [11, 11]
});

const styleSheet = document.createElement("style");
styleSheet.innerText = `
  @keyframes ping { 75%, 100% { transform: scale(2); opacity: 0; } }
  .leaflet-popup-content-wrapper { padding: 0; border-radius: 1rem; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1); }
  .leaflet-popup-content { margin: 0; width: auto !important; }
`;
document.head.appendChild(styleSheet);

// -----------------------------------------------------------------
// 3. Bildkomprimering & Kategoriinmatning
// -----------------------------------------------------------------
document.getElementById('input-photo')?.addEventListener('change', function(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(event) {
    const img = new Image();
    img.onload = function() {
      const canvas = document.createElement('canvas');
      const MAX_WIDTH = 800;
      const MAX_HEIGHT = 800;
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > MAX_WIDTH) {
          height *= MAX_WIDTH / width;
          width = MAX_WIDTH;
        }
      } else {
        if (height > MAX_HEIGHT) {
          width *= MAX_HEIGHT / height;
          height = MAX_HEIGHT;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      currentPhotoBase64 = canvas.toDataURL('image/jpeg', 0.7);

      const preview = document.getElementById('photo-preview');
      const previewContainer = document.getElementById('photo-preview-container');
      if (preview && previewContainer) {
        preview.src = currentPhotoBase64;
        previewContainer.classList.remove('hidden');
      }
    };
    img.src = event.target.result;
  };
  reader.readAsDataURL(file);
});

function renderCategoryGrid() {
  const grid = document.getElementById('category-grid');
  if (!grid) return;
  grid.innerHTML = CATEGORIES.map(cat => {
    const isSelected = selectedCategory && cat.id === selectedCategory.id;
    return `
      <button data-id="${cat.id}" type="button" class="category-btn p-2 rounded-2xl border flex flex-col items-center justify-center gap-1 transition ${isSelected ? 'border-emerald-600 bg-emerald-50 text-emerald-900 font-bold shadow-sm' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}">
        <div class="flex items-center justify-center h-7 w-7">
          ${cat.iconSvg}
        </div>
        <span class="text-[10px] leading-tight text-center">${cat.name}</span>
      </button>
    `;
  }).join('');

  document.querySelectorAll('.category-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const catId = e.currentTarget.getAttribute('data-id');
      selectedCategory = CATEGORIES.find(c => c.id === catId) || CATEGORIES[0];
      const titleInput = document.getElementById('input-title');
      if (titleInput) titleInput.value = selectedCategory.name;
      renderCategoryGrid();
    });
  });
}

document.querySelectorAll('.amount-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    selectedAmount = e.currentTarget.getAttribute('data-amount');
    document.querySelectorAll('.amount-btn').forEach(b => {
      b.classList.remove('border-emerald-600', 'bg-emerald-50', 'text-emerald-800', 'font-bold');
      b.classList.add('border-slate-200', 'bg-white', 'text-slate-700');
    });
    e.currentTarget.classList.remove('border-slate-200', 'bg-white', 'text-slate-700');
    e.currentTarget.classList.add('border-emerald-600', 'bg-emerald-50', 'text-emerald-800', 'font-bold');
  });
});

const modal = document.getElementById('save-modal');

document.getElementById('btn-mark')?.addEventListener('click', () => {
  if (currentCoords) {
    document.getElementById('modal-coords').innerText = `${currentCoords[0].toFixed(6)}, ${currentCoords[1].toFixed(6)}`;
    const accText = `±${Math.round(currentAccuracy)}m`;
    document.getElementById('modal-accuracy').innerText = accText;
    document.getElementById('modal-footer-gps').innerText = accText;

    if (!selectedCategory) selectedCategory = CATEGORIES[0];
    document.getElementById('input-title').value = selectedCategory.name;
    
    renderCategoryGrid();
    modal.classList.remove('hidden');
  } else {
    alert("Väntar på din GPS-position...");
  }
});

document.getElementById('modal-close')?.addEventListener('click', () => modal.classList.add('hidden'));

// -----------------------------------------------------------------
// 4. Hantering & Synkronisering
// -----------------------------------------------------------------
document.getElementById('btn-save-confirm')?.addEventListener('click', async (e) => {
  e.preventDefault();

  try {
    await initDB();

    const title = document.getElementById('input-title')?.value || selectedCategory?.name || 'Skogsfynd';
    const notes = document.getElementById('input-notes')?.value || 'Inga anteckningar angivna.';
    const catGroup = selectedCategory?.group || selectedCategory?.name || 'Övrigt';

    const latVal = currentCoords ? currentCoords[0] : 0;
    const lngVal = currentCoords ? currentCoords[1] : 0;

    const newPlace = {
      id: 'marker_' + Date.now(),
      lat: latVal,
      lng: lngVal,
      latitude: latVal,       // Mappar mot Latitude i Google Sheets
      longitude: lngVal,     // Mappar mot Longitude i Google Sheets
      title: title,
      categoryGroup: catGroup,
      category: catGroup,
      description: `${selectedAmount}. ${notes}`,
      photo: currentPhotoBase64 || null,
      timestamp: new Date().toISOString()
    };

    const savedMarker = await saveMarker(newPlace);
    const markerToMap = savedMarker || newPlace;
    const marker = addPlaceToMap(markerToMap);
    
    currentPhotoBase64 = null;
    document.getElementById('photo-preview-container')?.classList.add('hidden');
    const notesInput = document.getElementById('input-notes');
    if (notesInput) notesInput.value = '';
    
    modal.classList.add('hidden');

    if (marker) marker.openPopup();
  } catch (err) {
    console.error("Fel vid sparande av markör:", err);
    alert(`Kunde inte spara:\n${err?.message || err}`);
  }
});



// -----------------------------------------------------------------
// 5. Markör & Kartvisning
// -----------------------------------------------------------------

window.removeCurrentMarker = async function(id) {
  if (!confirm("Vill du ta bort denna markör?")) return;

  try {
    // 1. Ta bort från IndexedDB
    await deleteMarker(id);

    // 2. Skicka radera-anrop till Google Sheets i bakgrunden
    if (navigator.onLine) {
      fetch(SCRIPT_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'delete', id: id })
      }).catch(err => console.warn("Kunde inte radera från Sheets:", err));
    }

    // 3. Ta bort från kartan om den finns där
    if (markerMap.has(id)) {
      map.removeLayer(markerMap.get(id));
      markerMap.delete(id);
    }

    // 4. Ta bort från den lokala listan och uppdatera vyer
    savedPlaces = savedPlaces.filter(p => String(p.id) !== String(id));
    updateMarkerCount();
    renderListView();
    map.closePopup();

  } catch (err) {
    alert("Kunde inte radera markören: " + err.message);
  }
};


function createPopupContent(place, placeId) {
  const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lng}`;
  const googleEarthUrl = `https://earth.google.com/web/@${place.lat},${place.lng},0a,500d,35y,0h,0t,0r`;

  const latNum = Number(place.lat) || 0;
  const lngNum = Number(place.lng) || 0;

  return `
    <div class="bg-white rounded-2xl overflow-hidden shadow-lg border border-slate-200" style="width: 280px; max-width: calc(100vw - 40px);">
      ${place.photo ? `
        <div class="w-full h-32 overflow-hidden">
          <img src="${place.photo}" class="w-full h-full object-cover" alt="Skogsbild">
        </div>
      ` : ''}
      <div class="p-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
        <h3 class="font-bold text-base text-emerald-900 leading-tight pr-2">${place.title}</h3>
        <button onclick="window.removeCurrentMarker('${placeId}')" class="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition">🗑️</button>
      </div>
      <div class="px-3 py-1.5 bg-slate-50/50 border-b border-slate-100 flex items-center gap-2 text-xs font-semibold">
        <span class="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">${place.category || place.categoryGroup}</span>
      </div>
      <div class="px-3 py-2 text-xs text-slate-600 bg-slate-50/50 italic border-y border-slate-100">
        "${place.description}"
      </div>
      <div class="p-3 space-y-1 text-xs text-slate-700">
        <div>📍 <span class="font-mono text-slate-600">${latNum.toFixed(5)}, ${lngNum.toFixed(5)}</span></div>
        <div>🕐 <strong>Tid:</strong> ${place.timestamp ? place.timestamp.slice(0, 10) : ''}</div>
      </div>
      <div class="p-2.5 bg-slate-100 border-t border-slate-200 flex gap-2">
        <a href="${googleEarthUrl}" target="_blank" class="flex-1 text-center bg-blue-50 text-blue-700 border border-blue-200 py-1.5 rounded-xl text-xs font-semibold">🌐 Earth 3D</a>
        <a href="${googleMapsUrl}" target="_blank" class="flex-1 text-center bg-emerald-50 text-emerald-700 border border-emerald-200 py-1.5 rounded-xl text-xs font-semibold">🗺️ Maps</a>
      </div>
    </div>
  `;
}

function updateMarkerCount() {
  document.querySelectorAll('.marker-count-val').forEach(el => el.innerText = savedPlaces.length);
}

function addPlaceToMap(place) {
  const placeId = String(place.id || ('marker_' + Date.now()));
  place.id = placeId;

  if (!markerMap.has(placeId)) {
    const marker = L.marker([place.lat, place.lng], { icon: mushroomIcon }).addTo(map);
    markerMap.set(placeId, marker);
    marker.bindPopup(createPopupContent(place, placeId));
  }

  if (!savedPlaces.some(p => String(p.id) === placeId)) {
    savedPlaces.push(place);
  }

  updateMarkerCount();
  renderListView();
  
  return markerMap.get(placeId);
}

// -----------------------------------------------------------------
// 6. GPS-spårning
// -----------------------------------------------------------------
function updatePosition(position, autoCenter = false) {
  const { latitude, longitude, accuracy } = position.coords;
  currentCoords = [latitude, longitude];
  currentAccuracy = accuracy;

  const accText = `±${Math.round(accuracy)}m`;
  const badge = document.getElementById('gps-accuracy-badge');
  const footer = document.getElementById('gps-accuracy-footer');
  if (badge) badge.innerText = accText;
  if (footer) footer.innerText = `GPS: ${accText}`;

  if (userAccuracyCircle) {
    map.removeLayer(userAccuracyCircle);
  }

  userAccuracyCircle = L.circle([latitude, longitude], { 
    radius: accuracy, 
    color: '#3b82f6', 
    weight: 1, 
    fillColor: '#3b82f6', 
    fillOpacity: 0.15 
  }).addTo(map);

  if (userPositionMarker) {
    userPositionMarker.setLatLng([latitude, longitude]);
  } else {
    userPositionMarker = L.marker([latitude, longitude], { 
      icon: myLocationIcon, 
      zIndexOffset: 1000 
    }).addTo(map);
  }

  if (autoCenter) {
    map.flyTo([latitude, longitude], 16, { 
      duration: 1.5,
      easeLinearity: 0.25 
    });
  }
}

if ('geolocation' in navigator) {
  let initialCenter = false;
  navigator.geolocation.watchPosition(
    (pos) => { updatePosition(pos, !initialCenter); initialCenter = true; },
    (err) => console.warn(err.message),
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 2000 }
  );
}

document.getElementById('btn-recenter')?.addEventListener('click', () => {
  if (currentCoords) map.flyTo(currentCoords, 16, { animate: true, duration: 1.5 });
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(err => console.log(err));
}

// -----------------------------------------------------------------
// 7. Listvy & Flikväxling
// -----------------------------------------------------------------
function calculateDistance(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return null;
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  const d = R * c;
  return d < 1 ? `${Math.round(d * 1000)} m` : `${d.toFixed(1)} km`;
}

function renderListView() {
  const container = document.getElementById('list-container');
  if (!container) return;

  if (savedPlaces.length === 0) {
    container.innerHTML = `
      <div class="p-8 text-center text-slate-400">
        <p>Inga sparade skogsmarkörer än.</p>
      </div>`;
    return;
  }

  container.innerHTML = savedPlaces.map(item => {
    const lat = Number(item.lat);
    const lng = Number(item.lng);
    
    let distText = '';
    if (currentCoords) {
      const dist = calculateDistance(currentCoords[0], currentCoords[1], lat, lng);
      if (dist) distText = `🧭 ${dist} bort`;
    }

    const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
    const earthUrl = `https://earth.google.com/web/@${lat},${lng},0a,500d,35y,0h,0t,0r`;

    return `
      <div class="bg-white rounded-3xl p-4 mb-4 border border-slate-100 shadow-sm space-y-3">
        ${item.photo ? `
          <div class="w-full h-40 rounded-2xl overflow-hidden mb-2">
            <img src="${item.photo}" class="w-full h-full object-cover" alt="Skogsbild">
          </div>
        ` : ''}

        <div class="flex items-center gap-2 flex-wrap text-xs font-semibold">
          <span class="bg-amber-100/80 text-amber-900 px-3 py-1 rounded-full font-semibold text-xs inline-flex items-center gap-1 border border-amber-200/50">
            📍 ${item.category || item.categoryGroup || 'Naturfynd'}
          </span>
          ${distText ? `<span class="bg-blue-50 text-blue-600 px-3 py-1 rounded-full border border-blue-100">${distText}</span>` : ''}
        </div>

        <div>
          <h3 class="font-bold text-slate-900 text-base leading-snug">${item.title}</h3>
          ${item.description ? `
            <div class="mt-1 bg-slate-50 p-3 rounded-2xl text-xs text-slate-600 italic">
              "${item.description}"
            </div>
          ` : ''}
        </div>

        <div class="flex justify-between items-center text-[11px] text-slate-400 font-mono pt-1">
          <span>📍 ${lat.toFixed(5)}, ${lng.toFixed(5)}</span>
          <span>${item.timestamp ? item.timestamp.slice(0, 10) : ''}</span>
        </div>

        <div class="flex items-center gap-2 pt-1 border-t border-slate-100">
          <a href="${earthUrl}" target="_blank" class="flex-1 py-2 bg-blue-50 text-blue-700 border border-blue-200 rounded-xl text-center text-xs font-semibold hover:bg-blue-100 transition">
            🌐 Earth
          </a>
          <a href="${mapsUrl}" target="_blank" class="flex-1 py-2 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl text-center text-xs font-semibold hover:bg-emerald-100 transition">
            🗺️ Maps
          </a>
          <button onclick="window.removeCurrentMarker('${item.id}')" class="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition">
            🗑️
          </button>
        </div>
      </div>
    `;
  }).join('');
}

const btnList = document.getElementById('btn-show-list');
const btnMap = document.getElementById('btn-show-map');

function updateTabStyles(activeBtn, inactiveBtn) {
  if (!activeBtn || !inactiveBtn) return;
  activeBtn.style.backgroundColor = '#ffffff';
  activeBtn.style.color = '#065f46';
  activeBtn.style.borderRadius = '0.75rem';
  activeBtn.style.boxShadow = '0 1px 2px 0 rgba(0, 0, 0, 0.05)';
  activeBtn.style.fontWeight = '600';

  inactiveBtn.style.backgroundColor = 'transparent';
  inactiveBtn.style.color = '#475569';
  inactiveBtn.style.borderRadius = '0.75rem';
  inactiveBtn.style.boxShadow = 'none';
  inactiveBtn.style.fontWeight = '500';
}

if (btnList) {
  btnList.addEventListener('click', () => {
    document.getElementById('map-view')?.classList.add('hidden');
    document.getElementById('list-view')?.classList.remove('hidden');
    updateTabStyles(btnList, btnMap);
    renderListView();
  });
}

if (btnMap) {
  btnMap.addEventListener('click', () => {
    document.getElementById('list-view')?.classList.add('hidden');
    document.getElementById('map-view')?.classList.remove('hidden');
    updateTabStyles(btnMap, btnList);
    setTimeout(() => map.invalidateSize(), 100);
  });
}

// -----------------------------------------------------------------
// 8. Hamburgermeny & GPX Export
// -----------------------------------------------------------------
const btnHamburger = document.getElementById('btn-hamburger');
const hamburgerMenu = document.getElementById('hamburger-menu');

if (btnHamburger && hamburgerMenu) {
  btnHamburger.addEventListener('click', (e) => {
    e.stopPropagation();
    hamburgerMenu.classList.toggle('hidden');
  });

  document.addEventListener('click', () => {
    hamburgerMenu.classList.add('hidden');
  });

  if (!document.getElementById('btn-export-gpx')) {
    const gpxBtn = document.createElement('button');
    gpxBtn.id = 'btn-export-gpx';
    gpxBtn.className = "w-full text-left flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-emerald-50 hover:text-emerald-800 transition border-t border-slate-100";
    gpxBtn.innerHTML = `<span>📥</span> Exportera till GPX`;
    gpxBtn.addEventListener('click', () => {
      exportToGPX(savedPlaces);
    });
    hamburgerMenu.insertBefore(gpxBtn, hamburgerMenu.lastElementChild);
  }
}

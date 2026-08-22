// 
// filename: app.js
//

// Initiera kartan centrerad på Sverige (zoom 5 visar hela landet)
const map = L.map('map', { zoomControl: false }).setView([62.0, 15.0], 5);

// Tvinga Leaflet att räkna om containerns storlek så att kartan fyller hela skärmen
setTimeout(() => {
  map.invalidateSize();
}, 100);


L.control.zoom({ position: 'bottomright' }).addTo(map);

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

// Starta med Skogstopo som aktivt lager
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
// 3. Tillstånd & Kategorier
// -----------------------------------------------------------------
const categories = [
  { id: 'gula-kantareller', name: 'Gula kantareller', icon: '🍄' },
  { id: 'trattkantareller', name: 'Trattkantareller', icon: '🍂' },
  { id: 'karljohan', name: 'Karljohan / Svamp', icon: '🍄' },
  { id: 'matsvamp', name: 'Annan matsvamp', icon: '🪵' },
  { id: 'blabar', name: 'Blåbär', icon: '🫐' },
  { id: 'lingon', name: 'Lingon', icon: '🍒' },
  { id: 'hjortron', name: 'Hjortron', icon: '👑' },
  { id: 'hallon', name: 'Smultron / Hallon', icon: '🍓' },
  { id: 'fiske', name: 'Fiskeplats', icon: '🎣' },
  { id: 'talt', name: 'Tält- & Lägerplats', icon: '⛺' },
  { id: 'utsikt', name: 'Utsikts- & Rastplats', icon: '🌅' },
  { id: 'jakt', name: 'Jaktpass / Djur', icon: '🦌' },
  { id: 'tjarn', name: 'Skogstjärn / Bad', icon: '🏊' },
  { id: 'annat', name: 'Annat naturfynd', icon: '📍' }
];

let selectedCategory = categories[0];
let selectedAmount = 'Rikligt med fynd';
let savedMarkers = [];
let markerMap = new Map();
let userPositionMarker = null;
let userAccuracyCircle = null;
let currentCoords = null;
let currentAccuracy = 0;

// Renderingsfunktioner
function renderCategoryGrid() {
  const grid = document.getElementById('category-grid');
  if (!grid) return;
  grid.innerHTML = categories.map(cat => {
    const isSelected = cat.id === selectedCategory.id;
    return `
      <button data-id="${cat.id}" class="category-btn p-2 rounded-2xl border flex flex-col items-center justify-center gap-1 transition ${isSelected ? 'border-emerald-600 bg-emerald-50 text-emerald-900 font-bold shadow-sm' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}">
        <span class="text-xl">${cat.icon}</span>
        <span class="text-[10px] leading-tight text-center">${cat.name}</span>
      </button>
    `;
  }).join('');

  document.querySelectorAll('.category-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const catId = e.currentTarget.getAttribute('data-id');
      selectedCategory = categories.find(c => c.id === catId);
      document.getElementById('input-title').value = `${selectedCategory.name} i skogen`;
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

// Modal-hantering
const modal = document.getElementById('save-modal');

document.getElementById('btn-mark').addEventListener('click', () => {
  if (currentCoords) {
    document.getElementById('modal-coords').innerText = `${currentCoords[0].toFixed(6)}, ${currentCoords[1].toFixed(6)}`;
    const accText = `±${Math.round(currentAccuracy)}m`;
    document.getElementById('modal-accuracy').innerText = accText;
    document.getElementById('modal-footer-gps').innerText = accText;
    document.getElementById('input-title').value = `${selectedCategory.name} i skogen`;
    
    renderCategoryGrid();
    modal.classList.remove('hidden');
  } else {
    alert("Väntar på din GPS-position...");
  }
});

document.getElementById('modal-close').addEventListener('click', () => modal.classList.add('hidden'));

document.getElementById('btn-save-confirm').addEventListener('click', () => {
  const title = document.getElementById('input-title').value || selectedCategory.name;
  const notes = document.getElementById('input-notes').value || 'Inga anteckningar angivna.';

  const newPlace = {
    lat: currentCoords[0],
    lng: currentCoords[1],
    title: title,
    category: selectedCategory.name,
    distance: "0 km",
    bearing: "Här",
    description: `${selectedAmount}. ${notes}`,
    imageUrl: "https://images.unsplash.com/photo-1632731881691-645b2069b917?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=MnwxMTkyMXwwfDF8c2VhcmNofDExfHxtdXNocm9vbXMlMjBmb3Jlc3R8ZW58MHx8fHwxNjMyNzM4ODY2&ixlib=rb-1.2.1&q=80&w=400",
    altitude: 0,
    timestamp: new Date().toISOString().split('T')[0]
  };

  const marker = addPlaceToMap(newPlace);
  modal.classList.add('hidden');
  marker.openPopup();
});

// -----------------------------------------------------------------
// 4. Markör- & Popup-hantering
// -----------------------------------------------------------------
function createPopupContent(place, placeId) {
  const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lng}`;
  const googleEarthUrl = `https://earth.google.com/web/@${place.lat},${place.lng},0a,500d,35y,0h,0t,0r`;

  return `
    <div class="bg-white rounded-2xl overflow-hidden shadow-lg border border-slate-200" style="width: 280px; max-width: calc(100vw - 40px);">
      <div class="p-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
        <h3 class="font-bold text-base text-emerald-900 leading-tight pr-2">${place.title}</h3>
        <button onclick="window.removeCurrentMarker('${placeId}')" class="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition">🗑️</button>
      </div>
      <div class="px-3 py-1.5 bg-slate-50/50 border-b border-slate-100 flex items-center gap-2 text-xs font-semibold">
        <span class="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">${place.category}</span>
        <span class="text-slate-500">• ${place.distance} bort</span>
      </div>
      <div class="p-2">
        <img src="${place.imageUrl}" class="w-full h-32 object-cover rounded-xl">
      </div>
      <div class="px-3 py-1.5 text-xs text-slate-600 bg-slate-50/50 italic border-y border-slate-100">
        "${place.description}"
      </div>
      <div class="p-3 space-y-1 text-xs text-slate-700">
        <div>📍 <span class="font-mono text-slate-600">${place.lat.toFixed(5)}, ${place.lng.toFixed(5)}</span></div>
        <div>🕐 <strong>Tid:</strong> ${place.timestamp}</div>
      </div>
      <div class="p-2.5 bg-slate-100 border-t border-slate-200 flex gap-2">
        <a href="${googleEarthUrl}" target="_blank" class="flex-1 text-center bg-blue-50 text-blue-700 border border-blue-200 py-1.5 rounded-xl text-xs font-semibold">🌐 Earth 3D</a>
        <a href="${googleMapsUrl}" target="_blank" class="flex-1 text-center bg-emerald-50 text-emerald-700 border border-emerald-200 py-1.5 rounded-xl text-xs font-semibold">🗺️ Maps</a>
      </div>
    </div>
  `;
}

window.removeCurrentMarker = function(placeId) {
  const marker = markerMap.get(placeId);
  if (marker && confirm("Vill du ta bort denna markör?")) {
    map.removeLayer(marker);
    savedMarkers = savedMarkers.filter(m => m !== marker);
    markerMap.delete(placeId);
    updateMarkerCount();
  }
};

function updateMarkerCount() {
  document.querySelectorAll('.marker-count-val').forEach(el => el.innerText = savedMarkers.length);
}

function addPlaceToMap(place) {
  const placeId = 'marker_' + Date.now();
  const marker = L.marker([place.lat, place.lng], { icon: mushroomIcon }).addTo(map);
  markerMap.set(placeId, marker);
  marker.bindPopup(createPopupContent(place, placeId));
  savedMarkers.push(marker);
  updateMarkerCount();
  return marker;
}

// -----------------------------------------------------------------
// 5. GPS-spårning
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

  if (userPositionMarker && userAccuracyCircle) {
    userPositionMarker.setLatLng([latitude, longitude]);
    userAccuracyCircle.setLatLng([latitude, longitude]);
    userAccuracyCircle.setRadius(accuracy);
  } else {
    userAccuracyCircle = L.circle([latitude, longitude], { radius: accuracy, color: '#3b82f6', weight: 1, fillColor: '#3b82f6', fillOpacity: 0.15 }).addTo(map);
    userPositionMarker = L.marker([latitude, longitude], { icon: myLocationIcon, zIndexOffset: 1000 }).addTo(map);
  }


if (autoCenter) map.flyTo([latitude, longitude], 16, { 
    duration: 1.5, // Tiden i sekunder för animeringen
    easeLinearity: 0.25 
});

  
  
  
}

if ('geolocation' in navigator) {
  let initialCenter = false;
  navigator.geolocation.watchPosition(
    (pos) => { updatePosition(pos, !initialCenter); initialCenter = true; },
    (err) => console.warn(err.message),
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 2000 }
  );
}


document.getElementById('btn-recenter').addEventListener('click', () => {
  if (currentCoords) map.flyTo(currentCoords, 16, { animate: true, duration: 1.5 });
});


if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(err => console.log(err));
}

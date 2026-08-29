//
// filename: app.js
//

import { SCRIPT_URL, CATEGORIES } from './config.js';
import { saveMarkerLocally, compressImage, getLocalMarkers } from './storage.js';
import { initAutoSync, syncPendingMarkers } from './sync.js';
import { deleteMarker } from './db.js';
import { exportToGPX, exportToJSON, importFromJSON } from './exporter.js';

// Initiera synk-lyssnaren direkt vid appstart
try { initAutoSync(); } catch (e) { console.warn(e); }

// Globalt tillstånd
let safeCategories = Array.isArray(CATEGORIES) && CATEGORIES.length > 0 ? CATEGORIES : [{ id: 'default', name: 'Skogsfynd', group: 'Övrigt', iconSvg: '📍' }];
let selectedCategory = safeCategories[0];
let selectedAmount = 'Rikligt med fynd';
let savedPlaces = [];
let markersMap = {};
let userPositionMarker = null;
let userAccuracyCircle = null;
let currentCoords = null;
let currentPhotoBase64 = null;
let activeCategoryFilter = 'all';
let searchQuery = '';
let currentSortMode = 'newest'; 
let currentHeading = 0;

// Navigering ("Gå hit")
let targetMarkerId = null;
let navigationLine = null;

// Initiera kartan centrerad på Sverige (med maxZoom angiven)
const map = L.map('map', { 
    zoomControl: false, 
    maxZoom: 18 
}).setView([62.0, 15.0], 5);

// Skapa klustergruppen för markörer och lägg till den på kartan
const markerClusterGroup = L.markerClusterGroup({
    disableClusteringAtZoom: 16,
    maxClusterRadius: 40
});
map.addLayer(markerClusterGroup);

setTimeout(() => {
    map.invalidateSize();
}, 100);

L.control.zoom({ position: 'bottomright' }).addTo(map);

// Initiera och ladda sparade markörer när sidan har laddats
document.addEventListener('DOMContentLoaded', () => {
    try {
        savedPlaces = [];

        // 1. Hämta lokalt först för direkt visning
        const stored = getLocalMarkers();
        if (stored && stored.length > 0) {
            savedPlaces = stored.map(place => ({
                ...place,
                id: String(place.id)
            }));
            savedPlaces.forEach(place => addPlaceToMap(place));
        }

        // 2. Hämta från Google Sheets om online
        if (navigator.onLine) {
            fetch(SCRIPT_URL)
                .then(res => res.json())
                .then(remoteData => {
                    if (Array.isArray(remoteData) && remoteData.length > 0) {
                        const pendingDeletes = JSON.parse(localStorage.getItem('pendingDeletes') || '[]');
                        const loadedPlaces = [];

                        markerClusterGroup.clearLayers();
                        markersMap = {};

                        remoteData.forEach((item, index) => {
                            if (item.latitude === undefined && item.lat === undefined) return;

                            const itemId = String(item.id || item.Id || `marker_${Date.now()}_${index}`);
                            if (pendingDeletes.includes(itemId)) return;

                            const lat = Number(item.latitude !== undefined ? item.latitude : item.lat);
                            const lng = Number(item.longitude !== undefined ? item.longitude : item.lng);

                            if (isNaN(lat) || isNaN(lng)) return;

                            const formatted = {
                                id: itemId,
                                lat: lat,
                                lng: lng,
                                title: item.title || item.Title || 'Skogsfynd',
                                categoryGroup: item.category || item.Category || 'Övrigt',
                                category: item.category || item.Category || 'Övrigt',
                                description: item.description || item.Description || '',
                                photo: item.photo || item.Photo || item.photoUrl || null,
                                timestamp: item.timestamp || item.Timestamp || '',
                                synced: true
                            };

                            loadedPlaces.push(formatted);
                            addPlaceToMap(formatted);
                        });

                        savedPlaces = loadedPlaces;
                        updateMarkerCount();
                        renderListView();
                        renderFilterChips();
                        updateMapFilterBadge();
                    }
                })
                .catch(sheetErr => console.warn("Kunde inte hämta från Google Sheets:", sheetErr));
        }

        updateMarkerCount();
        renderListView();
        renderFilterChips();
        updateMapFilterBadge();

        try { syncPendingMarkers(); } catch(e) {}
    } catch (err) {
        console.error("Fel vid laddning av markörer:", err);
    }
    
    // Sorteringsknappar
    const btnSortNewest = document.getElementById('sort-newest');
    const btnSortDistance = document.getElementById('sort-distance');

    btnSortNewest?.addEventListener('click', () => {
        currentSortMode = 'newest';
        btnSortNewest.classList.add('bg-white', 'text-slate-800', 'shadow-sm');
        btnSortNewest.classList.remove('text-slate-600');
        btnSortDistance.classList.remove('bg-white', 'text-slate-800', 'shadow-sm');
        btnSortDistance.classList.add('text-slate-600');
        renderListView();
    });

    btnSortDistance?.addEventListener('click', () => {
        if (!currentCoords) {
            alert("Väntar på GPS-position för att kunna beräkna avstånd...");
            return;
        }
        currentSortMode = 'distance';
        btnSortDistance.classList.add('bg-white', 'text-slate-800', 'shadow-sm');
        btnSortDistance.classList.remove('text-slate-600');
        btnSortNewest.classList.remove('bg-white', 'text-slate-800', 'shadow-sm');
        btnSortNewest.classList.add('text-slate-600');
        renderListView();
    });

});

// -----------------------------------------------------------------
// 1. Kartlager & Kartväljare
// -----------------------------------------------------------------
const baseTileUrl = 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png';

const tileLayers = {
    topo: L.tileLayer(baseTileUrl, {
        maxZoom: 17,
        attribution: '© OpenTopoMap',
        subdomains: 'abc'
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
            if (!tileLayers[layerKey]) return;

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
// 3. Bildkomprimering & Kategoriinmatning
// -----------------------------------------------------------------
document.getElementById('input-photo')?.addEventListener('change', async function(e) {
    const file = e.target.files[0];
    if (!file) return;

    try {
        currentPhotoBase64 = await compressImage(file);
        const preview = document.getElementById('photo-preview');
        const previewContainer = document.getElementById('photo-preview-container');

        if (preview && previewContainer) {
            preview.src = currentPhotoBase64;
            previewContainer.classList.remove('hidden');
        }
    } catch (err) {
        console.error("Fel vid bildkomprimering:", err);
    }
});

function renderCategoryGrid() {
    const grid = document.getElementById('category-grid');
    if (!grid) return;
    grid.innerHTML = safeCategories.map(cat => {
        const isSelected = selectedCategory && cat.id === selectedCategory.id;
        return `
        <button data-id="${cat.id}" type="button" class="category-btn p-2 rounded-2xl border flex flex-col items-center justify-center gap-1 transition ${isSelected ? 'border-emerald-600 bg-emerald-50 text-emerald-900 font-bold shadow-sm' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}">
          <div class="flex items-center justify-center h-7 w-7">
            ${cat.iconSvg || '📍'}
          </div>
          <span class="text-[10px] leading-tight text-center">${cat.name}</span>
        </button>
        `;
    }).join('');

    document.querySelectorAll('.category-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const catId = e.currentTarget.getAttribute('data-id');
            selectedCategory = safeCategories.find(c => c.id === catId) || safeCategories[0];
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

function closeModal() {
    if (modal) modal.classList.add('hidden');
}

document.getElementById('btn-mark')?.addEventListener('click', () => {
    if (currentCoords) {
        const coordsEl = document.getElementById('modal-coords');
        if (coordsEl) coordsEl.innerText = `${currentCoords[0].toFixed(6)}, ${currentCoords[1].toFixed(6)}`;

        if (!selectedCategory) selectedCategory = safeCategories[0];
        const titleInput = document.getElementById('input-title');
        if (titleInput) titleInput.value = selectedCategory.name;

        renderCategoryGrid();
        if (modal) modal.classList.remove('hidden');
    } else {
        alert("Väntar på din GPS-position...");
    }
});

document.getElementById('modal-close')?.addEventListener('click', closeModal);

// -----------------------------------------------------------------
// 4. Hantering & Spara
// -----------------------------------------------------------------
document.getElementById('btn-save-confirm')?.addEventListener('click', async (e) => {
    e.preventDefault();

    if (!currentCoords) {
        alert("GPS-position saknas.");
        return;
    }

    try {
        const title = document.getElementById('input-title')?.value || selectedCategory?.name || 'Skogsfynd';
        const notes = document.getElementById('input-notes')?.value || '';
        const catGroup = selectedCategory?.group || selectedCategory?.name || 'Övrigt';

        const photoInput = document.getElementById('input-photo');
        let photoBase64 = currentPhotoBase64;

        if (photoInput && photoInput.files && photoInput.files[0] && !photoBase64) {
            photoBase64 = await compressImage(photoInput.files[0]);
        }

        const newMarkerData = {
            id: 'marker_' + Date.now(),
            title: title,
            categoryGroup: catGroup,
            category: catGroup,
            description: notes ? `${selectedAmount}. ${notes}` : selectedAmount,
            amount: selectedAmount,
            notes: notes,
            lat: currentCoords[0],
            lng: currentCoords[1],
            photo: photoBase64,
            timestamp: new Date().toISOString(),
            synced: false,
            syncStatus: 'pending'
        };

        const savedMarker = saveMarkerLocally(newMarkerData);

        savedPlaces.push(savedMarker);
        addPlaceToMap(savedMarker);
        updateMarkerCount();
        renderListView();
        renderFilterChips();

        currentPhotoBase64 = null;
        document.getElementById('photo-preview-container')?.classList.add('hidden');
        const notesInput = document.getElementById('input-notes');
        if (notesInput) notesInput.value = '';

        closeModal();

        if (markersMap[savedMarker.id]) {
            markersMap[savedMarker.id].openPopup();
        }

        try { syncPendingMarkers(); } catch(e){}

    } catch (err) {
        console.error("Fel vid sparande av markör:", err);
        alert(`Kunde inte spara:\n${err?.message || err}`);
    }
});

// -----------------------------------------------------------------
// 5. Markör & Kartvisning
// -----------------------------------------------------------------
function createPopupContent(place) {
    const latNum = Number(place.lat);
    const lngNum = Number(place.lng);
    const latFormatted = !isNaN(latNum) ? latNum.toFixed(5) : '0.00000';
    const lngFormatted = !isNaN(lngNum) ? lngNum.toFixed(5) : '0.00000';

    const titleText = place.title || place.name || 'Skogsfynd';
    const noteText = place.description || place.notes || place.note || '';
    const categoryText = place.category || place.categoryGroup || 'Övrigt';

    const notesHTML = noteText 
        ? `<p class="text-xs text-slate-600 italic mt-2 leading-relaxed">"${noteText}"</p>` 
        : `<p class="text-xs text-slate-400 italic mt-2">Inga anteckningar angivna.</p>`;

    const isNavigating = targetMarkerId === String(place.id);

    return `
    <div style="min-width: 230px; width: 230px;" class="p-1">
      <div class="flex items-start justify-between gap-2 mb-1">
        <h3 class="font-bold text-slate-900 text-sm leading-snug">${titleText}</h3>
        <button onclick="window.removeCurrentMarker('${place.id}')" class="text-slate-400 hover:text-red-500 p-1 rounded-lg hover:bg-red-50 transition flex-shrink-0" title="Ta bort">
          🗑️
        </button>
      </div>

      <span class="inline-block bg-emerald-100 text-emerald-800 text-[11px] font-medium px-2.5 py-0.5 rounded-full mb-1">
        ${categoryText}
      </span>

      ${notesHTML}

      <div class="text-[11px] text-slate-500 mt-2 font-mono">
        📍 ${latFormatted}, ${lngFormatted}
      </div>

      <div class="grid grid-cols-2 gap-2 mt-3 pt-2 border-t border-slate-100">
        <button onclick="toggleRouteTo('${place.id}', ${place.lat}, ${place.lng})" 
                class="w-full ${isNavigating ? 'bg-rose-600 hover:bg-rose-700' : 'bg-emerald-600 hover:bg-emerald-700'} text-white font-medium text-xs py-2 px-2 rounded-lg flex items-center justify-center gap-1 shadow-sm transition-colors">
            🧭 ${isNavigating ? 'Avbryt' : 'Gå hit'}
        </button>
        
        <button onclick="openExternalMap(${place.lat}, ${place.lng})" 
                class="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium text-xs py-2 px-2 rounded-lg flex items-center justify-center gap-1 border border-slate-200 transition-colors">
            🗺️ Karta
        </button>
      </div>
    </div>
  `;
}

function updateMarkerCount() {
    const searchQuery = (document.getElementById('search-input')?.value || '').toLowerCase().trim();

    const visiblePlaces = savedPlaces.filter(item => {
        const itemCategory = item.category || item.categoryGroup || 'Övrigt';
        const matchesCategory = activeCategoryFilter === 'all' || itemCategory === activeCategoryFilter;

        const titleMatch = (item.title || '').toLowerCase().includes(searchQuery);
        const notesMatch = (item.notes || item.description || '').toLowerCase().includes(searchQuery);
        const matchesSearch = titleMatch || notesMatch;

        return matchesCategory && matchesSearch;
    });

    document.querySelectorAll('.marker-count-val').forEach(el => {
        el.innerText = visiblePlaces.length;
    });
}

function getCategoryIcon(place) {
    const title = (place.title || '').toLowerCase().trim();
    const category = (place.category || place.categoryGroup || '').toLowerCase().trim();

    const titleMatch = CATEGORIES.find(c => c.name.toLowerCase() === title || c.id.toLowerCase() === title);
    if (titleMatch) return titleMatch.iconSvg;

    const categoryMatch = CATEGORIES.find(c => c.name.toLowerCase() === category || c.group.toLowerCase() === category);
    if (categoryMatch) return categoryMatch.iconSvg;

    return `<svg viewBox="0 0 36 36" class="w-6 h-6"><circle cx="18" cy="14" r="7" fill="#EF4444"/><path fill="#DC2626" d="M18 21l-5 11h10l-5-11z"/><circle cx="18" cy="14" r="3" fill="#FFFFFF"/></svg>`;
}

function addPlaceToMap(place) {
    if (markersMap[place.id]) {
        map.removeLayer(markersMap[place.id]);
    }

    const svgIconHtml = getCategoryIcon(place);

    const customIcon = L.divIcon({
        className: 'custom-map-pin',
        html: `
        <div style="
          background: white;
          border: 2px solid #059669;
          border-radius: 50%;
          width: 36px;
          height: 36px;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 2px 6px rgba(0,0,0,0.3);
        ">
          ${svgIconHtml}
        </div>
        `,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
        popupAnchor: [0, -18]
    });

    const marker = L.marker([Number(place.lat), Number(place.lng)], { icon: customIcon });
    marker.bindPopup(createPopupContent(place));

    const itemCategory = place.category || place.categoryGroup || 'Övrigt';
    const isVisible = activeCategoryFilter === 'all' || itemCategory === activeCategoryFilter;

    if (isVisible) {
        markerClusterGroup.addLayer(marker);
    }

    markersMap[place.id] = marker;
}

function focusMarkerOnMap(id) {
    const place = savedPlaces.find(p => String(p.id) === String(id));
    if (!place) return;

    document.getElementById('list-view')?.classList.add('hidden');
    document.getElementById('map-view')?.classList.remove('hidden');
    updateTabStyles(document.getElementById('btn-show-map'), document.getElementById('btn-show-list'));
    
    map.invalidateSize();

    map.flyTo([Number(place.lat), Number(place.lng)], 17, { animate: true });
    if (markersMap[id]) {
        markersMap[id].openPopup();
    }
}

window.focusMarkerOnMap = focusMarkerOnMap;

// -----------------------------------------------------------------
// 6. GPS-spårning
// -----------------------------------------------------------------

const myLocationIcon = L.divIcon({
    className: 'my-location-marker',
    html: `
        <div style="position: relative; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center;">
            <div class="animate-ping" style="position: absolute; width: 24px; height: 24px; background: rgba(59, 130, 246, 0.4); border-radius: 50%;"></div>
            <div style="position: absolute; width: 14px; height: 14px; background: #2563eb; border: 2px solid #ffffff; border-radius: 50%; box-shadow: 0 0 6px rgba(0,0,0,0.35); z-index: 2;"></div>
            <div id="user-heading-arrow" style="position: absolute; width: 36px; height: 36px; transition: transform 0.2s ease-out; z-index: 1;">
                <svg viewBox="0 0 24 24" style="width: 100%; height: 100%; fill: #2563eb; filter: drop-shadow(0px 1px 2px rgba(0,0,0,0.4));">
                    <path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z"/>
                </svg>
            </div>
        </div>
    `,
    iconSize: [36, 36],
    iconAnchor: [18, 18]
});

function updatePosition(position, autoCenter = false) {
    const { latitude, longitude, accuracy } = position.coords;
    currentCoords = [latitude, longitude];
    
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

    // Uppdatera navigeringslinjen i realtid när GPS flyttar på sig
    if (targetMarkerId && navigationLine) {
        const target = savedPlaces.find(p => String(p.id) === String(targetMarkerId));
        if (target) {
            navigationLine.setLatLngs([[latitude, longitude], [Number(target.lat), Number(target.lng)]]);
        }
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
        (pos) => {
            updatePosition(pos, !initialCenter);
            initialCenter = true;
        },
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
// Kompass & Utjämning
// -----------------------------------------------------------------
let hasReceivedAbsolute = false;

function getAbsoluteHeading(event) {
    if (event.webkitCompassHeading !== undefined && event.webkitCompassHeading !== null) {
        return event.webkitCompassHeading;
    }

    if (event.alpha !== null && event.alpha !== undefined) {
        let heading = 360 - event.alpha;
        const screenOrientation = window.orientation || (screen.orientation && screen.orientation.angle) || 0;
        heading = (heading + screenOrientation) % 360;
        return heading < 0 ? heading + 360 : heading;
    }

    return null;
}

function handleOrientation(event) {
    const rawHeading = getAbsoluteHeading(event);
    if (rawHeading === null) return;

    if (event.type === 'deviceorientationabsolute') {
        hasReceivedAbsolute = true;
    }

    if (event.type === 'deviceorientation' && hasReceivedAbsolute) {
        return;
    }

    if (currentHeading === null) {
        currentHeading = rawHeading;
    } else {
        let diff = rawHeading - currentHeading;
        if (diff > 180) diff -= 360;
        if (diff < -180) diff += 360;
        
        currentHeading += diff;
    }

    updateMarkerRotation(currentHeading);
}

function updateMarkerRotation(heading) {
    const arrowEl = document.getElementById('user-heading-arrow');
    if (arrowEl) {
        arrowEl.style.transition = 'transform 0.3s ease-out';
        arrowEl.style.transform = `rotate(${heading}deg)`;
    }
}

if (window.DeviceOrientationEvent) {
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
        DeviceOrientationEvent.requestPermission().then(state => {
            if (state === 'granted') {
                window.addEventListener('deviceorientation', handleOrientation, true);
            }
        }).catch(console.error);
    } else {
        window.addEventListener('deviceorientationabsolute', handleOrientation, true);
        window.addEventListener('deviceorientation', handleOrientation, true);
    }
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

function applyCategoryFilter(category) {
    activeCategoryFilter = category;

    Object.keys(markersMap).forEach(id => {
        const marker = markersMap[id];
        const place = savedPlaces.find(p => String(p.id) === String(id));

        if (!place) return;

        const itemCategory = place.category || place.categoryGroup || 'Övrigt';
        const isVisible = activeCategoryFilter === 'all' || itemCategory === activeCategoryFilter;

        if (isVisible) {
            if (!map.hasLayer(marker)) marker.addTo(map);
        } else {
            if (map.hasLayer(marker)) map.removeLayer(marker);
        }
    });
    
    applySearchFilter();
    renderFilterChips();
    renderListView();
    updateMapFilterBadge();
    updateMarkerCount();
}

function renderSearchSuggestions() {
    const container = document.getElementById('search-suggestions');
    const searchInput = document.getElementById('search-input');
    if (!container || !searchInput) return;

    const query = searchInput.value.toLowerCase().trim();

    if (query.length === 0) {
        container.innerHTML = '';
        container.classList.add('hidden');
        return;
    }

    const matches = new Set();
    
    savedPlaces.forEach(item => {
        const title = item.title || '';
        const category = item.category || item.categoryGroup || '';
        const notes = item.notes || item.description || '';

        if (title.toLowerCase().includes(query)) matches.add(title);
        if (category.toLowerCase().includes(query)) matches.add(category);
        if (notes.toLowerCase().includes(query)) matches.add(notes);
    });

    const suggestions = Array.from(matches).slice(0, 5);

    if (suggestions.length === 0) {
        container.innerHTML = '';
        container.classList.add('hidden');
        return;
    }

    container.innerHTML = suggestions.map(text => `
        <button type="button" class="suggestion-item w-full text-left px-4 py-2.5 text-xs text-slate-700 hover:bg-emerald-50 hover:text-emerald-900 transition flex items-center justify-between">
            <span class="truncate">${text}</span>
            <span class="text-[10px] text-slate-400 shrink-0 ml-2">🔍</span>
        </button>
    `).join('');

    container.classList.remove('hidden');

    container.querySelectorAll('.suggestion-item').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const selectedText = e.currentTarget.querySelector('.truncate')?.innerText || e.currentTarget.innerText;
            
            if (searchInput) {
                searchInput.value = selectedText.trim();
            }
            
            container.classList.add('hidden');
            applySearchFilter();
            updateMapFilterBadge();
        });
    });
}

function applySearchFilter() {
    const searchInput = document.getElementById('search-input');
    const searchClearBtn = document.getElementById('search-clear');
    searchQuery = (searchInput?.value || '').toLowerCase().trim();

    if (searchQuery.length > 0) {
        searchClearBtn?.classList.remove('hidden');
    } else {
        searchClearBtn?.classList.add('hidden');
    }

    Object.keys(markersMap).forEach(id => {
        const marker = markersMap[id];
        const place = savedPlaces.find(p => String(p.id) === String(id));
        if (!place) return;

        const itemCategory = place.category || place.categoryGroup || 'Övrigt';
        const matchesCategory = activeCategoryFilter === 'all' || itemCategory === activeCategoryFilter;

        const titleMatch = (place.title || '').toLowerCase().includes(searchQuery);
        const notesMatch = (place.notes || place.description || '').toLowerCase().includes(searchQuery);
        const matchesSearch = titleMatch || notesMatch;

        if (matchesCategory && matchesSearch) {
            if (!markerClusterGroup.hasLayer(marker)) {
                markerClusterGroup.addLayer(marker);
            }
        } else {
            if (markerClusterGroup.hasLayer(marker)) {
                markerClusterGroup.removeLayer(marker);
            }
        }
    });

    renderListView();
    updateMarkerCount();
}

function updateMapFilterBadge() {
    const badge = document.getElementById('active-filter-badge');
    const badgeText = document.getElementById('active-filter-text');
    if (!badge || !badgeText) return;

    const searchQuery = (document.getElementById('search-input')?.value || '').trim();

    if (searchQuery.length > 0) {
        badgeText.innerText = `Visar: ${searchQuery}`;
        badge.classList.remove('hidden');
    } else if (activeCategoryFilter !== 'all') {
        badgeText.innerText = `Visar: ${activeCategoryFilter}`;
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }
}

document.getElementById('active-filter-badge')?.addEventListener('click', (e) => {
    e.stopPropagation();

    const searchInput = document.getElementById('search-input');
    if (searchInput) searchInput.value = '';

    applySearchFilter();
    applyCategoryFilter('all');
    updateMapFilterBadge();
});

document.getElementById('search-input')?.addEventListener('input', () => {
    applySearchFilter();
    updateMapFilterBadge();
    renderSearchSuggestions();
});

document.getElementById('search-clear')?.addEventListener('click', () => {
    const searchInput = document.getElementById('search-input');
    if (searchInput) searchInput.value = '';
    applySearchFilter();
    updateMapFilterBadge();
    renderSearchSuggestions();
});

document.addEventListener('click', (e) => {
    const suggestions = document.getElementById('search-suggestions');
    const searchInput = document.getElementById('search-input');
    if (suggestions && !suggestions.contains(e.target) && e.target !== searchInput) {
        suggestions.classList.add('hidden');
    }
});

function renderListView() {
    const container = document.getElementById('list-container');
    if (!container) return;

    const searchQuery = (document.getElementById('search-input')?.value || '').toLowerCase().trim();
    
    let filtered = savedPlaces.filter(item => {
        const itemCategory = item.category || item.categoryGroup || 'Övrigt';
        const matchesCategory = activeCategoryFilter === 'all' || itemCategory === activeCategoryFilter;
        
        const titleMatch = (item.title || '').toLowerCase().includes(searchQuery);
        const notesMatch = (item.notes || item.description || '').toLowerCase().includes(searchQuery);
        const matchesSearch = titleMatch || notesMatch;

        return matchesCategory && matchesSearch;
    });

    updateMarkerCount();

    if (currentSortMode === 'distance' && currentCoords) {
        filtered.sort((a, b) => {
            const getMeters = (lat, lng) => {
                const R = 6371000;
                const dLat = (Number(lat) - currentCoords[0]) * Math.PI / 180;
                const dLon = (Number(lng) - currentCoords[1]) * Math.PI / 180;
                const aVal = Math.sin(dLat/2) * Math.sin(dLat/2) +
                             Math.cos(currentCoords[0] * Math.PI / 180) * Math.cos(Number(lat) * Math.PI / 180) *
                             Math.sin(dLon/2) * Math.sin(dLon/2);
                return R * 2 * Math.atan2(Math.sqrt(aVal), Math.sqrt(1-aVal));
            };

            return getMeters(a.lat, a.lng) - getMeters(b.lat, b.lng);
        });
    } else {
        filtered.sort((a, b) => (b.timestamp || b.id) - (a.timestamp || a.id));
    }

    if (filtered.length === 0) {
        container.innerHTML = `<div class="text-center py-8 text-slate-400 text-xs">Inga platser hittades</div>`;
        return;
    }

    container.innerHTML = filtered.map(item => {
        let distanceText = '';
        if (currentCoords) {
            const distFormatted = calculateDistance(currentCoords[0], currentCoords[1], Number(item.lat), Number(item.lng));
            if (distFormatted) {
                distanceText = `<span class="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md font-mono text-[10px] shrink-0">📍 ${distFormatted}</span>`;
            }
        }

        const iconSvg = getCategoryIcon(item);
        const noteText = item.notes || item.description || '';

        return `
            <div onclick="focusMarkerOnMap('${item.id}')" class="cursor-pointer bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm hover:border-emerald-400 hover:shadow transition space-y-2">
                <div class="flex items-center justify-between gap-2">
                    <div class="flex items-center gap-2 min-w-0">
                        <div class="w-8 h-8 rounded-full border border-emerald-600/30 flex items-center justify-center shrink-0 bg-white shadow-sm">
                            ${iconSvg}
                        </div>
                        <div class="min-w-0">
                            <h3 class="font-bold text-slate-800 text-xs leading-tight truncate">${item.title || 'Namnlös plats'}</h3>
                            <p class="text-[10px] text-slate-400 mt-0.5 truncate">${item.category || item.categoryGroup || 'Övrigt'}</p>
                        </div>
                    </div>
                    ${distanceText}
                </div>
                ${noteText ? `<p class="text-xs text-slate-600 bg-slate-50 p-2 rounded-xl border border-slate-100 italic leading-relaxed">"${noteText}"</p>` : ''}
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
        renderFilterChips();
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

function renderFilterChips() {
    const chipsContainer = document.getElementById('filter-chips');
    if (!chipsContainer) return;

    const uniqueCategories = Array.from(
        new Set(savedPlaces.map(item => item.category || item.categoryGroup || 'Övrigt'))
    ).filter(Boolean);

    let html = `
    <button data-filter="all" class="filter-chip shrink-0 px-3 py-1.5 rounded-full ${
        activeCategoryFilter === 'all'
        ? 'bg-emerald-600 text-white font-semibold shadow-sm'
        : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
    }">
      Alla (${savedPlaces.length})
    </button>
    `;

    html += uniqueCategories.map(cat => {
        const count = savedPlaces.filter(p => (p.category || p.categoryGroup || 'Övrigt') === cat).length;
        const isSelected = activeCategoryFilter === cat;

        return `
        <button data-filter="${cat}" class="filter-chip shrink-0 px-3 py-1.5 rounded-full transition ${
            isSelected
            ? 'bg-emerald-600 text-white font-semibold shadow-sm'
            : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
        }">
          ${cat} (${count})
        </button>
        `;
    }).join('');

    chipsContainer.innerHTML = html;

    chipsContainer.querySelectorAll('.filter-chip').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const selectedCat = e.currentTarget.getAttribute('data-filter');
            applyCategoryFilter(selectedCat);
        });
    });
}

// -----------------------------------------------------------------
// 8. Hamburgermeny & GPX / JSON Export
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
}

document.getElementById('btn-export-gpx')?.addEventListener('click', () => {
    exportToGPX(savedPlaces);
});

document.getElementById('btn-export-json')?.addEventListener('click', () => {
    exportToJSON(savedPlaces);
});

document.getElementById('input-import-json')?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    importFromJSON(file, (importedPlaces) => {
        let addedCount = 0;

        importedPlaces.forEach(item => {
            const exists = savedPlaces.some(p => String(p.id) === String(item.id));
            
            if (!exists && item.lat && item.lng) {
                const formatted = {
                    ...item,
                    id: String(item.id || `marker_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`)
                };

                saveMarkerLocally(formatted);
                savedPlaces.push(formatted);
                addPlaceToMap(formatted);
                addedCount++;
            }
        });

        updateMarkerCount();
        renderListView();
        renderFilterChips();

        alert(`Återställning klar! Importerade ${addedCount} nya platser.`);
        e.target.value = '';
    });
});

// -----------------------------------------------------------------
// 9. Bekräftelsemodal (Promise-baserad)
// -----------------------------------------------------------------
function showConfirm(message, title = "Ta bort markör") {
    return new Promise((resolve) => {
        const modal = document.getElementById('confirm-modal');
        const msgEl = document.getElementById('confirm-modal-msg');
        const titleEl = document.getElementById('confirm-modal-title');
        const btnOk = document.getElementById('confirm-modal-ok');
        const btnCancel = document.getElementById('confirm-modal-cancel');

        if (!modal) {
            resolve(confirm(message));
            return;
        }

        if (msgEl) msgEl.innerText = message;
        if (titleEl) titleEl.innerText = title;

        modal.classList.remove('hidden');

        const cleanup = () => {
            modal.classList.add('hidden');
            btnOk.removeEventListener('click', onOk);
            btnCancel.removeEventListener('click', onCancel);
        };

        const onOk = () => { cleanup(); resolve(true); };
        const onCancel = () => { cleanup(); resolve(false); };

        btnOk.addEventListener('click', onOk);
        btnCancel.addEventListener('click', onCancel);
    });
}

window.removeCurrentMarker = async function(id) {
    const confirmed = await showConfirm("Vill du ta bort denna markör?", "Ta bort markör");
    if (!confirmed) return;

    try {
        await deleteMarker(id);

        if (navigator.onLine) {
            fetch(SCRIPT_URL, {
                method: 'POST',
                mode: 'no-cors',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({ action: 'delete', id: id })
            }).catch(err => console.warn("Kunde inte radera från Sheets:", err));
        } else {
            const pendingDeletes = JSON.parse(localStorage.getItem('pendingDeletes') || '[]');
            pendingDeletes.push(id);
            localStorage.setItem('pendingDeletes', JSON.stringify(pendingDeletes));
        }

        if (markersMap[id]) {
            markerClusterGroup.removeLayer(markersMap[id]);
            delete markersMap[id];
        }

        savedPlaces = savedPlaces.filter(p => String(p.id) !== String(id));
        updateMarkerCount();
        renderListView();
        renderFilterChips();
        updateMapFilterBadge();
        map.closePopup();

    } catch (err) {
        alert("Kunde inte radera markören: " + (err.message || err));
    }
};

// -----------------------------------------------------------------
// 10. Ruttritning & Externa Kartor
// -----------------------------------------------------------------
function toggleRouteTo(id, destLat, destLng) {
    if (targetMarkerId === String(id)) {
        stopRouteTo();
    } else {
        targetMarkerId = String(id);
        drawRouteTo(destLat, destLng);
    }
    map.closePopup();
}

function drawRouteTo(destLat, destLng) {
    if (!currentCoords) {
        alert("Din position är inte tillgänglig ännu. Se till att GPS är aktiverat.");
        return;
    }

    if (navigationLine) {
        map.removeLayer(navigationLine);
    }

    const startLat = currentCoords[0];
    const startLng = currentCoords[1];

    navigationLine = L.polyline(
        [[startLat, startLng], [destLat, destLng]], 
        {
            color: '#2563eb',
            weight: 4,
            dashArray: '8, 8',
            opacity: 0.8
        }
    ).addTo(map);

    const bounds = L.latLngBounds([[startLat, startLng], [destLat, destLng]]);
    map.fitBounds(bounds, { padding: [50, 50] });
}

function stopRouteTo() {    
    targetMarkerId = null;
    if (navigationLine) {
        map.removeLayer(navigationLine);
        navigationLine = null;
    }
}

function openExternalMap(lat, lng) {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
    window.open(url, '_blank');
}

window.toggleRouteTo = toggleRouteTo;
window.drawRouteTo = drawRouteTo;
window.stopRouteTo = stopRouteTo;
window.openExternalMap = openExternalMap;

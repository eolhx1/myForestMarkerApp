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
let currentAccuracy = 0;
let currentPhotoBase64 = null;
let activeCategoryFilter = 'all';
let searchQuery = '';
let currentSortMode = 'newest'; 
let activeNavMarkerId = null;
let navLine = null;
let currentHeading = 0;



// Initiera kartan centrerad på Sverige (med maxZoom angiven)
const map = L.map('map', { 
    zoomControl: false, 
    maxZoom: 18 
}).setView([62.0, 15.0], 5);


// Skapa klustergruppen för markörer och lägg till den på kartan
const markerClusterGroup = L.markerClusterGroup({
    disableClusteringAtZoom: 16, // Slutar klustra när du zoomar in tillräckligt nära
    maxClusterRadius: 40         // Radie i pixlar för hur tätt markörer samlas
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

        // 1. Hämta lokalt först för direkt visning (snabbare upplevelse)
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
                        const loadedPlaces = [];

                        remoteData.forEach((item, index) => {
                            if (item.latitude === undefined && item.lat === undefined) return;

                            const lat = Number(item.latitude !== undefined ? item.latitude : item.lat);
                            const lng = Number(item.longitude !== undefined ? item.longitude : item.lng);

                            if (isNaN(lat) || isNaN(lng)) return;

                            const formatted = {
                                id: String(item.id || item.Id || `marker_${Date.now()}_${index}`),
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

}); // Stänger DOMContentLoaded



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
        const accEl = document.getElementById('modal-accuracy');
        if (coordsEl) coordsEl.innerText = `${currentCoords[0].toFixed(6)}, ${currentCoords[1].toFixed(6)}`;
        if (accEl) accEl.innerText = `±${Math.round(currentAccuracy)}m`;

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
    // Rendera anteckningar eller standardtext om anteckningar saknas
    const notesContent = place.notes 
        ? `<p class="text-xs text-gray-600 italic mt-2">${place.notes}</p>` 
        : `<p class="text-xs text-gray-400 italic mt-2">Inga anteckningar angivna.</p>`;

    return `
        <div class="p-1 min-w-[220px]">
            <div class="flex justify-between items-start">
                <h3 class="font-bold text-gray-900 text-sm">${place.name}</h3>
                <button onclick="deletePlace('${place.id}')" class="text-gray-400 hover:text-red-500 transition-colors p-1" title="Ta bort">
                    🗑️
                </button>
            </div>
            
            <span class="inline-block bg-emerald-100 text-emerald-800 text-[10px] font-medium px-2 py-0.5 rounded-full mt-1">
                ${place.category || 'Svamp'}
            </span>

            ${notesContent}

            <p class="text-[11px] text-gray-400 mt-2 flex items-center gap-1">
                📍 ${place.lat.toFixed(5)}, ${place.lng.toFixed(5)}
            </p>

            <!-- Knapprad med en knapp till vänster och en till höger -->
            <div class="grid grid-cols-2 gap-2 mt-4 pt-2 border-t border-gray-100">
                <button onclick="drawRouteTo(${place.lat}, ${place.lng})" 
                        class="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 shadow-sm transition-colors">
                    🧭 Gå hit
                </button>
                
                <button onclick="openExternalMap(${place.lat}, ${place.lng})" 
                        class="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium text-xs py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 border border-gray-200 transition-colors">
                    🗺️ Karta
                </button>
            </div>
        </div>
    `;
}


function updateMarkerCount() {
    const searchQuery = (document.getElementById('search-input')?.value || '').toLowerCase().trim();

    // Räkna hur många platser som faktiskt matchar både sökning och aktiv kategori
    const visiblePlaces = savedPlaces.filter(item => {
        const itemCategory = item.category || item.categoryGroup || 'Övrigt';
        const matchesCategory = activeCategoryFilter === 'all' || itemCategory === activeCategoryFilter;

        const titleMatch = (item.title || '').toLowerCase().includes(searchQuery);
        const notesMatch = (item.notes || item.description || '').toLowerCase().includes(searchQuery);
        const matchesSearch = titleMatch || notesMatch;

        return matchesCategory && matchesSearch;
    });

    // Uppdatera "Lista (X)" med antalet synliga/filtrerade platser
    document.querySelectorAll('.marker-count-val').forEach(el => {
        el.innerText = visiblePlaces.length;
    });
}




// Slår upp SVG-ikonen från CATEGORIES (kollar först exakt fyndnamn, sedan kategori)
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

// -----------------------------------------------------------------
// 6. GPS-spårning
// -----------------------------------------------------------------

const myLocationIcon = L.divIcon({
    className: 'my-location-marker',
    html: `
        <div style="position: relative; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center;">
            <!-- Pulserande bakgrundscirkel -->
            <div class="animate-ping" style="position: absolute; width: 24px; height: 24px; background: rgba(59, 130, 246, 0.4); border-radius: 50%;"></div>
            
            <!-- Blå GPS-punkt -->
            <div style="position: absolute; width: 14px; height: 14px; background: #2563eb; border: 2px solid #ffffff; border-radius: 50%; box-shadow: 0 0 6px rgba(0,0,0,0.35); z-index: 2;"></div>
            
            <!-- Roterande kompasspil -->
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

    if (activeNavMarkerId && savedPlaces.length > 0) {
        const target = savedPlaces.find(p => String(p.id) === String(activeNavMarkerId));
        if (target) {
            const targetCoords = [Number(target.lat), Number(target.lng)];
            if (navLine) {
                navLine.setLatLngs([[latitude, longitude], targetCoords]);
            } else {
                navLine = L.polyline([[latitude, longitude], targetCoords], {
                    color: '#2563eb',
                    weight: 4,
                    dashArray: '8, 8'
                }).addTo(map);
            }
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
const SMOOTHING_FACTOR = 0.15;
const MIN_CHANGE = 2;

function handleOrientation(event) {
    let rawHeading = null;
    if (event.webkitCompassHeading) {
        rawHeading = event.webkitCompassHeading;
    } else if (event.alpha !== null) {
        rawHeading = 360 - event.alpha;
    }

    if (rawHeading === null) return;

    if (currentHeading === null || currentHeading === 0) {
        currentHeading = rawHeading;
        updateMarkerRotation(currentHeading);
        return;
    }

    let diff = rawHeading - currentHeading;
    if (diff > 180) diff -= 360;
    if (diff < -180) diff += 360;

    if (Math.abs(diff) < MIN_CHANGE) return;

    currentHeading = currentHeading + (diff * SMOOTHING_FACTOR);
    currentHeading = (currentHeading + 360) % 360;

    updateMarkerRotation(currentHeading);
}

function updateMarkerRotation(heading) {
    const arrowEl = document.getElementById('user-heading-arrow');
    if (arrowEl) {
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
        window.addEventListener('deviceorientationabsolute', handleOrientation, true) ||
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

    // Dölj dropdown om sökfältet är tomt
    if (query.length === 0) {
        container.innerHTML = '';
        container.classList.add('hidden');
        return;
    }

    const matches = new Set();
    
    // Sök igenom alla titlar, kategorier och anteckningar
    savedPlaces.forEach(item => {
        const title = item.title || '';
        const category = item.category || item.categoryGroup || '';
        const notes = item.notes || item.description || '';

        if (title.toLowerCase().includes(query)) matches.add(title);
        if (category.toLowerCase().includes(query)) matches.add(category);
        if (notes.toLowerCase().includes(query)) matches.add(notes);
    });

    const suggestions = Array.from(matches).slice(0, 5); // Visa max 5 förslag

    if (suggestions.length === 0) {
        container.innerHTML = '';
        container.classList.add('hidden');
        return;
    }

    // Generera förslagslistan
    container.innerHTML = suggestions.map(text => `
        <button type="button" class="suggestion-item w-full text-left px-4 py-2.5 text-xs text-slate-700 hover:bg-emerald-50 hover:text-emerald-900 transition flex items-center justify-between">
            <span class="truncate">${text}</span>
            <span class="text-[10px] text-slate-400 shrink-0 ml-2">🔍</span>
        </button>
    `).join('');

    container.classList.remove('hidden');

// Klickhändelse när användaren väljer ett förslag
    container.querySelectorAll('.suggestion-item').forEach(btn => {
        btn.addEventListener('click', (e) => {
            // Hämta enbart texten från span med klassen .truncate
            const selectedText = e.currentTarget.querySelector('.truncate')?.innerText || e.currentTarget.innerText;
            
            if (searchInput) {
                searchInput.value = selectedText.trim();
            }
            
            container.classList.add('hidden');

            // Uppdatera filtreringen på kartan och listan samt den gröna badgen
            applySearchFilter();
            updateMapFilterBadge();
        });
    });
}


function applySearchFilter() {
    const searchInput = document.getElementById('search-input');
    const searchClearBtn = document.getElementById('search-clear');
    searchQuery = (searchInput?.value || '').toLowerCase().trim();

    // Visa eller dölj kryss-knappen baserat på om det finns text
    if (searchQuery.length > 0) {
        searchClearBtn?.classList.remove('hidden');
    } else {
        searchClearBtn?.classList.add('hidden');
    }

    // Uppdatera synligheten för varje markör på kartan
    Object.keys(markersMap).forEach(id => {
        const marker = markersMap[id];
        const place = savedPlaces.find(p => String(p.id) === String(id));
        if (!place) return;

        // 1. Kategori-check
        const itemCategory = place.category || place.categoryGroup || 'Övrigt';
        const matchesCategory = activeCategoryFilter === 'all' || itemCategory === activeCategoryFilter;

        // 2. Sökords-check (matchar titel eller anteckning/beskrivning)
        const titleMatch = (place.title || '').toLowerCase().includes(searchQuery);
        const notesMatch = (place.notes || place.description || '').toLowerCase().includes(searchQuery);
        const matchesSearch = titleMatch || notesMatch;

        // Markören ska bara synas på kartan om DEN MATCHAR BÅDE kategori och sökning!
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
        // Om användaren har sökt i sökrutan
        badgeText.innerText = `Visar: ${searchQuery}`;
        badge.classList.remove('hidden');
    } else if (activeCategoryFilter !== 'all') {
        // Annars, om en kategori är vald
        badgeText.innerText = `Visar: ${activeCategoryFilter}`;
        badge.classList.remove('hidden');
    } else {
        // Om varken sökning eller kategori är vald
        badge.classList.add('hidden');
    }
}


document.getElementById('active-filter-badge')?.addEventListener('click', (e) => {
    e.stopPropagation();

    // 1. Rensa sökfältet
    const searchInput = document.getElementById('search-input');
    if (searchInput) searchInput.value = '';

    // 2. Återställ sökningen och uppdatera vyer och badge
    applySearchFilter();
    applyCategoryFilter('all');
    updateMapFilterBadge();
});


// Reagera direkt när man skriver i sökfältet
document.getElementById('search-input')?.addEventListener('input', () => {
    applySearchFilter();
    updateMapFilterBadge(); // Uppdaterar den gröna knappen "Visar: ..." i realtid
    renderSearchSuggestions();
});


// Rensa sökfältet vid klick på krysset
document.getElementById('search-clear')?.addEventListener('click', () => {
    const searchInput = document.getElementById('search-input');
    if (searchInput) searchInput.value = '';
    applySearchFilter();
    updateMapFilterBadge(); // Återställer knappen när sökningen rensas
    renderSearchSuggestions();
});


// Dölj förslagsrutan när man klickar utanför sökfältet
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
    
    // 1. Filtrera listan baserat på aktiv kategori & söktext
    let filtered = savedPlaces.filter(item => {
        const itemCategory = item.category || item.categoryGroup || 'Övrigt';
        const matchesCategory = activeCategoryFilter === 'all' || itemCategory === activeCategoryFilter;
        
        const titleMatch = (item.title || '').toLowerCase().includes(searchQuery);
        const notesMatch = (item.notes || item.description || '').toLowerCase().includes(searchQuery);
        const matchesSearch = titleMatch || notesMatch;

        return matchesCategory && matchesSearch;
    });

    // Uppdatera flikknappen "Lista (X)" med antalet synliga platser (t.ex. 25)
    updateMarkerCount();

    // 2. Sortering
    if (currentSortMode === 'distance' && currentCoords) {
        filtered.sort((a, b) => {
            const distA = getDistanceMetersOnly(currentCoords[0], currentCoords[1], Number(a.lat), Number(a.lng));
            const distB = getDistanceMetersOnly(currentCoords[0], currentCoords[1], Number(b.lat), Number(b.lng));
            return distA - distB;
        });
    } else {
        filtered.sort((a, b) => (b.timestamp || b.id) - (a.timestamp || a.id));
    }

    // 3. Generera HTML
    if (filtered.length === 0) {
        container.innerHTML = `<div class="text-center py-8 text-slate-400 text-xs">Inga platser hittades</div>`;
        return;
    }

    container.innerHTML = filtered.map(item => {
        let distanceText = '';
        if (currentCoords) {
            const distFormatted = calculateDistance(currentCoords[0], currentCoords[1], Number(item.lat), Number(item.lng));
            if (distFormatted) {
                distanceText = `<span class="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md font-mono text-[10px]">📍 ${distFormatted}</span>`;
            }
        }

        return `
            <div class="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm space-y-2">
                <div class="flex items-start justify-between gap-2">
                    <div class="flex items-center gap-2">
                        <span class="text-xl">${item.icon || '🍄'}</span>
                        <div>
                            <h3 class="font-bold text-slate-800 text-xs leading-tight">${item.title || 'Namnlös plats'}</h3>
                            <p class="text-[10px] text-slate-400 mt-0.5">${item.category || 'Övrigt'}</p>
                        </div>
                    </div>
                    ${distanceText}
                </div>
                ${item.notes ? `<p class="text-xs text-slate-600 bg-slate-50 p-2 rounded-xl border border-slate-100">${item.notes}</p>` : ''}
            </div>
        `;
    }).join('');
}

// Hjälpfunktion för exakt sorteringsjämförelse i meter
function getDistanceMetersOnly(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
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

    // "Alla" visar alltid totalt antal i registret (t.ex. 76)
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
}

document.getElementById('btn-export-gpx')?.addEventListener('click', () => {
    exportToGPX(savedPlaces);
});

// Exportera JSON
document.getElementById('btn-export-json')?.addEventListener('click', () => {
    exportToJSON(savedPlaces);
});

// Importera JSON
document.getElementById('input-import-json')?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    importFromJSON(file, (importedPlaces) => {
        let addedCount = 0;

        importedPlaces.forEach(item => {
            // Kontrollera att platsen inte redan finns (baserat på ID eller koordinater)
            const exists = savedPlaces.some(p => String(p.id) === String(item.id));
            
            if (!exists && item.lat && item.lng) {
                const formatted = {
                    ...item,
                    id: String(item.id || `marker_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`)
                };

                // Spara lokalt och lägg på kartan
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
        e.target.value = ''; // Nollställ filväljaren
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

// Global radera-funktion
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
        map.closePopup();

    } catch (err) {
        alert("Kunde inte radera markören: " + (err.message || err));
    }
};

window.startNavigationTo = function(id) {
    const target = savedPlaces.find(p => String(p.id) === String(id));
    if (!target) return;

    // Om vi redan navigerar till denna markör – stäng av navigeringslinjen
    if (activeNavMarkerId === String(id)) {
        activeNavMarkerId = null;
        if (navLine) {
            map.removeLayer(navLine);
            navLine = null;
        }
        return;
    }

    activeNavMarkerId = String(id);

    if (currentCoords) {
        const targetCoords = [Number(target.lat), Number(target.lng)];
        if (navLine) {
            navLine.setLatLngs([currentCoords, targetCoords]);
        } else {
            navLine = L.polyline([currentCoords, targetCoords], {
                color: '#2563eb',
                weight: 4,
                dashArray: '8, 8'
            }).addTo(map);
        }
    }
};


// Variabel för att hålla reda på den ritade ruttlinjen
let currentRouteLayer = null;

// Ritar linje från din nuvarande position till markerad plats
function drawRouteTo(destLat, destLng) {
    if (!currentCoords) {
        alert("Din position är inte tillgänglig ännu. Se till att GPS är aktiverat.");
        return;
    }

    if (currentRouteLayer) {
        map.removeLayer(currentRouteLayer);
    }

    const startLat = currentCoords[0];
    const startLng = currentCoords[1];

    currentRouteLayer = L.polyline(
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


// Öppnar navigeringskartan i ny flik (tidigare Gå hit-funktionen)
function openExternalMap(lat, lng) {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
    window.open(url, '_blank');
}


window.drawRouteTo = drawRouteTo;
window.openExternalMap = openExternalMap;

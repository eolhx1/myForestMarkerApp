//
// filename: app.js
//

//
// filename: app.js
//



import {
    SCRIPT_URL,
    CATEGORIES
} from './config.js';
import {
    saveMarkerLocally,
    compressImage,
    getLocalMarkers
} from './storage.js';
import {
    initAutoSync,
    syncPendingMarkers
} from './sync.js';
import {
    exportToGPX
} from './exporter.js';
import {
    deleteMarker
} from './db.js';

// Initiera synk-lyssnaren direkt vid appstart
initAutoSync();

// Globalt tillstånd
let selectedCategory = CATEGORIES[0];
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

// Initiera kartan centrerad på Sverige
const map = L.map('map', {
    zoomControl: false
}).setView([62.0, 15.0], 5);

setTimeout(() => {
    map.invalidateSize();
}, 100);

L.control.zoom({
    position: 'bottomright'
}).addTo(map);

// Initiera och ladda sparade markörer när sidan har laddats
document.addEventListener('DOMContentLoaded', async () => {
    try {
        savedPlaces = [];

        // 1. Hämta alla poster från Google Sheets om vi är online
        if (navigator.onLine) {
            try {
                const res = await fetch(SCRIPT_URL);
                const remoteData = await res.json();

                if (Array.isArray(remoteData) && remoteData.length > 0) {
                    const loadedPlaces = [];

                    remoteData.forEach((item, index) => {
                        if (item.latitude === undefined && item.lat === undefined) return;

                        const lat = Number(item.latitude !== undefined ? item.latitude: item.lat);
                        const lng = Number(item.longitude !== undefined ? item.longitude: item.lng);

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
                }
            } catch (sheetErr) {
                console.warn("Kunde inte hämta från Google Sheets:",
                    sheetErr);
            }
        }

        // 2. Om vi är offline eller om Sheets inte gav svar, hämta lokalt
        if (savedPlaces.length === 0) {
            const stored = getLocalMarkers();
            if (stored && stored.length > 0) {
                savedPlaces = stored.map(place => ({
                    ...place,
                    id: String(place.id)
                }));
                savedPlaces.forEach(place => addPlaceToMap(place));
            }
        }

        // Uppdatera gränssnittet
        updateMarkerCount();
        renderListView();
        renderFilterChips();

        await syncPendingMarkers();
    } catch (err) {
        console.error("Fel vid laddning av markörer:", err);
    }
});

// -----------------------------------------------------------------
// 1. Kartlager & Kartväljare
// -----------------------------------------------------------------
const tileLayers = {
    topo: L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
        {
            maxZoom: 17,
            attribution: '© OpenTopoMap'
        }),
    satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        {
            maxZoom: 18,
            attribution: '© Esri'
        }),
    osm: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        {
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

            const names = {
                topo: 'Skogstopo', satellite: 'Satellitvy', osm: 'Standardkarta'
            };
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
let activeNavMarkerId = null;
let navLine = null;
let currentHeading = 0;

const myLocationIcon = L.divIcon({
    className: 'my-location-marker',
    html: `
    <div style="position: relative; width: 32px; height: 32px;">
    <div id="user-heading-arrow" style="position: absolute; top: 0; left: 0; width: 32px; height: 32px; transition: transform 0.2s ease-out; transform-origin: center center;">
    <svg viewBox="0 0 24 24" width="32" height="32" fill="none">
    <path d="M12 2L19 21L12 17L5 21L12 2Z" fill="#2563eb" stroke="white" stroke-width="2" stroke-linejoin="round"/>
    </svg>
    </div>
    </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16]
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
document.getElementById('input-photo')?.addEventListener('change', async function(e) {
    const file = e.target.files[0];
    if (!file) return;

    currentPhotoBase64 = await compressImage(file);
    const preview = document.getElementById('photo-preview');
    const previewContainer = document.getElementById('photo-preview-container');

    if (preview && previewContainer) {
        preview.src = currentPhotoBase64;
        previewContainer.classList.remove('hidden');
    }
});

function renderCategoryGrid() {
    const grid = document.getElementById('category-grid');
    if (!grid) return;
    grid.innerHTML = CATEGORIES.map(cat => {
        const isSelected = selectedCategory && cat.id === selectedCategory.id;
        return `
        <button data-id="${cat.id}" type="button" class="category-btn p-2 rounded-2xl border flex flex-col items-center justify-center gap-1 transition ${isSelected ? 'border-emerald-600 bg-emerald-50 text-emerald-900 font-bold shadow-sm': 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}">
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
    btn.addEventListener('click',
        (e) => {
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
        document.getElementById('modal-coords').innerText = `${currentCoords[0].toFixed(6)}, ${currentCoords[1].toFixed(6)}`;
        document.getElementById('modal-accuracy').innerText = `±${Math.round(currentAccuracy)}m`;

        if (!selectedCategory) selectedCategory = CATEGORIES[0];
        document.getElementById('input-title').value = selectedCategory.name;

        renderCategoryGrid();
        modal.classList.remove('hidden');
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
            description: notes ? `${selectedAmount}. ${notes}`: selectedAmount,
            amount: selectedAmount,
            notes: notes,
            lat: currentCoords[0],
            lng: currentCoords[1],
            photo: photoBase64,
            timestamp: new Date().toISOString(),
            synced: false,
            // <-- Tydlig flagga för offline-synk
            syncStatus: 'pending' // <-- Kompatibel med båda dina synk-kontroller
        };


        // 1. Spara lokalt DIREKT (Fungerar offline)
        const savedMarker = saveMarkerLocally(newMarkerData);

        // 2. Uppdatera listor och karta
        savedPlaces.push(savedMarker);
        addPlaceToMap(savedMarker);
        updateMarkerCount();
        renderListView();

        // 3. Återställ formulär & stäng modal
        currentPhotoBase64 = null;
        document.getElementById('photo-preview-container')?.classList.add('hidden');
        const notesInput = document.getElementById('input-notes');
        if (notesInput) notesInput.value = '';

        closeModal();

        if (markersMap[savedMarker.id]) {
            markersMap[savedMarker.id].openPopup();
        }

        // 4. Försök synka i bakgrunden om mobiltäckning finns
        syncPendingMarkers();

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
        await deleteMarker(id);

        if (navigator.onLine) {
            // Skicka radering direkt om online
            fetch(SCRIPT_URL, {
                method: 'POST',
                mode: 'no-cors',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({ action: 'delete', id: id })
            }).catch(err => console.warn("Kunde inte radera från Sheets:", err));
        } else {
            // Spara i raderingskö om offline
            const pendingDeletes = JSON.parse(localStorage.getItem('pendingDeletes') || '[]');
            pendingDeletes.push(id);
            localStorage.setItem('pendingDeletes', JSON.stringify(pendingDeletes));
        }

        if (markersMap[id]) {
            map.removeLayer(markersMap[id]);
            delete markersMap[id];
        }

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
    `: ''}
    <div class="p-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
    <h3 class="font-bold text-base text-emerald-900 leading-tight pr-2">${place.title}</h3>
    <button onclick="window.removeCurrentMarker('${placeId}')" class="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition">🗑️</button>
    </div>
    <div class="px-3 py-1.5 bg-slate-50/50 border-b border-slate-100 flex items-center gap-2 text-xs font-semibold">
    <span class="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">${place.category || place.categoryGroup}</span>
    </div>
    <div class="px-3 py-2 text-xs text-slate-600 bg-slate-50/50 italic border-y border-slate-100">
    "${place.description || ''}"
    </div>
    <div class="p-3 space-y-1 text-xs text-slate-700">
    <div>📍 <span class="font-mono text-slate-600">${latNum.toFixed(5)}, ${lngNum.toFixed(5)}</span></div>
    <div>🕐 <strong>Tid:</strong> ${place.timestamp ? place.timestamp.slice(0, 10): ''}</div>
    </div>
    <div class="p-2.5 bg-slate-100 border-t border-slate-200 flex gap-2">
    <button onclick="window.toggleNavigation('${placeId}')" class="flex-1 text-center bg-blue-600 text-white py-1.5 rounded-xl text-xs font-semibold hover:bg-blue-700 transition">
    🧭 Gå hit
    </button>
    <a href="${googleEarthUrl}" target="_blank" class="py-1.5 px-2 bg-blue-50 text-blue-700 border border-blue-200 rounded-xl text-xs font-semibold">🌐 Earth</a>
    <a href="${googleMapsUrl}" target="_blank" class="py-1.5 px-2 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-semibold">🗺️ Maps</a>
    </div>
    </div>
    `;
}

function updateMarkerCount() {
    document.querySelectorAll('.marker-count-val').forEach(el => el.innerText = savedPlaces.length);
}

function addPlaceToMap(place) {
    if (markersMap[place.id]) {
        map.removeLayer(markersMap[place.id]);
    }

    const iconEmoji = getCategoryIcon(place);

    const customIcon = L.divIcon({
        className: 'custom-map-pin',
        html: `
        <div style="
        background: white;
        border: 2px solid #059669;
        border-radius: 50%;
        width: 34px;
        height: 34px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 18px;
        box-shadow: 0 2px 6px rgba(0,0,0,0.3);
        ">
        ${iconEmoji}
        </div>
        `,
        iconSize: [34, 34],
        iconAnchor: [17, 17],
        popupAnchor: [0, -18]
    });

    const marker = L.marker([Number(place.lat), Number(place.lng)], {
        icon: customIcon
    });
    marker.bindPopup(createPopupContent(place, place.id));

    const itemCategory = place.category || place.categoryGroup || 'Övrigt';
    const isVisible = activeCategoryFilter === 'all' || itemCategory === activeCategoryFilter;

    if (isVisible) {
        marker.addTo(map);
    }

    markersMap[place.id] = marker;
}

function getCategoryIcon(place) {
    const cat = (place.category || place.categoryGroup || place.title || '').toLowerCase();

    if (cat.includes('tält') || cat.includes('läger') || cat.includes('vindskydd')) return '⛺';
    if (cat.includes('kantarell') || cat.includes('svamp')) return '🍄';
    if (cat.includes('bär') || cat.includes('blåbär') || cat.includes('lingon')) return '🫐';
    if (cat.includes('kupa') || cat.includes('bi') || cat.includes('bigård')) return '🐝';
    if (cat.includes('jakt') || cat.includes('pass')) return '🦌';
    if (cat.includes('fiske') || cat.includes('sjö')) return '🐟';
    if (cat.includes('parkering') || cat.includes('bil')) return '🅿️';

    return '📍';
}

// -----------------------------------------------------------------
// 6. GPS-spårning
// -----------------------------------------------------------------
function updatePosition(position, autoCenter = false) {
    const {
        latitude,
        longitude,
        accuracy
    } = position.coords;
    currentCoords = [latitude,
        longitude];
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
            const targetCoords = [Number(target.lat),
                Number(target.lng)];
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

window.toggleNavigation = function(id) {
    if (activeNavMarkerId === id) {
        activeNavMarkerId = null;
        if (navLine) {
            map.removeLayer(navLine);
            navLine = null;
        }
        alert("Navigering avslutad.");
    } else {
        activeNavMarkerId = id;
        const target = savedPlaces.find(p => String(p.id) === String(id));
        if (target && currentCoords) {
            const targetCoords = [Number(target.lat),
                Number(target.lng)];
            if (navLine) map.removeLayer(navLine);

            navLine = L.polyline([currentCoords, targetCoords], {
                color: '#2563eb',
                weight: 4,
                dashArray: '8, 8'
            }).addTo(map);

            const dist = calculateDistance(currentCoords[0], currentCoords[1], targetCoords[0], targetCoords[1]);
            alert(`Navigerar till ${target.title} (${dist} bort)`);
            map.fitBounds(L.latLngBounds([currentCoords, targetCoords]), {
                padding: [50, 50]
            });
        } else {
            alert("Kan inte navigera utan GPS-signal.");
        }
    }
};

if ('geolocation' in navigator) {
    let initialCenter = false;
    navigator.geolocation.watchPosition(
        (pos) => {
            updatePosition(pos, !initialCenter);
            initialCenter = true;
        },
        (err) => console.warn(err.message),
        {
            enableHighAccuracy: true, timeout: 10000, maximumAge: 2000
        }
    );
}

document.getElementById('btn-recenter')?.addEventListener('click', () => {
    if (currentCoords) map.flyTo(currentCoords, 16, {
        animate: true, duration: 1.5
    });
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
    return d < 1 ? `${Math.round(d * 1000)} m`: `${d.toFixed(1)} km`;
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

    renderFilterChips();
    renderListView();
    updateMapFilterBadge();
}

function updateMapFilterBadge() {
    const badge = document.getElementById('active-filter-badge');
    const badgeText = document.getElementById('active-filter-text');
    if (!badge || !badgeText) return;

    if (activeCategoryFilter !== 'all') {
        badgeText.innerText = `Visar: ${activeCategoryFilter}`;
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }
}

document.getElementById('active-filter-badge')?.addEventListener('click', () => {
    applyCategoryFilter('all');
});

document.getElementById('search-input')?.addEventListener('input', (e) => {
    searchQuery = e.target.value;
    renderListView();
});

function renderListView() {
    const container = document.getElementById('list-container');
    if (!container) return;

    const filteredPlaces = savedPlaces.filter(item => {
        const itemCategory = item.category || item.categoryGroup || 'Övrigt';
        const matchesCategory = activeCategoryFilter === 'all' || itemCategory === activeCategoryFilter;

        const term = searchQuery.toLowerCase().trim();
        const matchesSearch = !term ||
        (item.title && item.title.toLowerCase().includes(term)) ||
        (item.description && item.description.toLowerCase().includes(term));

        return matchesCategory && matchesSearch;
    });

    if (filteredPlaces.length === 0) {
        container.innerHTML = `
        <div class="p-8 text-center text-slate-400 bg-white rounded-3xl border border-slate-100">
        <p>${savedPlaces.length === 0 ? 'Inga sparade skogsmarkörer än.': 'Inga markörer matchar din sökning eller filter.'}</p>
        </div>`;
        return;
    }

    container.innerHTML = filteredPlaces.map(item => {
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
        `: ''}

        <div class="flex items-center gap-2 flex-wrap text-xs font-semibold">
        <span class="bg-amber-100/80 text-amber-900 px-3 py-1 rounded-full font-semibold text-xs inline-flex items-center gap-1 border border-amber-200/50">
        📍 ${item.category || item.categoryGroup || 'Naturfynd'}
        </span>
        ${distText ? `<span class="bg-blue-50 text-blue-600 px-3 py-1 rounded-full border border-blue-100">${distText}</span>`: ''}
        </div>

        <div>
        <h3 class="font-bold text-slate-900 text-base leading-snug">${item.title}</h3>
        ${item.description ? `
        <div class="mt-1 bg-slate-50 p-3 rounded-2xl text-xs text-slate-600 italic">
        "${item.description}"
        </div>
        `: ''}
        </div>

        <div class="flex justify-between items-center text-[11px] text-slate-400 font-mono pt-1">
        <span>📍 ${lat.toFixed(5)}, ${lng.toFixed(5)}</span>
        <span>${item.timestamp ? item.timestamp.slice(0, 10): ''}</span>
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
    ? 'bg-emerald-600 text-white font-semibold shadow-sm': 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
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
        ? 'bg-emerald-600 text-white font-semibold shadow-sm': 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
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
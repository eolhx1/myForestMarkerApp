// Initiera kartan centrerad på Sverige från början
const map = L.map('map', { zoomControl: false }).setView([59.3293, 18.0686], 13);

// Lägg till topografiskt kartlager (OpenTopoMap)
L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
  maxZoom: 17,
  attribution: '© OpenStreetMap'
}).addTo(map);

// Zoom-kontroller nere till höger
L.control.zoom({ position: 'bottomright' }).addTo(map);

// Anpassad ikon för sparade svampställen / platser (som i bilden)
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
  popupAnchor: [0, -36] // Se till att popupen öppnas ovanför ikonen
});

// Anpassad stil för min aktuella GPS-position (blå pulserande prick)
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

// CSS-animering för den pulserande blå pricken
const styleSheet = document.createElement("style");
styleSheet.innerText = `
  @keyframes ping {
    75%, 100% {
      transform: scale(2);
      opacity: 0;
    }
  }
  /* Tailwind klasser för Leaflet popup-container för att efterlikna bilden */
  .leaflet-popup-content-wrapper {
    padding: 0;
    border-radius: 1rem; /* rounded-2xl */
    box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05); /* shadow-lg */
  }
  .leaflet-popup-content {
    margin: 0;
    width: auto !important; /* Låt Tailwind sköta bredden */
  }
`;
document.head.appendChild(styleSheet);

// Funktion för att skapa HTML-innehållet till popupen baserat på platsdata
function createPopupContent(place) {
  // Koordinater för Google Maps/Earth-länkar
  const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lng}`;
  const googleEarthUrl = `https://earth.google.com/web/@${place.lat},${place.lng},0a,500d,35y,0h,0t,0r`;

  return `
    <div class="bg-white rounded-2xl overflow-hidden shadow-lg border border-slate-200" style="width: 280px; max-width: calc(100vw - 40px);">
      <!-- Rubrik och stäng-kryss (Stäng-krysset sköts av Leaflet, men vi efterliknar layouten) -->
      <div class="p-4 border-b border-slate-100 flex items-center justify-between">
        <h3 class="font-bold text-lg text-emerald-900 leading-tight">${place.title}</h3>
      </div>

      <!-- Taggar och distans -->
      <div class="px-4 py-2 bg-slate-50 border-b border-slate-100 flex items-center gap-2 text-xs font-semibold">
        <span class="bg-emerald-100 text-emerald-800 px-2.5 py-1 rounded-full">${place.category}</span>
        <span class="text-slate-500">• ${place.distance} bort (${place.bearing})</span>
      </div>

      <!-- Bild -->
      <div class="p-2">
        <img src="${place.imageUrl}" alt="Bild på ${place.title}" class="w-full h-32 object-cover rounded-xl shadow-inner">
      </div>

      <!-- Beskrivning -->
      <div class="px-4 py-2 text-sm text-slate-600 bg-slate-50/50 italic border-y border-slate-100">
        <span class="not-italic">"</span>${place.description}<span class="not-italic">"</span>
      </div>

      <!-- Detaljer -->
      <div class="p-4 space-y-2 text-sm text-slate-700">
        <div class="flex items-center gap-1.5 text-blue-700">
          📍 <span class="font-mono text-slate-600 text-xs">${place.lat.toFixed(5)}, ${place.lng.toFixed(5)}</span>
        </div>
        <div class="flex items-center gap-1.5 text-emerald-700">
          ⛰️ <strong>Höjd:</strong> <span class="text-slate-600">${place.altitude} m.ö.h</span>
        </div>
        <div class="flex items-center gap-1.5 text-slate-500">
          🕐 <strong>Tid:</strong> <span class="text-slate-600">${place.timestamp}</span>
        </div>
      </div>

      <!-- Externa knappar -->
      <div class="p-3 bg-slate-100 border-t border-slate-200 flex items-center justify-center gap-3">
        <a href="${googleEarthUrl}" target="_blank" class="flex-1 inline-flex items-center justify-center gap-1.5 bg-blue-50 text-blue-700 border border-blue-200 px-3 py-2 rounded-xl text-xs font-semibold shadow-sm hover:bg-blue-100 transition">
          🌐 Earth 3D
        </a>
        <a href="${googleMapsUrl}" target="_blank" class="flex-1 inline-flex items-center justify-center gap-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 px-3 py-2 rounded-xl text-xs font-semibold shadow-sm hover:bg-emerald-100 transition">
          🗺️ Maps
        </a>
      </div>
    </div>
  `;
}

// Variabler för min GPS-position och osäkerhetscirkel
let userPositionMarker = null;
let userAccuracyCircle = null;
let currentCoords = null;
let savedMarkers = [];

// Uppdaterade exempel på sparade platser med mer data för popupen
const savedPlaces = [
  { 
    lat: 59.3293, 
    lng: 18.0686, 
    title: "Kantarelldrag i mossig sluttning", 
    category: "Gula kantareller",
    distance: "330.2 km",
    bearing: "ONO",
    description: "Växer längs gammal granstubbe och mjuk fuktig mossa. Plockade 2 liter.",
    imageUrl: "https://images.unsplash.com/photo-1632731881691-645b2069b917?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=MnwxMTkyMXwwfDF8c2VhcmNofDExfHxtdXNocm9vbXMlMjBmb3Jlc3R8ZW58MHx8fHwxNjMyNzM4ODY2&ixlib=rb-1.2.1&q=80&w=400", // En placeholder-bild
    altitude: 42,
    timestamp: "2026-08-19"
  }
];

// Lägg till de sparade platserna på kartan och bind popupen
savedPlaces.forEach(place => {
  const marker = L.marker([place.lat, place.lng], { icon: mushroomIcon }).addTo(map);
  
  // Skapa popup-innehållet och bind det till markören
  const popupContent = createPopupContent(place);
  marker.bindPopup(popupContent);
  
  savedMarkers.push(marker);
});

// Funktion för att uppdatera eller skapa GPS-markören och noggrannhetscirkeln
function updatePosition(position, autoCenter = false) {
  const { latitude, longitude, accuracy } = position.coords;
  currentCoords = [latitude, longitude];

  // Uppdatera noggrannhetstexten i gränssnittet
  const accuracyText = `±${Math.round(accuracy)}m`;
  const accuracyBadge = document.getElementById('gps-accuracy-badge');
  const accuracyFooter = document.getElementById('gps-accuracy-footer');
  
  if (accuracyBadge) accuracyBadge.innerText = accuracyText;
  if (accuracyFooter) accuracyFooter.innerText = `GPS: ${accuracyText}`;

  // Om markörerna redan finns, uppdatera deras positioner
  if (userPositionMarker && userAccuracyCircle) {
    userPositionMarker.setLatLng([latitude, longitude]);
    userAccuracyCircle.setLatLng([latitude, longitude]);
    userAccuracyCircle.setRadius(accuracy); // Sätt radien i meter
  } else {
    // Skapa osäkerhetscirkeln (blå genomskinlig radie)
    userAccuracyCircle = L.circle([latitude, longitude], {
      radius: accuracy, // Radie i meter från GPS
      color: '#3b82f6',
      weight: 1,
      fillColor: '#3b82f6',
      fillOpacity: 0.15
    }).addTo(map);

    // Skapa den blå positionspricken
    userPositionMarker = L.marker([latitude, longitude], { 
      icon: myLocationIcon,
      zIndexOffset: 1000 // Se till att din position ligger överst
    }).addTo(map);
  }

  if (autoCenter) {
    map.setView([latitude, longitude], 16);
  }
}

// Starta kontinuerlig GPS-spårning (watchPosition)
if ('geolocation' in navigator) {
  let initialCenterDone = false;
  
  navigator.geolocation.watchPosition(
    (position) => {
      // Första gången positionen hittas centrerar vi kartan
      updatePosition(position, !initialCenterDone);
      initialCenterDone = true;
    },
    (error) => {
      console.warn("GPS-fel:", error.message);
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 2000
    }
  );
} else {
  alert("GPS stöds inte i din webbläsare.");
}

// Knapp: "Markera min position" (Skapar en svampmarkör där du står)
document.getElementById('btn-mark').addEventListener('click', () => {
  if (currentCoords) {
    // Eftersom vi väntar med permanent lagring skapar vi en platsprofil med dummy-data
    const newPlaceData = {
      lat: currentCoords[0],
      lng: currentCoords[1],
      title: "Ny markering (Ej sparad permanent)",
      category: "Okänd svamp",
      distance: "0 km",
      bearing: "-",
      description: "Här hittade jag någonting nytt! Beskrivning saknas.",
      imageUrl: "https://images.unsplash.com/photo-1632731881691-645b2069b917?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=MnwxMTkyMXwwfDF8c2VhcmNofDExfHxtdXNocm9vbXMlMjBmb3Jlc3R8ZW58MHx8fHwxNjMyNzM4ODY2&ixlib=rb-1.2.1&q=80&w=400",
      altitude: 0,
      timestamp: new Date().toISOString().split('T')[0]
    };

    const newMarker = L.marker(currentCoords, { icon: mushroomIcon }).addTo(map);
    const popupContent = createPopupContent(newPlaceData);
    newMarker.bindPopup(popupContent).openPopup(); // Öppna popupen direkt
    
    savedMarkers.push(newMarker);
  } else {
    alert("Väntar på din GPS-position...");
  }
});

// Knapp: Centrera kartan på din nuvarande position
document.getElementById('btn-recenter').addEventListener('click', () => {
  if (currentCoords) {
    map.setView(currentCoords, 16);
  } else {
    alert("Kunde inte hitta din nuvarande position.");
  }
});

// Registrera Service Worker för PWA
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(err => console.log('SW Registration failed:', err));
}

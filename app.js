// Initiera kartan centrerad på Sverige från början
const map = L.map('map', { zoomControl: false }).setView([59.3293, 18.0686], 13);

// Lägg till topografiskt kartlager (OpenTopoMap)
L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
  maxZoom: 17,
  attribution: '© OpenStreetMap'
}).addTo(map);

// Zoom-kontroller nere till höger
L.control.zoom({ position: 'bottomright' }).addTo(map);

// Anpassad ikon för sparade svampställen / platser
const mushroomIcon = L.divIcon({
  className: 'custom-marker',
  html: '<span style="font-size: 18px;">🍄</span>',
  iconSize: [36, 36],
  iconAnchor: [18, 36]
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
`;
document.head.appendChild(styleSheet);

// Variabler för min GPS-position och osäkerhetscirkel
let userPositionMarker = null;
let userAccuracyCircle = null;
let currentCoords = null;
let savedMarkers = [];

// Exempel på sparade platser
const savedPlaces = [
  { lat: 59.3293, lng: 18.0686, title: "Karljohan ställe" }
];

savedPlaces.forEach(place => {
  const marker = L.marker([place.lat, place.lng], { icon: mushroomIcon }).addTo(map);
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
    const newMarker = L.marker(currentCoords, { icon: mushroomIcon }).addTo(map);
    savedMarkers.push(newMarker);
    alert(`Ny plats markerad på din position!\nLat: ${currentCoords[0].toFixed(5)}, Lng: ${currentCoords[1].toFixed(5)}`);
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

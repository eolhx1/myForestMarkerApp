// Initiera kartan centrerad på Sverige
const map = L.map('map', { zoomControl: false }).setView([59.3293, 18.0686], 13);

// Lägg till kartlager (OpenTopoMap för topografiskt utseende)
L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
  maxZoom: 17,
  attribution: '© OpenStreetMap'
}).addTo(map);

// Egna Zoom-kontroller nere till höger
L.control.zoom({ position: 'bottomright' }).addTo(map);

// Anpassad ikon för svampställen
const mushroomIcon = L.divIcon({
  className: 'custom-marker',
  html: '<span style="font-size: 18px;">🍄</span>',
  iconSize: [36, 36],
  iconAnchor: [18, 36]
});

// Exempelpunkter
const savedPlaces = [
  { lat: 59.3293, lng: 18.0686, title: "Karljohan ställe" }
];

let markers = [];

savedPlaces.forEach(place => {
  const marker = L.marker([place.lat, place.lng], { icon: mushroomIcon }).addTo(map);
  markers.push(marker);
});

// Hantera GPS och "Markera min position"
document.getElementById('btn-mark').addEventListener('click', () => {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(position => {
      const { latitude, longitude } = position.coords;
      
      const newMarker = L.marker([latitude, longitude], { icon: mushroomIcon }).addTo(map);
      map.setView([latitude, longitude], 15);
      
      alert(`Ny plats markerad!\nLat: ${latitude.toFixed(5)}, Lng: ${longitude.toFixed(5)}`);
    }, () => {
      alert("Kunde inte hämta din GPS-position.");
    });
  } else {
    alert("GPS stöds inte i din webbläsare.");
  }
});

// Centrera om kartan
document.getElementById('btn-recenter').addEventListener('click', () => {
  if (markers.length > 0) {
    map.setView(markers[0].getLatLng(), 15);
  }
});

// Registrera Service Worker för PWA
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(err => console.log('SW Registration failed:', err));
}

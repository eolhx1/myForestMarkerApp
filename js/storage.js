//
// filename: js/storage.js
//

const STORAGE_KEY = 'skogsmarkoren_markers';

// Hämtar alla sparade markörer från mobilen
export function getLocalMarkers() {
  const data = localStorage.getItem(STORAGE_KEY);
  return data ? JSON.parse(data) : [];
}

// Sparar en ny markör lokalt (Standard: synced = false)
export function saveMarkerLocally(markerData) {
  const markers = getLocalMarkers();
  
  const newMarker = {
    id: 'm_' + Date.now(),
    ...markerData,
    synced: false,
    createdAt: new Date().toISOString()
  };

  markers.push(newMarker);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(markers));
  
  return newMarker;
}

// Markerats som synkad när uppladdningen till Google Apps Script lyckats
export function markAsSynced(markerId) {
  const markers = getLocalMarkers();
  const index = markers.findIndex(m => m.id === markerId);
  if (index !== -1) {
    markers[index].synced = true;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(markers));
  }
}

// Komprimerar foton från kameran/galleriet direkt i mobilen
export function compressImage(file, maxWidth = 1000, quality = 0.7) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve(null);
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
}

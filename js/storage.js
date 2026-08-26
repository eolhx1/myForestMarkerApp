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
export async function compressImage(file) {
    if (!file) return null; // <-- Förhindrar att skriptet kraschar om bild saknas

    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
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
                resolve(canvas.toDataURL('image/jpeg', 0.7));
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    });
}

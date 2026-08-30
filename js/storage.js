//
// filename: js/storage.js
// Logik för lokal lagring (localStorage) och bildkomprimering
//

const STORAGE_KEY = 'skogsmarkoren_markers';

// -----------------------------------------------------------------
// Hämtar alla sparade markörer från localStorage.
// -----------------------------------------------------------------
export function getLocalMarkers() {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch (err) {
    console.error('Fel vid läsning från localStorage:', err);
    return [];
  }
}

// -----------------------------------------------------------------
// Sparar alla markörer till localStorage.
// -----------------------------------------------------------------
export function updateLocalMarkers(markers) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(markers));
  } catch (err) {
    console.error('Fel vid skrivning till localStorage:', err);
  }
}

// -----------------------------------------------------------------
// Sparar eller uppdaterar en markör lokalt.
// -----------------------------------------------------------------
export function saveMarkerLocally(markerData) {
  const markers = getLocalMarkers();
  const markerId = markerData.id || `m_${Date.now()}`;
  const existingIndex = markers.findIndex(m => String(m.id) === String(markerId));

  const newMarker = {
    ...markerData,
    id: markerId,
    synced: markerData.synced ?? false,
    createdAt: markerData.createdAt || new Date().toISOString()
  };

  if (existingIndex !== -1) {
    markers[existingIndex] = newMarker;
  } else {
    markers.push(newMarker);
  }

  updateLocalMarkers(markers);
  return newMarker;
}

// -----------------------------------------------------------------
// Markerar en specifik markör som synkad mot servern.
// -----------------------------------------------------------------
export function markAsSynced(markerId) {
  const markers = getLocalMarkers();
  const index = markers.findIndex(m => String(m.id) === String(markerId));

  if (index !== -1) {
    markers[index].synced = true;
    updateLocalMarkers(markers);
  }
}

// -----------------------------------------------------------------
// Tar bort en specifik markör från localStorage.
// -----------------------------------------------------------------
export function removeLocalMarker(markerId) {
  const markers = getLocalMarkers();
  const filtered = markers.filter(m => String(m.id) !== String(markerId));
  updateLocalMarkers(filtered);
}

// -----------------------------------------------------------------
// Komprimerar bilder från kameran/galleriet direkt i klienten.
// -----------------------------------------------------------------
export async function compressImage(file, maxWidth = 800, maxHeight = 800, quality = 0.7) {
  if (!file) return null;

  try {
    // 1. Försök använda createImageBitmap med EXIF-orientering (moderna webbläsare/mobiler)
    if ('createImageBitmap' in window) {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return processImageToCanvas(bitmap, bitmap.width, bitmap.height, maxWidth, maxHeight, quality);
    }
  } catch (e) {
    // Fallback till FileReader om createImageBitmap misslyckas
  }

  // 2. Fallback med FileReader
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const result = processImageToCanvas(img, img.width, img.height, maxWidth, maxHeight, quality);
        resolve(result);
      };
      img.onerror = () => resolve(null);
      img.src = event.target.result;
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

// -----------------------------------------------------------------
// Hjälpfunktion för att rita upp och skala om bilden på en Canvas.
// -----------------------------------------------------------------
function processImageToCanvas(source, sourceWidth, sourceHeight, maxWidth, maxHeight, quality) {
  let width = sourceWidth;
  let height = sourceHeight;

  if (width > height) {
    if (width > maxWidth) {
      height *= maxWidth / width;
      width = maxWidth;
    }
  } else {
    if (height > maxHeight) {
      width *= maxHeight / height;
      height = maxHeight;
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width);
  canvas.height = Math.round(height);

  const ctx = canvas.getContext('2d');
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);

  const dataUrl = canvas.toDataURL('image/jpeg', quality);

  // Frigör minne
  canvas.width = 0;
  canvas.height = 0;
  if (source.close) source.close(); // Stäng ImageBitmap om det användes

  return dataUrl;
}

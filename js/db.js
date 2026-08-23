//
// filename: db.js 
//
// offline-lagring och en automatisk kö
//

import { SCRIPT_URL } from './config.js';

const DB_NAME = 'SkogsmarkorenDB';
const DB_VERSION = 1;
let db = null;

export async function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('markers')) {
        const store = db.createObjectStore('markers', { keyPath: 'id' });
        store.createIndex('syncStatus', 'syncStatus', { unique: false });
      }
    };
    request.onsuccess = (e) => {
      db = e.target.result;
      resolve(db);
    };
    request.onerror = (e) => reject(e);
  });
}

// Spara ny markör lokalt och gör försök att synka
export async function saveMarker(markerData) {
  const marker = {
    ...markerData,
    syncStatus: 'pending',
    timestamp: new Date().toISOString()
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction('markers', 'readwrite');
    const store = tx.objectStore('markers');
    store.put(marker);
    tx.oncomplete = () => {
      syncPendingMarkers(); // Försök synka i bakgrunden
      resolve(marker);
    };
    tx.onerror = (e) => reject(e);
  });
}

// Hämta alla markörer
export async function getAllMarkers() {
  return new Promise((resolve) => {
    const tx = db.transaction('markers', 'readonly');
    const store = tx.objectStore('markers');
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
  });
}

// Ta bort en markör lokalt
export async function deleteMarker(id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('markers', 'readwrite');
    const store = tx.objectStore('markers');
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = (e) => reject(e);
  });
}

// Synkroniseringskö mot Google Apps Script
export async function syncPendingMarkers() {
  if (!navigator.onLine || !db) return;

  const tx = db.transaction('markers', 'readonly');
  const store = tx.objectStore('markers');
  const index = store.getIndex('syncStatus');
  const request = index.getAll('pending');

  request.onsuccess = async () => {
    const pending = request.result;
    for (const marker of pending) {
      try {
        const response = await fetch(SCRIPT_URL, {
          method: 'POST',
          body: JSON.stringify({
            title: marker.title,            // Ex: "Gula kantareller"
            category: marker.categoryGroup, // Ex: "Svamp"
            latitude: marker.lat,
            longitude: marker.lng,
            description: marker.description,
            timestamp: marker.timestamp,
            id: marker.id
          })
        });

        if (response.ok) {
          // Markera som synkad
          const writeTx = db.transaction('markers', 'readwrite');
          const writeStore = writeTx.objectStore('markers');
          marker.syncStatus = 'synced';
          writeStore.put(marker);
        }
      } catch (err) {
        console.warn('Synk misslyckades för markör:', marker.id, err);
      }
    }
  };
}

// Lyssna på när enheten får tillbaka nätverkstäckning
window.addEventListener('online', syncPendingMarkers);

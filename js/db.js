//
// filename: db.js
//

import { SCRIPT_URL } from './config.js';

const DB_NAME = 'ForestMapDB';
const DB_VERSION = 2; // Höjt versionsnummer tvingar webbläsaren att skapa tabellen 'markers'
const STORE_NAME = 'markers';

let db = null;

export function initDB() {
  return new Promise((resolve, reject) => {
    if (db) {
      resolve(db);
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = (e) => {
      console.error("IndexedDB-fel:", e.target.error);
      reject(e.target.error);
    };

    request.onsuccess = (e) => {
      db = e.target.result;
      resolve(db);
    };

    request.onupgradeneeded = (e) => {
      const dbInstance = e.target.result;
      if (!dbInstance.objectStoreNames.contains(STORE_NAME)) {
        dbInstance.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
  });
}

export async function saveMarker(place) {
  const dbInstance = await initDB();
  
  return new Promise((resolve, reject) => {
    const tx = dbInstance.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    
    place.syncStatus = place.syncStatus || 'pending';
    const request = store.put(place);

    request.onsuccess = () => {
      if (navigator.onLine && place.syncStatus === 'pending') {
        syncSingleMarker(place);
      }
      resolve(place);
    };

    request.onerror = (e) => {
      reject(e.target.error);
    };
  });
}

export async function getAllMarkers() {
  const dbInstance = await initDB();
  return new Promise((resolve, reject) => {
    const tx = dbInstance.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result || []);
    request.onerror = (e) => reject(e.target.error);
  });
}

export async function deleteMarker(id) {
  const dbInstance = await initDB();
  return new Promise((resolve, reject) => {
    const tx = dbInstance.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(id);

    request.onsuccess = () => resolve(true);
    request.onerror = (e) => reject(e.target.error);
  });
}

async function syncSingleMarker(place) {
  try {
    // Förbered nytt payload-objekt som matchar vad Kod.gs förväntar sig
    const payload = {
      title: place.title || '',
      categoryGroup: place.categoryGroup || place.category || '',
      lat: place.lat !== undefined ? place.lat : place.latitude,
      lng: place.lng !== undefined ? place.lng : place.longitude,
      description: place.description || '',
      timestamp: place.timestamp || new Date().toISOString(),
      id: String(place.id),
      photo: place.photo || null
    };

    await fetch(SCRIPT_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });
    
    // Uppdatera status lokalt efter sändning
    place.syncStatus = 'synced';
    const dbInstance = await initDB();
    const tx = dbInstance.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(place);
  } catch (err) {
    console.warn("Bakgrundssynk misslyckades, sparad lokalt:", err);
  }
}

export async function syncPendingMarkers() {
  if (!navigator.onLine) return;
  const places = await getAllMarkers();
  const pending = places.filter(p => p.syncStatus === 'pending');
  for (const place of pending) {
    await syncSingleMarker(place);
  }
}

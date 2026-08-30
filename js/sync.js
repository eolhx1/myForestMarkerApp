//
// filename: js/sync.js
// Logik för automatisk synkronisering mot Google Sheets (Google Apps Script)
//

import { SCRIPT_URL } from './config.js';
import { getLocalMarkers, markAsSynced } from './storage.js';

// -----------------------------------------------------------------
// Initierar automatisk synkronisering vid nätverksändringar.
// -----------------------------------------------------------------
export function initAutoSync() {
  // Lyssna på när enheten får tillbaka täckning
  window.addEventListener('online', () => {
    console.log('📶 Mobiltäckning tillbaka! Startar synkronisering...');
    syncPendingMarkers();
  });

  // Försök synka direkt om mobilen redan är online vid start
  if (navigator.onLine) {
    syncPendingMarkers();
  }
}

// -----------------------------------------------------------------
// Synkroniserar både väntande raderingar och nya/ändrade markörer.
// -----------------------------------------------------------------
export async function syncPendingMarkers() {
  if (!navigator.onLine) return;

  // 1. Synka sparade raderingar först
  await syncPendingDeletes();

  // 2. Synka osynkade nya markörer
  await syncUnsyncedMarkers();
}

// -----------------------------------------------------------------
// Hjälpfunktion för att hantera raderingar som gjorts offline.
// -----------------------------------------------------------------
async function syncPendingDeletes() {
  try {
    const pendingDeletes = JSON.parse(localStorage.getItem('pendingDeletes') || '[]');
    if (pendingDeletes.length === 0) return;

    const remainingDeletes = [];

    for (const id of pendingDeletes) {
      try {
        await fetch(SCRIPT_URL, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ action: 'delete', id: String(id) })
        });
      } catch (e) {
        console.warn(`Kunde inte synka radering för ID ${id}:`, e);
        remainingDeletes.push(id);
      }
    }

    if (remainingDeletes.length > 0) {
      localStorage.setItem('pendingDeletes', JSON.stringify(remainingDeletes));
    } else {
      localStorage.removeItem('pendingDeletes');
    }
  } catch (err) {
    console.error('Fel vid hantering av väntande raderingar:', err);
  }
}

// -----------------------------------------------------------------
// Hjälpfunktion för att skicka nya/ändrade markörer till servern.
// -----------------------------------------------------------------
async function syncUnsyncedMarkers() {
  if (!SCRIPT_URL) return;

  try {
    const allMarkers = getLocalMarkers();
    const unsynced = allMarkers.filter(m => !m.synced);

    if (unsynced.length === 0) return;

    console.log(`Hittade ${unsynced.length} osynkade markörer. Laddar upp...`);

    for (const marker of unsynced) {
      try {
        await fetch(SCRIPT_URL, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(marker)
        });

        markAsSynced(marker.id);
        console.log(`✅ Synkad till Google Sheets: ${marker.title}`);
      } catch (error) {
        console.warn(`⏳ Kunde inte synka ${marker.title} just nu.`, error);
      }
    }
  } catch (err) {
    console.error('Fel vid synkronisering av markörer:', err);
  }
}

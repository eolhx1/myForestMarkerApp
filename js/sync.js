// 
// filename: js/sync.js
//

import { SCRIPT_URL } from './config.js';
import { getLocalMarkers, markAsSynced } from './storage.js';

export function initAutoSync() {
  // Lyssna på när mobilen får tillbaka täckning
  window.addEventListener('online', () => {
    console.log('📶 Mobiltäckning tillbaka! Startar synkronisering...');
    syncPendingMarkers();
  });

  // Försök synka direkt om mobilen redan är online vid start
  if (navigator.onLine) {
    syncPendingMarkers();
  }
}

export async function syncPendingMarkers() {
  if (!navigator.onLine || !SCRIPT_URL) return;

  const allMarkers = getLocalMarkers();
  const unsynced = allMarkers.filter(m => !m.synced);

  if (unsynced.length === 0) return;

  console.log(`Hittade ${unsynced.length} osynkade markörer. Laddar upp...`);

  for (const marker of unsynced) {
    try {
      // Skicka till Google Apps Script via POST (text/plain undviker CORS-problem med Apps Script)
      const response = await fetch(SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(marker)
      });

      if (response.ok) {
        markAsSynced(marker.id);
        console.log(`✅ Synkad till Google Sheets: ${marker.title}`);
      }
    } catch (error) {
      console.warn(`⏳ Kunde inte synka ${marker.title} just nu (saknar täckning/serverfel).`, error);
    }
  }
}

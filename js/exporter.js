//
// filename: js/exporter.js
// Logik för dataexport (GPX/JSON) samt import av sparade markörer
//

// ==========================================
// 1. EXPORT- OCH IMPORT-FUNKTIONER
// ==========================================

// --------------------------------------
// 1A. EXPORTERA TILL GPX-FORMAT
// --------------------------------------
export function exportToGPX(markers = []) {
  if (!markers || markers.length === 0) {
    alert('Det finns inga sparade platser att exportera.');
    return;
  }

  let gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Skogsmarkoren" xmlns="http://www.topografix.com/GPX/1/1">
`;

  markers.forEach(m => {
    // Säkra att timestamp följer strikt ISO 8601-format för GPX
    let isoTime;
    try {
      isoTime = m.timestamp ? new Date(m.timestamp).toISOString() : new Date().toISOString();
    } catch (e) {
      isoTime = new Date().toISOString();
    }

    gpx += `  <wpt lat="${m.lat}" lon="${m.lng}">
    <name>${escapeXml(m.title || 'Namnlös plats')}</name>
    <desc>Kategori: ${escapeXml(m.categoryGroup || 'Övrigt')} | ${escapeXml(m.description || '')}</desc>
    <time>${isoTime}</time>
  </wpt>\n`;
  });

  gpx += `</gpx>`;

  // Skapa och trigga nedladdning
  const blob = new Blob([gpx], { type: 'application/gpx+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  
  a.href = url;
  a.download = `skogsmarkoren-${new Date().toISOString().slice(0, 10)}.gpx`;
  
  // Lägg till i DOM temporärt för maximal stöd på mobila webbläsare
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  
  URL.revokeObjectURL(url);
}

// --------------------------------------
// 1B. EXPORTERA TILL JSON-FORMAT
// --------------------------------------
export function exportToJSON(places) {
  if (!places || places.length === 0) {
    alert("Det finns inga sparade platser att exportera.");
    return;
  }

  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(places, null, 2));
  const downloadAnchor = document.createElement('a');
  const filename = `skogsmarkoren_backup_${new Date().toISOString().slice(0, 10)}.json`;

  downloadAnchor.setAttribute("href", dataStr);
  downloadAnchor.setAttribute("download", filename);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
}

// --------------------------------------
// 1C. IMPORTERA FRÅN JSON-FIL
// --------------------------------------
export function importFromJSON(file, onComplete) {
  const reader = new FileReader();

  reader.onload = function(event) {
    try {
      const importedData = JSON.parse(event.target.result);

      if (!Array.isArray(importedData)) {
        alert("Felaktigt filformat. Filen måste innehålla en lista med platser.");
        return;
      }

      if (onComplete) onComplete(importedData);
    } catch (err) {
      alert("Kunde inte läsa filen. Se till att det är en giltig JSON-fil.");
      console.error(err);
    }
  };

  reader.readAsText(file);
}

// ==========================================
// 2. HJÄLPFUNKTIONER
// ==========================================

// --------------------------------------
// 2A. XML-SANITERING
// --------------------------------------
function escapeXml(unsafe) {
  if (!unsafe) return '';
  return String(unsafe).replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
}

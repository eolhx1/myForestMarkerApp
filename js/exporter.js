//
// filename: exporter.js 
//
// Funktion för att ladda ner sparade skogsställen som en .gpx-fil
//

export function exportToGPX(markers) {
  let gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Skogsmarkoren" xmlns="http://www.topografix.com/GPX/1/1">
`;

  markers.forEach(m => {
    gpx += `  <wpt lat="${m.lat}" lon="${m.lng}">
    <name>${escapeXml(m.title)}</name>
    <desc>Kategori: ${escapeXml(m.categoryGroup)} | ${escapeXml(m.description || '')}</desc>
    <time>${m.timestamp || new Date().toISOString()}</time>
  </wpt>\n`;
  });

  gpx += `</gpx>`;

  const blob = new Blob([gpx], { type: 'application/gpx+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `skogsmarkoren-${new Date().toISOString().slice(0, 10)}.gpx`;
  a.click();
  URL.revokeObjectURL(url);
}

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

//
// filename: config.js 
//
// fil för inställningar & kategorier
//

// Länken till ditt Google Apps Script webbapp-skript
export const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbw0utLhV6H8G0FbGdwIiM7Jk8L4u1QcXtpgiJLkQL5pFccAa-RTol-tRvl4_Oco_x1XeQ/exec';

// Kategorier för platser/kartmarkörer
export const CATEGORIES = [
  // SVAMP
  { id: 'gula-kantareller', name: 'Gula kantareller', group: 'Svamp', iconSvg: `<svg viewBox="0 0 36 36" class="w-7 h-7"><path fill="#F59E0B" d="M18 3c-6 0-11 4-11 8 0 3 3 5 5 6v14c0 2 2 3 6 3s6-1 6-3V17c2-1 5-3 5-6 0-4-5-8-11-8z"/><path fill="#FBBF24" d="M7 11c0 3 4.5 4.5 11 4.5S29 14 29 11c0-3-4.5-6-11-6S7 8 7 11z"/></svg>` },
  { id: 'trattkantareller', name: 'Trattkantareller', group: 'Svamp', iconSvg: `<svg viewBox="0 0 36 36" class="w-7 h-7"><path fill="#78350F" d="M18 10c-5 0-9 2-9 5 0 2 2 4 4 5v12c0 1.5 2 2.5 5 2.5s5-1 5-2.5V20c2-1 4-3 4-5 0-3-4-5-9-5z"/><path fill="#D97706" d="M9 15c0 2.5 4 3.5 9 3.5s9-1 9-3.5-4-4.5-9-4.5-9 2-9 4.5z"/><ellipse cx="18" cy="14" rx="4" ry="1.5" fill="#451A03"/></svg>` },
  { id: 'karljohan', name: 'Karljohan / Svamp', group: 'Svamp', iconSvg: `<svg viewBox="0 0 36 36" class="w-7 h-7"><path fill="#FEF3C7" d="M13 16h10v14c0 2-2 3-5 3s-5-1-5-3V16z"/><path fill="#92400E" d="M6 17c0-7 5.4-12 12-12s12 5 12 12c0 1.5-5 3-12 3S6 18.5 6 17z"/><path fill="#D97706" d="M8 17c2-5 6-9 10-9s8 4 10 9c0 .5-4.5 1.5-10 1.5S8 17.5 8 17z"/></svg>` },
  { id: 'matsvamp', name: 'Annan matsvamp', group: 'Svamp', iconSvg: `<svg viewBox="0 0 36 36" class="w-7 h-7"><path fill="#FDE68A" d="M14 15h8v15c0 1.5-1.8 2.5-4 2.5s-4-1-4-2.5V15z"/><path fill="#F59E0B" d="M8 15c0-5 4.5-9 10-9s10 4 10 9c0 1-4.5 2-10 2S8 16 8 15z"/></svg>` },

  // BÄR
  { id: 'blabar', name: 'Blåbär', group: 'Bär', iconSvg: `<svg viewBox="0 0 36 36" class="w-7 h-7"><circle cx="14" cy="20" r="7" fill="#1E40AF"/><circle cx="23" cy="21" r="6" fill="#1D4ED8"/><circle cx="14" cy="18" r="2" fill="#1E3A8A"/><circle cx="23" cy="19" r="1.5" fill="#1E3A8A"/><path fill="#15803D" d="M16 6c-3 0-6 3-6 7h4c3 0 6-3 6-7h-4z"/></svg>` },
  { id: 'lingon', name: 'Lingon', group: 'Bär', iconSvg: `<svg viewBox="0 0 36 36" class="w-7 h-7"><circle cx="13" cy="20" r="7" fill="#DC2626"/><circle cx="23" cy="21" r="6.5" fill="#991B1B"/><path fill="#166534" d="M18 6c-4 1-7 5-7 9h4c4 0 7-4 7-9zm1 0c4 1 7 5 7 9h-4c-4 0-7-4-7-9z"/></svg>` },
  { id: 'ronnbar', name: 'Rönnbär', group: 'Bär', iconSvg: `<svg viewBox="0 0 36 36" class="w-7 h-7"><path fill="#15803D" d="M18 6c-3 0-7 2-9 6h5c3 0 6-3 7-6z"/><path fill="#166534" d="M18 7c.5 3 2.5 5 5 6v-2c-2 0-4-2-5-4z"/><circle cx="12" cy="20" r="4.5" fill="#EF4444"/><circle cx="20" cy="19" r="4.5" fill="#F97316"/><circle cx="16" cy="26" r="4.5" fill="#DC2626"/><circle cx="24" cy="25" r="4" fill="#EF4444"/><circle cx="12" cy="20" r="1" fill="#7f1d1d"/><circle cx="20" cy="19" r="1" fill="#7f1d1d"/><circle cx="16" cy="26" r="1" fill="#7f1d1d"/><circle cx="24" cy="25" r="1" fill="#7f1d1d"/></svg>` },
  { id: 'hjortron', name: 'Hjortron', group: 'Bär', iconSvg: `<svg viewBox="0 0 36 36" class="w-7 h-7"><circle cx="18" cy="13" r="5" fill="#EA580C"/><circle cx="12" cy="18" r="5" fill="#F97316"/><circle cx="24" cy="18" r="5" fill="#F97316"/><circle cx="18" cy="23" r="5" fill="#FB923C"/><path fill="#15803D" d="M18 3c-2 3-5 4-8 4 3 2 5 5 5 8h6c0-3 2-6 5-8-3 0-6-1-8-4z"/></svg>` },
  { id: 'hallon', name: 'Smultron / Hallon', group: 'Bär', iconSvg: `<svg viewBox="0 0 36 36" class="w-7 h-7"><path fill="#E11D48" d="M18 31c-6 0-11-7-11-14 0-4 5-6 11-6s11 2 11 6c0 7-5 14-11 14z"/><path fill="#15803D" d="M18 6c-3 1-5 4-5 6h10c0-2-2-5-5-6z"/></svg>` },
  { id: 'annat-bar', name: 'Annat bärfynd', group: 'Bär', iconSvg: `<svg viewBox="0 0 36 36" class="w-7 h-7"><circle cx="14" cy="22" r="6" fill="#A855F7"/><circle cx="22" cy="20" r="5" fill="#C084FC"/><path fill="#15803D" d="M18 6c-3 0-6 3-6 7h4c3 0 6-3 6-7h-4z"/></svg>` },


  // NATUR & FRILUFTSLIV
  { id: 'fiske', name: 'Fiskeplats', group: 'Natur & Friluftsliv', iconSvg: `<svg viewBox="0 0 36 36" class="w-7 h-7"><path fill="#0284C7" d="M7 18c6-5 16-5 22 0-3 3-5 8-11 8s-8-5-11-8z"/><circle cx="23" cy="16" r="1.5" fill="#FFFFFF"/><path fill="#0369A1" d="M7 18l-4-4v8l4-4z"/></svg>` },
  { id: 'talt', name: 'Tält- & Lägerplats', group: 'Natur & Friluftsliv', iconSvg: `<svg viewBox="0 0 36 36" class="w-7 h-7"><path fill="#D97706" d="M18 4L4 28h28L18 4z"/><path fill="#B45309" d="M18 4l14 24H18V4z"/><path fill="#78350F" d="M14 28l4-10 4 10h-8z"/></svg>` },
  { id: 'utsikt', name: 'Utsikts- & Rastplats', group: 'Natur & Friluftsliv', iconSvg: `<svg viewBox="0 0 36 36" class="w-7 h-7"><circle cx="18" cy="14" r="6" fill="#F59E0B"/><path fill="#0284C7" d="M4 28h28v2H4z"/><path fill="#15803D" d="M4 28l8-10 6 6 6-8 8 12H4z"/></svg>` },
  { id: 'jakt', name: 'Jaktpass / Djur', group: 'Natur & Friluftsliv', iconSvg: `<svg viewBox="0 0 36 36" class="w-7 h-7"><path fill="#B45309" d="M18 16c-4 0-7 3-7 7v7h14v-7c0-4-3-7-7-7z"/><path fill="#78350F" d="M11 12l-5-6 3-1 4 5-2 2zm14 0l5-6-3-1-4 5 2 2z"/><circle cx="18" cy="12" r="4" fill="#D97706"/></svg>` },
  { id: 'tjarn', name: 'Skogstjärn / Bad', group: 'Natur & Friluftsliv', iconSvg: `<svg viewBox="0 0 36 36" class="w-7 h-7"><path fill="#38BDF8" d="M18 4c-5 7-10 12-10 17 0 5.5 4.5 10 10 10s10-4.5 10-10c0-5-5-10-10-17z"/><path fill="#BAE6FD" d="M15 18c-2 3-3 5-3 7 0 2 1.5 3 3 3s2-.5 2-1.5c0-2-1-4-2-8.5z"/></svg>` },
  { id: 'annat', name: 'Annat naturfynd', group: 'Övrigt', iconSvg: `<svg viewBox="0 0 36 36" class="w-7 h-7"><circle cx="18" cy="14" r="7" fill="#EF4444"/><path fill="#DC2626" d="M18 21l-5 11h10l-5-11z"/><circle cx="18" cy="14" r="3" fill="#FFFFFF"/></svg>` }
];

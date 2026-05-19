// Academic year utilities for the Cameroon school system.
// Supports FR (Francophone) and EN (Anglophone) tracks.

// "2024-2025" → "2025-2026"
export function computeNextYear(current) {
  if (!current) return '';
  const match = current.match(/^(\d{4})-(\d{4})$/);
  if (!match) return current;
  const start = parseInt(match[1], 10);
  return `${start + 1}-${start + 2}`;
}

// FR secondary cycle levels in order
const FR_SECONDARY = ['6ème', '5ème', '4ème', '3ème', '2nde', '1ère', 'Terminale'];
// FR primary levels
const FR_PRIMARY = ['SIL', 'CP', 'CE1', 'CE2', 'CM1', 'CM2'];
// Maternelle levels
const MATERNELLE = ['PS', 'MS', 'GS'];

// EN secondary levels
const EN_SECONDARY = ['Form 1', 'Form 2', 'Form 3', 'Form 4', 'Form 5'];
const EN_HIGH = ['Lower Sixth', 'Upper Sixth'];

function nextInList(list, current) {
  const idx = list.findIndex((l) => l.toLowerCase() === current?.toLowerCase());
  if (idx < 0) return undefined;
  if (idx === list.length - 1) return null; // graduating / end of cycle
  return list[idx + 1];
}

// Returns the next level string, null if graduating, or undefined if unknown level.
export function getNextLevel(level, system) {
  if (!level) return undefined;

  const trimmed = level.trim();

  if (system === 'EN') {
    const enSec = nextInList(EN_SECONDARY, trimmed);
    if (enSec !== undefined) return enSec;

    const enHigh = nextInList(EN_HIGH, trimmed);
    if (enHigh !== undefined) return enHigh;
  }

  // FR or unknown system — try all FR lists
  const frSec = nextInList(FR_SECONDARY, trimmed);
  if (frSec !== undefined) return frSec;

  const frPrim = nextInList(FR_PRIMARY, trimmed);
  if (frPrim !== undefined) return frPrim;

  const mat = nextInList(MATERNELLE, trimmed);
  if (mat !== undefined) return mat;

  // Level not recognised — keep it as-is (no auto-promotion, no graduation)
  return undefined;
}

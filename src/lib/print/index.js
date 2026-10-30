// Socle d'impression NotesCam — point d'entrée unique.
//
//   import { sheet, officialHeaderHtml, printSheets } from '../lib/print';
//
// Voir docs/PRINT_ENGINE.md pour le contrat complet (profils de page, classes
// CSS, garde-fous, pagination).

export {
  PX_PER_MM, mmToPx, pxToMm, PAPER, PAGE_PROFILES, DEFAULT_PROFILE, CLASS,
  pageMetrics, printCss, installPrintStyles, setPrintProfile,
} from './printStyles';

export {
  EMPTY, isBadValue, num, txt, esc, safe, auditDocument, scrubDocument, checkParts,
} from './printValidation';

export {
  pagesForHeight, measureDocument, chunk, needsBatching, estimateSeconds, BATCH_SIZE,
} from './printPagination';

export {
  sheet, sheetOpen, SHEET_CLOSE, officialHeaderHtml, titleBandHtml,
  signatureBlockHtml, verificationBlockHtml, footerHtml,
  buildPrintDocument, printSheets, openPrintWindow, PRINT_RESULT, BOOT_SCRIPT,
} from './printLayout';

export {
  fitLiveSheets, resetLiveSheets, facteurFit, MIN_FIT_SCALE, FIT_VAR,
} from './fitLiveSheets';

// Le remplissage de page PAR LA MESURE — successeur de `fitLiveSheets` pour les
// gabarits qui déclarent le contrat de densité (`--nc-d`). Voir fitDensity.js.
export {
  ajusterDensite, reinitialiserDensite, attendreRessources,
  chercherDensite, chercherReliquat, D_MIN, D_MAX, CIBLE_MIN,
  VAR_D, VAR_RELIQUAT, CLASSE_MESURE,
} from './fitDensity';

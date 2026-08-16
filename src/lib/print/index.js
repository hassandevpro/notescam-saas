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

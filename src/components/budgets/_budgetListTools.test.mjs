// Les nouveaux composants de lecture de la page Budgets, RENDUS pour de vrai.
//
// Ce que le test garde : aucun état n'est donné par la couleur seule, une action
// absente ou grisée a toujours sa phrase, et l'aperçu d'activation en lot dit ce
// qui est retenu, ce qui est exclu et pourquoi. Les chiffres viennent des
// fonctions pures (lib/budgetLineView, déjà testées) ; ici on contrôle l'affichage.
//
//   node --experimental-loader ./scripts/lib/jsx-resolve.mjs src/components/budgets/_budgetListTools.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { renderToStaticMarkup } = require('react-dom/server');
const { createElement: h } = require('react');
globalThis.__VITE_ENV__ = {};
// i18n lit la langue dans localStorage : doublure inerte (le rendu ne contacte rien).
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };

const { BudgetSteps, BlockersCard, ReadyCard, ListToolbar } = await import('./BudgetListTools.jsx');
const { default: BulkActivateModal } = await import('./BulkActivateModal.jsx');
const html = (el) => renderToStaticMarkup(el);

test('parcours : chaque étape dit son état en toutes lettres, la courante est marquée', () => {
  const out = html(h(BudgetSteps, {
    steps: [
      { key: 'periods', state: 'done' }, { key: 'lines', state: 'done' }, { key: 'allocation', state: 'current' },
      { key: 'activation', state: 'todo' }, { key: 'expenses', state: 'todo' },
    ],
    details: { allocation: '24 à compléter' },
  }));
  assert.match(out, /Terminé/);
  assert.match(out, /En cours · 24 à compléter/);
  assert.match(out, /À venir/);
  assert.equal((out.match(/aria-current="step"/g) || []).length, 1);
});

test('cartes : le total est un nombre de lignes, les motifs sont des filtres pressables', () => {
  const out = html(h(BlockersCard, {
    todoCount: 2, activeBlocker: 'amount_missing', onPick: () => {},
    groups: [{ code: 'sector_alloc_missing', count: 2, ids: ['a', 'b'] }, { code: 'amount_missing', count: 1, ids: ['a'] }],
  }));
  assert.match(out, /2 lignes à compléter/);
  assert.match(out, /aria-pressed="true"[^>]*>1 · Montant annuel non défini/);
  assert.match(out, /compté[e]? une seule fois/);
});

test('activation en lot : bouton pour qui approuve, phrase pour les autres', () => {
  const approve = html(h(ReadyCard, { readyCount: 41, canApprove: true, canManage: true, onOpen: () => {} }));
  assert.match(approve, /Activer les 41 lignes prêtes/);
  const manage = html(h(ReadyCard, { readyCount: 41, canApprove: false, canManage: true, onOpen: () => {} }));
  assert.doesNotMatch(manage, /<button/);
  assert.match(manage, /réservée aux personnes qui peuvent approuver/);
  const readOnly = html(h(ReadyCard, { readyCount: 41, canApprove: false, canManage: false, onOpen: () => {} }));
  assert.match(readOnly, /lecture seule/);
  assert.match(html(h(ReadyCard, { readyCount: 0, canApprove: true, canManage: true, onOpen: () => {} })), /Aucune ligne prête/);
});

test('barre : champ étiqueté, tri, filtres avec compteurs', () => {
  const out = html(h(ListToolbar, {
    query: '', onQuery: () => {}, sort: 'order', onSort: () => {}, state: 'todo', onState: () => {},
    counts: { all: 65, todo: 24, ready: 41, active: 0, closed: 0 }, onCollapseAll: () => {}, onExpandAll: () => {},
  }));
  assert.match(out, /for="budget-search"/);
  assert.match(out, /Tous \(65\)/);
  assert.match(out, /aria-pressed="true"[^>]*>À compléter \(24\)/);
  assert.match(out, /Montant décroissant/);
});

const plan = {
  accepted: [{ id: 'a', label: 'Carburant', planned_amount: 6800000 }, { id: 'b', label: 'Pneus', planned_amount: 650000 }],
  excluded: [{ id: 'c', label: 'Tableaux blancs', errs: ['amount_missing', 'period_alloc_missing'] }],
  total: 7450000, envelope: 121098000, alreadyActive: 114148000, remaining: -500000,
};

test('aperçu d’activation : retenues, exclues avec motifs, restant sous l’enveloppe', () => {
  const out = html(h(BulkActivateModal, { plan, remote: false, onActivate: async () => ({}), onClose: () => {} }));
  assert.match(out, /Lignes retenues[^<]*\(2\)/);
  assert.match(out, /Lignes exclues[^<]*\(1\)/);
  assert.match(out, /Tableaux blancs<\/b> — Montant annuel non défini · Aucune répartition par période/);
  assert.match(out, /Activer 2 lignes/);
});

test('en gouvernance distante : le bouton parle de demandes, pas d’activations', () => {
  const out = html(h(BulkActivateModal, { plan, remote: true, onActivate: async () => ({}), onClose: () => {} }));
  assert.match(out, /Envoyer 2 demandes d’activation/);
  assert.match(out, /envoyée comme une demande au poste de l’école/);
});

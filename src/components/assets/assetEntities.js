// Descripteurs DÉCLARATIFS du module Immobilisations (mêmes conventions que
// hrEntities → réutilise le modal générique HrRecordModal + sanitizeRecord).
import { ASSET_CATEGORIES, ASSET_STATUSES, BREAKDOWN_STATUSES, REPAIR_STATUSES } from '../../lib/assetEngine';

export const CATEGORY_LABELS = {
  vehicule: ['Véhicule', 'Vehicle', 'Vehículo'],
  batiment: ['Bâtiment', 'Building', 'Edificio'],
  ordinateur: ['Ordinateur', 'Computer', 'Ordenador'],
  imprimante: ['Imprimante', 'Printer', 'Impresora'],
  groupe_electrogene: ['Groupe électrogène', 'Generator', 'Generador'],
  mobilier: ['Mobilier', 'Furniture', 'Mobiliario'],
};
export const STATUS_LABELS = {
  active: ['En service', 'In service', 'En servicio'],
  maintenance: ['En maintenance', 'Under maintenance', 'En mantenimiento'],
  out_of_service: ['Hors service', 'Out of service', 'Fuera de servicio'],
  disposed: ['Réformé', 'Disposed', 'Dado de baja'],
};
const BREAKDOWN_LABELS = { open: ['Ouverte', 'Open', 'Abierta'], resolved: ['Résolue', 'Resolved', 'Resuelta'] };
const REPAIR_LABELS = { planned: ['Planifiée', 'Planned', 'Planificada'], done: ['Effectuée', 'Done', 'Realizada'] };

export const OPTION_LABELS = { ...CATEGORY_LABELS, ...STATUS_LABELS, ...BREAKDOWN_LABELS, ...REPAIR_LABELS };
const opts = (values, labels) => values.map((v) => ({ value: v, label: labels[v] || [v] }));

// Descripteur de l'ACTIF (registre) — utilisé par le modal générique.
export const ASSET_FORM = {
  key: 'asset', label: ['Immobilisation', 'Asset', 'Activo'],
  fields: [
    { key: 'category', label: ['Catégorie', 'Category', 'Categoría'], type: 'select', options: opts(ASSET_CATEGORIES, CATEGORY_LABELS) },
    { key: 'name', label: ['Désignation', 'Name', 'Nombre'], type: 'text' },
    { key: 'asset_number', label: ['Numéro d’inventaire', 'Inventory no.', 'N.º inventario'], type: 'text' },
    { key: 'value', label: ['Valeur', 'Value', 'Valor'], type: 'number' },
    { key: 'acquisition_date', label: ['Date d’acquisition', 'Acquisition date', 'Fecha adquisición'], type: 'date' },
    { key: 'status', label: ['Statut', 'Status', 'Estado'], type: 'select', options: opts(ASSET_STATUSES, STATUS_LABELS) },
    { key: 'location', label: ['Emplacement', 'Location', 'Ubicación'], type: 'text' },
    { key: 'serial_number', label: ['N° de série', 'Serial no.', 'N.º serie'], type: 'text' },
    { key: 'notes', label: ['Notes', 'Notes', 'Notas'], type: 'textarea' },
  ],
};

// Journaux satellites (onglets du détail d'un actif).
export const ASSET_TABS = [
  {
    key: 'breakdowns', label: ['Pannes', 'Breakdowns', 'Averías'],
    fields: [
      { key: 'date', label: ['Date', 'Date', 'Fecha'], type: 'date' },
      { key: 'description', label: ['Description', 'Description', 'Descripción'], type: 'textarea' },
      { key: 'severity', label: ['Gravité', 'Severity', 'Gravedad'], type: 'text' },
      { key: 'status', label: ['Statut', 'Status', 'Estado'], type: 'select', options: opts(BREAKDOWN_STATUSES, BREAKDOWN_LABELS) },
      { key: 'reported_by', label: ['Signalé par', 'Reported by', 'Reportado por'], type: 'text' },
      { key: 'notes', label: ['Notes', 'Notes', 'Notas'], type: 'textarea' },
    ],
    columns: ['date', 'description', 'severity', 'status'],
  },
  {
    key: 'repairs', label: ['Réparations', 'Repairs', 'Reparaciones'],
    fields: [
      { key: 'date', label: ['Date', 'Date', 'Fecha'], type: 'date' },
      { key: 'description', label: ['Description', 'Description', 'Descripción'], type: 'textarea' },
      { key: 'provider', label: ['Prestataire', 'Provider', 'Proveedor'], type: 'text' },
      { key: 'cost', label: ['Coût', 'Cost', 'Coste'], type: 'number' },
      { key: 'status', label: ['Statut', 'Status', 'Estado'], type: 'select', options: opts(REPAIR_STATUSES, REPAIR_LABELS) },
      { key: 'notes', label: ['Notes', 'Notes', 'Notas'], type: 'textarea' },
    ],
    columns: ['date', 'description', 'provider', 'cost', 'status'],
  },
  {
    key: 'expenses', label: ['Dépenses', 'Expenses', 'Gastos'],
    fields: [
      { key: 'date', label: ['Date', 'Date', 'Fecha'], type: 'date' },
      { key: 'category', label: ['Catégorie', 'Category', 'Categoría'], type: 'text' },
      { key: 'amount', label: ['Montant', 'Amount', 'Importe'], type: 'number' },
      { key: 'supplier', label: ['Fournisseur', 'Supplier', 'Proveedor'], type: 'text' },
      { key: 'notes', label: ['Notes', 'Notes', 'Notas'], type: 'textarea' },
    ],
    columns: ['date', 'category', 'amount', 'supplier'],
  },
];
export const ASSET_TAB_BY_KEY = Object.fromEntries(ASSET_TABS.map((tb) => [tb.key, tb]));

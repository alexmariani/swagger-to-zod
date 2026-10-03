/**
 * Messaggi di errore Zod configurabili per locale.
 * Default: italiano. Locale "en" per inglese.
 */

export type Messages = {
  /** stringhe obbligatorie senza minLength esplicito */
  required: string;
  minLength: (n: number) => string;
  maxLength: (n: number) => string;
  min: (n: number) => string;
  max: (n: number) => string;
  email: string;
  uuid: string;
  pattern: string;
  minItems: (n: number) => string;
  maxItems: (n: number) => string;
  /** funzione per messaggi custom x-validate (field/ref op) */
  custom: (field: string, op: string, ref: string) => string;
};

const it: Messages = {
  required: "Il campo è obbligatorio",
  minLength: (n) => `Deve contenere almeno ${n} caratteri`,
  maxLength: (n) => `Non può superare ${n} caratteri`,
  min: (n) => `Il valore deve essere maggiore o uguale a ${n}`,
  max: (n) => `Il valore deve essere minore o uguale a ${n}`,
  email: "Inserisci un indirizzo email valido",
  uuid: "Formato UUID non valido",
  pattern: "Formato non valido",
  minItems: (n) => `Deve contenere almeno ${n} elementi`,
  maxItems: (n) => `Non può contenere più di ${n} elementi`,
  custom: (f, op, r) => `Il campo "${f}" deve essere ${opLabel(it, op)} "${r}"`,
};

const en: Messages = {
  required: "This field is required",
  minLength: (n) => `Must contain at least ${n} characters`,
  maxLength: (n) => `Must not exceed ${n} characters`,
  min: (n) => `Must be greater than or equal to ${n}`,
  max: (n) => `Must be less than or equal to ${n}`,
  email: "Enter a valid email address",
  uuid: "Invalid UUID format",
  pattern: "Invalid format",
  minItems: (n) => `Must contain at least ${n} items`,
  maxItems: (n) => `Must not contain more than ${n} items`,
  custom: (f, op, r) => `Field "${f}" must be ${opLabel(en, op)} "${r}"`,
};

function opLabel(m: Pick<Messages, 'custom'>, op: string): string {
  switch (op) {
    case 'gt':
      return '> rispetto a';
    case 'gte':
      return '>= rispetto a';
    case 'lt':
      return '< rispetto a';
    case 'lte':
      return '<= rispetto a';
    case 'eq':
      return 'uguale a';
    case 'neq':
      return 'diverso da';
    default:
      return op;
  }
}

const TABLES: Record<string, Messages> = { it, ita: it, italian: it, en, eng: en, english: en };

export function getMessages(locale?: string): Messages {
  if (!locale) return it;
  return TABLES[locale.toLowerCase()] ?? it;
}
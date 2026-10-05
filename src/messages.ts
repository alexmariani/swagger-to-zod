/**
 * Messaggi di errore Zod configurabili per locale + override da file JSON.
 * Default: italiano. Locale "en" per inglese.
 *
 * Il file di override (flag --messages) è un JSON che può sovrascrivere TUTTI
 * o SOLO alcuni messaggi; i non specificati restano quelli della locale.
 * Placeholder nei template:
 *   {n}  -> valore numerico (minLength, maxLength, min, max, minItems, maxItems)
 *   {f}  -> nome campo           (custom / x-validate)
 *   {op} -> operatore            (custom / x-validate)
 *   {r}  -> campo di riferimento (custom / x-validate)
 */

export type MessageTemplates = {
  required: string;
  minLength: string;
  maxLength: string;
  min: string;
  max: string;
  email: string;
  uuid: string;
  pattern: string;
  minItems: string;
  maxItems: string;
  custom: string;
};

export type Messages = {
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
  custom: (field: string, op: string, ref: string) => string;
};

const it: MessageTemplates = {
  required: 'Il campo è obbligatorio',
  minLength: 'Deve contenere almeno {n} caratteri',
  maxLength: 'Non può superare {n} caratteri',
  min: 'Il valore deve essere maggiore o uguale a {n}',
  max: 'Il valore deve essere minore o uguale a {n}',
  email: 'Inserisci un indirizzo email valido',
  uuid: 'Formato UUID non valido',
  pattern: 'Formato non valido',
  minItems: 'Deve contenere almeno {n} elementi',
  maxItems: 'Non può contenere più di {n} elementi',
  custom: 'Il campo "{f}" deve essere {op} "{r}"',
};

const en: MessageTemplates = {
  required: 'This field is required',
  minLength: 'Must contain at least {n} characters',
  maxLength: 'Must not exceed {n} characters',
  min: 'Must be greater than or equal to {n}',
  max: 'Must be less than or equal to {n}',
  email: 'Enter a valid email address',
  uuid: 'Invalid UUID format',
  pattern: 'Invalid format',
  minItems: 'Must contain at least {n} items',
  maxItems: 'Must not contain more than {n} items',
  custom: 'Field "{f}" must be {op} "{r}"',
};

const TABLES: Record<string, MessageTemplates> = {
  it,
  ita: it,
  italian: it,
  en,
  eng: en,
  english: en,
};

/**
 * Messaggi di errore Zod con override opzionale.
 * @param locale   lingua di base (default 'it')
 * @param override template parziali che sovrascrivono i default della locale
 */
export function getMessages(locale?: string, override?: Partial<MessageTemplates>): Messages {
  const base = (locale && TABLES[locale.toLowerCase()]) || it;
  const tpl: MessageTemplates = { ...base, ...(override ?? {}) };
  return compile(tpl);
}

/** Compila template string in funzioni Messages (sostituendo i placeholder). */
function compile(t: MessageTemplates): Messages {
  const fill = (template: string) => (values: Record<string, string | number>) =>
    template.replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? `{${key}}`));

  const num = (template: string) => (n: number) => fill(template)({ n });

  return {
    required: fill(t.required)({}),
    minLength: num(t.minLength),
    maxLength: num(t.maxLength),
    min: num(t.min),
    max: num(t.max),
    email: fill(t.email)({}),
    uuid: fill(t.uuid)({}),
    pattern: fill(t.pattern)({}),
    minItems: num(t.minItems),
    maxItems: num(t.maxItems),
    custom: (f, op, r) => fill(t.custom)({ f, op: opLabel(op), r }),
  };
}

function opLabel(op: string): string {
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
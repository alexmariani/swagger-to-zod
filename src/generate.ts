/**
 * Generatore OpenAPI 3.x → tipi TS + schemi Zod.
 * Mappa components.schemas in schemi Zod pronti per React Hook Form.
 *
 * Convenzioni:
 *  - un campo OpenAPI "foo" su oggetto "User" produce:
 *      - type User = { foo: ... }
 *      - export const UserSchema = z.object({...})
 *  - $ref risolti inline (zero dipendenze da nomi esterni, output self-contained)
 *  - enum -> z.enum([...]) ; format:uuid -> z.string().uuid()
 *  - format:date-time -> z.coerce.date() (nullable gestito)
 *  - pattern -> .regex() ; numerici con min/max
 */

import { getMessages, type Messages, type MessageTemplates } from './messages.js';

export type ParseResult = {
  types: string;
  schemas: string;
  names: string[];
};

const REF_PREFIX = '#/components/schemas/';

let _indent = 0;
let _msgs: Messages = getMessages();
const pad = () => '  '.repeat(_indent);

export function generate(spec: any, locale?: string, override?: Partial<MessageTemplates>): ParseResult {
  _indent = 0;
  _msgs = getMessages(locale, override);
  const schemas = spec?.components?.schemas ?? {};
  const names = Object.keys(schemas);
  if (names.length === 0) {
    throw new Error('Nessun components.schemas trovato nello spec.');
  }

  const typeLines: string[] = [];
  const schemaLines: string[] = [];

  for (const name of names) {
    const typeName = toPascal(name);
    const typeDef = renderType(name, schemas[name]);
    typeLines.push(`${pad()}export type ${typeName} = ${typeDef};`);
    schemaLines.push(`${pad()}export const ${toPascal(name)}Schema = ${renderSchema(name, schemas[name])};`);
  }

  return {
    types: typeLines.join('\n'),
    schemas: schemaLines.join('\n'),
    names,
  };
}

/* ------------------------------------------------------------------ */
/* Rendering del TIPO TypeScript                                       */
/* ------------------------------------------------------------------ */

function renderType(name: string, schema: any, seen = new Set<string>()): string {
  if (!schema) return 'unknown';
  if (schema.$ref) return toPascal(schema.$ref.replace(REF_PREFIX, ''));

  if (seen.has(name)) return 'unknown'; // guardia anti-ricorsione
  const next = new Set(seen);
  next.add(name);

  const base = renderTypeInner(name, schema, next);
  return schema.nullable ? `${base} | null` : base;
}

function renderTypeInner(name: string, schema: any, seen: Set<string>): string {
  if (Array.isArray(schema.type)) return mapComposedTypes(schema.type).join(' | ');
  switch (schema.type) {
    case 'string':
      return 'string';
    case 'integer':
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'array':
      return `${renderType(name + 'Item', schema.items ?? { type: 'unknown' }, seen)}[]`;
    case 'object': {
      const props = schema.properties ?? {};
      const required = new Set(schema.required ?? []);
      const fields = Object.keys(props).map((k) => {
        const propType = renderType(`${name}.${k}`, props[k], seen);
        return required.has(k) ? `  ${quoteKey(k)}: ${propType}` : `  ${quoteKey(k)}?: ${propType}`;
      });
      return `{\n${fields.join(',\n')}\n}`;
    }
    case 'null':
      return 'null';
    case 'file':
      return 'File';
    default:
      return 'unknown';
  }
}

function mapComposedTypes(types: string[]): string[] {
  // OpenAPI permette type: [string, "null"] come alternativa a nullable
  return types.map((t) => (t === 'null' ? 'null' : t));
}

/* ------------------------------------------------------------------ */
/* Rendering dello schema Zod                                          */
/* ------------------------------------------------------------------ */

function renderSchema(
  name: string,
  schema: any,
  seen = new Set<string>(),
  opts: { isRequired?: boolean } = {},
): string {
  if (!schema) return 'z.unknown()';
  if (schema.$ref) {
    const refZod = toPascal(schema.$ref.replace(REF_PREFIX, '')) + 'Schema';
    return opts.isRequired ? refZod : refZod;
  }

  if (seen.has(name)) return 'z.unknown()';
  const next = new Set(seen);
  next.add(name);

  let zod = schemaInner(name, schema, next, opts);

  if (schema.nullable) {
    zod = zod.endsWith('.nullable()') ? zod : `${zod}.nullable()`;
  }
  return zod;
}

function schemaInner(
  name: string,
  schema: any,
  seen: Set<string>,
  opts: { isRequired?: boolean } = {},
): string {
  if (Array.isArray(schema.type)) {
    // type: [string, "null"] -> gestito qui come nullable
    const concrete = schema.type.filter((t: string) => t !== 'null');
    const inner = concrete.length === 1 ? mapPrimitive(concrete[0], schema, opts) : 'z.unknown()';
    return `${inner}.nullable()`;
  }

  switch (schema.type) {
    case 'string':
      return mapString(schema, opts);
    case 'integer':
      return mapNumber(schema, true, opts);
    case 'number':
      return mapNumber(schema, false, opts);
    case 'boolean':
      return mapBoolean(schema, opts);
    case 'array': {
      const item = schema.items ?? {};
      const itemZod = renderSchema(`${name}Item`, item, seen);
      const inner = `z.array(${itemZod})`;
      return withArrayConstraints(inner, schema);
    }
    case 'object': {
      const props = schema.properties ?? {};
      const requiredList = schema.required ?? [];
      const required = new Set(requiredList);

      // richiede se c'è almeno un required non-nullable nel superRefine
      const requiredChecks = requiredMissingGuard(props, requiredList);
      const hasRequiredRefine = requiredChecks.length > 0;

      const shape = Object.keys(props).map((k) => {
        const isReq = required.has(k);
        const propZod = renderSchema(`${name}.${k}`, props[k], seen, { isRequired: isReq });
        // CAMPO RICHIESTO: in zod3 un campo required mancante fa fallire z.object PRIMA
        // del superRefine con messaggio inglese "Required". Lo rendiamo .optional() qui
        // e la requiredness con messaggio custom la gestisce il superRefine sottostante.
        const base = isReq && hasRequiredRefine ? `${propZod}.optional()` : (isReq ? propZod : `${propZod}.optional()`);
        return `  ${quoteKey(k)}: ${base}`;
      });
      const body = shape.length ? `{\n${shape.join(',\n')}\n}` : '{}';
      const objectZod = `z.object(${body})`;

      const refinements: string[] = [];
      if (requiredChecks) refinements.push(requiredChecks);
      const xValidate = schema['x-validate'];
      if (Array.isArray(xValidate) && xValidate.length) {
        refinements.push(renderXValidate(xValidate));
      }

      if (refinements.length === 0) return objectZod;
      return `${objectZod}.superRefine((data, ctx) => {\n${refinements.join('\n')}\n})`;
    }
    case 'null':
      return 'z.null()';
    case 'file':
      return 'z.instanceof(File)';
    default:
      return 'z.unknown()';
  }
}

function mapPrimitive(type: string, schema: any, opts?: { isRequired?: boolean }): string {
  switch (type) {
    case 'string':
      return mapString(schema, opts);
    case 'integer':
      return mapNumber(schema, true, opts);
    case 'number':
      return mapNumber(schema, false, opts);
    case 'boolean':
      return mapBoolean(schema, opts);
    default:
      return 'z.unknown()';
  }
}

function mapString(schema: any, opts?: { isRequired?: boolean }): string {
  if (schema.enum) {
    const vals = schema.enum.map((v: any) => JSON.stringify(v)).join(', ');
    let z = `z.enum([${vals}])`;
    if (schema.default !== undefined) z += `.default(${JSON.stringify(schema.default)})`;
    return z;
  }
  let z = 'z.string()';
  if (schema.minLength !== undefined) {
    z += `.min(${schema.minLength}, ${jsStr(_msgs.minLength(schema.minLength))})`;
  } else if (opts?.isRequired && !schema.format) {
    // stringa obbligatoria senza vincolo di lunghezza -> messaggio "campo obbligatorio"
    z += `.min(1, ${jsStr(_msgs.required)})`;
  }
  if (schema.maxLength !== undefined) {
    z += `.max(${schema.maxLength}, ${jsStr(_msgs.maxLength(schema.maxLength))})`;
  }
  switch (schema.format) {
    case 'uuid':
      z += `.uuid(${jsStr(_msgs.uuid)})`;
      break;
    case 'email':
      z += `.email(${jsStr(_msgs.email)})`;
      break;
    case 'date-time':
      // date-time dal backend .NET (LocalDateTime/OffsetDateTime) -> coerce Date
      z = `z.coerce.date()`;
      break;
    case 'date':
      z = `z.coerce.date()`;
      break;
    default:
      break;
  }
  if (schema.pattern) {
    const escaped = schema.pattern.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    z += `.regex(new RegExp('${escaped}'), ${jsStr(_msgs.pattern)})`;
  }
  if (schema.default !== undefined) z += `.default(${JSON.stringify(schema.default)})`;
  return z;
}

function mapNumber(schema: any, isInteger: boolean, opts?: { isRequired?: boolean }): string {
  let z = isInteger ? 'z.number().int()' : 'z.number()';
  if (schema.minimum !== undefined) z += `.min(${schema.minimum}, ${jsStr(_msgs.min(schema.minimum))})`;
  if (schema.maximum !== undefined) z += `.max(${schema.maximum}, ${jsStr(_msgs.max(schema.maximum))})`;
  if (schema.default !== undefined) z += `.default(${schema.default})`;
  return z;
}

function mapBoolean(schema: any, _opts?: { isRequired?: boolean }): string {
  let z = 'z.boolean()';
  if (schema.default !== undefined) z += `.default(${schema.default})`;
  return z;
}

function withArrayConstraints(inner: string, schema: any): string {
  let z = inner;
  if (schema.minItems !== undefined) z += `.min(${schema.minItems}, ${jsStr(_msgs.minItems(schema.minItems))})`;
  if (schema.maxItems !== undefined) z += `.max(${schema.maxItems}, ${jsStr(_msgs.maxItems(schema.maxItems))})`;
  return z;
}

/**
 * Genera il guard che segnala i campi obbligatori mancanti con messaggio custom.
 * in zod 3 un campo required mancante produce errore generico di z.object;
 * qui emettiamo ctx.addIssue con path sul campo e messaggio "Il campo è obbligatorio".
 */
function requiredMissingGuard(props: Record<string, any>, requiredList: string[]): string {
  const missing = requiredList.filter((k) => {
    if (!props[k]) return true;
    return !props[k].nullable; // i required nullable passano comunque (null accettato)
  });
  if (missing.length === 0) return '';

  return missing
    .map((k) => {
      const key = quoteKey(k);
      return `  if (data.${key} === undefined || data.${key} === null) {
    ctx.addIssue({ code: 'custom', path: [${JSON.stringify(k)}], message: ${jsStr(_msgs.required)} });
  }`;
    })
    .join('\n');
}

/**
 * Compila le regole x-validate (cross-field) in ctx.addIssue.
 * Formato per-schema:
 *   "x-validate": [
 *     { "field": "dataFine", "op": "gt", "ref": "dataInizio", "message": "..." }
 *   ]
 * Op supportate: gt, gte, lt, lte, eq, neq.
 */
function renderXValidate(rules: any[]): string {
  return rules
    .map((rule: any) => {
      const field = String(rule.field);
      const ref = String(rule.ref);
      const op = String(rule.op);
      const message = rule.message ?? _msgs.custom(field, op, ref);
      const violation = violationExpr(op, `data.${field}`, `data.${ref}`);
      return `  if (data.${field} != null && data.${ref} != null && ${violation}) {
    ctx.addIssue({ code: 'custom', path: [${JSON.stringify(field)}], message: ${jsStr(message)} });
  }`;
    })
    .join('\n');
}

function violationExpr(op: string, a: string, b: string): string {
  switch (op) {
    case 'gt':
      return `!(${a} > ${b})`;
    case 'gte':
      return `!(${a} >= ${b})`;
    case 'lt':
      return `!(${a} < ${b})`;
    case 'lte':
      return `!(${a} <= ${b})`;
    case 'eq':
      return `!(${a} === ${b})`;
    case 'neq':
      return `!(${a} !== ${b})`;
    default:
      throw new Error(`x-validate: operatore "${op}" non supportato (gt|gte|lt|lte|eq|neq)`);
  }
}

/** Serializza una stringa come literal TS safe (doppi apici, escape). */
function jsStr(s: string): string {
  return JSON.stringify(s);
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function toPascal(name: string): string {
  // Alimenta nomi tipo "User", "CreateUserRequest" ; gestisce snake/kebab/dots
  return name
    .split(/[^A-Za-z0-9]+/)
    .filter((s) => s.length)
    .map((s) => s[0].toUpperCase() + s.slice(1))
    .join('');
}

function quoteKey(key: string): string {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(key) ? key : JSON.stringify(key);
}
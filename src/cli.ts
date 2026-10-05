#!/usr/bin/env node
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve as resolvePath, dirname } from 'node:path';
import { loadSpec } from './load-spec.js';
import { generate } from './generate.js';
import type { MessageTemplates } from './messages.js';

const DEFAULT_OUTPUT = 'api-schema.ts';
const MESSAGE_KEYS: (keyof MessageTemplates)[] = [
  'required',
  'minLength',
  'maxLength',
  'min',
  'max',
  'email',
  'uuid',
  'pattern',
  'minItems',
  'maxItems',
  'custom',
];

function printUsage() {
  console.log(`
swagger-to-zod — genera tipi TS + schemi Zod da spec OpenAPI 3.x

USO:
  tsx src/cli.ts <spec|url> [--out <file.ts>] [--locale <it|en>] [--messages <file.json>]

ARGOMENTI:
  <spec|url>     spec OpenAPI: percorso file locale (.json/.yaml/.yml)
                 oppure URL http/https. Obbligatorio.
  --out          file di output (default: ${DEFAULT_OUTPUT})
  --locale       lingua messaggi errore Zod: it (default) | en
  --messages     file JSON con override dei messaggi errore (facoltativo).
                 Chiavi: ${MESSAGE_KEYS.join(', ')}.
                 Placeholder: {n} (numero), {f}/{op}/{r} (custom).

ESEMPI:
  tsx src/cli.ts examples/pet-partial.json --out examples/out/api-schema.ts --locale it
  tsx src/cli.ts examples/pet-partial.json --out api.ts --messages messages.json
`);
}

type Args = { input: string; out: string; locale?: string; messagesFile?: string };

function parseArgs(argv: string[]): Args {
  let input = '';
  let out = DEFAULT_OUTPUT;
  let locale: string | undefined;
  let messagesFile: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case '--out':
        out = argv[++i];
        break;
      case '--locale':
        locale = argv[++i];
        break;
      case '--messages':
        messagesFile = argv[++i];
        break;
      case '--help':
      case '-h':
        printUsage();
        process.exit(0);
        break;
      default:
        if (!input) input = argv[i];
        break;
    }
  }
  if (!input) {
    printUsage();
    process.exit(2);
  }
  return { input, out, locale, messagesFile };
}

function buildModule(
  spec: any,
  locale?: string,
  override?: Partial<MessageTemplates>,
  messagesFile?: string,
): string {
  const srcTitle = spec?.info?.title ? ` * Title: ${spec.info.title}` : '';
  const srcVersion = spec?.info?.version ? ` v${spec.info.version}` : '';
  const genTime = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const localeNote = locale ? ` (locale: ${locale})` : ' (locale: it)';
  const messagesNote = messagesFile ? ` · messaggi override: ${messagesFile}` : '';

  const { types, schemas } = generate(spec, locale, override);

  return `/**
 * GENERATO AUTOMATICAMENTE da swagger-to-zod — NON MODIFICARE A MANO.
 *${srcTitle}${srcVersion}${localeNote}${messagesNote}
 * Generato il ${genTime} UTC
 * Stack: Zod (React Hook Form) + TypeScript
 */
import { z } from 'zod';

/* ============================ TIPI ============================ */

${types}

/* ========================= SCHEMI ZOD ========================= */

${schemas}
`;
}

/** Carica e valida il file JSON di override messaggi (parziale ammesso). */
function parseOverride(file: string, raw: string): Partial<MessageTemplates> {
  let data: unknown;
  try {
    data = JSON.parse(raw.replace(/^\uFEFF/, '').trim());
  } catch {
    throw new Error(`--messages ${file}: JSON non valido.`);
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error(`--messages ${file}: atteso un oggetto JSON con chiavi ${MESSAGE_KEYS.join(', ')}.`);
  }
  const out: Partial<MessageTemplates> = {};
  for (const k of Object.keys(data as Record<string, unknown>)) {
    const value = (data as Record<string, unknown>)[k];
    if (typeof value !== 'string') {
      throw new Error(`--messages ${file}: la chiave "${k}" deve essere una stringa.`);
    }
    out[k as keyof MessageTemplates] = value;
  }
  return out;
}

async function main() {
  const { input, out, locale, messagesFile } = parseArgs(process.argv.slice(2));
  const spec = await loadSpec(input);

  let messagesArg: Partial<MessageTemplates> | undefined;
  if (messagesFile) {
    const resolved = resolvePath(messagesFile);
    const raw = await readFile(resolved, 'utf-8');
    messagesArg = parseOverride(messagesFile, raw);
  }

  const module = buildModule(spec, locale, messagesArg, messagesFile);
  const outPath = resolvePath(out);
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, module, 'utf-8');

  const count = Object.keys(spec?.components?.schemas ?? {}).length;
  console.log(`✓ Generato ${outPath}`);
  console.log(`  schemi: ${count}`);
  if (messagesArg) {
    console.log(`  messaggi override: ${Object.keys(messagesArg).length} chiavi`);
  }
}

main().catch((e) => {
  console.error(`Errore: ${e.message}`);
  process.exit(1);
});
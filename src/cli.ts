import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve as resolvePath, dirname } from 'node:path';
import { loadSpec } from './load-spec.js';
import { generate } from './generate.js';

const DEFAULT_OUTPUT = 'api-schema.ts';

function printUsage() {
  console.log(`
swagger-to-zod — genera tipi TS + schemi Zod da spec OpenAPI 3.x

USO:
  tsx src/cli.ts <spec|url> [--out <file.ts>] [--locale <it|en>]

ARGOMENTI:
  <spec|url>     spec OpenAPI: percorso file locale (.json/.yaml/.yml)
                 oppure URL http/https. Obbligatorio.
  --out          file di output (default: ${DEFAULT_OUTPUT})
  --locale       lingua messaggi errore Zod: it (default) | en

ESEMPI:
  tsx src/cli.ts examples/pet-partial.json --out examples/out/api-schema.ts --locale it
  tsx src/cli.ts https://example.com/openapi.json --out api-schema.ts
`);
}

function parseArgs(argv: string[]): { input: string; out: string; locale?: string } {
  let input = '';
  let out = DEFAULT_OUTPUT;
  let locale: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case '--out':
        out = argv[++i];
        break;
      case '--locale':
        locale = argv[++i];
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
  return { input, out, locale };
}

function buildModule(spec: any, locale?: string): string {
  const srcTitle = spec?.info?.title ? ` * Title: ${spec.info.title}` : '';
  const srcVersion = spec?.info?.version ? ` v${spec.info.version}` : '';
  const genTime = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const localeNote = locale ? ` (locale: ${locale})` : ' (locale: it)';

  const { types, schemas } = generate(spec, locale);

  return `/**
 * GENERATO AUTOMATICAMENTE da swagger-to-zod — NON MODIFICARE A MANO.
 *${srcTitle}${srcVersion}${localeNote}
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

async function main() {
  const { input, out, locale } = parseArgs(process.argv.slice(2));
  const spec = await loadSpec(input);

  const module = buildModule(spec, locale);
  const outPath = resolvePath(out);
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, module, 'utf-8');

  const count = Object.keys(spec?.components?.schemas ?? {}).length;
  console.log(`✓ Generato ${outPath}`);
  console.log(`  schemi: ${count}`);
}

main().catch((e) => {
  console.error(`Errore: ${e.message}`);
  process.exit(1);
});
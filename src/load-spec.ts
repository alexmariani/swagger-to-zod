import { readFile } from 'node:fs/promises';
import { resolve as resolvePath, extname } from 'node:path';
import * as yaml from 'js-yaml';

const URL_REGEX = /^https?:\/\//i;

/**
 * Carica uno spec OpenAPI 3.x da file locale (.json/.yaml/.yml)
 * oppure da URL remoto (http/https).
 * Restituisce l'oggetto spec già parsato.
 */
export async function loadSpec(source: string): Promise<any> {
  const raw = await readSource(source);
  const ext = extensionOf(source);
  const contentType = raw.contentType?.toLowerCase() ?? '';

  let spec: any;
  if (ext === '.json' || contentType.includes('json')) {
    spec = parseAsJson(raw.body);
  } else if (ext === '.yaml' || ext === '.yml' || contentType.includes('yaml')) {
    spec = yaml.load(raw.body);
  } else {
    // fallback: sniff dal contenuto (prova JSON, poi YAML)
    spec = tryJsonThenYaml(raw.body);
  }

  assertValidSpec(spec, source);
  return spec;
}

/* ------------------------------------------------------------------ */
/* Lettura sorgente (file o URL)                                       */
/* ------------------------------------------------------------------ */

async function readSource(source: string): Promise<{ body: string; contentType?: string }> {
  if (URL_REGEX.test(source)) {
    return fetchRemote(source);
  }
  const resolved = resolvePath(source);
  const body = await readFile(resolved, 'utf-8');
  return { body };
}

async function fetchRemote(url: string): Promise<{ body: string; contentType?: string }> {
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json, application/yaml, text/yaml, text/x-yaml, */*',
    },
  });
  if (!res.ok) {
    throw new Error(`GET ${url} -> HTTP ${res.status} ${res.statusText}`);
  }
  const body = await res.text();
  return { body, contentType: res.headers.get('content-type') ?? undefined };
}

/* ------------------------------------------------------------------ */
/* Parsing                                                             */
/* ------------------------------------------------------------------ */

function extensionOf(source: string): string {
  const clean = source.split('?')[0];
  return extname(clean).toLowerCase();
}

function parseAsJson(raw: string): any {
  // gestisce eventuale BOM e spazi iniziali
  return JSON.parse(raw.replace(/^\uFEFF/, '').trim());
}

function tryJsonThenYaml(raw: string): any {
  try {
    return parseAsJson(raw);
  } catch {
    return yaml.load(raw.replace(/^\uFEFF/, ''));
  }
}

function assertValidSpec(spec: any, source: string): void {
  if (!spec || typeof spec !== 'object') {
    throw new Error(`Spec non valido in ${source}: atteso un oggetto OpenAPI.`);
  }
  if (!spec.openapi && !spec.swagger) {
    throw new Error(
      `Sorgente ${source} non riconosciuta come spec OpenAPI/Swagger (manca campo "openapi"/"swagger").`,
    );
  }
}
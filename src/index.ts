import { generate, type ParseResult } from './generate.js';
import { loadSpec } from './load-spec.js';
import { getMessages, type Messages, type MessageTemplates } from './messages.js';

export {
  generate,
  loadSpec,
  getMessages,
  type ParseResult,
  type Messages,
  type MessageTemplates,
};

/** Comodo one-shot: spec (file|url) -> stringa del modulo .ts generato. */
export async function generateModule(
  source: string,
  options: { locale?: string; messages?: Partial<MessageTemplates> } = {},
): Promise<string> {
  const spec = await loadSpec(source);
  const { types, schemas } = generate(spec, options.locale, options.messages);
  const srcTitle = spec?.info?.title ? ` * Title: ${spec.info.title}` : '';
  const srcVersion = spec?.info?.version ? ` v${spec.info.version}` : '';
  const genTime = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const localeNote = options.locale ? ` (locale: ${options.locale})` : ' (locale: it)';

  return `/**
 * GENERATO AUTOMATICAMENTE da swagger-to-zod-gen — NON MODIFICARE A MANO.
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
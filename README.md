# swagger-to-zod

Genera **tipi TypeScript + schemi Zod** da uno spec **OpenAPI 3.x / Swagger** per validazione client (React Hook Form), allineato ai DTO C#/.NET.

> Pensato per: spec Backend → (openapi-generator) → Zod TS lato client, saltando la doppia manutenzione.

## Uso

```bash
npm run generate -- <spec|url> [--out <file.ts>] [--locale <it|en>]
```

Esempi reali con la fixture inclusa:

```bash
npm run generate -- examples/pet-partial.json --out examples/out/api-schema.ts --locale it
npm run generate -- https://example.com/openapi.json --out api-schema.ts
```

`<spec|url>` accetta un percorso locale (**JSON o YAML**) oppure un **URL http/https**: in tal caso lo spec viene scaricato e il formato (JSON/YAML) rilevato da `Content-Type` o dal contenuto.

Produce `api-schema.ts` con, per ogni schema di `components.schemas`:

- `export type User = { ... }`
- `export const UserSchema = z.object({ ... })` — pronto per `resolver` di Zod in React Hook Form (`zodResolver(UserSchema)`).

`--locale` imposta la lingua dei messaggi di errore Zod (default `it`): possibilità `it`/`en`.

## Mapping OpenAPI → Zod

| OpenAPI | Zod |
|---|---|
| `required` | campo obbligatorio |
| campo non richiesto | `.optional()` |
| `nullable: true` | `.nullable()` |
| `enum` | `z.enum([...])` |
| `format: uuid` | `.uuid()` |
| `format: email` | `.email()` |
| `format: date-time`/`date` | `z.coerce.date()` |
| `pattern` | `.regex(new RegExp(...))` |
| `type: array` | `z.array(...)` (con minItems/maxItems) |
| `minimum`/`maximum` | `.min()`/`.max()` |
| `minLength`/`maxLength` | `.min()`/`.max()` |
| `$ref` | schema/type referenziato inline |
| campo in `required` | messaggio custom "Il campo è obbligatorio" (via `superRefine` + `.optional()`) |
| tutti i constraint | **messaggi errore personalizzati** nella lingua di `--locale` |

## Validazioni cross-field (`x-validate`)

Regole che confrontano due campi (es. `dataInizio` < `dataFine`) si dichiarano con l'estensione `x-validate` a livello di schema:

```json
"Prenotazione": {
  "type": "object",
  "properties": {
    "dataInizio": { "type": "string", "format": "date-time" },
    "dataFine":   { "type": "string", "format": "date-time" }
  },
  "required": ["dataInizio", "dataFine"],
  "x-validate": [
    {
      "field": "dataFine",
      "op": "gt",
      "ref": "dataInizio",
      "message": "La data di fine deve essere successiva alla data di inizio"
    }
  ]
}
```

Genera un `.superRefine()` che emette un'issue sul campo `field` con il messaggio indicato (o un default locale se `message` è omesso).

Operatori `op` supportati: `gt`, `gte`, `lt`, `lte`, `eq`, `neq`. La regola scatta solo quando entrambi i campi sono valorizzati (null-safe).

## Struttura

```
src/
  cli.ts        # entry: parsing argomenti (--out, --locale), I/O file, header modulo
  load-spec.ts  # carica spec da file locale (JSON/YAML) o URL http/https (fetch + sniff)
  generate.ts   # mapping OpenAPI → tipi TS + schemi Zod (incl. x-validate → superRefine)
  messages.ts   # messaggi errore Zod per locale (it/en)
examples/
  pet-partial.json    # spec di esempio (enum, ref, nullable, date-time, pattern, array, x-validate)
  out/api-schema.ts   # output generato
src/verify.ts         # test runtime Zod sull'output generato
```

## Verifica

```bash
./node_modules/.bin/tsx src/verify.ts
```

Esegue 14 asserzioni runtime (enum, required, pattern, email, uuid, date-time, nullable, range) sullo schema generato.

## Note date-time

`date-time` usa `z.coerce.date()` per coerenza con la serializzazione `.NET` (`LocalDateTime`/`OffsetDateTime`). Se il tuo backend serializza diversamente (es. solo stringa ISO), cambia quel ramo in `generate.ts` (`mapString`, case `date-time`).

## Limitazioni note

- `oneOf`/`anyOf`/`allOf` non ancora gestiti → `z.unknown()`.
- `additionalProperties` ignorato.
- Componenti `$ref` esterni (file separati) non risolti.

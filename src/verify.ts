// Test runtime: importa lo schema GENERATO e verifica che Zod validi davvero.
import {
  UserSchema,
  RoleSchema,
  CreateUserRequestSchema,
  AddressSchema,
  PrenotazioneSchema,
} from '../examples/out/api-schema.ts';

let failures = 0;
function check(desc: string, fn: () => boolean) {
  const ok = fn();
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${desc}`);
}

// Role enum
check('enum accetta ADMIN', () => RoleSchema.safeParse('ADMIN').success);
check('enum rifiuta SUPERADMIN', () => !RoleSchema.safeParse('SUPERADMIN').success);

// Address: required street/city, pattern zip
check('address ok con zip valido', () =>
  AddressSchema.safeParse({ street: 'Via X', city: 'Roma', zip: '00100' }).success,
);
check('address rifiuta zip sbagliata', () =>
  !AddressSchema.safeParse({ street: 'Via X', city: 'Roma', zip: '12' }).success,
);
check('address rifiuta senza city (required)', () =>
  !AddressSchema.safeParse({ street: 'Via X' }).success,
);

// User completo valido
const goodUser = {
  id: '3b5d1f70-9f8e-4c6b-b2d5-6a1c0e2f3d4a',
  email: 'a@b.it',
  role: 'ADMIN',
  status: 'ACTIVE',
  profile: { firstName: 'Alex' },
  tags: ['a'],
  age: 30,
};
check('user valido', () => UserSchema.safeParse(goodUser).success);
check('user rifiuta email non valida', () =>
  !UserSchema.safeParse({ ...goodUser, email: 'niente-at' }).success,
);
check('user rifiuta uuid non valido', () =>
  !UserSchema.safeParse({ ...goodUser, id: 'non-uuid' }).success,
);
check('user rifiuta senza tags (required)', () => {
  const { tags, ...rest } = goodUser;
  return !UserSchema.safeParse(rest).success;
});
check('user rifiuta age < 18', () =>
  !UserSchema.safeParse({ ...goodUser, age: 12 }).success,
);
check('user accetta nickname null (nullable)', () =>
  UserSchema.safeParse({ ...goodUser, nickname: null }).success,
);
check('user gestisce date-time (coerce)', () =>
  UserSchema.safeParse({ ...goodUser, profile: { firstName: 'A', birthDate: '2024-05-01T10:00:00Z' } }).success,
);

// CreateUserRequest
check('create richiede password >= 8', () =>
  !CreateUserRequestSchema.safeParse({ email: 'a@b.it', password: 'corta', role: 'USER' }).success,
);
check('create ok', () =>
  CreateUserRequestSchema.safeParse({ email: 'a@b.it', password: 'lungapass', role: 'USER' }).success,
);

// ---- Messaggi custom in italiano ----
const addrRes = AddressSchema.safeParse({ street: 'x' }); // manca city
const addrIssues = addrRes.error?.issues ?? [];
const cityIssue = addrIssues.find((i: any) => i.path?.[0] === 'city');
check('required: messaggio custom "Il campo è obbligatorio"', () =>
  cityIssue?.message === 'Il campo è obbligatorio',
);

const mailRes = UserSchema.safeParse({
  id: '3b5d1f70-9f8e-4c6b-b2d5-6a1c0e2f3d4a',
  email: 'non-email',
  role: 'ADMIN',
  status: 'ACTIVE',
  profile: { firstName: 'A' },
  tags: ['x'],
});
const mailIssue = mailRes.error?.issues?.find((i: any) => i.path?.[0] === 'email');
check('email: messaggio custom "Inserisci un indirizzo email valido"', () =>
  mailIssue?.message === 'Inserisci un indirizzo email valido',
);

// ---- Validazione cross-field: dataFine > dataInizio ----
const prenOk = {
  cliente: 'Mario',
  dataInizio: '2025-06-01T10:00:00Z',
  dataFine: '2025-06-05T10:00:00Z',
  posti: 2,
};
check('prenotazione valida (fine > inizio)', () => PrenotazioneSchema.safeParse(prenOk).success);

const prenKo = {
  cliente: 'Mario',
  dataInizio: '2025-06-05T10:00:00Z',
  dataFine: '2025-06-01T10:00:00Z',
  posti: 2,
};
const prenKoRes = PrenotazioneSchema.safeParse(prenKo);
const prenIssue = prenKoRes.error?.issues?.find((i: any) => i.path?.[0] === 'dataFine');
check('prenotazione INVALIDA (fine < inizio)', () => !prenKoRes.success);
check('cross-field: issue path su dataFine', () => prenIssue?.path?.[0] === 'dataFine');
check('cross-field: messaggio custom', () =>
  prenIssue?.message === 'La data di fine deve essere successiva alla data di inizio',
);

const prenMan = { cliente: 'Mario', dataInizio: '2025-06-01T10:00:00Z', dataFine: '2025-06-05T10:00:00Z' }; // manca posti
const prenManIssue = PrenotazioneSchema.safeParse(prenMan).error?.issues?.find((i: any) => i.path?.[0] === 'posti');
check('required: posti mancante -> messaggio obbligatorio', () =>
  prenManIssue?.message === 'Il campo è obbligatorio',
);

console.log(failures === 0 ? '\nTUTTI I TEST PASSANO' : `\n${failures} TEST FALLITI`);
process.exit(failures === 0 ? 0 : 1);
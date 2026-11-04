import type { Rng } from './prng';
import type { Role, User } from './types';

const FIRST = ['Lucas', 'Marina', 'Rafael', 'Camila', 'Bruno', 'Juliana', 'Felipe', 'Larissa', 'Thiago', 'Patricia', 'Anderson', 'Fernanda', 'Gustavo', 'Renata', 'Eduardo'];
const LAST = ['Schmitt', 'Kowalski', 'Becker', 'Lima', 'Hoffmann', 'Pereira', 'Krüger', 'Souza', 'Weber', 'Costa', 'Zimmermann', 'Oliveira', 'Fischer', 'Machado', 'Brandt'];
const ROLES: Role[] = [
  'operator', 'operator', 'operator', 'operator', 'operator', 'operator',
  'engineer', 'engineer', 'engineer',
  'technician', 'technician', 'technician',
  'manager', 'manager', 'manager',
];

/** Fictional people. Roles are labels only. */
export function generateUsers(rng: Rng): User[] {
  const last = [...LAST];
  return FIRST.map((first, i) => {
    const l = last.splice(rng.int(0, last.length - 1), 1)[0] as string;
    return { id: `U${String(i + 1).padStart(2, '0')}`, name: `${first} ${l}`, role: ROLES[i] as Role };
  });
}

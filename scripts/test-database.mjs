import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

// All fixtures live in a transaction-local schema; existing app data is untouched.
const readSql = (path) => readFile(new URL(`../supabase/${path}`, import.meta.url), 'utf8');
const schemas = [
  await readSql('schema.sql'),
  (await readSql('migrations/20261026_search_cache.sql')) +
    '\n' +
    (await readSql('migrations/20261026_search_reliability.sql')) +
    '\n' +
    (await readSql('migrations/20261026_price_alerts.sql')),
];
const assertions =
  (await readSql('tests/search-cache.sql')) + '\n' + (await readSql('tests/price-alerts.sql'));
const directory = await mkdtemp(join(tmpdir(), 'atlantis-db-test-'));
try {
  const path = join(directory, 'test.sql');
  await writeFile(
    path,
    schemas
      .map(
        (schema) =>
          `begin;\ncreate schema atlantis_test;\n${schema.replaceAll('public.', 'atlantis_test.').replaceAll('search_path = public', 'search_path = atlantis_test')}\nset search_path = atlantis_test;\n${assertions}\nrollback;`,
      )
      .join('\n'),
  );
  execFileSync('psql', ['-v', 'ON_ERROR_STOP=1', '-f', path], { stdio: 'inherit' });
} finally {
  await rm(directory, { recursive: true, force: true });
}

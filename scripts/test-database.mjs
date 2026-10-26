import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

// All fixtures live in a transaction-local schema; existing app data is untouched.
const schema = (await readFile(new URL('../supabase/schema.sql', import.meta.url), 'utf8'))
  .replaceAll('public.', 'atlantis_test.')
  .replaceAll('search_path = public', 'search_path = atlantis_test');
const assertions = await readFile(
  new URL('../supabase/tests/search-cache.sql', import.meta.url),
  'utf8',
);
const directory = await mkdtemp(join(tmpdir(), 'atlantis-db-test-'));
try {
  const path = join(directory, 'test.sql');
  await writeFile(
    path,
    `begin;\ncreate schema atlantis_test;\n${schema}\nset search_path = atlantis_test;\n${assertions}\nrollback;`,
  );
  if (process.argv.includes('--linked'))
    execFileSync('supabase', ['db', 'query', '--linked', '--file', path], { stdio: 'inherit' });
  else execFileSync('psql', ['-v', 'ON_ERROR_STOP=1', '-f', path], { stdio: 'inherit' });
} finally {
  await rm(directory, { recursive: true, force: true });
}

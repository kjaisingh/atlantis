import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function json(path) {
  return JSON.parse(await readFile(new URL(`../${path}`, import.meta.url), 'utf8'));
}

const airports = (await readFile(new URL('../server/data/airports.txt', import.meta.url), 'utf8'))
  .split('\n')
  .map((line) => line.trim())
  .filter(Boolean);
const airportNames = await json('server/data/airport-names.json');
const cache = await json('server/data/cache-table.json');
const lookup = await json('server/data/lookup-map.json');
const metroNames = await json('server/data/metro-names.json');
const airportSet = new Set(airports);
const codePattern = /^[A-Z]{3}$/;

assert.equal(airportSet.size, airports.length, 'airports.txt contains duplicate codes');
for (const code of airports) assert.match(code, codePattern, `Invalid airport code: ${code}`);
for (const [code, value] of Object.entries(airportNames)) {
  assert.match(code, codePattern, `Invalid airport-name code: ${code}`);
  assert.equal(typeof value.city, 'string', `${code} is missing city metadata`);
  assert.equal(typeof value.name, 'string', `${code} is missing name metadata`);
}

for (const [metro, members] of Object.entries(lookup)) {
  assert.match(metro, codePattern, `Invalid metro code: ${metro}`);
  assert.ok(metroNames[metro], `${metro} is missing metro metadata`);
  assert.ok(Array.isArray(members) && members.length > 0, `${metro} has no member airports`);
  assert.equal(new Set(members).size, members.length, `${metro} has duplicate members`);
  for (const member of members)
    assert.ok(airportSet.has(member), `${metro} references unknown ${member}`);
}

const pairs = new Set();
for (const [index, row] of cache.entries()) {
  assert.match(row.X, codePattern, `cache row ${index} has invalid X`);
  assert.match(row.Y, codePattern, `cache row ${index} has invalid Y`);
  assert.ok(Array.isArray(row.Z), `cache row ${index} has invalid Z`);
  assert.equal(new Set(row.Z).size, row.Z.length, `cache row ${index} has duplicate candidates`);
  row.Z.forEach((code) => assert.match(code, codePattern, `cache row ${index} has invalid Z code`));
  const pair = `${row.X}:${row.Y}`;
  assert.ok(!pairs.has(pair), `Duplicate cache pair: ${pair}`);
  pairs.add(pair);
}

const missingNames = airports.filter((code) => !airportNames[code]);
console.log(
  `Validated ${airports.length} airports, ${Object.keys(lookup).length} metros, and ${cache.length} cache rows.`,
);
if (missingNames.length) {
  console.warn(`${missingNames.length} airports lack display metadata: ${missingNames.join(', ')}`);
}

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

console.log(`Validated ${airports.length} airports and ${Object.keys(lookup).length} metro areas.`);

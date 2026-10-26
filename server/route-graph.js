import { readFileSync } from 'node:fs';

const metros = JSON.parse(readFileSync(new URL('./data/lookup-map.json', import.meta.url)));
export const airportCodes = (code) => metros[code] ?? [code];

export function candidateEndpoints(origin, destination, graph) {
  const origins = airportCodes(origin);
  const exits = airportCodes(destination);
  const carriers = new Set(
    graph.edges
      .filter(([from, to]) => origins.includes(from) && exits.includes(to))
      .map((edge) => edge[2]),
  );
  if (!carriers.size) return [];
  const scores = new Map();
  for (const [from, to, carrier, departures] of graph.edges) {
    if (
      !exits.includes(from) ||
      origins.includes(to) ||
      exits.includes(to) ||
      !carriers.has(carrier)
    )
      continue;
    scores.set(to, (scores.get(to) ?? 0) + departures);
  }
  return [...scores]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 3)
    .map(([code]) => code);
}

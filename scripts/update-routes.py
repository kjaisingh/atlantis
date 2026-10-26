"""Refresh the US route graph from official BTS T-100 passenger segments."""

import argparse
import csv
from datetime import datetime, timezone
from html.parser import HTMLParser
import http.cookiejar
import io
import json
import os
from pathlib import Path
import urllib.parse
import urllib.request
import zipfile

SOURCE = "https://www.transtats.bts.gov/DL_SelectFields.aspx?gnoyr_VQ=FMG&QO_fu146_anzr=Air%20Carriers"
FIELDS = ["DEPARTURES_PERFORMED", "PASSENGERS", "UNIQUE_CARRIER", "ORIGIN", "DEST", "YEAR", "MONTH", "CLASS"]
ROOT = Path(__file__).resolve().parents[1]


class FormFields(HTMLParser):
    def __init__(self):
        super().__init__()
        self.values = {}
        self.years = []
        self.in_years = False

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "select":
            self.in_years = attrs.get("name") == "cboYear"
        if tag == "option" and self.in_years and attrs.get("value", "").isdigit():
            self.years.append(int(attrs["value"]))
        if tag == "input" and attrs.get("type") == "hidden" and attrs.get("name", "").startswith("__"):
            self.values[attrs["name"]] = attrs.get("value", "")

    def handle_endtag(self, tag):
        if tag == "select":
            self.in_years = False


def download(year=None):
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    with opener.open(SOURCE, timeout=60) as response:
        form = FormFields()
        form.feed(response.read(2_000_000).decode())
    year = year if year is not None else max(form.years)
    form.values.update(cboGeography="All", cboYear=str(year), cboPeriod="All", btnDownload="Download")
    form.values.update({field: "on" for field in FIELDS})
    request = urllib.request.Request(SOURCE, data=urllib.parse.urlencode(form.values).encode())
    with opener.open(request, timeout=180) as response:
        data = response.read(20_000_001)
    if len(data) > 20_000_000 or not data.startswith(b"PK"):
        raise ValueError("BTS did not return a bounded ZIP download")
    return read_rows(data)


def read_rows(data):
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        member = next(info for info in archive.infolist() if info.filename.endswith(".csv"))
        if member.file_size > 150_000_000:
            raise ValueError("BTS CSV exceeds size limit")
        with archive.open(member) as stream:
            rows = csv.DictReader(io.TextIOWrapper(stream, encoding="utf-8-sig"))
            if not set(FIELDS).issubset(rows.fieldnames or []):
                raise ValueError("BTS columns changed")
            return list(rows)


def build_graph(rows, airports):
    latest = max(int(row["YEAR"]) * 12 + int(row["MONTH"]) - 1 for row in rows)
    edges = {}
    for row in rows:
        period = int(row["YEAR"]) * 12 + int(row["MONTH"]) - 1
        origin, destination, carrier = row["ORIGIN"], row["DEST"], row["UNIQUE_CARRIER"]
        departures, passengers = float(row["DEPARTURES_PERFORMED"]), float(row["PASSENGERS"])
        if (period < latest - 2 or row["CLASS"] != "F" or departures <= 0 or passengers <= 0
                or origin not in airports or destination not in airports or origin == destination):
            continue
        key = (origin, destination, carrier)
        edges[key] = edges.get(key, 0) + int(departures)
    if not edges:
        raise ValueError("BTS contains no eligible passenger routes")
    return {
        "source": SOURCE,
        "period": f"{latest // 12}-{latest % 12 + 1:02d}",
        "fetchedAt": datetime.now(timezone.utc).isoformat(),
        "edges": [[*key, count] for key, count in sorted(edges.items())],
    }


def validate_update(graph, current, allow_regression=False):
    if not current or allow_regression:
        return
    if graph['period'] < current['period']:
        raise ValueError('Refusing to replace the route graph with an older reporting period')
    if len(graph['edges']) < len(current['edges']) * 0.8:
        raise ValueError('Route graph shrank by over 20%; inspect BTS data before using --allow-regression')


def publish(graph, allow_regression=False):
    url = os.environ["SUPABASE_URL"].rstrip("/") + "/rest/v1/atlantis_route_graph?on_conflict=id"
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    headers = {"apikey": key, "Authorization": "Bearer " + key}
    current_url = os.environ["SUPABASE_URL"].rstrip('/') + '/rest/v1/atlantis_route_graph?id=eq.true&select=data'
    with urllib.request.urlopen(urllib.request.Request(current_url, headers=headers), timeout=30) as response:
        current = json.loads(response.read(5_000_000))
    validate_update(graph, current[0]['data'] if current else None, allow_regression)
    request = urllib.request.Request(url, method="POST",
        data=json.dumps({"id": True, "data": graph, "updated_at": graph["fetchedAt"]}).encode(),
        headers={"apikey": key, "Authorization": "Bearer " + key,
                 "Content-Type": "application/json", "Prefer": "resolution=merge-duplicates"})
    with urllib.request.urlopen(request, timeout=30) as response:
        if response.status not in (200, 201, 204):
            raise ValueError("Route graph publish failed")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--zip", type=Path, help="Import an official BTS ZIP already downloaded")
    parser.add_argument("--publish", action="store_true", help="Publish to configured Supabase project")
    parser.add_argument("--allow-regression", action="store_true", help="Allow an inspected older or smaller route graph")
    args = parser.parse_args()
    if args.zip:
        rows = read_rows(args.zip.read_bytes())
    else:
        rows = download()
        if not rows:
            raise ValueError("BTS returned no reporting periods")
        latest_year = max(int(row["YEAR"]) for row in rows)
        if max(int(row["MONTH"]) for row in rows if int(row["YEAR"]) == latest_year) < 3:
            rows += download(latest_year - 1)
    graph = build_graph(rows, set((ROOT / "server/data/airports.txt").read_text().split()))
    if args.publish:
        publish(graph, args.allow_regression)
        print(f"Published {len(graph['edges'])} carrier routes through {graph['period']}.")
    else:
        print(json.dumps(graph, separators=(",", ":")))


if __name__ == "__main__":
    main()

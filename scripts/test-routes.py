"""Tests for BTS route aggregation; no network or database writes."""
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("routes", Path(__file__).with_name("update-routes.py"))
routes = importlib.util.module_from_spec(spec)
spec.loader.exec_module(routes)


class RouteTests(unittest.TestCase):
    def row(self, month, year=2026, **kwargs):
        return dict(YEAR=str(year), MONTH=str(month), CLASS="F", ORIGIN="JFK", DEST="DTW",
                    UNIQUE_CARRIER="DL", DEPARTURES_PERFORMED="10.00", PASSENGERS="100.00", **kwargs)

    def test_three_month_window_crosses_year_boundary(self):
        rows = [self.row(10, 2025), self.row(11, 2025), self.row(12, 2025), self.row(1)]
        graph = routes.build_graph(rows, {"JFK", "DTW"})
        self.assertEqual(graph["period"], "2026-01")
        self.assertEqual(graph["edges"], [["JFK", "DTW", "DL", 30]])

    def test_cargo_empty_and_unsupported_routes_are_excluded(self):
        rows = [self.row(7)]
        for field, value in [("CLASS", "G"), ("PASSENGERS", "0"), ("DEPARTURES_PERFORMED", "0"), ("DEST", "ZZZ"), ("DEST", "JFK")]:
            rows.append({**self.row(7), field: value})
        self.assertEqual(routes.build_graph(rows, {"JFK", "DTW"})["edges"], [["JFK", "DTW", "DL", 10]])
        with self.assertRaises(ValueError):
            routes.build_graph(rows, set())

    def test_form_uses_available_reporting_years(self):
        form = routes.FormFields()
        form.feed('<input type="hidden" name="__VIEWSTATE" value="abc"><select name="cboYear"><option value="2025">2025</option><option value="2024">2024</option></select><select name="cboPeriod"><option value="12">December</option></select>')
        self.assertEqual(max(form.years), 2025)
        self.assertEqual(form.values, {"__VIEWSTATE": "abc"})


if __name__ == "__main__":
    unittest.main()

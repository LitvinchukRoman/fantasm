#!/usr/bin/env python3
import base64
import json
import os
from pathlib import Path
import sys
import subprocess
import time
import unittest
import urllib.parse
import urllib.request


ROOT = Path(__file__).resolve().parent.parent
DASHBOARD = ROOT / "monitoring/grafana/dashboards/fantasm.json"


class DashboardTests(unittest.TestCase):
    def test_panels_have_unique_ids_and_valid_layout(self):
        dashboard = json.loads(DASHBOARD.read_text())
        self.assertEqual(dashboard["uid"], "fantasm-overview")
        panels = dashboard["panels"]
        self.assertEqual(len(panels), len({p["id"] for p in panels}))
        for panel in panels:
            grid = panel["gridPos"]
            self.assertGreater(grid["w"], 0)
            self.assertLessEqual(grid["x"] + grid["w"], 24)
            for other in panels:
                if panel["id"] == other["id"]:
                    continue
                b = other["gridPos"]
                overlap = (grid["x"] < b["x"] + b["w"] and b["x"] < grid["x"] + grid["w"]
                           and grid["y"] < b["y"] + b["h"] and b["y"] < grid["y"] + grid["h"])
                self.assertFalse(overlap, (panel["title"], other["title"]))

    def test_monitoring_stays_out_of_default_compose(self):
        default = (ROOT / "compose.yaml").read_text()
        for name in ["grafana:", "prometheus:", "alloy:", "loki:", "METRICS_ADDR"]:
            self.assertNotIn(name, default)
        self.assertNotIn(":latest", (ROOT / "compose.monitoring.yaml").read_text())

    def test_pr_preview_leaves_git_unchanged_and_excludes_unrelated_files(self):
        def state():
            return subprocess.check_output(["git", "status", "--porcelain=v1", "-uall"], cwd=ROOT)

        before = state()
        result = subprocess.run(["bash", "scripts/create-observability-pr.sh", "--dry-run"], cwd=ROOT, capture_output=True, text=True, check=True)
        self.assertIn("feat(logging): add structured request and lifecycle events", result.stdout)
        self.assertIn("infra(monitoring): provision the local observability stack", result.stdout)
        self.assertNotIn("gh ", result.stdout)
        self.assertNotIn("test-identity-e2e.sh", result.stdout)
        self.assertNotIn(".gitignore", result.stdout)
        self.assertEqual(state(), before)


def get_json(url, password=None):
    headers = {}
    if password:
        headers["Authorization"] = "Basic " + base64.b64encode(("admin:" + password).encode()).decode()
    request = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(request, timeout=10) as response:
        return json.load(response)


def live():
    prometheus = "http://127.0.0.1:" + os.getenv("PROMETHEUS_PORT", "9090")
    loki = "http://127.0.0.1:" + os.getenv("LOKI_PORT", "3100")
    grafana = "http://127.0.0.1:" + os.getenv("GRAFANA_PORT", "3000")
    api = "http://127.0.0.1:" + os.getenv("API_PORT", "8080")
    password = os.getenv("GRAFANA_ADMIN_PASSWORD")
    if not password:
        project = os.getenv("COMPOSE_PROJECT_NAME", "backend")
        password = (ROOT / ".cache/monitoring" / project / "grafana-admin-password").read_text().strip()

    def query(expr):
        result = get_json(prometheus + "/api/v1/query?" + urllib.parse.urlencode({"query": expr}))
        assert result["status"] == "success", result
        return result["data"]["result"]

    for _ in range(5):
        get_json(api + "/api/ideas")
    deadline = time.monotonic() + 90
    while time.monotonic() < deadline:
        result = query('fantasm_http_requests_total{route="GET /api/ideas",status="200"}')
        if result and float(result[0]["value"][1]) >= 5:
            break
        time.sleep(1)
    else:
        raise AssertionError("API requests never reached Prometheus")
    assert float(query("fantasm_ready")[0]["value"][1]) == 1
    assert query("fantasm_db_pool_max_connections")
    assert query("fantasm_startup_phase_duration_seconds")
    assert query("fantasm_job_runs_total")
    stored = get_json(grafana + "/api/dashboards/uid/fantasm-overview", password)
    dashboard = json.loads(DASHBOARD.read_text())
    assert len(stored["dashboard"]["panels"]) == len(dashboard["panels"])
    for source in ["prometheus", "loki"]:
        health = get_json(grafana + "/api/datasources/uid/" + source + "/health", password)
        assert health["status"] == "OK", health

    for panel in dashboard["panels"]:
        for target in panel.get("targets", []):
            expr = target["expr"].replace("$__rate_interval", "1m").replace("$level", ".*").replace("$search", "")
            if panel["datasource"]["uid"] == "prometheus":
                query(expr)
            else:
                result = get_json(loki + "/loki/api/v1/query_range?" + urllib.parse.urlencode({"query": expr, "limit": 100}))
                assert result["status"] == "success", result

    startup_query = '{service="fantasm-api", event="service.starting"}'
    deadline = time.monotonic() + 60
    while time.monotonic() < deadline:
        result = get_json(loki + "/loki/api/v1/query_range?" + urllib.parse.urlencode({"query": startup_query, "limit": 100}))
        if result["data"]["result"]:
            break
        time.sleep(1)
    else:
        raise AssertionError("The first startup event never reached Loki")
    print("Live monitoring passed: API, metrics, startup logs, dashboard, both data sources, and every panel query.")


if __name__ == "__main__":
    if sys.argv[1:] == ["--live"]:
        live()
    else:
        unittest.main()

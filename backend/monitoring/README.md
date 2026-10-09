# Optional backend monitoring

The API writes structured JSON to stdout from process startup. Monitoring adds a private Prometheus listener, Prometheus, Loki, Alloy, and a provisioned Grafana dashboard. Normal `docker compose up -d --build` does not start or download any monitoring containers. `METRICS_ADDR` is empty by default: no metrics registry, collectors, or listener are created.

## Start and stop

From `backend/`, with Docker Compose, Bash, curl, and OpenSSL installed:

```bash
bash scripts/monitoring.sh up
```

The script generates a Grafana password once in `.cache/monitoring/backend/grafana-admin-password`, with mode 0600, or accepts `GRAFANA_ADMIN_PASSWORD`. It starts and checks the monitoring services before starting the API. Alloy reads the API container's retained stdout, including the first startup event, even if Docker discovery happens after the process starts. Its positions survive collector restarts.

Open **http://127.0.0.1:3000/d/fantasm-overview**, user `admin`. Read the password from the file printed by the script. Grafana's database retains the initial password; changing the environment later does not reset an existing admin account. Use Grafana's account settings to rotate it.

```bash
bash scripts/monitoring.sh up --no-build
bash scripts/monitoring.sh status
bash scripts/monitoring.sh validate
python3 scripts/test-monitoring.py --live
bash scripts/monitoring.sh off
```

`off` recreates the API using only the base Compose file, disabling its metrics listener, and stops the four monitoring services. It preserves all application and monitoring data. `down` stops and removes this Compose project's containers and network, including the API and database, while retaining volumes. Do not delete the monitoring volumes or password file if you want to preserve history and credentials.

The default project is `backend`. Set `COMPOSE_PROJECT_NAME` consistently for every command when running multiple stacks. Ports can be overridden with `API_PORT`, `POSTGRES_PORT`, `GRAFANA_PORT`, `PROMETHEUS_PORT`, `LOKI_PORT`, and `ALLOY_PORT`. Existing API and PostgreSQL port defaults remain 8080 and 5432.

For a Go process outside Docker, set `METRICS_ADDR=127.0.0.1:9091`. The endpoint is `/metrics` on that listener; it is not added to the public API. The Compose overlay listens on container port 9091 without publishing it to the host. The default scrape target is the Compose API; change `monitoring/prometheus/prometheus.yml` when using a different deployment.

## Dashboard and alerts

The dashboard provisions automatically with fixed data-source UIDs. It shows API initialization/scrape health, throughput, error percentage, p50/p95/p99 latency, busiest and slowest routes, CPU, memory, goroutines, database pool usage/contention, job outcomes, startup phase durations, and searchable JSON logs. Paste a request ID into the log search box to correlate access and error events. Restart annotations mark when the API starts serving.

`fantasm_ready` describes initialization and shutdown. It does not continuously probe the database; `/readyz` remains the database readiness endpoint. A successful scrape alone does not imply a ready API. Latency panels are empty until requests arrive. Job counters include the immediate startup run. Prometheus samples every five seconds, so short startup phases appear as retained phase-duration metrics rather than guaranteed intermediate samples.

Prometheus evaluates availability, server-error, latency, and job-failure rules. They are visible in its Alerts UI at `http://127.0.0.1:9090/alerts`. External notifications require an Alertmanager deployment and routing configuration; this stack does not send messages.

Prometheus retains seven days or 1 GB, whichever limit is reached first. Loki retains seven days; filesystem usage is not capped by that duration, so provision disk space for your traffic. Docker's API log rotates at 10 MB × 3 files. Named volumes retain data across restarts. Grafana, Prometheus, Loki, and Alloy host ports bind to loopback. Alloy accesses the Docker socket to discover/read this project's API logs; a read-only socket mount still grants Docker API access, so run this local/single-host stack only on a trusted host.

The existing EC2/Terraform/CloudWatch deployment is unchanged. JSON stdout remains compatible with CloudWatch. This Compose stack does not automatically attach itself to those separately deployed containers.

## Log contract

Every event carries `time`, `level`, `msg`, and `service=fantasm-api`. Stable `event` values identify lifecycle (`service.*`), startup phases (`startup.*`), requests (`http.*`), authentication (`auth.*`), moderation (`moderation.*`), and background jobs (`job.finished`). Successful periodic jobs log at INFO because their cadence is low and their operation matters.

Request events include `request_id`, normalized `method`, matched route template, status, bytes, fractional `duration_ms`, `user_id` when authenticated, `client_hash`, and `error_kind`. Rejections before routing still have a matched template when one exists. Unknown paths use `unmatched`; unknown methods use `OTHER`. No request bodies, query strings, raw paths, headers, or raw client addresses are recorded by access logging. Client hashes are keyed by `APP_SECRET`; a generated development secret changes the hashes on restart.

Sensitive structured keys are redacted centrally. Error and panic diagnostics remain available to operators; avoid placing credentials or user content in error messages. Request IDs, user IDs, addresses, slugs, and error text never become Prometheus labels. Loki indexes only the bounded service/project/level/event metadata; detailed fields remain in the JSON log body.

## Verification

```bash
TEST_DATABASE_URL='postgres://fantasm:fantasm@127.0.0.1:15435/fantasm_test?sslmode=disable' bash scripts/check-backend.sh
bash scripts/monitoring.sh validate
python3 scripts/test-monitoring.py --live
```

The backend check requires a disposable PostgreSQL database, sets both supported test-DSN variables, runs formatting/module/build/vet checks, the entire race-enabled randomized test suite, and the exact CI linter version. The live check generates a few read-only requests, confirms metric delivery and startup-log capture, checks both Grafana data sources and the provisioned dashboard, and executes every panel query.

## Prepare local commits

```bash
bash scripts/create-observability-pr.sh
TEST_DATABASE_URL='postgres://fantasm:fantasm@127.0.0.1:15435/fantasm_test?sslmode=disable' bash scripts/create-observability-pr.sh --execute
```

The default invocation is a read-only preview. Execution uses the current branch, which must already match the repository's `type/short-description` rule and must not be `main`. It creates four local Conventional Commits by staging explicit file groups. It does not create branches, use GitHub CLI, fetch, push, or open a PR. Run `git push` and create the PR separately.

It uses path-limited commits, so unrelated staged changes such as the pre-existing root `.gitignore` change remain untouched and are never included. The unrelated identity E2E script, local credentials, caches, and ignored agent notes are never included. It never force-pushes, merges, resets, or bypasses repository checks.

Implementation references: [Prometheus Go instrumentation](https://prometheus.io/docs/guides/go-application/), [Alloy Docker log collection](https://grafana.com/docs/alloy/latest/reference/components/loki/loki.source.docker/), and [Loki filesystem storage](https://grafana.com/docs/loki/latest/operations/storage/filesystem/).

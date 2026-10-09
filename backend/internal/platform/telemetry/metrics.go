package telemetry

import (
	"net/http"
	"strconv"
	"time"

	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/postgres"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/collectors"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

type Metrics struct {
	registry    *prometheus.Registry
	requests    *prometheus.CounterVec
	duration    *prometheus.HistogramVec
	bytes       *prometheus.CounterVec
	jobs        *prometheus.CounterVec
	jobDuration *prometheus.HistogramVec
	jobFailure  *prometheus.GaugeVec
	startup     *prometheus.GaugeVec
	ready       prometheus.Gauge
}

func New() *Metrics {
	m := &Metrics{
		registry:    prometheus.NewRegistry(),
		requests:    prometheus.NewCounterVec(prometheus.CounterOpts{Name: "fantasm_http_requests_total", Help: "Completed API requests."}, []string{"method", "route", "status"}),
		duration:    prometheus.NewHistogramVec(prometheus.HistogramOpts{Name: "fantasm_http_request_duration_seconds", Help: "API request latency.", Buckets: prometheus.DefBuckets}, []string{"method", "route"}),
		bytes:       prometheus.NewCounterVec(prometheus.CounterOpts{Name: "fantasm_http_response_bytes_total", Help: "API response bytes written."}, []string{"method", "route"}),
		jobs:        prometheus.NewCounterVec(prometheus.CounterOpts{Name: "fantasm_job_runs_total", Help: "Background job runs."}, []string{"name", "outcome"}),
		jobDuration: prometheus.NewHistogramVec(prometheus.HistogramOpts{Name: "fantasm_job_duration_seconds", Help: "Background job run duration."}, []string{"name"}),
		jobFailure:  prometheus.NewGaugeVec(prometheus.GaugeOpts{Name: "fantasm_job_last_failure_timestamp_seconds", Help: "Unix timestamp of the last failed run, including startup runs."}, []string{"name"}),
		startup:     prometheus.NewGaugeVec(prometheus.GaugeOpts{Name: "fantasm_startup_phase_duration_seconds", Help: "Duration of each completed startup phase."}, []string{"phase"}),
		ready:       prometheus.NewGauge(prometheus.GaugeOpts{Name: "fantasm_ready", Help: "One after API initialization, zero during startup and shutdown; database health is checked separately by /readyz."}),
	}
	m.registry.MustRegister(m.requests, m.duration, m.bytes, m.jobs, m.jobDuration, m.jobFailure, m.startup, m.ready, collectors.NewGoCollector(), collectors.NewProcessCollector(collectors.ProcessCollectorOpts{}))
	return m
}

func (m *Metrics) Handler() http.Handler {
	return promhttp.HandlerFor(m.registry, promhttp.HandlerOpts{Timeout: 5 * time.Second, MaxRequestsInFlight: 2})
}

func (m *Metrics) ObserveHTTP(method, route string, status, bytes int, duration time.Duration) {
	m.requests.WithLabelValues(method, route, strconv.Itoa(status)).Inc()
	m.duration.WithLabelValues(method, route).Observe(duration.Seconds())
	m.bytes.WithLabelValues(method, route).Add(float64(bytes))
}

func (m *Metrics) ObserveJob(name string, duration time.Duration, err error) {
	outcome := "success"
	if err != nil {
		outcome = "error"
		m.jobFailure.WithLabelValues(name).SetToCurrentTime()
	}
	m.jobs.WithLabelValues(name, outcome).Inc()
	m.jobDuration.WithLabelValues(name).Observe(duration.Seconds())
}

func (m *Metrics) Startup(phase string, duration time.Duration) {
	m.startup.WithLabelValues(phase).Set(duration.Seconds())
}

func (m *Metrics) Ready(ready bool) {
	value := 0.0
	if ready {
		value = 1
	}
	m.ready.Set(value)
}

func (m *Metrics) RegisterPool(db *postgres.DB) {
	for name, metric := range map[string]struct {
		help  string
		value func() float64
	}{
		"connections":          {"Current pool connections.", func() float64 { return float64(db.Stat().TotalConns()) }},
		"acquired_connections": {"Pool connections currently in use.", func() float64 { return float64(db.Stat().AcquiredConns()) }},
		"max_connections":      {"Configured pool connection limit.", func() float64 { return float64(db.Stat().MaxConns()) }},
	} {
		m.registry.MustRegister(prometheus.NewGaugeFunc(prometheus.GaugeOpts{Name: "fantasm_db_pool_" + name, Help: metric.help}, metric.value))
	}
	m.registry.MustRegister(prometheus.NewCounterFunc(prometheus.CounterOpts{Name: "fantasm_db_pool_acquire_wait_seconds_total", Help: "Cumulative time waiting for pool connections."}, func() float64 { return db.Stat().EmptyAcquireWaitTime().Seconds() }))
}

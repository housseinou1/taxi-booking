"""Regression tests for the health/status reporting.

These lock in the fixes for four defects that made the Production Status dashboard misleading:

1. ``_check_redis`` reported "ok" whenever the *Django cache* answered — but the cache is
   LocMemCache (in-process memory) when ``REDIS_URL`` is unset, so it reported Redis healthy
   with no Redis anywhere on the host.
2. ``overall`` was computed from the database and Redis only, so the dashboard could show
   *Overall: ok* while *Celery: error*.
3. ``_check_celery`` called ``inspect().ping()`` unconditionally, which retried a dead broker
   for ~4 s and dominated the endpoint's response time.
4. ``websocket`` was inferred from the Redis probe rather than the Channels layer.
"""

import time
from unittest import mock

from django.test import TestCase

from health import views


class RedisHonestyTests(TestCase):
    def test_memory_cache_is_not_reported_as_redis_ok(self):
        """LocMemCache must never be reported as Redis 'ok'."""
        with mock.patch.object(
            views,
            "_cache_backend_name",
            return_value="django.core.cache.backends.locmem.LocMemCache",
        ):
            self.assertEqual(views._check_redis(), "not_configured")

    def test_configured_but_unreachable_redis_reports_error(self):
        backend = "django.core.cache.backends.redis.RedisCache"
        with mock.patch.object(views, "_cache_backend_name", return_value=backend):
            with mock.patch("health.views.cache.set", side_effect=OSError("refused")):
                self.assertEqual(views._check_redis(), "error")

    def test_reachable_redis_reports_ok(self):
        backend = "django.core.cache.backends.redis.RedisCache"
        with mock.patch.object(views, "_cache_backend_name", return_value=backend):
            with mock.patch("health.views.cache.set"), mock.patch(
                "health.views.cache.get", return_value="1"
            ):
                self.assertEqual(views._check_redis(), "ok")


class CeleryProbeTests(TestCase):
    def setUp(self):
        views._celery_probe_cache["value"] = None
        views._celery_probe_cache["at"] = 0.0

    def test_unreachable_broker_short_circuits_without_pinging(self):
        """A closed broker port must not reach inspect().ping() (that was the 4 s cost)."""
        with mock.patch.object(views, "_probe_tcp", return_value=False) as probe:
            with mock.patch("celery.current_app") as app:
                status, workers, _broker = views._check_celery_uncached("redis://localhost:6379/0")
        self.assertEqual(status, "unreachable")
        self.assertEqual(workers, 0)
        probe.assert_called_once()
        app.control.inspect.assert_not_called()

    def test_reachable_broker_with_no_worker_reports_no_workers(self):
        with mock.patch.object(views, "_probe_tcp", return_value=True):
            with mock.patch("celery.current_app") as app:
                app.control.inspect.return_value.ping.return_value = None
                status, workers, _broker = views._check_celery_uncached("redis://localhost:6379/0")
        self.assertEqual(status, "no_workers")
        self.assertEqual(workers, 0)

    def test_reachable_broker_with_worker_reports_ok_and_counts(self):
        with mock.patch.object(views, "_probe_tcp", return_value=True):
            with mock.patch("celery.current_app") as app:
                app.control.inspect.return_value.ping.return_value = {"celery@host": {"ok": "pong"}}
                status, workers, _broker = views._check_celery_uncached("redis://localhost:6379/0")
        self.assertEqual(status, "ok")
        self.assertEqual(workers, 1)

    def test_probe_result_is_cached(self):
        """The probe must not run on every call, or a dropped broker port costs a timeout each time."""
        with mock.patch.object(
            views, "_check_celery_uncached", return_value=("ok", 1, "b")
        ) as inner:
            views._check_celery()
            views._check_celery()
            views._check_celery()
        self.assertEqual(inner.call_count, 1)

    def test_broker_probe_is_bounded(self):
        """A dropped (not refused) port must not block the endpoint indefinitely."""
        started = time.perf_counter()
        views._probe_tcp("redis://10.255.255.1:6379")  # non-routable -> must hit the budget
        elapsed = time.perf_counter() - started
        self.assertLess(elapsed, 2.0)


class OverallAggregationTests(TestCase):
    def test_dead_celery_degrades_overall(self):
        """The original bug: Overall said ok while Celery said error."""
        self.assertEqual(views._overall("ok", "ok", "error", "ok"), "degraded")
        self.assertEqual(views._overall("ok", "ok", "unreachable", "ok"), "degraded")
        self.assertEqual(views._overall("ok", "ok", "no_workers", "ok"), "degraded")

    def test_healthy_stack_is_ok(self):
        self.assertEqual(views._overall("ok", "ok", "ok", "ok"), "ok")

    def test_local_without_redis_is_still_ok_when_celery_runs(self):
        self.assertEqual(views._overall("ok", "not_configured", "ok", "local_only"), "ok")

    def test_database_failure_is_critical(self):
        self.assertEqual(views._overall("error", "ok", "ok", "ok"), "critical")

    def test_configured_but_unreachable_redis_is_critical(self):
        self.assertEqual(views._overall("ok", "error", "ok", "ok"), "critical")


class WebsocketHonestyTests(TestCase):
    def test_inmemory_layer_is_reported_local_only(self):
        with mock.patch.object(
            views.settings,
            "CHANNEL_LAYERS",
            {"default": {"BACKEND": "channels.layers.InMemoryChannelLayer"}},
            create=True,
        ):
            self.assertEqual(views._check_websocket(), "local_only")

    def test_redis_layer_follows_redis_status(self):
        with mock.patch.object(
            views.settings,
            "CHANNEL_LAYERS",
            {"default": {"BACKEND": "channels_redis.core.RedisChannelLayer"}},
            create=True,
        ):
            with mock.patch.object(views, "_check_redis", return_value="error"):
                self.assertEqual(views._check_websocket(), "error")


class EnvironmentReportingTests(TestCase):
    def test_environment_block_is_exposed(self):
        info = views._environment_info()
        for key in (
            "debug",
            "cache_backend",
            "broker_transport",
            "broker_url",
            "redis_location",
            "is_local_development",
        ):
            self.assertIn(key, info)

    def test_non_redis_transport_is_flagged_as_local_development(self):
        with mock.patch.object(views.settings, "CELERY_BROKER_URL", "filesystem://", create=True):
            self.assertTrue(views._environment_info()["is_local_development"])


class ReadinessTests(TestCase):
    def test_readiness_ok_without_redis_but_with_worker(self):
        with mock.patch.object(views, "_check_database", return_value="ok"):
            with mock.patch.object(views, "_check_redis", return_value="not_configured"):
                with mock.patch.object(
                    views, "_check_celery", return_value=("ok", 1, "filesystem://")
                ):
                    resp = self.client.get("/api/health/ready/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["status"], "ok")

    def test_readiness_unavailable_when_database_down(self):
        with mock.patch.object(views, "_check_database", return_value="error"):
            with mock.patch.object(views, "_check_redis", return_value="ok"):
                with mock.patch.object(views, "_check_celery", return_value=("ok", 1, "b")):
                    resp = self.client.get("/api/health/ready/")
        self.assertEqual(resp.status_code, 503)


class ProductionStatusEndpointTests(TestCase):
    def test_endpoint_requires_admin(self):
        self.assertEqual(self.client.get("/api/health/status/").status_code, 401)

    def test_payload_includes_environment_and_notes(self):
        from django.contrib.auth import get_user_model
        from rest_framework.test import APIClient
        from rest_framework_simplejwt.tokens import RefreshToken

        admin = get_user_model().objects.create_superuser(
            email="health-admin@yala.local", password="x"
        )
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION="Bearer " + str(RefreshToken.for_user(admin).access_token))
        with mock.patch.object(views, "_check_redis", return_value="not_configured"):
            with mock.patch.object(
                views, "_check_celery", return_value=("unreachable", 0, "redis://x")
            ):
                resp = client.get("/api/health/status/")
        self.assertEqual(resp.status_code, 200)
        body = resp.json()
        self.assertIn("environment", body)
        self.assertIn("notes", body)
        # A dead Celery must be visible in the aggregate.
        self.assertEqual(body["status"], "degraded")


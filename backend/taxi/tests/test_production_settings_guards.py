"""Regression tests for fail-closed Django production settings (subprocess-isolated)."""

import os
import subprocess
import sys
import unittest
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]


def _run_settings_snippet(snippet: str, environ: dict) -> subprocess.CompletedProcess:
    env = os.environ.copy()
    # Start from a clean slate for the keys under test.
    for key in (
        "DJANGO_DEBUG",
        "DJANGO_SECRET_KEY",
        "DJANGO_ALLOWED_HOSTS",
        "CORS_ALLOW_ALL_ORIGINS",
        "REDIS_URL",
        "DJANGO_SETTINGS_MODULE",
    ):
        env.pop(key, None)
    env.update(environ)
    env["PYTHONPATH"] = str(BACKEND_ROOT) + os.pathsep + env.get("PYTHONPATH", "")
    return subprocess.run(
        [sys.executable, "-c", snippet],
        cwd=str(BACKEND_ROOT),
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )


class ProductionSettingsGuardTests(unittest.TestCase):
    def test_debug_defaults_false_outside_tests(self):
        snippet = (
            "import sys\n"
            "sys.argv = ['manage.py', 'runserver']\n"
            "import taxi.settings as s\n"
            "assert s.DEBUG is False, s.DEBUG\n"
            "assert s.CORS_ALLOW_ALL_ORIGINS is False\n"
            "assert s.ALLOWED_HOSTS == ['api.example.com'], s.ALLOWED_HOSTS\n"
            "print('OK')\n"
        )
        result = _run_settings_snippet(
            snippet,
            {
                "DJANGO_SECRET_KEY": "unit-test-production-secret-key-32chars",
                "DJANGO_ALLOWED_HOSTS": "api.example.com",
                "REDIS_URL": "redis://localhost:6379/1",
            },
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("OK", result.stdout)

    def test_tests_keep_debug_true_when_unset(self):
        snippet = (
            "import sys\n"
            "sys.argv = ['manage.py', 'test']\n"
            "import taxi.settings as s\n"
            "assert s.DEBUG is True, s.DEBUG\n"
            "assert 'testserver' in s.ALLOWED_HOSTS, s.ALLOWED_HOSTS\n"
            "print('OK')\n"
        )
        result = _run_settings_snippet(snippet, {})
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("OK", result.stdout)

    def test_production_rejects_insecure_secret(self):
        snippet = (
            "import sys\n"
            "sys.argv = ['manage.py', 'runserver']\n"
            "import taxi.settings\n"
        )
        result = _run_settings_snippet(
            snippet,
            {
                "DJANGO_DEBUG": "false",
                "DJANGO_SECRET_KEY": "django-insecure-should-fail",
                "DJANGO_ALLOWED_HOSTS": "api.example.com",
                "REDIS_URL": "redis://localhost:6379/1",
            },
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("DJANGO_SECRET_KEY", result.stderr)


if __name__ == "__main__":
    unittest.main()

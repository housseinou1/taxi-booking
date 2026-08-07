from pathlib import Path
from datetime import timedelta
import os
import sys
from importlib.util import find_spec

from dotenv import load_dotenv

load_dotenv()


def env_bool(name, default=False):
    return os.getenv(name, str(default)).lower() in ["1", "true", "yes", "on"]


def env_list(name, default=""):
    value = os.getenv(name, default)
    return [item.strip() for item in value.split(",") if item.strip()]


BASE_DIR = Path(__file__).resolve().parent.parent

# Fail closed by default. Local/dev must set DJANGO_DEBUG=True explicitly.
# manage.py test keeps prior DX when DJANGO_DEBUG is unset.
_IN_TEST = "test" in sys.argv
_DEBUG_ENV_SET = "DJANGO_DEBUG" in os.environ
DEBUG = env_bool("DJANGO_DEBUG", False)
if _IN_TEST and not _DEBUG_ENV_SET:
    DEBUG = True

_INSECURE_SECRET_DEFAULT = "django-insecure-sakho-express-local-dev-key"
if DEBUG or _IN_TEST:
    SECRET_KEY = os.getenv("DJANGO_SECRET_KEY", _INSECURE_SECRET_DEFAULT)
else:
    SECRET_KEY = os.getenv("DJANGO_SECRET_KEY", "")

# Never default to wildcard hosts. Tests need testserver when DEBUG is on.
_allowed_default = "localhost,127.0.0.1,testserver" if (DEBUG or _IN_TEST) else ""
ALLOWED_HOSTS = env_list("DJANGO_ALLOWED_HOSTS", _allowed_default)
PUBLIC_APP_URL = os.getenv("PUBLIC_APP_URL", "").rstrip("/")

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "rest_framework_simplejwt",
    "rest_framework_simplejwt.token_blacklist",
    "authapp",
    "locations",
    "taxi.rides",
    "app_settings",
    "corsheaders",
    "django_filters",
    "drf_spectacular",
    "channels",
    "taxi.drivers",
    "payments.apps.PaymentsConfig",
    "notifications",
    "chat",
    "promotions",
    "deliveries",
    "merchants",
    "partners",
    "safety",
    "security",
    "legal",
    "cities",
    "features",
    "intercity",
    "shifts",
    "incentives",
    "referrals",
    "loyalty",
    "operations",
    "health",
    "taxi.admin_approvals",
    "django_celery_beat",
    "admin_2fa",
    "api_gateway",
    "academy",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "taxi.middleware.request_tracing.RequestTracingMiddleware",
    "api_gateway.middleware.APIGatewayLogMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

if not DEBUG and find_spec("whitenoise"):
    MIDDLEWARE.insert(1, "whitenoise.middleware.WhiteNoiseMiddleware")

ROOT_URLCONF = "taxi.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "taxi.wsgi.application"
ASGI_APPLICATION = "taxi.asgi.application"

CHANNEL_LAYERS = {
    "default": (
        {
            "BACKEND": "channels_redis.core.RedisChannelLayer",
            "CONFIG": {"hosts": [os.getenv("REDIS_URL", "redis://localhost:6379/0")]},
        }
        if os.getenv("REDIS_URL")
        else {"BACKEND": "channels.layers.InMemoryChannelLayer"}
    ),
}

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": BASE_DIR / "db.sqlite3",
    }
}

DATABASE_URL = os.getenv("DATABASE_URL")
if DATABASE_URL:
    try:
        import dj_database_url
        DATABASES["default"] = dj_database_url.parse(
            DATABASE_URL,
            conn_max_age=600,
            ssl_require=env_bool("DATABASE_SSL_REQUIRE", False),
        )
    except ImportError:
        pass

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "Africa/Nouakchott"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

AUTH_USER_MODEL = "authapp.User"

# ── REST Framework ────────────────────────────────────────────────────────────
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": (
        "rest_framework.permissions.IsAuthenticated",
    ),
    "DEFAULT_FILTER_BACKENDS": ["django_filters.rest_framework.DjangoFilterBackend"],
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.UserRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "anon": "60/minute",
        "user": "300/minute",
    },
}

# ── Simple JWT ────────────────────────────────────────────────────────────────
SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(
        minutes=int(os.getenv("JWT_ACCESS_TOKEN_MINUTES", "15"))
    ),
    "REFRESH_TOKEN_LIFETIME": timedelta(
        days=int(os.getenv("JWT_REFRESH_TOKEN_DAYS", "7"))
    ),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "UPDATE_LAST_LOGIN": True,
    "ALGORITHM": "HS256",
    "VERIFYING_KEY": "",
    "AUDIENCE": None,
    "ISSUER": None,
    "JSON_ENCODER": None,
    "JWK_URL": None,
    "LEEWAY": 0,
    "AUTH_HEADER_TYPES": ("Bearer",),
    "AUTH_HEADER_NAME": "HTTP_AUTHORIZATION",
    "USER_ID_FIELD": "id",
    "USER_ID_CLAIM": "user_id",
    "USER_AUTHENTICATION_RULE": "rest_framework_simplejwt.authentication.default_user_authentication_rule",
    "AUTH_TOKEN_CLASSES": ("rest_framework_simplejwt.tokens.AccessToken",),
    "TOKEN_TYPE_CLAIM": "token_type",
    "TOKEN_USER_CLASS": "rest_framework_simplejwt.models.TokenUser",
    "JTI_CLAIM": "jti",
    "SLIDING_TOKEN_REFRESH_EXP_CLAIM": "refresh_exp",
    "SLIDING_TOKEN_LIFETIME": timedelta(minutes=5),
    "SLIDING_TOKEN_REFRESH_LIFETIME": timedelta(days=1),
    "TOKEN_OBTAIN_SERIALIZER": "rest_framework_simplejwt.serializers.TokenObtainPairSerializer",
    "TOKEN_REFRESH_SERIALIZER": "rest_framework_simplejwt.serializers.TokenRefreshSerializer",
    "TOKEN_VERIFY_SERIALIZER": "rest_framework_simplejwt.serializers.TokenVerifySerializer",
    "TOKEN_BLACKLIST_SERIALIZER": "rest_framework_simplejwt.serializers.TokenBlacklistSerializer",
    "SLIDING_TOKEN_OBTAIN_SERIALIZER": "rest_framework_simplejwt.serializers.TokenObtainSlidingSerializer",
    "SLIDING_TOKEN_REFRESH_SERIALIZER": "rest_framework_simplejwt.serializers.TokenRefreshSlidingSerializer",
}

# ── CORS ──────────────────────────────────────────────────────────────────────
# Opt-in only — never imply allow-all from DEBUG alone.
CORS_ALLOW_ALL_ORIGINS = env_bool("CORS_ALLOW_ALL_ORIGINS", False)
CORS_ALLOWED_ORIGINS = env_list("CORS_ALLOWED_ORIGINS")
CORS_ALLOW_HEADERS = [
    "accept",
    "authorization",
    "content-type",
    "user-agent",
    "x-csrftoken",
    "x-requested-with",
    "x-app-type",
    "x-api-key",
    "x-api-signature",
    "x-api-timestamp",
]
CSRF_TRUSTED_ORIGINS = env_list("CSRF_TRUSTED_ORIGINS")

if not DEBUG and not _IN_TEST:
    from django.core.exceptions import ImproperlyConfigured

    SECURE_SSL_REDIRECT = env_bool("SECURE_SSL_REDIRECT", True)
    SESSION_COOKIE_SECURE = env_bool("SESSION_COOKIE_SECURE", True)
    CSRF_COOKIE_SECURE = env_bool("CSRF_COOKIE_SECURE", True)
    SECURE_HSTS_SECONDS = int(os.getenv("SECURE_HSTS_SECONDS", "31536000"))
    SECURE_HSTS_INCLUDE_SUBDOMAINS = env_bool("SECURE_HSTS_INCLUDE_SUBDOMAINS", True)
    SECURE_HSTS_PRELOAD = env_bool("SECURE_HSTS_PRELOAD", True)
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")

    if not SECRET_KEY or SECRET_KEY.startswith("django-insecure"):
        raise ImproperlyConfigured(
            "DJANGO_SECRET_KEY must be set to a strong unique value when DJANGO_DEBUG=False."
        )

    if not ALLOWED_HOSTS:
        raise ImproperlyConfigured(
            "DJANGO_ALLOWED_HOSTS must be set to an explicit host list when DJANGO_DEBUG=False."
        )

    if not os.getenv("REDIS_URL"):
        raise ImproperlyConfigured(
            "REDIS_URL must be set when DJANGO_DEBUG=False so cache, rate limits, and channels share state."
        )

# ── Stripe ────────────────────────────────────────────────────────────────────
STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRET_KEY", "")
STRIPE_PUBLIC_KEY = os.getenv("STRIPE_PUBLIC_KEY", "")
STRIPE_PUBLISHABLE_KEY = os.getenv("STRIPE_PUBLISHABLE_KEY", STRIPE_PUBLIC_KEY)
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET", "")

# ── Email ─────────────────────────────────────────────────────────────────────
EMAIL_BACKEND = os.getenv(
    "EMAIL_BACKEND",
    "django.core.mail.backends.console.EmailBackend" if DEBUG else "django.core.mail.backends.smtp.EmailBackend",
)
EMAIL_HOST = os.getenv("EMAIL_HOST", "smtp.gmail.com")
EMAIL_PORT = int(os.getenv("EMAIL_PORT", "587"))
EMAIL_USE_TLS = env_bool("EMAIL_USE_TLS", True)
EMAIL_HOST_USER = os.getenv("EMAIL_HOST_USER", "")
EMAIL_HOST_PASSWORD = os.getenv("EMAIL_HOST_PASSWORD", "")
DEFAULT_FROM_EMAIL = os.getenv("DEFAULT_FROM_EMAIL", "Yala <noreply@yala.mr>")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")

# ── SMS phone verification ────────────────────────────────────────────────────
YALA_SMS_PROVIDER = os.getenv("YALA_SMS_PROVIDER", "console" if DEBUG else "")
YALA_SMS_API_URL = os.getenv("YALA_SMS_API_URL", "")
YALA_SMS_API_KEY = os.getenv("YALA_SMS_API_KEY", "")
YALA_SMS_SENDER = os.getenv("YALA_SMS_SENDER", "Yala")

# ── Delivery notifications ───────────────────────────────────────────────────
YALA_MASKED_CALL_RELAY = os.getenv("YALA_MASKED_CALL_RELAY", "")
DELIVERY_GEOFENCE_RADIUS_KM = float(os.getenv("DELIVERY_GEOFENCE_RADIUS_KM", "0.5"))
DELIVERY_LOCATION_MIN_INTERVAL_SECONDS = int(
    os.getenv("DELIVERY_LOCATION_MIN_INTERVAL_SECONDS", "15")
)
DELIVERY_LOCATION_MIN_DISTANCE_METERS = int(
    os.getenv("DELIVERY_LOCATION_MIN_DISTANCE_METERS", "50")
)

# ── Push Notifications (Web Push / VAPID) ─────────────────────────────────────
PUSH_PRIVATE_KEY = os.getenv("PUSH_PRIVATE_KEY", "")
PUSH_PUBLIC_KEY = os.getenv("PUSH_PUBLIC_KEY", "")
PUSH_CLAIMS_EMAIL = os.getenv("PUSH_CLAIMS_EMAIL", "mailto:admin@yala.mr")

# ── Yala AI Support ───────────────────────────────────────────────────────────
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-5-mini")
YALA_AI_ENABLED = env_bool("YALA_AI_ENABLED", True)

# ── DRF Spectacular ───────────────────────────────────────────────────────────
SPECTACULAR_SETTINGS = {
    "TITLE": "Yala API",
    "DESCRIPTION": "Yala — Ride Anywhere. Taxi booking platform API for Mauritania.",
    "VERSION": "1.0.0",
    "SERVE_INCLUDE_SCHEMA": False,
    "TAGS": [
        {"name": "Partner API", "description": "Third-party integration endpoints (API key auth)."},
    ],
}

# ── API Gateway (Phase 38) ────────────────────────────────────────────────────
API_GATEWAY_PARTNER_PREFIX = "/api-gateway/v1/partner/"
API_GATEWAY_SIGNATURE_MAX_SKEW_SECONDS = 300
API_GATEWAY_OAUTH2_ENABLED = False
API_GATEWAY_KEY_GRACE_PERIOD_DAYS = 7

# ── Static files storage (Django 4.2+ STORAGES dict replaces STATICFILES_STORAGE)
STORAGES = {
    "default": {
        "BACKEND": "django.core.files.storage.FileSystemStorage",
    },
    "staticfiles": {
        "BACKEND": (
            "whitenoise.storage.CompressedManifestStaticFilesStorage"
            if find_spec("whitenoise")
            else "django.contrib.staticfiles.storage.StaticFilesStorage"
        ),
    },
}

# ── Rate Limiting ─────────────────────────────────────────────────────────────
RATELIMIT_USE_CACHE = "default"

CACHES = {
    "default": (
        {
            "BACKEND": "django.core.cache.backends.redis.RedisCache",
            "LOCATION": os.getenv("REDIS_URL", "redis://localhost:6379/1"),
        }
        if os.getenv("REDIS_URL")
        else {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
        }
    ),
}

# ── Celery ─────────────────────────────────────────────────────────────────────
CELERY_BROKER_URL = os.getenv("CELERY_BROKER_URL", "redis://localhost:6379/0")
CELERY_RESULT_BACKEND = os.getenv("CELERY_RESULT_BACKEND", "redis://localhost:6379/0")
CELERY_ACCEPT_CONTENT = ["json"]
CELERY_TASK_SERIALIZER = "json"
CELERY_RESULT_SERIALIZER = "json"
CELERY_TIMEZONE = TIME_ZONE
# Prefer late ack so worker death requeues work; tasks must stay idempotent.
CELERY_TASK_ACKS_LATE = env_bool("CELERY_TASK_ACKS_LATE", True)
CELERY_TASK_REJECT_ON_WORKER_LOST = env_bool("CELERY_TASK_REJECT_ON_WORKER_LOST", True)
CELERY_TASK_ALWAYS_EAGER = os.getenv("CELERY_TASK_ALWAYS_EAGER", "False").lower() in ("true", "1", "yes")

if "test" in sys.argv:
    CELERY_BROKER_URL = "memory://"
    CELERY_TASK_ALWAYS_EAGER = True
    CELERY_TASK_EAGER_PROPAGATES = True
    CELERY_RESULT_BACKEND = "cache+memory://"
    # Keep Hypothesis property suites bounded under manage.py test.
    try:
        from hypothesis import settings as hypothesis_settings

        hypothesis_settings.register_profile(
            "django_test",
            max_examples=10,
            deadline=None,
        )
        hypothesis_settings.load_profile("django_test")
    except ImportError:
        pass

# Local UAT / API smoke without Redis workers (seeded SQLite pilot).
if env_bool("YALA_UAT_LOCAL", False):
    CELERY_BROKER_URL = "memory://"
    CELERY_TASK_ALWAYS_EAGER = True
    CELERY_TASK_EAGER_PROPAGATES = True
    CELERY_RESULT_BACKEND = "cache+memory://"
    CHANNEL_LAYERS = {
        "default": {"BACKEND": "channels.layers.InMemoryChannelLayer"},
    }

CELERY_BEAT_SCHEDULE = {
    "expire-credits-hourly": {
        "task": "referrals.tasks.periodic.expire_credits_task",
        "schedule": 3600,  # Every hour (in seconds)
    },
    "send-expiration-reminders-daily": {
        "task": "referrals.tasks.periodic.send_expiration_reminders_task",
        "schedule": 86400,  # Every 24 hours (in seconds)
    },
    "fraud-scan-ghost-accounts-every-6h": {
        "task": "referrals.tasks.periodic.fraud_scan_ghost_accounts_task",
        "schedule": 21600,  # Every 6 hours (in seconds)
    },
    "expire-stale-referrals-daily": {
        "task": "referrals.tasks.periodic.expire_stale_referrals_task",
        "schedule": 86400,  # Every 24 hours (in seconds)
    },
    "escalate-stale-flags-daily": {
        "task": "referrals.tasks.periodic.escalate_stale_flags_task",
        "schedule": 86400,  # Every 24 hours (in seconds)
    },
    "notify-expiring-driver-documents-daily": {
        "task": "taxi.drivers.tasks.notify_expiring_driver_documents_task",
        "schedule": 86400,  # Every 24 hours (in seconds)
    },
    # ── Delivery tasks ────────────────────────────────────────────────────────
    "delivery-check-offer-timeouts": {
        "task": "deliveries.tasks.check_offer_timeouts",
        "schedule": 15,  # Every 15 seconds
    },
    "delivery-dispatch-scheduled": {
        "task": "deliveries.tasks.dispatch_scheduled_deliveries",
        "schedule": 60,  # Every 60 seconds
    },
    "delivery-cleanup-stale-requests": {
        "task": "deliveries.tasks.cleanup_stale_requests",
        "schedule": 300,  # Every 5 minutes
    },
    "delivery-remind-cash-settlement": {
        "task": "deliveries.tasks.remind_cash_settlement",
        "schedule": 1800,  # Every 30 minutes
    },
}

YALA_MAX_DRIVER_SPEED_KMH = int(os.getenv("YALA_MAX_DRIVER_SPEED_KMH", "180"))
YALA_ON_TIME_ARRIVAL_MINUTES = int(os.getenv("YALA_ON_TIME_ARRIVAL_MINUTES", "15"))
YALA_TRUST_X_FORWARDED_FOR = env_bool("YALA_TRUST_X_FORWARDED_FOR", False)
YALA_SERVICE_AREA_BOUNDS = {
    "min_lat": float(os.getenv("YALA_SERVICE_MIN_LAT", "17.75")),
    "max_lat": float(os.getenv("YALA_SERVICE_MAX_LAT", "18.40")),
    "min_lng": float(os.getenv("YALA_SERVICE_MIN_LNG", "-16.35")),
    "max_lng": float(os.getenv("YALA_SERVICE_MAX_LNG", "-15.65")),
}

YALA_APP_MIN_VERSIONS = {
    "rider": os.getenv("YALA_RIDER_MIN_VERSION", "1.0.0"),
    "driver": os.getenv("YALA_DRIVER_MIN_VERSION", "1.0.0"),
    "delivery": os.getenv("YALA_DELIVERY_MIN_VERSION", "1.0.0"),
}
YALA_APP_LATEST_VERSIONS = {
    "rider": os.getenv("YALA_RIDER_LATEST_VERSION", os.getenv("YALA_RIDER_MIN_VERSION", "1.2.7")),
    "driver": os.getenv("YALA_DRIVER_LATEST_VERSION", os.getenv("YALA_DRIVER_MIN_VERSION", "1.2.23")),
    "delivery": os.getenv("YALA_DELIVERY_LATEST_VERSION", os.getenv("YALA_DELIVERY_MIN_VERSION", "1.0.4")),
}

# ── Production security (only when DEBUG=False) ───────────────────────────────
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = "DENY"
SECURE_REFERRER_POLICY = "strict-origin-when-cross-origin"

# ── Suppress ImageField check when Pillow is not installed (dev/test) ─────────
SILENCED_SYSTEM_CHECKS = ["fields.E210"]

# ── Play Integrity / device attestation ──────────────────────────────────────
PLAY_INTEGRITY_API_KEY = os.getenv("PLAY_INTEGRITY_API_KEY", "")
PLAY_INTEGRITY_PACKAGE = os.getenv("PLAY_INTEGRITY_PACKAGE", "com.yala.rider.mr")
PLAY_INTEGRITY_ENFORCE = os.getenv("PLAY_INTEGRITY_ENFORCE", "false").lower() in {
    "1",
    "true",
    "yes",
    "on",
}

# Admin 2FA is mandatory for staff once TOTP is confirmed (see authapp.login_view).
ADMIN_2FA_ENABLED = os.getenv("ADMIN_2FA_ENABLED", "true").lower() in {
    "1",
    "true",
    "yes",
    "on",
}

# Limit concurrent authenticated devices per user (0 = unlimited).
# Oldest DeviceSession rows are pruned on login when the limit is exceeded.
MAX_CONCURRENT_DEVICE_SESSIONS = int(os.getenv("MAX_CONCURRENT_DEVICE_SESSIONS", "5"))

# ── Structured logging (request tracing) ─────────────────────────────────────
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "filters": {
        "request_context": {
            "()": "taxi.logging_context.RequestContextFilter",
        },
    },
    "formatters": {
        "verbose": {
            "format": (
                "%(asctime)s %(levelname)s %(name)s "
                "request_id=%(request_id)s correlation_id=%(correlation_id)s "
                "user_id=%(user_id)s %(message)s"
            ),
        },
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "verbose",
            "filters": ["request_context"],
        },
    },
    "loggers": {
        "yala.request": {"handlers": ["console"], "level": "INFO", "propagate": False},
        "yala.celery": {"handlers": ["console"], "level": "INFO", "propagate": False},
        "yala.dispatch": {"handlers": ["console"], "level": "INFO", "propagate": False},
        "yala.payments": {"handlers": ["console"], "level": "INFO", "propagate": False},
        "yala.auth": {"handlers": ["console"], "level": "INFO", "propagate": False},
        "django.request": {"handlers": ["console"], "level": "WARNING", "propagate": False},
    },
}

# Reduce log noise during manage.py test (major slowdown on Windows redirect).
if "test" in sys.argv:
    LOGGING["loggers"]["yala.request"]["level"] = "ERROR"
    LOGGING["loggers"]["yala.celery"]["level"] = "ERROR"
    LOGGING["loggers"]["django.request"]["level"] = "ERROR"

# ── Sentry (error tracking & performance monitoring) ─────────────────────────
SENTRY_DSN = os.getenv("SENTRY_DSN", "")
if SENTRY_DSN and not DEBUG:
    try:
        import sentry_sdk
        from sentry_sdk.integrations.django import DjangoIntegration
        from sentry_sdk.integrations.celery import CeleryIntegration
        from sentry_sdk.integrations.redis import RedisIntegration

        sentry_sdk.init(
            dsn=SENTRY_DSN,
            environment=os.getenv("SENTRY_ENVIRONMENT", "production"),
            integrations=[
                DjangoIntegration(transaction_style="url"),
                CeleryIntegration(),
                RedisIntegration(),
            ],
            traces_sample_rate=float(os.getenv("SENTRY_TRACES_SAMPLE_RATE", "0.1")),
            send_default_pii=False,
        )
    except ImportError:
        pass

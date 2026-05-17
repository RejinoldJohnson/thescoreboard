"""
Supabase Storage service.

Uses the Supabase Storage REST API directly via httpx so there is no
dependency on a specific version of the supabase-py SDK.

All methods are synchronous to match the rest of the FastAPI codebase
(which uses sync SQLAlchemy sessions).  FastAPI's thread-pool executor
handles blocking I/O in route handlers.

Bucket policies expected in Supabase dashboard:
  - logos, team-banners, tournament-banners, tournament-posters: public read
  - og-cache: public read
  All writes require service-key (backend only) or a signed upload URL.
"""
import io
import logging
import mimetypes
from typing import Optional

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

# Supabase Storage REST base paths
_STORAGE = "/storage/v1"
_OBJECT  = f"{_STORAGE}/object"
_UPLOAD  = f"{_STORAGE}/object/sign/upload"


def _service_headers(extra: Optional[dict] = None) -> dict:
    h = {
        "apikey": settings.SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {settings.SUPABASE_SERVICE_KEY}",
    }
    if extra:
        h.update(extra)
    return h


def _base() -> str:
    return settings.SUPABASE_URL.rstrip("/")


# ── Public URL ────────────────────────────────────────────────────────────────

def get_public_url(bucket: str, path: str) -> str:
    """Return the CDN public URL for an object.  No HTTP round-trip needed."""
    path = path.lstrip("/")
    return f"{_base()}{_OBJECT}/public/{bucket}/{path}"


# ── Backend upload (service key) ──────────────────────────────────────────────

def upload_bytes(
    bucket: str,
    path: str,
    data: bytes,
    content_type: str,
    upsert: bool = True,
) -> str:
    """Upload raw bytes directly from the backend using the service key.

    Returns the public CDN URL.
    Raises httpx.HTTPStatusError on failure.
    """
    if not settings.supabase_configured:
        raise RuntimeError("Supabase is not configured (missing SUPABASE_URL or SUPABASE_SERVICE_KEY)")

    path  = path.lstrip("/")
    url   = f"{_base()}{_OBJECT}/{bucket}/{path}"
    headers = _service_headers({
        "Content-Type": content_type,
        "x-upsert": "true" if upsert else "false",
    })

    resp = httpx.post(url, headers=headers, content=data, timeout=30)
    resp.raise_for_status()
    return get_public_url(bucket, path)


# ── Signed upload URL (for frontend direct upload) ────────────────────────────

def create_signed_upload_url(bucket: str, path: str) -> dict:
    """Ask Supabase to create a one-time signed upload URL.

    The frontend can then PUT a file directly to Supabase Storage using
    this URL — no file bytes ever pass through our backend.

    Returns:
        {
          "signed_url": str,   # absolute URL the frontend PUTs to
          "path":       str,   # the storage path (for public URL derivation)
          "public_url": str,   # the CDN URL once the upload completes
        }
    """
    if not settings.supabase_configured:
        raise RuntimeError("Supabase is not configured")

    path = path.lstrip("/")
    endpoint = f"{_base()}{_UPLOAD}/{bucket}/{path}"

    resp = httpx.post(
        endpoint,
        headers=_service_headers({"Content-Type": "application/json"}),
        json={"upsertEnabled": True, "expiresIn": 300},
        timeout=10,
    )
    if not resp.is_success:
        body = resp.text
        raise RuntimeError(f"Supabase {resp.status_code}: {body}")

    data = resp.json()
    # Supabase returns { "signedURL": "/storage/v1/object/sign/upload/...", "token": "..." }
    relative = data.get("signedURL", "")
    if not relative:
        raise RuntimeError(f"Supabase did not return a signedURL: {data}")
    signed_url = f"{_base()}{relative}" if relative.startswith("/") else relative

    return {
        "signed_url": signed_url,
        "path":       path,
        "public_url": get_public_url(bucket, path),
    }


# ── Delete ────────────────────────────────────────────────────────────────────

def delete_object(bucket: str, path: str) -> None:
    """Delete a single object.  Swallows 404 (already gone)."""
    if not settings.supabase_configured:
        return

    path = path.lstrip("/")
    url  = f"{_base()}{_OBJECT}/{bucket}"
    resp = httpx.delete(
        url,
        headers=_service_headers({"Content-Type": "application/json"}),
        json={"prefixes": [path]},
        timeout=10,
    )
    if resp.status_code not in (200, 404):
        resp.raise_for_status()


# ── Validation helpers ────────────────────────────────────────────────────────

BUCKET_SIZE_LIMITS: dict[str, int] = {
    settings.BUCKET_LOGOS:               settings.MAX_LOGO_SIZE,
    settings.BUCKET_TEAM_BANNERS:        settings.MAX_POSTER_SIZE,
    settings.BUCKET_TOURNAMENT_POSTERS:  settings.MAX_POSTER_SIZE,
    settings.BUCKET_OG_CACHE:            2 * 1024 * 1024,
}

VALID_BUCKETS = set(BUCKET_SIZE_LIMITS.keys())


def validate_upload_request(
    bucket: str,
    content_type: str,
    file_size: int,
) -> None:
    """Raise ValueError with a user-readable message if the request is invalid."""
    if bucket not in VALID_BUCKETS:
        raise ValueError(f"Unknown bucket '{bucket}'. Allowed: {sorted(VALID_BUCKETS)}")

    if content_type not in settings.ALLOWED_IMAGE_TYPES:
        raise ValueError(
            f"File type '{content_type}' not allowed. "
            f"Accepted: {', '.join(settings.ALLOWED_IMAGE_TYPES)}"
        )

    limit = BUCKET_SIZE_LIMITS[bucket]
    if file_size > limit:
        mb = limit // (1024 * 1024)
        raise ValueError(f"File too large. Maximum size for '{bucket}' is {mb} MB.")

"""
URL slug generation.

"MMY Gymkhana 2026" → "mmy-gymkhana-2026"
Handles duplicates by appending a short random suffix.
"""
import re
import random
import string


def generate_slug(name: str) -> str:
    """Convert a name to a URL-safe slug."""
    slug = name.lower().strip()
    slug = re.sub(r"[^\w\s-]", "", slug)   # remove special chars
    slug = re.sub(r"[\s_]+", "-", slug)     # spaces/underscores → hyphens
    slug = re.sub(r"-+", "-", slug)         # collapse multiple hyphens
    slug = slug.strip("-")
    return slug


def generate_unique_slug(name: str, exists_fn) -> str:
    """
    Generate a slug, and if it already exists in DB, append a random suffix.
    exists_fn(slug) -> bool should check the database.
    """
    base = generate_slug(name)
    slug = base
    attempts = 0

    while exists_fn(slug) and attempts < 10:
        suffix = "".join(random.choices(string.ascii_lowercase + string.digits, k=4))
        slug = f"{base}-{suffix}"
        attempts += 1

    return slug

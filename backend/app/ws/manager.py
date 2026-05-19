"""
WebSocket connection manager.

Tracks active WS connections keyed by tournament slug and broadcasts
JSON payloads to all watchers.  Also supports calling push() from sync
FastAPI route handlers via run_coroutine_threadsafe.
"""
import asyncio
import logging
from collections import defaultdict

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:
    def __init__(self):
        self._connections: dict[str, list[WebSocket]] = defaultdict(list)
        self._loop: asyncio.AbstractEventLoop | None = None

    # ── Called once at startup to capture the running event loop ──
    def set_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop

    # ── Lifecycle ─────────────────────────────────────────────────
    async def connect(self, slug: str, ws: WebSocket) -> None:
        await ws.accept()
        self._connections[slug].append(ws)
        logger.debug("WS +connect slug=%s peers=%d", slug, len(self._connections[slug]))

    def disconnect(self, slug: str, ws: WebSocket) -> None:
        try:
            self._connections[slug].remove(ws)
        except ValueError:
            pass
        if not self._connections[slug]:
            self._connections.pop(slug, None)
        logger.debug(
            "WS -disconnect slug=%s remaining=%d",
            slug, len(self._connections.get(slug, [])),
        )

    def has_watchers(self, slug: str) -> bool:
        return bool(self._connections.get(slug))

    # ── Broadcast ─────────────────────────────────────────────────
    async def _send_all(self, slug: str, data: dict) -> None:
        dead = []
        for ws in list(self._connections.get(slug, [])):
            try:
                await ws.send_json(data)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(slug, ws)

    def push(self, slug: str, data: dict) -> None:
        """
        Thread-safe broadcast — call from sync route handlers.
        No-op when nobody is watching or the event loop is not set.
        """
        if not self._loop or not self.has_watchers(slug):
            return
        asyncio.run_coroutine_threadsafe(self._send_all(slug, data), self._loop)


# Singleton used everywhere
manager = ConnectionManager()

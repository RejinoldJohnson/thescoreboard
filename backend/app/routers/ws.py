"""
WebSocket router — real-time tournament updates for spectators.

GET /api/ws/tournament/{slug}
  Accepts a WebSocket, immediately sends the full tournament payload,
  then stays open to receive pushes from score-update endpoints.
  Client should send "ping" every ~20 s; server replies "pong" and also
  sends its own "ping" every 25 s to detect dead connections.
"""
import asyncio
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.ws.manager import manager
from app.routers.public import get_tournament_page

logger = logging.getLogger(__name__)
router = APIRouter()


@router.websocket("/tournament/{slug}")
async def ws_tournament(slug: str, websocket: WebSocket, db: Session = Depends(get_db)):
    await manager.connect(slug, websocket)
    try:
        # ── Send full state on connect so the client has data immediately ──
        try:
            data = get_tournament_page(slug, db)
        except HTTPException as e:
            logger.warning("WS %s: tournament not found (%s)", slug, e.detail)
            await websocket.close(code=4004, reason=e.detail)
            return
        except Exception as e:
            logger.error("WS %s: error building initial payload: %s", slug, e)
            await websocket.close(code=4000, reason="Internal error")
            return

        await websocket.send_json(data)

        # ── Stay alive — handle client pings, send server pings every 25 s ──
        while True:
            try:
                msg = await asyncio.wait_for(websocket.receive_text(), timeout=25)
                if msg == "ping":
                    await websocket.send_text("pong")
            except asyncio.TimeoutError:
                # Server-side keepalive: detect dead TCP connections
                try:
                    await websocket.send_text("ping")
                except Exception:
                    break
    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(slug, websocket)

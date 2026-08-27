import asyncio
import json
import uuid
import time
import logging
from typing import Dict, Any, Optional
from fastapi import WebSocket, WebSocketDisconnect
from database import update_athena_ping, update_device_location

logger = logging.getLogger("athena")
logger.setLevel(logging.INFO)

class AthenaManager:
    def __init__(self):
        # dongle_id -> WebSocket
        self.device_sockets: Dict[str, WebSocket] = {}
        # request_id -> asyncio.Future
        self.pending_requests: Dict[str, asyncio.Future] = {}
        # web client websockets
        self.client_sockets: set[WebSocket] = set()

    async def connect_device(self, dongle_id: str, ws: WebSocket):
        await ws.accept()
        self.device_sockets[dongle_id] = ws
        update_athena_ping(dongle_id)
        logger.info(f"Athena device connected: {dongle_id}")
        await self.broadcast_device_status(dongle_id, True)

    def disconnect_device(self, dongle_id: str):
        if dongle_id in self.device_sockets:
            del self.device_sockets[dongle_id]
            logger.info(f"Athena device disconnected: {dongle_id}")
            asyncio.create_task(self.broadcast_device_status(dongle_id, False))

    async def connect_client(self, ws: WebSocket):
        await ws.accept()
        self.client_sockets.add(ws)

    def disconnect_client(self, ws: WebSocket):
        self.client_sockets.discard(ws)

    async def broadcast_device_status(self, dongle_id: str, online: bool):
        msg = json.dumps({
            "type": "device_status",
            "dongle_id": dongle_id,
            "online": online,
            "time": time.time()
        })
        for client in list(self.client_sockets):
            try:
                await client.send_text(msg)
            except Exception:
                self.client_sockets.discard(client)

    async def handle_device_messages(self, dongle_id: str, ws: WebSocket):
        try:
            while True:
                data = await ws.receive_text()
                update_athena_ping(dongle_id)
                try:
                    payload = json.loads(data)
                    # Check if response to a pending request
                    req_id = str(payload.get("id")) if "id" in payload else None
                    if req_id and req_id in self.pending_requests:
                        future = self.pending_requests.pop(req_id)
                        if not future.done():
                            if "error" in payload:
                                future.set_exception(Exception(str(payload["error"])))
                            else:
                                future.set_result(payload.get("result"))
                    
                    # Handle telemetry / location push if present
                    if payload.get("method") == "location":
                        params = payload.get("params", {})
                        update_device_location(
                            dongle_id,
                            lat=params.get("lat", 0),
                            lng=params.get("lng", 0),
                            speed=params.get("speed", 0),
                            bearing=params.get("bearing", 0),
                            timestamp=params.get("time", time.time()),
                            accuracy=params.get("accuracy", 5)
                        )
                except json.JSONDecodeError:
                    pass
        except WebSocketDisconnect:
            self.disconnect_device(dongle_id)
        except Exception as e:
            logger.warning(f"Error in device ws for {dongle_id}: {e}")
            self.disconnect_device(dongle_id)

    async def call_device(self, dongle_id: str, method: str, params: Any = None, timeout: float = 25.0) -> Any:
        ws = self.device_sockets.get(dongle_id)
        if not ws:
            raise Exception(f"Device {dongle_id} is offline (not connected to Athena WebSocket)")

        req_id = str(uuid.uuid4())
        loop = asyncio.get_event_loop()
        future = loop.create_future()
        self.pending_requests[req_id] = future

        request_payload = {
            "jsonrpc": "2.0",
            "method": method,
            "params": params or {},
            "id": req_id
        }

        try:
            await ws.send_text(json.dumps(request_payload))
            return await asyncio.wait_for(future, timeout=timeout)
        except asyncio.TimeoutError:
            self.pending_requests.pop(req_id, None)
            raise Exception(f"Athena call '{method}' timed out after {timeout}s")
        except Exception as e:
            self.pending_requests.pop(req_id, None)
            raise e

athena_mgr = AthenaManager()

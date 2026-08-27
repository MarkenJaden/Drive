import os
import time
import json
import base64
from pathlib import Path
from typing import Optional, List, Dict, Any

from fastapi import FastAPI, Request, Response, HTTPException, WebSocket, WebSocketDisconnect, Query, Body, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles

import database as db
from athena import athena_mgr

STORAGE_DIR = os.getenv("STORAGE_DIR", "/data/storage")
Path(STORAGE_DIR).mkdir(parents=True, exist_ok=True)

app = FastAPI(title="Drive Self-Hosted API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Helper to decode pair token JWT
def decode_pair_token(token_str: str) -> Optional[Dict[str, Any]]:
    try:
        if "pair=" in token_str:
            from urllib.parse import urlparse, parse_qs
            parsed = urlparse(token_str)
            token_str = parse_qs(parsed.query).get("pair", [""])[0]
            
        parts = token_str.strip().split(".")
        if len(parts) != 3:
            return None
            
        payload_b64 = parts[1]
        # Pad base64 if needed
        padding = len(payload_b64) % 4
        if padding:
            payload_b64 += "=" * (4 - padding)
        decoded = base64.urlsafe_b64decode(payload_b64.encode("ascii")).decode("utf-8")
        payload = json.loads(decoded)
        if payload.get("pair") is True and isinstance(payload.get("identity"), str):
            return payload
    except Exception as e:
        print("Error decoding pair token:", e)
    return None

# --- Static storage mount ---
@app.get("/storage/{dongle_id}/{file_path:path}")
async def serve_storage_file(dongle_id: str, file_path: str):
    full_path = Path(STORAGE_DIR) / dongle_id / file_path
    if not full_path.exists() or not full_path.is_file():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(str(full_path))

# --- Health & Root ---
@app.get("/")
@app.get("/health")
def health():
    return {"status": "ok", "service": "drive-api", "time": time.time()}

# --- Auth & Profile ---
@app.get("/v1/me/")
@app.get("/v1/me")
def get_me():
    return db.get_profile("1")

@app.get("/v2/auth/")
@app.get("/v2/auth")
def check_auth():
    return {"success": True}

@app.post("/v2/pilotpair/")
@app.post("/v2/pilotpair")
async def pilot_pair(request: Request):
    token_str = ""
    # Can be form-encoded or JSON
    content_type = request.headers.get("content-type", "")
    if "application/x-www-form-urlencoded" in content_type:
        form = await request.form()
        token_str = str(form.get("pair_token", "") or form.get("pair", ""))
    elif "json" in content_type:
        body = await request.json()
        token_str = str(body.get("pair_token", "") or body.get("pair", ""))
    else:
        body_bytes = await request.body()
        token_str = body_bytes.decode("utf-8", errors="ignore")

    payload = decode_pair_token(token_str)
    if not payload:
        raise HTTPException(status_code=400, detail="Invalid pair code or QR code")

    dongle_id = payload["identity"]
    device = db.pair_device(dongle_id=dongle_id, user_id="1")
    return {"dongle_id": dongle_id, "pair": True, "device": device}

# --- Devices Endpoints ---
@app.get("/v1/me/devices/")
@app.get("/v1/me/devices")
def get_my_devices():
    return db.get_devices("1")

@app.get("/v1/devices/{dongle_id}/")
@app.get("/v1/devices/{dongle_id}")
@app.get("/v1.1/devices/{dongle_id}/")
@app.get("/v1.1/devices/{dongle_id}")
def get_device_info(dongle_id: str):
    device = db.get_device(dongle_id)
    if not device:
        # Auto-create device record on first access
        device = db.pair_device(dongle_id=dongle_id, user_id="1")
    return device

@app.patch("/v1/devices/{dongle_id}/")
@app.patch("/v1/devices/{dongle_id}")
@app.patch("/v1.1/devices/{dongle_id}/")
@app.patch("/v1.1/devices/{dongle_id}")
async def patch_device(dongle_id: str, request: Request):
    body = await request.json()
    alias = body.get("alias")
    if alias is not None:
        updated = db.set_device_alias(dongle_id, alias)
        if updated:
            return updated
    device = db.get_device(dongle_id)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    return device

@app.post("/v1/devices/{dongle_id}/unpair")
def unpair(dongle_id: str):
    db.unpair_device(dongle_id)
    return {"success": 1}

@app.get("/v1/devices/{dongle_id}/location")
def get_location(dongle_id: str):
    return db.get_device_location(dongle_id)

@app.get("/v1/devices/{dongle_id}/stats")
@app.get("/v1.1/devices/{dongle_id}/stats")
def get_stats(dongle_id: str):
    return db.get_driving_stats(dongle_id)

@app.get("/v1/devices/{dongle_id}/users")
def get_users(dongle_id: str):
    profile = db.get_profile("1")
    return [{"email": profile["email"], "permission": "owner"}]

@app.get("/v1/devices/{dongle_id}/athena_offline_queue")
def get_offline_queue(dongle_id: str):
    return {"offline_queue": []}

@app.get("/v1/devices/{dongle_id}/routes")
def get_device_routes(dongle_id: str, limit: int = 50, offset: int = 0):
    return db.get_routes(dongle_id, limit=limit, offset=offset, preserved_only=False)

@app.get("/v1/devices/{dongle_id}/routes/preserved")
def get_preserved_routes(dongle_id: str, limit: int = 50, offset: int = 0):
    return db.get_routes(dongle_id, limit=limit, offset=offset, preserved_only=True)

# --- Routes & Preserves ---
@app.get("/v1/route/{route_name:path}/files")
def get_route_files(route_name: str):
    return db.get_route_files(route_name)

@app.get("/v1/route/{route_name:path}/share_signature")
def get_share_signature(route_name: str):
    return {"url": f"https://drive.markenjaden.de/share/{route_name}", "expires": int(time.time()) + 86400}

@app.post("/v1/route/{route_name:path}/preserve")
@app.delete("/v1/route/{route_name:path}/preserve")
async def preserve_route_endpoint(route_name: str, request: Request):
    preserve_flag = request.method == "POST"
    route = db.preserve_route(route_name, preserved=preserve_flag)
    if not route:
        raise HTTPException(status_code=404, detail="Route not found")
    return route

@app.get("/v1/route/{route_name:path}/")
@app.get("/v1/route/{route_name:path}")
def get_single_route(route_name: str):
    route = db.get_route(route_name)
    if not route:
        raise HTTPException(status_code=404, detail="Route not found")
    return route

# --- File Upload Endpoints ---
@app.get("/v1.4/{dongle_id}/upload_url/")
@app.get("/v1.4/{dongle_id}/upload_url")
def get_upload_url(dongle_id: str, path: str = Query(...)):
    url = f"/upload/{dongle_id}/{path}"
    return {"url": url, "headers": {}}

@app.post("/v1/{dongle_id}/upload_urls/")
@app.post("/v1/{dongle_id}/upload_urls")
async def get_upload_urls_batch(dongle_id: str, request: Request):
    body = await request.json()
    paths = body.get("paths", [])
    urls = []
    for p in paths:
        urls.append(f"/upload/{dongle_id}/{p}")
    return urls

@app.put("/upload/{dongle_id}/{file_path:path}")
@app.post("/upload/{dongle_id}/{file_path:path}")
async def upload_file_stream(dongle_id: str, file_path: str, request: Request):
    dest = Path(STORAGE_DIR) / dongle_id / file_path
    dest.parent.mkdir(parents=True, exist_ok=True)
    
    total_size = 0
    with open(dest, "wb") as f:
        async for chunk in request.stream():
            f.write(chunk)
            total_size += len(chunk)
            
    db.register_uploaded_file(dongle_id, file_path, total_size)
    return {"success": 1, "size": total_size}

# --- Athena RPC Endpoints (HTTP & WS) ---
@app.post("/v1/devices/{dongle_id}/athena")
@app.post("/v1.1/devices/{dongle_id}/athena")
async def call_athena_http(dongle_id: str, request: Request):
    body = await request.json()
    method = body.get("method")
    params = body.get("params")
    if not method:
        raise HTTPException(status_code=400, detail="Method is required")
    try:
        result = await athena_mgr.call_device(dongle_id, method, params, timeout=25.0)
        return {"result": result}
    except Exception as e:
        return JSONResponse(status_code=504, content={"error": str(e)})

@app.post("/v1/devices/{dongle_id}/takeSnapshot")
async def take_snapshot(dongle_id: str):
    try:
        result = await athena_mgr.call_device(dongle_id, "takeSnapshot", {}, timeout=20.0)
        return {"result": result}
    except Exception as e:
        raise HTTPException(status_code=504, detail=str(e))

@app.post("/v1/devices/{dongle_id}/setNavDestination")
async def set_nav_destination(dongle_id: str, request: Request):
    body = await request.json()
    try:
        result = await athena_mgr.call_device(dongle_id, "setNavDestination", body, timeout=10.0)
        return {"result": result}
    except Exception as e:
        raise HTTPException(status_code=504, detail=str(e))

# --- WebSockets ---
@app.websocket("/ws/v2/{dongle_id}")
async def athena_device_ws(websocket: WebSocket, dongle_id: str):
    await athena_mgr.connect_device(dongle_id, websocket)
    await athena_mgr.handle_device_messages(dongle_id, websocket)

@app.websocket("/ws")
@app.websocket("/ws/")
async def athena_browser_ws(websocket: WebSocket):
    await athena_mgr.connect_client(websocket)
    try:
        while True:
            # Handle incoming requests from browser if any
            data = await websocket.receive_text()
            try:
                payload = json.loads(data)
                dongle_id = payload.get("dongle_id")
                method = payload.get("method")
                params = payload.get("params")
                req_id = payload.get("id")
                if dongle_id and method:
                    try:
                        res = await athena_mgr.call_device(dongle_id, method, params)
                        await websocket.send_text(json.dumps({"id": req_id, "result": res}))
                    except Exception as err:
                        await websocket.send_text(json.dumps({"id": req_id, "error": str(err)}))
            except json.JSONDecodeError:
                pass
    except WebSocketDisconnect:
        athena_mgr.disconnect_client(websocket)
    except Exception:
        athena_mgr.disconnect_client(websocket)

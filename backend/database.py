import os
import sqlite3
import time
import json
from pathlib import Path
from typing import Optional, List, Dict, Any

DB_PATH = os.getenv("DB_PATH", "/data/drive.db")

def get_db():
    Path(DB_PATH).parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=20.0, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    with conn:
        conn.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            email TEXT UNIQUE,
            username TEXT,
            created_at REAL
        )
        """)
        conn.execute("""
        CREATE TABLE IF NOT EXISTS devices (
            dongle_id TEXT PRIMARY KEY,
            user_id TEXT,
            alias TEXT,
            device_type TEXT DEFAULT 'mici',
            serial TEXT DEFAULT '',
            public_key TEXT DEFAULT '',
            prime INTEGER DEFAULT 1,
            prime_type INTEGER DEFAULT 1,
            trial_claimed INTEGER DEFAULT 1,
            openpilot_version TEXT DEFAULT '0.9.8',
            sim_id TEXT DEFAULT '',
            sim_type INTEGER DEFAULT 0,
            ignore_uploads INTEGER DEFAULT 0,
            is_paired INTEGER DEFAULT 1,
            is_owner INTEGER DEFAULT 1,
            last_athena_ping REAL DEFAULT 0,
            created_at REAL,
            updated_at REAL
        )
        """)
        conn.execute("""
        CREATE TABLE IF NOT EXISTS locations (
            dongle_id TEXT PRIMARY KEY,
            lat REAL,
            lng REAL,
            speed REAL DEFAULT 0,
            bearing REAL DEFAULT 0,
            time REAL DEFAULT 0,
            accuracy REAL DEFAULT 10
        )
        """)
        conn.execute("""
        CREATE TABLE IF NOT EXISTS routes (
            fullname TEXT PRIMARY KEY,
            dongle_id TEXT,
            url TEXT,
            start_time TEXT,
            end_time TEXT,
            length REAL DEFAULT 0,
            distance REAL DEFAULT 0,
            segment_numbers TEXT DEFAULT '[]',
            git_commit TEXT DEFAULT '',
            git_branch TEXT DEFAULT 'StarPilot',
            platform TEXT DEFAULT 'HYUNDAI IONIQ HYBRID 2016',
            preserved INTEGER DEFAULT 0,
            created_at REAL
        )
        """)
        conn.execute("""
        CREATE TABLE IF NOT EXISTS files (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            route_name TEXT,
            dongle_id TEXT,
            segment INTEGER DEFAULT 0,
            file_type TEXT,
            filename TEXT,
            url TEXT,
            size INTEGER DEFAULT 0,
            created_at REAL
        )
        """)
        conn.execute("""
        CREATE TABLE IF NOT EXISTS stats (
            dongle_id TEXT PRIMARY KEY,
            all_distance REAL DEFAULT 0,
            all_minutes REAL DEFAULT 0,
            all_routes INTEGER DEFAULT 0,
            all_trips INTEGER DEFAULT 0,
            week_distance REAL DEFAULT 0,
            week_minutes REAL DEFAULT 0,
            week_routes INTEGER DEFAULT 0,
            week_trips INTEGER DEFAULT 0
        )
        """)
        
        # Create default user if not exists
        conn.execute("""
        INSERT OR IGNORE INTO users (id, email, username, created_at)
        VALUES ('1', 'user@drive.local', 'MarkenJaden', ?)
        """, (time.time(),))

init_db()

# --- User & Device helpers ---

def get_profile(user_id: str = "1") -> Dict[str, Any]:
    conn = get_db()
    row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    if row:
        return dict(row)
    return {"id": "1", "email": "user@drive.local", "username": "MarkenJaden", "created_at": time.time()}

def get_devices(user_id: str = "1") -> List[Dict[str, Any]]:
    conn = get_db()
    rows = conn.execute("SELECT * FROM devices ORDER BY alias ASC, dongle_id ASC").fetchall()
    devices = []
    now = time.time()
    for r in rows:
        d = dict(r)
        d["prime"] = bool(d["prime"])
        d["trial_claimed"] = bool(d["trial_claimed"])
        d["is_paired"] = bool(d["is_paired"])
        d["is_owner"] = bool(d["is_owner"])
        d["is_online"] = bool(d["last_athena_ping"] and d["last_athena_ping"] >= now - 120)
        d["eligible_features"] = {
            "prime": True,
            "prime_data": True,
            "nav": True
        }
        devices.append(d)
    return devices

def get_device(dongle_id: str) -> Optional[Dict[str, Any]]:
    conn = get_db()
    row = conn.execute("SELECT * FROM devices WHERE dongle_id = ?", (dongle_id,)).fetchone()
    now = time.time()
    if row:
        d = dict(row)
        d["prime"] = bool(d["prime"])
        d["trial_claimed"] = bool(d["trial_claimed"])
        d["is_paired"] = bool(d["is_paired"])
        d["is_owner"] = bool(d["is_owner"])
        d["is_online"] = bool(d["last_athena_ping"] and d["last_athena_ping"] >= now - 120)
        d["eligible_features"] = {
            "prime": True,
            "prime_data": True,
            "nav": True
        }
        return d
    return None

def pair_device(dongle_id: str, user_id: str = "1", alias: str = "") -> Dict[str, Any]:
    conn = get_db()
    now = time.time()
    alias = alias or f"Comma ({dongle_id[-6:]})"
    with conn:
        conn.execute("""
        INSERT INTO devices (dongle_id, user_id, alias, last_athena_ping, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(dongle_id) DO UPDATE SET
            user_id = excluded.user_id,
            is_paired = 1,
            updated_at = excluded.updated_at
        """, (dongle_id, user_id, alias, now, now, now))
        
        conn.execute("""
        INSERT OR IGNORE INTO stats (dongle_id) VALUES (?)
        """, (dongle_id,))
        
        conn.execute("""
        INSERT OR IGNORE INTO locations (dongle_id, lat, lng, time)
        VALUES (?, 52.5200, 13.4050, ?)
        """, (dongle_id, now))
    return get_device(dongle_id)

def set_device_alias(dongle_id: str, alias: str) -> Optional[Dict[str, Any]]:
    conn = get_db()
    with conn:
        conn.execute("UPDATE devices SET alias = ?, updated_at = ? WHERE dongle_id = ?", (alias, time.time(), dongle_id))
    return get_device(dongle_id)

def update_athena_ping(dongle_id: str, ping_time: float = None):
    ping_time = ping_time or time.time()
    conn = get_db()
    with conn:
        conn.execute("UPDATE devices SET last_athena_ping = ? WHERE dongle_id = ?", (ping_time, dongle_id))

def unpair_device(dongle_id: str) -> bool:
    conn = get_db()
    with conn:
        conn.execute("DELETE FROM devices WHERE dongle_id = ?", (dongle_id,))
    return True

# --- Location & Stats ---

def get_device_location(dongle_id: str) -> Optional[Dict[str, Any]]:
    conn = get_db()
    row = conn.execute("SELECT * FROM locations WHERE dongle_id = ?", (dongle_id,)).fetchone()
    if row:
        return dict(row)
    return {
        "dongle_id": dongle_id,
        "lat": 52.5200,
        "lng": 13.4050,
        "speed": 0,
        "bearing": 0,
        "time": time.time(),
        "accuracy": 5
    }

def update_device_location(dongle_id: str, lat: float, lng: float, speed: float = 0, bearing: float = 0, timestamp: float = 0, accuracy: float = 5):
    conn = get_db()
    timestamp = timestamp or time.time()
    with conn:
        conn.execute("""
        INSERT INTO locations (dongle_id, lat, lng, speed, bearing, time, accuracy)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(dongle_id) DO UPDATE SET
            lat = excluded.lat,
            lng = excluded.lng,
            speed = excluded.speed,
            bearing = excluded.bearing,
            time = excluded.time,
            accuracy = excluded.accuracy
        """, (dongle_id, lat, lng, speed, bearing, timestamp, accuracy))

def get_driving_stats(dongle_id: str) -> Dict[str, Any]:
    conn = get_db()
    row = conn.execute("SELECT * FROM stats WHERE dongle_id = ?", (dongle_id,)).fetchone()
    if row:
        r = dict(row)
        return {
            "all": {
                "distance": r.get("all_distance", 0.0),
                "minutes": r.get("all_minutes", 0.0),
                "routes": r.get("all_routes", 0),
                "trips": r.get("all_trips", 0)
            },
            "week": {
                "distance": r.get("week_distance", 0.0),
                "minutes": r.get("week_minutes", 0.0),
                "routes": r.get("week_routes", 0),
                "trips": r.get("week_trips", 0)
            }
        }
    return {
        "all": {"distance": 0.0, "minutes": 0.0, "routes": 0, "trips": 0},
        "week": {"distance": 0.0, "minutes": 0.0, "routes": 0, "trips": 0}
    }

# --- Routes & Files ---

def get_routes(dongle_id: str, limit: int = 50, offset: int = 0, preserved_only: bool = False) -> List[Dict[str, Any]]:
    conn = get_db()
    query = "SELECT * FROM routes WHERE dongle_id = ?"
    params = [dongle_id]
    if preserved_only:
        query += " AND preserved = 1"
    query += " ORDER BY start_time DESC LIMIT ? OFFSET ?"
    params.extend([limit, offset])
    
    rows = conn.execute(query, params).fetchall()
    routes = []
    for r in rows:
        d = dict(r)
        d["preserved"] = bool(d["preserved"])
        try:
            d["segment_numbers"] = json.loads(d.get("segment_numbers") or "[]")
        except Exception:
            d["segment_numbers"] = []
        routes.append(d)
    return routes

def get_route(fullname: str) -> Optional[Dict[str, Any]]:
    conn = get_db()
    row = conn.execute("SELECT * FROM routes WHERE fullname = ?", (fullname,)).fetchone()
    if row:
        d = dict(row)
        d["preserved"] = bool(d["preserved"])
        try:
            d["segment_numbers"] = json.loads(d.get("segment_numbers") or "[]")
        except Exception:
            d["segment_numbers"] = []
        return d
    return None

def save_route_segment(dongle_id: str, route_date: str, segment: int, platform: str = "HYUNDAI IONIQ HYBRID 2016"):
    fullname = f"{dongle_id}|{route_date}"
    conn = get_db()
    with conn:
        existing = conn.execute("SELECT segment_numbers FROM routes WHERE fullname = ?", (fullname,)).fetchone()
        segments = []
        if existing and existing["segment_numbers"]:
            try:
                segments = json.loads(existing["segment_numbers"])
            except Exception:
                segments = []
        if segment not in segments:
            segments.append(segment)
            segments.sort()
            
        start_time = route_date.replace("--", " ").replace("-", ":")
        conn.execute("""
        INSERT INTO routes (fullname, dongle_id, url, start_time, end_time, segment_numbers, platform, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(fullname) DO UPDATE SET
            segment_numbers = excluded.segment_numbers,
            length = excluded.length
        """, (
            fullname,
            dongle_id,
            f"/storage/{dongle_id}/{route_date}--{segment}/qcamera.ts",
            start_time,
            start_time,
            json.dumps(segments),
            platform,
            time.time()
        ))
        
        # update stats
        conn.execute("""
        UPDATE stats SET
            all_routes = (SELECT COUNT(*) FROM routes WHERE dongle_id = ?),
            all_minutes = (SELECT COUNT(*) * 1.0 FROM files WHERE dongle_id = ? AND file_type = 'qcam')
        WHERE dongle_id = ?
        """, (dongle_id, dongle_id, dongle_id))

def preserve_route(fullname: str, preserved: bool = True) -> Optional[Dict[str, Any]]:
    conn = get_db()
    with conn:
        conn.execute("UPDATE routes SET preserved = ? WHERE fullname = ?", (1 if preserved else 0, fullname))
    return get_route(fullname)

def register_uploaded_file(dongle_id: str, rel_path: str, size: int):
    # rel_path looks like 2026-08-27--20-15-00--0/qcamera.ts or similar
    parts = rel_path.split("/")
    if len(parts) >= 2:
        dir_name = parts[0]
        filename = parts[1]
        if "--" in dir_name:
            dir_parts = dir_name.rsplit("--", 1)
            route_date = dir_parts[0]
            segment = int(dir_parts[1]) if dir_parts[1].isdigit() else 0
            fullname = f"{dongle_id}|{route_date}"
            
            file_type = "other"
            if "qcam" in filename: file_type = "qcam"
            elif "fcam" in filename or "dcam" in filename or "ecam" in filename: file_type = "cam"
            elif "qlog" in filename: file_type = "qlog"
            elif "rlog" in filename: file_type = "rlog"
            
            url = f"/storage/{dongle_id}/{rel_path}"
            
            conn = get_db()
            with conn:
                conn.execute("""
                INSERT INTO files (route_name, dongle_id, segment, file_type, filename, url, size, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """, (fullname, dongle_id, segment, file_type, filename, url, size, time.time()))
                
            save_route_segment(dongle_id, route_date, segment)

def get_route_files(route_name: str) -> Dict[str, List[str]]:
    conn = get_db()
    rows = conn.execute("SELECT * FROM files WHERE route_name = ? ORDER BY segment ASC", (route_name,)).fetchall()
    
    cameras = []
    dcameras = []
    ecameras = []
    qcameras = []
    logs = []
    qlogs = []
    
    for r in rows:
        fn = r["filename"]
        url = r["url"]
        if "qcamera" in fn: qcameras.append(url)
        elif "fcamera" in fn: cameras.append(url)
        elif "dcamera" in fn: dcameras.append(url)
        elif "ecamera" in fn: ecameras.append(url)
        elif "qlog" in fn: qlogs.append(url)
        elif "rlog" in fn: logs.append(url)
        
    return {
        "cameras": cameras,
        "dcameras": dcameras,
        "ecameras": ecameras,
        "qcameras": qcameras,
        "logs": logs,
        "qlogs": qlogs
    }

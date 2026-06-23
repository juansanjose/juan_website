#!/usr/bin/env python3
"""Small privacy-preserving unique visitor counter."""

import argparse
import hashlib
import hmac
import json
import os
import re
import tempfile
import threading
from datetime import date
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


VISITOR_ID_RE = re.compile(r"^[A-Za-z0-9_-]{20,128}$")
MAX_NEW_VISITORS_PER_IP_PER_DAY = 500


class CounterStore:
    def __init__(self, state_file, secret, daily_ip_limit=MAX_NEW_VISITORS_PER_IP_PER_DAY):
        self.state_file = Path(state_file)
        self.secret = secret
        self.daily_ip_limit = daily_ip_limit
        self.lock = threading.Lock()
        self.visitors = set()
        self.ip_counts = {}
        self.ip_count_date = date.today().isoformat()
        self._load()

    def _digest(self, namespace, value):
        message = f"{namespace}:{value}".encode("utf-8")
        return hmac.new(self.secret, message, hashlib.sha256).hexdigest()

    def _load(self):
        if not self.state_file.exists():
            return
        with self.state_file.open("r", encoding="utf-8") as handle:
            state = json.load(handle)
        self.visitors = set(state.get("visitors", []))
        if state.get("ip_count_date") == self.ip_count_date:
            self.ip_counts = state.get("ip_counts", {})

    def _save(self):
        self.state_file.parent.mkdir(parents=True, exist_ok=True)
        state = {
            "visitors": sorted(self.visitors),
            "ip_count_date": self.ip_count_date,
            "ip_counts": self.ip_counts,
        }
        fd, temporary_name = tempfile.mkstemp(
            dir=self.state_file.parent,
            prefix=f".{self.state_file.name}.",
            text=True,
        )
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as handle:
                json.dump(state, handle, separators=(",", ":"))
                handle.write("\n")
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(temporary_name, self.state_file)
        finally:
            if os.path.exists(temporary_name):
                os.unlink(temporary_name)

    def record(self, visitor_id, client_ip):
        visitor_hash = self._digest("visitor", visitor_id)
        ip_hash = self._digest("ip", client_ip)
        today = date.today().isoformat()

        with self.lock:
            if today != self.ip_count_date:
                self.ip_count_date = today
                self.ip_counts = {}

            if visitor_hash in self.visitors:
                return len(self.visitors), False

            if self.ip_counts.get(ip_hash, 0) >= self.daily_ip_limit:
                return len(self.visitors), False

            self.visitors.add(visitor_hash)
            self.ip_counts[ip_hash] = self.ip_counts.get(ip_hash, 0) + 1
            self._save()
            return len(self.visitors), True


class VisitorHandler(BaseHTTPRequestHandler):
    server_version = "VisitorCounter/1.0"

    def do_GET(self):
        if self.path != "/health":
            self.send_error(404)
            return
        body = b'{"status":"ok"}'
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        if self.path != "/api/visitor":
            self.send_error(404)
            return

        try:
            content_length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            self.send_error(400)
            return
        if content_length < 2 or content_length > 512:
            self.send_error(400)
            return

        try:
            payload = json.loads(self.rfile.read(content_length))
        except (json.JSONDecodeError, UnicodeDecodeError):
            self.send_error(400)
            return

        visitor_id = payload.get("visitor_id") if isinstance(payload, dict) else None
        if not isinstance(visitor_id, str) or not VISITOR_ID_RE.fullmatch(visitor_id):
            self.send_error(400)
            return

        forwarded_for = self.headers.get("X-Forwarded-For", "")
        client_ip = forwarded_for.split(",", 1)[0].strip() or self.client_address[0]
        total, counted = self.server.store.record(visitor_id, client_ip)
        body = json.dumps({"total": total, "counted": counted}).encode("utf-8")

        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, message, *args):
        print(f"{self.address_string()} - {message % args}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8787)
    parser.add_argument("--state-file", default="/var/lib/juan-visitor-counter/state.json")
    args = parser.parse_args()

    secret = os.environ.get("VISITOR_HMAC_SECRET", "").encode("utf-8")
    if len(secret) < 32:
        raise SystemExit("VISITOR_HMAC_SECRET must contain at least 32 characters")

    server = ThreadingHTTPServer((args.host, args.port), VisitorHandler)
    server.store = CounterStore(args.state_file, secret)
    server.serve_forever()


if __name__ == "__main__":
    main()

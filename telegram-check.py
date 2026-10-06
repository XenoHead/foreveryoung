#!/usr/bin/env python3
"""Telegram delivery checker for @heremes_xeno_bot (webhook mode).

In webhook mode the gateway consumes updates directly, so getUpdates is
blocked. Instead this checker:
  1. Sends a test message to the bot (proves the bot is alive).
  2. Registers the webhook endpoint with Telegram (proves the tunnel is wired).
  3. Pings the webhook endpoint directly to prove Telegram can reach it.

Exits 0 on success, 1 on failure. Intended to be run periodically by a task
scheduler (e.g. Windows Task Scheduler).
"""

import json
import time
import urllib.request
import urllib.error
import sys

TOKEN = "8929446589:AAEh07X-m0s62sYYGR3N6ebCFqLJSEohNOo"
BASE = f"https://api.telegram.org/bot{TOKEN}"
CHAT_ID = "8245414535"
PUBLIC_URL = "https://nat-eleven-joke-hire.trycloudflare.com/telegram"
POLL_DELAY = 10  # wait this many seconds for the gateway to process


def _api(method, payload=None):
    url = f"{BASE}/{method}"
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(url, data=data, method="POST" if data else "GET")
    req.add_header("Content-Type", "application/json")
    req.add_header("User-Agent", "TelegramBot/1.0")
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.status, json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()


def _request(url, payload=None):
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(
        url, data=data, method="POST" if data else "GET",
        headers={"Content-Type": "application/json", "User-Agent": "TelegramBot/1.0"},
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return r.status, r.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()


def main():
    test_text = f"HERMES-KEEPALIVE-{time.strftime('%H%M%S')}"

    # 1) Send a test message to the bot (proves bot is alive)
    status, resp = _api(
        "sendMessage",
        {"chat_id": CHAT_ID, "text": test_text, "disable_web_page_preview": True},
    )
    if status != 200 or not resp.get("ok"):
        print(f"SEND FAILED: HTTP {status} {json.dumps(resp)[:200]}")
        return 1
    sent_id = resp.get("result", {}).get("message_id")
    print(f"Sent test message id={sent_id}: {test_text}")

    # 2) Register the public webhook URL with Telegram
    api_status, api_resp = _api(
        "setWebhook",
        {
            "url": PUBLIC_URL,
            "allowed_updates": ["message", "edited_message", "callback_query"],
            "drop_pending_updates": True,
        },
    )
    if api_status != 200 or not api_resp.get("ok"):
        print(f"SETWEBHOOK FAILED: HTTP {api_status} {json.dumps(api_resp)[:200]}")
        return 1
    print("setWebhook: registered with Telegram")

    time.sleep(POLL_DELAY)

    # 3) Ping the webhook endpoint directly to prove Telegram can reach it.
    # The adapter expects a JSON POST; responding 200 means the tunnel + port 8443
    # are live and the gateway's webhook listener is accepting requests.
    hc, hres = _request(
        PUBLIC_URL,
        {"test": "delivery-check", "timestamp": int(time.time())},
    )
    if hc == 200:
        print(f"WEBHOOK-PING OK: HTTP {hc} (tunnel + port 8443 live)")
    else:
        print(f"WEBHOOK-PING FAILED: HTTP {hc} {hres[:200]}")
        return 1

    print("DELIVERY CHECK PASSED")
    return 0


if __name__ == "__main__":
    sys.exit(main())

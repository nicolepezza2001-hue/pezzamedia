#!/usr/bin/env python3
"""Encrypt the Jobs HQ data for pezzamedia.com/jobs.

Usage: python3 tools/hq/encrypt.py <data.json> <password-file> [out]
The plaintext data and the password live in the private project files, never in this repo.
Output: dist/jobs/data.enc.json (AES-256-GCM, key = PBKDF2-SHA256(password, salt, 600k)).
"""
import base64, json, os, sys
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

ITER = 600_000
src, pwfile = sys.argv[1], sys.argv[2]
out = sys.argv[3] if len(sys.argv) > 3 else os.path.join(os.path.dirname(__file__), "..", "..", "dist", "jobs", "data.enc.json")
data = json.load(open(src, encoding="utf-8"))  # validates JSON
pw = open(pwfile, encoding="utf-8").read().strip()
salt, iv = os.urandom(16), os.urandom(12)
key = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=ITER).derive(pw.encode())
ct = AESGCM(key).encrypt(iv, json.dumps(data, ensure_ascii=False, separators=(",", ":")).encode(), None)
e = lambda b: base64.b64encode(b).decode()
json.dump({"v": 1, "iter": ITER, "salt": e(salt), "iv": e(iv), "ct": e(ct)}, open(out, "w"))
print("wrote", out, len(ct), "bytes")

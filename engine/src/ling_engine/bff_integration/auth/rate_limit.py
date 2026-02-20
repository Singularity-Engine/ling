"""
Shared rate limiter instance for all Ling API routes.

slowapi requires a single Limiter instance shared across the app.
Import this in server.py (for app.state.limiter) and in each route file (for decorators).
"""

from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)

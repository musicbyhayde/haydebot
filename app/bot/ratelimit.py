"""In-memory sliding-window rate limiter (single DigitalOcean instance -> per process is enough)."""
from __future__ import annotations

import math
import threading
import time
from collections import deque
from typing import Optional


class SlidingWindowLimiter:
    def __init__(self, window: float = 60.0):
        self.window = window
        self._hits: dict[str, deque] = {}
        self._lock = threading.Lock()

    def hit(self, bucket: str, limit: int, now: Optional[float] = None) -> Optional[int]:
        """Count one request. None if allowed, else seconds until a slot frees up."""
        now = time.monotonic() if now is None else now
        with self._lock:
            q = self._hits.setdefault(bucket, deque())
            while q and q[0] <= now - self.window:
                q.popleft()
            if len(q) >= limit:
                return max(1, math.ceil(q[0] + self.window - now))
            q.append(now)
            if len(self._hits) > 10_000:  # forget idle buckets
                for b in [b for b, d in self._hits.items() if not d or d[-1] <= now - self.window]:
                    del self._hits[b]
            return None

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()


limiter = SlidingWindowLimiter()

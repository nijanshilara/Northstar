"""
geocoding.py — Universal Destination Geocoding and Normalization Service for Northstar.

Architecture:
- Resolves arbitrary destination strings (city, state/province, country) to structured geographic entities.
- Dual-engine fallback:
    1. OpenStreetMap Nominatim (primary structured search with boundary boxes & address hierarchy).
    2. Open-Meteo Geocoding API (high-speed, no-key global fallback).
- Strictly free: 0 billing, 0 credit cards, 0 paid API keys required.
- In-memory 24-hour TTL caching to prevent repeat network traffic.
- Rate limiting compliance (>= 1.0s between public Nominatim queries, custom descriptive User-Agent).
- Explicit disambiguation across countries and regions (e.g. Springfield IL vs Springfield MO).
"""

from __future__ import annotations

import asyncio
import logging
import re
import time
import urllib.parse
from dataclasses import dataclass
from typing import Optional

import httpx

logger = logging.getLogger(__name__)


@dataclass
class ResolvedDestination:
    """Canonical resolved geographic destination."""
    query: str
    canonical_name: str
    city: str
    region: Optional[str]
    country: Optional[str]
    country_code: Optional[str]
    latitude: float
    longitude: float
    bounding_box: Optional[tuple[float, float, float, float]]  # south, west, north, east
    stable_id: Optional[str] = None
    confidence: float = 1.0


class UniversalDestinationGeocoder:
    """
    Universal geocoder combining OpenStreetMap Nominatim and Open-Meteo Geocoding.
    """

    NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
    OPEN_METEO_URL = "https://geocoding-api.open-meteo.com/v1/search"
    USER_AGENT = "Northstar-AI-Travel-Guide/1.0 (https://github.com/northstar/travel-guide; travel-support@northstar.local)"

    _cache: dict[str, tuple[float, ResolvedDestination]] = {}
    _CACHE_TTL: float = 86400.0  # 24 hours
    _last_nominatim_time: float = 0.0
    _lock = asyncio.Lock()

    async def _rate_limit_nominatim(self) -> None:
        """Enforce polite rate limiting for OpenStreetMap Nominatim (>= 1.0s gap)."""
        async with self._lock:
            now = time.time()
            elapsed = now - self._last_nominatim_time
            if elapsed < 1.0:
                await asyncio.sleep(1.0 - elapsed)
            self._last_nominatim_time = time.time()

    async def resolve(self, destination: str) -> Optional[ResolvedDestination]:
        """
        Resolve an arbitrary destination string to a canonical ResolvedDestination.
        Handles structured names like 'New Delhi, National Capital Territory of Delhi, India',
        'London, England, United Kingdom', or 'Kyoto, Japan'.
        """
        if not destination or not destination.strip():
            return None

        dest_clean = destination.strip()
        cache_key = dest_clean.lower()
        now = time.time()

        # Check cache
        if cache_key in self._cache:
            ts, cached = self._cache[cache_key]
            if now - ts < self._CACHE_TTL:
                return cached

        async with httpx.AsyncClient(headers={"User-Agent": self.USER_AGENT}) as client:
            # 1. Try Nominatim with address details and full structured query
            res = await self._resolve_nominatim(dest_clean, client)
            if res:
                self._cache[cache_key] = (now, res)
                return res

            # 2. Try Open-Meteo Geocoding as fast, resilient fallback
            res = await self._resolve_open_meteo(dest_clean, client)
            if res:
                self._cache[cache_key] = (now, res)
                return res

        logger.warning("All geocoders failed to resolve destination '%s'", destination)
        return None

    async def _resolve_nominatim(self, destination: str, client: httpx.AsyncClient) -> Optional[ResolvedDestination]:
        """Query Nominatim with full query string and extract structured metadata."""
        await self._rate_limit_nominatim()
        params = {
            "q": destination,
            "format": "json",
            "limit": "1",
            "addressdetails": "1",
        }
        try:
            resp = await client.get(self.NOMINATIM_URL, params=params, timeout=5.0)
            if resp.status_code == 200:
                items = resp.json()
                if items and isinstance(items, list):
                    item = items[0]
                    lat = float(item["lat"])
                    lon = float(item["lon"])
                    addr = item.get("address", {})
                    
                    city = (
                        addr.get("city")
                        or addr.get("town")
                        or addr.get("municipality")
                        or addr.get("village")
                        or addr.get("suburb")
                        or destination.split(",")[0].strip()
                    )
                    region = addr.get("state") or addr.get("province") or addr.get("county")
                    country = addr.get("country")
                    country_code = addr.get("country_code", "").lower()
                    display_name = item.get("display_name", destination)
                    
                    # Bounding box: Nominatim returns [south, north, west, east] strings
                    bbox_raw = item.get("boundingbox")
                    bbox = None
                    if bbox_raw and len(bbox_raw) == 4:
                        try:
                            s, n, w, e = float(bbox_raw[0]), float(bbox_raw[1]), float(bbox_raw[2]), float(bbox_raw[3])
                            # Clamp to ~7km if the returned bbox is too vast (e.g. state level)
                            s = max(s, lat - 0.05)
                            n = min(n, lat + 0.05)
                            w = max(w, lon - 0.06)
                            e = min(e, lon + 0.06)
                            bbox = (s, w, n, e)
                        except (ValueError, TypeError):
                            bbox = None

                    if not bbox:
                        bbox = (lat - 0.05, lon - 0.06, lat + 0.05, lon + 0.06)

                    stable_id = f"osm:{item.get('osm_type', 'node')}:{item.get('osm_id', item.get('place_id', ''))}"

                    return ResolvedDestination(
                        query=destination,
                        canonical_name=display_name,
                        city=city,
                        region=region,
                        country=country,
                        country_code=country_code,
                        latitude=lat,
                        longitude=lon,
                        bounding_box=bbox,
                        stable_id=stable_id,
                        confidence=0.95,
                    )
        except Exception as exc:
            logger.warning("Nominatim request error for '%s': %s", destination, exc)
        return None

    async def _resolve_open_meteo(self, destination: str, client: httpx.AsyncClient) -> Optional[ResolvedDestination]:
        """Query Open-Meteo Geocoding API with primary city name and filter by region/country."""
        parts = [p.strip() for p in destination.split(",") if p.strip()]
        city_token = parts[0]
        params = {
            "name": city_token,
            "count": "5",
            "language": "en",
            "format": "json",
        }
        try:
            resp = await client.get(self.OPEN_METEO_URL, params=params, timeout=4.0)
            if resp.status_code == 200:
                data = resp.json()
                results = data.get("results", [])
                if not results:
                    return None

                # Disambiguation: match state/country if specified in parts
                best = results[0]
                if len(parts) > 1:
                    qualifiers = [p.lower() for p in parts[1:]]
                    for r in results:
                        r_country = (r.get("country") or "").lower()
                        r_admin = (r.get("admin1") or "").lower()
                        r_code = (r.get("country_code") or "").lower()
                        if any(q in r_country or q in r_admin or q == r_code for q in qualifiers):
                            best = r
                            break

                lat = float(best["latitude"])
                lon = float(best["longitude"])
                city = best.get("name", city_token)
                region = best.get("admin1")
                country = best.get("country")
                country_code = (best.get("country_code") or "").lower()
                canonical_parts = [p for p in [city, region, country] if p]
                canonical_name = ", ".join(canonical_parts) if canonical_parts else destination

                bbox = (lat - 0.05, lon - 0.06, lat + 0.05, lon + 0.06)
                stable_id = f"openmeteo:{best.get('id', '')}"

                return ResolvedDestination(
                    query=destination,
                    canonical_name=canonical_name,
                    city=city,
                    region=region,
                    country=country,
                    country_code=country_code,
                    latitude=lat,
                    longitude=lon,
                    bounding_box=bbox,
                    stable_id=stable_id,
                    confidence=0.85,
                )
        except Exception as exc:
            logger.warning("Open-Meteo geocoding error for '%s': %s", destination, exc)
        return None


# Global singleton
_GEOCODER = UniversalDestinationGeocoder()


def get_geocoder() -> UniversalDestinationGeocoder:
    """Return the global UniversalDestinationGeocoder instance."""
    return _GEOCODER

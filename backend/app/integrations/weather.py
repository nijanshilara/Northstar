"""
weather.py — Open-Meteo integration (free, no API key required).

Open-Meteo provides:
  - Worldwide geocoding for cities, towns, villages, and regions
  - 7-day hourly and daily weather forecasts (temperature, precipitation, wind, UV)
  - Current condition updates with WMO weather interpretation codes

This integration:
  1. Geocodes query strings to worldwide destinations using Open-Meteo's geocoding API.
  2. Disambiguates cities with identical names using country and state/region qualifiers (e.g. "Paris, TX", "London, UK").
  3. Validates geographic coordinates to prevent provider errors.
  4. Resolves exact coordinates (latitude, longitude, timezone, administrative region).
  5. Fetches live current weather, 24-hour hourly trend, and 7-day daily forecast in destination local time.
  6. Implements 10-minute caching with graceful stale-data fallback if live fetch fails.
  7. Returns clearly-labelled forecast data with timestamps, cached status, and stale-data flags.
"""

from __future__ import annotations

import logging
import time
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any

import httpx

logger = logging.getLogger(__name__)

GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search"
FORECAST_URL = "https://api.open-meteo.com/v1/forecast"

# In-memory forecast cache (10-minute fresh TTL)
_FORECAST_CACHE: Dict[str, tuple[float, dict]] = {}
CACHE_TTL_SECONDS = 600

# Country and regional aliases to support ambiguous queries (e.g. "London, UK", "Paris, TX")
COUNTRY_ALIASES: dict[str, set[str]] = {
    "uk": {"gb", "gbr", "united kingdom", "great britain", "england", "scotland", "wales", "northern ireland", "uk"},
    "united kingdom": {"gb", "gbr", "united kingdom", "great britain", "england", "scotland", "wales", "northern ireland", "uk"},
    "great britain": {"gb", "gbr", "united kingdom", "great britain", "england", "scotland", "wales", "northern ireland", "uk"},
    "england": {"gb", "gbr", "united kingdom", "great britain", "england"},
    "scotland": {"gb", "gbr", "united kingdom", "great britain", "scotland"},
    "wales": {"gb", "gbr", "united kingdom", "great britain", "wales"},
    "us": {"us", "usa", "united states", "united states of america", "america"},
    "usa": {"us", "usa", "united states", "united states of america", "america"},
    "united states": {"us", "usa", "united states", "united states of america", "america"},
    "uae": {"ae", "are", "united arab emirates", "uae", "dubai", "abu dhabi"},
    "united arab emirates": {"ae", "are", "united arab emirates", "uae", "dubai", "abu dhabi"},
    "nz": {"nz", "nzl", "new zealand"},
    "new zealand": {"nz", "nzl", "new zealand"},
    "in": {"in", "ind", "india"},
    "india": {"in", "ind", "india"},
    "fr": {"fr", "fra", "france"},
    "france": {"fr", "fra", "france"},
    "de": {"de", "deu", "germany", "deutschland"},
    "germany": {"de", "deu", "germany", "deutschland"},
    "jp": {"jp", "jpn", "japan"},
    "japan": {"jp", "jpn", "japan"},
    "ca": {"ca", "can", "canada"},
    "canada": {"ca", "can", "canada"},
    "au": {"au", "aus", "australia"},
    "australia": {"au", "aus", "australia"},
    "es": {"es", "esp", "spain", "espana"},
    "spain": {"es", "esp", "spain", "espana"},
    "it": {"it", "ita", "italy", "italia"},
    "italy": {"it", "ita", "italy", "italia"},
    "pk": {"pk", "pak", "pakistan"},
    "pakistan": {"pk", "pak", "pakistan"},
}

US_STATE_ABBR: dict[str, str] = {
    "al": "alabama", "ak": "alaska", "az": "arizona", "ar": "arkansas", "ca": "california",
    "co": "colorado", "ct": "connecticut", "de": "delaware", "fl": "florida", "ga": "georgia",
    "hi": "hawaii", "id": "idaho", "il": "illinois", "in": "indiana", "ia": "iowa",
    "ks": "kansas", "ky": "kentucky", "la": "louisiana", "me": "maine", "md": "maryland",
    "ma": "massachusetts", "mi": "michigan", "mn": "minnesota", "ms": "mississippi",
    "mo": "missouri", "mt": "montana", "ne": "nebraska", "nv": "nevada", "nh": "new hampshire",
    "nj": "new jersey", "nm": "new mexico", "ny": "new york", "nc": "north carolina",
    "nd": "north dakota", "oh": "ohio", "ok": "oklahoma", "or": "oregon", "pa": "pennsylvania",
    "ri": "rhode island", "sc": "south carolina", "sd": "south dakota", "tn": "tennessee",
    "tx": "texas", "ut": "utah", "vt": "vermont", "va": "virginia", "wa": "washington",
    "wv": "west virginia", "wi": "wisconsin", "wy": "wyoming", "dc": "district of columbia",
}

# WMO Weather Interpretation Codes → human-readable label + emoji
WMO_CODES: dict[int, tuple[str, str]] = {
    0: ("Clear sky", "☀️"),
    1: ("Mainly clear", "🌤️"),
    2: ("Partly cloudy", "⛅"),
    3: ("Overcast", "☁️"),
    45: ("Foggy", "🌫️"),
    48: ("Icy fog", "🌫️"),
    51: ("Light drizzle", "🌦️"),
    53: ("Moderate drizzle", "🌦️"),
    55: ("Dense drizzle", "🌧️"),
    61: ("Slight rain", "🌧️"),
    63: ("Moderate rain", "🌧️"),
    65: ("Heavy rain", "🌧️"),
    71: ("Slight snow", "🌨️"),
    73: ("Moderate snow", "❄️"),
    75: ("Heavy snow", "❄️"),
    77: ("Snow grains", "🌨️"),
    80: ("Slight showers", "🌦️"),
    81: ("Moderate showers", "🌧️"),
    82: ("Violent showers", "⛈️"),
    85: ("Snow showers", "🌨️"),
    86: ("Heavy snow showers", "❄️"),
    95: ("Thunderstorm", "⛈️"),
    96: ("Thunderstorm w/ hail", "⛈️"),
    99: ("Thunderstorm w/ heavy hail", "⛈️"),
}


def _wmo_label(code: int) -> tuple[str, str]:
    return WMO_CODES.get(code, ("Unknown", "🌡️"))


def validate_coordinates(lat: Any, lon: Any) -> tuple[bool, Optional[str]]:
    """Validate latitude (-90 to 90) and longitude (-180 to 180)."""
    if lat is None or lon is None:
        return False, "Both latitude and longitude are required."
    try:
        lat_f = float(lat)
        lon_f = float(lon)
        import math
        if math.isnan(lat_f) or math.isinf(lat_f) or math.isnan(lon_f) or math.isinf(lon_f):
            return False, "Coordinates cannot be NaN or infinite."
        if not (-90.0 <= lat_f <= 90.0):
            return False, f"Latitude {lat_f} is out of range. Must be between -90.0 and 90.0."
        if not (-180.0 <= lon_f <= 180.0):
            return False, f"Longitude {lon_f} is out of range. Must be between -180.0 and 180.0."
        return True, None
    except (ValueError, TypeError):
        return False, "Latitude and longitude must be valid floating point numbers."


def _matches_qualifier(q: str, c_name: str, c_code: str, a1: str, a2: str) -> bool:
    """Check if a location's metadata matches a user-specified qualifier (e.g. 'UK', 'Texas', 'FR')."""
    # Direct substring or exact match
    if q in c_name or q == c_code or q in a1 or q in a2:
        return True
    # Check country aliases
    if q in COUNTRY_ALIASES:
        alias_set = COUNTRY_ALIASES[q]
        if c_code in alias_set or any(a in c_name for a in alias_set) or any(a in a1 for a in alias_set):
            return True
    # Check US state abbreviation
    if q in US_STATE_ABBR:
        full_state = US_STATE_ABBR[q]
        if full_state in a1 or full_state in a2:
            return True
    return False


async def geocode_worldwide(query: str, count: int = 8) -> List[Dict[str, Any]]:
    """
    Search worldwide destinations using Open-Meteo's Geocoding API.
    Returns places with name, region/admin1, country, lat, lon, and timezone.
    Disambiguates locations using country/region qualifiers (e.g., "Paris, TX", "London, UK").
    """
    cleaned = (query or "").strip()
    if not cleaned or len(cleaned) < 2:
        return []

    # Handle regional aliases
    search_term = cleaned
    forced_name = None
    cleaned_lower = cleaned.lower()
    if cleaned_lower in ("goa", "goa, india", "goa, goa, india") or cleaned_lower.startswith("goa,"):
        search_term = "Panjim"
        forced_name = "Goa"
    elif cleaned_lower in ("kerala", "kerala backwaters", "kerala, india") or cleaned_lower.startswith("kerala,"):
        search_term = "Alappuzha"
        forced_name = "Kerala Backwaters"

    qualifiers: list[str] = []
    if "," in search_term:
        parts = [p.strip() for p in search_term.split(",") if p.strip()]
        if len(parts) >= 2:
            search_term = parts[0]
            qualifiers = [p.lower() for p in parts[1:]]

    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            r = await client.get(GEOCODE_URL, params={
                "name": search_term,
                "count": min(count * 3, 30),
                "language": "en",
                "format": "json",
            })
            r.raise_for_status()
            data = r.json()
        raw_results = data.get("results") or []
        if not raw_results:
            return []

        out: List[Dict[str, Any]] = []
        for item in raw_results:
            c_name = (item.get("country") or "").lower()
            c_code = (item.get("country_code") or "").lower()
            a1 = (item.get("admin1") or "").lower()
            a2 = (item.get("admin2") or "").lower()

            # If user provided qualifiers (e.g. "TX", "UK", "France", "Telangana"), enforce match
            if qualifiers:
                if not all(_matches_qualifier(q, c_name, c_code, a1, a2) for q in qualifiers):
                    continue

            name = forced_name if (forced_name and len(out) == 0) else item.get("name", cleaned)
            out.append({
                "name": name,
                "region": item.get("admin1") or item.get("admin2") or "",
                "country": item.get("country") or "",
                "latitude": item.get("latitude"),
                "longitude": item.get("longitude"),
                "timezone": item.get("timezone") or "",
                "category": item.get("feature_code") or "City",
                "emoji": "📍",
            })
            if len(out) >= count:
                break

        return out
    except Exception as exc:
        logger.warning("Geocoding failed for '%s': %s", query, exc)
        return []


async def geocode_city(city: str) -> Optional[dict]:
    """Single-location helper for destination name resolution."""
    results = await geocode_worldwide(city, count=1)
    if results:
        r = results[0]
        return {
            "lat": r["latitude"],
            "lon": r["longitude"],
            "name": r["name"],
            "country": r["country"],
            "admin1": r["region"],
            "timezone": r["timezone"],
        }
    return None


async def fetch_forecast(
    city: Optional[str] = None,
    lat: Optional[float] = None,
    lon: Optional[float] = None,
) -> dict:
    """
    Fetch current conditions, hourly forecasts, and 7-day daily forecast using Open-Meteo.
    Supports either explicit coordinates (lat, lon) or city name resolution.
    Implements 10-minute caching with stale-data fallback on network failure.
    """
    resolved_lat = lat
    resolved_lon = lon
    resolved_name = city or "Destination"
    resolved_admin1 = ""
    resolved_country = ""
    resolved_tz = "auto"

    # 1. Validate coordinates if passed directly
    if lat is not None or lon is not None:
        is_valid, coord_err = validate_coordinates(lat, lon)
        if not is_valid:
            return {
                "error": coord_err,
                "city_name": city or "Unknown",
                "days": [],
                "cached": False,
                "is_stale": False,
            }
        resolved_lat = float(lat)  # type: ignore[arg-type]
        resolved_lon = float(lon)  # type: ignore[arg-type]

    # 2. Resolve city name if coordinates were not provided
    if resolved_lat is None or resolved_lon is None:
        if not city or not city.strip():
            return {
                "error": "City name or valid coordinates (lat, lon) are required.",
                "city_name": "Unknown",
                "days": [],
                "cached": False,
                "is_stale": False,
            }
        geo = await geocode_city(city)
        if not geo:
            return {
                "error": f"Could not find coordinates for destination '{city}'. Please verify the spelling or select a location from autocomplete.",
                "city_name": city,
                "days": [],
                "cached": False,
                "is_stale": False,
            }
        resolved_lat = geo["lat"]
        resolved_lon = geo["lon"]
        resolved_name = geo["name"]
        resolved_admin1 = geo.get("admin1", "")
        resolved_country = geo.get("country", "")
        resolved_tz = geo.get("timezone", "auto")

    # 3. Check in-memory forecast cache (10-minute TTL)
    cache_key = f"{round(resolved_lat, 3)}:{round(resolved_lon, 3)}"
    now = time.time()
    if cache_key in _FORECAST_CACHE:
        cached_time, cached_val = _FORECAST_CACHE[cache_key]
        if now - cached_time < CACHE_TTL_SECONDS:
            res = dict(cached_val)
            res["cached"] = True
            res["is_stale"] = False
            res["warning"] = None
            return res

    # 4. Request live forecast from Open-Meteo
    data = None
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.get(FORECAST_URL, params={
                "latitude": resolved_lat,
                "longitude": resolved_lon,
                "current": [
                    "temperature_2m",
                    "relative_humidity_2m",
                    "apparent_temperature",
                    "is_day",
                    "precipitation",
                    "weather_code",
                    "wind_speed_10m",
                ],
                "daily": [
                    "temperature_2m_max",
                    "temperature_2m_min",
                    "precipitation_sum",
                    "precipitation_probability_max",
                    "weather_code",
                    "weathercode",
                    "wind_speed_10m_max",
                    "windspeed_10m_max",
                    "uv_index_max",
                    "sunrise",
                    "sunset",
                ],
                "hourly": [
                    "temperature_2m",
                    "weather_code",
                    "weathercode",
                    "precipitation_probability",
                ],
                "timezone": resolved_tz if resolved_tz and resolved_tz != "auto" else "auto",
                "forecast_days": 7,
            })
            r.raise_for_status()
            data = r.json()
    except Exception as exc:
        logger.warning("Weather fetch failed for lat=%s lon=%s: %s", resolved_lat, resolved_lon, exc)

        # Fallback to stale cached data if available
        if cache_key in _FORECAST_CACHE:
            cached_time, cached_val = _FORECAST_CACHE[cache_key]
            res = dict(cached_val)
            res["cached"] = True
            res["is_stale"] = True
            fetched_time_str = cached_val.get("fetched_at", "earlier")
            res["warning"] = (
                f"Live weather update failed ({type(exc).__name__}). "
                f"Displaying cached forecast from {fetched_time_str}."
            )
            return res

        # Honest error reporting when no cached data exists
        error_message = f"Weather data temporarily unavailable from provider: {exc}"
        if isinstance(exc, httpx.TimeoutException):
            error_message = "Weather service request timed out. Please try again."
        elif isinstance(exc, httpx.HTTPStatusError) and exc.response.status_code == 429:
            error_message = "Weather provider rate limit exceeded. Please try again in a few moments."
        elif isinstance(exc, httpx.RequestError):
            error_message = "Network error connecting to weather service. Please check your internet connection."

        return {
            "error": error_message,
            "city_name": resolved_name,
            "days": [],
            "cached": False,
            "is_stale": False,
        }

    # 5. Parse Current Weather
    curr_raw = data.get("current", {}) if data else {}
    curr_code = int(curr_raw.get("weather_code", 0)) if curr_raw.get("weather_code") is not None else 0
    curr_label, curr_emoji = _wmo_label(curr_code)
    current = {
        "time": curr_raw.get("time"),
        "temperature_c": curr_raw.get("temperature_2m"),
        "apparent_temp_c": curr_raw.get("apparent_temperature"),
        "humidity_pct": curr_raw.get("relative_humidity_2m"),
        "precipitation_mm": curr_raw.get("precipitation"),
        "wind_kmh": curr_raw.get("wind_speed_10m"),
        "is_day": bool(curr_raw.get("is_day", 1)),
        "weather_code": curr_code,
        "condition": curr_label,
        "emoji": curr_emoji,
    }

    # 6. Parse Hourly Trend (next 24 hours)
    hourly_raw = data.get("hourly", {}) if data else {}
    h_times = hourly_raw.get("time", [])
    h_temps = hourly_raw.get("temperature_2m", [])
    h_codes = hourly_raw.get("weather_code") or hourly_raw.get("weathercode") or []
    h_precips = hourly_raw.get("precipitation_probability", [])
    hourly = []
    for i in range(min(24, len(h_times))):
        h_code = int(h_codes[i]) if i < len(h_codes) and h_codes[i] is not None else 0
        hl, he = _wmo_label(h_code)
        hourly.append({
            "time": h_times[i],
            "temp_c": h_temps[i] if i < len(h_temps) else None,
            "precipitation_probability": h_precips[i] if i < len(h_precips) else 0,
            "weather_code": h_code,
            "condition": hl,
            "emoji": he,
        })

    # 7. Parse Daily 7-day Forecast
    daily = data.get("daily", {}) if data else {}
    dates: list[str] = daily.get("time", [])
    temp_max: list = daily.get("temperature_2m_max", [])
    temp_min: list = daily.get("temperature_2m_min", [])
    precip: list = daily.get("precipitation_sum", [])
    precip_prob: list = daily.get("precipitation_probability_max", [])
    codes: list = daily.get("weather_code") or daily.get("weathercode") or []
    wind: list = daily.get("wind_speed_10m_max") or daily.get("windspeed_10m_max") or []
    uv: list = daily.get("uv_index_max", [])
    sunrise: list = daily.get("sunrise", [])
    sunset: list = daily.get("sunset", [])

    days = []
    for i, date_str in enumerate(dates):
        code = int(codes[i]) if i < len(codes) and codes[i] is not None else 0
        label, emoji = _wmo_label(code)
        days.append({
            "date": date_str,
            "temp_max_c": round(float(temp_max[i]), 1) if (i < len(temp_max) and temp_max[i] is not None) else None,
            "temp_min_c": round(float(temp_min[i]), 1) if (i < len(temp_min) and temp_min[i] is not None) else None,
            "precipitation_mm": round(float(precip[i]), 1) if (i < len(precip) and precip[i] is not None) else None,
            "precipitation_probability_max": round(float(precip_prob[i])) if (i < len(precip_prob) and precip_prob[i] is not None) else None,
            "wind_kmh": round(float(wind[i]), 1) if (i < len(wind) and wind[i] is not None) else None,
            "uv_index": round(float(uv[i]), 1) if (i < len(uv) and uv[i] is not None) else None,
            "weather_code": code,
            "condition": label,
            "emoji": emoji,
            "sunrise": sunrise[i] if (i < len(sunrise) and sunrise[i] is not None) else None,
            "sunset": sunset[i] if (i < len(sunset) and sunset[i] is not None) else None,
        })

    result = {
        "error": None,
        "city_name": resolved_name,
        "admin1": resolved_admin1,
        "country": resolved_country,
        "lat": resolved_lat,
        "lon": resolved_lon,
        "timezone": data.get("timezone", resolved_tz) if data else resolved_tz,
        "current": current,
        "hourly": hourly,
        "days": days,
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "cached": False,
        "is_stale": False,
        "warning": None,
        "source": "Open-Meteo (open-meteo.com)",
        "data_type": "WEATHER_FORECAST",
        "disclaimer": (
            "Numerical weather forecast data provided by Open-Meteo. "
            "Accurate current weather and 7-day projection; forecasts beyond 5 days may vary."
        ),
    }

    _FORECAST_CACHE[cache_key] = (now, result)
    return result

"""
weather.py — Weather API and Worldwide Geocoding router.

GET /api/weather?city=Goa
GET /api/weather?lat=19.076&lon=72.877&city=Mumbai
  Returns live current conditions, 24-hour hourly trend, and 7-day daily forecast using Open-Meteo.

GET /api/weather/geocoding?q=Tokyo
  Returns worldwide destination suggestions matching the query.
"""

from __future__ import annotations

from typing import Optional
from fastapi import APIRouter, Query, HTTPException
from app.integrations.weather import fetch_forecast, geocode_worldwide

router = APIRouter()


@router.get("", summary="Get current conditions and 7-day weather forecast (Open-Meteo, free)")
async def get_weather(
    city: Optional[str] = Query(None, description="City name, e.g. 'Goa' or 'Paris'"),
    lat: Optional[float] = Query(None, ge=-90.0, le=90.0, description="Latitude coordinate (-90 to 90)"),
    lon: Optional[float] = Query(None, ge=-180.0, le=180.0, description="Longitude coordinate (-180 to 180)"),
):
    """
    Fetch current weather and 7-day forecast using Open-Meteo.
    Accepts either coordinates (lat/lon) or a city name.
    """
    if (lat is not None and lon is None) or (lon is not None and lat is None):
        raise HTTPException(
            status_code=422,
            detail="Both latitude and longitude must be provided together."
        )

    if city is None and (lat is None or lon is None):
        raise HTTPException(
            status_code=422,
            detail=[{"loc": ["query", "city"], "msg": "Field required", "type": "missing"}]
        )
    return await fetch_forecast(city=city, lat=lat, lon=lon)




@router.get("/geocoding", summary="Worldwide destination geocoding autocomplete (Open-Meteo)")
async def get_geocoding(
    q: str = Query(..., min_length=1, description="Destination search query"),
    count: int = Query(8, ge=1, le=20, description="Max results"),
):
    """
    Search worldwide cities, regions, and towns via Open-Meteo geocoding.
    """
    results = await geocode_worldwide(q, count=count)
    return {"results": results}

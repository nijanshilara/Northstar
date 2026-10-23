import sys
sys.path.insert(0, "backend")

import asyncio
from app.integrations.places import get_places_provider

async def main():
    provider = get_places_provider()
    # Test an uncatalogued destination: Edinburgh, Scotland
    places = await provider.search_places("Edinburgh, Scotland", limit=8)
    print("--- EDINBURGH PLACES FOUND ---")
    for p in places:
        print(f"Name: {p.name} | Category: {p.category} | Source: {p.source} | Lat/Lon: {p.latitude},{p.longitude}")

    # Test an uncatalogued destination: Varanasi, India
    places_vns = await provider.search_places("Varanasi, India", limit=8)
    print("\n--- VARANASI PLACES FOUND ---")
    for p in places_vns:
        print(f"Name: {p.name} | Category: {p.category} | Source: {p.source} | Lat/Lon: {p.latitude},{p.longitude}")

if __name__ == "__main__":
    asyncio.run(main())

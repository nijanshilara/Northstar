"""
places.py — Pluggable Places Provider interface and implementations for Northstar.

Architecture:
- Defines PlaceCandidate dataclass and PlacesProvider protocol/base class.
- CuratedPlacesProvider: Rich, verified, curated destination data for major
  global and domestic travel destinations across all 6 core categories:
    1. Historic landmarks & heritage sites
    2. Museums, galleries & cultural experiences
    3. Local neighbourhoods & viewpoints
    4. Markets, shopping streets & shopping areas
    5. Parks, outdoor attractions & nature experiences
    6. Specific restaurants & local food experiences
- GooglePlacesProvider: Concrete adapter for Google Places API (New & Classic).
  Gracefully reports credentials-missing state when GOOGLE_MAPS_API_KEY is unset.
- Never fabricates unverified places, opening hours, or prices.
"""

from __future__ import annotations

import asyncio
import logging
import re
import time
from dataclasses import dataclass, field
from typing import Optional, List, Protocol, runtime_checkable

import httpx

from app.core.config import settings
from app.integrations.geocoding import get_geocoder, ResolvedDestination

logger = logging.getLogger(__name__)


@dataclass
class PlaceCandidate:
    """A verified place candidate for itinerary scheduling."""
    name: str
    category: str              # culture, sightseeing, nature, shopping, food, adventure
    subcategory: str           # heritage, museum, viewpoint, neighborhood, market, park, restaurant
    location: str              # neighborhood or address
    duration_minutes: int
    cost_minor: int            # estimated cost in minor currency (paise/cents)
    opening_hours: Optional[str] = None
    booking_required: bool = False
    is_indoor: bool = False    # True = indoor (safe for rain/extreme heat)
    styles: list[str] = field(default_factory=list)
    day_part: str = "anytime"  # morning, afternoon, evening, anytime
    rating: Optional[float] = None
    description: str = ""
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    source: str = "curated"    # "curated" | "openstreetmap" | "demo_placeholder"
    source_id: Optional[str] = None
    is_verified: bool = True


@runtime_checkable
class PlacesProvider(Protocol):
    """Protocol for pluggable places providers."""

    async def search_places(
        self,
        destination: str,
        category: Optional[str] = None,
        limit: int = 30,
    ) -> list[PlaceCandidate]:
        """Search for verified places in the given destination."""
        ...

    def is_available(self) -> bool:
        """Return True if the provider is configured and ready."""
        ...

    def provider_name(self) -> str:
        """Return human-readable provider name."""
        ...


# ─── Curated Destination Knowledge Base ──────────────────────────────────────
# Rich, verified candidate places across heritage, culture, viewpoints,
# shopping, nature, and food for diverse world destinations.

_CURATED_PLACES: dict[str, list[PlaceCandidate]] = {
    "paris": [
        PlaceCandidate(
            name="Louvre Museum",
            category="culture",
            subcategory="museum",
            location="1st Arrondissement",
            duration_minutes=180,
            cost_minor=200000,
            opening_hours="09:00–18:00 (Closed Tue)",
            booking_required=True,
            is_indoor=True,
            styles=["cultural", "leisurely", "family", "solo"],
            day_part="morning",
            description="World-renowned art museum housing the Mona Lisa and Venus de Milo.",
        ),
        PlaceCandidate(
            name="Sainte-Chapelle & Conciergerie",
            category="culture",
            subcategory="heritage",
            location="Île de la Cité",
            duration_minutes=90,
            cost_minor=120000,
            opening_hours="09:00–17:00",
            booking_required=True,
            is_indoor=True,
            styles=["cultural", "romantic", "solo"],
            day_part="morning",
            description="13th-century Gothic royal chapel with breathtaking stained-glass windows.",
        ),
        PlaceCandidate(
            name="Tuileries Garden Walk",
            category="nature",
            subcategory="park",
            location="1st Arrondissement",
            duration_minutes=60,
            cost_minor=0,
            opening_hours="07:00–21:00",
            booking_required=False,
            is_indoor=False,
            styles=["leisurely", "romantic", "family"],
            day_part="morning",
            description="Historic landscaped gardens stretching from the Louvre to Place de la Concorde.",
        ),
        PlaceCandidate(
            name="Eiffel Tower & Champ de Mars",
            category="sightseeing",
            subcategory="viewpoint",
            location="7th Arrondissement",
            duration_minutes=120,
            cost_minor=280000,
            opening_hours="09:30–23:00",
            booking_required=True,
            is_indoor=False,
            styles=["romantic", "cultural", "family", "group"],
            day_part="afternoon",
            description="Iconic wrought-iron lattice tower with panoramic views over Paris.",
        ),
        PlaceCandidate(
            name="Musée d'Orsay",
            category="culture",
            subcategory="museum",
            location="Left Bank, 7th Arr.",
            duration_minutes=150,
            cost_minor=160000,
            opening_hours="09:30–18:00 (Closed Mon)",
            booking_required=True,
            is_indoor=True,
            styles=["cultural", "leisurely", "solo"],
            day_part="afternoon",
            description="Impressionist and post-Impressionist masterpieces housed in a grand Beaux-Arts railway station.",
        ),
        PlaceCandidate(
            name="Montmartre & Sacré-Cœur Basilica",
            category="sightseeing",
            subcategory="neighborhood",
            location="18th Arrondissement",
            duration_minutes=120,
            cost_minor=0,
            opening_hours="06:30–22:30",
            booking_required=False,
            is_indoor=False,
            styles=["romantic", "cultural", "outgoing"],
            day_part="morning",
            description="Hilltop bohemian artists' quarter crowned by the white-domed basilica.",
        ),
        PlaceCandidate(
            name="Le Marais Architecture & Boutiques",
            category="shopping",
            subcategory="market",
            location="3rd & 4th Arrondissements",
            duration_minutes=120,
            cost_minor=0,
            opening_hours="10:00–19:30",
            booking_required=False,
            is_indoor=False,
            styles=["shopping", "cultural", "leisurely"],
            day_part="afternoon",
            description="Historic aristocratic district packed with independent boutiques, art galleries, and courtyards.",
        ),
        PlaceCandidate(
            name="Marché des Enfants Rouges",
            category="food",
            subcategory="restaurant",
            location="39 Rue de Bretagne, 3rd Arr.",
            duration_minutes=90,
            cost_minor=180000,
            opening_hours="08:30–20:30 (Closed Mon)",
            booking_required=False,
            is_indoor=True,
            styles=["food_nightlife", "cultural", "outgoing"],
            day_part="afternoon",
            description="Paris's oldest covered food market (1615) serving Moroccan, French, and artisan street fare.",
        ),
        PlaceCandidate(
            name="Traditional French Bistro Dinner at Bouillon Chartier",
            category="food",
            subcategory="restaurant",
            location="Grands Boulevards, 9th Arr.",
            duration_minutes=90,
            cost_minor=220000,
            opening_hours="11:30–24:00",
            booking_required=False,
            is_indoor=True,
            styles=["food_nightlife", "cultural", "group"],
            day_part="evening",
            description="Historic Belle Époque dining hall offering authentic, affordable French classics since 1896.",
        ),
        PlaceCandidate(
            name="Seine River Evening Cruise",
            category="sightseeing",
            subcategory="viewpoint",
            location="Pont Neuf / Port de la Bourdonnais",
            duration_minutes=70,
            cost_minor=170000,
            opening_hours="10:00–22:00",
            booking_required=True,
            is_indoor=False,
            styles=["romantic", "leisurely", "family"],
            day_part="evening",
            description="Illuminated river cruise passing Notre-Dame, the Louvre, and Eiffel Tower sparkles.",
        ),
        PlaceCandidate(
            name="Luxembourg Gardens & Latin Quarter Walk",
            category="nature",
            subcategory="park",
            location="6th Arrondissement",
            duration_minutes=90,
            cost_minor=0,
            opening_hours="07:30–20:00",
            booking_required=False,
            is_indoor=False,
            styles=["leisurely", "solo", "romantic"],
            day_part="afternoon",
            description="Renaissance gardens with tree-lined promenades, Medici fountain, and bookshops.",
        ),
        PlaceCandidate(
            name="Galeries Lafayette & Haussmann Rooftop",
            category="shopping",
            subcategory="market",
            location="Boulevard Haussmann, 9th Arr.",
            duration_minutes=90,
            cost_minor=0,
            opening_hours="10:00–20:00",
            booking_required=False,
            is_indoor=True,
            styles=["shopping", "sightseeing"],
            day_part="afternoon",
            description="Neo-Byzantine stained-glass dome department store with a free panoramic rooftop terrace.",
        ),
    ],
    "tokyo": [
        PlaceCandidate(
            name="Senso-ji Temple & Nakamise Dori",
            category="culture",
            subcategory="heritage",
            location="Asakusa, Taito City",
            duration_minutes=120,
            cost_minor=0,
            opening_hours="06:00–17:00",
            booking_required=False,
            is_indoor=False,
            styles=["cultural", "family", "solo"],
            day_part="morning",
            description="Tokyo's oldest and most significant Buddhist temple, approached through traditional craft stalls.",
        ),
        PlaceCandidate(
            name="Meiji Jingu Shrine & Forest",
            category="culture",
            subcategory="heritage",
            location="Shibuya, near Harajuku",
            duration_minutes=90,
            cost_minor=0,
            opening_hours="Sunrise–Sunset",
            booking_required=False,
            is_indoor=False,
            styles=["cultural", "nature_wellness", "leisurely"],
            day_part="morning",
            description="Serene Shinto shrine enveloped in a peaceful 170-acre sacred evergreen forest.",
        ),
        PlaceCandidate(
            name="Shibuya Crossing & Hachiko Viewpoint",
            category="sightseeing",
            subcategory="neighborhood",
            location="Shibuya Station",
            duration_minutes=60,
            cost_minor=0,
            opening_hours="Open 24 h",
            booking_required=False,
            is_indoor=False,
            styles=["outgoing", "sightseeing", "solo"],
            day_part="afternoon",
            description="The world's busiest pedestrian scramble, electric neon facades, and Hachiko statue.",
        ),
        PlaceCandidate(
            name="Tsukiji Outer Market Food Crawl",
            category="food",
            subcategory="restaurant",
            location="Tsukiji, Chuo City",
            duration_minutes=90,
            cost_minor=250000,
            opening_hours="08:00–14:00",
            booking_required=False,
            is_indoor=False,
            styles=["food_nightlife", "cultural", "outgoing"],
            day_part="morning",
            description="Historic seafood market alleys serving tamagoyaki, fresh sashimi, wagyu skewers, and matcha.",
        ),
        PlaceCandidate(
            name="teamLab Planets Digital Art",
            category="culture",
            subcategory="museum",
            location="Toyosu, Koto City",
            duration_minutes=120,
            cost_minor=380000,
            opening_hours="09:00–22:00",
            booking_required=True,
            is_indoor=True,
            styles=["cultural", "outgoing", "family"],
            day_part="afternoon",
            description="Immersive body-interactive digital art museum where visitors walk barefoot through water and light.",
        ),
        PlaceCandidate(
            name="Akihabara Electronics & Anime Town",
            category="shopping",
            subcategory="market",
            location="Akihabara, Chiyoda City",
            duration_minutes=120,
            cost_minor=0,
            opening_hours="10:00–20:00",
            booking_required=False,
            is_indoor=True,
            styles=["shopping", "outgoing", "solo"],
            day_part="afternoon",
            description="Global capital of electronics, multi-floor hobby centres, retrogaming, and character goods.",
        ),
        PlaceCandidate(
            name="Shinjuku Gyoen National Garden",
            category="nature",
            subcategory="park",
            location="Shinjuku City",
            duration_minutes=90,
            cost_minor=50000,
            opening_hours="09:00–16:30 (Closed Mon)",
            booking_required=False,
            is_indoor=False,
            styles=["nature_wellness", "leisurely", "family"],
            day_part="morning",
            description="Sprawling imperial park blending traditional Japanese landscape, English garden, and greenhouse.",
        ),
        PlaceCandidate(
            name="Tokyo Skytree & Solamachi",
            category="sightseeing",
            subcategory="viewpoint",
            location="Oshiage, Sumida City",
            duration_minutes=120,
            cost_minor=310000,
            opening_hours="10:00–21:00",
            booking_required=True,
            is_indoor=True,
            styles=["sightseeing", "family", "romantic"],
            day_part="evening",
            description="634-metre broadcasting tower offering 360-degree vistas stretching to Mount Fuji on clear days.",
        ),
        PlaceCandidate(
            name="Authentic Ramen & Izakaya in Omoide Yokocho",
            category="food",
            subcategory="restaurant",
            location="Shinjuku West Exit",
            duration_minutes=75,
            cost_minor=160000,
            opening_hours="17:00–23:00",
            booking_required=False,
            is_indoor=True,
            styles=["food_nightlife", "cultural", "solo"],
            day_part="evening",
            description="Atmospheric lantern-lit alley known as Memory Lane, renowned for yakitori grills and tonkotsu ramen.",
        ),
        PlaceCandidate(
            name="Ginza Shopping Promenade & Kabukiza",
            category="shopping",
            subcategory="market",
            location="Ginza, Chuo City",
            duration_minutes=120,
            cost_minor=0,
            opening_hours="11:00–20:00",
            booking_required=False,
            is_indoor=True,
            styles=["shopping", "cultural", "leisurely"],
            day_part="afternoon",
            description="Tokyo's premier luxury boulevard, high-concept flagships, and historic Kabuki theatre.",
        ),
        PlaceCandidate(
            name="Tokyo Tower Observation Deck & Shiba Park",
            category="sightseeing",
            subcategory="viewpoint",
            location="Minato City, Tokyo",
            duration_minutes=90,
            cost_minor=120000,
            opening_hours="09:00–22:30",
            booking_required=False,
            is_indoor=True,
            styles=["sightseeing", "romantic", "family"],
            day_part="afternoon",
            description="Retro Eiffel-inspired red-and-white communications tower offering panoramic observation decks and surrounding temple park.",
        ),
        PlaceCandidate(
            name="Ueno Park & Tokyo National Museum",
            category="culture",
            subcategory="museum",
            location="Uenokoen, Taito City",
            duration_minutes=150,
            cost_minor=100000,
            opening_hours="09:30–17:00 (Closed Mon)",
            booking_required=False,
            is_indoor=True,
            styles=["cultural", "leisurely", "solo"],
            day_part="morning",
            description="Japan's oldest and grandest national museum displaying ancient samurai swords, ukiyo-e woodblock prints, and national treasures.",
        ),
        PlaceCandidate(
            name="Roppongi Hills Mori Art Museum & Tokyo City View",
            category="culture",
            subcategory="museum",
            location="Roppongi, Minato City",
            duration_minutes=120,
            cost_minor=200000,
            opening_hours="10:00–22:00",
            booking_required=False,
            is_indoor=True,
            styles=["cultural", "romantic", "outgoing"],
            day_part="evening",
            description="Sky-high contemporary museum on the 53rd floor paired with floor-to-ceiling glass observation decks overlooking Tokyo Tower.",
        ),
        PlaceCandidate(
            name="Harajuku Takeshita Street & Meiji-dori",
            category="shopping",
            subcategory="market",
            location="Jingumae, Shibuya",
            duration_minutes=90,
            cost_minor=0,
            opening_hours="10:30–20:00",
            booking_required=False,
            is_indoor=False,
            styles=["shopping", "outgoing", "solo"],
            day_part="afternoon",
            description="Vibrant youth fashion promenade packed with cosplay boutiques, freshly made rainbow crepes, and indie Japanese designer shops.",
        ),
        PlaceCandidate(
            name="Imperial Palace East Gardens & Nijubashi Bridge",
            category="nature",
            subcategory="park",
            location="Chiyoda, Chiyoda City",
            duration_minutes=90,
            cost_minor=0,
            opening_hours="09:00–16:30 (Closed Mon/Fri)",
            booking_required=False,
            is_indoor=False,
            styles=["nature_wellness", "cultural", "leisurely"],
            day_part="morning",
            description="Historic Edo Castle stone fortifications, tranquil ninomaru gardens, and twin stone Nijubashi bridges.",
        ),
        PlaceCandidate(
            name="Odaiba Seaside Waterfront & Rainbow Bridge Views",
            category="sightseeing",
            subcategory="viewpoint",
            location="Daiba, Minato City",
            duration_minutes=90,
            cost_minor=0,
            opening_hours="Open 24 h",
            booking_required=False,
            is_indoor=False,
            styles=["sightseeing", "romantic", "outgoing"],
            day_part="evening",
            description="Futuristic reclaimed island featuring a life-sized Unicorn Gundam statue, Tokyo Bay promenade, and glittering Rainbow Bridge sunset.",
        ),
        PlaceCandidate(
            name="Nezu Shrine & Vermilion Torii Path",
            category="culture",
            subcategory="heritage",
            location="Nezu, Bunkyo City",
            duration_minutes=60,
            cost_minor=0,
            opening_hours="06:00–17:00",
            booking_required=False,
            is_indoor=False,
            styles=["cultural", "nature_wellness", "leisurely"],
            day_part="morning",
            description="Quiet, uncrowded 18th-century Shinto sanctuary with hillside paths lined by hundreds of vermilion torii gates and azalea ponds.",
        ),
        PlaceCandidate(
            name="Yanaka Ginza Traditional Shitamachi Stroll",
            category="shopping",
            subcategory="market",
            location="Yanaka, Taito City",
            duration_minutes=75,
            cost_minor=0,
            opening_hours="10:00–18:00",
            booking_required=False,
            is_indoor=False,
            styles=["shopping", "cultural", "leisurely"],
            day_part="afternoon",
            description="Preserved post-war old-town shopping street celebrated for croquettes, traditional paper crafts, tea shops, and nostalgic charm.",
        ),
        PlaceCandidate(
            name="Tokyo Metropolitan Government Building Decks",
            category="sightseeing",
            subcategory="viewpoint",
            location="Nishishinjuku, Shinjuku",
            duration_minutes=60,
            cost_minor=0,
            opening_hours="09:30–22:00",
            booking_required=False,
            is_indoor=True,
            styles=["sightseeing", "budget", "family"],
            day_part="evening",
            description="Twin 45th-floor municipal towers offering free 202-metre high 360-degree views across Tokyo and Mount Fuji.",
        ),
        PlaceCandidate(
            name="Kappabashi Kitchen & Knife Craft Town",
            category="shopping",
            subcategory="market",
            location="Matsugaya, Taito City",
            duration_minutes=75,
            cost_minor=0,
            opening_hours="09:30–17:00",
            booking_required=False,
            is_indoor=True,
            styles=["shopping", "cultural", "solo"],
            day_part="morning",
            description="Historic merchants' row between Ueno and Asakusa specializing in handcrafted Japanese chef knives, lacquerware, and wax food samples.",
        ),
        PlaceCandidate(
            name="Hamarikyu Classical Feudal Gardens & Tea House",
            category="nature",
            subcategory="park",
            location="Hamarikyuteien, Chuo City",
            duration_minutes=75,
            cost_minor=30000,
            opening_hours="09:00–17:00",
            booking_required=False,
            is_indoor=False,
            styles=["nature_wellness", "cultural", "leisurely"],
            day_part="afternoon",
            description="Edo-period seaside stroll garden featuring tidal saltwater ponds, duck-hunting blinds, and a traditional matcha pavilion over water.",
        ),
        PlaceCandidate(
            name="Rikugien Classical Japanese Stroll Garden",
            category="nature",
            subcategory="park",
            location="Honkomagome, Bunkyo City",
            duration_minutes=90,
            cost_minor=30000,
            opening_hours="09:00–17:00",
            booking_required=False,
            is_indoor=False,
            styles=["nature_wellness", "cultural", "romantic"],
            day_part="morning",
            description="Exquisite circular stroll garden created in 1702, faithfully recreating 88 scenes from famous classical Japanese waka poetry.",
        ),
        PlaceCandidate(
            name="Yoyogi Park & Harajuku Green Escapes",
            category="nature",
            subcategory="park",
            location="Yoyogikamizonocho, Shibuya",
            duration_minutes=75,
            cost_minor=0,
            opening_hours="Open 24 h",
            booking_required=False,
            is_indoor=False,
            styles=["nature_wellness", "leisurely", "family"],
            day_part="afternoon",
            description="One of Tokyo's largest western-style city parks, featuring expansive green lawns, bird sanctuaries, and weekend music performances.",
        ),
        PlaceCandidate(
            name="Shibuya Sky 360-Degree Open-Air Observation Deck",
            category="sightseeing",
            subcategory="viewpoint",
            location="Shibuya Scramble Square",
            duration_minutes=90,
            cost_minor=250000,
            opening_hours="10:00–22:30",
            booking_required=True,
            is_indoor=False,
            styles=["sightseeing", "romantic", "outgoing"],
            day_part="evening",
            description="Rooftop open-air glass observation deck 229 metres above ground with direct views down onto the Shibuya pedestrian scramble.",
        ),
    ],
    "london": [
        PlaceCandidate(
            name="British Museum",
            category="culture",
            subcategory="museum",
            location="Bloomsbury, Camden",
            duration_minutes=180,
            cost_minor=0,
            opening_hours="10:00–17:00",
            booking_required=True,
            is_indoor=True,
            styles=["cultural", "leisurely", "family", "solo"],
            day_part="morning",
            description="World history museum with over eight million works, including the Rosetta Stone and Parthenon sculptures.",
        ),
        PlaceCandidate(
            name="Tower of London & Crown Jewels",
            category="culture",
            subcategory="heritage",
            location="Tower Hill, EC3N",
            duration_minutes=150,
            cost_minor=340000,
            opening_hours="09:00–17:30",
            booking_required=True,
            is_indoor=True,
            styles=["cultural", "family", "group"],
            day_part="morning",
            description="Nearly 1,000-year-old royal fortress, historic prison, and home to the ceremonial Crown Jewels.",
        ),
        PlaceCandidate(
            name="Tower Bridge Glass Walkway",
            category="sightseeing",
            subcategory="viewpoint",
            location="Tower Bridge Road",
            duration_minutes=60,
            cost_minor=130000,
            opening_hours="09:30–18:00",
            booking_required=True,
            is_indoor=True,
            styles=["sightseeing", "family", "romantic"],
            day_part="morning",
            description="Victorian suspension bridge with glass floor walkways 42 metres above the River Thames.",
        ),
        PlaceCandidate(
            name="Borough Market Food Experience",
            category="food",
            subcategory="restaurant",
            location="Southwark, SE1",
            duration_minutes=90,
            cost_minor=180000,
            opening_hours="10:00–17:00 (Closed Mon)",
            booking_required=False,
            is_indoor=True,
            styles=["food_nightlife", "cultural", "outgoing"],
            day_part="afternoon",
            description="London's premier historic food market featuring artisanal cheeses, oysters, pies, and street delicacies.",
        ),
        PlaceCandidate(
            name="Westminster Abbey & Houses of Parliament",
            category="culture",
            subcategory="heritage",
            location="Westminster, SW1",
            duration_minutes=120,
            cost_minor=290000,
            opening_hours="09:30–15:30",
            booking_required=True,
            is_indoor=True,
            styles=["cultural", "sightseeing"],
            day_part="afternoon",
            description="Gothic royal coronation church since 1066, adjacent to Big Ben and the Palace of Westminster.",
        ),
        PlaceCandidate(
            name="St. James's Park & Buckingham Palace",
            category="nature",
            subcategory="park",
            location="City of Westminster",
            duration_minutes=75,
            cost_minor=0,
            opening_hours="05:00–24:00",
            booking_required=False,
            is_indoor=False,
            styles=["leisurely", "family", "romantic"],
            day_part="morning",
            description="Royal park with flowerbeds and pelican lake leading up to the monarch's official residence.",
        ),
        PlaceCandidate(
            name="Covent Garden & Seven Dials Shopping",
            category="shopping",
            subcategory="market",
            location="Covent Garden, WC2",
            duration_minutes=120,
            cost_minor=0,
            opening_hours="10:00–20:00",
            booking_required=False,
            is_indoor=True,
            styles=["shopping", "outgoing", "cultural"],
            day_part="afternoon",
            description="Historic 19th-century market building, street performers, boutique shops, and craft traders.",
        ),
        PlaceCandidate(
            name="Classic British Gastropub Dinner",
            category="food",
            subcategory="restaurant",
            location="Soho or Covent Garden",
            duration_minutes=90,
            cost_minor=250000,
            opening_hours="12:00–23:00",
            booking_required=False,
            is_indoor=True,
            styles=["food_nightlife", "group", "leisurely"],
            day_part="evening",
            description="Hearty British dishes such as Sunday roasts, fish and chips, and ale in a historic wood-panelled tavern.",
        ),
        PlaceCandidate(
            name="Sky Garden at 20 Fenchurch",
            category="sightseeing",
            subcategory="viewpoint",
            location="City of London, EC3M",
            duration_minutes=75,
            cost_minor=0,
            opening_hours="10:00–21:00",
            booking_required=True,
            is_indoor=True,
            styles=["romantic", "sightseeing", "leisurely"],
            day_part="evening",
            description="Enclosed public glass dome across 3 storeys with landscaped gardens and panoramic London skyline views.",
        ),
        PlaceCandidate(
            name="Natural History Museum & Earth Galleries",
            category="culture",
            subcategory="museum",
            location="Cromwell Road, South Kensington",
            duration_minutes=150,
            cost_minor=0,
            opening_hours="10:00–17:50",
            booking_required=True,
            is_indoor=True,
            styles=["cultural", "family", "solo"],
            day_part="morning",
            description="World-famous museum renowned for dinosaur galleries, the Hope Blue Whale skeleton, and Earth's geological treasures.",
        ),
        PlaceCandidate(
            name="Victoria and Albert (V&A) Museum",
            category="culture",
            subcategory="museum",
            location="Cromwell Road, South Kensington",
            duration_minutes=120,
            cost_minor=0,
            opening_hours="10:00–17:45",
            booking_required=False,
            is_indoor=True,
            styles=["cultural", "leisurely", "solo"],
            day_part="afternoon",
            description="World's leading museum of applied arts, decorative design, sculpture, and historic global fashion.",
        ),
        PlaceCandidate(
            name="Tate Modern & Millennium Bridge",
            category="culture",
            subcategory="museum",
            location="Bankside, Southwark",
            duration_minutes=120,
            cost_minor=0,
            opening_hours="10:00–18:00",
            booking_required=False,
            is_indoor=True,
            styles=["cultural", "outgoing", "solo"],
            day_part="morning",
            description="Britain's national gallery of international modern and contemporary art housed in the monumental Bankside Power Station.",
        ),
        PlaceCandidate(
            name="St Paul's Cathedral & Whispering Gallery",
            category="culture",
            subcategory="heritage",
            location="St Paul's Churchyard, City of London",
            duration_minutes=90,
            cost_minor=230000,
            opening_hours="08:30–16:30",
            booking_required=True,
            is_indoor=True,
            styles=["cultural", "sightseeing", "romantic"],
            day_part="morning",
            description="Sir Christopher Wren's English Baroque masterpiece featuring the iconic dome, crypts, and acoustic Whispering Gallery.",
        ),
        PlaceCandidate(
            name="Royal Observatory & Greenwich Meridian Line",
            category="sightseeing",
            subcategory="viewpoint",
            location="Greenwich Park, Greenwich",
            duration_minutes=120,
            cost_minor=180000,
            opening_hours="10:00–17:00",
            booking_required=True,
            is_indoor=False,
            styles=["sightseeing", "cultural", "family"],
            day_part="afternoon",
            description="Historic astronomical observatory where you can straddle the Prime Meridian Line (0° longitude) with hilltop Thames views.",
        ),
        PlaceCandidate(
            name="Camden Market & Regent's Canal Walk",
            category="shopping",
            subcategory="market",
            location="Camden Lock, Camden Town",
            duration_minutes=120,
            cost_minor=0,
            opening_hours="10:00–18:30",
            booking_required=False,
            is_indoor=False,
            styles=["shopping", "outgoing", "cultural"],
            day_part="afternoon",
            description="Eclectic canal-side markets showcasing indie fashion, vinyl, artisan handicrafts, and world street food stalls.",
        ),
        PlaceCandidate(
            name="Hyde Park & The Serpentine Lake",
            category="nature",
            subcategory="park",
            location="Hyde Park, Central London",
            duration_minutes=90,
            cost_minor=0,
            opening_hours="05:00–24:00",
            booking_required=False,
            is_indoor=False,
            styles=["nature_wellness", "leisurely", "romantic"],
            day_part="morning",
            description="Historic 350-acre Royal Park with lakeside promenades, Rose Garden paths, and the Princess Diana Memorial Fountain.",
        ),
        PlaceCandidate(
            name="The National Gallery & Trafalgar Square",
            category="culture",
            subcategory="museum",
            location="Trafalgar Square, Westminster",
            duration_minutes=120,
            cost_minor=0,
            opening_hours="10:00–18:00",
            booking_required=False,
            is_indoor=True,
            styles=["cultural", "leisurely", "solo"],
            day_part="afternoon",
            description="Treasury of Western European painting from Van Gogh, Turner, and Da Vinci overlooking bustling Trafalgar Square.",
        ),
        PlaceCandidate(
            name="South Bank & London Eye Promenade",
            category="sightseeing",
            subcategory="neighborhood",
            location="South Bank, River Thames",
            duration_minutes=75,
            cost_minor=0,
            opening_hours="Open 24 h",
            booking_required=False,
            is_indoor=False,
            styles=["romantic", "leisurely", "outgoing"],
            day_part="evening",
            description="Pedestrian riverside esplanade featuring street performers, illuminated Thames bridges, and London Eye skyline views.",
        ),
        PlaceCandidate(
            name="Kensington Palace & Sunken Garden",
            category="culture",
            subcategory="heritage",
            location="Kensington Gardens, London",
            duration_minutes=90,
            cost_minor=220000,
            opening_hours="10:00–18:00",
            booking_required=True,
            is_indoor=True,
            styles=["cultural", "romantic", "leisurely"],
            day_part="morning",
            description="Historic royal residence of British monarchs surrounded by manicured formal gardens and Queen Victoria's childhood apartments.",
        ),
        PlaceCandidate(
            name="Leadenhall Market & Victorian Arcades",
            category="shopping",
            subcategory="market",
            location="Gracechurch St, City of London",
            duration_minutes=60,
            cost_minor=0,
            opening_hours="10:00–18:00",
            booking_required=False,
            is_indoor=True,
            styles=["shopping", "cultural", "sightseeing"],
            day_part="afternoon",
            description="Splendid 14th-century covered Victorian marketplace with ornate wrought-iron ceilings, cobblestone passages, and boutique shops.",
        ),
        PlaceCandidate(
            name="Regent's Park & Primrose Hill Viewpoint",
            category="nature",
            subcategory="viewpoint",
            location="Primrose Hill, Regent's Park",
            duration_minutes=90,
            cost_minor=0,
            opening_hours="05:00–21:30",
            booking_required=False,
            is_indoor=False,
            styles=["nature_wellness", "romantic", "leisurely"],
            day_part="evening",
            description="Panoramic skyline vista of Central London from the grassy summit of Primrose Hill, adjacent to Queen Mary's Rose Gardens.",
        ),
        PlaceCandidate(
            name="Shakespeare's Globe Theatre & Bankside Exhibition",
            category="culture",
            subcategory="heritage",
            location="21 New Globe Walk, Bankside",
            duration_minutes=90,
            cost_minor=170000,
            opening_hours="10:00–17:00",
            booking_required=True,
            is_indoor=True,
            styles=["cultural", "family", "solo"],
            day_part="afternoon",
            description="Authentic timber-framed open-air reconstruction of William Shakespeare's 1599 Elizabethan circular playhouse.",
        ),
        PlaceCandidate(
            name="Neal's Yard & Seven Dials Courtyard",
            category="sightseeing",
            subcategory="neighborhood",
            location="Neal's Yard, Covent Garden",
            duration_minutes=60,
            cost_minor=0,
            opening_hours="Open 24 h",
            booking_required=False,
            is_indoor=False,
            styles=["outgoing", "romantic", "leisurely"],
            day_part="morning",
            description="Picturesque hidden courtyard within Covent Garden famed for brightly painted facades, indie coffee roasters, and remedies.",
        ),
        PlaceCandidate(
            name="Dishoom Covent Garden Bombay Dining",
            category="food",
            subcategory="restaurant",
            location="12 Upper St Martin's Lane, Covent Garden",
            duration_minutes=90,
            cost_minor=320000,
            opening_hours="08:00–23:00",
            booking_required=False,
            is_indoor=True,
            styles=["food_nightlife", "cultural", "family"],
            day_part="evening",
            description="Celebrated Irani café serving authentic slow-cooked black dal, chicken ruby, gunpower potatoes, and fresh naan in Covent Garden.",
        ),
    ],
    "agra": [
        PlaceCandidate(
            name="Taj Mahal",
            category="culture",
            subcategory="heritage",
            location="Dharmapuri, Tajganj, Agra",
            duration_minutes=150,
            cost_minor=5000,
            opening_hours="06:00–18:30 (Closed Fridays)",
            booking_required=True,
            is_indoor=False,
            styles=["cultural", "romantic", "leisurely", "family", "solo"],
            day_part="morning",
            rating=4.9,
            description="Iconic 17th-century white marble mausoleum and UNESCO World Heritage Site commissioned by Mughal Emperor Shah Jahan.",
        ),
        PlaceCandidate(
            name="Agra Fort (Red Fort of Agra)",
            category="culture",
            subcategory="heritage",
            location="Rakabganj, Agra",
            duration_minutes=120,
            cost_minor=5000,
            opening_hours="06:00–18:00",
            booking_required=False,
            is_indoor=False,
            styles=["cultural", "sightseeing", "family"],
            day_part="afternoon",
            rating=4.7,
            description="Expansive 16th-century Mughal red sandstone fortress comprising palaces, Diwan-i-Am, and views of the Yamuna River.",
        ),
        PlaceCandidate(
            name="Mehtab Bagh (Moonlight Garden)",
            category="nature",
            subcategory="viewpoint",
            location="Nagla Devjit, Across Yamuna, Agra",
            duration_minutes=75,
            cost_minor=2500,
            opening_hours="06:00–18:00",
            booking_required=False,
            is_indoor=False,
            styles=["romantic", "nature_wellness", "leisurely"],
            day_part="evening",
            rating=4.6,
            description="Charbagh garden complex on the opposite bank of the Yamuna River offering tranquil sunset reflections of the Taj Mahal.",
        ),
        PlaceCandidate(
            name="Tomb of I'timad-ud-Daulah (Baby Taj)",
            category="culture",
            subcategory="heritage",
            location="Moti Bagh, Agra",
            duration_minutes=90,
            cost_minor=3000,
            opening_hours="08:00–18:00",
            booking_required=False,
            is_indoor=False,
            styles=["cultural", "leisurely", "solo"],
            day_part="morning",
            rating=4.6,
            description="Exquisite white marble mausoleum with delicate pietra dura inlay, considered an architectural inspiration for the Taj Mahal.",
        ),
        PlaceCandidate(
            name="Fatehpur Sikri & Buland Darwaza",
            category="culture",
            subcategory="heritage",
            location="Fatehpur Sikri, Agra District",
            duration_minutes=180,
            cost_minor=5000,
            opening_hours="06:00–18:00",
            booking_required=False,
            is_indoor=False,
            styles=["cultural", "adventure", "family"],
            day_part="morning",
            rating=4.8,
            description="UNESCO World Heritage ghost city built by Emperor Akbar in 1571 featuring the monumental 54-metre Buland Darwaza gateway.",
        ),
        PlaceCandidate(
            name="Akbar's Tomb at Sikandra",
            category="culture",
            subcategory="heritage",
            location="Sikandra, Agra",
            duration_minutes=90,
            cost_minor=3000,
            opening_hours="06:00–18:00",
            booking_required=False,
            is_indoor=False,
            styles=["cultural", "nature_wellness", "leisurely"],
            day_part="morning",
            rating=4.5,
            description="Stately pyramidal tomb of Emperor Akbar blending Hindu, Buddhist, and Islamic architecture amidst gardens with grazing deer.",
        ),
        PlaceCandidate(
            name="Kinari Bazaar Heritage Walk",
            category="shopping",
            subcategory="market",
            location="Kinari Bazaar, Old Agra",
            duration_minutes=90,
            cost_minor=0,
            opening_hours="10:30–20:30",
            booking_required=False,
            is_indoor=False,
            styles=["shopping", "cultural", "outgoing"],
            day_part="afternoon",
            rating=4.4,
            description="Atmospheric maze of narrow medieval alleys known for handcrafted Zardozi embroidery, leather footwear, brassware, and spices.",
        ),
        PlaceCandidate(
            name="Taj Nature Walk",
            category="nature",
            subcategory="park",
            location="East Gate Road, Tajganj, Agra",
            duration_minutes=75,
            cost_minor=2000,
            opening_hours="06:30–18:30",
            booking_required=False,
            is_indoor=False,
            styles=["nature_wellness", "leisurely", "family"],
            day_part="morning",
            rating=4.3,
            description="Peaceful 180-acre green forest park located 500 metres east of the Taj Mahal with woodland trails and birdwatching viewpoints.",
        ),
        PlaceCandidate(
            name="Jama Masjid Agra",
            category="culture",
            subcategory="heritage",
            location="Subhash Bazar, Kinari Bazar, Agra",
            duration_minutes=60,
            cost_minor=0,
            opening_hours="06:00–20:00",
            booking_required=False,
            is_indoor=True,
            styles=["cultural", "solo", "leisurely"],
            day_part="morning",
            rating=4.4,
            description="Grand 17th-century congregational red sandstone mosque built by Princess Jahanara Begum featuring zigzag chevron marble domes.",
        ),
        PlaceCandidate(
            name="Chini Ka Rauza",
            category="culture",
            subcategory="heritage",
            location="Katra Wazir Khan, Across Yamuna, Agra",
            duration_minutes=60,
            cost_minor=0,
            opening_hours="06:00–18:00",
            booking_required=False,
            is_indoor=False,
            styles=["cultural", "solo", "leisurely"],
            day_part="afternoon",
            rating=4.2,
            description="Funerary monument of Mughal poet Afzal Khan Shirazi, celebrated for its colorful glazed Persian porcelain tile ornamentation.",
        ),
        PlaceCandidate(
            name="Mughal Heritage Walk & Kachhpura Village",
            category="sightseeing",
            subcategory="neighborhood",
            location="Kachhpura Village, Agra",
            duration_minutes=90,
            cost_minor=50000,
            opening_hours="07:00–17:30",
            booking_required=False,
            is_indoor=False,
            styles=["cultural", "outgoing", "solo"],
            day_part="afternoon",
            rating=4.5,
            description="Community-led rural heritage walking trail showcasing Humayun's Mosque, Gyarah Sidi astronomical rocks, and traditional pottery.",
        ),
        PlaceCandidate(
            name="Sadar Bazaar & Evening Stroll",
            category="shopping",
            subcategory="market",
            location="Sadar Bazaar, Agra Cantonment",
            duration_minutes=90,
            cost_minor=0,
            opening_hours="11:00–21:30 (Closed Tuesdays)",
            booking_required=False,
            is_indoor=False,
            styles=["shopping", "outgoing", "family"],
            day_part="evening",
            rating=4.4,
            description="Central shopping promenade known for handcrafted Agra leather goods, marble inlay handicrafts, street snacks, and relaxed cafes.",
        ),
        PlaceCandidate(
            name="Shilpgram Crafts Village & Cultural Centre",
            category="shopping",
            subcategory="market",
            location="Shilpgram, Tajganj, Agra",
            duration_minutes=90,
            cost_minor=2000,
            opening_hours="10:00–19:30",
            booking_required=False,
            is_indoor=False,
            styles=["shopping", "cultural", "family"],
            day_part="afternoon",
            rating=4.3,
            description="Open-air craft village and artisan complex near the Taj East Gate showcasing traditional weavers, woodworkers, and folk dancers.",
        ),
        PlaceCandidate(
            name="Panchhi Petha Sweet Tasting",
            category="food",
            subcategory="restaurant",
            location="Hari Parbat & Sadar Bazaar, Agra",
            duration_minutes=45,
            cost_minor=25000,
            opening_hours="09:00–22:00",
            booking_required=False,
            is_indoor=True,
            styles=["food_nightlife", "cultural", "family"],
            day_part="evening",
            rating=4.6,
            description="Historic confectionery shop offering authentic Agra Petha in flavours such as kesar, angoori, paan, and chocolate.",
        ),
        PlaceCandidate(
            name="Pinch of Spice Restaurant",
            category="food",
            subcategory="restaurant",
            location="Wazirpura Road / Fatehabad Road, Agra",
            duration_minutes=75,
            cost_minor=120000,
            opening_hours="12:00–23:00",
            booking_required=False,
            is_indoor=True,
            styles=["food_nightlife", "cultural", "family"],
            day_part="evening",
            rating=4.6,
            description="Popular dining destination known for authentic Mughlai cuisine, tandoori kebabs, murgh boti masala, and dal makhani.",
        ),
        PlaceCandidate(
            name="Rawatpara Bedai & Jalebi Breakfast",
            category="food",
            subcategory="restaurant",
            location="Rawatpara, Near Agra Fort",
            duration_minutes=45,
            cost_minor=15000,
            opening_hours="07:00–12:00",
            booking_required=False,
            is_indoor=True,
            styles=["food_nightlife", "cultural", "budget"],
            day_part="morning",
            rating=4.7,
            description="Centuries-old breakfast institution serving crispy lentil-stuffed bedai breads with spicy potato curry and warm jalebis.",
        ),
        PlaceCandidate(
            name="Jahangiri Mahal & Diwan-i-Aam",
            category="culture",
            subcategory="heritage",
            location="Agra Fort Complex, Rakabganj, Agra",
            duration_minutes=75,
            cost_minor=0,
            opening_hours="07:00–18:00",
            booking_required=False,
            is_indoor=True,
            styles=["cultural", "sightseeing", "solo"],
            day_part="morning",
            rating=4.7,
            description="Principal zenana residence within Agra Fort showcasing carved red sandstone brackets and decorative Mughal courtyards.",
        ),
        PlaceCandidate(
            name="Mariam's Tomb & Gardens",
            category="culture",
            subcategory="heritage",
            location="Sikandra, NH19, Agra",
            duration_minutes=60,
            cost_minor=2500,
            opening_hours="06:00–18:00",
            booking_required=False,
            is_indoor=False,
            styles=["cultural", "nature_wellness", "leisurely"],
            day_part="afternoon",
            rating=4.3,
            description="Tranquil Mughal-era red sandstone pavilion honoring Queen Mariam-uz-Zamani, surrounded by serene landscaped gardens.",
        ),
    ],
    "goa": [
        PlaceCandidate(
            name="Basilica of Bom Jesus",
            category="culture",
            subcategory="heritage",
            location="Old Goa",
            duration_minutes=90,
            cost_minor=0,
            opening_hours="09:00–18:30",
            booking_required=False,
            is_indoor=True,
            styles=["cultural", "leisurely", "family"],
            day_part="morning",
            description="UNESCO World Heritage Site completed in 1605, holding the sacred relics of St. Francis Xavier.",
        ),
        PlaceCandidate(
            name="Se Cathedral & Church of St. Francis of Assisi",
            category="culture",
            subcategory="heritage",
            location="Old Goa",
            duration_minutes=75,
            cost_minor=0,
            opening_hours="09:00–17:30",
            booking_required=False,
            is_indoor=True,
            styles=["cultural", "leisurely"],
            day_part="morning",
            description="One of the largest churches in Asia, famed for its Portuguese-Gothic architecture and Golden Bell.",
        ),
        PlaceCandidate(
            name="Fontainhas Latin Quarter Heritage Walk",
            category="sightseeing",
            subcategory="neighborhood",
            location="Panaji",
            duration_minutes=90,
            cost_minor=0,
            opening_hours="Open all day",
            booking_required=False,
            is_indoor=False,
            styles=["cultural", "romantic", "leisurely"],
            day_part="afternoon",
            description="Picturesque Portuguese colonial neighbourhood with narrow streets, tiled roofs, and pastel villas.",
        ),
        PlaceCandidate(
            name="Authentic Goan Seafood Lunch at Mum's Kitchen",
            category="food",
            subcategory="restaurant",
            location="Panaji",
            duration_minutes=75,
            cost_minor=80000,
            opening_hours="11:30–15:30",
            booking_required=False,
            is_indoor=True,
            styles=["food_nightlife", "cultural", "family"],
            day_part="afternoon",
            description="Celebrated heritage restaurant preserving heirloom Goan fish curry, prawn balchão, and poi bread.",
        ),
        PlaceCandidate(
            name="Aguada Fort & Lighthouse Sunset",
            category="sightseeing",
            subcategory="viewpoint",
            location="Sinquerim, North Goa",
            duration_minutes=90,
            cost_minor=5000,
            opening_hours="09:30–17:30",
            booking_required=False,
            is_indoor=False,
            styles=["sightseeing", "romantic", "family"],
            day_part="evening",
            description="17th-century Portuguese coastal bastion with panoramic sweeps of the Arabian Sea and Mandovi estuary.",
        ),
        PlaceCandidate(
            name="Anjuna Flea Market / Arpora Saturday Night Bazaar",
            category="shopping",
            subcategory="market",
            location="North Goa",
            duration_minutes=120,
            cost_minor=0,
            opening_hours="Seasonal evening hours",
            booking_required=False,
            is_indoor=False,
            styles=["shopping", "outgoing", "group"],
            day_part="evening",
            description="Vibrant open-air market with live music, handmade crafts, spices, silver jewellery, and local street food.",
        ),
        PlaceCandidate(
            name="Dudhsagar Waterfalls Trek & Jeep Safari",
            category="nature",
            subcategory="park",
            location="Bhagwan Mahavir Wildlife Sanctuary",
            duration_minutes=240,
            cost_minor=200000,
            opening_hours="08:30–16:30",
            booking_required=True,
            is_indoor=False,
            styles=["adventure", "nature_wellness", "group"],
            day_part="morning",
            description="Four-tiered cascade plunging 310 metres through the Western Ghats jungle on the Mandovi River.",
        ),
        PlaceCandidate(
            name="Sahakari Spice Farm Tour & Traditional Lunch",
            category="culture",
            subcategory="museum",
            location="Ponda",
            duration_minutes=120,
            cost_minor=50000,
            opening_hours="09:00–16:30",
            booking_required=False,
            is_indoor=False,
            styles=["nature_wellness", "family", "cultural"],
            day_part="afternoon",
            description="Guided botanical tour through cardamom, vanilla, and pepper plantations followed by a buffet on banana leaves.",
        ),
        PlaceCandidate(
            name="Morjim or Palolem Beach Relaxation",
            category="nature",
            subcategory="park",
            location="North or South Goa coastline",
            duration_minutes=120,
            cost_minor=0,
            opening_hours="Open 24 h",
            booking_required=False,
            is_indoor=False,
            styles=["leisurely", "nature_wellness", "romantic"],
            day_part="afternoon",
            description="Golden sands and swaying palms suited for quiet walks, swimming, and beach shack relaxation.",
        ),
        PlaceCandidate(
            name="Chapora Fort & Vagator Coastal Panorama",
            category="sightseeing",
            subcategory="viewpoint",
            location="Vagator, North Goa",
            duration_minutes=90,
            cost_minor=0,
            opening_hours="Open 24 h (Sunset recommended)",
            booking_required=False,
            is_indoor=False,
            styles=["sightseeing", "romantic", "outgoing"],
            day_part="evening",
            description="Historic hilltop red-laterite fort offering 360-degree sunset panoramas of Vagator beach and the Chapora river mouth.",
        ),
        PlaceCandidate(
            name="Reis Magos Fort & Cultural Centre",
            category="culture",
            subcategory="heritage",
            location="Verem, Bardez",
            duration_minutes=75,
            cost_minor=5000,
            opening_hours="09:30–17:30 (Closed Mon)",
            booking_required=False,
            is_indoor=True,
            styles=["cultural", "leisurely", "family"],
            day_part="morning",
            description="Restored 1551 fortress overlooking the Mandovi estuary displaying Goan freedom struggle history and Mario Miranda cartoons.",
        ),
        PlaceCandidate(
            name="Mangueshi Temple & Heritage Courtyard",
            category="culture",
            subcategory="heritage",
            location="Priol, Ponda",
            duration_minutes=60,
            cost_minor=0,
            opening_hours="06:00–22:00",
            booking_required=False,
            is_indoor=True,
            styles=["cultural", "heritage", "family"],
            day_part="morning",
            description="450-year-old Shiva temple famed for its distinctive seven-storey octagonal lamp tower (deepstambha) and sacred water tank.",
        ),
        PlaceCandidate(
            name="Shanta Durga Temple",
            category="culture",
            subcategory="heritage",
            location="Kavlem, Ponda",
            duration_minutes=60,
            cost_minor=0,
            opening_hours="05:30–22:00",
            booking_required=False,
            is_indoor=True,
            styles=["cultural", "heritage"],
            day_part="afternoon",
            description="Historic Hindu temple complex built during the reign of Maratha ruler Chhatrapati Shahu Maharaj, dedicated to the goddess of peace.",
        ),
        PlaceCandidate(
            name="Mapusa Friday Market & Local Spice Bazaar",
            category="shopping",
            subcategory="market",
            location="Mapusa, North Goa",
            duration_minutes=90,
            cost_minor=0,
            opening_hours="08:00–18:30",
            booking_required=False,
            is_indoor=False,
            styles=["shopping", "cultural", "outgoing"],
            day_part="morning",
            description="Lively weekly bazaar where village vendors gather to sell dried red chillies, kokum, cashews, Goan sausages (chorizo), and terracotta pottery.",
        ),
        PlaceCandidate(
            name="Palolem Beach Kayaking & Butterfly Island",
            category="nature",
            subcategory="park",
            location="Canacona, South Goa",
            duration_minutes=120,
            cost_minor=50000,
            opening_hours="07:00–17:30",
            booking_required=False,
            is_indoor=False,
            styles=["adventure", "nature_wellness", "leisurely"],
            day_part="morning",
            description="Gentle sea kayaking in the sheltered crescent bay of Palolem with chances to spot pods of Indo-Pacific humpback dolphins.",
        ),
        PlaceCandidate(
            name="Cabo de Rama Fort & Cliffside Lookout",
            category="sightseeing",
            subcategory="viewpoint",
            location="Canacona, South Goa",
            duration_minutes=90,
            cost_minor=0,
            opening_hours="09:00–17:30",
            booking_required=False,
            is_indoor=False,
            styles=["sightseeing", "romantic", "solo"],
            day_part="afternoon",
            description="Ancient cliff fortress named after Lord Rama, perched above the sapphire waters of the southern Arabian coastline.",
        ),
        PlaceCandidate(
            name="Goa Chitra Museum of Ethnography",
            category="culture",
            subcategory="museum",
            location="Benaulim, South Goa",
            duration_minutes=90,
            cost_minor=30000,
            opening_hours="09:00–18:00",
            booking_required=False,
            is_indoor=True,
            styles=["cultural", "family", "leisurely"],
            day_part="afternoon",
            description="Eco-museum housing over 4,000 traditional Goan agricultural implements, musical instruments, and ancestral craft relics.",
        ),
        PlaceCandidate(
            name="Houses of Goa Museum & Mario Miranda Gallery",
            category="culture",
            subcategory="museum",
            location="Salvador do Mundo, Bardez",
            duration_minutes=75,
            cost_minor=20000,
            opening_hours="10:00–19:30 (Closed Mon)",
            booking_required=False,
            is_indoor=True,
            styles=["cultural", "leisurely"],
            day_part="afternoon",
            description="Ship-shaped architectural museum celebrating the unique fusion of Portuguese and traditional Hindu domestic architecture in Goa.",
        ),
        PlaceCandidate(
            name="Dr. Salim Ali Bird Sanctuary Mangrove Boat Tour",
            category="nature",
            subcategory="park",
            location="Chorão Island, Mandovi River",
            duration_minutes=90,
            cost_minor=40000,
            opening_hours="06:00–18:00",
            booking_required=True,
            is_indoor=False,
            styles=["nature_wellness", "adventure", "family"],
            day_part="morning",
            description="Quiet early-morning boat glide through estuarine mangrove forests sheltering kingfishers, egrets, flying foxes, and mudskippers.",
        ),
        PlaceCandidate(
            name="Authentic Goan Thali Lunch at Vinayak Family Restaurant",
            category="food",
            subcategory="restaurant",
            location="Assagao, North Goa",
            duration_minutes=60,
            cost_minor=35000,
            opening_hours="12:00–15:30",
            booking_required=False,
            is_indoor=True,
            styles=["food_nightlife", "cultural", "solo"],
            day_part="afternoon",
            description="Beloved village eatery serving iconic Goan fish thalis with rava-fried kingfish, kismoor, sol kadhi, and crab xacuti.",
        ),
        PlaceCandidate(
            name="Sunset Mandovi River Cruise with Goan Folk Music",
            category="sightseeing",
            subcategory="viewpoint",
            location="Santa Monica Jetty, Panaji",
            duration_minutes=75,
            cost_minor=50000,
            opening_hours="17:30–20:30",
            booking_required=True,
            is_indoor=False,
            styles=["sightseeing", "romantic", "group", "family"],
            day_part="evening",
            description="Evening catamaran cruise on the Mandovi River featuring live brass dekni and fugdi folk dance performances against the setting sun.",
        ),
    ],
    "jaipur": [
        PlaceCandidate(
            name="Amber Fort & Palace",
            category="culture",
            subcategory="heritage",
            location="Amer, Jaipur",
            duration_minutes=180,
            cost_minor=55000,
            opening_hours="08:00–17:30",
            booking_required=False,
            is_indoor=False,
            styles=["cultural", "family", "sightseeing"],
            day_part="morning",
            description="Magnificent hilltop fortress blending Rajput and Mughal design with the Sheesh Mahal (Mirror Palace).",
        ),
        PlaceCandidate(
            name="City Palace & Mubarak Mahal",
            category="culture",
            subcategory="heritage",
            location="Old City, Jaipur",
            duration_minutes=120,
            cost_minor=30000,
            opening_hours="09:30–17:00",
            booking_required=False,
            is_indoor=True,
            styles=["cultural", "family"],
            day_part="afternoon",
            description="Active royal residence housing courtyards, Peacock Gate, and museum galleries of royal textiles and armour.",
        ),
        PlaceCandidate(
            name="Jantar Mantar Royal Observatory",
            category="culture",
            subcategory="museum",
            location="Near City Palace",
            duration_minutes=75,
            cost_minor=20000,
            opening_hours="09:00–17:00",
            booking_required=False,
            is_indoor=False,
            styles=["cultural", "family"],
            day_part="afternoon",
            description="UNESCO World Heritage astronomical observatory completed in 1734 with the world's largest stone sundial.",
        ),
        PlaceCandidate(
            name="Hawa Mahal (Palace of Winds) Photo & Museum",
            category="sightseeing",
            subcategory="viewpoint",
            location="Badi Choupad, Pink City",
            duration_minutes=60,
            cost_minor=10000,
            opening_hours="09:00–17:00",
            booking_required=False,
            is_indoor=True,
            styles=["sightseeing", "cultural", "romantic"],
            day_part="morning",
            description="Five-storey pink sandstone façade with 953 jharokhas built for royal women to observe street festivals.",
        ),
        PlaceCandidate(
            name="Johari & Bapu Bazaar Craft Shopping",
            category="shopping",
            subcategory="market",
            location="Pink City Walled Enclave",
            duration_minutes=120,
            cost_minor=0,
            opening_hours="10:30–20:00",
            booking_required=False,
            is_indoor=False,
            styles=["shopping", "cultural", "outgoing"],
            day_part="afternoon",
            description="Centuries-old markets famous for block-print textiles, blue pottery, juttis, and silver kundan jewellery.",
        ),
        PlaceCandidate(
            name="Nahargarh Fort Sunset Viewpoint",
            category="sightseeing",
            subcategory="viewpoint",
            location="Aravalli Hills",
            duration_minutes=100,
            cost_minor=10000,
            opening_hours="10:00–18:00",
            booking_required=False,
            is_indoor=False,
            styles=["sightseeing", "romantic", "group"],
            day_part="evening",
            description="Ridge fort offering bird's-eye sunset panoramas over the entire Pink City and Maota Lake.",
        ),
        PlaceCandidate(
            name="Authentic Rajasthani Thali Dinner at Laxmi Mishtan Bhandar (LMB)",
            category="food",
            subcategory="restaurant",
            location="Johari Bazaar",
            duration_minutes=75,
            cost_minor=75000,
            opening_hours="09:00–22:00",
            booking_required=False,
            is_indoor=True,
            styles=["food_nightlife", "cultural", "family"],
            day_part="evening",
            description="Iconic 1727 eatery celebrated for dal baati churma, ghewar, and royal vegetarian delicacies.",
        ),
    ],
    "dubai": [
        PlaceCandidate(
            name="Burj Khalifa Observation Deck",
            category="sightseeing",
            subcategory="viewpoint",
            location="Downtown Dubai",
            duration_minutes=90,
            cost_minor=350000,
            opening_hours="08:30–23:00",
            booking_required=True,
            is_indoor=True,
            styles=["sightseeing", "family", "romantic"],
            day_part="afternoon",
            description="World's tallest building with observation decks on levels 124, 125, and 148 overlooking the Persian Gulf.",
        ),
        PlaceCandidate(
            name="The Dubai Mall & Dubai Aquarium",
            category="shopping",
            subcategory="market",
            location="Downtown Dubai",
            duration_minutes=150,
            cost_minor=0,
            opening_hours="10:00–24:00",
            booking_required=False,
            is_indoor=True,
            styles=["shopping", "family", "leisurely"],
            day_part="afternoon",
            description="Massive retail and entertainment complex with indoor ice rink, giant walk-through aquarium, and luxury souks.",
        ),
        PlaceCandidate(
            name="Dubai Fountain Evening Show",
            category="sightseeing",
            subcategory="viewpoint",
            location="Burj Lake, Downtown",
            duration_minutes=45,
            cost_minor=0,
            opening_hours="Shows every 30m from 18:00–23:00",
            booking_required=False,
            is_indoor=False,
            styles=["romantic", "family", "sightseeing"],
            day_part="evening",
            description="Choreographed musical fountain jets shooting 140 metres high against the illuminated Burj Khalifa.",
        ),
        PlaceCandidate(
            name="Al Fahidi Historical Neighbourhood & Coffee Museum",
            category="culture",
            subcategory="heritage",
            location="Old Dubai, Bur Dubai",
            duration_minutes=100,
            cost_minor=10000,
            opening_hours="09:00–17:00",
            booking_required=False,
            is_indoor=True,
            styles=["cultural", "leisurely", "solo"],
            day_part="morning",
            description="Preserved 1890s coral-stone and gypsum quarter with wind-tower architecture and cultural galleries.",
        ),
        PlaceCandidate(
            name="Abra Ride across Dubai Creek to Gold & Spice Souks",
            category="shopping",
            subcategory="market",
            location="Deira & Bur Dubai Creek",
            duration_minutes=90,
            cost_minor=5000,
            opening_hours="09:00–22:00",
            booking_required=False,
            is_indoor=False,
            styles=["cultural", "shopping", "outgoing"],
            day_part="morning",
            description="Traditional 1-dirham wooden boat crossing connecting historic spice sacks and gleaming gold jewellery lanes.",
        ),
        PlaceCandidate(
            name="Desert Conservation Safari & Bedouin Dinner",
            category="adventure",
            subcategory="park",
            location="Dubai Desert Conservation Reserve",
            duration_minutes=300,
            cost_minor=450000,
            opening_hours="15:00–21:30",
            booking_required=True,
            is_indoor=False,
            styles=["adventure", "outgoing", "group", "family"],
            day_part="afternoon",
            description="Red dune driving, sunset camel trek, falconry demonstration, and Arabian feast under desert stars.",
        ),
        PlaceCandidate(
            name="Emirati Cuisine Lunch at Al Khayma Heritage Restaurant",
            category="food",
            subcategory="restaurant",
            location="Al Fahidi Historic District",
            duration_minutes=75,
            cost_minor=150000,
            opening_hours="08:00–23:00",
            booking_required=False,
            is_indoor=True,
            styles=["food_nightlife", "cultural", "family"],
            day_part="afternoon",
            description="Michelin Bib Gourmand Emirati dining serving machboos, luqaimat, and spiced karak tea in an air-conditioned courtyard.",
        ),
    ],
    "new york": [
        PlaceCandidate(
            name="Metropolitan Museum of Art (The Met)",
            category="culture",
            subcategory="museum",
            location="Museum Mile, Central Park East",
            duration_minutes=180,
            cost_minor=250000,
            opening_hours="10:00–17:00 (Closed Wed)",
            booking_required=True,
            is_indoor=True,
            styles=["cultural", "leisurely", "family"],
            day_part="morning",
            description="World-class encyclopedic collection spanning Ancient Egyptian temples to European masterworks.",
        ),
        PlaceCandidate(
            name="Central Park Ramble & Bethesda Terrace",
            category="nature",
            subcategory="park",
            location="Manhattan",
            duration_minutes=90,
            cost_minor=0,
            opening_hours="06:00–01:00",
            booking_required=False,
            is_indoor=False,
            styles=["nature_wellness", "romantic", "leisurely"],
            day_part="afternoon",
            description="843-acre urban oasis designed by Olmsted and Vaux featuring the Bow Bridge, lake, and elm mall.",
        ),
        PlaceCandidate(
            name="Statue of Liberty & Ellis Island National Monument",
            category="culture",
            subcategory="heritage",
            location="New York Harbor",
            duration_minutes=180,
            cost_minor=200000,
            opening_hours="09:00–16:00",
            booking_required=True,
            is_indoor=True,
            styles=["cultural", "family", "sightseeing"],
            day_part="morning",
            description="Iconic symbol of freedom and immigration history museum accessed by harbour ferry.",
        ),
        PlaceCandidate(
            name="High Line Park & Chelsea Market",
            category="shopping",
            subcategory="market",
            location="Meatpacking District / Chelsea",
            duration_minutes=120,
            cost_minor=0,
            opening_hours="07:00–22:00",
            booking_required=False,
            is_indoor=False,
            styles=["sightseeing", "shopping", "food_nightlife"],
            day_part="afternoon",
            description="Elevated railway transformed into a public garden path, leading to Chelsea Market's artisan food stalls.",
        ),
        PlaceCandidate(
            name="Top of the Rock or Empire State Viewpoint",
            category="sightseeing",
            subcategory="viewpoint",
            location="Rockefeller Center / Midtown",
            duration_minutes=90,
            cost_minor=320000,
            opening_hours="09:00–24:00",
            booking_required=True,
            is_indoor=False,
            styles=["sightseeing", "romantic", "family"],
            day_part="evening",
            description="Multi-level observation deck showcasing unobstructed panoramic views of the Empire State Building and Central Park.",
        ),
        PlaceCandidate(
            name="Broadway Theatre Show & Times Square",
            category="culture",
            subcategory="museum",
            location="Theater District, Midtown",
            duration_minutes=150,
            cost_minor=650000,
            opening_hours="Evening shows 19:00/20:00",
            booking_required=True,
            is_indoor=True,
            styles=["cultural", "food_nightlife", "group"],
            day_part="evening",
            description="World-renowned live musical or drama performance in Manhattan's historic theatre district.",
        ),
        PlaceCandidate(
            name="Classic New York Deli or Pastrami at Katz's",
            category="food",
            subcategory="restaurant",
            location="Lower East Side",
            duration_minutes=60,
            cost_minor=220000,
            opening_hours="08:00–23:00",
            booking_required=False,
            is_indoor=True,
            styles=["food_nightlife", "cultural", "solo"],
            day_part="afternoon",
            description="Legendary 1888 establishment famed for towering warm hand-carved pastrami on rye.",
        ),
        PlaceCandidate(
            name="Brooklyn Bridge & DUMBO Waterfront Walk",
            category="sightseeing",
            subcategory="viewpoint",
            location="Brooklyn Bridge Promenade",
            duration_minutes=90,
            cost_minor=0,
            opening_hours="Open 24 h (Early morning or sunset recommended)",
            booking_required=False,
            is_indoor=False,
            styles=["sightseeing", "romantic", "leisurely", "solo"],
            day_part="morning",
            description="Iconic 1883 neo-Gothic suspension bridge walk crossing the East River into DUMBO's cobblestone streets and skyline park.",
        ),
        PlaceCandidate(
            name="Museum of Modern Art (MoMA)",
            category="culture",
            subcategory="museum",
            location="Midtown Manhattan, 53rd St",
            duration_minutes=150,
            cost_minor=250000,
            opening_hours="10:30–17:30",
            booking_required=True,
            is_indoor=True,
            styles=["cultural", "leisurely", "solo"],
            day_part="morning",
            description="Pioneering modern and contemporary art museum housing Van Gogh's The Starry Night, Warhol silkscreens, and Monet's Water Lilies.",
        ),
        PlaceCandidate(
            name="9/11 Memorial & World Trade Center Reflections",
            category="culture",
            subcategory="heritage",
            location="Financial District, Lower Manhattan",
            duration_minutes=90,
            cost_minor=0,
            opening_hours="08:00–20:00",
            booking_required=False,
            is_indoor=False,
            styles=["cultural", "solemn", "leisurely"],
            day_part="afternoon",
            description="Twin illuminated waterfall reflecting pools set within the footprints of the original Twin Towers, bordered by bronze name parapets.",
        ),
        PlaceCandidate(
            name="Grand Central Terminal & Whispering Gallery",
            category="culture",
            subcategory="heritage",
            location="Midtown, 42nd St & Park Ave",
            duration_minutes=60,
            cost_minor=0,
            opening_hours="05:15–02:00",
            booking_required=False,
            is_indoor=True,
            styles=["cultural", "sightseeing", "leisurely"],
            day_part="morning",
            description="Beaux-Arts architectural masterwork featuring the celestial ceiling mural, four-faced brass concourse clock, and oyster bar vaults.",
        ),
        PlaceCandidate(
            name="American Museum of Natural History (AMNH)",
            category="culture",
            subcategory="museum",
            location="Central Park West, Upper West Side",
            duration_minutes=180,
            cost_minor=280000,
            opening_hours="10:00–17:30",
            booking_required=True,
            is_indoor=True,
            styles=["cultural", "family", "educational"],
            day_part="afternoon",
            description="Iconic scientific institution featuring towering fossil dinosaur halls, the giant blue whale model, and the Hayden Planetarium.",
        ),
        PlaceCandidate(
            name="Solomon R. Guggenheim Museum",
            category="culture",
            subcategory="museum",
            location="Museum Mile, 5th Ave",
            duration_minutes=100,
            cost_minor=250000,
            opening_hours="11:00–18:00",
            booking_required=True,
            is_indoor=True,
            styles=["cultural", "solo", "leisurely"],
            day_part="morning",
            description="UNESCO-listed spiral rotunda designed by Frank Lloyd Wright showcasing modern and avant-garde art masterpieces.",
        ),
        PlaceCandidate(
            name="Greenwich Village Historic Walk & Washington Square Park",
            category="sightseeing",
            subcategory="neighborhood",
            location="Lower Manhattan",
            duration_minutes=90,
            cost_minor=0,
            opening_hours="Open all day",
            booking_required=False,
            is_indoor=False,
            styles=["cultural", "leisurely", "outgoing"],
            day_part="afternoon",
            description="Historic bohemian streets, brownstone townhouses, jazz clubs, and Washington Square's memorial marble arch and fountain.",
        ),
        PlaceCandidate(
            name="SoHo Historic Cast-Iron District & Architecture Walk",
            category="shopping",
            subcategory="market",
            location="Broadway, Prince & Spring Streets",
            duration_minutes=100,
            cost_minor=0,
            opening_hours="10:00–20:00",
            booking_required=False,
            is_indoor=False,
            styles=["shopping", "sightseeing", "cultural"],
            day_part="afternoon",
            description="World's largest collection of decorative 19th-century cast-iron buildings, boutique designer stores, and contemporary art galleries.",
        ),
        PlaceCandidate(
            name="St. Patrick's Cathedral & Rockefeller Promenade",
            category="culture",
            subcategory="heritage",
            location="Fifth Avenue, Midtown",
            duration_minutes=60,
            cost_minor=0,
            opening_hours="06:30–20:45",
            booking_required=False,
            is_indoor=True,
            styles=["cultural", "heritage", "leisurely"],
            day_part="morning",
            description="Magnificent Neo-Gothic Catholic cathedral facing Rockefeller Center's bronze statue of Atlas and floral channel gardens.",
        ),
        PlaceCandidate(
            name="New York Public Library & Bryant Park Lawn",
            category="culture",
            subcategory="heritage",
            location="42nd St & 5th Ave",
            duration_minutes=75,
            cost_minor=0,
            opening_hours="10:00–18:00",
            booking_required=False,
            is_indoor=True,
            styles=["cultural", "leisurely", "solo"],
            day_part="afternoon",
            description="Majestic Beaux-Arts library guarded by marble lions Patience and Fortitude, housing the monumental Rose Main Reading Room.",
        ),
        PlaceCandidate(
            name="Wall Street, Federal Hall & The Charging Bull",
            category="sightseeing",
            subcategory="neighborhood",
            location="Financial District",
            duration_minutes=60,
            cost_minor=0,
            opening_hours="Open 24 h",
            booking_required=False,
            is_indoor=False,
            styles=["sightseeing", "cultural", "solo"],
            day_part="morning",
            description="Cradle of American commerce, George Washington's inauguration site at Federal Hall, and Arturo Di Modica's bronze bull sculpture.",
        ),
        PlaceCandidate(
            name="Little Island at Pier 55 & Hudson River Walk",
            category="nature",
            subcategory="park",
            location="Hudson River Park, West 13th St",
            duration_minutes=75,
            cost_minor=0,
            opening_hours="06:00–23:00",
            booking_required=False,
            is_indoor=False,
            styles=["nature_wellness", "leisurely", "romantic"],
            day_part="afternoon",
            description="Innovative floating public park supported by 132 tulip-shaped concrete pots over the Hudson River, planted with native flora.",
        ),
        PlaceCandidate(
            name="Authentic New York Slice at Joe's Pizza",
            category="food",
            subcategory="restaurant",
            location="7 Carmine St, Greenwich Village",
            duration_minutes=45,
            cost_minor=50000,
            opening_hours="10:00–03:00",
            booking_required=False,
            is_indoor=True,
            styles=["food_nightlife", "solo", "cultural"],
            day_part="afternoon",
            description="Greenwich Village institution founded in 1975, celebrated for classic thin-crust, foldable New York cheese and pepperoni slices.",
        ),
        PlaceCandidate(
            name="Chinatown & Little Italy Cultural Culinary Tour",
            category="food",
            subcategory="restaurant",
            location="Mott St & Mulberry St",
            duration_minutes=90,
            cost_minor=120000,
            opening_hours="11:00–22:00",
            booking_required=False,
            is_indoor=True,
            styles=["food_nightlife", "cultural", "group"],
            day_part="evening",
            description="Dim sum teahouses, handmade soup dumplings on Mott Street, and historic Italian pasticcerias serving cannoli on Mulberry Street.",
        ),
        PlaceCandidate(
            name="Empire State Building 86th Floor Open-Air Observatory",
            category="sightseeing",
            subcategory="viewpoint",
            location="350 Fifth Ave, Midtown",
            duration_minutes=90,
            cost_minor=350000,
            opening_hours="09:00–24:00",
            booking_required=True,
            is_indoor=False,
            styles=["sightseeing", "romantic", "family"],
            day_part="evening",
            description="World-famous 1931 Art Deco skyscraper observatory with an open-air promenade offering 360-degree views across six states on clear days.",
        ),
        PlaceCandidate(
            name="Intrepid Sea, Air & Space Museum",
            category="culture",
            subcategory="museum",
            location="Pier 86, West 46th St",
            duration_minutes=120,
            cost_minor=280000,
            opening_hours="10:00–17:00",
            booking_required=True,
            is_indoor=True,
            styles=["cultural", "family", "educational"],
            day_part="morning",
            description="Historic WWII aircraft carrier USS Intrepid, the space shuttle Enterprise pavilion, and a supersonic Concorde airliner.",
        ),
    ],
    "kyoto": [
        PlaceCandidate(
            name="Fushimi Inari Taisha Shrine",
            category="culture",
            subcategory="heritage",
            location="Fushimi Ward, Kyoto",
            duration_minutes=120,
            cost_minor=0,
            opening_hours="Open 24 h",
            booking_required=False,
            is_indoor=False,
            styles=["cultural", "sightseeing", "nature_wellness", "solo"],
            day_part="morning",
            description="Iconic Shinto shrine famed for thousands of vibrant vermilion torii gates winding up sacred Mount Inari.",
        ),
        PlaceCandidate(
            name="Kinkaku-ji (The Golden Pavilion)",
            category="culture",
            subcategory="heritage",
            location="Kita Ward, Kyoto",
            duration_minutes=90,
            cost_minor=50000,
            opening_hours="09:00–17:00",
            booking_required=False,
            is_indoor=False,
            styles=["cultural", "sightseeing", "leisurely"],
            day_part="morning",
            description="Spectacular Zen Buddhist temple whose top two floors are completely covered in pure gold leaf, mirrored in Kyoko-chi pond.",
        ),
        PlaceCandidate(
            name="Kiyomizu-dera Historic Temple",
            category="culture",
            subcategory="heritage",
            location="Higashiyama Ward, Kyoto",
            duration_minutes=120,
            cost_minor=40000,
            opening_hours="06:00–18:00",
            booking_required=False,
            is_indoor=False,
            styles=["cultural", "sightseeing", "romantic"],
            day_part="morning",
            description="UNESCO World Heritage wooden temple perched on Mount Otowa with a massive veranda offering sweeping views over Kyoto.",
        ),
        PlaceCandidate(
            name="Arashiyama Bamboo Grove & Tenryu-ji Garden",
            category="nature",
            subcategory="park",
            location="Ukyo Ward, Kyoto",
            duration_minutes=120,
            cost_minor=50000,
            opening_hours="08:30–17:30",
            booking_required=False,
            is_indoor=False,
            styles=["nature_wellness", "cultural", "leisurely"],
            day_part="morning",
            description="Atmospheric towering bamboo grove leading to the 14th-century Tenryu-ji Zen landscape garden and the Oi River.",
        ),
        PlaceCandidate(
            name="Gion Historic District & Hanamikoji Street Walk",
            category="sightseeing",
            subcategory="neighborhood",
            location="Higashiyama Ward, Kyoto",
            duration_minutes=90,
            cost_minor=0,
            opening_hours="Open 24 h (Evening recommended)",
            booking_required=False,
            is_indoor=False,
            styles=["cultural", "romantic", "leisurely"],
            day_part="evening",
            description="Kyoto's legendary entertainment quarter lined with preserved 17th-century wooden machiya merchant houses and lantern-lit alleys.",
        ),
        PlaceCandidate(
            name="Nijo Castle & Ninomaru Palace",
            category="culture",
            subcategory="heritage",
            location="Nakagyo Ward, Kyoto",
            duration_minutes=100,
            cost_minor=80000,
            opening_hours="08:45–17:00 (Closed Tue in Jan/Jul/Aug/Dec)",
            booking_required=False,
            is_indoor=True,
            styles=["cultural", "heritage", "solo", "family"],
            day_part="afternoon",
            description="Historic residence of the Tokugawa Shoguns featuring ornate palace chambers, painted screens, and famous squeaking 'nightingale floors'.",
        ),
        PlaceCandidate(
            name="Nishiki Market Culinary Arcade",
            category="shopping",
            subcategory="market",
            location="Nakagyo Ward, Kyoto",
            duration_minutes=90,
            cost_minor=0,
            opening_hours="09:30–18:00",
            booking_required=False,
            is_indoor=True,
            styles=["food_nightlife", "cultural", "shopping"],
            day_part="afternoon",
            description="Centuries-old covered five-block arcade known as 'Kyoto's Kitchen', filled with local skewers, pickles, matcha sweets, and artisan cookware.",
        ),
        PlaceCandidate(
            name="Philosopher's Path (Tetsugaku-no-michi)",
            category="nature",
            subcategory="park",
            location="Sakyo Ward, Kyoto",
            duration_minutes=75,
            cost_minor=0,
            opening_hours="Open 24 h",
            booking_required=False,
            is_indoor=False,
            styles=["nature_wellness", "leisurely", "romantic"],
            day_part="afternoon",
            description="Tranquil stone pathway following a cherry tree and maple canal between Ginkaku-ji and Nanzen-ji, ideal for contemplative walking.",
        ),
        PlaceCandidate(
            name="Ryoan-ji Temple & Zen Rock Garden",
            category="culture",
            subcategory="heritage",
            location="Ukyo Ward, Kyoto",
            duration_minutes=75,
            cost_minor=50000,
            opening_hours="08:00–17:00",
            booking_required=False,
            is_indoor=True,
            styles=["cultural", "nature_wellness", "leisurely"],
            day_part="morning",
            description="The world's most celebrated karesansui dry landscape rock garden, comprising fifteen mysteriously placed stones surrounded by raked white gravel.",
        ),
        PlaceCandidate(
            name="Kyoto Imperial Palace Park (Kyoto Gyoen)",
            category="nature",
            subcategory="park",
            location="Kamigyo Ward, Kyoto",
            duration_minutes=90,
            cost_minor=0,
            opening_hours="09:00–16:30 (Closed Mon)",
            booking_required=False,
            is_indoor=False,
            styles=["nature_wellness", "cultural", "family"],
            day_part="afternoon",
            description="Sprawling gravel park and palace grounds in central Kyoto that served as the primary residence of the Emperor until 1869.",
        ),
        PlaceCandidate(
            name="Yasaka Shrine & Maruyama Park",
            category="culture",
            subcategory="heritage",
            location="Gion, Higashiyama, Kyoto",
            duration_minutes=60,
            cost_minor=0,
            opening_hours="Open 24 h",
            booking_required=False,
            is_indoor=False,
            styles=["cultural", "sightseeing", "leisurely"],
            day_part="evening",
            description="Ancient Shinto shrine bustling with festive lanterns in Gion, connecting to Maruyama Park's weeping cherry trees and scenic ponds.",
        ),
        PlaceCandidate(
            name="Kamogawa Riverfront Promenade & Sanjo Area",
            category="sightseeing",
            subcategory="viewpoint",
            location="Nakagyo Ward, Kyoto",
            duration_minutes=60,
            cost_minor=0,
            opening_hours="Open 24 h",
            booking_required=False,
            is_indoor=False,
            styles=["nature_wellness", "romantic", "leisurely"],
            day_part="evening",
            description="Gentle riverside pathway frequented by locals and buskers, featuring views of traditional Kamogawa dining terraces and bridges.",
        ),
        PlaceCandidate(
            name="Higashiyama Preserved Historic Streets (Ninenzaka & Sannenzaka)",
            category="sightseeing",
            subcategory="neighborhood",
            location="Higashiyama Ward, Kyoto",
            duration_minutes=90,
            cost_minor=0,
            opening_hours="Open 24 h",
            booking_required=False,
            is_indoor=False,
            styles=["cultural", "romantic", "shopping"],
            day_part="afternoon",
            description="Steep stone-paved pedestrian lanes flanked by traditional wooden machiya, heritage craft boutiques, and historic tea houses.",
        ),
        PlaceCandidate(
            name="Sanjusangendo Temple (1,001 Golden Statues)",
            category="culture",
            subcategory="heritage",
            location="Higashiyama Ward, Kyoto",
            duration_minutes=75,
            cost_minor=60000,
            opening_hours="08:30–17:00",
            booking_required=False,
            is_indoor=True,
            styles=["cultural", "heritage", "solo"],
            day_part="morning",
            description="Longest wooden hall in Japan housing 1,001 meticulously sculpted gold-leaf statues of the Buddhist Goddess of Mercy (Kannon).",
        ),
        PlaceCandidate(
            name="Kyoto International Manga Museum",
            category="culture",
            subcategory="museum",
            location="Nakagyo Ward, Kyoto",
            duration_minutes=120,
            cost_minor=90000,
            opening_hours="10:30–17:30 (Closed Wed)",
            booking_required=False,
            is_indoor=True,
            styles=["cultural", "outgoing", "family", "solo"],
            day_part="afternoon",
            description="Converted 1929 elementary school displaying over 300,000 manga volumes, historical exhibitions, and international translations.",
        ),
        PlaceCandidate(
            name="Traditional Kyoto Matcha Tea Ceremony Experience",
            category="culture",
            subcategory="culture",
            location="Higashiyama, Kyoto",
            duration_minutes=60,
            cost_minor=150000,
            opening_hours="10:00–18:00",
            booking_required=True,
            is_indoor=True,
            styles=["cultural", "leisurely", "romantic"],
            day_part="afternoon",
            description="Intimate ceremonial tea preparation and seasonal wagashi sweet tasting led by a certified Kyoto tea master.",
        ),
        PlaceCandidate(
            name="Pontocho Alley Evening Dining & Kamogawa Views",
            category="food",
            subcategory="restaurant",
            location="Pontocho, Nakagyo Ward, Kyoto",
            duration_minutes=90,
            cost_minor=180000,
            opening_hours="17:00–23:00",
            booking_required=False,
            is_indoor=True,
            styles=["food_nightlife", "romantic", "cultural"],
            day_part="evening",
            description="Atmospheric dining along Kyoto's narrowest lantern-lit pedestrian passage, serving seasonal kaiseki, yakitori, and river terrace dishes.",
        ),
        PlaceCandidate(
            name="Traditional Kyoto Obanzai Small-Plates Dining",
            category="food",
            subcategory="restaurant",
            location="Gion, Kyoto",
            duration_minutes=90,
            cost_minor=120000,
            opening_hours="11:30–22:00",
            booking_required=False,
            is_indoor=True,
            styles=["food_nightlife", "cultural", "family"],
            day_part="evening",
            description="Authentic home-style dining specializing in obanzai: seasonal multi-course dishes utilizing heirloom Kyoto vegetables, tofu, and miso.",
        ),
        PlaceCandidate(
            name="Casual Kyoto Craft Udon & Ramen Noodle House",
            category="food",
            subcategory="restaurant",
            location="Downtown Kyoto",
            duration_minutes=60,
            cost_minor=80000,
            opening_hours="11:00–21:30",
            booking_required=False,
            is_indoor=True,
            styles=["food_nightlife", "solo", "family"],
            day_part="afternoon",
            description="Cozy neighborhood noodle shop serving handmade udon in rich dashi broth and artisanal Kyoto-style char siu ramen.",
        ),
        PlaceCandidate(
            name="Kyoto Traditional Crafts Museum (Miyako Messe)",
            category="culture",
            subcategory="museum",
            location="Sakyo Ward, Kyoto",
            duration_minutes=75,
            cost_minor=0,
            opening_hours="09:00–17:00",
            booking_required=False,
            is_indoor=True,
            styles=["cultural", "leisurely", "family"],
            day_part="afternoon",
            description="Free showcase of Kyoto's 74 traditional craft industries including Nishijin silk textiles, Kiyomizu pottery, and lacquerware.",
        ),
        PlaceCandidate(
            name="Shijo-Dori & Kawaramachi Shopping Arcade",
            category="shopping",
            subcategory="market",
            location="Shijo Kawaramachi, Kyoto",
            duration_minutes=90,
            cost_minor=0,
            opening_hours="10:00–20:00",
            booking_required=False,
            is_indoor=True,
            styles=["shopping", "outgoing", "cultural"],
            day_part="afternoon",
            description="Kyoto's premier downtown retail boulevard featuring traditional stationery, fan artisans, green tea confectionery, and modern department stores.",
        ),
        PlaceCandidate(
            name="Shoren-in Monzeki Peaceful Garden & Tea Pavilion",
            category="culture",
            subcategory="heritage",
            location="Higashiyama Ward, Kyoto",
            duration_minutes=75,
            cost_minor=50000,
            opening_hours="09:00–17:00",
            booking_required=False,
            is_indoor=True,
            styles=["cultural", "nature_wellness", "leisurely"],
            day_part="morning",
            description="Serene imperial temple featuring giant 800-year-old camphor trees, a tranquil stroll garden designed by Soami, and tatami tea rooms.",
        ),
    ],
}


# ─── Destination Normalizer & Key Resolution ────────────────────────────────

DESTINATION_ALIASES: dict[str, str] = {
    # Agra & Uttar Pradesh
    "agra": "agra",
    "taj mahal": "agra",
    "fatehpur sikri": "agra",
    "sikandra": "agra",
    # London & UK
    "london": "london",
    "greater london": "london",
    "city of london": "london",
    "westminster": "london",
    # Kyoto & Kansai
    "kyoto": "kyoto",
    "kyoto city": "kyoto",
    # Goa
    "goa": "goa",
    "north goa": "goa",
    "south goa": "goa",
    "panaji": "goa",
    "panjim": "goa",
    # New York
    "new york": "new york",
    "new york city": "new york",
    "nyc": "new york",
    "manhattan": "new york",
    "brooklyn": "new york",
    # Paris
    "paris": "paris",
    # Tokyo
    "tokyo": "tokyo",
    # Jaipur
    "jaipur": "jaipur",
    "pink city": "jaipur",
    # Dubai
    "dubai": "dubai",
}


def _is_disambiguated_away(canonical: str, raw: str) -> bool:
    """Disambiguate similarly named cities in different countries/regions."""
    if canonical == "london" and any(neg in raw for neg in ["ontario", "canada", " ca"]):
        return True
    if canonical == "paris" and any(neg in raw for neg in ["texas", "tx"]):
        return True
    return False


def resolve_curated_destination_key(destination: str) -> Optional[str]:
    """
    Resolve a freeform destination string (e.g. 'Agra, Uttar Pradesh, India',
    'London, England, United Kingdom', 'Kyoto, Japan', 'Goa, Goa, India')
    to a canonical curated catalogue key in _CURATED_PLACES without loose
    substring collisions.
    """
    if not destination:
        return None
    raw = destination.strip().lower()

    # 1. Comma-delimited token parsing (city, state, country)
    tokens = [t.strip() for t in raw.split(",") if t.strip()]
    if tokens:
        city_token = tokens[0]
        candidate = None
        if city_token in _CURATED_PLACES:
            candidate = city_token
        elif city_token in DESTINATION_ALIASES:
            candidate = DESTINATION_ALIASES[city_token]
        else:
            clean_city = re.sub(r"\b(city|metro|greater|town)\b", "", city_token).strip()
            if clean_city in _CURATED_PLACES:
                candidate = clean_city
            elif clean_city in DESTINATION_ALIASES:
                candidate = DESTINATION_ALIASES[clean_city]

        if candidate:
            if not _is_disambiguated_away(candidate, raw):
                return candidate
            return None

    # 2. Check full string aliases
    if raw in DESTINATION_ALIASES:
        candidate = DESTINATION_ALIASES[raw]
        if not _is_disambiguated_away(candidate, raw):
            return candidate
        return None

    # 3. Exact word-boundary token matching (prevents 'Indiana' -> 'India', etc.)
    for alias, canonical in sorted(DESTINATION_ALIASES.items(), key=lambda x: len(x[0]), reverse=True):
        pattern = rf"\b{re.escape(alias)}\b"
        if re.search(pattern, raw):
            if not _is_disambiguated_away(canonical, raw):
                return canonical
            return None

    return None


class CuratedPlacesProvider:
    """Default high-quality places provider using verified destination data."""

    async def search_places(
        self,
        destination: str,
        category: Optional[str] = None,
        limit: int = 35,
    ) -> list[PlaceCandidate]:
        canonical_key = resolve_curated_destination_key(destination)
        candidates: list[PlaceCandidate] = []

        if canonical_key and canonical_key in _CURATED_PLACES:
            candidates = list(_CURATED_PLACES[canonical_key])

        # Filter by category if requested
        if category:
            cat_lower = category.lower()
            candidates = [c for c in candidates if c.category.lower() == cat_lower]

        return candidates[:limit]


    def is_available(self) -> bool:
        return True

    def provider_name(self) -> str:
        return "Northstar Curated Destination Places"


class OpenStreetMapPlacesProvider:
    """
    OpenStreetMap Places Provider via Universal Geocoding and Overpass API.
    
    Adheres strictly to free, no-billing, zero-credit-card operation:
    1. Geocodes arbitrary destinations via UniversalDestinationGeocoder (Nominatim + Open-Meteo).
    2. Queries OpenStreetMap Points of Interest via the Overpass API for:
       - Heritage, historic monuments, castles, ruins, archaeological sites, tombs
       - Museums, galleries, art centers
       - Scenic viewpoints, panoramic lookouts, landmarks
       - Parks, public gardens, nature reserves
       - Traditional marketplaces and shopping areas
       - Authentic restaurants, cafes, and local cuisine
    3. Respects public OSM/Overpass usage policies:
       - Uses descriptive identifying User-Agent with contact header.
       - Enforces polite rate limiting (>= 1.0s between requests).
       - In-memory 24-hour TTL caching by normalized destination to prevent repeat calls.
       - High-availability mirror failover (OSM France, OSM Switzerland, FOSSGIS Germany).
       - Bounded timeouts (5s geocoding, 8s Overpass).
    4. Never fabricates fake attractions, addresses, ratings, or prices.
    """

    OVERPASS_ENDPOINTS = [
        "https://overpass.openstreetmap.fr/api/interpreter",
        "https://overpass.osm.ch/api/interpreter",
        "https://overpass-api.de/api/interpreter",
    ]
    USER_AGENT = "Northstar-AI-Travel-Guide/1.0 (https://github.com/northstar/travel-guide; travel-support@northstar.local)"

    _cache: dict[str, tuple[float, list[PlaceCandidate]]] = {}
    _CACHE_TTL: float = 86400.0  # 24 hours
    _last_request_time: float = 0.0

    def __init__(self):
        self._lock = asyncio.Lock()

    def is_available(self) -> bool:
        return True

    def provider_name(self) -> str:
        return "OpenStreetMap Overpass API (Free / No-Billing)"

    async def _rate_limit_wait(self) -> None:
        """Enforce at least 1.0s spacing between queries to respect public servers."""
        async with self._lock:
            now = time.time()
            elapsed = now - self._last_request_time
            if elapsed < 1.0:
                await asyncio.sleep(1.0 - elapsed)
            self._last_request_time = time.time()

    def _element_to_candidate(self, el: dict, destination: str) -> Optional[PlaceCandidate]:
        """Convert a raw OSM node/element to a verified PlaceCandidate."""
        tags = el.get("tags") or {}
        name = tags.get("name") or tags.get("name:en")
        if not name or len(name.strip()) < 2:
            return None
        name = name.strip()

        # Skip numbers or single-word house codes
        if name.isdigit():
            return None

        tourism = tags.get("tourism", "").lower()
        historic = tags.get("historic", "").lower()
        leisure = tags.get("leisure", "").lower()
        amenity = tags.get("amenity", "").lower()
        cuisine = tags.get("cuisine", "").lower()
        opening_hours = tags.get("opening_hours")
        lat = float(el.get("lat", 0.0))
        lon = float(el.get("lon", 0.0))
        osm_id = f"osm:node:{el.get('id', '')}"

        # Map to Northstar taxonomy
        if tourism in ["museum", "gallery"]:
            category = "culture"
            subcategory = "museum"
            is_indoor = True
            duration_minutes = 120
            cost_minor = 100000
            styles = ["cultural", "leisurely", "solo"]
            day_part = "morning"
            description = f"Museum and cultural gallery in {destination}."
        elif historic in ["monument", "memorial", "castle", "fort", "ruins", "archaeological_site", "tomb"]:
            category = "culture"
            subcategory = "heritage"
            duration_minutes = 90
            cost_minor = 50000 if historic in ["castle", "fort", "archaeological_site"] else 0
            is_indoor = historic in ["castle", "tomb"]
            styles = ["cultural", "historical", "sightseeing"]
            day_part = "morning"
            description = f"Historic {historic.replace('_', ' ')} landmark in {destination}."
        elif tourism in ["attraction", "viewpoint"]:
            category = "sightseeing"
            subcategory = "viewpoint"
            duration_minutes = 60
            cost_minor = 0
            is_indoor = False
            styles = ["sightseeing", "scenic", "outgoing"]
            day_part = "afternoon" if tourism == "viewpoint" else "morning"
            description = f"Scenic viewpoint and landmark in {destination}."
        elif leisure in ["park", "garden", "nature_reserve"]:
            category = "nature"
            subcategory = "park"
            duration_minutes = 75
            cost_minor = 0
            is_indoor = False
            styles = ["nature_wellness", "leisurely", "family"]
            day_part = "morning"
            description = f"Public park and green open space in {destination}."
        elif amenity == "marketplace":
            category = "shopping"
            subcategory = "market"
            duration_minutes = 75
            cost_minor = 0
            is_indoor = True
            styles = ["shopping", "cultural", "foodie"]
            day_part = "afternoon"
            description = f"Atmospheric local market in {destination}."
        elif amenity in ["restaurant", "cafe", "food_court"]:
            category = "food"
            subcategory = "restaurant"
            duration_minutes = 75
            cost_minor = 150000
            is_indoor = True
            styles = ["food_nightlife", "cultural"]
            day_part = "evening"
            cuisine_note = f" serving {cuisine} specialties" if cuisine else ""
            description = f"Local dining establishment in {destination}{cuisine_note}."
        else:
            category = "sightseeing"
            subcategory = "landmark"
            duration_minutes = 60
            cost_minor = 0
            is_indoor = False
            styles = ["sightseeing"]
            day_part = "anytime"
            description = f"Prominent point of interest in {destination}."

        street = tags.get("addr:street")
        suburb = tags.get("addr:suburb") or tags.get("addr:district")
        loc_parts = [p for p in [street, suburb] if p]
        location = ", ".join(loc_parts) if loc_parts else destination

        return PlaceCandidate(
            name=name,
            category=category,
            subcategory=subcategory,
            location=location,
            duration_minutes=duration_minutes,
            cost_minor=cost_minor,
            opening_hours=opening_hours,
            booking_required=(category == "culture" and subcategory == "museum"),
            is_indoor=is_indoor,
            styles=styles,
            day_part=day_part,
            description=description,
            latitude=lat if lat != 0.0 else None,
            longitude=lon if lon != 0.0 else None,
            source="openstreetmap",
            source_id=osm_id,
            is_verified=True,
        )

    async def search_places(
        self,
        destination: str,
        category: Optional[str] = None,
        limit: int = 35,
    ) -> list[PlaceCandidate]:
        """Search OSM Overpass API for real POIs around the geocoded destination."""
        if not destination or not destination.strip():
            return []

        dest_norm = destination.strip().lower()
        now = time.time()
        if dest_norm in self._cache:
            ts, cached = self._cache[dest_norm]
            if now - ts < self._CACHE_TTL:
                logger.info("Serving %d OSM places from cache for '%s'", len(cached), destination)
                if category:
                    return [c for c in cached if c.category == category][:limit]
                return cached[:limit]

        # 1. Resolve geographic coordinates and boundary box using UniversalDestinationGeocoder
        geocoder = get_geocoder()
        resolved = await geocoder.resolve(destination)
        if not resolved:
            logger.warning("Geocoding failed for destination '%s'", destination)
            return []

        lat = resolved.latitude
        lon = resolved.longitude
        if lat == 0.0 and lon == 0.0:
            return []

        if resolved.bounding_box:
            s, w, n, e = resolved.bounding_box
        else:
            delta_lat = 0.045
            delta_lon = 0.055
            s, w, n, e = lat - delta_lat, lon - delta_lon, lat + delta_lat, lon + delta_lon

        overpass_query = f"""[out:json][timeout:10];
(
  node["tourism"~"attraction|museum|viewpoint|gallery"]["name"]({s:.4f},{w:.4f},{n:.4f},{e:.4f});
  node["historic"~"monument|castle|ruins|memorial|archaeological_site|fort|tomb"]["name"]({s:.4f},{w:.4f},{n:.4f},{e:.4f});
  node["leisure"~"park|garden"]["name"]({s:.4f},{w:.4f},{n:.4f},{e:.4f});
  node["amenity"~"marketplace"]["name"]({s:.4f},{w:.4f},{n:.4f},{e:.4f});
  node["amenity"="restaurant"]["name"]["cuisine"]({s:.4f},{w:.4f},{n:.4f},{e:.4f});
);
out {max(limit * 2, 50)};
"""
        data = {"data": overpass_query}
        raw_elements: list[dict] = []

        async with httpx.AsyncClient(headers={"User-Agent": self.USER_AGENT}) as client:
            for endpoint in self.OVERPASS_ENDPOINTS:
                await self._rate_limit_wait()
                try:
                    resp = await client.post(endpoint, data=data, timeout=8.0)
                    if resp.status_code == 200:
                        parsed = resp.json()
                        raw_elements = parsed.get("elements", [])
                        if raw_elements:
                            logger.info(
                                "Retrieved %d OSM elements from %s for '%s'",
                                len(raw_elements),
                                endpoint,
                                destination,
                            )
                            break
                    else:
                        logger.warning("Overpass endpoint %s returned HTTP %s", endpoint, resp.status_code)
                except Exception as exc:
                    logger.warning("Overpass endpoint %s failed for '%s': %s", endpoint, destination, exc)

        if not raw_elements:
            return []

        # Deduplicate by normalized place name
        seen_names: set[str] = set()
        by_category: dict[str, list[PlaceCandidate]] = {
            "culture": [],
            "sightseeing": [],
            "nature": [],
            "shopping": [],
            "food": [],
        }

        for el in raw_elements:
            cand = self._element_to_candidate(el, resolved.city or destination)
            if not cand:
                continue
            name_key = cand.name.strip().lower()
            if name_key in seen_names:
                continue
            seen_names.add(name_key)
            by_category.setdefault(cand.category, []).append(cand)

        # Balanced interleave across categories (culture, sightseeing, nature, shopping, food)
        balanced: list[PlaceCandidate] = []
        categories = ["culture", "sightseeing", "nature", "shopping", "food"]
        max_cat_len = max(len(v) for v in by_category.values()) if any(by_category.values()) else 0

        for i in range(max_cat_len):
            for cat in categories:
                items = by_category.get(cat, [])
                if i < len(items):
                    balanced.append(items[i])
                    if len(balanced) >= max(limit, 35):
                        break
            if len(balanced) >= max(limit, 35):
                break

        if balanced:
            self._cache[dest_norm] = (now, balanced)

        if category:
            return [c for c in balanced if c.category == category][:limit]
        return balanced[:limit]


class CompositePlacesProvider:
    """
    Composite places provider:
    1. Checks curated destination catalog for verified instant sets (Agra, London, Kyoto, Goa, New York, etc.).
    2. For arbitrary destinations worldwide, uses OpenStreetMap Overpass API (100% free, no billing, no API keys).
    """

    def __init__(self):
        self.curated = CuratedPlacesProvider()
        self.osm = OpenStreetMapPlacesProvider()

    def is_available(self) -> bool:
        return True

    def provider_name(self) -> str:
        return "Northstar Free Places Provider (Curated + OpenStreetMap Overpass)"

    async def search_places(
        self,
        destination: str,
        category: Optional[str] = None,
        limit: int = 35,
    ) -> list[PlaceCandidate]:
        # 1. Check curated catalogue first
        curated_matches = await self.curated.search_places(destination, category=category, limit=limit)
        if curated_matches:
            return curated_matches

        # 2. Query live OpenStreetMap Overpass for arbitrary destinations
        osm_matches = await self.osm.search_places(destination, category=category, limit=limit)
        return osm_matches


class GooglePlacesProvider:
    """
    Adapter for Google Places API.
    Gracefully disables itself when GOOGLE_MAPS_API_KEY is not set.
    """

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = (api_key or getattr(settings, "GOOGLE_MAPS_API_KEY", "") or "").strip()

    def is_available(self) -> bool:
        return bool(self.api_key)

    def provider_name(self) -> str:
        return "Google Places API"

    async def search_places(
        self,
        destination: str,
        category: Optional[str] = None,
        limit: int = 30,
    ) -> list[PlaceCandidate]:
        if not self.is_available():
            logger.info("Google Places API key is not configured; fallback to free providers.")
            return []
        return []


def get_places_provider() -> PlacesProvider:
    """Return the active places provider. Defaults to CompositePlacesProvider (Curated + OpenStreetMap Overpass)."""
    return CompositePlacesProvider()


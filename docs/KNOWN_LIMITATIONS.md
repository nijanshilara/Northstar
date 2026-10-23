# Known Limitations — Northstar

This document tracks known limitations, trade-offs, and design boundaries across Northstar's architecture.

---

## 1. Destination-Aware Smart Itinerary Planning

- **Places Provider Architecture**:
  - The curated places provider ships with high-fidelity, verified entries for major destinations (Paris, Tokyo, London, Goa, Jaipur, Dubai, New York, etc.).
  - For unlisted cities and towns, the platform dynamically adapts generic templates with destination qualifiers (e.g., "Historic District Walking Tour in Florence") rather than fabricating unverifiable venue names or fake phone numbers.
  - An optional external Google Places provider protocol is implemented; when no API key is provided, the platform operates in a truthful provider-unavailable state and falls back seamlessly to curated and adapted candidate generation.

- **AI Model Generation vs. Deterministic Schedule Engine**:
  - Stage A gathers candidate places and live/cached Open-Meteo weather forecasts.
  - Stage B sends candidates to the Gemini API (when configured) with strict schema validation.
  - If the AI model is rate-limited, unavailable, returns truncated JSON, or no API key is configured, the system falls back seamlessly to the deterministic Python schedule engine (`schedule_builder.py`).

- **Weather-Aware Planning**:
  - Weather integration uses Open-Meteo's 7-day forecast. For trips planned more than 7 days in advance, historical weather patterns or neutral seasonal assumptions are used. Forecasts are never fabricated.
  - On rainy forecast days (precipitation > 1.5mm or rain/snow WMO codes), indoor activities receive priority boosts and weather advisory notes are added to the day's schedule.

---

## 2. Flight & Hotel Booking

- Flight and hotel search links redirect to trusted aggregator providers (Google Flights, Skyscanner, MakeMyTrip, Booking.com).
- Direct on-platform booking and real-time seat inventory require formal Global Distribution System (GDS) or airline merchant credentials (e.g. Amadeus Enterprise).
- As per project safety rules, bookings are never marked as "confirmed" unless an active payment provider confirms the transaction.

---

## 3. Storage & Deployments

- SQLite is used for local development and demo environments. Production deployments on serverless hosts (such as Vercel) require an external database provider (e.g. Supabase, Neon PostgreSQL) as serverless filesystems are ephemeral.

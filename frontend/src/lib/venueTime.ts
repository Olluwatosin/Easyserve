/**
 * What time it is *at the venue*, and what to call it.
 *
 * Mirrors `backend/app/utils/venue_time.py`. Two rules carry over, and both
 * matter more here than they look:
 *
 * **Venue time, not browser time.** An owner checking takings from London at
 * 9pm their time is looking at a Lagos floor at 10pm. A greeting from the
 * browser's clock would tell them "good evening" on the right night and "good
 * morning" on the wrong one, and the number underneath it belongs to a business
 * day computed in Lagos either way.
 *
 * **The day rolls at 6AM, not midnight.** A lounge at 2am is still in Friday
 * night. "Good morning" is the literal truth and the wrong thing to say to
 * someone four hours into a shift — so the small hours keep the evening's
 * greeting, and "Friday" stays Friday until the floor is empty.
 */

/** IANA zone, same string as VENUE_TZ_NAME on the backend. No DST in Lagos. */
export const VENUE_TZ = "Africa/Lagos";

/** A nightlife "day" runs 6AM → 6AM local. */
export const BUSINESS_DAY_START_HOUR = 6;

/** Hour of day, 0–23, at the venue. */
export function venueHour(now: Date = new Date()): number {
  const hour = new Intl.DateTimeFormat("en-GB", {
    timeZone: VENUE_TZ,
    hour: "numeric",
    hourCycle: "h23",
  }).format(now);
  return Number(hour);
}

/**
 * Which night this instant belongs to, e.g. "Friday".
 *
 * At 1am on Saturday this is still Friday — the night the venue, its staff and
 * its takings are all still in.
 */
export function businessWeekday(now: Date = new Date()): string {
  // Shifting the instant back by the rollover works because Lagos has a fixed
  // offset: no DST means wall-clock and elapsed time never disagree.
  const shifted = new Date(now.getTime() - BUSINESS_DAY_START_HOUR * 3_600_000);
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: VENUE_TZ,
    weekday: "long",
  }).format(shifted);
}

/** Is the venue in the part of the day it exists for? */
export function isNight(now: Date = new Date()): boolean {
  const h = venueHour(now);
  return h >= 17 || h < BUSINESS_DAY_START_HOUR;
}

/**
 * "Good morning" / "Good afternoon" / "Good evening", by venue time.
 *
 * Midnight to 6am deliberately keeps "Good evening": the night has not ended,
 * and greeting someone with the next morning while they are still working it
 * is the kind of small wrongness that makes software feel like it is not paying
 * attention.
 */
export function greeting(now: Date = new Date()): string {
  const h = venueHour(now);
  if (h < BUSINESS_DAY_START_HOUR) return "Good evening";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

# Changelog

Product versions use `Ver. XX.YY` plus a human-readable date. Bump both `number` and `releaseDate` together in `src/lib/version.ts` for every release (XX = major updates, YY = minor changes and bug fixes). The site footer always shows both, for example **Ver. 2.0 · September 15, 2026**.

## Unreleased

Village hosts belong to one Marin Villages community (Tiburon, Mill Valley, Novato, San Rafael, Twin Cities, or Ross Valley) and manage that village’s events only. Super-administrators assign the village and still see every community. Existing events stay Mill Valley.

Members sign up from the public events list with email only. After they are signed up, that card says **Cancel my planned attendance at** the event. **My events** lists every signup across villages and uses the same cancel action. Cancelling restores the open-seat count from before that signup.

Upcoming lists hide an event after its Pacific end time and sort the ones still ahead soonest first. Past gatherings stay on My events in a collapsed section, and hosts can open them from Past events. An event with no responses can be permanently deleted. An event with registrations is cancelled instead, which keeps the guest list and waiver signatures.

Hosts can invite people from an event dashboard. Paste emails or import registrants from another event in their village (super-administrators can import from any village). Each invitation is a private link that prefills the email and uses the normal registration flow. The pilot stores those emails in an Outbox instead of sending them.

Every event has an event type. Super-administrators manage types and waivers at `/host/event-types`. A type may have one waiver, and each waiver version may include up to four questions. Neighbors answer those questions, agree, and type their full name before registering, including when the event is full. Signing the current version once is enough until the waiver text or questions change. Existing registrations stay in place. Answers are visible only to super-administrators and the host of that event’s village.

## Ver. 2.0 · September 15, 2026

Administrator and sub-administrator host roles.

- **Administrators** can manage every event and appoint, promote, demote, or remove hosts at `/host/admins`.
- **Sub-administrators** can create events and manage only the events they created. They cannot change anyone’s role.
- Existing hosts default to administrator (`hosts.role`, ALTER-safe on SQLite/Turso).
- Footer chrome shows the product version and release date on every page.

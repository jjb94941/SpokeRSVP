# Changelog

Product versions use `Ver. XX.YY` plus a human-readable date. Bump both `number` and `releaseDate` together in `src/lib/version.ts` for every release (XX = major updates, YY = minor changes and bug fixes). The site footer always shows both, for example **Ver. 2.0 · September 15, 2026**.

## Ver. 2.0 · September 15, 2026

Administrator and sub-administrator host roles.

- **Administrators** can manage every event and appoint, promote, demote, or remove hosts at `/host/admins`.
- **Sub-administrators** can create events and manage only the events they created. They cannot change anyone’s role.
- Existing hosts default to administrator (`hosts.role`, ALTER-safe on SQLite/Turso).
- Footer chrome shows the product version and release date on every page.

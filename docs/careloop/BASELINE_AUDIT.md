# Baseline audit and verification

The work starts from HumanoidTH upstream commit `bef80bdfe895f9403af910951fa251c9baacad2b`. Existing routes and data models remain in place. The initial audit was performed on 20 October 2026, with code checks repeated before publication on 21 October 2026.

## Selected upstream gaps

| Observed gap | Change | Verification or remaining limit |
| --- | --- | --- |
| Production build on Windows failed during dependency tracing after a custom Prisma output caused a home-directory glob | Generate Prisma Client at its default location and import from `@prisma/client` | Production build passed in the prepared Windows environment; model fields and dependency versions were not changed |
| Contribution-map analysis failure created fixed substitute clusters and could cache them | Remove the substitute records; failed analysis returns no clusters without writing cache | Four regression cases cover existing cache, analysis failure, successful caching and refresh failure |
| Overview setup instructions referred to legacy Python setup while the active app uses Prisma/PostgreSQL | Show the actual Prisma generate/schema/seed commands | Checked against the existing repository scripts |
| Network UI called its existing JSON cache a file fallback | Describe it as a local JSON cache | Behavior is preserved; the wording does not certify the contents |
| Robot registry had no problem-first search | Add CareLoop within the existing `/robots` route | Ten search regression tests and production-build browser checks |

## Checks

The prepared environment passed the following on 21 October 2026:

```text
node --import tsx --test test/*.test.ts
node node_modules/typescript/bin/tsc --noEmit --incremental false
node --import tsx scripts/assert-no-mock-data.ts
git diff --check
```

The unit suite contains 17 tests: three classifier cases, four map/cache cases and ten search cases. Map tests deliberately simulate an unavailable analysis service; expected error messages in those tests are not failures.

Production build passed again on 21 October 2026. `/robots` browser QA passed on 20 October 2026. Browser checks covered Thai education and communication examples, missing evidence, unknown queries, clearing, empty-input validation, unchanged URL, all 17 existing registry cards, and 390×844 / 1280×900 viewports.

## Scope not certified

- This audit does not claim full end-to-end coverage of every original route, ingestion adapter, admin permission or deployment environment.
- Existing `StatsCache` rows have no provenance field. Old map-cache contents were not deleted or certified by guessing their origin. The code change prevents new substitute clusters from being generated after analysis failure.
- Exact URL/canonical-name association does not validate an excerpt's meaning or every source record's quality.
- The static no-mock-data guard is not a database-quality certificate.
- No physical robot trial, clinical evaluation, user study or public live deployment has been completed.

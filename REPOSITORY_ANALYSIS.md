# Repository Analysis: Marine-Work-Hour-Balance (ShiftCycle 18)

## 1) Project purpose and product shape

This repository contains a client-side React + TypeScript application for tracking work hours in 18-day cycles, calculating adjusted targets for exceptions (e.g., training/transfer), and producing a formal report statement for HR/admin workflows.

Key product goals visible from code:
- Model and edit an 18-day cycle with domain-specific shift categories.
- Calculate worked hours, target reductions, and net balance.
- Persist cycle/pref data locally with backup/restore.
- Support multilingual UX (English and Traditional Chinese).

## 2) Technical architecture (high level)

- **UI shell and state orchestration:** `App.tsx`
  - Loads/saves cycle data and preferences.
  - Handles cycle navigation and linked previous-balance logic.
  - Coordinates calendar/day-card/stats/wizard/report UI flow.
- **Domain types and constants:** `types.ts`
  - Entry model, hour constants, and 4-pattern team rotation utilities.
- **Core calculation engine:** `utils/balanceUtils.ts`
  - Computes total worked hours, adjusted target, and net balance.
- **Persistence layer:** `services/storageService.ts`
  - localStorage-backed cycle and preference storage, plus backup/restore helpers.
- **Report generation layer:** `services/geminiService.ts`
  - Generates markdown report text from computed stats and entries.

Overall, this is a mostly single-page, client-only architecture with clear separation between view orchestration, pure calculation logic, and storage/report services.

## 3) What is working well

1. **Strong domain modeling**
   - `EntryType`, `DayEntry`, and constants are explicit and readable.
   - Team rotation logic is documented and encapsulated.

2. **Good separation of responsibilities**
   - Calculation logic is isolated (`balanceUtils.ts`) and mostly pure.
   - Storage/report concerns are kept in dedicated service modules.

3. **Operationally practical feature set**
   - Backup/restore, cycle carry-over behavior, and multilingual templates are valuable for real-world administrative workflows.

4. **Reasonable UX intent for edge cases**
   - App attempts to compute effective previous balances and survive missing cycles.

## 4) Risks, gaps, and technical debt

1. **No automated tests configured**
   - There are no scripts for unit/integration tests in `package.json`.
   - Core math/business rules (balance, target reduction, time-off handling) are unprotected by regression tests.

2. **Potentially unsafe storage clearing behavior**
   - `clearAllData` calls `localStorage.clear()`, which wipes **all** origin storage, not just this app’s keys.

3. **Version/doc mismatch**
   - README claims React 19 while `package.json` currently pins React 18.2.

4. **Large app coordinator component**
   - `App.tsx` carries many responsibilities and substantial state, increasing maintenance complexity.

5. **Time/date sensitivity risks**
   - Logic relies on local `Date` arithmetic and day boundaries. It may behave differently around timezone changes or DST boundaries.

6. **Data growth strategy**
   - All cycles are stored in one localStorage JSON blob. While acceptable for modest use, this can become brittle/slow for long-term heavy usage.

## 5) Recommended next steps (prioritized)

### High priority
1. Add unit tests for:
   - `calculateCycleStats` covering all `EntryType`s and mixed-cycle scenarios.
   - Pattern utilities (`getTeamRotationForDate`, `getPatternNameForDate`) across positive/negative date offsets.
2. Fix storage clearing to remove only app-owned keys.
3. Align README stack declaration with actual dependency versions.

### Medium priority
4. Split `App.tsx` into feature hooks/modules (cycle state, persistence sync, reporting state).
5. Centralize date utility helpers and add DST-safe tests.

### Lower priority
6. Consider lightweight data migration/versioning strategy for future schema changes.
7. Add a lint/typecheck/test CI workflow.

## 6) Suggested quality metrics to track

- Calculation test coverage for balance engine.
- Time-to-render for cycle navigation on low-end mobile devices.
- Number of localStorage corruption/restore incidents.
- Defect rate in generated formal report statements.

## 7) Summary assessment

The repository has a solid domain foundation and practical end-user functionality, with sensible module boundaries for a client-only app. The most important improvements are around test coverage of core business math, safer storage clearing behavior, and maintainability improvements in the main app coordinator.

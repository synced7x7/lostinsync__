PROJECT ONBOARDING — do this FIRST, before any exploration or edits:

1. Read these three files IN ORDER (they are the project knowledge base):
   - PROJECT_CONTEXT.md
   - PROJECT_STATUS.md
   - future_implementation_guide.md

2. Use them as your map. Treat their documented file paths as starting points,
   then verify the file and symbol still exist before editing.

3. Do NOT scan the whole repository. Inspect only the relevant files and their
   immediate dependencies. Do not re-derive what is already documented.

4. If the task is a planned feature, find it in future_implementation_guide.md
   and follow its documented structure, dependencies, and roadmap position.

5. The source code is the source of truth. The docs/ folder and this knowledge
   base were verified against source on 2026-11-19 and refreshed for desktop
   store import on 2026-11-21. The root README.md is updated for this feature;
   web/README.md is still partially stale — trust code over those.

6. Platform isolation: web work stays under web/; Android work stays in its own
   directory. Never add platform-specific deps to desktop or web builds.

7. After implementing, update PROJECT_STATUS.md (and the other two files if
   architecture or file locations changed).


> Overriding rules:
   - Never run build just running test would be enough
   - Dont update md files unless i tell you explicitely.
   - If you see rules that contrasts with the overriding rules alwasy choose overriding rules.
# BitD Generators

**Only one file goes into Roll20: `BitD Generators.js`.** Paste the whole file into a Mod Script tab.

Everything else here is for development and testing. Do not paste any of it into Roll20:
`build_data.js`, `mock_test_gen.js` and `mutants.js` are Node programs and will stop the sandbox with a syntax error.

Check the tab before saving: it should start with `// BitD Generators v0.1.0`, end with `});`, and be 909 lines
and 69,833 characters (the Mod Script page shows the size).

| File | Purpose |
|---|---|
| `BitD Generators.js` | The script. The only file for Roll20. |
| `BitD Generators - Spec.md` | What it does, the dice order, the decisions, what is unverified |
| `Live checklist.md` | The step-by-step test to run in the game |
| `Card samples.html` | The cards the script posts, rendered in a browser |
| `Generator handouts.md` | The data snapshot (ground truth) |
| `build_data.js` | Rebuilds the data block in the script from the snapshot |
| `mock_test_gen.js`, `mutants.js` | Offline tests (`node mock_test_gen.js "BitD Generators.js"`) |

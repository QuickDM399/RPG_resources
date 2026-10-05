// Breaks "BoB Token Action Maker.js" on purpose, one line at a time, and checks that mock_test_bob.js notices.
// Usage: node mutants.js "BoB Token Action Maker.js" translation.json [blades.html] [other scripts...]
// A mutant that makes the test run fail is "caught". One that still passes is "SURVIVED" and means a gap in the tests.
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');
const script = process.argv[2];
const rest = process.argv.slice(3);
const SRC = fs.readFileSync(script, 'utf8');

const MUTANTS = [
  ['dice fields lose their trailing commas', "(i < n ? ',' : '')", "''"],
  ['zero dice only at a pool below 0', "if (pool > 0) {\n      n = Math.min(pool, MAX_DICE);", "if (pool >= 0) {\n      n = Math.min(pool, MAX_DICE);"],
  ['resist cost base 5 instead of 6', 'var RESIST_BASE = 6;', 'var RESIST_BASE = 5;'],
  ['a single six counts as a critical', ".length >= 2;\n    }\n    var cid = w.t.ch.id", ".length >= 1;\n    }\n    var cid = w.t.ch.id"],
  ['zero dice take the highest die', 'if (w.zero) { best = Math.min.apply(null, vals); }', 'if (w.zero) { best = Math.max.apply(null, vals); }'],
  ['stress boxes 9 (Blades in the Dark)', 'var BASE_STRESS = 6;', 'var BASE_STRESS = 9;'],
  ['stress maximum 12', 'var MAX_STRESS = 10;', 'var MAX_STRESS = 12;'],
  ['trauma on the last box instead of past it', 'if (cur + n > max) {\n      whisper', 'if (cur + n >= max) {\n      whisper'],
  ['trauma boxes 4 (Blades in the Dark)', 'var BASE_TRAUMA = 2;', 'var BASE_TRAUMA = 4;'],
  ['corruption resets at the sixth point', 'var CORRUPTION_RESET = 7;', 'var CORRUPTION_RESET = 6;'],
  ['four blight boxes become five', 'var BLIGHT_MAX = 4;', 'var BLIGHT_MAX = 5;'],
  ['stress does not reset after trauma', 'var STRESS_RESETS_ON_TRAUMA = true;', 'var STRESS_RESETS_ON_TRAUMA = false;'],
  ['load does not restore armor', 'var LOAD_RESETS_ARMOR = true;', 'var LOAD_RESETS_ARMOR = false;'],
  ['bar 1 is not linked', 'var LINK_STRESS_BAR = true;', 'var LINK_STRESS_BAR = false;'],
  ['bar edits are not turned into trauma', 'var AUTO_TRAUMA = true;', 'var AUTO_TRAUMA = false;'],
  ['anyone may use any character', "return cb.indexOf('all') >= 0 || cb.indexOf(msg.playerid) >= 0;\n  }", "return true;\n  }"],
  ['sheet types are not checked', "if (type !== 'character') {", "if (false) {"],
  ['the ability marker is the BitD one', "var MARK = 'bob-tam';", "var MARK = 'bitd-tam';"],
  ['the macro name resembles the command', "var MACRO_NAME = 'LEGION_TAM';", "var MACRO_NAME = 'BOBTAM_SETUP';"],
  ['the command word is !bob', "var CMD = '!bobtam';", "var CMD = '!bob';"],
  ['a stress offer can be used twice', 'delete offers[o.idx];', ''],
  ['the offer is not tied to the character', 'off.c !== cid || ', ''],
  ['the offer is not tied to the amount', ' || off.n !== n', ''],
  ['fortune position loses the short card', "position === 'Fortune' ? '{{short=short}}' :", "position === 'Fortune' ? '{{position=Fortune}}' :"],
  ['the results block is missing', ' {{results=1}} {{result_crit', ' {{result_crit'],
  ['the position field is missing', "'{{position=' + position + '}}'", "'{{pos=' + position + '}}'"],
  ['unticked abilities are listed', "if (String(getAttrByName(cid, 'repeating_ability_' + r.row + '_check')) !== '1') { return; }", ''],
  ['the specialist action no longer counts for insight', "if (sp && getNum(cid, sp, 0) > 0) { n++; }", ''],
  ['heavy armor writes the wrong attribute', "['heavy', 'armor_heavy', 'Heavy armor']", "['heavy', 'armor_heavy2', 'Heavy armor']"],
  ['xp tracks stop at 8', "['insight', 'insight_xp', 'Insight', 6]", "['insight', 'insight_xp', 'Insight', 8]"],
  ['playbook xp stops at 6', "['playbook', 'playbook_xp', 'Playbook', 8]", "['playbook', 'playbook_xp', 'Playbook', 6]"],
  ['corruption gives no blight', 'addBox(cid, \'blight\', res.blights);', ''],
  ['leftover corruption points are dropped', "if (cur >= CORRUPTION_RESET) { cur = 0; blights++; }", "if (cur >= CORRUPTION_RESET) { cur = 0; blights++; break; }"],
  ['title key is mistyped', "{{title-' + key + '=1}} {{type=action}} {{subtitle='", "{{titl-' + key + '=1}} {{type=action}} {{subtitle='"],
  ['character names are not cleaned in cards', "{{subtitle=' + clean(t.c.name) + ' ^{rolls}}} ' +\n      posField", "{{subtitle=' + t.c.name + ' ^{rolls}}} ' +\n      posField"],
  ['unknown actions are rolled', "if (ACTION_KEYS.indexOf(key) < 0) { whisper(msg, 'BoB: unknown action", "if (false) { whisper(msg, 'BoB: unknown action"],
  ['harm overwrites a filled slot', "if (!free && !String(getAttr(cid, s, '')).trim()) { free = s; }", "if (!free) { free = s; }"],
  ['a full harm level is not bumped', 'if (!free) { level++; }', 'if (!free) { level = 4; }'],
  ['harm level 4 writes harm3', "note(msg, t.c, 'Harm', 'Level 4: fatal harm'", "setAttr(cid, 'harm3', text); note(msg, t.c, 'Harm', 'Level 4: fatal harm'"],
  ['harm clear accepts any attribute', "if (!/^harm(3|2_1|2_2|1_1|1_2)$/.test(String(slot)))", "if (false)"],
  ['healing ticks are cleared with the harm', "setAttr(cid, slot, '');\n    note(msg, t.c, 'Harm', 'Cleared'", "setAttr(cid, slot, ''); setAttr(cid, 'harm3_check', 0);\n    note(msg, t.c, 'Harm', 'Cleared'"],
  ['uses never run out', "if (used >= rating) { note(msg, t.c, cap(sk), 'No uses left'", "if (false) { note(msg, t.c, cap(sk), 'No uses left'"],
  ['spend writes the wrong attribute', "setAttr(cid, sk + '_uses', used + 1);", "setAttr(cid, sk + '_use', used + 1);"],
  ['the stress bar is not synced after a change', "setAttr(cid, 'stress', next);\n    syncStressBarsLater(cid);\n    note(msg, t.c, 'Stress', 'Stress ' + next + ' / ' + max, bar(next, max));\n  }\n\n  function doStress", "setAttr(cid, 'stress', next);\n    note(msg, t.c, 'Stress', 'Stress ' + next + ' / ' + max, bar(next, max));\n  }\n\n  function doStress"],
  ['the bar max is not kept up to date', "if (String(g.get('bar1_max')) !== String(max)) { g.set('bar1_max', max); dbg('bar 1 max set to ' + max + ' on token ' + g.id); }", ''],
  ['a stale bar is not healed', "if (String(tok.get('bar1_value')) !== cur) { tok.set('bar1_value', cur);", "if (false) { tok.set('bar1_value', cur);"],
  ['the load card lists every tier', 'if (LOAD_TIERS.indexOf(tier) > LOAD_TIERS.indexOf(current)) { return; }', ''],
  ['hidden items are listed', "if (String(getAttrByName(cid, id + '_show')) !== '1') { return; }", ''],
  ['the pair choice is not exclusive', "setAttr(cid, it.id + '_check', it.check === pick ? '0' : pick);", "setAttr(cid, it.id + '_check', '1');"],
  ['a pool above 12 is not capped', 'n = Math.min(pool, MAX_DICE);', 'n = pool;'],
  ['title_text is cleaned of its braces', "var tt = String(getAttr(cid, 'title_text', '')).replace(/[\\r\\n]+/g, ' ').trim();", "var tt = clean(getAttr(cid, 'title_text', ''));"],
  ['the debug switch is open to players', "if (!playerIsGM(msg.playerid)) { whisper(msg, 'BoB: only the GM can switch debugging.'); return; }", ''],
  ['errors escape the handler', "} catch (e) {\n        log('BoB error: '", "} catch (e) { throw e;\n        log('BoB error: '"],
  ['the resist watch never expires', "if (Date.now() - w.at > 60000) { continue; }", ''],
  ['the mismatch with the sheet rating is not reported', "if (!isNaN(stored) && stored !== rating) {", "if (false) {"],
  ['trauma goes past the last box', "setAttr(cid, tr.attr, Math.min(getNum(cid, tr.attr, 0) + k, max));", "setAttr(cid, tr.attr, getNum(cid, tr.attr, 0) + k);"],
  ['the sheet stress_max is read', "function stressMax(cid) { return clamp(BASE_STRESS + getNum(cid, 'setting_extra_stress', 0), BASE_STRESS, MAX_STRESS); }", "function stressMax(cid) { return getNum(cid, 'stress_max', 9); }"]
];

let caught = 0, survived = [];
MUTANTS.forEach(([name, from, to]) => {
  const n = SRC.split(from).length - 1;
  if (n < 1) { console.log('NOT FOUND (fix the mutant): ' + name); survived.push(name + ' (pattern not found)'); return; }
  const tmp = path.join(os.tmpdir(), 'bob_mutant_' + process.pid + '.js');
  fs.writeFileSync(tmp, SRC.replace(from, () => to));
  const args = [path.join(__dirname, 'mock_test_bob.js'), tmp].concat(rest);
  const r = cp.spawnSync('node', args, { encoding: 'utf8' });
  fs.unlinkSync(tmp);
  const m = /(\d+) passed, (\d+) failed/.exec(r.stdout || '');
  const failed = m ? parseInt(m[2], 10) : -1;
  if (r.status !== 0 || failed !== 0) { caught++; console.log('caught   (' + (failed >= 0 ? failed + ' failing' : 'crashed') + '): ' + name); }
  else { survived.push(name); console.log('SURVIVED: ' + name); }
});
console.log('\n' + caught + ' of ' + MUTANTS.length + ' broken versions were caught by the tests.');
if (survived.length) { console.log('Survivors:\n  ' + survived.join('\n  ')); process.exitCode = 1; }

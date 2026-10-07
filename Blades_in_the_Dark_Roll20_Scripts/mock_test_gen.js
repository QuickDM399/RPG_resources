'use strict';
// Offline test for "BitD Generators.js". A mock Roll20 API (same idea as mock_test.js for the
// Token Action Maker) with FORCED DICE: tests push the exact die results they want, and the mock
// fails the test if the script rolls a die of the wrong size, rolls more dice than forced, or
// leaves forced dice unused.
//
// Run:   node mock_test_gen.js "BitD Generators.js"
// The ES5 check uses acorn when it can be required (NODE_PATH or a local node_modules);
// otherwise a regex scan is used and the output says so.
//
// Nothing here can show how Roll20 renders cards or delivers buttons; see "Live checklist.md".

const fs = require('fs');
const vm = require('vm');
const path = require('path');
const cp = require('child_process');

const SCRIPT_PATH = path.resolve(process.argv[2] || path.join(__dirname, 'BitD Generators.js'));
const DATA_PATH = path.join(__dirname, 'Generator handouts.md');
const SRC = fs.readFileSync(SCRIPT_PATH, 'utf8');
const IS_REAL_SCRIPT = path.basename(SCRIPT_PATH) === 'BitD Generators.js';
const Q = '’'; // curly apostrophe, as in the handouts
const HUM = 'Humanoid with bestial or Elemental Features';

let pass = 0, fail = 0;
function short(x) { const s = typeof x === 'string' ? x : JSON.stringify(x); return s.length > 500 ? s.slice(0, 500) + '...' : s; }
function ok(cond, label, extra) { if (cond) { pass++; } else { fail++; console.log('FAIL:', label, extra !== undefined ? '\n   ' + short(extra) : ''); } }
function eq(a, b, label) { const x = JSON.stringify(a), y = JSON.stringify(b); ok(x === y, label, x === y ? undefined : { got: a, want: b }); }
const has = (arr, re) => arr.some(t => re.test(t));

// ---------------------------------------------------------------------------------------------
// Mock Roll20
// ---------------------------------------------------------------------------------------------
function makeEnv() {
  let n = 0; const nid = () => '-id' + (++n);
  const store = { players: [], macros: [], handouts: [] };
  const out = [], logs = [], handlers = {}, queue = [], rolled = [];
  let rng = null;
  const kinds = { player: 'players', macro: 'macros', handout: 'handouts' };
  const wrap = (arr, rec) => ({
    id: rec.id,
    get: (k, cb) => { const v = rec[k]; if (cb) { cb(v); return undefined; } return v; },
    set: (k, v) => { if (typeof k === 'object') { Object.assign(rec, k); } else { rec[k] = v; } },
    remove: () => { const i = arr.indexOf(rec); if (i >= 0) { arr.splice(i, 1); } }
  });
  const env = {
    log: (s) => { logs.push(String(s)); },
    on: (ev, fn) => { (handlers[ev] = handlers[ev] || []).push(fn); },
    state: {},
    sendChat: (who, text, cb) => { if (cb) { throw new Error('sendChat was given a callback: Roll20 would not post the message'); } out.push({ who, text }); },
    playerIsGM: (id) => !!(store.players.find(p => p.id === id) || {}).gm,
    getObj: (type, id) => { const r = (store[kinds[type]] || []).find(x => x.id === id); return r ? wrap(store[kinds[type]], r) : undefined; },
    findObjs: (q) => {
      const arr = store[kinds[q._type]] || [];
      return arr.filter(r => Object.keys(q).every(k => k === '_type' || r[k] === q[k])).map(r => wrap(arr, r));
    },
    createObj: (type, props) => { const rec = Object.assign({ id: nid() }, props); store[kinds[type]].push(rec); return wrap(store[kinds[type]], rec); },
    randomInteger: (m) => {
      let v;
      if (queue.length) {
        v = queue.shift();
        if (!Number.isInteger(v) || v < 1 || v > m) { throw new Error('forced die ' + v + ' is not valid for a d' + m + ' (the script rolled a d' + m + ')'); }
      } else if (rng) { v = 1 + Math.floor(rng() * m); }
      else { throw new Error('the script rolled a d' + m + ' but no die was forced'); }
      rolled.push(m + ':' + v);
      return v;
    }
  };
  const before = new Set(Object.keys(env));
  const ctx = vm.createContext(env);
  vm.runInContext(SRC, ctx);
  const api = {
    env, store, out, logs, rolled,
    newGlobals: Object.keys(env).filter(k => !before.has(k)),
    player(name, gm) { const rec = { id: nid(), _displayname: name, gm: !!gm }; store.players.push(rec); return rec.id; },
    handout(name, notes) { const rec = { id: nid(), name, notes }; store.handouts.push(rec); return rec; },
    ready() { (handlers.ready || []).forEach(h => h()); },
    dice() { for (let i = 0; i < arguments.length; i++) { const a = arguments[i]; if (Array.isArray(a)) { a.forEach(x => queue.push(x)); } else { queue.push(a); } } },
    clearDice() { queue.length = 0; },
    left() { return queue.length; },
    seed(s) { let a = s >>> 0; rng = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; },
    run(content, playerid) {
      out.length = 0; rolled.length = 0;
      (handlers['chat:message'] || []).forEach(h => h({ type: 'api', content, playerid, who: 'x' }));
      return out.map(o => o.text);
    },
    say(content, playerid) { out.length = 0; (handlers['chat:message'] || []).forEach(h => h({ type: 'general', content, playerid, who: 'x' })); return out.map(o => o.text); },
    sizes() { return rolled.map(x => +x.split(':')[0]); },
    st() { return env.state.BitDGen; },
    lastId() { const s = env.state.BitDGen; return s.order[s.order.length - 1]; },
    card(id) { return env.state.BitDGen.cards[id !== undefined ? id : api.lastId()]; },
    line(key, id) { return api.card(id).lines.find(x => x.key === key); },
    items(key, id) { const l = api.line(key, id); return l ? l.items.map(i => i.text) : undefined; },
    hrefs(html) { const r = []; const re = /href="([^"]*)"/g; let m; while ((m = re.exec(html))) { r.push(m[1]); } return r; }
  };
  return api;
}

function fresh() {
  const E = makeEnv(); const gm = E.player('GM', true), pat = E.player('Pat', false);
  E.ready(); E.logs.length = 0;
  return { E, gm, pat };
}

// run a command with forced dice; every forced die must be used and none may be missing
function go(E, gm, cmd, dice, label) {
  E.dice(dice || []);
  let o;
  try { o = E.run(cmd, gm); } catch (e) { ok(false, label + ': threw', e.message); return []; }
  const left = E.left(); if (left) { E.clearDice(); }
  ok(left === 0, label + ': every forced die was used', left);
  ok(!has(o, /hit an error/), label + ': no error notice', o.map(short));
  return o;
}

// run many (command, dice, expected) cases and report mismatches in one assertion
function sweep(label, E, gm, cases) {
  const bad = [];
  cases.forEach(c => {
    E.dice(c.dice);
    let o; try { o = E.run(c.cmd, gm); } catch (e) { bad.push([c.cmd, c.dice, 'threw ' + e.message]); E.clearDice(); return; }
    const left = E.left(); if (left) { E.clearDice(); bad.push([c.cmd, c.dice, 'unused dice ' + left]); return; }
    if (has(o, /hit an error/)) { bad.push([c.cmd, c.dice, 'error notice']); return; }
    const got = c.get ? c.get(E) : E.items(c.key)[0];
    if (JSON.stringify(got) !== JSON.stringify(c.want)) { bad.push([c.cmd, c.dice, got, c.want]); }
  });
  ok(bad.length === 0, label + ' (' + cases.length + ' rolls)', bad.slice(0, 3));
}

const ENT = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#8635;': '↻' };
function plain(html) { return html.replace(/<br\/>/g, '\n').replace(/<[^>]+>/g, ' ').replace(/&(amp|lt|gt|quot|#8635);/g, m => ENT[m]).replace(/[ \t]+/g, ' '); }

// every posted card must be well formed: balanced tags, safe hrefs, escaped text
let maxSize = 0;
function htmlProblem(t) {
  const html = t.replace(/^\/(w gm|direct) /, '');
  maxSize = Math.max(maxSize, html.length);
  const stack = []; const re = /<(\/?)([a-zA-Z]+)([^>]*)>/g; let m, last = 0;
  while ((m = re.exec(html))) {
    const text = html.slice(last, m.index); last = re.lastIndex;
    if (/[<>]/.test(text)) { return 'raw angle bracket in text'; }
    if (/&(?!(amp|lt|gt|quot|#\d+);)/.test(text)) { return 'unescaped ampersand: ' + text.slice(0, 40); }
    if (m[3].trim().slice(-1) === '/') { continue; }
    if (m[1]) { const top = stack.pop(); if (top !== m[2]) { return 'unbalanced </' + m[2] + '> (open: ' + top + ')'; } }
    else { stack.push(m[2]); }
    if (m[2] === 'a' && !m[1]) {
      const h = /href="([^"]*)"/.exec(m[3]);
      if (!h || !/^!bitdgen( [A-Za-z0-9]+)*$/.test(h[1])) { return 'bad href ' + (h ? h[1] : '(none)'); }
      if ((m[3].match(/"/g) || []).length % 2 !== 0) { return 'odd quotes in <a>'; }
    }
  }
  if (stack.length) { return 'unclosed ' + stack.join(','); }
  if (/&(?!(amp|lt|gt|quot|#\d+);)/.test(html.slice(last))) { return 'unescaped ampersand at the end'; }
  if (/undefined|NaN|\[object/.test(plain(html))) { return 'undefined, NaN or [object] shown on the card'; }
  return '';
}
function checkHtml(t, label) { const why = htmlProblem(t); ok(why === '', (label || 'html') + ': well formed', why + ' | ' + t.slice(0, 160)); }
function checkAll(o, label) { o.forEach(t => checkHtml(t, label)); }

// ---------------------------------------------------------------------------------------------
// Independent reading of the data file (does not use build_data.js)
// ---------------------------------------------------------------------------------------------
const MD = fs.readFileSync(DATA_PATH, 'utf8');
function blockOf(name) { const b = '<!-- BEGIN HANDOUT ' + name + ' -->\n', e = '<!-- END HANDOUT ' + name + ' -->'; return MD.slice(MD.indexOf(b) + b.length, MD.indexOf(e)); }
function cells(line) { return line.trim().slice(1, -1).split('|').map(c => c.trim()); }
function tablesOf(name) {
  const lines = blockOf(name).split('\n'), res = [];
  for (let i = 0; i < lines.length; i++) {
    const m = /^\*Table (\d+): (\d+) rows x (\d+) columns/.exec(lines[i]);
    if (!m) { continue; }
    let j = i + 1; while (!lines[j].startsWith('|')) { j++; }
    const rows = []; while (lines[j] && lines[j].startsWith('|')) { rows.push(cells(lines[j])); j++; }
    res.push({ n: +m[1], R: +m[2], C: +m[3], header: rows[0], body: rows.slice(2) });
  }
  return res;
}
const FIXES = [['annointed', 'anointed'], ['Thew Cloud of Woe', 'The Cloud of Woe'], ['acoylyte', 'acolyte'], ['sewing the seeds', 'sowing the seeds'], ['Stairs, Ramps. Terraces', 'Stairs, Ramps, Terraces'], ['Ecstacy', 'Ecstasy']];
function fx(s) { FIXES.forEach(f => { s = s.split(f[0]).join(f[1]); }); return s; }
const grid = (t) => t.body.map(r => r.slice(1).map(fx));
function d66(rows, col) { const a = new Array(36); rows.forEach(r => { const m = /^([1-6]) ?([1-6])$/.exec(r[0]); a[(+m[1] - 1) * 6 + (+m[2] - 1)] = fx(r[col]); }); return a; }
function paragraphs(name) { return blockOf(name).split('\n').filter(l => l.length > 0 && !/^[#|*\-]/.test(l) && !/^\d+\. /.test(l) && !/^\s+- /.test(l)); }
function numberedGroups(name, afterHeading, untilHeading) {
  const lines = blockOf(name).split('\n'); let i = lines.indexOf(afterHeading) + 1; const groups = []; let cur = null;
  for (; i < lines.length && lines[i] !== untilHeading; i++) {
    const m = /^(\d+)\. (.*)$/.exec(lines[i]);
    if (m) { if (!cur) { cur = []; groups.push(cur); } cur.push(m[2]); } else if (lines[i] === '') { cur = null; }
  }
  return groups;
}
function scoreFile() {
  const sc = blockOf('Scores').split('\n');
  const listUnder = (h) => { const i = sc.indexOf(h); const out = []; for (let j = i + 1; j < sc.length && out.length < 6; j++) { const m = /^- \d (.*)$/.exec(sc[j]); if (m) { out.push(fx(m[1])); } } return out; };
  const ti = sc.indexOf('### Twist or Complication'), tc = sc.indexOf('### Connected to A Person...'), fi = sc.indexOf('### ... and Factions');
  const tw = sc.slice(ti + 1, tc).filter(l => /^- \d /.test(l)).map(l => fx(l.replace(/^- \d /, '')));
  const facts = new Array(36); sc.slice(fi).forEach(l => { const m = /^- ([1-6])([1-6]) (.*)$/.exec(l); if (m) { facts[(+m[1] - 1) * 6 + (+m[2] - 1)] = fx(m[3]); } });
  return {
    client: ['#### Civilian', '#### Criminal', '#### Political', '#### Strange'].map(listUnder),
    work: ['#### Skullduggery', '#### Violence', '#### Underworld', '#### Unnatural'].map(listUnder),
    twist: [tw.slice(0, 6), tw.slice(6, 12), tw.slice(12, 18)],
    connected: listUnder('### Connected to A Person...'),
    factions: facts
  };
}
const P = tablesOf('People'), V = tablesOf('Devils'), S = tablesOf('Streets & Buildings'), R = tablesOf('Rumors');
const SC = scoreFile();
const orRows = (t) => t.body.map(r => { const c = r.slice(1).filter(Boolean); return { a: fx(c[0]), b: fx(c[2]) }; });
const FACES = [1, 2, 3, 4, 5, 6];

// ---------------------------------------------------------------------------------------------
// A. Static checks on the script
// ---------------------------------------------------------------------------------------------
{
  ok(!/[^\x00-\x7f]/.test(SRC), 'source is plain ASCII');
  let acorn = null; try { acorn = require('acorn'); } catch (e) { /* optional */ }
  if (acorn) {
    let good = true, why = '';
    try { acorn.parse(SRC, { ecmaVersion: 5 }); } catch (e) { good = false; why = e.message; }
    ok(good, 'source parses as ES5 (acorn)', why);
  } else {
    console.log('note: acorn not available, ES5 checked by regex scan only');
    const noStr = SRC.replace(/'(?:[^'\\\n]|\\.)*'/g, "''").replace(/\/\/.*$/gm, '');
    ok(!/=>|`|\blet\b|\bconst\b|\bclass\b/.test(noStr), 'no ES6 syntax found (regex scan)');
  }
  const chk = cp.spawnSync(process.execPath, ['--check', SCRIPT_PATH]);
  ok(chk.status === 0, 'node --check passes', String(chk.stderr));
  ok(/^var BitDGen = BitDGen \|\| \(function \(\) \{\r?\n    'use strict';/m.test(SRC), 'one IIFE with use strict');
  ok(!/Math\.random/.test(SRC), 'no Math.random: all dice come from randomInteger');
  ok(!/sendChat\([^;]*function\s*\(/.test(SRC.replace(/\n/g, ' ')), 'sendChat is never given a callback');
  ok(!/\bsetTimeout\b|\bsetInterval\b/.test(SRC), 'no timers');
  eq(makeEnv().newGlobals, ['BitDGen'], 'the only global the script adds is BitDGen');
  ok(!/GEN|BITD/i.test('DUSK_ROLL'), 'macro name does not resemble the command');
  if (IS_REAL_SCRIPT) {
    const r = cp.spawnSync(process.execPath, [path.join(__dirname, 'build_data.js'), '--check']);
    ok(r.status === 0, 'embedded data block is current with the data file (build_data.js --check)', String(r.stderr) + String(r.stdout).slice(0, 200));
  }
}

// ---------------------------------------------------------------------------------------------
// B. Data: every table and list against an independent reading of the data file
// ---------------------------------------------------------------------------------------------
{
  const E = makeEnv(); const D = E.env.BitDGen._data;
  // the counts printed in the data file match what was parsed (independent of the build script)
  [['People', P], ['Devils', V], ['Streets & Buildings', S], ['Rumors', R]].forEach(x => {
    x[1].forEach(t => {
      const headered = t.header.some(c => c !== '');
      ok(t.R === t.body.length + (headered ? 1 : 0), x[0] + ' table ' + t.n + ': printed row count ' + t.R + ' matches', t.body.length);
      ok(t.header.length === t.C && t.body.every(r => r.length === t.C), x[0] + ' table ' + t.n + ': every row has ' + t.C + ' cells');
    });
  });
  eq([P.length, V.length, S.length, R.length], [6, 6, 9, 3], 'table counts per handout');
  // People
  eq(D.people.looks, grid(P[0]), 'People Looks grid, all 36 cells');
  eq(D.people.goals.rows, grid(P[1]), 'People Goals rows');
  eq(D.people.goals.labels, ['1, 2', '3, 4', '5, 6'], 'People Goals labels');
  eq(D.people.methods.rows, grid(P[2]), 'People Preferred Methods rows');
  eq(D.people.methods.labels, ['1, 2', '3, 4', '5, 6'], 'People Preferred Methods labels');
  eq(D.people.jobsCommon, grid(P[3]), 'People Professions Common');
  eq(D.people.jobsRare, grid(P[4]), 'People Professions Rare');
  eq([D.people.traits, D.people.interests, D.people.quirks], [d66(P[5].body, 1), d66(P[5].body, 2), d66(P[5].body, 3)], 'People Traits / Interests / Quirks by d66 index');
  eq(P[5].body.length, 36, 'Traits table has 36 rows');
  eq(D.people.gender.items, ['Man', 'Woman', 'Ambiguous, Concealed', 'Roll Again'], 'People gender list');
  eq(D.people.gender.die, [0, 0, 1, 1, 2, 3], 'gender: 1,2 Man; 3,4 Woman; 5 Ambiguous; 6 Roll Again');
  eq(D.people.heritage.items, ['Akorosi', 'Foreigner'], 'People heritage');
  eq(D.people.heritage.die, [0, 0, 0, 1, 1, 1], 'heritage: 1-3 Akorosi, 4-6 Foreigner');
  eq(D.people.foreigners.items, ['Skovlander', 'Iruvian', 'Dagger Islander', 'Severosi', 'Tycherosi'], 'Foreigners');
  eq(D.people.foreigners.die, [0, 0, 1, 2, 3, 4], 'foreigners: 1,2 Skovlander; 3 Iruvian; 4 Dagger Islander; 5 Severosi; 6 Tycherosi');
  eq(D.people.tycherosiNote, "Remember, each Tycherosi has a demonic trait: cat's eyes, claws, feathers instead of hair, etc.", 'Tycherosi reminder text');
  const pp = paragraphs('People');
  eq(D.people.style.join(' '), pp.find(l => l.startsWith('Tricorn Hat')), 'Style items rejoin to the handout paragraph exactly');
  eq(D.people.style.length, 37, '37 style items');
  const names = pp.slice(pp.indexOf('Names') + 1);
  ok(names.length === 3, 'three Names paragraphs', names.length);
  const nm = names.map(l => l.split(', ').map(s => s.replace(/\.$/, '')));
  eq(D.people.names, [].concat(nm[0], nm[1], nm[2]), 'Names: all three paragraphs, as written, in one pool');
  eq([nm[0].length, nm[1].length, nm[2].length, D.people.names.length], [83, 48, 39, 170], 'Names counts 83 + 48 + 39 = 170');
  ok(D.people.names.indexOf('Booker. Ankhayat') >= 0 && D.people.names.indexOf('Da lmore') >= 0, 'Names left exactly as written (not typos)');
  ['Bricks', 'Cross', 'Ring', 'Helles'].forEach(w => eq(D.people.names.filter(x => x === w).length, 2, 'Names: ' + w + ' appears twice and is not de-duplicated'));
  // Devils
  eq(D.devils.ghostTraits, grid(V[0]), 'Devils Ghost Traits grid');
  eq(D.devils.ghostEffects.rows, grid(V[1]), 'Ghostly Secondary Effects rows');
  eq(D.devils.ghostEffects.labels, ['1-3', '4,5', '6'], 'Secondary Effects labels');
  eq(D.devils.ghostEffects.die, [0, 0, 0, 1, 1, 2], 'Secondary Effects: 1-3, 4-5, 6');
  eq(D.devils.affinity, V[2].body[0].slice(1), 'Demon Types Affinity');
  eq(D.devils.aspect, V[2].body[1].slice(1), 'Demon Types Aspect');
  eq(D.devils.aspect.slice(0, 3), [HUM, HUM, HUM], 'Aspect columns 1 to 3 are the same text');
  eq(D.devils.desires.rows, grid(V[3]), 'Demon Desires rows');
  eq(D.devils.desires.labels, ['1,2', '3,4', '5,6'], 'Demon Desires labels');
  eq(D.devils.horrors, grid(V[4]), 'Summoned Horrors');
  eq(D.devils.gods, d66(V[5].body, 1), 'Forgotten Gods by d66 index (with approved fixes)');
  eq(D.devils.practices, d66(V[5].body, 2), 'Cult Practices by d66 index (with approved fixes)');
  const dp = blockOf('Devils').split('\n');
  eq(D.devils.demonNames, dp[dp.indexOf('#### Demon Names') + 2].split(', '), 'Demon Names (17)');
  eq(D.devils.demonNames.length, 17, '17 demon names');
  const featLine = dp[dp.indexOf('#### Demon Features') + 2];
  const wordsOf = (s) => s.replace(/,/g, '').split(/\s+/).filter(Boolean);
  eq(wordsOf(D.devils.features.join(' ')), wordsOf(featLine.replace(/\.$/, '')), 'Demon Features: the 19 items use exactly the handout words in order');
  eq(D.devils.features.length, 19, '19 demon features');
  // verified examples named in the handoff
  eq(D.devils.ghostTraits[0], ['Jealous', 'Desperate', 'Violent', 'Hysterical', 'Skittish', 'Fleeting'], 'verified: Ghost Traits row 1');
  eq(D.devils.ghostTraits[2], ['Prophetic', 'Insightful', 'True', 'Revelatory', 'Guiding', 'Instructive'], 'verified: Ghost Traits row 3');
  eq(D.devils.ghostTraits[5], ['Mad', 'Chaotic', 'Bizarre', 'Destructive', 'Insane', 'Vile'], 'verified: Ghost Traits row 6');
  eq(D.people.looks[0], ['Large', 'Lovely', 'Weathered', 'Chiseled', 'Handsome', 'Athletic'], 'verified: Looks grid row 1');
  eq(D.people.goals.rows[0], ['Wealth', 'Power', 'Authority', 'Prestige, Fame', 'Control', 'Knowledge'], 'verified: Goals row "1, 2"');
  eq(D.devils.affinity, ['Sea, Water', 'Darkness', 'Earth, Metal', 'Fire, Smoke', 'Sky, Stars', 'Storm, Wind'], 'verified: Demon Types Affinity');
  // Streets and Buildings
  eq(D.streets.mood, S[0].body.map(r => r[1]), 'Streets Mood (headerless 6x2)');
  eq([D.streets.sights, D.streets.sounds, D.streets.smells], [1, 2, 3].map(c => S[1].body.map(r => r[c])), 'Streets Impressions columns');
  eq(D.streets.use.rows, grid(S[2]), 'Streets Use rows');
  eq(D.streets.use.labels, ['1-3', '4,5', '6'], 'Streets Use labels');
  eq(D.streets.type.rows, grid(S[3]), 'Streets Type rows');
  eq(D.streets.type.die, [0, 0, 0, 1, 1, 2], 'Streets Type: 1-3, 4-5, 6');
  eq(D.streets.details, grid(S[4]), 'Streets Details (with the comma fix)');
  eq(D.streets.details[1][0], 'Stairs, Ramps, Terraces', 'Streets Details row 2 first cell: comma');
  eq(D.streets.props, numberedGroups('Streets & Buildings', '#### Props', '### Buildings'), 'Streets Props: nine lists');
  eq(D.streets.props.length, 9, 'nine prop lists');
  eq(D.buildings.material, S[5].body[0].slice(1), 'Buildings Exterior Material');
  eq(D.buildings.exterior, S[5].body[1].slice(1), 'Buildings Exterior Details');
  eq(D.buildings.useCommon, grid(S[6]), 'Buildings Use Common');
  eq(D.buildings.useRare, grid(S[7]), 'Buildings Use Rare');
  eq(D.buildings.details, grid(S[8]), 'Buildings Details');
  eq(D.buildings.items, numberedGroups('Streets & Buildings', '#### Items', undefined), 'Buildings Items: five lists');
  eq(D.buildings.items.map(l => l.length), [6, 6, 6, 6, 4], 'Items: last list has only 4 items, gap not filled');
  // Scores
  eq(D.scores.clientTarget.lists, SC.client, 'Scores Client / Target lists');
  eq(D.scores.clientTarget.names, ['Civilian', 'Criminal', 'Political', 'Strange'], 'Client / Target list names');
  eq(D.scores.work.lists, SC.work, 'Scores Work lists');
  eq(D.scores.work.names, ['Skullduggery', 'Violence', 'Underworld', 'Unnatural'], 'Work list names');
  eq(D.scores.twist, SC.twist, 'Scores Twist: three lists');
  eq(D.scores.connected, SC.connected, 'Scores Connected to');
  eq(D.scores.factions, SC.factions, 'Scores Factions by d66 index');
  eq(D.scores.connectedNote.slice(0, 40), 'When a score is generated outside the cr', 'Connected note text kept');
  // Rumors
  const ov = blockOf('Rumors').split('\n'); const oi = ov.indexOf('## Overheard in Duskwall'), oe = ov.indexOf('#### Rumors on The Street');
  const ex = [[]]; ov.slice(oi + 1, oe).forEach(l => { if (l === '---') { ex.push([]); } else if (l !== '') { ex[ex.length - 1].push(l.replace(/^\*/, '').replace(/\*$/, '')); } });
  if (!ex[ex.length - 1].length) { ex.pop(); }
  eq(D.rumors.overheard, ex, 'Overheard: exchanges, each kept whole');
  eq(D.rumors.overheard.length, 8, 'eight overheard exchanges');
  eq(D.rumors.street, orRows(R[0]), 'Rumors on The Street: A and B for every row (row 4 misaligned cell handled)');
  eq(D.rumors.street[3].b, 'The Church of the Ecstasy of the Flesh is seeking a new Apex.', 'row 4 option B read from its misaligned cell, spelling fixed');
  eq(D.rumors.news, grid(R[1]), 'City Events grid');
  eq(D.rumors.occurrence, orRows(R[2]), 'Remarkable Occurrences A and B');
  // handout record, snapshot and keywords
  eq(D.handouts.map(h => [h.name, h.size, h.chars, h.sum]), [['People', 31134, 7961, -424111957], ['Devils', 22840, 7570, 1205235654], ['Streets & Buildings', 26008, 6951, 1037768505], ['Scores', 6858, 3540, -2045712683], ['Rumors', 11145, 4841, 469780444]], 'handout sizes and checksums recorded as in the data file');
  eq(D.snapshot, '2026-10-05', 'snapshot date');
  ok(D.people.heritage.items.indexOf('Foreigner') >= 0 && D.people.foreigners.items.indexOf('Tycherosi') >= 0 && D.people.gender.items.indexOf('Roll Again') >= 0 && D.scores.clientTarget.lists[3][0] === 'Ghost of (roll again)', 'rule keywords present in the data');
  // approved fixes: exactly the typed list changed
  eq(D.fixes.map(f => [f.from, f.to, f.count]), [['annointed', 'anointed', 2], ['Thew Cloud of Woe', 'The Cloud of Woe', 1], ['acoylyte', 'acolyte', 2], ['sewing the seeds', 'sowing the seeds', 1], ['Stairs, Ramps. Terraces', 'Stairs, Ramps, Terraces', 1], ['Ecstacy', 'Ecstasy', 2]], 'the fix report lists the six approved fixes with their counts');
  const copy = Object.assign({}, D); delete copy.fixes;   // the fix report itself names the old spellings
  const allText = JSON.stringify(copy);
  ['annointed', 'Thew ', 'acoylyte', 'sewing', 'Ecstacy', 'Ramps. Terraces'].forEach(w => ok(allText.indexOf(w) < 0, 'fixed text gone from the data: ' + w));
  ok(allText.indexOf('Ecstasy of the Flesh') >= 0, 'Ecstasy spelling present');
}

// ---------------------------------------------------------------------------------------------
// C. Startup, macro, state, coexistence
// ---------------------------------------------------------------------------------------------
{
  const E = makeEnv(); const gm = E.player('GM', true); E.player('Pat', false);
  E.store.macros.push({ id: 'm-other1', name: 'BLADES_TAM', action: '!bitd setup', visibleto: 'all', _playerid: gm });
  E.store.macros.push({ id: 'm-other2', name: 'ODDS_CALL', action: '!bitdpe new', visibleto: 'all', _playerid: gm });
  E.store.macros.push({ id: 'm-other3', name: 'CREW_TAM', action: '!bitdcrew setup', visibleto: 'all', _playerid: gm });
  E.env.state.BitDTAM = { keep: 1 }; E.env.state.BitDPE = { keep: 2 }; E.env.state.BoBMissions = { keep: 3 }; E.env.state.BitDCrewTAM = { keep: 4 };
  E.ready();
  const m = E.store.macros.find(x => x.name === 'DUSK_ROLL');
  ok(m && m._playerid === gm && m.visibleto === '' && m.istokenaction === false, 'macro DUSK_ROLL created, owned by the GM, GM-only', m);
  ok(m && /^!bitdgen \?\{Generator\|NPC,npc\|/.test(m.action) && /Menu,menu\}$/.test(m.action), 'macro asks for a generator', m && m.action);
  ['npc', 'name', 'ghost', 'demon', 'horror', 'cult', 'street', 'building', 'score', 'rumor', 'overheard', 'news', 'occurrence', 'menu'].forEach(g => ok(m.action.indexOf(',' + g) > 0, 'macro offers ' + g));
  ok(!/GEN|BITD/i.test(m.name), 'macro name has no GEN or BITD');
  eq(E.store.macros.filter(x => x.name === 'BLADES_TAM' || x.name === 'ODDS_CALL' || x.name === 'CREW_TAM').map(x => x.action), ['!bitd setup', '!bitdpe new', '!bitdcrew setup'], 'other scripts macros untouched (including the crew script CREW_TAM)');
  eq([E.env.state.BitDTAM, E.env.state.BitDPE, E.env.state.BoBMissions, E.env.state.BitDCrewTAM], [{ keep: 1 }, { keep: 2 }, { keep: 3 }, { keep: 4 }], 'other scripts state untouched (including BitDCrewTAM)');
  ok(has(E.logs, /BitD Generators v0\.1\.0 ready/), 'ready log line with the version', E.logs);
  E.ready();
  eq(E.store.macros.filter(x => x.name === 'DUSK_ROLL').length, 1, 'a second start does not duplicate the macro');
  m.action = '!bitdgen old'; E.ready();
  ok(/Menu,menu\}$/.test(m.action) && E.store.macros.filter(x => x.name === 'DUSK_ROLL').length === 1, 'a stale macro is repaired in place', m.action);
  const E2 = makeEnv(); E2.player('Pat', false); E2.ready();
  eq(E2.store.macros.length, 0, 'no GM: no macro, no crash');
  const E3 = makeEnv(); E3.player('GM', true);
  E3.env.state.BitDGen = { version: '0.0.1', schema: 0, mode: 'public', debug: true, nextId: 9, cards: { 1: { junk: true } }, order: [1] };
  E3.ready();
  const s3 = E3.st();
  ok(s3.schema === 1 && s3.mode === 'public' && s3.debug === true && s3.nextId === 1 && Object.keys(s3.cards).length === 0 && s3.order.length === 0, 'state from another schema: cards dropped, settings kept', s3);
  const E4 = makeEnv(); E4.player('GM', true); E4.ready();
  eq([E4.st().mode, E4.st().debug, E4.st().schema], ['whisper', false, 1], 'fresh state defaults: whisper, debug off');
}
{
  const { E, gm } = fresh();
  ['!bitd', '!bitd setup', '!bitdpe new 1', '!bitdcrew', '!bitdcrew setup', '!bitdgenx npc', '!missions', '!bob', '!bitdg', '!BITDGEN npc', 'bitdgen npc', '!bitdgen2'].forEach(c => {
    const o = E.run(c, gm); ok(o.length === 0 && Object.keys(E.st().cards).length === 0 && E.rolled.length === 0, 'ignored: ' + c, o);
  });
  ok(E.say('!bitdgen npc', gm).length === 0, 'a non-api message is ignored');
  const exact = (content, word) => content.trim().split(/\s+/)[0] === word;
  ['!bitd', '!bitdpe', '!bitdcrew'].forEach(w => ok(!exact('!bitdgen npc', w), 'a script matching ' + w + ' exactly ignores !bitdgen'));
  eq(E.newGlobals, ['BitDGen'], 'no other globals leaked');
}

// ---------------------------------------------------------------------------------------------
// D. Permissions
// ---------------------------------------------------------------------------------------------
{
  const { E, gm, pat } = fresh();
  ['!bitdgen', '!bitdgen npc', '!bitdgen ghost 5', '!bitdgen re 1 name', '!bitdgen share 1', '!bitdgen debug on', '!bitdgen mode public', '!bitdgen info', '!bitdgen check', '!bitdgen menu'].forEach(c => {
    const stBefore = JSON.stringify(E.st());
    const o = E.run(c, pat);
    ok(o.length === 1 && o[0] === '/w "Pat" The BitD generators are GM-only.', 'player refused: ' + c, o);
    ok(E.rolled.length === 0 && JSON.stringify(E.st()) === stBefore, 'player command rolls nothing and changes no state: ' + c);
  });
  go(E, gm, '!bitdgen npc name', [5], 'gm card');
  const before = JSON.stringify(E.card(1).lines);
  ['re 1 name', 'all 1', 'add 1 name', 'share 1', 'var 1 name'].forEach(c => { const o = E.run('!bitdgen ' + c, pat); ok(o.length === 1 && /GM-only/.test(o[0]), 'player cannot press: ' + c, o); });
  ok(JSON.stringify(E.card(1).lines) === before && E.rolled.length === 0, 'player button presses change nothing');
  ok(E.run('!bitdgen', gm).length === 1, 'GM may run the menu');
  const E2 = makeEnv(); E2.player('GM', true); const q2 = E2.player('Sam "the" Player', false); E2.ready();
  const o2 = E2.run('!bitdgen npc', q2);
  ok(o2.length === 1 && o2[0] === '/w "Sam the Player" The BitD generators are GM-only.', 'refusal strips quotes from the player name', o2);
}

// ---------------------------------------------------------------------------------------------
// E. Hand-worked examples (typed from the data file, not from the script)
// ---------------------------------------------------------------------------------------------
{ // NPC
  const { E, gm } = fresh();
  const o = go(E, gm, '!bitdgen npc', [1, 5, 3, 3, 2, 6, 7, 4, 2, 1, 6, 3, 4, 5, 2, 4, 1, 2, 2], 'npc card');
  eq(E.sizes(), [170, 6, 6, 6, 6, 6, 37].concat(new Array(12).fill(6)), 'npc: dice sizes in the documented order');
  eq(['name', 'heritage', 'looks', 'style', 'goal', 'method', 'job', 'trait', 'interest', 'quirk'].map(k => E.items(k)[0]),
    ['Adric', 'Foreigner: Iruvian', 'Woman, Scarred', 'Hooded Coat', 'Revenge', 'Strategy', 'Fishmonger', 'Cooperative', 'Hunting, shooting', 'Once hollowed, then restored. Immune to spirits.'], 'npc card values');
  ok(o.length === 1 && /^\/w gm /.test(o[0]), 'card is whispered to the GM', o[0].slice(0, 30));
  checkAll(o, 'npc card');
  const txt = plain(o[0]);
  ok(/Adric/.test(txt) && /Foreigner: Iruvian/.test(txt) && /Woman, Scarred/.test(txt) && /Job \(common\)/i.test(txt), 'card shows the results', txt.slice(0, 300));
  ok(/d6 4 \(row 3, 4\), d6 2/.test(txt) && /d66 52/.test(txt) && /grid 3,4/.test(txt) && /d170 1/.test(txt), 'dice are shown on the card', txt.slice(0, 700));
  ok(!/demonic trait/.test(txt), 'no Tycherosi reminder unless Tycherosi');
}
{ // Names, Style
  const { E, gm } = fresh();
  sweep('Names pool: first, last of each paragraph and the odd entries', E, gm, [[1, 'Adric'], [83, 'Zara'], [84, 'Arran'], [88, 'Booker. Ankhayat'], [131, 'Walund'], [132, 'Bell'], [170, 'Wicker']].map(x => ({ cmd: '!bitdgen name', dice: [x[0]], key: 'name', want: x[1] })));
  go(E, gm, '!bitdgen name', [5], 'name size'); eq(E.sizes(), [170], 'Names: one d170');
  const o = go(E, gm, '!bitdgen npc style', [3], 'style 3');
  eq([E.items('style')[0], E.sizes()], ['Hood & Veil', [37]], 'Style roll 3 is a d37');
  ok(o[0].indexOf('Hood &amp; Veil') > 0 && o[0].indexOf('Hood & Veil') < 0, 'ampersand escaped in the card');
  sweep('Style: spot checks', E, gm, [[1, 'Tricorn Hat'], [7, 'Hooded Coat'], [27, 'Hide & Furs'], [37, 'Wheelchair']].map(x => ({ cmd: '!bitdgen npc style', dice: [x[0]], key: 'style', want: x[1] })));
  go(E, gm, '!bitdgen name', [1], 'name for add'); const id = E.lastId();
  go(E, gm, '!bitdgen add ' + id + ' name', [1, 2], 'add name, first roll a duplicate');
  eq(E.items('name', id), ['Adric', 'Aldo'], 'a duplicate second name is re-rolled');
}
{ // Heritage, Looks
  const { E, gm } = fresh();
  sweep('Heritage dice -> result', E, gm, [[[1], 'Akorosi'], [[2], 'Akorosi'], [[3], 'Akorosi'], [[4, 1], 'Foreigner: Skovlander'], [[6, 2], 'Foreigner: Skovlander'], [[5, 3], 'Foreigner: Iruvian'], [[4, 4], 'Foreigner: Dagger Islander'], [[6, 5], 'Foreigner: Severosi'], [[4, 6], 'Foreigner: Tycherosi']].map(x => ({ cmd: '!bitdgen npc heritage', dice: x[0], key: 'heritage', want: x[1] })));
  const o = go(E, gm, '!bitdgen npc heritage', [5, 6], 'tycherosi');
  ok(/each Tycherosi has a demonic trait: cat's eyes/.test(plain(o[0])), 'Tycherosi shows the handout reminder');
  go(E, gm, '!bitdgen npc heritage', [2], 'akorosi'); ok(E.line('heritage').items[0].note === undefined, 'no reminder for Akorosi');
  sweep('Looks: gender then grid', E, gm, [[[1, 1, 1], 'Man, Large'], [[2, 6, 6], 'Man, Tattooed'], [[3, 1, 2], 'Woman, Lovely'], [[4, 4, 5], 'Woman, Elegant'], [[5, 2, 1], 'Ambiguous, Concealed, Slim']].map(x => ({ cmd: '!bitdgen npc looks', dice: x[0], key: 'looks', want: x[1] })));
  const o2 = go(E, gm, '!bitdgen npc looks', [6, 6, 2, 1, 1], 'roll again twice');
  eq(E.items('looks')[0], 'Man, Large', 'gender 6 means roll again (twice here), then 2 is Man');
  ok(/d6 6 \(roll again\), d6 6 \(roll again\), d6 2 \(Man\); grid 1,1/.test(plain(o2[0])), 'the card shows the roll-again dice', plain(o2[0]).slice(0, 400));
  eq(E.sizes(), [6, 6, 6, 6, 6], 'roll again uses d6 each time');
  const id = E.lastId();
  go(E, gm, '!bitdgen add ' + id + ' looks', [1, 1, 2, 2], 'add look, first a duplicate cell');
  eq(E.items('looks', id), ['Man, Large', 'Dark'], 'a second look is a grid cell only; a duplicate cell is re-rolled');
}
{ // Goals, Methods, Jobs, d66
  const { E, gm } = fresh();
  sweep('Goals', E, gm, [[[1, 6], 'Knowledge'], [[2, 4], 'Prestige, Fame'], [[3, 3], 'Freedom'], [[4, 2], 'Revenge'], [[5, 4], 'Chaos, Destruction'], [[6, 1], 'Respect']].map(x => ({ cmd: '!bitdgen npc goal', dice: x[0], key: 'goal', want: x[1] })));
  sweep('Preferred Methods', E, gm, [[[1, 6], 'Strategy'], [[2, 1], 'Violence'], [[3, 2], 'Arcane'], [[5, 6], 'Chaos'], [[6, 4], 'Teamwork']].map(x => ({ cmd: '!bitdgen npc method', dice: x[0], key: 'method', want: x[1] })));
  sweep('Jobs, common', E, gm, [[[1, 1], 'Baker'], [[3, 4], 'Fishmonger'], [[6, 6], 'Sailor']].map(x => ({ cmd: '!bitdgen npc job', dice: x[0], key: 'job', want: x[1] })));
  go(E, gm, '!bitdgen npc job', [1, 1], 'job'); const id = E.lastId();
  const o = go(E, gm, '!bitdgen var ' + id + ' job', [6, 6], 'rare job');
  eq([E.items('job', id)[0], E.line('job', id).variant], ['Soldier', 'rare'], 'Rare job button: rare table, 6x6');
  ok(/Job \(rare\)/i.test(plain(o[0])) && has(o, /Common job/), 'card says rare and offers Common job');
  go(E, gm, '!bitdgen re ' + id + ' job', [5, 4], 're-roll keeps rare');
  eq(E.items('job', id)[0], 'Whisper', 'a re-roll keeps the rare variant (row 5, col 4)');
  go(E, gm, '!bitdgen var ' + id + ' job', [1, 1], 'back to common');
  eq(E.items('job', id)[0], 'Baker', 'toggling back gives the common table');
  sweep('Traits (d66, tens die first)', E, gm, [[[1, 2], 'Cold'], [[2, 1], 'Shrewd'], [[5, 2], 'Cooperative'], [[6, 6], 'Calm']].map(x => ({ cmd: '!bitdgen npc trait', dice: x[0], key: 'trait', want: x[1] })));
  sweep('Interests (d66)', E, gm, [[[1, 1], 'Fine whiskey, wine, beer.'], [[2, 5], 'Ecstasy of the Flesh'], [[4, 1], 'Hunting, shooting']].map(x => ({ cmd: '!bitdgen npc interest', dice: x[0], key: 'interest', want: x[1] })));
  sweep('Quirks (d66)', E, gm, [[[1, 1], 'Superstitious. Believes in signs, magic numbers.'], [[2, 2], 'Once hollowed, then restored. Immune to spirits.'], [[6, 6], 'A fraud. Some important aspect is fabricated.']].map(x => ({ cmd: '!bitdgen npc quirk', dice: x[0], key: 'quirk', want: x[1] })));
}
{ // Ghost
  const { E, gm } = fresh();
  let o = go(E, gm, '!bitdgen ghost', [3, 2, 5, 4, 1, 3], 'ghost: 3 years');
  eq(E.sizes(), [20, 6, 6, 6, 6, 6], 'ghost: d20, then one d6 per year, then the effect');
  eq([E.items('years')[0], E.items('trait')[0], E.items('effect')[0]], ['3 years', 'Wild', 'Faint visions of the local past'], 'ghost: 3 years, dice 2,5,4 -> top two 5 and 4 -> row 5 col 4 = Wild');
  ok(/d20 3/.test(plain(o[0])) && /3d6, top two 5 and 4/.test(plain(o[0])), 'the card shows the d20 and the top two', plain(o[0]).slice(0, 400));
  go(E, gm, '!bitdgen ghost', [1, 4, 2, 6, 6], 'ghost: 1 year');
  eq(E.sizes(), [20, 6, 6, 6, 6], 'ghost with 1 year: no second die, so the column is a fresh d6');
  eq([E.items('years')[0], E.items('trait')[0], E.items('effect')[0]], ['1 year', 'Territorial', 'Voices in your head.'], 'ghost: 1 year, row 4 col 2 = Territorial; effect face 6, col 6');
  go(E, gm, '!bitdgen ghost', [4, 1, 6, 3, 5, 4, 2], 'ghost: unsorted dice');
  eq([E.items('trait')[0], E.items('effect')[0]], ['Insane', 'Rushing wind'], 'dice 1,6,3,5: highest 6 is the row, second highest 5 is the column = Insane; effect face 4 is row "4,5", col 2');
  go(E, gm, '!bitdgen ghost', [3, 6, 6, 1, 1, 1], 'ghost: tie');
  eq(E.items('trait')[0], 'Vile', 'dice 6,6,1: top two are 6 and 6 = Vile');
  go(E, gm, '!bitdgen ghost 4', [1, 1, 1, 1, 4, 5], 'ghost 4');
  eq(E.sizes(), [6, 6, 6, 6, 6, 6], 'ghost 4: no d20, four trait dice, two effect dice');
  eq([E.items('years')[0], E.items('trait')[0], E.items('effect')[0], E.line('years').items[0].dice], ['4 years', 'Jealous', 'Disturbing shadows', 'set'], 'ghost 4: all ones = row 1 col 1 = Jealous; effect (4,5)');
  go(E, gm, '!bitdgen ghost 2', [3, 3, 2, 1], 'ghost 2');
  eq([E.items('trait')[0], E.items('effect')[0]], ['True', 'Frost, Chill'], 'ghost 2: row 3 col 3 = True; effect face 2 is row "1-3"');
  go(E, gm, '!bitdgen ghost 1', [5, 2, 1, 1], 'ghost 1 set');
  eq([E.items('years')[0], E.items('trait')[0]], ['1 year', 'Volatile'], 'ghost 1 (set by the user): row 5, column d6 2');
  go(E, gm, '!bitdgen ghost 500', new Array(100).fill(1).concat([1, 1]), 'ghost 500 is clamped to 100');
  eq(E.items('years')[0], '100 years', 'years above 100 are clamped to 100 (only 100 d6 rolled)');
  go(E, gm, '!bitdgen ghost 0', [2, 6, 6, 1, 1], 'ghost 0');
  eq(E.items('years')[0], '2 years', 'a number of 0 is treated as not given: d20 is rolled');
  go(E, gm, '!bitdgen ghost trait', [3, 1, 2, 3], 'ghost trait section');
  eq(E.card().lines.map(l => l.key), ['years', 'trait'], 'ghost trait section: years and trait lines only');
  eq(E.items('trait')[0], 'Insightful', 'd20 = 3, dice 1,2,3 sort to 3,2,1: row 3, col 2 = Insightful');
  go(E, gm, '!bitdgen ghost effect', [2, 5], 'ghost effect section');
  eq(E.card().lines.map(l => l.key), ['effect'], 'ghost effect section: effect line only');
  eq(E.items('effect')[0], 'Weird shadows', 'effect dice (2, 5): row "1-3", column 5 = Weird shadows');
}
{ // Ghost buttons
  const { E, gm } = fresh();
  go(E, gm, '!bitdgen ghost', [3, 2, 5, 4, 1, 3], 'ghost for buttons'); const id = E.lastId();
  go(E, gm, '!bitdgen yrs ' + id + ' 10', [1, 1, 1, 1, 1, 1, 1, 1, 1, 1], 'years button 10');
  eq([E.items('years', id)[0], E.items('trait', id)[0], E.items('effect', id)[0]], ['10 years', 'Jealous', 'Faint visions of the local past'], 'years 10: ten dice, no d20, new trait, effect kept');
  go(E, gm, '!bitdgen yrs ' + id + ' d20', [2, 6, 6], 'years back to d20');
  eq([E.items('years', id)[0], E.items('trait', id)[0]], ['2 years', 'Vile'], 'd20 button: d20 = 2, two sixes = Vile');
  go(E, gm, '!bitdgen re ' + id + ' years', [1, 3, 4], 're-roll years');
  eq([E.items('years', id)[0], E.items('trait', id)[0]], ['1 year', 'Revelatory'], 're-rolling the years line also re-rolls the trait (row 3, col 4)');
  go(E, gm, '!bitdgen re ' + id + ' trait', [5, 2], 're-roll trait');
  eq([E.items('years', id)[0], E.items('trait', id)[0]], ['1 year', 'Volatile'], 're-rolling the trait keeps the years');
  go(E, gm, '!bitdgen all ' + id, [2, 1, 1, 6, 6], 'roll all');
  eq([E.items('years', id)[0], E.items('trait', id)[0], E.items('effect', id)[0]], ['2 years', 'Jealous', 'Voices in your head.'], 'roll all: new d20, new trait, new effect');
  go(E, gm, '!bitdgen yrs ' + id + ' 101', new Array(100).fill(1), 'years 101');
  eq(E.items('years', id)[0], '100 years', 'a years button value above 100 is clamped');
  ['0', 'abc', '-3'].forEach(v => { const o = go(E, gm, '!bitdgen yrs ' + id + ' ' + v, [], 'bad years ' + v); ok(o.length === 1 && /Years must be d20 or a number/.test(plain(o[0])), 'bad years value refused: ' + v, o.map(plain)); });
  go(E, gm, '!bitdgen horror', [1, 1], 'horror'); const hid = E.lastId();
  const o = go(E, gm, '!bitdgen yrs ' + hid + ' 5', [], 'years on a non-ghost');
  ok(/Years only apply to a ghost/.test(plain(o[0])), 'years button on another card refused', o.map(plain));
  const html = go(E, gm, '!bitdgen ghost 10', new Array(10).fill(1).concat([1, 1]), 'ghost 10 for chips')[0];
  ok(new RegExp('yrs ' + E.lastId() + ' 10" style="[^"]*background:#8a1f1f').test(html), 'the current fixed years button is shown in the accent colour');
  const html2 = go(E, gm, '!bitdgen ghost', [3, 1, 1, 1, 1, 1], 'ghost d20 chips')[0];
  ok(new RegExp('yrs ' + E.lastId() + ' d20" style="[^"]*background:#8a1f1f').test(html2), 'the d20 button is the accent colour in d20 mode');
}
{ // Demon, Horror, Cult
  const { E, gm } = fresh();
  go(E, gm, '!bitdgen demon', [1, 4, 2, 3, 6, 19], 'demon');
  eq(E.sizes(), [17, 6, 6, 6, 6, 19], 'demon: dice sizes (name d17, affinity d6, aspect d6, desire 2d6, feature d19)');
  eq(['name', 'affinity', 'aspect', 'desire', 'feature'].map(k => E.items(k)[0]), ['Korvaeth', 'Fire, Smoke', HUM, 'Chaos', 'Liquid freezes, boils, turns to blood or ashes'], 'demon card values');
  const id = E.lastId();
  go(E, gm, '!bitdgen add ' + id + ' desire', [3, 6, 1, 2], 'second desire, first a duplicate');
  eq(E.items('desire', id), ['Chaos', 'Murder'], 'Some demons have more than one desire: a duplicate is re-rolled');
  go(E, gm, '!bitdgen add ' + id + ' feature', [19, 1], 'second feature');
  eq(E.items('feature', id), ['Liquid freezes, boils, turns to blood or ashes', 'Black shark eyes'], 'a second feature, duplicate skipped');
  go(E, gm, '!bitdgen demon', [17, 6, 6, 6, 6, 2], 'demon 2');
  eq(['name', 'affinity', 'aspect', 'desire', 'feature'].map(k => E.items(k)[0]), ['Vaskari', 'Storm, Wind', 'Amorphous', 'Achievement', 'Scales (onyx, iridescent, crystalline, metallic, etc.)'], 'demon: last name, face 6 everywhere');
  go(E, gm, '!bitdgen demon type', [4, 2], 'demon type section');
  eq([E.card().lines.map(l => l.key), E.items('affinity')[0], E.items('aspect')[0]], [['affinity', 'aspect'], 'Fire, Smoke', HUM], 'demon type section: affinity and aspect, independent d6 each');
  const FEATS = ['Black shark eyes', 'Scales (onyx, iridescent, crystalline, metallic, etc.)', 'Razor-sharp claws', 'Bony protrusions', 'Multiple eyes', 'Lashing tail', 'Leathery wings', 'Spines', 'Dripping ichor', 'Glowing eyes or markings', 'Hair or fur (drifting as if underwater, burning with a cool fire, etc.)', 'Feathers', 'Multiple arms', 'Tentacles', 'Hard shell, metallic plates', 'Lights dim or flare', 'Plants wither or grow wildly', 'Mechanisms grind to a stop', 'Liquid freezes, boils, turns to blood or ashes'];
  const NAMES17 = ['Korvaeth', 'Sevraxis', 'Argaz', 'Zalvroxos', 'Kethtera', 'Arkeveron', 'Ixis', 'Kyronax', 'Voldranai', 'Esketra', 'Ardranax', 'Kylastra', 'Oryxus', 'Ahazu', 'Tyraxis', 'Azarax', 'Vaskari'];
  sweep('Demon features, all 19 (the approved reading, typed in this test)', E, gm, FEATS.map((f, i) => ({ cmd: '!bitdgen demon feature', dice: [i + 1], key: 'feature', want: f })));
  sweep('Demon names, all 17', E, gm, NAMES17.map((f, i) => ({ cmd: '!bitdgen demon name', dice: [i + 1], key: 'name', want: f })));
  sweep('Affinity, all faces', E, gm, ['Sea, Water', 'Darkness', 'Earth, Metal', 'Fire, Smoke', 'Sky, Stars', 'Storm, Wind'].map((f, i) => ({ cmd: '!bitdgen demon affinity', dice: [i + 1], key: 'affinity', want: f })));
  sweep('Aspect, all faces (1 to 3 are the same text)', E, gm, [HUM, HUM, HUM, 'Animal', 'Monstrous', 'Amorphous'].map((f, i) => ({ cmd: '!bitdgen demon aspect', dice: [i + 1], key: 'aspect', want: f })));
  const cases = []; FACES.forEach(r => FACES.forEach(c => { cases.push({ cmd: '!bitdgen horror', dice: [r, c], key: 'horror', want: grid(V[4])[r - 1][c - 1] }); }));
  sweep('Summoned Horrors, all 36 cells', E, gm, cases);
  eq([E.items('horror')[0]], ['Consuming Orb'], 'horror (6,6) = Consuming Orb');
  go(E, gm, '!bitdgen cult', [1, 1, 5, 1], 'cult');
  eq([E.items('god')[0], E.items('practice')[0]], ['The One Within Many', 'Consecration: Purification by bathing in sacred fluid (blood, wine, milk, oil, etc.).'], 'cult: god and practice are two independent d66 rolls');
  go(E, gm, '!bitdgen cult', [5, 1, 1, 2], 'cult fixed spellings');
  eq([E.items('god')[0], E.items('practice')[0]], ['The Cloud of Woe', 'Sacrifice: Pitted against an anointed champion in death arena.'], 'cult: god 51 and practice 12 with the spelling fixes');
  go(E, gm, '!bitdgen cult', [6, 6, 6, 6], 'cult 66');
  eq([E.items('god')[0], E.items('practice')[0]], ['The Golden Stag', 'Desecration: Mindless, pointless chaos; sowing the seeds of anarchy.'], 'cult 66');
  go(E, gm, '!bitdgen cult', [1, 2, 2, 1], 'cult tens first');
  eq([E.items('god')[0], E.items('practice')[0]], ['The Silver Fire', 'Congregation: An orgy of pleasure (sex, food, dance, music) and/or pain.'], 'd66: the first die is the tens digit (1,2 is 12, 2,1 is 21)');
}
{ // Streets
  const { E, gm } = fresh();
  const o = go(E, gm, '!bitdgen street', [6, 3, 4, 6, 2, 5, 3, 6, 2, 1, 4, 2], 'street');
  eq(E.sizes(), [6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 9, 6], 'street: mood, sights, sounds, smells, use 2d6, type 2d6, details 2d6, props d9 + d6');
  eq(['mood', 'sights', 'sounds', 'smells', 'use', 'type', 'details', 'props'].map(k => E.items(k)[0]),
    ['Cozy or Warm', 'Mist, Fog, Frost', 'Whispers, Echoes, Strange Voices', 'Ozone, Electroplasmic Discharges', 'Trade', 'Waterway', 'Stairs, Ramps, Terraces', 'Push Carts'], 'street card values');
  checkAll(o, 'street card');
  go(E, gm, '!bitdgen street impressions', [1, 2, 3], 'impressions');
  eq(['sights', 'sounds', 'smells'].map(k => E.items(k)[0]), ['Rain Slick, Oil Slick', 'Fluttering Cloth, Howling Winds', 'Animals, Hides, Blood'], 'Impressions: each column is its own d6 roll (rows 1, 2 and 3)');
  go(E, gm, '!bitdgen street props 3', [4, 2, 9, 6, 1, 1], 'props 3');
  eq(E.items('props'), ['Push Carts', 'Stockade', 'Nets, Ropes'], 'street props 3: three props, each a random list then a random item');
  eq(E.sizes(), [9, 6, 9, 6, 9, 6], 'props: d9 for the list, d6 for the item');
  const id = E.lastId();
  go(E, gm, '!bitdgen add ' + id + ' props', [4, 2, 1, 3], 'add prop, first a duplicate');
  eq(E.items('props', id).slice(3), ['Cables, Chains'], 'a duplicate prop is re-rolled');
  const caseUse = [[[2, 5], 'Trade'], [[5, 3], 'Power'], [[6, 5], 'Academic'], [[4, 1], 'Law, Govt.'], [[1, 1], 'Residential']];
  sweep('Streets Use, ranges', E, gm, caseUse.map(x => ({ cmd: '!bitdgen street use', dice: x[0], key: 'use', want: x[1] })));
  sweep('Streets Type, ranges', E, gm, [[[3, 6], 'Waterway'], [[4, 5], 'Wide Boulevard'], [[6, 6], 'Private, Gated'], [[5, 1], 'Closed Court']].map(x => ({ cmd: '!bitdgen street type', dice: x[0], key: 'type', want: x[1] })));
  go(E, gm, '!bitdgen street use 2', [2, 5, 6, 5], 'use twice');
  eq(E.items('use'), ['Trade', 'Academic'], 'street use 2: Many streets have multiple uses');
  const o2 = go(E, gm, '!bitdgen street details', [2, 1], 'details'); ok(/Stairs, Ramps, Terraces/.test(plain(o2[0])), 'Details row 2 shows the comma fix');
}
{ // Buildings
  const { E, gm } = fresh();
  const o = go(E, gm, '!bitdgen building', [4, 6, 3, 3, 6, 6, 5, 4], 'building');
  eq(E.sizes(), [6, 6, 6, 6, 6, 6, 5, 4], 'building: material d6, exterior d6, use 2d6, details 2d6, items d5 then d4 for the 4-item list');
  eq(['material', 'exterior', 'use', 'details', 'items'].map(k => E.items(k)[0]), ['Wooden Boards', 'Landscaping', 'Brewery', 'Shrine, Altar', 'Weapons, Ammunition'], 'building card values');
  checkAll(o, 'building card');
  const id = E.lastId();
  const o2 = go(E, gm, '!bitdgen var ' + id + ' use', [4, 3], 'rare use');
  eq([E.items('use', id)[0], E.line('use', id).variant], ['Apt. Building', 'rare'], 'Rare use button: row 4, col 3 of Use: Rare');
  ok(/Use \(rare\)/i.test(plain(o2[0])) && has(o2, /Common use/), 'card says rare and offers Common use');
  go(E, gm, '!bitdgen add ' + id + ' use', [4, 3, 6, 6], 'second use');
  eq(E.items('use', id), ['Apt. Building', 'Radiant Energy Garden'], 'Many buildings have multiple uses; the second comes from the same (rare) table');
  go(E, gm, '!bitdgen building material', [2], 'material 2');
  eq(E.items('material')[0], 'Stone & Timbers', 'material 2 is Stone & Timbers');
  go(E, gm, '!bitdgen building exterior', [1, 5], 'exterior section');
  eq(E.card().lines.map(l => l.key), ['material', 'exterior'], 'building exterior section is Material and Details');
  eq([E.items('material')[0], E.items('exterior')[0]], ['Gray Brick', 'Wood Work'], 'Material (face 1) and Details (face 5) are two independent d6 rolls');
}
{ // Scores
  const { E, gm } = fresh();
  const o = go(E, gm, '!bitdgen score', [2, 3, 3, 4, 3, 5, 2, 4, 2, 4, 3, 3, 3], 'score, single results');
  eq(E.sizes(), [4, 6, 4, 6, 4, 6, 4, 6, 4, 6, 4, 6, 6], 'score: d4 then d6 for client, target, work, twist, connected; d4 then d66 for the faction');
  eq(['client', 'target', 'work', 'twist', 'connected', 'faction'].map(k => E.items(k)),
    [['Fence or Gambler'], ['Clergy or Cultist'], ['Locate or Hide'], ['The job is a test for another job'], ['(Crew) Contact'], ['Gondoliers or Cabbies']], 'score single results');
  eq(['client', 'target', 'work', 'twist'].map(k => E.line(k).items[0].group), ['Criminal', 'Political', 'Underworld', 'list 2'], 'the list each result came from');
  checkAll(o, 'score card');
  const t = plain(o[0]);
  ok(/outside the crew's hunting grounds/.test(t), 'the card carries the handout rule about two factions');
  ok(/Fence or Gambler \(Criminal\)/.test(t) && /d4 2, d6 3/.test(t), 'group and dice are shown', t.slice(0, 500));
  const id = E.lastId();

  go(E, gm, '!bitdgen score', [4, 2, 1, 6, 4, 6, 4, 1, 3, 2, 5, 4, 1, 6, 4, 1, 1, 6, 6], 'score, double results');
  eq(E.sizes(), [4, 6, 4, 6, 4, 6, 4, 3, 3, 6, 6, 4, 6, 6, 4, 6, 6, 6, 6], 'score doubles: twist is d4, 2d3, 2d6; connected is d4, 2d6; faction is d4 and two d66');
  eq(['client', 'target', 'work', 'twist', 'connected', 'faction'].map(k => E.items(k)),
    [['Occult Collector'], ['Doctor or Alchemist'], ['Hollow or Revivify'],
      ['An occultist has foreseen this job and warned the parties involved', 'The job furthers a revolutionary' + Q + 's secret agenda'],
      ['(PC) Friend', '(Weird) Ghost, Demon, Forgotten God'], ['The Unseen', 'Deathlands Scavengers']], 'a d4 of 4 gives two twists, two connections and two factions');
  ok(/d4 4 \(two\)/.test(E.line('twist').items[0].dice), 'the twist dice note says two');

  go(E, gm, '!bitdgen score client', [4, 1, 1, 6], 'ghost of');
  eq([E.items('client'), E.sizes()], [['Ghost of Doctor or Alchemist'], [4, 6, 4, 6]], 'Ghost of (roll again) rolls the Client / Target generator again');
  ok(/&gt;/.test(go(E, gm, '!bitdgen score client', [4, 1, 1, 6], 'ghost of html')[0]), 'the nested dice are shown with an escaped >');
  go(E, gm, '!bitdgen score client', [4, 1, 4, 1, 4, 1, 4, 1], 'ghost of, nested');
  eq(E.items('client'), ['Ghost of Ghost of Ghost of Ghost of (roll again)'], 'nesting stops after three re-rolls');

  go(E, gm, '!bitdgen score twist', [1, 6], 'twist list 1');
  eq(E.items('twist'), ['The job furthers a vampire' + Q + 's secret agenda'], 'twist: d4 of 1 picks list 1, then d6');
  go(E, gm, '!bitdgen score twist', [4, 2, 2, 3, 3, 1, 4], 'twist duplicate');
  eq([E.items('twist'), E.sizes()], [['The job is a trap laid by your enemies', 'Rogue spirits haunt the location'], [4, 3, 3, 6, 6, 3, 6]], 'two identical twists: the second is re-rolled (d3 then d6)');
  go(E, gm, '!bitdgen score connected', [4, 3, 3, 5], 'connected duplicate');
  eq(E.items('connected'), ['(PC) Vice purveyor', '(City) Doskvol notable'], 'two identical connections: the second is re-rolled');
  go(E, gm, '!bitdgen score faction', [4, 1, 1, 1, 1, 6, 6], 'faction duplicate');
  eq(E.items('faction'), ['The Unseen', 'Deathlands Scavengers'], 'two identical factions: the second is re-rolled');
  go(E, gm, '!bitdgen score faction', [2, 4, 4], 'faction single');
  eq(E.items('faction'), ['The Red Sashes'], 'faction: d4 of 2 gives one, d66 (4,4)');
  go(E, gm, '!bitdgen score connected', [1, 6], 'connected single');
  eq(E.items('connected'), ['(Weird) Ghost, Demon, Forgotten God'], 'connected: d4 of 1 gives one result');

  // list buttons on the first doubles card
  const gid = (go(E, gm, '!bitdgen score', [4, 2, 1, 6, 4, 6, 4, 1, 3, 2, 5, 4, 1, 6, 4, 1, 1, 6, 6], 'score for chips'), E.lastId());
  const o1 = go(E, gm, '!bitdgen grp ' + gid + ' client 2', [6], 'client chip Criminal');
  eq([E.items('client', gid), E.line('client', gid).group], [['Crime Boss'], 2], 'client forced to Criminal: only a d6');
  ok(/\[Criminal\], d6 6/.test(plain(o1[0])), 'the card shows the forced list', plain(o1[0]).slice(0, 300));
  go(E, gm, '!bitdgen re ' + gid + ' client', [1], 're-roll keeps the forced list');
  eq(E.items('client', gid), ['Drug Dealer or Supplier'], 'a re-roll keeps the forced list');
  go(E, gm, '!bitdgen grp ' + gid + ' client any', [1, 1], 'client chip Any');
  eq([E.items('client', gid), E.line('client', gid).group], [['Academic or Scholar'], undefined], 'Any goes back to d4 then d6');
  go(E, gm, '!bitdgen grp ' + gid + ' work 4', [6], 'work chip Unnatural');
  eq(E.items('work', gid), ['Hollow or Revivify'], 'work forced to Unnatural');
  go(E, gm, '!bitdgen grp ' + gid + ' twist 3', [1], 'twist chip list 3');
  eq(E.items('twist', gid), ['Job requires travel by electro-rail'], 'twist forced to list 3: one complication, d6 only');
  go(E, gm, '!bitdgen grp ' + gid + ' twist two', [1, 2, 3, 4], 'twist chip two');
  eq(E.items('twist', gid), ['Rogue spirits possess some/most/all of the people involved', 'The job is a test for another job'], 'twist forced to two: 2d3 then 2d6');
  go(E, gm, '!bitdgen grp ' + gid + ' twist any', [2, 6], 'twist chip any');
  eq(E.items('twist', gid), ['The job furthers a crime boss' + Q + 's secret agenda'], 'twist Any: d4 of 2, d6 of 6');
  go(E, gm, '!bitdgen add ' + gid + ' twist', [3, 2], 'add twist');
  eq(E.items('twist', gid).slice(1), ['Must visit the death-lands to do the job (perhaps to the Lost District, outside the lightning barrier)'], 'a + adds one complication: d3 then d6');
  ['grp ' + gid + ' client 9', 'grp ' + gid + ' work two', 'grp ' + gid + ' connected 1', 'grp ' + gid + ' faction any'].forEach(c => {
    const o2 = go(E, gm, '!bitdgen ' + c, [], 'bad chip ' + c);
    ok(o2.length === 1 && /Not a list choice|has no list choice/.test(plain(o2[0])), 'refused: ' + c, o2.map(plain));
  });
  go(E, gm, '!bitdgen all ' + gid, [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], 'roll all resets the list choices');
  eq(['client', 'target', 'work', 'twist', 'connected', 'faction'].map(k => E.items(k, gid)),
    [['Academic or Scholar'], ['Academic or Scholar'], ['Stalking or Surveillance'], ['An element is a cover for heretic spirit cult practices.'], ['(PC) Friend'], ['The Unseen']], 'roll all: every line back to d4 then d6');
  eq(['client', 'work', 'twist'].map(k => E.line(k, gid).group), [undefined, undefined, undefined], 'roll all clears forced lists');
}
{ // Rumors
  const { E, gm } = fresh();
  const o = go(E, gm, '!bitdgen rumor', [3, 1], 'rumor A');
  eq(E.sizes(), [6, 2], 'rumor: d6 for the row, d2 for the side');
  eq(E.items('rumor'), ['There' + Q + 's a Bluecoat constable that takes bribes to frame targets for crimes.'], 'rumor row 3, side A');
  eq(E.line('rumor').items[0].other, 'A corrupt magistrate is seeking secret passage out of the city ahead of charges.', 'the other option is kept');
  ok(plain(o[0]).indexOf('Weekly, or whenever you need one.') > 0 && /Other option on this row: A corrupt magistrate/.test(plain(o[0])), 'card shows the handout note and the other option', plain(o[0]).slice(0, 400));
  checkAll(o, 'rumor card');
  go(E, gm, '!bitdgen rumor', [3, 2], 'rumor B');
  eq([E.items('rumor')[0], E.line('rumor').items[0].side], ['A corrupt magistrate is seeking secret passage out of the city ahead of charges.', 'B'], 'rumor row 3, side B');
  const id = E.lastId();
  go(E, gm, '!bitdgen flip ' + id + ' rumor', [], 'flip');
  eq([E.items('rumor', id)[0], E.line('rumor', id).items[0].other], ['There' + Q + 's a Bluecoat constable that takes bribes to frame targets for crimes.', 'A corrupt magistrate is seeking secret passage out of the city ahead of charges.'], 'Use other option swaps the two texts, no dice');
  ok(/flipped/.test(E.line('rumor', id).items[0].dice), 'the dice note says flipped');
  go(E, gm, '!bitdgen flip ' + id + ' rumor', [], 'flip back');
  eq(E.items('rumor', id)[0], 'A corrupt magistrate is seeking secret passage out of the city ahead of charges.', 'flipping twice restores it');
  go(E, gm, '!bitdgen rumor', [4, 2], 'rumor row 4 B');
  eq(E.items('rumor'), ['The Church of the Ecstasy of the Flesh is seeking a new Apex.'], 'row 4 option B (misaligned cell in the handout) with the spelling fix');
  go(E, gm, '!bitdgen rumor', [4, 1], 'rumor row 4 A');
  eq(E.items('rumor'), ['The streetwalkers and pleasure houses are infiltrated by rogue spirits.'], 'row 4 option A');
  go(E, gm, '!bitdgen occurrence', [6, 1], 'occurrence 6A');
  eq(E.items('occurrence'), ['A group of scoundrels, recently escaped from Ironhook, go to ground nearby, attracting bounty hunters.'], 'occurrence row 6 A');
  go(E, gm, '!bitdgen occurrence', [6, 2], 'occurrence 6B');
  eq(E.items('occurrence'), ['An ancient crypt beneath the district, covered in strange markings, is exposed and attracts wailing hollows.'], 'occurrence row 6 B');
  go(E, gm, '!bitdgen occurrence', [1, 2], 'occurrence 1B');
  eq(E.items('occurrence'), ['Spirit wardens set up a watch post and deathseeker crow roost in the old temple ruins.'], 'occurrence row 1 B');
  go(E, gm, '!bitdgen overheard', [4], 'overheard 4');
  eq([E.card().lines[0].items[0].lines, E.sizes()], [['"Ya see, there are two types in this world. Me, an\' doffing idiots. That\'s why I bet on Marlane."'], [8]], 'overheard exchange 4 is one line; d8');
  go(E, gm, '!bitdgen overheard', [7], 'overheard 7');
  eq(E.card().lines[0].items[0].lines, ['"... seen her in the mirror."', '"Like, behind him?"', '"No, just her reflection, in the mirror."', '"Inky hell."'], 'overheard exchange 7: four lines kept together');
  const oo = go(E, gm, '!bitdgen overheard', [3], 'overheard 3');
  eq([E.card().lines[0].items[0].lines.length, E.card().lines[0].items[0].lines[0].indexOf('"Red milk, I call it.')], [3, 0], 'overheard exchange 3: three lines, first starts with Red milk');
  ok(plain(oo[0]).indexOf('Highest high silver can buy') > 0, 'every line of the exchange is on the card');
  go(E, gm, '!bitdgen overheard', [8], 'overheard 8');
  eq(E.card().lines[0].items[0].lines[3], '"Oh, you\'ll see. Once it sets in..."', 'overheard exchange 8: last line');
  const on = go(E, gm, '!bitdgen news', [6, 6], 'news');
  eq([E.items('event'), E.sizes()], [['Cult Gatherings'], [6, 6]], 'city events (6,6) = Cult Gatherings');
  ok(plain(on[0]).indexOf('Weekly, or whenever you need one') > 0, 'news card carries the note');
  sweep('City events spot checks', E, gm, [[[1, 1], 'Plague'], [[4, 6], 'Witch Hunt'], [[3, 2], 'Election']].map(x => ({ cmd: '!bitdgen news', dice: x[0], key: 'event', want: x[1] })));
}

// ---------------------------------------------------------------------------------------------
// F. Every die face and every cell, rolled through the real commands
// ---------------------------------------------------------------------------------------------
{
  const { E, gm } = fresh();
  const D = E.env.BitDGen._data;
  const R126 = [0, 0, 1, 1, 2, 2], R1456 = [0, 0, 0, 1, 1, 2];   // 1,2 / 3,4 / 5,6   and   1-3 / 4,5 / 6
  function rangedCases(cmd, key, table, rowOf) {
    const g = grid(table), cases = [];
    FACES.forEach(f => FACES.forEach(c => cases.push({ cmd, dice: [f, c], key, want: g[rowOf[f - 1]][c - 1] })));
    return cases;
  }
  sweep('Goals: 6 row faces x 6 columns ("1, 2" / "3, 4" / "5, 6")', E, gm, rangedCases('!bitdgen npc goal', 'goal', P[1], R126));
  sweep('Preferred Methods: 36 rolls', E, gm, rangedCases('!bitdgen npc method', 'method', P[2], R126));
  sweep('Ghostly Secondary Effects: 36 rolls ("1-3" / "4,5" / "6")', E, gm, rangedCases('!bitdgen ghost effect', 'effect', V[1], R1456));
  sweep('Demon Desires: 36 rolls ("1,2" / "3,4" / "5,6")', E, gm, rangedCases('!bitdgen demon desire', 'desire', V[3], R126));
  sweep('Streets Use: 36 rolls', E, gm, rangedCases('!bitdgen street use', 'use', S[2], R1456));
  sweep('Streets Type: 36 rolls', E, gm, rangedCases('!bitdgen street type', 'type', S[3], R1456));

  function gridCases(cmd, key, table, pre, wantFn) {
    const g = grid(table), cases = [];
    FACES.forEach(r => FACES.forEach(c => cases.push({ cmd, dice: (pre || []).concat([r, c]), key, want: wantFn ? wantFn(g[r - 1][c - 1]) : g[r - 1][c - 1] })));
    return cases;
  }
  sweep('Ghost Traits at 1 year: all 36 cells', E, gm, gridCases('!bitdgen ghost trait 1', 'trait', V[0]));
  sweep('Looks grid: all 36 cells', E, gm, gridCases('!bitdgen npc looks', 'looks', P[0], [1], x => 'Man, ' + x));
  sweep('Professions Common: all 36 cells', E, gm, gridCases('!bitdgen npc job', 'job', P[3]));
  sweep('Summoned Horrors: all 36 cells', E, gm, gridCases('!bitdgen horror', 'horror', V[4]));
  sweep('Streets Details: all 36 cells', E, gm, gridCases('!bitdgen street details', 'details', S[4]));
  sweep('Buildings Use Common: all 36 cells', E, gm, gridCases('!bitdgen building use', 'use', S[6]));
  sweep('Buildings Details: all 36 cells', E, gm, gridCases('!bitdgen building details', 'details', S[8]));
  sweep('City Events: all 36 cells', E, gm, gridCases('!bitdgen news', 'event', R[1]));

  go(E, gm, '!bitdgen npc job', [1, 1], 'job for rare sweep'); const jid = E.lastId();
  go(E, gm, '!bitdgen var ' + jid + ' job', [1, 1], 'job to rare');
  { const g = grid(P[4]), cases = []; FACES.forEach(r => FACES.forEach(c => cases.push({ cmd: '!bitdgen re ' + jid + ' job', dice: [r, c], get: e => e.items('job', jid)[0], want: g[r - 1][c - 1] })));
    sweep('Professions Rare: all 36 cells', E, gm, cases); }
  go(E, gm, '!bitdgen building use', [1, 1], 'use for rare sweep'); const uid = E.lastId();
  go(E, gm, '!bitdgen var ' + uid + ' use', [1, 1], 'use to rare');
  { const g = grid(S[7]), cases = []; FACES.forEach(r => FACES.forEach(c => cases.push({ cmd: '!bitdgen re ' + uid + ' use', dice: [r, c], get: e => e.items('use', uid)[0], want: g[r - 1][c - 1] })));
    sweep('Buildings Use Rare: all 36 cells', E, gm, cases); }

  // d66: every pair, first die is the tens digit
  const idx = (a, b) => (a - 1) * 6 + (b - 1);
  function d66Cases(cmd, key, arr, pre) { const cases = []; FACES.forEach(a => FACES.forEach(b => cases.push({ cmd, dice: (pre || []).concat([a, b]), key, want: arr[idx(a, b)] }))); return cases; }
  sweep('Forgotten Gods: all 36 d66 pairs', E, gm, d66Cases('!bitdgen cult god', 'god', d66(V[5].body, 1)));
  sweep('Cult Practices: all 36 d66 pairs', E, gm, d66Cases('!bitdgen cult practice', 'practice', d66(V[5].body, 2)));
  sweep('Traits: all 36 d66 pairs', E, gm, d66Cases('!bitdgen npc trait', 'trait', d66(P[5].body, 1)));
  sweep('Interests: all 36 d66 pairs', E, gm, d66Cases('!bitdgen npc interest', 'interest', d66(P[5].body, 2)));
  sweep('Quirks: all 36 d66 pairs', E, gm, d66Cases('!bitdgen npc quirk', 'quirk', d66(P[5].body, 3)));
  sweep('Factions: all 36 d66 pairs (after the d4)', E, gm, d66Cases('!bitdgen score faction', 'faction', SC.factions, [1]));
  sweep('Factions: a d4 of 2 and 3 also give one faction', E, gm, [[2, 1, 1, 'The Unseen'], [3, 6, 6, 'Deathlands Scavengers']].map(x => ({ cmd: '!bitdgen score faction', dice: [x[0], x[1], x[2]], key: 'faction', want: x[3] })));

  // plain lists, every face
  const faceCases = (cmd, key, arr) => arr.map((w, i) => ({ cmd, dice: [i + 1], key, want: w }));
  sweep('Mood: 6 faces', E, gm, faceCases('!bitdgen street mood', 'mood', S[0].body.map(r => r[1])));
  sweep('Sights: 6 faces', E, gm, faceCases('!bitdgen street sights', 'sights', S[1].body.map(r => r[1])));
  sweep('Sounds: 6 faces', E, gm, faceCases('!bitdgen street sounds', 'sounds', S[1].body.map(r => r[2])));
  sweep('Smells: 6 faces', E, gm, faceCases('!bitdgen street smells', 'smells', S[1].body.map(r => r[3])));
  sweep('Exterior Material: 6 faces', E, gm, faceCases('!bitdgen building material', 'material', S[5].body[0].slice(1)));
  sweep('Exterior Details: 6 faces', E, gm, faceCases('!bitdgen building exterior', 'exterior', S[5].body[1].slice(1)).map(c => Object.assign(c, { dice: [1].concat(c.dice) })));
  sweep('Names: all 170 faces of the d170', E, gm, faceCases('!bitdgen name', 'name', D.people.names));
  sweep('Style: all 37 faces', E, gm, faceCases('!bitdgen npc style', 'style', D.people.style));
  sweep('Connected to: 6 faces after a d4 of 1, 2 or 3', E, gm, [1, 2, 3].reduce((a, g) => a.concat(SC.connected.map((w, i) => ({ cmd: '!bitdgen score connected', dice: [g, i + 1], key: 'connected', want: w }))), []));
  { const cases = [];
    D.streets.props.forEach((_, l) => FACES.forEach(r => cases.push({ cmd: '!bitdgen street props', dice: [l + 1, r], key: 'props', want: numberedGroups('Streets & Buildings', '#### Props', '### Buildings')[l][r - 1] })));
    sweep('Props: 9 lists x 6 items', E, gm, cases); }
  { const groups = numberedGroups('Streets & Buildings', '#### Items', undefined), cases = [];
    groups.forEach((list, l) => list.forEach((w, r) => cases.push({ cmd: '!bitdgen building items', dice: [l + 1, r + 1], key: 'items', want: w })));
    sweep('Items: 5 lists (the last has only 4 items, rolled on a d4)', E, gm, cases);
    go(E, gm, '!bitdgen building items', [5, 4], 'items list 5'); eq(E.sizes(), [5, 4], 'the 4-item list is rolled on a d4'); }
  // Client / Target / Work: d4 picks the list, then d6 (Strange 1 is the Ghost of rule, tested above)
  function groupCases(cmd, key, lists) { const cases = []; lists.forEach((l, g) => l.forEach((w, r) => { if (!(key !== 'work' && g === 3 && r === 0)) { cases.push({ cmd, dice: [g + 1, r + 1], key, want: w }); } })); return cases; }
  sweep('Client: 4 lists x 6 (except Ghost of)', E, gm, groupCases('!bitdgen score client', 'client', SC.client));
  sweep('Target: 4 lists x 6 (except Ghost of)', E, gm, groupCases('!bitdgen score target', 'target', SC.client));
  sweep('Work: 4 lists x 6', E, gm, groupCases('!bitdgen score work', 'work', SC.work));
  { const cases = []; SC.twist.forEach((l, g) => l.forEach((w, r) => cases.push({ cmd: '!bitdgen score twist', dice: [g + 1, r + 1], key: 'twist', want: w })));
    sweep('Twist: d4 of 1 to 3 picks a list, then d6 (18 results)', E, gm, cases); }
  sweep('Overheard: all 8 exchanges', E, gm, D.rumors.overheard.map((ex, i) => ({ cmd: '!bitdgen overheard', dice: [i + 1], get: e => e.card().lines[0].items[0].lines, want: ex })));
  { const cases = []; FACES.forEach(r => [1, 2].forEach(s => cases.push({ cmd: '!bitdgen rumor', dice: [r, s], key: 'rumor', want: s === 1 ? orRows(R[0])[r - 1].a : orRows(R[0])[r - 1].b })));
    sweep('Rumors on the Street: 6 rows x side A or B', E, gm, cases); }
  { const cases = []; FACES.forEach(r => [1, 2].forEach(s => cases.push({ cmd: '!bitdgen occurrence', dice: [r, s], key: 'occurrence', want: s === 1 ? orRows(R[2])[r - 1].a : orRows(R[2])[r - 1].b })));
    sweep('Remarkable Occurrences: 6 rows x side A or B', E, gm, cases); }
}

// ---------------------------------------------------------------------------------------------
// G. Click-through: every button on every card
// ---------------------------------------------------------------------------------------------
{
  const { E, gm, pat } = fresh(); E.seed(101);
  const cmds = ['npc', 'name', 'ghost', 'ghost 12', 'demon', 'horror', 'cult', 'street', 'street props 3', 'building', 'building items 2', 'score', 'score twist', 'rumor', 'overheard', 'news', 'occurrence', 'npc goal', 'menu', 'info'];
  const BAD = /hit an error|expired|damaged|Unknown|has no |Not a list|cannot take|Most results|Years only|Years must/;
  let pressed = 0, problems = [];
  cmds.forEach(c => {
    const o = E.run('!bitdgen ' + c, gm);
    if (o.length !== 1) { problems.push([c, 'posts', o.length]); return; }
    const why = htmlProblem(o[0]); if (why) { problems.push([c, why]); }
    let queue = E.hrefs(o[0]);
    if (queue.length === 0) { problems.push([c, 'no buttons']); }
    for (let round = 0; round < 2; round++) {
      const next = [];
      Array.from(new Set(queue)).forEach(h => {
        if (/^!bitdgen (debug|mode) /.test(h)) { return; }
        const out = E.run(h, gm); pressed++;
        if (out.length !== 1) { problems.push([c, h, 'posts', out.length]); return; }
        const w = htmlProblem(out[0]); if (w) { problems.push([c, h, w]); }
        if (BAD.test(plain(out[0]))) { problems.push([c, h, plain(out[0]).slice(0, 120)]); }
        if (/^!bitdgen share /.test(h) && !(/^\/direct /.test(out[0]) && E.hrefs(out[0]).length === 0)) { problems.push([c, h, 'share must be public and button-free']); }
        E.hrefs(out[0]).forEach(x => next.push(x));
      });
      queue = next;
    }
  });
  ok(problems.length === 0, 'every button on every card works and posts a well-formed card (' + pressed + ' presses)', problems.slice(0, 4));
  ok(pressed > 300, 'the click-through pressed a substantial number of buttons', pressed);
  // a player pressing the same buttons is refused every time and nothing changes
  const o = E.run('!bitdgen npc', gm); const hrefs = Array.from(new Set(E.hrefs(o[0])));
  const before = JSON.stringify(E.st()); const bad = [];
  hrefs.forEach(h => { const out = E.run(h, pat); if (!(out.length === 1 && out[0] === '/w "Pat" The BitD generators are GM-only.' && E.rolled.length === 0)) { bad.push([h, out]); } });
  ok(bad.length === 0 && JSON.stringify(E.st()) === before, 'a player pressing any of the ' + hrefs.length + ' buttons is refused, nothing rolls, state unchanged', bad.slice(0, 2));
  // no button text or href holds a quote, and the biggest card stays modest
  ok(maxSize < 12000, 'largest posted card is under 12,000 characters', maxSize);
}

// ---------------------------------------------------------------------------------------------
// H. State, modes, debug, arguments
// ---------------------------------------------------------------------------------------------
{ // card limit
  const { E, gm } = fresh(); E.seed(7);
  for (let i = 0; i < 30; i++) { E.run('!bitdgen horror', gm); }
  eq([E.st().order.length, Object.keys(E.st().cards).length, E.st().nextId, E.st().order[0], E.lastId()], [25, 25, 31, 6, 30], 'only the last 25 cards are kept (ids 6 to 30)');
  ['1', '5'].forEach(id => { const o = E.run('!bitdgen re ' + id + ' horror', gm); ok(o.length === 1 && /That card has expired\. Roll again\./.test(plain(o[0])) && E.rolled.length === 0, 'card ' + id + ' has expired', o.map(plain)); });
  const o = E.run('!bitdgen re 6 horror', gm);
  ok(o.length === 1 && /Summoned Horror/.test(plain(o[0])) && E.rolled.length === 2, 'card 6 is still live and re-rolls', o.map(plain));
  eq([E.st().order.length, E.st().nextId], [25, 31], 'a re-roll reuses the card; no new card is stored');
}
{ // debug and mode
  const { E, gm } = fresh();
  let o = E.run('!bitdgen debug on', gm);
  ok(E.st().debug === true && /Debug is now on/.test(plain(o[0])), 'debug on', o.map(plain));
  E.logs.length = 0; E.dice([5]); E.run('!bitdgen name', gm);
  ok(has(E.logs, /!bitdgen name dice: d170=5/) && has(E.logs, /posting \d+ characters \(whisper\)/), 'debug logs the command, every die and the posted size', E.logs);
  o = E.run('!bitdgen debug off', gm); E.logs.length = 0; E.dice([5]); E.run('!bitdgen name', gm);
  ok(E.st().debug === false && E.logs.length === 0, 'debug off: nothing logged', E.logs);
  o = E.run('!bitdgen debug maybe', gm); ok(/Debug is off\./.test(plain(o[0])) && E.st().debug === false, 'a bad debug argument just reports', o.map(plain));
  E.dice([5]); o = E.run('!bitdgen name', gm);
  ok(/^\/w gm /.test(o[0]), 'default: whispered to GM');
  o = E.run('!bitdgen mode public', gm);
  ok(E.st().mode === 'public' && /^\/w gm /.test(o[0]), 'mode public confirmed by a whisper', o.map(plain));
  E.dice([5]); o = E.run('!bitdgen name', gm);
  ok(/^\/direct /.test(o[0]) && !/gm/.test(o[0].slice(0, 9)), 'public mode posts with /direct', o[0].slice(0, 30));
  checkAll(o, 'public card');
  ok(!/GM only/.test(plain(o[0])), 'a public card is not labelled GM only');
  o = E.run('!bitdgen mode xyz', gm); ok(/Results are public\./.test(plain(o[0])) && E.st().mode === 'public', 'a bad mode argument just reports', o.map(plain));
  o = E.run('!bitdgen mode whisper', gm); ok(E.st().mode === 'whisper', 'mode whisper');
  E.dice([5]); o = E.run('!bitdgen name', gm); ok(/^\/w gm /.test(o[0]) && /GM only/.test(plain(o[0])), 'back to whispers, labelled GM only');
}
{ // share
  const { E, gm } = fresh();
  go(E, gm, '!bitdgen npc', [1, 5, 3, 3, 2, 6, 7, 4, 2, 1, 6, 3, 4, 5, 2, 4, 1, 2, 2], 'npc for share'); const id = E.lastId();
  const o = E.run('!bitdgen share ' + id, gm);
  ok(o.length === 1 && /^\/direct /.test(o[0]) && E.rolled.length === 0, 'share posts publicly and rolls nothing', o.map(s => s.slice(0, 30)));
  ok(E.hrefs(o[0]).length === 0 && !/Share to players|Roll all again/.test(o[0]), 'the shared copy has no buttons');
  ok(/shared/.test(plain(o[0])) && /Adric/.test(plain(o[0])) && /Fishmonger/.test(plain(o[0])) && /Hooded Coat/.test(plain(o[0])), 'the shared copy has the results', plain(o[0]).slice(0, 200));
  checkAll(o, 'shared card');
}
{ // bad arguments never roll or change state
  const { E, gm } = fresh();
  go(E, gm, '!bitdgen npc name', [5], 'card'); const id = E.lastId();
  const before = JSON.stringify(E.st());
  const tests = [
    ['!bitdgen nonsense', /Unknown generator "nonsense"/], ['!bitdgen npc nonsense', /Unknown section "nonsense"/], ['!bitdgen npc 3', /A number only works/],
    ['!bitdgen re abc name', /expired/], ['!bitdgen re 999 name', /expired/], ['!bitdgen re ' + id + ' nope', /no "nope" line/], ['!bitdgen re ' + id, /no "" line/],
    ['!bitdgen add ' + id + ' style', /no style line|no "style" line/], ['!bitdgen var ' + id + ' name', /no common\/rare choice/], ['!bitdgen flip ' + id + ' name', /no other option/],
    ['!bitdgen grp ' + id + ' name 1', /no list choice/], ['!bitdgen help', /Usage:/]
  ];
  tests.forEach(t => { const o = E.run(t[0], gm); ok(o.length === 1 && t[1].test(plain(o[0])) && E.rolled.length === 0, t[0] + ' -> ' + t[1], o.map(plain)); });
  ok(JSON.stringify(E.st()) === before, 'none of those changed any state');
  E.dice([6]); E.run('!bitdgen add ' + id + ' name', gm); ok(E.rolled.length === 1 && E.items('name', id).length === 2, 'a valid add does roll one die and adds a name');
  // casing, spacing, clamps
  go(E, gm, '!bitdgen NPC GOAL', [4, 2], 'upper case'); eq(E.items('goal')[0], 'Revenge', 'commands and sections are case-insensitive');
  go(E, gm, '!bitdgen    npc    goal', [1, 6], 'extra spaces'); eq(E.items('goal')[0], 'Knowledge', 'extra spaces are fine');
  E.seed(9); E.run('!bitdgen street props 99', gm); eq(E.items('props').length, 10, 'a count above 10 is clamped to 10');
  E.run('!bitdgen street props 4', gm); eq(E.items('props').length, 4, 'street props 4 gives four unique props'); eq(new Set(E.items('props')).size, 4, 'and they are all different');
  E.run('!bitdgen', gm); ok(true, 'no argument opens the menu');
}
{ // menu and info
  const { E, gm } = fresh();
  const o = E.run('!bitdgen menu', gm); checkAll(o, 'menu');
  const h = E.hrefs(o[0]);
  ['npc', 'name', 'ghost', 'demon', 'horror', 'cult', 'street', 'building', 'score', 'rumor', 'overheard', 'news', 'occurrence', 'info', 'debug on', 'mode public'].forEach(g => ok(h.indexOf('!bitdgen ' + g) >= 0, 'menu has a button for ' + g, h));
  ok(E.rolled.length === 0 && Object.keys(E.st().cards).length === 0, 'the menu rolls nothing and stores nothing');
  eq(E.run('!bitdgen', gm).length, 1, 'no argument is the menu');
  const i = E.run('!bitdgen info', gm); checkAll(i, 'info');
  const t = plain(i[0]);
  ok(/BitD Generators v0\.1\.0/.test(t) && /data snapshot 2026-10-05/.test(t) && /People: 31134/.test(t) && /Streets & Buildings: 26008/.test(t) && /Rumors: 11145/.test(t), 'info shows the version, snapshot date and handout sizes', t.slice(0, 400));
}

{ // HTML helpers
  const E = makeEnv(); const B = E.env.BitDGen;
  let threw = false; try { B._btn('x', '!bitdgen re 1 na"me'); } catch (e) { threw = true; }
  ok(threw, 'a button command containing a quote is refused (it would break the href)');
  ok(B._btn('go', '!bitdgen re 1 name').indexOf('href="!bitdgen re 1 name"') >= 0, 'a normal button command is written as given');
  eq(B._esc('Hood & Veil <b> "x"'), 'Hood &amp; Veil &lt;b&gt; &quot;x&quot;', 'text is escaped for & < > and quotes');
  ok(B._btn('a<b', '!bitdgen x').indexOf('a&lt;b') > 0, 'button labels are escaped');
}

// ---------------------------------------------------------------------------------------------
// I. Handout check
// ---------------------------------------------------------------------------------------------
{
  const E = makeEnv(); E.player('GM', true); const gm = E.store.players[0].id; E.ready();
  E.handout('People', 'x'.repeat(31134));                 // raw length equals the recorded size
  E.handout('Devils', 'x'.repeat(22000));                 // differs
  E.handout('Scores', 'é'.repeat(1143));             // URL-encoded length 6858 (each e-acute is 6 characters)
  E.handout('Rumors', 'x'.repeat(11145));
  const o = E.run('!bitdgen check', gm); checkAll(o, 'check');
  const t = plain(o[0]);
  ok(o.length === 1 && /People: size matches the snapshot/.test(t) && /Devils: size differs \(now 22000 raw/.test(t) && /Streets & Buildings: no handout with this name was found/.test(t) && /Scores: size matches the snapshot/.test(t) && /Rumors: size matches the snapshot/.test(t), 'check reports each handout', t);
  ok(/Indicative only/.test(t), 'check says it is indicative only');
  eq(E.rolled.length, 0, 'check rolls nothing');
}

// ---------------------------------------------------------------------------------------------
// J. Errors
// ---------------------------------------------------------------------------------------------
{
  const E = makeEnv(); const gm = E.player('GM', true); E.ready();
  let o = E.run('!bitdgen npc', gm);   // no dice forced and no rng: the mock's randomInteger throws
  ok(o.length === 1 && /hit an error running "!bitdgen npc"/.test(plain(o[0])) && /API log/.test(plain(o[0])), 'a failure inside a command is reported to the GM, not thrown', o.map(plain));
  ok(has(E.logs, /ERROR running "!bitdgen npc"/), 'and written to the API log', E.logs);
  eq([E.st().order.length, E.st().nextId], [0, 1], 'a failed roll stores no card');
  E.st().cards[5] = { id: 5, gen: 'nope', lines: [] }; E.st().order.push(5);
  o = E.run('!bitdgen re 5 x', gm); ok(/damaged/.test(plain(o[0])), 'a damaged card is reported', o.map(plain));
  E.st().cards[6] = { id: 6, gen: 'npc', section: '', opts: {}, lines: [{ key: 'bogus', items: [] }] }; E.st().order.push(6);
  o = E.run('!bitdgen re 6 bogus', gm); ok(/hit an error/.test(plain(o[0])), 'a card with an unknown line is reported as an error', o.map(plain));
  E.dice([5, 5]); o = E.run('!bitdgen building items', gm); E.clearDice();
  ok(/hit an error/.test(plain(o[0])) && has(E.logs, /not valid for a d4/), 'the last Items list is rolled on a d4 (a 5 is refused by the mock)', E.logs.slice(-1));
  eq(E.st().order.length, 2, 'that failure stored no card either');
}

// ---------------------------------------------------------------------------------------------
// K. Seeded random sweep: many commands and button presses, every card must be sound
// ---------------------------------------------------------------------------------------------
{
  const { E, gm } = fresh(); E.seed(20261005);
  let s = 12345; const r = (n) => { s = (Math.imul(s, 1103515245) + 12345) >>> 0; return (s >>> 8) % n; };
  const cmds = ['npc', 'name', 'ghost', 'ghost 7', 'ghost trait', 'ghost effect', 'demon', 'demon type', 'demon desire 3', 'demon feature 4', 'horror', 'cult', 'cult god', 'street', 'street impressions', 'street props 5', 'street use 3', 'building', 'building exterior 2', 'building items 3', 'building use 2', 'score', 'score client', 'score twist', 'score connected', 'score faction', 'rumor', 'occurrence', 'overheard', 'news'];
  const problems = []; let posts = 0, presses = 0;
  for (let i = 0; i < 1200; i++) {
    let o = E.run('!bitdgen ' + cmds[r(cmds.length)], gm); posts += o.length;
    for (let k = 0; k < 3 && o.length === 1; k++) {
      const why = htmlProblem(o[0]); if (why) { problems.push(why); }
      if (/hit an error|expired|damaged|Unknown/.test(plain(o[0]))) { problems.push(plain(o[0]).slice(0, 100)); }
      const hrefs = E.hrefs(o[0]).filter(h => !/^!bitdgen (menu|info|debug|mode|share)/.test(h));
      if (!hrefs.length) { break; }
      o = E.run(hrefs[r(hrefs.length)], gm); presses++; posts += o.length;
    }
  }
  ok(problems.length === 0, 'random sweep: ' + posts + ' posts after ' + presses + ' random button presses, all sound', problems.slice(0, 3));
}

console.log('largest posted card: ' + maxSize + ' characters');
console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

// Local mock of the Roll20 API to exercise "BoB Token Action Maker.js".
// Usage: node mock_test_bob.js "BoB Token Action Maker.js" "translation.json" [blades.html] [other scripts...]
//   translation.json  the Band of Blades sheet's translation file (every ^{key} the script uses must exist in it)
//   blades.html       optional: the sheet itself. With it, the script's cards are compared with the sheet's own roll
//                     buttons and every attribute the script touches must exist in the sheet.
//   other scripts     optional, loaded into the same game for the coexistence checks:
//                     band-of-blades-calculator.js band-of-blades-mission-generator.js "BitD Token Action Maker.js"
// The expected values below are typed from the Band of Blades book (Stress and Trauma, Corruption and Blight, Resistance
// and Armor, Harm, Loadout) and from the sheet's roll buttons, NOT copied from the script.
const fs = require('fs');
const vm = require('vm');
const SRC = fs.readFileSync(process.argv[2], 'utf8');
const TRANSLATION = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
const HTML = process.argv[4] && fs.existsSync(process.argv[4]) ? fs.readFileSync(process.argv[4], 'utf8') : null;
const OTHERS = process.argv.slice(5).filter(f => fs.existsSync(f)).map(f => ({ file: f, src: fs.readFileSync(f, 'utf8') }));
const OTHER = (re) => (OTHERS.find(o => re.test(o.file)) || {}).src;

const DEFAULTS = { stress: '0', trauma: '0', corruption: '0', blight: '0', sheet_type: 'character', setting_specialist_action: '-',
  setting_extra_stress: '0', setting_extra_trauma: '0', title_text: '', chat_image: '' };
['research', 'scout', 'rig', 'wreck', 'skirmish', 'shoot', 'maneuver', 'consort', 'discipline', 'marshal', 'sway',
  'aim', 'anchor', 'channels', 'doctor', 'grit', 'scrounge', 'weave', 'insight', 'prowess', 'resolve',
  'insight_bonus', 'prowess_bonus', 'resolve_bonus', 'aim_uses', 'anchor_uses', 'channels_uses', 'doctor_uses', 'grit_uses', 'scrounge_uses', 'weave_uses',
  'insight_xp', 'prowess_xp', 'resolve_xp', 'specialist_xp', 'playbook_xp'].forEach(k => { DEFAULTS[k] = '0'; });

const touched = {}; // every attribute name the script read or wrote

function makeEnv(srcs, opts) {
  opts = opts || {};
  let n = 0; const nid = () => '-id' + (++n);
  const store = { chars: [], attrs: [], abilities: [], graphics: [], players: [], macros: [] };
  const out = []; const logs = []; const handlers = {}; let timers = []; const clock = { t: 1700000000000 };
  const wrap = (arr, rec) => ({
    id: rec.id,
    get: (k) => rec[k],
    set: (k, v) => { if (typeof k === 'object') Object.assign(rec, k); else rec[k] = v; },
    setWithWorker: (obj) => { if (rec._characterid && rec.name) { touched[rec.name] = true; } Object.assign(rec, obj); },
    remove: () => { const i = arr.indexOf(rec); if (i >= 0) arr.splice(i, 1); }
  });
  const kinds = { character: 'chars', attribute: 'attrs', ability: 'abilities', graphic: 'graphics', player: 'players', macro: 'macros' };
  const env = {
    log: (s) => { logs.push(String(s)); },
    setTimeout: (fn) => { timers.push(fn); return timers.length; },
    on: (ev, fn) => { (handlers[ev] = handlers[ev] || []).push(fn); },
    state: {},
    Date: { now: () => clock.t },
    sendChat: (who, text) => { out.push({ who, text }); },
    playerIsGM: (id) => !!(store.players.find(p => p.id === id) || {}).gm,
    getObj: (type, id) => { const r = store[kinds[type]].find(x => x.id === id); return r ? wrap(store[kinds[type]], r) : undefined; },
    findObjs: (q) => {
      const arr = store[kinds[q._type]];
      if (q._type === 'attribute' && q.name) { touched[q.name] = true; }
      return arr.filter(r => Object.keys(q).every(k => k === '_type' || r[k] === q[k])).map(r => wrap(arr, r));
    },
    createObj: (type, props) => {
      const rec = Object.assign({ id: nid() }, props); store[kinds[type]].push(rec);
      if (type === 'attribute') { touched[props.name] = true; }
      return wrap(store[kinds[type]], rec);
    },
    getAttrByName: (cid, name) => {
      touched[name] = true;
      if (opts.throwOn && opts.throwOn === name) { throw new Error('boom'); }
      const a = store.attrs.find(x => x._characterid === cid && x.name === name);
      return a ? a.current : DEFAULTS[name];
    }
  };
  const ctx = vm.createContext(env);
  srcs.forEach(s => vm.runInContext(s, ctx));
  const E = {
    store, out, logs, env, clock,
    char(name, controlledby) { const rec = { id: nid(), name, controlledby: controlledby || '' }; store.chars.push(rec); return rec.id; },
    attr(cid, name, val) { const a = store.attrs.find(x => x._characterid === cid && x.name === name); if (a) a.current = String(val); else store.attrs.push({ id: nid(), _characterid: cid, name, current: String(val) }); },
    get(cid, name) { const a = store.attrs.find(x => x._characterid === cid && x.name === name); return a ? a.current : undefined; },
    attrObj(cid, name) { const a = store.attrs.find(x => x._characterid === cid && x.name === name); return a ? wrap(store.attrs, a) : undefined; },
    player(name, gm) { const rec = { id: nid(), _displayname: name, gm: !!gm }; store.players.push(rec); return rec.id; },
    token(cid, name, extra) { const rec = Object.assign({ id: nid(), represents: cid, name: name }, extra || {}); store.graphics.push(rec); return rec.id; },
    tok(id) { return store.graphics.find(g => g.id === id); },
    run(content, playerid, selectedTokenId) {
      out.length = 0;
      const msg = { type: 'api', content, playerid, who: 'x', selected: selectedTokenId ? [{ _id: selectedTokenId, _type: 'graphic' }] : undefined };
      (handlers['chat:message'] || []).forEach(h => h(msg));
      return out.map(o => o.text);
    },
    // hand a card that the script posted back to the chat handlers, as Roll20 does, with the given d6 results
    deliver(text, vals, pid, tmpl) {
      out.length = 0;
      let i = 0;
      const content = text.replace(/\[\[d6\]\]/g, () => '$[[' + (i++) + ']]');
      const inlinerolls = (vals || []).map(v => ({ results: { rolls: [{ sides: 6, dice: 1 }], total: v } }));
      const msg = { type: 'general', rolltemplate: tmpl || 'blades', content, inlinerolls, playerid: pid, who: 'x' };
      (handlers['chat:message'] || []).forEach(h => h(msg));
      return out.map(o => o.text);
    },
    fire(ev, obj) { (handlers[ev] || []).forEach(h => h(obj)); },
    flush() { const t = timers; timers = []; t.forEach(f => f()); },
    advance(ms) { clock.t += ms; },
    ready() { (handlers['ready'] || []).forEach(h => h()); },
    posted() { return out.filter(o => /^player\|/.test(o.who)).map(o => o.text); },
    whispers() { return out.filter(o => /^\/w /.test(o.text)).map(o => o.text); }
  };
  return E;
}

let pass = 0, fail = 0, skipped = 0;
function ok(cond, label, extra) { if (cond) { pass++; } else { fail++; console.log('FAIL:', label, extra !== undefined ? '\n   ' + JSON.stringify(extra) : ''); } }
function skip(label) { skipped++; }
const has = (arr, re) => arr.some(t => re.test(t));
const BOB = (src) => makeEnv([src || SRC]);

// ---- card readers
const bcards = (o) => o.filter(t => /^(\/w "[^"]*" )?&\{template:blades-broadcast\}/.test(t));
const lastCard = (o) => { const c = bcards(o); return c[c.length - 1]; };
const field = (card, f) => { const m = new RegExp('\\{\\{' + f + '=([\\s\\S]*?)\\}\\}(?!\\})').exec(card || ''); return m ? m[1] : null; };
const linesOf = (card) => (field(card, 'content') || '').split('\n');
const buttons = (card) => { const re = /\[([^\]]*)\]\(([^)]*)\)/g, r = []; let m; while ((m = re.exec(card || ''))) { r.push({ label: m[1], cmd: m[2] }); } return r; };
const title = (card) => field(card, 'title');
const norm = (s) => String(s).replace(/\s+/g, ' ').trim();
const toStr = (x) => (Array.isArray(x) ? x.join(' || ') : String(x));

// ---- what the sheet itself writes (typed from blades.html diceMagic and the roll buttons)
const sheetDice = (num) => num > 0
  ? Array.from({ length: num }, (_, i) => i + 1).map(i => '{{die' + i + '=[[d6]]' + (i < num ? ',' : '') + '}}').join(' ')
  : '{{zerodie1=[[d6]],}} {{zerodie2=[[d6]]}}';
const decodeEnt = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#44;/g, ',').replace(/&#125;/g, '}');
function sheetButton(name, mustHave) {
  if (!HTML) { return null; }
  const re = new RegExp('name="roll_' + name + '" value="([^"]*)"', 'g'); let m, first = null;
  while ((m = re.exec(HTML))) { const v = decodeEnt(m[1]); if (!mustHave || v.indexOf(mustHave) >= 0) { return v; } first = first || v; }
  return mustHave ? null : first;
}
function expand(value, c) {
  let s = value.replace('{{@{position_query}}}', c.position === 'Fortune' ? '{{short=short}}' : '{{position=' + c.position + '}}');
  const map = { '@{character_name}': c.name, '@{effect_query}': c.effect, '@{chat_image}': c.image || '', '@{title_text}': '', '@{notes_query}': c.notes || '', '@{numberofdice}': sheetDice(c.dice) };
  s = s.replace(/@\{[a-z0-9_]+_formula\}/g, sheetDice(c.dice));
  Object.keys(c.attrs || {}).forEach(k => { s = s.split('@{' + k + '}').join(c.attrs[k]); });
  Object.keys(map).forEach(k => { s = s.split(k).join(map[k]); });
  return norm(s.replace(' {{notes=}}', ''));
}

// ---------------------------------------------------------------- source hygiene
{
  const code = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  ok(!/[^\x00-\x7f]/.test(SRC), 'source is plain ASCII');
  ok(!/\\u[0-9a-fA-F]{4}/.test(SRC), 'no \\uXXXX escapes (some tools rewrite them)');
  ok(/'use strict'/.test(SRC), 'strict mode');
  ok(!/`/.test(SRC), 'no backtick anywhere (the upload method uses backtick strings)');
  ok(!/=>/.test(code) && !/\b(let|const)\s/.test(code), 'ES5: no arrows, let or const');
  ok((SRC.match(/^var BoBTAM = /gm) || []).length === 1 && /\}\(\)\);\s*$/.test(SRC), 'one top-level IIFE named BoBTAM');
  ok(!/state\.(BitDTAM|BitDPE|BoBCalc|BoBMissions)|\bBitDTAM\b|BandOfBlades(Calculator|Missions)/.test(code), 'does not touch the other scripts\' state or globals');
  ok(/state\.BoBTAM/.test(code), 'own state key is state.BoBTAM');
  ok(!/Deep Cuts|setting_dc_|edge_amount|bitd-broadcast|setting_traumata_set|coin|stash/i.test(code), 'no Blades in the Dark or Deep Cuts leftovers in the code');
  ok(!/stress_max|trauma_max/.test(code), 'never reads the sheet\'s stress_max or trauma_max (they hold the Blades in the Dark numbers)');
  ok(/MARK = 'bob-tam'/.test(code) && !/bitd-tam/.test(code), 'ability marker is bob-tam, never bitd-tam');
}

// ---------------------------------------------------------------- startup, macro, state
{
  const E = BOB(); const gm = E.player('GM', true); E.ready();
  const m = E.store.macros[0];
  ok(E.store.macros.length === 1 && m.name === 'LEGION_TAM' && m.visibleto === 'all' && m._playerid === gm && m.action === '!bobtam setup', 'macro LEGION_TAM runs !bobtam setup, visible to all, owned by the GM', m);
  ok(!/bob|tam|legion/i.test(m.action.replace('!bobtam setup', '')) && m.name.toLowerCase().indexOf('bobtam') < 0 && m.name.toLowerCase().indexOf('bob') < 0 && m.name.toLowerCase().indexOf('setup') < 0, 'macro name shares nothing with the command text', [m.name, m.action]);
  ok(E.logs.some(l => /BoB Token Action Maker v0\.1\.0 ready/.test(l)), 'startup log line with the version', E.logs);
  E.ready();
  ok(E.store.macros.length === 1, 'second start does not duplicate the macro');
  m.action = '!bobtam old'; m.visibleto = '';
  E.ready();
  ok(E.store.macros[0].action === '!bobtam setup' && E.store.macros[0].visibleto === 'all', 'a stale macro action and visibility are repaired', E.store.macros[0]);
  const E2 = BOB(); E2.ready();
  ok(E2.store.macros.length === 0, 'no GM in the game: no macro, no crash');
  ok(E.env.BoBTAM && E.env.BoBTAM.VERSION === '0.1.0', 'global BoBTAM exposes the version');
}

// ---------------------------------------------------------------- one game: a GM, two players, three PCs
function game(src) {
  const E = BOB(src); const gm = E.player('GM', true), pat = E.player('Pat', false), quinn = E.player('Quinn', false); E.ready();
  const soldier = E.char('Ayla', pat), spec = E.char('Bo', quinn), rookie = E.char('Cy', 'all');
  const tS = E.token(soldier, 'Ayla'), tB = E.token(spec, 'Bo'), tC = E.token(rookie, 'Cy');
  E.attr(soldier, 'skirmish', 2); E.attr(soldier, 'research', 1); E.attr(soldier, 'sway', 3); E.attr(soldier, 'chat_image', 'https://x.test/a/thumb.png');
  E.attr(soldier, 'setting_specialist_action', 'grit'); E.attr(soldier, 'grit', 2);
  E.attr(spec, 'shoot', 1); E.attr(spec, 'wreck', 2); E.attr(spec, 'setting_specialist_action', 'aim'); E.attr(spec, 'aim', 3); E.attr(spec, 'setting_extra_stress', 2);
  E.attr(rookie, 'setting_extra_trauma', -1);
  return { E, gm, pat, quinn, soldier, spec, rookie, tS, tB, tC };
}

// ---------------------------------------------------------------- setup (Rebuild)
{
  const { E, gm, pat, quinn, soldier, spec, tS, tB } = game();
  let o = E.run('!bobtam setup', pat, tS);
  const abil = (cid) => E.store.abilities.filter(a => a._characterid === cid);
  ok(abil(soldier).length === 9, 'setup creates 9 token actions', abil(soldier).map(a => a.name));
  ok(JSON.stringify(abil(soldier).map(a => a.name)) === JSON.stringify(['1. Action', '2. Resist', '3. Fortune', '4. Abilities', '5. Harm', '6. Adjust', '7. Status', '8. Load', '~ Rebuild']), 'names in order, Rebuild last');
  ok(abil(soldier).every(a => a.istokenaction === true && a.description === 'bob-tam'), 'every ability is a token action carrying the bob-tam marker');
  const sorted = abil(soldier).map(a => a.name).slice().sort();
  ok(JSON.stringify(sorted) === JSON.stringify(abil(soldier).map(a => a.name)), 'Roll20 character-by-character sort order equals the intended order', sorted);
  const act = (n) => abil(soldier).find(a => a.name === n).action;
  ok(!abil(soldier).some(a => /\n|"/.test(a.action)), 'no newline or double quote in any macro');
  ok(/^!bobtam roll \?\{Action\|/.test(act('1. Action')) && /Research \(@\{selected\|research\}\),research\|Scout \(@\{selected\|scout\}\),scout\|Rig \(@\{selected\|rig\}\),rig\|Wreck/.test(act('1. Action')) &&
    /Maneuver \(@\{selected\|maneuver\}\),maneuver\|Consort/.test(act('1. Action')) && /Sway \(@\{selected\|sway\}\),sway\} \?\{Position\|Risky\|Controlled\|Desperate\|Fortune roll,Fortune\} \?\{Effect\|Standard\|Limited\|Great\|Extreme\|Zero\} \?\{Bonus dice\|0\|1\|2\|3\|4\|5\|6\|-1\|-2\|-3\}$/.test(act('1. Action')), 'Action: 11 core actions with ratings, then position, effect, bonus dice, in the sheet\'s order', act('1. Action'));
  ok((act('1. Action').match(/@\{selected\|/g) || []).length === 11 && !/hunt|study|survey|tinker|aim|grit/.test(act('1. Action')), 'Action lists exactly the 11 core actions, no specialist or Blades in the Dark action');
  ok(act('2. Resist') === '!bobtam resist ?{Resist|Insight (@{selected|insight}),insight|Prowess (@{selected|prowess}),prowess|Resolve (@{selected|resolve}),resolve} ?{Bonus dice|0|1|2|3|4|5|6|-1|-2|-3}', 'Resist macro', act('2. Resist'));
  ok(/^!bobtam fortune \?\{Fortune dice\|0\|1\|2\|3\|4\|5\|6\|Specialist action \(@\{selected\|setting_specialist_action\}\),spec\} --text \?\{Notes \(optional\)\|\}$/.test(act('3. Fortune')), 'Fortune macro: 0 to 6 dice or the specialist action, then notes', act('3. Fortune'));
  ok(act('4. Abilities') === '!bobtam abilities' && act('7. Status') === '!bobtam status' && act('8. Load') === '!bobtam load' && act('~ Rebuild') === '!bobtam setup', 'plain verbs');
  ok(/^!bobtam harm --level \?\{Level\|Level 1 \(less effect\),1\|Level 2 \(-1d\),2\|Level 3 \(need help\),3\|Level 4 \(fatal\),4\} --text \?\{Harm description\}$/.test(act('5. Harm')), 'Harm macro uses the sheet\'s row labels', act('5. Harm'));
  const adj = act('6. Adjust');
  ['stress+1', 'stress+2', 'stress+3', 'stress-1', 'stress-2', 'stress-3', 'stress0', 'trauma+1', 'trauma-1', 'corr+1', 'corr+2', 'corr+3', 'corr-1', 'blight+1', 'blight-1',
    'armor', 'heavy', 'shield', 'special', 'armor-restore', 'spec+1', 'spec0', 'xp-insight', 'xp-prowess', 'xp-resolve', 'xp-specialist', 'xp-playbook'].forEach(code => {
    ok(new RegExp(',' + code.replace(/[+]/g, '\\+') + '(\\||\\}|$)').test(adj), 'Adjust offers ' + code);
  });
  ok(!/coin|stash|edge|debt|heal|xp\+1/i.test(adj) && !/[^|]*,[^|]*,[^|]*/.test(adj.split('|').map(x => x.replace(/ \(.*\)/, '')).join('|')), 'Adjust has no Blades in the Dark entries and one comma per option', adj);
  // permissions and idempotence
  o = E.run('!bobtam setup', pat, tS);
  ok(abil(soldier).length === 9, 'rebuild twice still leaves 9');
  E.store.abilities.push({ id: 'u1', _characterid: soldier, name: 'My own macro', description: '', action: 'hello', istokenaction: true });
  E.store.abilities.push({ id: 'u2', _characterid: soldier, name: '1. Action', description: 'bitd-tam', action: 'bitd stuff', istokenaction: true });
  o = E.run('!bobtam setup', pat, tS);
  ok(abil(soldier).some(a => a.id === 'u1') && abil(soldier).some(a => a.id === 'u2' && a.action === 'bitd stuff'), 'user abilities and abilities marked bitd-tam are left alone');
  ok(abil(soldier).filter(a => a.name === '1. Action').length === 1 && has(o, /Skipped \(an ability with that name already exists\): 1\. Action/), 'a same-name ability that is not ours is skipped and reported', o);
  E.store.abilities = E.store.abilities.filter(a => a.id !== 'u2');
  o = E.run('!bobtam setup', pat, tB);
  ok(abil(spec).length === 0 && has(o, /you can only use this on characters you control/), 'a player cannot set up another player\'s character', o);
  o = E.run('!bobtam setup', gm, tB);
  ok(abil(spec).length === 9, 'the GM can set up anyone');
  o = E.run('!bobtam setup', pat);
  ok(has(o, /select one or more character tokens first/), 'nothing selected: asks for a token', o);
  const tNpc = E.token(undefined, 'Wolf');
  o = E.run('!bobtam setup', gm, tNpc);
  ok(has(o, /select one or more character tokens first/), 'a token without a character is ignored', o);
  const E2 = game(); const sel2 = E2.E.token(E2.soldier, 'second');
  E2.E.run('!bobtam setup', E2.pat, E2.tS); E2.E.run('!bobtam setup', E2.pat, E2.tS);
  o = E2.E.run('!bobtam setup --c ' + E2.soldier, E2.pat);
  ok(E2.E.store.abilities.filter(a => a._characterid === E2.soldier).length === 9, 'setup by character id (button path) works without a token');
}

// ---------------------------------------------------------------- token bars: bar 1 = stress only
{
  const { E, gm, pat, soldier, spec, tS, tB } = game();
  E.tok(tS).bar2_value = '3'; E.tok(tS).bar2_link = 'keep2'; E.tok(tS).bar3_value = '1'; E.tok(tS).bar3_link = 'keep3'; E.tok(tS).bar1_value = '5';
  E.run('!bobtam setup', pat, tS);
  const a = E.store.attrs.find(x => x._characterid === soldier && x.name === 'stress');
  ok(a && E.tok(tS).bar1_link === a.id, 'bar 1 is linked to the stress attribute (created when missing)', E.tok(tS));
  ok(String(E.tok(tS).bar1_max) === '6' && E.tok(tS).bar1_value === a.current && E.tok(tS).showplayers_bar1 === true && E.tok(tS).playersedit_bar1 === true, 'bar 1 max is the stress boxes (6), shown to and editable by players', E.tok(tS));
  ok(E.tok(tS).bar2_value === '3' && E.tok(tS).bar2_link === 'keep2' && E.tok(tS).bar3_value === '1' && E.tok(tS).bar3_link === 'keep3', 'bars 2 and 3 are never touched (the calculator reads them)');
  E.run('!bobtam setup', gm, tB);
  ok(String(E.tok(tB).bar1_max) === '8', 'bar 1 max follows Hardened (extra stress 2 = 8 boxes)', E.tok(tB).bar1_max);
  ok(has(E.run('!bobtam setup', pat, tS), /Bar 1 is linked to stress on 1 token/), 'setup says what it linked');
  // linking in two calls: link first, then value and max
  // extra stress changed on the sheet: bar max follows
  E.attr(spec, 'setting_extra_stress', 4);
  E.fire('change:attribute:current', E.attrObj(spec, 'setting_extra_stress'));
  ok(String(E.tok(tB).bar1_max) === '10', 'a change to setting_extra_stress updates bar 1 max (10 boxes)', E.tok(tB).bar1_max);
  // tokens linked by hand to some other attribute are left alone
  const other = { id: 'oa', _characterid: soldier, name: 'something_else', current: '4' }; E.store.attrs.push(other);
  const tX = E.token(soldier, 'hand', { bar1_link: 'oa', bar1_value: '4', bar1_max: '9' });
  E.run('!bobtam adj stress+1', pat, tS); E.flush();
  ok(E.tok(tX).bar1_value === '4' && E.tok(tX).bar1_max === '9', 'a bar linked to another attribute is left alone');
}

// ---------------------------------------------------------------- a linked bar follows every script write to stress
{
  const { E, gm, pat, soldier, tS } = game();
  E.run('!bobtam setup', pat, tS);
  const a = E.store.attrs.find(x => x._characterid === soldier && x.name === 'stress');
  const bar = () => E.tok(tS).bar1_value;
  E.run('!bobtam adj stress+2', pat, tS); ok(a.current === '2' && bar() === '2', 'Adjust stress +2: the bar shows 2', [a.current, bar()]);
  E.run('!bobtam adj stress-1', pat, tS); ok(bar() === '1', 'Adjust stress -1: the bar shows 1');
  E.run('!bobtam adj stress+3', pat, tS); ok(bar() === '4', 'Adjust stress +3: the bar shows 4');
  E.run('!bobtam adj stress0', pat, tS); ok(bar() === '0', 'Clear all stress: the bar shows 0');
  E.attr(soldier, 'stress', 6); E.tok(tS).bar1_value = '6';
  E.run('!bobtam adj stress+1', pat, tS); ok(a.current === '0' && bar() === '0', 'overflow resets stress to 0 and the bar follows (also after the delayed second sync)', [a.current, bar()]);
  E.tok(tS).bar1_value = '9'; E.flush(); ok(bar() === '0', 'the delayed sync puts a stale bar right');
  // a stress offer from a resist roll
  E.attr(soldier, 'skirmish', 1); E.run('!bobtam resist prowess 0', pat, tS);
  const o = E.deliver(E.posted()[0], [3], pat);
  E.run(buttons(lastCard(o))[0].cmd, pat, tS); ok(bar() === '3', 'Take 3 stress: the bar shows 3', bar());
  // a token on another character, or not linked to stress, is never written
  const other = E.char('Other', pat), tO = E.token(other, 'o', { bar1_value: '5', bar1_max: '9' });
  E.run('!bobtam adj stress+1', pat, tS); E.flush(); ok(E.tok(tO).bar1_value === '5', 'a token that is not linked to this stress attribute is left alone');
}

// ---------------------------------------------------------------- pool above the card's 12 dice
{
  const { E, gm, pat, soldier, tS } = game();
  E.attr(soldier, 'insight_bonus', 5); // research 1 + rated specialist action 1 + heritage 5 = 7, plus 6 bonus = 13
  const r = E.run('!bobtam resist insight 6', pat, tS);
  const t = E.posted()[0];
  ok((t.match(/\{\{die[0-9]+=/g) || []).length === 12 && !/die13/.test(t) && has(r, /the card shows at most 12 dice, so 12 were rolled instead of 13/), 'a pool of 13 is capped at the template\'s 12 dice and says so', r);
  const o = E.deliver(t, [1, 2, 3, 4, 5, 6, 1, 2, 3, 4, 5, 3], pat);
  ok(has(o, /Highest die: 6/), 'the stress offer reads all 12 dice');
}

// ---------------------------------------------------------------- the 11 core actions: card text
{
  const { E, gm, pat, quinn, soldier, spec, tS, tB } = game();
  const A = (cmd, who, tok) => E.run(cmd, who === undefined ? pat : who, tok === undefined ? tS : tok);
  let o = A('!bobtam roll skirmish Risky Standard 1');
  const expected = '&{template:blades} {{title=^{skirmish}}} {{title-skirmish=1}} {{type=action}} {{subtitle=Ayla ^{rolls}}} {{position=Risky}} {{results=1}} {{result_crit=^{action_roll_crit}}} {{result_6=^{action_roll_6}}} {{result_4_5=^{action_roll_4_5}}} {{result_1_3=^{action_roll_1_3}}} {{effect=Standard}} {{die1=[[d6]],}} {{die2=[[d6]],}} {{die3=[[d6]]}} {{charimage=https://x.test/a/thumb.png}}';
  ok(E.posted().length === 1 && norm(E.posted()[0]) === expected, 'skirmish rating 2 + 1 bonus: exact card, posted as the clicking player (typed from the sheet button, facts section 3)', E.posted());
  ok(E.out.some(x => x.who === 'player|' + pat), 'posted through sendChat as player|<id>');
  // pool arithmetic and the zero-dice rule
  const dieCount = (t) => (t.match(/\{\{die[0-9]+=/g) || []).length;
  [[0, 0, 0], [1, 0, 1], [2, 0, 2], [2, 1, 3], [4, 6, 10], [3, 3, 6], [1, -1, 0], [1, -3, 0], [2, -1, 1]].forEach(([r, b, dice]) => {
    E.attr(soldier, 'wreck', r);
    A('!bobtam roll wreck Risky Standard ' + b);
    const t = E.posted()[0], pool = r + b;
    if (pool > 0) { ok(dieCount(t) === dice && !/zerodie/.test(t), 'wreck ' + r + ' + ' + b + ' = ' + dice + ' dice', t); }
    else { ok(/\{\{zerodie1=\[\[d6\]\],\}\} \{\{zerodie2=\[\[d6\]\]\}\}/.test(t) && dieCount(t) === 0, 'wreck ' + r + ' + ' + b + ' = zero dice (two dice, take the lowest)', t); }
  });
  // position and effect lists
  ['Risky', 'Controlled', 'Desperate'].forEach(p => { A('!bobtam roll sway ' + p + ' Great 0'); ok(has(E.posted(), new RegExp('\\{\\{position=' + p + '\\}\\}')) && /\{\{effect=Great\}\}/.test(E.posted()[0]), 'position ' + p); });
  A('!bobtam roll sway Fortune Limited 0');
  ok(/\{\{short=short\}\}/.test(E.posted()[0]) && !/\{\{position=/.test(E.posted()[0]) && /\{\{results=1\}\}/.test(E.posted()[0]) && /\{\{effect=Limited\}\}/.test(E.posted()[0]), 'Fortune roll position posts the short card, as the sheet does');
  ['Standard', 'Limited', 'Great', 'Extreme', 'Zero'].forEach(e => { A('!bobtam roll sway Risky ' + e + ' 0'); ok(new RegExp('\\{\\{effect=' + e + '\\}\\}').test(E.posted()[0]), 'effect ' + e); });
  A('!bobtam roll sway risky extreme 0');
  ok(/\{\{position=Risky\}\}/.test(E.posted()[0]) && /\{\{effect=Extreme\}\}/.test(E.posted()[0]), 'lower-case arguments are accepted');
  A('!bobtam roll sway Nonsense Nonsense 0');
  ok(/\{\{position=Risky\}\}/.test(E.posted()[0]) && /\{\{effect=Standard\}\}/.test(E.posted()[0]), 'unknown position or effect falls back to Risky and Standard');
  // every one of the 11 actions has its title image key and ^{key}
  ['research', 'scout', 'rig', 'wreck', 'skirmish', 'shoot', 'maneuver', 'consort', 'discipline', 'marshal', 'sway'].forEach(k => {
    A('!bobtam roll ' + k + ' Risky Standard 0');
    const t = E.posted()[0];
    ok(t.indexOf('{{title=^{' + k + '}}} {{title-' + k + '=1}} {{type=action}}') > 0, 'title and title-' + k);
  });
  // title_text is appended like the sheet does
  E.attr(soldier, 'title_text', '{{title-text=1}}');
  A('!bobtam roll sway Risky Standard 0');
  ok(/ \{\{title-text=1\}\}$/.test(E.posted()[0]), 'title_text is appended at the end');
  E.attr(soldier, 'title_text', '');
  // refusals post nothing
  let r = A('!bobtam roll hunt Risky Standard 0');
  ok(!E.posted().length && has(r, /unknown action "hunt"/), 'a Blades in the Dark action is refused', r);
  r = A('!bobtam roll aim Risky Standard 0');
  ok(!E.posted().length && has(r, /unknown action/), 'a specialist action is not an action roll', r);
  r = A('!bobtam roll sway Risky Standard 0', pat, tB);
  ok(!E.posted().length && has(r, /you can only use this on characters you control/), 'a player cannot roll for another player\'s character', r);
  A('!bobtam roll sway Risky Standard 0', gm, tB);
  ok(E.posted().length === 1 && /subtitle=Bo \^\{rolls\}/.test(E.posted()[0]), 'the GM can roll for anyone');
  A('!bobtam roll sway Risky Standard 0', pat, undefined);
  r = E.run('!bobtam roll sway Risky Standard 0', pat);
  ok(has(r, /select a character token first/) && !E.posted().length, 'no token selected: asks for one', r);
  // pool above the template's 12 dice
  E.attr(soldier, 'wreck', 4);
  r = A('!bobtam roll wreck Risky Standard 6'); // 10, fine
  ok(dieCount(E.posted()[0]) === 10 && !has(r, /at most 12/), '10 dice is fine');
  // hostile names are cleaned
  const evil = E.char('Evil }} {{title=x}} |name', pat), tE = E.token(evil, 'e');
  A('!bobtam roll sway Risky Standard 0', pat, tE);
  ok(!/\{\{title=x\}\}/.test(E.posted()[0]) && (E.posted()[0].match(/\{\{subtitle=/g) || []).length === 1, 'a hostile character name cannot inject a field', E.posted()[0]);
}

// ---------------------------------------------------------------- resist card and its pool
{
  const { E, gm, pat, quinn, soldier, spec, tS, tB } = game();
  const R = (cmd, who, tok) => E.run(cmd, who === undefined ? pat : who, tok === undefined ? tS : tok);
  // soldier: research 1, sway 3, specialist grit rated 2 -> insight = 1 action + 1 (specialist rated) ; resolve = 1 ; prowess = 1 (skirmish 2)
  R('!bobtam resist insight 0');
  ok(norm(E.posted()[0]) === '&{template:blades} {{title=^{insight}}} {{title-insight=1}} {{type=resist}} {{top=Ayla}} {{die1=[[d6]],}} {{die2=[[d6]]}} {{notes=^{resist_instructions}}} {{charimage=https://x.test/a/thumb.png}}', 'insight resist: exact card; research (1) plus the rated specialist action (1) = 2 dice', E.posted());
  const dc = (t) => (t.match(/\{\{die[0-9]+=/g) || []).length;
  R('!bobtam resist prowess 0'); ok(dc(E.posted()[0]) === 1, 'prowess: one rated prowess action = 1 die');
  R('!bobtam resist resolve 2'); ok(dc(E.posted()[0]) === 3, 'resolve: one rated action + 2 bonus = 3 dice');
  E.attr(soldier, 'setting_specialist_action', '-');
  R('!bobtam resist insight 0'); ok(dc(E.posted()[0]) === 1, 'no specialist action: insight is just the rated actions');
  E.attr(soldier, 'setting_specialist_action', 'grit'); E.attr(soldier, 'grit', 0);
  R('!bobtam resist insight 0'); ok(dc(E.posted()[0]) === 1, 'a specialist action rated 0 adds nothing to insight');
  E.attr(soldier, 'insight_bonus', 1);
  R('!bobtam resist insight 0'); ok(dc(E.posted()[0]) === 2, 'heritage bonus adds to the rating');
  E.attr(soldier, 'insight_bonus', 0); E.attr(soldier, 'research', 0);
  R('!bobtam resist insight 0');
  ok(/\{\{zerodie1=\[\[d6\]\],\}\} \{\{zerodie2=\[\[d6\]\]\}\}/.test(E.posted()[0]), 'rating 0: zero dice');
  R('!bobtam resist insight -3'); ok(/zerodie1/.test(E.posted()[0]), 'negative pool: zero dice');
  // mismatch with the sheet's stored rating is reported
  E.attr(soldier, 'research', 1); E.attr(soldier, 'insight', 3);
  const w = R('!bobtam resist insight 0');
  ok(has(w, /the sheet shows Insight 3 but its actions add up to 1/) && E.posted().length === 1, 'when the sheet\'s stored rating differs, the script says which one it used', w);
  E.attr(soldier, 'insight', 1);
  ok(!has(R('!bobtam resist insight 0'), /the sheet shows/), 'no warning when they agree');
  // refusals
  let r = R('!bobtam resist luck 0'); ok(!E.posted().length && has(r, /unknown attribute/), 'unknown attribute refused', r);
  r = R('!bobtam resist insight 0', pat, tB); ok(!E.posted().length && has(r, /only use this on characters you control/), 'player cannot resist for someone else', r);
  R('!bobtam resist insight 0', gm, tB); ok(E.posted().length === 1, 'GM can resist for anyone');
  // the sheet adds no subtitle, position, effect or results block to a resist card
  R('!bobtam resist prowess 0');
  ok(!/subtitle|position|effect|results|charname/.test(E.posted()[0].replace('{{type=resist}}', '')), 'a resist card has no subtitle, position, effect, results or charname, like the sheet');
}

// ---------------------------------------------------------------- fortune and specialist action
{
  const { E, gm, pat, quinn, soldier, spec, rookie, tS, tB, tC } = game();
  const F = (cmd, who, tok) => E.run(cmd, who === undefined ? pat : who, tok === undefined ? tS : tok);
  F('!bobtam fortune 3 --text');
  ok(norm(E.posted()[0]) === '&{template:blades} {{type=fortune}} {{subtitle=Ayla ^{rolls}}} {{die1=[[d6]],}} {{die2=[[d6]],}} {{die3=[[d6]]}} {{title=^{fortune}}} {{title-fortune=1}} {{charimage=https://x.test/a/thumb.png}}', 'fortune with 3 dice and no notes: exact card', E.posted());
  F('!bobtam fortune 2 --text what is behind the door');
  ok(/\{\{notes=what is behind the door\}\}/.test(E.posted()[0]), 'notes are passed through');
  F('!bobtam fortune 0 --text');
  ok(/\{\{zerodie1=\[\[d6\]\],\}\} \{\{zerodie2=\[\[d6\]\]\}\}/.test(E.posted()[0]), 'fortune with 0 dice: zero dice');
  for (let i = 0; i <= 6; i++) { F('!bobtam fortune ' + i + ' --text'); ok(((E.posted()[0].match(/\{\{(zero)?die[0-9]+=/g) || []).length) === (i ? i : 2), 'fortune ' + i + ' dice'); }
  let r = F('!bobtam fortune 7 --text'); ok(!E.posted().length && has(r, /pick 0 to 6 dice/), 'more than 6 dice refused', r);
  r = F('!bobtam fortune abc --text'); ok(!E.posted().length, 'nonsense refused');
  // specialist action: rating is the pool; short card without position, effect or results
  F('!bobtam fortune spec --text');
  ok(norm(E.posted()[0]) === '&{template:blades} {{title=^{grit}}} {{title-grit=1}} {{type=action}} {{subtitle=Ayla ^{rolls}}} {{short=short}} {{die1=[[d6]],}} {{die2=[[d6]]}} {{charimage=https://x.test/a/thumb.png}}', 'specialist action (grit, rank 2): exact short card', E.posted());
  F('!bobtam fortune spec --text', quinn, tB);
  ok(/title=\^\{aim\}/.test(E.posted()[0]) && (E.posted()[0].match(/\{\{die[0-9]/g) || []).length === 3, 'Bo\'s aim rank 3 = 3 dice');
  r = F('!bobtam fortune spec --text', pat, tC);
  ok(!E.posted().length && has(r, /has no specialist action set/), 'a Rookie with no specialist action is told so', r);
  E.attr(spec, 'aim', 0);
  F('!bobtam fortune spec --text', gm, tB); ok(/zerodie1/.test(E.posted()[0]), 'rank 0: zero dice');
  r = F('!bobtam fortune 2 --text', pat, tB); ok(!E.posted().length && has(r, /only use this on characters you control/), 'player cannot roll fortune for someone else');
  // all seven specialist actions
  ['aim', 'anchor', 'channels', 'doctor', 'grit', 'scrounge', 'weave'].forEach(k => {
    E.attr(soldier, 'setting_specialist_action', k); E.attr(soldier, k, 1);
    F('!bobtam fortune spec --text');
    ok(E.posted()[0].indexOf('{{title=^{' + k + '}}} {{title-' + k + '=1}} {{type=action}}') > 0 && /\{\{short=short\}\}/.test(E.posted()[0]), 'specialist card for ' + k);
  });
}

// ---------------------------------------------------------------- sheet ground truth: compare with the sheet's own roll buttons
if (HTML) {
  const { E, gm, pat, soldier, spec, tS, tB } = game();
  const plays = (cmd, tok, who) => { E.run(cmd, who || gm, tok); return norm(E.posted()[0] || ''); };
  const base = { name: 'Ayla', image: 'https://x.test/a/thumb.png' };
  const names = { research: 'Research', scout: 'Scout', rig: 'Rig', wreck: 'Wreck', skirmish: 'Skirmish', shoot: 'Shoot', maneuver: 'Maneuver', consort: 'Consort', discipline: 'Discipline', marshal: 'Marshal', sway: 'Sway' };
  let n = 0;
  Object.keys(names).forEach(k => {
    const btn = sheetButton(names[k]);
    ok(!!btn, 'the sheet has a roll_' + names[k] + ' button');
    if (!btn) { return; }
    ['Risky', 'Controlled', 'Desperate', 'Fortune'].forEach((p, i) => {
      const rating = i + 1, bonus = (i % 2) ? 2 : 0;
      E.attr(soldier, k, rating);
      const got = plays('!bobtam roll ' + k + ' ' + p + ' ' + ['Standard', 'Limited', 'Great', 'Zero'][i] + ' ' + bonus, tS);
      const want = expand(btn, { name: 'Ayla', image: base.image, position: p, effect: ['Standard', 'Limited', 'Great', 'Zero'][i], dice: rating + bonus });
      ok(got === want, 'action ' + k + ' ' + p + ' matches the sheet\'s roll_' + names[k] + ' button', [got, want]); n++;
    });
    E.attr(soldier, k, 0);
    const got0 = plays('!bobtam roll ' + k + ' Risky Standard 0', tS), want0 = expand(btn, { name: 'Ayla', image: base.image, position: 'Risky', effect: 'Standard', dice: 0 });
    ok(got0 === want0, 'action ' + k + ' with zero dice matches the sheet', [got0, want0]);
  });
  // resist
  [['Insight', 'insight', ['research', 'scout', 'rig']], ['Prowess', 'prowess', ['wreck', 'skirmish', 'shoot', 'maneuver']], ['Resolve', 'resolve', ['consort', 'discipline', 'marshal', 'sway']]].forEach(([nm, key, acts]) => {
    const btn = sheetButton(nm); ok(!!btn, 'the sheet has a roll_' + nm + ' button'); if (!btn) { return; }
    acts.forEach(a => E.attr(soldier, a, 0));
    E.attr(soldier, 'setting_specialist_action', '-');
    acts.slice(0, 2).forEach(a => E.attr(soldier, a, 1));
    const got = plays('!bobtam resist ' + key + ' 1', tS), want = expand(btn, { name: 'Ayla', image: base.image, dice: 3 });
    ok(got === want, 'resist ' + key + ' matches the sheet\'s roll_' + nm + ' button', [got, want]);
  });
  // fortune
  const fb = sheetButton('Fortune');
  for (let d = 0; d <= 6; d++) {
    const got = plays('!bobtam fortune ' + d + ' --text', tS), want = expand(fb, { name: 'Ayla', image: base.image, dice: d });
    ok(got === want, 'fortune with ' + d + ' dice matches the sheet\'s roll_Fortune button', [got, want]);
  }
  const gotN = plays('!bobtam fortune 2 --text some notes', tS), wantN = expand(fb, { name: 'Ayla', image: base.image, dice: 2, notes: 'some notes' });
  ok(gotN === wantN, 'fortune with notes matches the sheet', [gotN, wantN]);
  // specialist
  ['Aim', 'Anchor', 'Channels', 'Doctor', 'Grit', 'Scrounge', 'Weave'].forEach(nm => {
    const k = nm.toLowerCase(), btn = sheetButton(nm); ok(!!btn, 'the sheet has a roll_' + nm + ' button'); if (!btn) { return; }
    E.attr(soldier, 'setting_specialist_action', k); E.attr(soldier, k, 2);
    const got = plays('!bobtam fortune spec --text', tS), want = expand(btn, { name: 'Ayla', image: base.image, dice: 2 });
    ok(got === want, 'specialist ' + k + ' matches the sheet\'s roll_' + nm + ' button', [got, want]);
  });
  // harm card
  E.attr(soldier, 'harm3', 'Broken Leg'); E.attr(soldier, 'harm2_1', 'Burns'); E.attr(soldier, 'harm1_2', 'Tired');
  E.run('!bobtam shareharm', pat, tS);
  const hb = sheetButton('Harm');
  const hwant = expand(hb, { name: 'Ayla', image: base.image, attrs: { harm3: 'Broken Leg', harm2_1: 'Burns', harm2_2: '', harm1_1: '', harm1_2: 'Tired' } });
  ok(norm(E.posted()[0]) === hwant, 'shared harm card matches the sheet\'s roll_Harm button', [norm(E.posted()[0]), hwant]);
  // ability card
  E.attr(soldier, 'repeating_ability_-Ab1_name', 'Battleborn'); E.attr(soldier, 'repeating_ability_-Ab1_description', 'You may expend your Specialist action.'); E.attr(soldier, 'repeating_ability_-Ab1_check', '1');
  E.run('!bobtam ability --c ' + soldier + ' --row -Ab1', pat);
  const sb = sheetButton('Show', 'special_ability');
  const swant = expand(sb, { name: 'Ayla', image: base.image, attrs: { name: 'Battleborn', description: 'You may expend your Specialist action.' } }).replace('^{special_ability}', '^{special_ability}');
  ok(norm(E.posted()[0]) === swant, 'ability card matches the sheet\'s Show button', [norm(E.posted()[0]), swant]);
  ok(n === 44, 'all 44 action combinations were compared', n);
} else { skip('sheet comparison needs blades.html'); }

// ---------------------------------------------------------------- stress: R1 resist cost button, R2 overflow
{
  const { E, gm, pat, quinn, soldier, spec, rookie, tS, tB, tC } = game();
  E.run('!bobtam setup', pat, tS);
  const resist = (key, who, tok) => { E.run('!bobtam resist ' + key + ' 0', who === undefined ? pat : who, tok === undefined ? tS : tok); return E.posted()[0]; };
  // the soldier has insight 1 (research 1)... give prowess 1 die, make a controlled test of the maths with explicit dice
  const roll = (card, vals, pid) => E.deliver(card, vals, pid === undefined ? pat : pid);
  let card = resist('prowess');  // 1 die
  let o = roll(card, [4]);
  let c = lastCard(o), btns = buttons(c);
  ok(has(o, /^\/w "GM" /) && has(o, /^\/w "Pat" /) && !has(o, /^\/w "Quinn" /), 'the stress offer goes to the GM and the player who controls the character', o.map(x => x.slice(0, 20)));
  ok(title(c) === 'Stress cost' && field(c, 'type') === 'Resist' && /Highest die: 4\. Resisting costs 6 minus 4 = 2 stress\./.test(field(c, 'content')), 'highest die 4: 6 minus 4 = 2 stress (book example)', field(c, 'content'));
  ok(btns.length === 1 && btns[0].label === 'Take 2 stress' && /^!bobtam stress 2 --c -id\d+ --idx [0-9a-z]+$/.test(btns[0].cmd), 'one button: Take 2 stress', btns);
  // a 6 costs nothing
  o = roll(resist('prowess'), [6]);
  ok(/Resisting costs 6 minus 6 = 0 stress\./.test(field(lastCard(o), 'content')) && /No stress to take/.test(field(lastCard(o), 'content')) && !buttons(lastCard(o)).length, 'a 6 costs zero stress (book example): no button');
  // 1 -> 5 stress
  o = roll(resist('prowess'), [1]); ok(buttons(lastCard(o))[0].label === 'Take 5 stress', 'a 1 costs 5 stress');
  // more dice: highest counts
  E.attr(soldier, 'wreck', 1); E.attr(soldier, 'shoot', 1); // prowess: skirmish, wreck, shoot = 3 dice
  o = roll(resist('prowess'), [2, 5, 3]); ok(buttons(lastCard(o))[0].label === 'Take 1 stress' && /Highest die: 5/.test(field(lastCard(o), 'content')), 'three dice: the highest die (5) counts');
  // critical
  o = roll(resist('prowess'), [6, 6, 2]);
  ok(/Critical: also clear 1 stress\./.test(field(lastCard(o), 'content')) && buttons(lastCard(o)).length === 1 && buttons(lastCard(o))[0].label === 'Clear 1 stress' && /stress -1 /.test(buttons(lastCard(o))[0].cmd), 'two sixes: critical, cost 0 and clear 1 stress');
  o = roll(resist('prowess'), [6, 4, 3]); ok(/No stress to take/.test(field(lastCard(o), 'content')) && !/Critical/.test(field(lastCard(o), 'content')), 'one six is not a critical');
  // zero dice: roll two, take the lowest, no critical
  E.attr(soldier, 'skirmish', 0); E.attr(soldier, 'wreck', 0); E.attr(soldier, 'shoot', 0);
  card = resist('prowess');
  ok(/zerodie1/.test(card), 'prowess 0 posts zero dice');
  o = roll(card, [5, 2]); ok(/Zero dice, lowest die: 2\. Resisting costs 6 minus 2 = 4 stress\./.test(field(lastCard(o), 'content')) && buttons(lastCard(o))[0].label === 'Take 4 stress', 'zero dice: the lowest die counts (book: roll two dice, take the lowest)', field(lastCard(o), 'content'));
  o = roll(resist('prowess'), [6, 6]); ok(!/Critical/.test(field(lastCard(o), 'content')) && /No stress to take/.test(field(lastCard(o), 'content')) && !buttons(lastCard(o)).length, 'zero dice: two sixes is NOT a critical (book: you cannot roll a critical with zero dice)', field(lastCard(o), 'content'));
  // applying the button: once only
  E.attr(soldier, 'skirmish', 1);
  o = roll(resist('prowess'), [3]);
  const cmd = buttons(lastCard(o))[0].cmd;
  const stressBefore = Number(E.get(soldier, 'stress') || 0);
  o = E.run(cmd, pat, tS);
  ok(E.get(soldier, 'stress') === String(stressBefore + 3) && /Stress 3 \/ 6/.test(field(lastCard(o), 'title')), 'the button adds 3 stress (6 minus 3)', E.get(soldier, 'stress'));
  o = E.run(cmd, gm, tS);
  ok(E.get(soldier, 'stress') === String(stressBefore + 3) && has(o, /Already applied/), 'a second click is refused (once only)', o);
  // a fresh offer cannot be redeemed for another character, or for another amount
  E.attr(soldier, 'stress', 0); E.attr(soldier, 'skirmish', 1);
  const fresh = buttons(lastCard(roll(resist('prowess'), [3])))[0].cmd;
  o = E.run(fresh.replace(/--c -id\d+/, '--c ' + spec), gm, tS);
  ok(has(o, /Already applied/) && E.get(spec, 'stress') === undefined && E.get(soldier, 'stress') === '0', 'a stress offer cannot be redeemed for another character', o);
  o = E.run(fresh.replace('stress 3', 'stress 1'), gm, tS);
  ok(has(o, /Already applied/) && E.get(soldier, 'stress') === '0', 'or for another amount', o);
  o = E.run(fresh, pat, tS); ok(E.get(soldier, 'stress') === '3', 'and the real button still works after those refusals', E.get(soldier, 'stress'));
  E.attr(soldier, 'stress', 0);
  // clear stress by a critical
  E.attr(soldier, 'stress', 3);
  E.attr(soldier, 'wreck', 1); E.attr(soldier, 'shoot', 1);
  o = roll(resist('prowess'), [6, 6, 1]);
  E.run(buttons(lastCard(o))[0].cmd, pat, tS);
  ok(E.get(soldier, 'stress') === '2', 'a critical clears 1 stress', E.get(soldier, 'stress'));
  // a roll that is not ours, or whose dice cannot be read, offers nothing
  E.attr(soldier, 'stress', 0);
  card = resist('prowess');
  o = E.deliver(card, [4], gm); ok(!bcards(o).length, 'a card from another player is not ours');
  E.run('!bobtam resist prowess 0', pat, tS); card = E.posted()[0];
  o = E.deliver(card, [4, 4], pat); ok(!bcards(o).length && E.logs.some(l => /could not read the dice/.test(l)), 'wrong number of dice: nothing offered, reason logged', E.logs);
  E.run('!bobtam resist prowess 0', pat, tS); card = E.posted()[0];
  E.advance(61000);
  o = E.deliver(card, [4, 4, 4], pat); ok(!bcards(o).length, 'a watch older than a minute is dropped');
  // a card for another character with the same player is not mixed up
  E.run('!bobtam resist prowess 0', gm, tB); const cardB = E.posted()[0];
  o = E.deliver(cardB, [2, 1], gm);
  ok(has(o, /Highest die: 2/) && /charname=Bo/.test(lastCard(o)), 'two characters at once: each card is matched by name', o);
  // free boxes warning
  E.attr(soldier, 'stress', 5); E.attr(soldier, 'skirmish', 1);
  o = roll(resist('prowess'), [2, 1, 1]);
  ok(/Only 1 stress box is free, so taking this causes trauma\./.test(field(lastCard(o), 'content')), 'warns when the cost does not fit', field(lastCard(o), 'content'));
}

{
  // R2 overflow, trauma boxes, death (book: Stress and Trauma)
  const { E, gm, pat, quinn, soldier, spec, rookie, tS, tB, tC } = game();
  E.run('!bobtam setup', pat, tS); E.run('!bobtam setup', gm, tB);
  const S = (n, who, tok, cid) => E.run('!bobtam adj stress' + (n > 0 ? '+' : '') + n, who === undefined ? pat : who, tok === undefined ? tS : tok);
  S(1); ok(E.get(soldier, 'stress') === '1', 'stress +1');
  S(2); ok(E.get(soldier, 'stress') === '3', 'stress +2 (push yourself)');
  S(3); ok(E.get(soldier, 'stress') === '6' && !E.get(soldier, 'trauma') , 'marking the last box (6 of 6) is NOT trauma: trauma needs stress that cannot be marked', [E.get(soldier, 'stress'), E.get(soldier, 'trauma')]);
  let o = S(1);
  ok(E.get(soldier, 'stress') === '0' && E.get(soldier, 'trauma') === '1', 'one stress more than the track holds: trauma +1 and, by the table\'s ruling, stress back to 0', [E.get(soldier, 'stress'), E.get(soldier, 'trauma')]);
  let c = lastCard(o), b = buttons(c);
  ok(/No stress box was free, so the character suffers trauma and is taken out of action\. Stress goes back to 0\./.test(field(c, 'content')) && b.length === 8 && b.map(x => x.label).join() === 'Cold,Haunted,Obsessed,Paranoid,Reckless,Soft,Unstable,Vicious', 'trauma card: the 8 sheet conditions as buttons', b.map(x => x.label));
  ok(/Trauma ●○ 1\/2/.test(field(c, 'content')), 'trauma card shows 1 of 2 boxes (Soldier)', field(c, 'content'));
  E.run(b[4].cmd, pat, tS);
  ok(E.get(soldier, 'trauma_reckless') === '1' && E.get(soldier, 'trauma') === '1', 'a condition button ticks the sheet checkbox and keeps trauma at 1');
  // big overflow from a half-full track
  E.attr(soldier, 'stress', 4); o = S(3);
  ok(E.get(soldier, 'stress') === '0' && E.get(soldier, 'trauma') === '2', 'overflow of several points is still one level of trauma', [E.get(soldier, 'stress'), E.get(soldier, 'trauma')]);
  ok(/This is the last trauma box: the character dies/.test(field(lastCard(o), 'content')), 'second trauma on a 2-box Soldier: death notice (book: marking the last trauma box means you die)');
  // never past the last box
  E.attr(soldier, 'stress', 6); S(1);
  ok(E.get(soldier, 'trauma') === '2', 'trauma never goes past its last box');
  // clear stress
  E.attr(soldier, 'stress', 2); S(-1); ok(E.get(soldier, 'stress') === '1', 'stress -1');
  S(-3); ok(E.get(soldier, 'stress') === '0', 'stress never below 0');
  E.attr(soldier, 'stress', 5); E.run('!bobtam adj stress0', pat, tS); ok(E.get(soldier, 'stress') === '0', 'clear all stress');
  // boxes: Hardened and Survivor, Rookie
  E.attr(spec, 'stress', 8); o = E.run('!bobtam adj stress+1', quinn, tB);
  ok(E.get(spec, 'trauma') === '1' && E.get(spec, 'stress') === '0', 'Hardened once (8 boxes): 8 of 8 then +1 is trauma');
  E.attr(spec, 'setting_extra_stress', 2); E.attr(spec, 'stress', 7); E.run('!bobtam adj stress+1', quinn, tB);
  ok(E.get(spec, 'stress') === '8' && E.get(spec, 'trauma') === '1', 'Hardened once: 8th box can still be marked');
  E.attr(spec, 'setting_extra_stress', 4); E.attr(spec, 'stress', 9); E.run('!bobtam adj stress+1', quinn, tB);
  ok(E.get(spec, 'stress') === '10', 'Hardened twice: ten boxes (the book\'s maximum)');
  E.run('!bobtam adj stress+1', quinn, tB);
  ok(E.get(spec, 'stress') === '0' && E.get(spec, 'trauma') === '2', 'the 11th point is trauma');
  E.attr(spec, 'setting_extra_stress', 5); E.attr(spec, 'trauma', 0); E.attr(spec, 'stress', 9); E.run('!bobtam adj stress+1', quinn, tB);
  ok(E.get(spec, 'stress') === '10' && E.get(spec, 'trauma') === '0', 'extra stress of 5 still means 10 boxes at most: the 10th can be marked');
  E.run('!bobtam adj stress+1', quinn, tB);
  ok(E.get(spec, 'trauma') === '1' && E.get(spec, 'stress') === '0', 'and the 11th point is trauma');
  // Rookie: one trauma box, any trauma kills
  E.run('!bobtam adj stress+3', pat, tC); E.run('!bobtam adj stress+3', pat, tC);
  o = E.run('!bobtam adj stress+1', pat, tC);
  ok(E.get(rookie, 'trauma') === '1' && /last trauma box/.test(field(lastCard(o), 'content')) && /Trauma ● 1\/1/.test(field(lastCard(o), 'content')), 'Rookie has one trauma box: the first trauma is the last', field(lastCard(o), 'content'));
  // Survivor: 3 and 4 trauma boxes
  E.attr(soldier, 'setting_extra_trauma', 1); E.attr(soldier, 'trauma', 2); E.attr(soldier, 'stress', 6); o = S(1);
  ok(E.get(soldier, 'trauma') === '3' && /Trauma ●●●○ 3\/4|Trauma ●●● 3\/3/.test(field(lastCard(o), 'content')), 'Survivor once: 3 trauma boxes', field(lastCard(o), 'content'));
  // tclear and trauma -1
  E.attr(soldier, 'trauma_reckless', '0'); E.attr(soldier, 'trauma_cold', '1'); E.attr(soldier, 'trauma_soft', '1'); E.attr(soldier, 'trauma', 2);
  o = E.run('!bobtam adj trauma-1', pat, tS);
  ok(buttons(lastCard(o)).map(x => x.label).join() === 'Cold,Soft', 'Trauma -1 offers the ticked conditions to clear', buttons(lastCard(o)));
  E.run(buttons(lastCard(o))[0].cmd, pat, tS);
  ok(E.get(soldier, 'trauma_cold') === '0' && E.get(soldier, 'trauma') === '1', 'clearing a condition lowers trauma');
  E.run('!bobtam tcond nonsense --c ' + soldier, pat); ok(E.get(soldier, 'trauma_nonsense') === undefined, 'a made-up condition is refused');
  o = E.run('!bobtam tclear haunted --c ' + soldier, pat); ok(has(o, /not marked/), 'clearing a condition that is not marked is refused');
  // switch variant: stress stays full when STRESS_RESETS_ON_TRAUMA is false
  const V = game(SRC.replace('var STRESS_RESETS_ON_TRAUMA = true;', 'var STRESS_RESETS_ON_TRAUMA = false;'));
  V.E.attr(V.soldier, 'stress', 6); V.E.run('!bobtam adj stress+1', V.pat, V.tS);
  ok(V.E.get(V.soldier, 'stress') === '6' && V.E.get(V.soldier, 'trauma') === '1', 'switch STRESS_RESETS_ON_TRAUMA = false leaves the track full');
}

// ---------------------------------------------------------------- automatic trauma from a bar edit
{
  const { E, gm, pat, quinn, soldier, spec, rookie, tS, tB, tC } = game();
  E.run('!bobtam setup', pat, tS);
  E.attr(soldier, 'stress', 7); // a bar typed past the last box
  const obj = E.attrObj(soldier, 'stress');
  E.fire('change:attribute:current', obj);
  ok(E.get(soldier, 'stress') === '0' && E.get(soldier, 'trauma') === '1', 'stress above the last box (typed on the bar): trauma +1, stress 0', [E.get(soldier, 'stress'), E.get(soldier, 'trauma')]);
  const w = E.whispers();
  ok(w.some(x => /^\/w "GM" /.test(x)) && w.some(x => /^\/w "Pat" /.test(x)) && !w.some(x => /^\/w "Quinn" /.test(x)) && has(w, /Stress went past the last box/), 'whispered to the GM and the controller, not to other players', w.map(x => x.slice(0, 14)));
  E.fire('change:attribute:current', E.attrObj(soldier, 'stress'));
  ok(E.get(soldier, 'trauma') === '1', 'the reset to 0 does not trigger again');
  E.attr(soldier, 'stress', 6); E.fire('change:attribute:current', E.attrObj(soldier, 'stress'));
  ok(E.get(soldier, 'trauma') === '1' && E.get(soldier, 'stress') === '6', 'reaching the last box (6 of 6) is not trauma');
  E.attr(soldier, 'stress', 9); E.attr(soldier, 'setting_extra_stress', 4); E.fire('change:attribute:current', E.attrObj(soldier, 'stress'));
  ok(E.get(soldier, 'trauma') === '1', '9 of 10 boxes is not trauma');
  E.attr(soldier, 'sheet_type', 'chosen'); E.attr(soldier, 'stress', 99); E.fire('change:attribute:current', E.attrObj(soldier, 'stress'));
  ok(E.get(soldier, 'stress') === '99', 'other sheet types are ignored');
  E.attr(soldier, 'sheet_type', 'character');
  E.attr(soldier, 'harm3', 'x'); E.fire('change:attribute:current', E.attrObj(soldier, 'harm3'));
  ok(E.get(soldier, 'trauma') === '1', 'other attributes are ignored');
  // an API write does not run the handlers (Roll20 sends no event for it): the mock mirrors that, so nothing loops
  const before = E.out.length;
  E.attr(rookie, 'stress', 0); E.run('!bobtam adj stress+3', pat, tC);
  ok(E.get(rookie, 'trauma') === undefined, 'a command that fits the track writes no trauma');
  // the bar must show the attribute after the reset
  E.attr(soldier, 'setting_extra_stress', 0); E.attr(soldier, 'stress', 7); E.tok(tS).bar1_value = '7';
  E.fire('change:attribute:current', E.attrObj(soldier, 'stress'));
  E.tok(tS).bar1_value = '7'; // the bar's own save arrives again after the reset
  E.fire('change:graphic:bar1_value', { id: tS });
  E.flush();
  ok(E.tok(tS).bar1_value === '0', 'a stale bar left at 7 is corrected to the attribute (0)', E.tok(tS).bar1_value);
  // a matching edit is left alone and bars linked elsewhere are untouched
  E.attr(soldier, 'stress', 3); E.tok(tS).bar1_value = '3'; const v = E.tok(tS).bar1_value;
  E.fire('change:graphic:bar1_value', { id: tS }); E.flush();
  ok(E.tok(tS).bar1_value === v, 'a bar that already matches is left alone');
  E.fire('change:graphic:bar1_value', { id: 'nosuchtoken' }); E.flush(); ok(true, 'unknown token id does not crash');
  // the heal on its own: no script write is pending, the bar is simply stale
  E.flush(); E.attr(soldier, 'stress', 3); E.tok(tS).bar1_value = '9';
  E.fire('change:graphic:bar1_value', { id: tS });
  ok(E.tok(tS).bar1_value === '9', 'the heal waits two seconds (a timer), it does not act at once');
  E.flush(); ok(E.tok(tS).bar1_value === '3', 'a stale bar edit is put right by the delayed heal alone', E.tok(tS).bar1_value);
  E.tok(tS).bar1_link = 'nosuchattr'; E.tok(tS).bar1_value = '8'; E.fire('change:graphic:bar1_value', { id: tS }); E.flush();
  ok(E.tok(tS).bar1_value === '8', 'a bar linked to something that is not the stress attribute is left alone');
  // typing in a stress bar with a player's bar edit while another script wrote stress: still the same rule
  const V = makeEnv([SRC.replace('var AUTO_TRAUMA = true;', 'var AUTO_TRAUMA = false;')]); V.player('GM', true); V.ready();
  const vc = V.char('V'); V.attr(vc, 'stress', 9); V.fire('change:attribute:current', V.attrObj(vc, 'stress'));
  ok(V.get(vc, 'stress') === '9', 'switch AUTO_TRAUMA = false turns the bar rule off');
}

// ---------------------------------------------------------------- corruption (R4) and blight (R5)
{
  const { E, gm, pat, quinn, soldier, spec, tS, tB } = game();
  const C = (code, who, tok) => E.run('!bobtam adj ' + code, who === undefined ? pat : who, tok === undefined ? tS : tok);
  let o = C('corr+1');
  ok(E.get(soldier, 'corruption') === '1' && /Corruption 1 \/ 6/.test(field(lastCard(o), 'title')) || /Corruption 1 \/ 6/.test(lastCard(o)), 'corruption +1', lastCard(o));
  C('corr+2'); ok(E.get(soldier, 'corruption') === '3', 'corruption +2');
  C('corr+3'); ok(E.get(soldier, 'corruption') === '6' && !E.get(soldier, 'blight'), 'corruption 6 of 6 does not give blight yet');
  o = C('corr+1');
  ok(E.get(soldier, 'corruption') === '0' && E.get(soldier, 'blight') === '1', 'the seventh point: corruption resets to 0 and the character gains a blight (book)', [E.get(soldier, 'corruption'), E.get(soldier, 'blight')]);
  let c = lastCard(o), b = buttons(c);
  ok(/That was the seventh point of corruption\. Corruption resets to 0 and the character gains a blight and a blight condition\./.test(field(c, 'content')) && b.map(x => x.label).join() === 'Anathema,Host,Hunger,Miasma,Mutation,Rage,Rot,Visions' && /Blight ●○○○ 1\/4/.test(field(c, 'content')), 'blight card: 8 conditions as buttons, 1 of 4', [field(c, 'content'), b.map(x => x.label)]);
  E.run(b[7].cmd, pat, tS);
  ok(E.get(soldier, 'blight_visions') === '1' && E.get(soldier, 'blight') === '1', 'a blight condition button ticks the sheet checkbox');
  // leftover points count from 0
  E.attr(soldier, 'corruption', 5); C('corr+3');
  ok(E.get(soldier, 'corruption') === '1' && E.get(soldier, 'blight') === '2', '5 + 3: sixth point, seventh resets (blight +1), one point left', [E.get(soldier, 'corruption'), E.get(soldier, 'blight')]);
  E.attr(soldier, 'corruption', 4); C('corr+3');
  ok(E.get(soldier, 'corruption') === '0' && E.get(soldier, 'blight') === '3', '4 + 3 ends exactly on the reset', [E.get(soldier, 'corruption'), E.get(soldier, 'blight')]);
  // the fourth blight box
  E.attr(soldier, 'corruption', 6); o = C('corr+1');
  ok(E.get(soldier, 'blight') === '4' && /fourth blight box: the character is completely corrupted and no longer playable/.test(field(lastCard(o), 'content')), 'the fourth blight box: completely corrupted notice (book)', field(lastCard(o), 'content'));
  E.attr(soldier, 'corruption', 6); C('corr+1'); ok(E.get(soldier, 'blight') === '4', 'blight never goes past 4');
  // down
  E.attr(soldier, 'corruption', 1); C('corr-1'); ok(E.get(soldier, 'corruption') === '0', 'corruption -1');
  o = C('corr-1'); ok(E.get(soldier, 'corruption') === '0' && /Already at the minimum/.test(lastCard(o)), 'corruption never below 0');
  // blight by hand and down
  E.attr(spec, 'blight', 0); o = E.run('!bobtam adj blight+1', quinn, tB);
  ok(E.get(spec, 'blight') === '1' && buttons(lastCard(o)).length === 8, 'take blight by hand: card with 8 conditions');
  E.attr(spec, 'blight_rot', '1'); o = E.run('!bobtam adj blight-1', quinn, tB);
  ok(buttons(lastCard(o)).map(x => x.label).join() === 'Rot', 'blight -1 offers the ticked conditions');
  E.run(buttons(lastCard(o))[0].cmd, quinn, tB); ok(E.get(spec, 'blight_rot') === '0' && E.get(spec, 'blight') === '0', 'clearing a blight condition lowers blight');
  ok(has(E.run('!bobtam bcond mutated --c ' + spec, quinn), /not a blight condition/), 'the book name Mutated is not the sheet attribute: refused');
}

// ---------------------------------------------------------------- harm (R6)
{
  const { E, gm, pat, quinn, soldier, spec, tS, tB } = game();
  const H = (lv, txt, who, tok) => E.run('!bobtam harm --level ' + lv + ' --text ' + txt, who === undefined ? pat : who, tok === undefined ? tS : tok);
  let o = H(3, 'Broken Leg');
  ok(E.get(soldier, 'harm3') === 'Broken Leg' && /Level 3/.test(title(bcards(o)[0])), 'level 3 goes to harm3');
  ok(bcards(o).length === 2 && /\{\{harm=1\}\}/.test(bcards(o)[1]) && /\{\{harm3=Broken Leg\}\}/.test(bcards(o)[1]), 'a harm card follows');
  o = H(3, 'Impaled');
  ok(E.get(soldier, 'harm3') === 'Broken Leg' && !E.get(soldier, 'harm2_1') && /Level 4: fatal harm/.test(title(lastCard(o))) && /Nothing was written/.test(field(lastCard(o), 'content')), 'level 3 full: level 4, fatal notice, nothing written (book: out of space on the top row)', lastCard(o));
  H(2, 'Burns'); H(2, 'Bleeding');
  ok(E.get(soldier, 'harm2_1') === 'Burns' && E.get(soldier, 'harm2_2') === 'Bleeding', 'level 2 fills harm2_1 then harm2_2');
  o = H(2, 'Exhausted');
  ok(/Level 4/.test(title(lastCard(o))) && E.get(soldier, 'harm2_1') === 'Burns', 'level 2 full and level 3 full: level 4');
  E.attr(soldier, 'harm3', '');
  o = H(2, 'Exhausted');
  ok(E.get(soldier, 'harm3') === 'Exhausted' && /level 2 was full, so it moved up to level 3/.test(clean2(bcards(o)[0])), 'level 2 full: the harm moves up to level 3 (book)', bcards(o)[0]);
  H(1, 'Tired'); H(1, 'Winded');
  ok(E.get(soldier, 'harm1_1') === 'Tired' && E.get(soldier, 'harm1_2') === 'Winded', 'level 1 has two slots');
  E.attr(soldier, 'harm2_2', '');
  o = H(1, 'Scared'); ok(E.get(soldier, 'harm2_2') === 'Scared' && /moved up to level 2/.test(bcards(o)[0]), 'level 1 full: moves up to level 2', bcards(o)[0]);
  o = H(4, 'Decapitated'); ok(/Level 4: fatal harm/.test(title(lastCard(o))) && !E.get(soldier, 'harm4'), 'level 4 asked for directly: fatal notice, no harm4 attribute exists on this sheet');
  ok(has(H(5, 'x'), /harm level must be 1 to 4/) && has(H('abc', 'x'), /harm level must be 1 to 4/) && has(H(2, ''), /describe the harm/), 'bad level or empty text refused');
  // sanitising
  const f = E.char('Fresh', pat), tf = E.token(f, 'f');
  E.run('!bobtam harm --level 1 --text Evil [Click](!bobtam setup) {{title=x}} "q" a|b --c --level', pat, tf);
  const stored = E.get(f, 'harm1_1');
  ok(stored && !/[\[\]()"|]/.test(stored) && stored.indexOf('--c') < 0, 'harm text is stripped of brackets, parentheses, quotes, pipes and option markers', stored);
  // menu and clear
  o = E.run('!bobtam harmmenu', pat, tS);
  const mb = buttons(lastCard(o));
  ok(mb.some(b => /^Clear L3: Exhausted$/.test(b.label)) && mb.some(b => b.label === 'Share harm with the table') && mb.filter(b => /^Clear/.test(b.label)).length === 5, 'harm menu: a Clear button per filled slot plus Share', mb.map(b => b.label));
  E.run(mb.find(b => /Clear L3/.test(b.label)).cmd, pat, tS);
  ok(E.get(soldier, 'harm3') === '', 'Clear empties the slot');
  ok(has(E.run('!bobtam harmclear --c ' + soldier + ' --row harm3', pat), /already cleared/), 'clearing twice is refused');
  ok(has(E.run('!bobtam harmclear --c ' + soldier + ' --row harm4', pat), /unknown harm slot/) && has(E.run('!bobtam harmclear --c ' + soldier + ' --row notes', pat), /unknown harm slot/), 'only the five harm slots can be cleared (no harm4, no other attribute)');
  E.attr(soldier, 'harm3_check', 2);
  E.run('!bobtam harmclear --c ' + soldier + ' --row harm2_1', pat); ok(E.get(soldier, 'harm3_check') === '2', 'healing ticks (harm*_check) are never touched');
  // permissions
  ok(has(H(1, 'x', pat, tB), /only use this on characters you control/) && !E.get(spec, 'harm1_1'), 'a player cannot add harm to another player\'s character');
  H(1, 'GM wrote this', gm, tB); ok(E.get(spec, 'harm1_1') === 'GM wrote this', 'the GM can');
  E.run('!bobtam shareharm', pat, tS); ok(E.posted().length === 1 && /template:blades-broadcast/.test(E.posted()[0]), 'share harm posts publicly as the player');
  function clean2(s) { return String(s); }
}

// ---------------------------------------------------------------- abilities menu
{
  const { E, gm, pat, quinn, soldier, spec, tS, tB } = game();
  const ab = (row, name, desc, on) => { E.attr(soldier, 'repeating_ability_' + row + '_name', name); E.attr(soldier, 'repeating_ability_' + row + '_description', desc); E.attr(soldier, 'repeating_ability_' + row + '_check', on ? '1' : '0'); };
  ab('-A1', 'Battleborn', 'You may expend your Specialist action to push yourself.', true);
  ab('-A2', 'Bodyguard', 'Protect.', false);
  ab('-A3', 'Hardened', 'Two more stress boxes.', true);
  ab('-A4', '', 'no name', true);
  E.attr(soldier, '_reporder_repeating_ability', '-A3,-A1,-A2');
  let o = E.run('!bobtam abilities', pat, tS);
  const b = buttons(lastCard(o));
  ok(b.map(x => x.label).join() === 'Hardened,Battleborn', 'only ticked abilities with a name, in sheet order', b.map(x => x.label));
  ok(title(lastCard(o)) === 'Show to the table' && field(lastCard(o), 'type') === '^{special_ability}', 'menu card');
  E.run(b[1].cmd, pat, tS);
  ok(E.posted().length === 1 && E.posted()[0] === '&{template:blades-broadcast} {{charname=Ayla}} {{type=^{special_ability}}} {{title=Battleborn}} {{content=You may expend your Specialist action to push yourself.}} {{charimage=https://x.test/a/thumb.png}}', 'a button posts the sheet\'s Show card, publicly as the player', E.posted());
  o = E.run('!bobtam abilities', pat, tB);
  ok(has(o, /only use this on characters you control/), 'a player cannot list another character\'s abilities');
  o = E.run('!bobtam abilities', gm, tB);
  ok(/No special abilities are ticked/.test(field(lastCard(o), 'content')) && !buttons(lastCard(o)).length, 'no ticked abilities: says so');
  ab('-A5', 'Evil [Click](!bobtam setup) {{title=x}} a|b', 'Desc }} {{title=x}} with | pipes\nand a newline', true);
  o = E.run('!bobtam abilities', pat, tS);
  ok(!/\{\{title=x\}\}/.test(lastCard(o)) && buttons(lastCard(o)).every(x => !/[\[\]()]/.test(x.label)), 'hostile ability names cannot inject fields or buttons');
  E.run('!bobtam ability --c ' + soldier + ' --row -A5', pat, tS);
  ok(E.posted().length === 1 && (E.posted()[0].match(/\{\{title=/g) || []).length === 1 && !/\n/.test(E.posted()[0]) && (E.posted()[0].match(/\{\{content=/g) || []).length === 1, 'hostile description is cleaned: one title, one content, one line', E.posted()[0]);
  ok(has(E.run('!bobtam ability --c ' + soldier + ' --row -Zzz', pat), /no longer on the sheet/) && has(E.run('!bobtam ability --c ' + soldier + ' --row a/b', pat), /unknown ability/), 'unknown or malformed row ids are refused');
  ab('-A6', 'Quiet', '', true);
  E.run('!bobtam ability --c ' + soldier + ' --row -A6', pat); ok(/No description on the sheet\./.test(E.posted()[0]), 'an ability without a description still shows its name');
  ok(has(E.run('!bobtam ability --c ' + spec + ' --row -A1', pat), /only use this on characters you control/), 'a player cannot show another character\'s ability');
}

// ---------------------------------------------------------------- adjust: armor, specialist uses, xp, errors
{
  const { E, gm, pat, quinn, soldier, spec, rookie, tS, tB, tC } = game();
  const A = (code, who, tok) => E.run('!bobtam adj ' + code, who === undefined ? pat : who, tok === undefined ? tS : tok);
  [['armor', 'armor'], ['heavy', 'armor_heavy'], ['shield', 'shield'], ['special', 'special']].forEach(([code, attr]) => {
    let o = A(code); ok(E.get(soldier, attr) === '1' && /: used/.test(title(lastCard(o))), code + ' toggles ' + attr + ' to used', title(lastCard(o)));
    o = A(code); ok(E.get(soldier, attr) === '0' && /: free/.test(title(lastCard(o))), code + ' toggles back to free');
  });
  ['armor', 'armor_heavy', 'shield', 'special'].forEach(a => E.attr(soldier, a, 1));
  A('armor-restore'); ok(['armor', 'armor_heavy', 'shield', 'special'].every(a => E.get(soldier, a) === '0'), 'restore all clears the four armor boxes');
  // xp: insight, prowess, resolve, specialist 6; playbook 8
  [['insight', 'insight_xp', 6], ['prowess', 'prowess_xp', 6], ['resolve', 'resolve_xp', 6], ['specialist', 'specialist_xp', 6], ['playbook', 'playbook_xp', 8]].forEach(([k, attr, max]) => {
    for (let i = 0; i < max + 2; i++) { A('xp-' + k); }
    ok(E.get(soldier, attr) === String(max), 'xp ' + k + ' stops at ' + max, E.get(soldier, attr));
  });
  let o = A('xp-specialist', pat, tC); ok(has(o, /has no specialist action set/), 'a Rookie has no specialist xp track');
  ok(has(A('xp-nonsense'), /unknown xp track/), 'unknown xp track refused');
  // specialist uses: marked circles are uses spent, up to the rank
  E.attr(soldier, 'grit_uses', 0);
  o = A('spec+1'); ok(E.get(soldier, 'grit_uses') === '1' && /1 of 2 uses marked/.test(lastCard(o)), 'spend a use');
  A('spec+1'); o = A('spec+1');
  ok(E.get(soldier, 'grit_uses') === '2' && /No uses left/.test(title(lastCard(o))), 'no more uses than the rank');
  A('spec0'); ok(E.get(soldier, 'grit_uses') === '0', 'restore all uses');
  ok(has(A('spec+1', pat, tC), /has no specialist action set/) && has(A('spec0', pat, tC), /has no specialist action set/), 'a Rookie cannot spend uses');
  E.attr(spec, 'aim', 0); o = A('spec+1', quinn, tB); ok(/No uses left/.test(title(lastCard(o))), 'rank 0 means no uses');
  ok(has(A('frobnicate'), /unknown adjustment/), 'unknown code refused');
  ok(has(A('armor', pat, tB), /only use this on characters you control/) && E.get(spec, 'armor') === undefined, 'a player cannot adjust another character');
  A('armor', gm, tB); ok(E.get(spec, 'armor') === '1', 'the GM can');
  ok(has(E.run('!bobtam adj', pat, tS), /unknown adjustment/), 'adj with no code is refused');
}

// ---------------------------------------------------------------- status card
{
  const { E, gm, pat, quinn, soldier, spec, rookie, tS, tB, tC } = game();
  E.attr(soldier, 'stress', 2); E.attr(soldier, 'trauma', 1); E.attr(soldier, 'trauma_haunted', '1'); E.attr(soldier, 'corruption', 3); E.attr(soldier, 'blight', 1); E.attr(soldier, 'blight_rot', '1');
  E.attr(soldier, 'armor', '1'); E.attr(soldier, 'grit_uses', 1); E.attr(soldier, 'insight_xp', 2); E.attr(soldier, 'playbook_xp', 5); E.attr(soldier, 'harm3', 'Broken Leg');
  let o = E.run('!bobtam status', pat, tS);
  const c = bcards(o)[0], L = linesOf(c);
  ok(L[0].indexOf('Stress ●●○○○○ 2/6') === 0, 'stress line', L[0]);
  ok(L[1] === 'Trauma ●○ 1/2 (Haunted)', 'trauma line with the condition', L[1]);
  ok(L[2].indexOf('Corruption ●●●○○○ 3/6') === 0 && L[3] === 'Blight ●○○○ 1/4 (Rot)', 'corruption and blight lines', [L[2], L[3]]);
  ok(/Armor ☑ used/.test(L[4]) && /Heavy armor ☐ free/.test(L[4]) && /Shield ☐ free/.test(L[4]) && /Special armor ☐ free/.test(L[4]), 'armor line shows all four boxes', L[4]);
  ok(/^Specialist action: Grit rank 2, 1 of 2 uses marked/.test(L[5]), 'specialist line', L[5]);
  ok(L[6] === 'XP: Insight 2/6, Prowess 0/6, Resolve 0/6, Specialist 0/6, Playbook 5/8', 'xp line', L[6]);
  ok(bcards(o).length === 2 && /\{\{harm3=Broken Leg\}\}/.test(bcards(o)[1]), 'harm card follows the status card');
  ok(title(c) === 'Status' && field(c, 'charname') === 'Ayla', 'title and name');
  o = E.run('!bobtam status', pat, tC); // controlled by all
  const L2 = linesOf(bcards(o)[0]);
  ok(!L2.some(l => /^Specialist action/.test(l)) && /Trauma ○ 0\/1/.test(L2[1]) && !/Specialist/.test(L2.find(l => /^XP:/.test(l))), 'a Rookie: one trauma box, no specialist line, no specialist xp');
  E.attr(spec, 'setting_extra_stress', 2);
  o = E.run('!bobtam status', gm, tB); ok(/ 0\/8 /.test(linesOf(bcards(o)[0])[0]), 'Hardened shows 8 stress boxes');
  ok(has(E.run('!bobtam status', pat, tB), /only use this on characters you control/), 'a player cannot read another character\'s status');
  // every status button runs
  o = E.run('!bobtam status', pat, tS);
  const bad = [];
  buttons(bcards(o)[0]).forEach(b => { const r = E.run(b.cmd, pat); if (has(r, /something went wrong|unknown/)) { bad.push(b.cmd); } });
  ok(!bad.length && buttons(bcards(o)[0]).length >= 15, 'every button on the status card works', bad);
}

// ---------------------------------------------------------------- load
{
  const { E, gm, pat, quinn, soldier, spec, tS, tB } = game();
  const set = (cid, id, name, extra) => { E.attr(cid, id + '_show', '1'); E.attr(cid, id + '_name', name); Object.keys(extra || {}).forEach(k => E.attr(cid, id + '_' + k, extra[k])); };
  set(soldier, 'item_light_si_0', 'Knife'); set(soldier, 'item_light_si_fine_0', 'Rifle');
  set(soldier, 'item_light_si_1box_0', 'Rations', { check: '0' });
  set(soldier, 'item_light_si_3uses_0', 'Black Shot', { uses: '1' });
  set(soldier, 'item_light_do_fine_0', 'Bow', { name2: 'Crossbow', check: '0' });
  set(soldier, 'item_normal_si_0', 'Shield'); set(soldier, 'item_heavy_si_0', 'Pavise');
  set(soldier, 'item_normal_si_desc_0', 'Tent', { extra: 'for two' });
  E.attr(soldier, 'item_light_si_1_show', '0'); E.attr(soldier, 'item_light_si_1_name', 'Hidden');
  E.attr(soldier, 'item_light_si_2_show', '1'); // shown but no name: skipped
  let o = E.run('!bobtam load', pat, tS);
  let c = bcards(o)[0], L = linesOf(c);
  ok(/^Load: \[Light\]\(!bobtam loadstyle light --c -id\d+\) \[Normal\]\(!bobtam loadstyle normal --c -id\d+\) \[Heavy\]\(!bobtam loadstyle heavy --c -id\d+\)$/.test(L[0]) && /No load chosen/.test(L[1]), 'no load chosen: three tier buttons and a hint', L.slice(0, 2));
  E.attr(soldier, 'armor', '1'); E.attr(soldier, 'armor_heavy', '1'); E.attr(soldier, 'shield', '1'); E.attr(soldier, 'special', '1');
  o = E.run('!bobtam loadstyle light --c ' + soldier, pat);
  ok(E.get(soldier, 'load') === 'light' && ['armor', 'armor_heavy', 'shield', 'special'].every(a => E.get(soldier, a) === '0'), 'choosing a load sets it and restores all four armor boxes (book: armor is restored when you choose your load)', ['armor', 'armor_heavy', 'shield', 'special'].map(a => E.get(soldier, a)));
  ok(has(o, /Armor restored: all four armor boxes are marked free/), 'says so', o.map(x => x.slice(0, 60)));
  c = lastCard(o); L = linesOf(c);
  ok(/Light: Rifle \(fine\)  .*Knife|Light: .*Knife/.test(L.find(l => /^Light:/.test(l))) && !L.some(l => /^Normal:/.test(l)) && !L.some(l => /^Heavy:/.test(l)), 'Light shows only the light tier', L);
  const light = L.find(l => /^Light:/.test(l));
  ok(light.indexOf('Rifle (fine)') >= 0 && light.indexOf('Knife') >= 0 && light.indexOf('Hidden') < 0 && /\[☐ Rations\]\(!bobtam loaditem --c -id\d+ --sec fixed --row item_light_si_1box_0\)/.test(light) && /\[Black Shot 1\/3\]/.test(light) && /\[○ Bow\]\(.* --idx 1\) or \[○ Crossbow\]\(.* --idx 2\)/.test(light), 'item rendering: plain names, fine marker, box, uses, either-or pair; hidden and unnamed items are left out', light);
  o = E.run('!bobtam loadstyle normal --c ' + soldier, pat); L = linesOf(lastCard(o));
  ok(L.some(l => /^Light:/.test(l)) && L.some(l => /^Normal: Shield  Tent - for two/.test(l)) && !L.some(l => /^Heavy:/.test(l)), 'Normal shows light and normal (each tier includes the one before)', L);
  o = E.run('!bobtam loadstyle heavy --c ' + soldier, pat); L = linesOf(lastCard(o));
  ok(L.some(l => /^Heavy: Pavise/.test(l)), 'Heavy shows all three tiers');
  // toggles
  const lb = () => buttons(lastCard(E.run('!bobtam load', pat, tS)));
  let bt = lb().find(b => /Rations/.test(b.label)); E.run(bt.cmd, pat, tS);
  ok(E.get(soldier, 'item_light_si_1box_0_check') === '1' && /☑ Rations/.test(lb().find(b => /Rations/.test(b.label)).label), 'box item toggles on and shows checked');
  E.run(lb().find(b => /Rations/.test(b.label)).cmd, pat, tS); ok(E.get(soldier, 'item_light_si_1box_0_check') === '0', 'and off');
  bt = lb().find(b => /Black Shot/.test(b.label)); E.run(bt.cmd, pat, tS);
  ok(E.get(soldier, 'item_light_si_3uses_0_uses') === '2', 'a use circle is marked');
  E.run(bt.cmd, pat, tS); E.run(bt.cmd, pat, tS); ok(E.get(soldier, 'item_light_si_3uses_0_uses') === '0', 'uses cycle back to 0 after the last circle', E.get(soldier, 'item_light_si_3uses_0_uses'));
  let pr = lb().filter(b => /Bow|Crossbow/.test(b.label));
  E.run(pr[0].cmd, pat, tS); ok(E.get(soldier, 'item_light_do_fine_0_check') === '1', 'either-or: first choice');
  pr = lb().filter(b => /Bow|Crossbow/.test(b.label)); ok(/● Bow/.test(pr[0].label) && /○ Crossbow/.test(pr[1].label), 'the chosen one is marked');
  E.run(pr[1].cmd, pat, tS); ok(E.get(soldier, 'item_light_do_fine_0_check') === '2', 'either-or: switch to the second');
  pr = lb().filter(b => /Bow|Crossbow/.test(b.label)); E.run(pr[1].cmd, pat, tS); ok(E.get(soldier, 'item_light_do_fine_0_check') === '0', 'picking the chosen one again clears it');
  ok(has(E.run('!bobtam loaditem --c ' + soldier + ' --sec fixed --row item_light_si_0', pat), /no box to mark/), 'a plain item has no box');
  ok(has(E.run('!bobtam loaditem --c ' + soldier + ' --sec fixed --row item_light_si_9_name', pat), /no longer on the sheet/) && has(E.run('!bobtam loaditem --c ' + soldier + ' --sec fixed --row item_light_si_1', pat), /no longer on the sheet/), 'unknown or hidden items are refused');
  ok(has(E.run('!bobtam loaditem --c ' + soldier + ' --sec fixed --row item_light_do_fine_0 --idx 3', pat), /pick the first or the second/), 'either-or needs 1 or 2');
  ok(has(E.run('!bobtam loaditem --c ' + soldier + ' --sec nonsense --row x', pat), /unknown item list/), 'unknown section refused');
  ok(has(E.run('!bobtam loadstyle gigantic --c ' + soldier, pat), /is not a load/), 'unknown load refused');
  // utility rows
  E.attr(soldier, 'repeating_item_-U1_name', 'Rope'); E.attr(soldier, 'repeating_item_-U1_num_boxes', 2); E.attr(soldier, 'repeating_item_-U1_check', 0);
  E.attr(soldier, 'repeating_item_-U2_name', 'Flask'); E.attr(soldier, 'repeating_item_-U2_num_boxes', 1); E.attr(soldier, 'repeating_item_-U2_num_uses', 3); E.attr(soldier, 'repeating_item_-U2_item_uses', 0);
  E.attr(soldier, 'repeating_item_-U3_name', '');
  o = E.run('!bobtam load', pat, tS); L = linesOf(bcards(o)[0]);
  const ui = L.findIndex(l => /^Utility/.test(l));
  ok(/^Utility \(2 load, more if the Quartermaster allows\), marked 0:$/.test(L[ui]) && /Rope x2/.test(L[ui + 1]) && /Flask/.test(L[ui + 1]) && !/-U3/.test(L[ui + 1]), 'utility rows listed, unnamed rows left out', L.slice(ui));
  const ub = buttons(bcards(o)[0]);
  E.run(ub.find(b => /Rope/.test(b.label)).cmd, pat, tS); ok(E.get(soldier, 'repeating_item_-U1_check') === '1', 'a 2-box utility item: first click marks one box');
  E.run(buttons(lastCard(E.run('!bobtam load', pat, tS))).find(b => /Rope/.test(b.label)).cmd, pat, tS); ok(E.get(soldier, 'repeating_item_-U1_check') === '2', 'second click marks both');
  E.run(buttons(lastCard(E.run('!bobtam load', pat, tS))).find(b => /Rope/.test(b.label)).cmd, pat, tS); ok(E.get(soldier, 'repeating_item_-U1_check') === '0', 'third click clears');
  const fu = buttons(lastCard(E.run('!bobtam load', pat, tS))).find(b => /Flask uses 0\/3/.test(b.label));
  E.run(fu.cmd, pat, tS); ok(E.get(soldier, 'repeating_item_-U2_item_uses') === '1', 'utility uses are marked one at a time');
  ok(has(E.run('!bobtam loaditem --c ' + soldier + ' --sec utility --row -U1 --idx u', pat), /has no uses/), 'an item with no uses refuses the uses click');
  ok(has(E.run('!bobtam loaditem --c ' + soldier + ' --sec utility --row -Nope', pat), /no longer on the sheet/), 'unknown utility row refused');
  // permissions
  ok(has(E.run('!bobtam load', pat, tB), /only use this on characters you control/) && has(E.run('!bobtam loadstyle light', pat, tB), /only use this on characters you control/), 'a player cannot read or change another character\'s load');
  E.run('!bobtam loadstyle light', gm, tB); ok(E.get(spec, 'load') === 'light', 'the GM can');
  // switch variant
  const V = game(SRC.replace('var LOAD_RESETS_ARMOR = true;', 'var LOAD_RESETS_ARMOR = false;'));
  V.E.attr(V.soldier, 'armor', '1'); V.E.run('!bobtam loadstyle light', V.pat, V.tS);
  ok(V.E.get(V.soldier, 'armor') === '1' && V.E.get(V.soldier, 'load') === 'light', 'switch LOAD_RESETS_ARMOR = false leaves armor alone');
}

// ---------------------------------------------------------------- permissions and sheet types, every verb
{
  const { E, gm, pat, quinn, soldier, spec, tS, tB } = game();
  const verbs = ['roll sway Risky Standard 0', 'resist insight 0', 'fortune 2 --text', 'abilities', 'adj stress+1', 'adj corr+1', 'adj armor', 'adj spec+1', 'adj xp-insight', 'adj trauma+1', 'adj blight+1',
    'harm --level 1 --text Cut', 'harmmenu', 'shareharm', 'status', 'load', 'loadstyle light', 'stress 1', 'setup'];
  const snap = () => JSON.stringify(E.store.attrs.filter(a => a._characterid === spec)) + E.store.abilities.length;
  verbs.forEach(v => {
    const before = snap();
    const r = E.run('!bobtam ' + v, pat, tB);
    ok(has(r, /only use this on characters you control/) && !E.posted().length && snap() === before, 'player on another\'s token: refused, nothing posted or written: ' + v, r.map(x => x.slice(0, 70)));
  });
  verbs.forEach(v => {
    const r = E.run('!bobtam ' + v, gm, tB);
    ok(!has(r, /only use this on characters you control|something went wrong/), 'GM on anyone\'s token: allowed: ' + v, r.map(x => x.slice(0, 70)));
  });
  // controlledby with several players
  E.store.chars.find(c => c.id === spec).controlledby = pat + ',' + quinn;
  ok(!has(E.run('!bobtam status', pat, tB), /only use this on characters you control/), 'a character controlled by two players: both may use it');
  // sheet types
  ['chosen', 'broken', 'commander', 'marshal', 'quartermaster', 'lorekeeper', 'spymaster'].forEach(t => {
    E.attr(soldier, 'sheet_type', t);
    const before = JSON.stringify(E.store.attrs.filter(a => a._characterid === soldier));
    const n = E.store.abilities.length;
    let bad = [];
    verbs.forEach(v => { const r = E.run('!bobtam ' + v, pat, tS); if (!has(r, new RegExp('is a ' + t + ' sheet; v0\\.1\\.0 supports Rookie, Soldier and Specialist character sheets only')) || E.posted().length) { bad.push(v); } });
    ok(!bad.length && JSON.stringify(E.store.attrs.filter(a => a._characterid === soldier)) === before && E.store.abilities.length === n, 'sheet_type ' + t + ': every verb refused with the same message, nothing written', bad);
  });
  E.attr(soldier, 'sheet_type', 'character');
  // an unset sheet_type counts as character
  const bare = E.char('Bare', pat), tb = E.token(bare, 'b');
  ok(!has(E.run('!bobtam status', pat, tb), /sheet; v/), 'a sheet with no sheet_type value is a character sheet');
}

// ---------------------------------------------------------------- router, debug, errors
{
  const { E, gm, pat, soldier, tS } = game();
  let o = E.run('!bobtam', pat, tS); ok(has(o, /BoB Token Action Maker v0\.1\.0: select a PC token and run LEGION_TAM/), 'bare command whispers help', o);
  o = E.run('!bobtam frobnicate', pat, tS); ok(has(o, /select a PC token and run LEGION_TAM/), 'unknown verb whispers help');
  ['!bobtamx status', '!bob status', '!bitd status', '!bob-adjust self threat 1', '!missions', 'bobtam status', '!BOBTAM status'].forEach(c => {
    o = E.run(c, pat, tS); ok(!o.length, 'ignored: ' + c, o);
  });
  // debug
  o = E.run('!bobtam debug on', pat); ok(has(o, /only the GM can switch debugging/) && !E.env.state.BoBTAM.debug, 'a player cannot turn debugging on');
  E.logs.length = 0; E.run('!bobtam roll sway Risky Standard 0', pat, tS); ok(!E.logs.length, 'debugging off: nothing in the console');
  o = E.run('!bobtam debug on', gm); ok(has(o, /debugging is on/) && E.env.state.BoBTAM.debug === true, 'the GM turns debugging on');
  E.logs.length = 0; E.run('!bobtam roll sway Risky Standard 1', pat, tS);
  ok(E.logs.some(l => /^BoB debug: command from Pat: !bobtam roll sway/.test(l)) && E.logs.some(l => /^BoB debug: roll sway rating 3 bonus 1 pool 4 -> &\{template:blades\}/.test(l)), 'debugging on: the command and the composed card are logged', E.logs);
  E.run('!bobtam resist prowess 0', pat, tS); const card = E.posted()[0];
  E.logs.length = 0; E.deliver(card, [2], pat);
  ok(E.logs.some(l => /resist dice 2 -> highest 2, cost 4/.test(l)), 'debugging on: the dice read from the resist card are logged', E.logs);
  o = E.run('!bobtam debug off', gm); ok(has(o, /debugging is off/), 'and off');
  o = E.run('!bobtam debug', gm); ok(has(o, /debugging is off/), 'debug with no argument reports');
  // an error inside a verb is caught and reported
  const X = makeEnv([SRC], { throwOn: 'skirmish' }); const g2 = X.player('GM', true); X.ready();
  const c2 = X.char('Z', g2), t2 = X.token(c2, 'z');
  let threw = false, r2 = [];
  try { r2 = X.run('!bobtam roll skirmish Risky Standard 0', g2, t2); } catch (e) { threw = true; }
  ok(!threw && has(r2, /something went wrong \(boom\)/) && X.logs.some(l => /BoB error/.test(l)), 'an exception is caught, whispered and logged', r2);
}

// ---------------------------------------------------------------- hygiene of every card and button
{
  const { E, gm, pat, quinn, soldier, spec, rookie, tS, tB, tC } = game();
  E.run('!bobtam setup', pat, tS);
  // a character with plenty of data so every card has content
  [['abilities', '!bobtam abilities'], ['status', '!bobtam status'], ['harmmenu', '!bobtam harmmenu'], ['load', '!bobtam load']].forEach(() => {});
  E.attr(soldier, 'repeating_ability_-A1_name', 'Battleborn'); E.attr(soldier, 'repeating_ability_-A1_check', '1'); E.attr(soldier, 'repeating_ability_-A1_description', 'Text');
  E.attr(soldier, 'item_light_si_0_show', '1'); E.attr(soldier, 'item_light_si_0_name', 'Knife'); E.attr(soldier, 'item_light_si_1box_0_show', '1'); E.attr(soldier, 'item_light_si_1box_0_name', 'Rations');
  E.attr(soldier, 'item_light_do_0_show', '1'); E.attr(soldier, 'item_light_do_fine_0_show', '1'); E.attr(soldier, 'item_light_do_fine_0_name', 'Bow'); E.attr(soldier, 'item_light_do_fine_0_name2', 'Crossbow');
  E.attr(soldier, 'repeating_item_-U1_name', 'Rope'); E.attr(soldier, 'repeating_item_-U1_num_boxes', 2);
  E.attr(soldier, 'load', 'light'); E.attr(soldier, 'harm3', 'Broken Leg'); E.attr(soldier, 'harm1_2', 'Tired');
  E.attr(soldier, 'stress', 5);
  let all = [], seen = {}, bad = [];
  const click = (card) => buttons(card).forEach(b => {
    if (seen[b.cmd]) { return; } seen[b.cmd] = true;
    const o = E.run(b.cmd, pat, tS); all = all.concat(o); if (has(o, /something went wrong/)) { bad.push(b.cmd); }
    // ability and item buttons post publicly: include them in the hygiene pass
    all = all.concat(E.posted());
  });
  ['!bobtam abilities', '!bobtam status', '!bobtam harmmenu', '!bobtam load', '!bobtam adj trauma+1', '!bobtam adj blight+1', '!bobtam adj trauma-1'].forEach(cmd => {
    const o = E.run(cmd, pat, tS); all = all.concat(o);
    bcards(o).forEach(click);
  });
  E.attr(soldier, 'trauma_cold', '1'); E.attr(soldier, 'blight_rot', '1');
  ['!bobtam adj trauma-1', '!bobtam adj blight-1'].forEach(cmd => { const o = E.run(cmd, pat, tS); all = all.concat(o); bcards(o).forEach(click); });
  E.attr(soldier, 'stress', 6); const ov = E.run('!bobtam adj stress+1', pat, tS); all = all.concat(ov); bcards(ov).forEach(click);
  E.attr(soldier, 'corruption', 6); const cv = E.run('!bobtam adj corr+1', pat, tS); all = all.concat(cv); bcards(cv).forEach(click);
  E.run('!bobtam resist prowess 0', pat, tS); const rc = E.posted()[0]; const ro = E.deliver(rc, [3], pat); all = all.concat(ro); bcards(ro).forEach(click);
  ok(!bad.length, 'no button on any card ends in an error', bad);
  ok(Object.keys(seen).length > 30, 'a good spread of buttons was clicked', Object.keys(seen).length);
  const cards = all.filter(t => /&\{template:blades-broadcast\}/.test(t));
  ok(cards.length > 20, 'many cards produced', cards.length);
  const hyg = [];
  cards.forEach(t => {
    const content = field(t, 'content');
    if (/\{harm=1\}/.test(t)) { return; }
    if (!/^(\/w "[^"]*" )?&\{template:blades-broadcast\} \{\{charname=[^}]+\}\}( \{\{type=(\^\{[a-z_]+\}|[^}]*)\}\})?( \{\{title=[^}]+\}\})? \{\{content=/.test(t)) { hyg.push('shape ' + t.slice(0, 120)); }
    if (content && /\{\{|\}\}|\|/.test(content)) { hyg.push('content has {{ }} or |'); }
    buttons(t).forEach(b => {
      if (/[\[\]()]/.test(b.label)) { hyg.push('label ' + b.label); }
      if (!/^!bobtam [a-z]+/.test(b.cmd)) { hyg.push('command ' + b.cmd); }
      if (/"/.test(b.cmd) || /[|{}]/.test(b.cmd) || /\?\{/.test(b.cmd)) { hyg.push('bad command ' + b.cmd); }
    });
    if ((t.match(/\{\{content=/g) || []).length !== 1) { hyg.push('content field count'); }
    if (/\n/.test(t.replace(content || '', ''))) { hyg.push('newline outside content'); }
    if (content && content.length > 2500) { hyg.push('long ' + content.length); }
  });
  ok(!hyg.length, 'every card has the blades-broadcast shape, safe field text, and well-formed buttons (no ?{} inside a posted button)', hyg.slice(0, 6));
  // every blades card: balanced braces, no pipe or newline, ^{keys} that exist
  E.run('!bobtam roll sway Risky Standard 3', pat, tS); E.run('!bobtam resist insight 1', pat, tS); E.run('!bobtam fortune 3 --text hello', pat, tS); E.run('!bobtam fortune spec --text', pat, tS);
  const cardsB = [];
  ['research', 'sway', 'maneuver'].forEach(k => { E.run('!bobtam roll ' + k + ' Fortune Zero 2', pat, tS); cardsB.push(E.posted()[0]); });
  ['insight', 'prowess', 'resolve'].forEach(k => { E.run('!bobtam resist ' + k + ' 2', pat, tS); cardsB.push(E.posted()[0]); });
  E.run('!bobtam fortune 4 --text x', pat, tS); cardsB.push(E.posted()[0]);
  const h2 = [];
  cardsB.forEach(t => {
    if ((t.match(/\{\{/g) || []).length !== (t.match(/\}\}/g) || []).length) { h2.push('unbalanced ' + t); }
    if (/\n|\|/.test(t)) { h2.push('newline or pipe'); }
    (t.match(/\^\{[a-z0-9_]+\}/g) || []).forEach(k => { if (!(k.slice(2, -1) in TRANSLATION)) { h2.push('missing key ' + k); } });
  });
  ok(!h2.length, 'every posted roll card is balanced, one line, and uses translation keys that exist', h2.slice(0, 3));
}

// ---------------------------------------------------------------- translation keys and the sheet itself
{
  const src = SRC.replace(/\/\*[\s\S]*?\*\//g, '');
  const keys = new Set((src.match(/\^\{[a-z0-9_]+\}/g) || []).map(k => k.slice(2, -1)));
  ['rolls', 'fortune', 'special_ability', 'resist_instructions', 'action_roll_crit', 'action_roll_6', 'action_roll_4_5', 'action_roll_1_3'].concat(['research', 'scout', 'rig', 'wreck', 'skirmish', 'shoot', 'maneuver', 'consort', 'discipline', 'marshal', 'sway', 'insight', 'prowess', 'resolve', 'aim', 'anchor', 'channels', 'doctor', 'grit', 'scrounge', 'weave']).forEach(k => keys.add(k));
  const missing = Array.from(keys).filter(k => !(k in TRANSLATION));
  ok(!missing.length, 'every ^{key} the script can post exists in translation.json (' + keys.size + ' keys)', missing);
  ok(/Suffer <b>6 stress minus the highest die result\.<\/b> When you roll a critical on resistance, clear 1 stress\./.test(TRANSLATION.resist_instructions), 'the sheet\'s own resist text states the rule the script applies (R1)', TRANSLATION.resist_instructions);
  if (HTML) {
    ['research', 'scout', 'rig', 'wreck', 'skirmish', 'shoot', 'maneuver', 'consort', 'discipline', 'marshal', 'sway', 'aim', 'anchor', 'channels', 'doctor', 'grit', 'scrounge', 'weave', 'insight', 'prowess', 'resolve', 'fortune'].forEach(k => {
      ok(HTML.indexOf('{{#title-' + k + '}}') >= 0, 'the roll template draws a title image for title-' + k);
    });
    ok(/\{\{#results\}\}/.test(HTML) && /\{\{#position\}\}/.test(HTML) && /\{\{#effect\}\}/.test(HTML) && /\{\{\^zerodie1\}\}\{\{die1\}\}/.test(HTML.replace(/\s+/g, '')) || /\{\{\^zerodie1\}\}/.test(HTML), 'the roll template has the position, effect, results and zero-dice blocks the script fills');
    ok(/\{\{die12\}\}/.test(HTML) && !/\{\{die13\}\}/.test(HTML), 'the roll template draws die1 to die12 only (the script caps at 12)');
    // the numbers the script relies on
    ok(/stress_max", 9 \+/.test(HTML) && /trauma_max", 4 \+/.test(HTML), 'confirmed: the sheet worker sets stress_max to 9 + extra and trauma_max to 4 + extra, which is why the script does not read them');
    ok(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'].every(v => HTML.indexOf('name="attr_stress" value="' + v + '"') >= 0) && HTML.indexOf('name="attr_stress" value="11"') < 0, 'the stress radio has boxes 0 to 10');
    ok(['0', '1', '2', '3', '4'].every(v => HTML.indexOf('name="attr_trauma" value="' + v + '"') >= 0), 'the trauma radio has 0 to 4');
    ok(['0', '1', '2', '3', '4', '5', '6'].every(v => HTML.indexOf('name="attr_corruption" value="' + v + '"') >= 0) && HTML.indexOf('name="attr_corruption" value="7"') < 0, 'the corruption radio has 0 to 6 (the 7th point resets)');
    ok(['0', '1', '2', '3', '4'].every(v => HTML.indexOf('name="attr_blight" value="' + v + '"') >= 0), 'the blight radio has 0 to 4');
    ok(/name="attr_setting_extra_trauma" value="-1"/.test(HTML) && /name="attr_setting_extra_trauma" value="2"/.test(HTML), 'extra trauma runs -1 to 2 (1 to 4 boxes)');
    // every attribute touched in the whole run exists in the sheet
    const sheetHas = (name) => {
      if (new RegExp('name="attr_' + name + '"').test(HTML)) { return true; }
      let m = /^repeating_([a-z]+)_-[A-Za-z0-9]+_(.+)$/.exec(name);
      if (m) {
        const i = HTML.indexOf('<fieldset class="repeating_' + m[1] + '"'); if (i < 0) { return false; }
        const seg = HTML.slice(i, HTML.indexOf('</fieldset>', i));
        return seg.indexOf('name="attr_' + m[2] + '"') >= 0;
      }
      if (/^_reporder_repeating_[a-z]+$/.test(name)) { return true; }
      return false;
    };
    const names = Object.keys(touched).filter(n => n && !/^-id/.test(n));
    const unknown = names.filter(n => !sheetHas(n));
    ok(names.length > 60 && !unknown.length, 'every attribute the script reads or writes exists on the sheet (' + names.length + ' checked)', unknown);
  } else { skip('sheet checks need blades.html'); }
}

// ---------------------------------------------------------------- coexistence with the other scripts
{
  const calc = OTHER(/calculator/), miss = OTHER(/mission/), bitd = OTHER(/BitD/i);
  const srcs = [SRC].concat([calc, miss].filter(Boolean));
  if (calc && miss) {
    const E = makeEnv(srcs); const gm = E.player('GM', true), pat = E.player('Pat', false); E.ready();
    const c = E.char('Ayla', pat), t = E.token(c, 'A', { bar1_value: '2', bar2_value: '1', bar3_value: '0' });
    E.run('!bobtam setup', pat, t);
    ok(E.store.abilities.filter(a => a._characterid === c).length === 9, 'setup works with the calculator and mission generator loaded');
    E.run('!bobtam status', pat, t);
    ok(!E.out.some(o => o.who === 'Band of Blades'), '!bobtam produces no calculator or mission output', E.out.map(o => o.who));
    ['!bob', '!bob-adjust self threat 1', '!bob-potency self', '!bob-position desperate', '!bob-corr 1', '!bob-help', '!bob-finalize', '!missions-help', '!missions-location plainsworth'].forEach(cmd => {
      const r = E.run(cmd, gm);
      ok(r.length > 0 && !has(r, /Token actions|BoB: |Stress cost|BoB Token Action Maker/) && E.out.every(o => o.who === 'Band of Blades'), cmd + ' is handled by its own script only', r.map(x => x.slice(0, 50)));
    });
    ok(E.env.state.BoBTAM && E.env.state.BoBCalc && E.env.state.BoBMissions && E.env.state.BoBTAM !== E.env.state.BoBCalc, 'separate state keys (state.BoBTAM, state.BoBCalc, state.BoBMissions)', Object.keys(E.env.state));
    ok(typeof E.env.BandOfBladesCalculator === 'object' && typeof E.env.BandOfBladesMissions === 'object' && typeof E.env.BoBTAM === 'object', 'separate globals (BoBTAM, BandOfBladesCalculator, BandOfBladesMissions)');
    ok(E.store.macros.filter(m => m.name === 'LEGION_TAM').length === 1 && E.store.macros.find(m => m.name === 'LEGION_TAM').action === '!bobtam setup', 'the macro belongs to this script');
    ok(E.tok(t).bar2_value === '1' && E.tok(t).bar3_value === '0' && !E.tok(t).bar2_link && !E.tok(t).bar3_link, 'bars 2 and 3 are left as the calculator expects them');
    // documented interaction: bar 1 of a PC token is linked to stress, and the calculator reads bar 1 as Threat
    const stressAttr = E.store.attrs.find(a => a._characterid === c && a.name === 'stress');
    ok(E.tok(t).bar1_link === stressAttr.id, 'documented: bar 1 on a PC token now holds stress, so the calculator reads stress as that token\'s Threat until the calculator is patched');
    // the calculator's own commands never touch the bars of a token it did not read
    E.run('!bob-token self ' + t, gm);
    ok(E.env.BandOfBladesCalculator.checkState().self.threat === parseInt(E.tok(t).bar1_value, 10), 'documented: the calculator takes the stress value on bar 1 as Threat', E.env.BandOfBladesCalculator.checkState().self);
  } else { skip('coexistence with the calculator and mission generator needs those files'); }
  if (bitd) {
    const E = makeEnv([SRC, bitd]); const gm = E.player('GM', true), pat = E.player('Pat', false); E.ready();
    const c = E.char('Ayla', pat), t = E.token(c, 'A');
    ok(E.store.macros.length === 2 && E.store.macros.some(m => m.name === 'BLADES_TAM' && m.action === '!bitd setup') && E.store.macros.some(m => m.name === 'LEGION_TAM' && m.action === '!bobtam setup'), 'both global macros exist with different names');
    E.store.abilities.push({ id: 'b1', _characterid: c, name: '1. Action', description: 'bitd-tam', action: 'x', istokenaction: true });
    E.run('!bobtam setup', pat, t);
    ok(E.store.abilities.some(a => a.id === 'b1' && a.action === 'x'), 'the Blades in the Dark script\'s abilities (bitd-tam) survive a BoB rebuild');
    ok(E.store.abilities.filter(a => a._characterid === c && a.description === 'bob-tam').length === 8, 'and the same-named BoB ability is skipped, the other 8 are created', E.store.abilities.map(a => a.name));
    let o = E.run('!bitd status', pat, t);
    ok(!has(o, /Stress cost|BoB:/), '!bitd is handled by the Blades in the Dark script alone');
    o = E.run('!bobtam status', pat, t);
    ok(bcards(o).length === 2 && !has(o, /BitD/), '!bobtam is handled by the BoB script alone');
  } else { skip('coexistence with the BitD script needs it'); }
}

console.log(pass + ' passed, ' + fail + ' failed' + (skipped ? ', ' + skipped + ' check groups skipped (give blades.html and the other scripts to run them)' : ''));
process.exitCode = fail ? 1 : 0;

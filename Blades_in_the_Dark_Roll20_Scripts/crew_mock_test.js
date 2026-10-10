// Local mock of the Roll20 API to exercise "BitD Crew Token Action Maker.js".
// Usage: node crew_mock_test.js <crew script> <translation.json> [<PC script "BitD Token Action Maker.js">]
// The third argument turns on the two-scripts-coexist tests (both scripts are loaded into one sandbox).
// Exit code 1 if any check fails. Harness adapted from the PC script's mock_test.js.
const fs = require('fs');
const vm = require('vm');
const SRC = fs.readFileSync(process.argv[2], 'utf8');
const TR = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
const PC_SRC = process.argv[4] ? fs.readFileSync(process.argv[4], 'utf8') : null;

const DEFAULTS = {
  // player character sheet (needed when the PC script is loaded too)
  stress: '0', trauma: '0', armor: '0', heavy: '0', special: '0', coin: '0', stash: '0', recovery: '0',
  hunt: '0', study: '0', survey: '0', tinker: '0', finesse: '0', prowl: '0', skirmish: '0', wreck: '0', attune: '0',
  command: '0', consort: '0', sway: '0', insight: '0', prowess: '0', resolve: '0',
  coin_max: '4', stash_max: '40', recovery_max: '4', playbook_xp_max: '8', playbook_xp: '0',
  normal_debt_dc_max: '4', normal_debt_dc: '0', setting_traumata_set: 'normal',
  // crew sheet
  sheet_type: 'character', heat: '0', wanted: '0', wantedDC: '0', rep: '0', turf: '0', hold: 'strong', crew_tier: '0',
  crew_xp: '0', crewcoin: '0', crewcoin_dc: '0', crew_debt_dc: '0', crew_debt_dc_max: '4', dc_xp_clocksize: '6',
  setting_heat_label: 'Heat', title_text: ''
};

function makeEnv(withPC) {
  let n = 0; const nid = () => '-id' + (++n);
  const store = { chars: [], attrs: [], abilities: [], graphics: [], players: [], macros: [] };
  const out = []; const handlers = {}; const timers = []; const cbs = []; const logs = []; let lastBlades = null;
  const fire = (rec) => { (handlers['change:attribute:current'] || []).forEach(h => h(wrap(store.attrs, rec))); };
  const wrap = (arr, rec) => {
    const o = {
      id: rec.id,
      get: (k) => rec[k],
      set: (k, v) => { if (typeof k === 'object') Object.assign(rec, k); else rec[k] = v; if (rec.name !== undefined && rec._characterid !== undefined) fire(rec); },
      setWithWorker: (obj) => { Object.assign(rec, obj); fire(rec); },
      remove: () => { const i = arr.indexOf(rec); if (i >= 0) arr.splice(i, 1); }
    };
    return o;
  };
  const kinds = { character: 'chars', attribute: 'attrs', ability: 'abilities', graphic: 'graphics', player: 'players', macro: 'macros' };
  const env = {
    log: (s) => { logs.push(String(s)); },
    setTimeout: (fn, ms) => { timers.push(fn); return timers.length; },
    on: (ev, fn) => { (handlers[ev] = handlers[ev] || []).push(fn); },
    state: {},
    sendChat: (who, text, cb) => { out.push({ who, text }); if (/template:blades/.test(text)) { lastBlades = { who, text }; } if (cb) { cbs.push(cb); } },
    playerIsGM: (id) => !!(store.players.find(p => p.id === id) || {}).gm,
    getObj: (type, id) => { const r = store[kinds[type]].find(x => x.id === id); return r ? wrap(store[kinds[type]], r) : undefined; },
    findObjs: (q) => {
      const arr = store[kinds[q._type]];
      return arr.filter(r => Object.keys(q).every(k => k === '_type' || r[k] === q[k])).map(r => wrap(arr, r));
    },
    createObj: (type, props) => { const rec = Object.assign({ id: nid() }, props); store[kinds[type]].push(rec); if (type === 'attribute') { (handlers['add:attribute'] || []).forEach(h => h(wrap(store.attrs, rec))); } return wrap(store[kinds[type]], rec); },
    getAttrByName: (cid, name) => {
      const a = store.attrs.find(x => x._characterid === cid && x.name === name);
      if (a) return a.current;
      return DEFAULTS[name];
    }
  };
  const ctx = vm.createContext(env);
  if (withPC) { vm.runInContext(PC_SRC, ctx); }
  vm.runInContext(SRC, ctx);
  const api = {
    store, out, env, cbs, logs,
    char(name, controlledby) { const rec = { id: nid(), name, controlledby: controlledby || '' }; store.chars.push(rec); return rec.id; },
    crew(name, controlledby) { const id = api.char(name, controlledby); api.attr(id, 'sheet_type', 'crew'); return id; },
    attr(cid, name, val) { const a = store.attrs.find(x => x._characterid === cid && x.name === name); if (a) a.current = String(val); else store.attrs.push({ id: nid(), _characterid: cid, name, current: String(val) }); },
    val(cid, name) { const a = store.attrs.find(x => x._characterid === cid && x.name === name); return a ? a.current : undefined; },
    player(name, gm) { const rec = { id: nid(), _displayname: name, gm: !!gm }; store.players.push(rec); return rec.id; },
    token(cid) { const rec = { id: nid(), represents: cid }; store.graphics.push(rec); return rec.id; },
    tok(id) { return store.graphics.find(g => g.id === id); },
    // Roll20's Party member flag as the script reads it: the tag inside the character's tags (array, JSON text or plain text)
    party(cid, how) { const r = store.chars.find(c => c.id === cid); const tag = '_roll20_internal_party_tag_'; r.tags = how === 'string' ? tag : (how === 'json' ? JSON.stringify([tag]) : [tag]); },
    rawTags(cid, v) { store.chars.find(c => c.id === cid).tags = v; },
    abil(cid) { return store.abilities.filter(x => x._characterid === cid); },
    run(content, playerid, selectedTokenId) {
      out.length = 0;
      const msg = { type: 'api', content, playerid, who: 'x', selected: selectedTokenId ? [{ _id: selectedTokenId, _type: 'graphic' }] : undefined };
      (handlers['chat:message'] || []).forEach(h => h(msg));
      return out.map(o => o.text);
    },
    ready() { (handlers['ready'] || []).forEach(h => h()); },
    // the chat server echoes a posted roll-template message to chat:message handlers with its inline rolls resolved
    echo(vals, o) {
      o = o || {};
      const last = lastBlades;
      const pid = o.pid || /^player\|(.+)$/.exec(last.who)[1];
      const die = (v) => ({ results: { total: v, rolls: [{ type: 'R', dice: 1, sides: 6, results: [{ v }] }] } });
      const msg = { type: 'general', rolltemplate: 'blades', playerid: pid, content: (o.name ? last.text.replace(/\{\{charname=[^}]*\}\}/, '{{charname=' + o.name + '}}') : last.text).replace(/\[\[d6\]\]/g, '$[[0]]'), inlinerolls: vals === undefined ? undefined : vals.map(die) };
      out.length = 0;
      (handlers['chat:message'] || []).forEach(h => h(msg));
      return out.map(x => x.text);
    },
    flush() { while (timers.length) { timers.shift()(); } },
    barEvent(tokId) { (handlers['change:graphic:bar1_value'] || []).forEach(h => h(wrap(store.graphics, store.graphics.find(g => g.id === tokId)))); },
    // simulate a player editing a linked token bar / the sheet: attribute value changes, then the event fires
    edit(cid, name, val) { const a = store.attrs.find(x => x._characterid === cid && x.name === name); if (a) a.current = String(val); else store.attrs.push({ id: nid(), _characterid: cid, name, current: String(val) }); out.length = 0; fire(store.attrs.find(x => x._characterid === cid && x.name === name)); return out.map(o => o.text); }
  };
  return api;
}

let pass = 0, fail = 0;
function ok(cond, label, extra) { if (cond) { pass++; } else { fail++; console.log('FAIL:', label, extra !== undefined ? '\n   ' + JSON.stringify(extra) : ''); } }
const has = (arr, re) => arr.some(t => re.test(t));
const count = (s, ch) => s.split(ch).length - 1;
const dice = (t) => (t.match(/\[\[d6\]\]/g) || []).length;
// a standard table: GM, Pat (controls Bravos), Quinn (controls nothing)
function table() {
  const E = makeEnv(); const gm = E.player('GM', true), pat = E.player('Pat', false), quinn = E.player('Quinn', false);
  E.ready();
  return { E, gm, pat, quinn };
}
// the ?{...} prompts of a token-action macro: each is the list of its options
function queries(action) {
  const out = []; let i = 0;
  while ((i = action.indexOf('?{', i)) >= 0) { let d = 1, j = i + 2; while (j < action.length && d > 0) { if (action[j] === '{') d++; else if (action[j] === '}') d--; j++; } out.push(action.slice(i + 2, j - 1).split('|')); i = j; }
  return out;
}

// ---------------------------------------------------------------- T1 setup / permissions / crew-only gating
{
  const { E, gm, pat, quinn } = table();
  const m = E.store.macros[0];
  ok(m && m.name === 'CREW_TAM' && m.visibleto === 'all' && m.action === '!bitdcrew setup' && m._playerid === gm, 'macro CREW_TAM created visible to all', m);
  ok(!/bitdcrew/i.test(m.name) && count(E.store.macros.map(x => x.name).join(','), 'CREW_TAM') === 1, 'macro name does not resemble its command');
  const a = E.crew('Bravos', pat), b = E.crew('Hawkers', quinn), ta = E.token(a), tb = E.token(b);
  let o = E.run('!bitdcrew setup', pat, ta);
  const names = E.abil(a).map(x => x.name);
  ok(names.length === 12 && names.join('|') === '1. Roll|2. Engagement|3. Fortune|4. Score|6. Abilities|6a. Contacts|6b. Claims|6c. Crew Upgrades|7. Adjust|8. Clocks|9. Status|~ Rebuild', 'a core crew gets 12 token actions in order, with a gap at 5 (no Downtime button)', names);
  ok(E.abil(a).every(x => x.istokenaction === true && x.description === 'bitd-crew-tam'), 'abilities flagged with the crew marker');
  E.run('!bitdcrew setup', pat, ta);
  ok(E.abil(a).length === 12, 'rebuild is idempotent');
  o = E.run('!bitdcrew setup', pat, tb);
  ok(has(o, /only use this on crews you control/) && E.abil(b).length === 0, 'player refused on another crew, nothing written', o);
  E.run('!bitdcrew setup', gm, tb);
  ok(E.abil(b).length === 12, 'GM can set up any crew');
  // a user-made ability with a clashing name is skipped, not replaced
  E.store.abilities.push({ id: 'u1', _characterid: a, name: '9. Status', description: 'mine', action: 'x', istokenaction: true });
  o = E.run('!bitdcrew setup', pat, ta);
  ok(E.abil(a).filter(x => x.name === '9. Status').length === 1 && E.store.abilities.find(x => x.id === 'u1') && has(o, /Skipped/), 'user ability untouched and reported', o);
  o = E.run('!bitdcrew setup', pat);
  ok(has(o, /select one or more crew tokens/), 'setup without a token', o);
  o = E.run('!bitdcrew setup --c ' + a, pat);
  ok(E.abil(a).length === 12 && !has(o, /select/), 'setup by id works without a token', o);
  // crew controlled by everyone
  const c = E.crew('Smugglers', 'all'); const tc = E.token(c);
  E.run('!bitdcrew setup', quinn, tc);
  ok(E.abil(c).length === 12, 'crew controlled by all: any player can set it up');
  // crew-only gating: character and faction sheets refused by every verb
  const pc = E.char('Ayla', pat), tp = E.token(pc);
  const fac = E.char('Faction Status', ''); E.attr(fac, 'sheet_type', 'faction'); const tf = E.token(fac);
  ['setup', 'status', 'abilities', 'clocks', 'roll tier 0', 'adj heat+1', 'score 2 0 0 0 0'].forEach(v => {
    const r1 = E.run('!bitdcrew ' + v, gm, tp), r2 = E.run('!bitdcrew ' + v, gm, tf);
    ok(has(r1, /crew sheets only/) && has(r2, /crew sheets only/), 'verb "' + v + '" refuses character and faction sheets', [r1, r2]);
  });
  ok(E.abil(pc).length === 0 && E.abil(fac).length === 0 && E.val(pc, 'heat') === undefined, 'nothing written on a character or faction sheet');
  o = E.run('!bitdcrew', pat); ok(has(o, /select a crew token/), 'help text', o);
  o = E.run('!bitdcrew status', pat); ok(has(o, /select a crew token first/), 'no token message', o);
  o = E.run('!other thing', pat); ok(o.length === 0, 'other commands ignored');
  o = E.run('!bitd status', pat, ta); ok(o.length === 0, 'the PC command is not handled by this script');
}

// ---------------------------------------------------------------- T2 module-aware token action text
{
  const { E, pat } = table();
  const a = E.crew('Assassins', pat), ta = E.token(a), b = E.crew('Bravos', pat), tb = E.token(b);
  E.attr(a, 'setting_dc_downtime', '1'); E.attr(a, 'setting_dc_advancement', '1');
  E.run('!bitdcrew setup', pat, ta); E.run('!bitdcrew setup', pat, tb);
  const act = (cid, name) => E.abil(cid).find(x => x.name === name).action;
  ok(count(act(a, '4. Score'), '?{') === 7 && queries(act(a, '4. Score')).length === 7, 'Downtime on: score has 7 prompts', act(a, '4. Score'));
  ok(count(act(b, '4. Score'), '?{') === 5, 'Downtime off: score has 5 prompts', act(b, '4. Score'));
  ok(!/Entanglement/.test(act(a, '1. Roll')) && /Entanglement \(@\{selected\|wanted\}\),wanted/.test(act(b, '1. Roll')), 'Entanglement is offered only with Downtime off', [act(a, '1. Roll'), act(b, '1. Roll')]);
  ok(!/Reduce Heat|Assess hold|Heat and Hold|start a new Downtime|Begin score/.test(act(a, '7. Adjust')) && /Debt clock \+1/.test(act(a, '7. Adjust')) && /Incarceration/.test(act(a, '7. Adjust')), 'Downtime on: Adjust keeps the counters and Debt, and no longer carries Downtime or Score steps');
  ok(!/Reduce Heat/.test(act(b, '7. Adjust')) && !/Assess hold/.test(act(b, '7. Adjust')) && !/Debt/.test(act(b, '7. Adjust')) && /Incarceration/.test(act(b, '7. Adjust')), 'Downtime off: no Downtime entries, Incarceration present');
  // every prompt is well formed: option text,value with at most one comma, no empty options
  [a, b].forEach(cid => E.abil(cid).forEach(x => queries(x.action).forEach(q => {
    ok(q.slice(1).every(p => p.length > 0 && count(p, ',') <= 1), 'well-formed prompt in ' + x.name, q);
  })));
  // fixed native macros
  ok(/^!bitdcrew engagement \?\{Plan type\|/.test(act(b, '2. Engagement')) && !/numberofdice/.test(act(b, '2. Engagement')) && count(act(b, '2. Engagement'), '?{') === 5, 'Engagement is the composed macro (plan type and the four questions)', act(b, '2. Engagement'));
  ok(/\{\{type=fortune\}\}/.test(act(b, '3. Fortune')) && /@\{selected\|notes_query\}/.test(act(b, '3. Fortune')) && /\^\{roll\}/.test(act(b, '3. Fortune')), 'Fortune is the sheet crew macro');
  ok(act(b, '~ Rebuild') === '!bitdcrew setup' && act(b, '9. Status') === '!bitdcrew status' && act(b, '8. Clocks') === '!bitdcrew clocks' && act(b, '6. Abilities') === '!bitdcrew abilities', 'simple actions');
  // cohorts in the Roll list, names made safe for a prompt
  E.attr(b, 'cohort1_name', 'Thugs'); E.attr(b, 'repeating_cohort_-RowA_name', 'Hounds, the (best) [of] {all}|x');
  E.attr(b, 'repeating_cohort_-RowB_name', '   ');
  E.run('!bitdcrew setup', pat, tb);
  const q = queries(act(b, '1. Roll'))[0];
  ok(q.some(p => /^Cohort Thugs,cohort1$/.test(p)) && q.some(p => /^Cohort .*,cohort:-RowA$/.test(p)) && !q.some(p => /RowB/.test(p)), 'cohorts listed by name, blank rows skipped', q);
  ok(queries(act(b, '1. Roll')).every(qq => qq.slice(1).every(p => count(p, ',') <= 1)) && !/[\[\]{}()]/.test(q.find(p => /cohort:-RowA/.test(p)).split(',')[0]), 'odd cohort name does not break the prompt', q);
  // 5th Wanted box: the Roll label reads the 5-box track
  E.attr(b, 'setting_wanted_5th', '1'); E.run('!bitdcrew setup', pat, tb);
  ok(/Entanglement \(@\{selected\|wantedDC\}\),wanted/.test(act(b, '1. Roll')), 'Wanted label reads wantedDC when the 5th box is on', act(b, '1. Roll'));
  const o = E.run('!bitdcrew setup', pat, tb);
  ok(has(o, /Rules used: core/) && !has(o, /Rules used: Deep Cuts/), 'setup says which rules apply', o);
  ok(has(E.run('!bitdcrew setup', pat, ta), /Rules used: Deep Cuts Downtime/) && has(E.run('!bitdcrew setup', pat, ta), /Advancement, Downtime/), 'setup lists modules', E.out);
}

// ---------------------------------------------------------------- T2c Action module on (the "crew new" test crew): crew rules are unchanged
{
  const { E, gm, pat } = table();
  const a = E.crew('crew new', pat), ta = E.token(a);
  ['setting_dc_action', 'setting_dc_downtime', 'setting_dc_advancement', 'setting_dc_harm', 'setting_dc_load'].forEach(k => E.attr(a, k, '1'));
  let o = E.run('!bitdcrew setup', pat, ta);
  ok(has(o, /Deep Cuts modules on: Advancement, Downtime, Harm, Load, Action\./) && has(o, /Rules used: Deep Cuts Downtime/) && E.abil(a).length === 13 && E.abil(a).some(x => x.name === '5. Downtime'), 'all five modules on: setup lists them, Deep Cuts Downtime rules, 13 actions with 5. Downtime', o);
  E.attr(a, 'crew_tier', 2);
  o = E.run('!bitdcrew roll tier 1', pat, ta)[0];
  ok(dice(o) === 3 && /\{\{title-crew_tier=1\}\}/.test(o), 'Tier roll is the same with the Action module on', o);
  o = E.run('!bitdcrew score 2 0 0 0 0 1 4', pat, ta);
  ok(E.val(a, 'heat') === '4' && E.val(a, 'rep') === '2' && has(o, /Payoff: 1 Coin per PC \(4\)/), 'Downtime score flow is unchanged by the Action module', o.map(t => t.slice(0, 60)));
  E.attr(a, 'heat', 8); o = E.edit(a, 'heat', 9);
  ok(E.val(a, 'wanted') === '1' && has(o, /Bluecoats/), 'Heat 9 rule is unchanged by the Action module', o.map(t => t.slice(0, 40)));
  // Action on, Downtime off: still the core crew rules (the Action module does not touch Heat, Wanted or the entanglement roll)
  const b = E.crew('Cult', pat), tb = E.token(b); E.attr(b, 'setting_dc_action', '1');
  o = E.run('!bitdcrew setup', pat, tb);
  ok(has(o, /Deep Cuts modules on: Action\./) && has(o, /Rules used: core/), 'Action only: core crew rules', o);
  ok(/Entanglement/.test(E.abil(b).find(x => x.name === '1. Roll').action) && count(E.abil(b).find(x => x.name === '4. Score').action, '?{') === 5, 'Action only: core Roll list and 5-prompt Score');
}

// ---------------------------------------------------------------- T3 bar 1 = Heat
{
  const { E, pat } = table();
  const a = E.crew('Assassins', pat), ta = E.token(a); E.attr(a, 'heat', 4);
  E.run('!bitdcrew setup', pat, ta);
  const tok = E.tok(ta), heatAttr = E.store.attrs.find(x => x._characterid === a && x.name === 'heat');
  ok(tok.bar1_link === heatAttr.id && tok.bar1_value === '4' && tok.bar1_max === 9 && tok.showplayers_bar1 === true && tok.playersedit_bar1 === true, 'setup links bar 1 to heat (value, max 9, player visible and editable)', tok);
  ok(tok.bar2_link === undefined && tok.bar3_link === undefined, 'only bar 1 is used');
  const b = E.crew('Bravos', pat), tb = E.token(b);
  E.run('!bitdcrew setup', pat, tb);
  ok(E.val(b, 'heat') === '0' && E.tok(tb).bar1_link && E.tok(tb).bar1_max === 9, 'a missing heat attribute is created at 0', E.tok(tb));
  const c = E.crew('Cult', pat); const o = E.run('!bitdcrew setup --c ' + c, pat);
  ok(E.abil(c).length === 12 && E.val(c, 'heat') === undefined, 'setup by id does not touch bars or create heat', o);
  ok(has(E.run('!bitdcrew setup', pat, ta), /Bar 1 is linked to Heat on 1 token/), 'setup reports the bar');
}

// ---------------------------------------------------------------- T4 rolls
{
  const { E, pat, quinn } = table();
  const a = E.crew('Bravos', pat), ta = E.token(a);
  E.attr(a, 'crew_tier', 2);
  let o = E.run('!bitdcrew roll tier 1', pat, ta)[0];
  ok(dice(o) === 3 && /dice=/.test(o) && !/zerodice/.test(o) && /\{\{type=resist\}\}/.test(o) && /\{\{short=short\}\}/.test(o) && /\{\{title-crew_tier=1\}\}/.test(o) &&
     /\{\{title=\^\{crew_tier\}\}\}/.test(o) && /\{\{subtitle=\^\{roll_their\}\}\}/.test(o) && /\{\{charname=Bravos\}\}/.test(o), 'Tier 2 + 1 = 3 dice, sheet fields', o);
  ok(E.cbs.length === 0 && E.out[0].who === 'player|' + pat, 'roll is posted as the clicking player, without a callback');
  E.attr(a, 'crew_tier', 0); o = E.run('!bitdcrew roll tier 0', pat, ta)[0];
  ok(/zerodice=\[\[d6\]\], \[\[d6\]\]/.test(o) && dice(o) === 2, 'Tier 0 = zero dice (2d6, lowest)', o);
  E.attr(a, 'crew_tier', 1); o = E.run('!bitdcrew roll tier -2', pat, ta)[0];
  ok(/zerodice/.test(o), 'Tier 1 - 2 = zero dice', o);
  E.attr(a, 'crew_tier', 2); o = E.run('!bitdcrew roll tier 99', pat, ta)[0];
  ok(dice(o) === 8, 'bonus is limited to the sheet range (+6)', dice(o));
  o = E.run('!bitdcrew roll tier x', pat, ta)[0]; ok(dice(o) === 2 && !/zerodice/.test(o), 'a bad bonus counts as 0', o);
  E.attr(a, 'chat_image', 'http://img/x.png'); o = E.run('!bitdcrew roll tier 0', pat, ta)[0];
  ok(/\{\{charimage=http:\/\/img\/x\.png\}\}/.test(o), 'crew image on the card', o);
  o = E.run('!bitdcrew roll bogus 0', pat, ta); ok(has(o, /unknown roll/), 'unknown roll rejected', o);
  o = E.run('!bitdcrew roll tier 0', quinn, ta); ok(has(o, /only use this on crews you control/), 'roll refused for a non-controller', o);

  // Entanglement (core)
  E.attr(a, 'wanted', 2); E.attr(a, 'heat', 5);
  o = E.run('!bitdcrew roll wanted 0', pat, ta)[0];
  ok(dice(o) === 2 && /\{\{type=vice\}\}/.test(o) && /\{\{short=short\}\}/.test(o) && /\{\{title-entanglement=1\}\}/.test(o) && /\{\{title=\^\{entanglement\}\}\}/.test(o) &&
     /\{\{subtitle=\^\{wantedroll1\}5 Heat\^\{wantedroll2\}\}\}/.test(o), 'Entanglement: Wanted 2 = 2 dice, Heat in the subtitle', o);
  E.attr(a, 'setting_heat_label', 'Attention'); o = E.run('!bitdcrew roll wanted 1', pat, ta)[0];
  ok(dice(o) === 3 && /5 Attention\^\{wantedroll2\}/.test(o), 'custom Heat label and bonus die', o);
  E.attr(a, 'wanted', 0); o = E.run('!bitdcrew roll wanted 0', pat, ta)[0];
  ok(/zerodice/.test(o), 'Wanted 0 = two dice, take the lowest', o);
  E.attr(a, 'setting_wanted_5th', '1'); E.attr(a, 'wanted', 1); E.attr(a, 'wantedDC', 3);
  o = E.run('!bitdcrew roll wanted 0', pat, ta)[0]; ok(dice(o) === 3, '5th Wanted box on: the 5-box track is used', o);
  E.attr(a, 'setting_dc_downtime', '1');
  o = E.run('!bitdcrew roll wanted 0', pat, ta);
  ok(has(o, /no entanglement roll/) && !has(o, /template:blades/), 'Downtime on: no entanglement roll', o);

  // cohorts
  const c = E.crew('Hawkers', pat), tc = E.token(c); E.attr(c, 'crew_tier', 2);
  E.attr(c, 'cohort1_name', 'Thugs'); E.attr(c, 'cohort1_type', 'gang'); E.attr(c, 'cohort1_subtype', 'thugs');
  o = E.run('!bitdcrew roll cohort1 0', pat, tc)[0];
  ok(dice(o) === 2 && /\{\{charname=Thugs \(\^\{gang\}, thugs\)\}\}/.test(o) && /\{\{title-cohort_quality=1\}\}/.test(o) && /\{\{title=\^\{cohort_quality\}\}\}/.test(o) &&
     /\{\{subtitle=\^\{roll_their\}\}\}/.test(o) && /\{\{type=resist\}\}/.test(o) && !/\{\{charname=Hawkers\}\}/.test(o), 'gang cohort: Tier dice, sheet fields', o);
  E.attr(c, 'cohort1_type', 'elite'); o = E.run('!bitdcrew roll cohort1 0', pat, tc)[0]; ok(dice(o) === 3 && /\^\{elite\}/.test(o), 'elite cohort: Tier + 1', o);
  E.attr(c, 'cohort1_type', 'expert'); E.attr(c, 'cohort1_impaired', '1'); o = E.run('!bitdcrew roll cohort1 0', pat, tc)[0];
  ok(dice(o) === 2 && /\^\{expert\}/.test(o) && /\{\{subtitle=\^\{rolls_their\}\}\}/.test(o), 'expert cohort, impaired: Tier - 1 + 1, "rolls their"', o);
  E.attr(c, 'cohort1_impaired', '0'); E.attr(c, 'cohort1_type', 'gang');
  E.attr(c, 'repeating_cohort_-RowA_name', 'Adepts'); E.attr(c, 'repeating_cohort_-RowA_type', 'elite'); E.attr(c, 'repeating_cohort_-RowA_impaired', '1');
  E.attr(c, 'repeating_cohort_-RowA_verb', '^{roll_their}');
  o = E.run('!bitdcrew roll cohort:-RowA 1', pat, tc)[0];
  ok(dice(o) === 3 && /\{\{charname=Adepts \(\^\{elite\}\)\}\}/.test(o), 'repeating cohort: Tier 2 - 1 impaired + 1 elite + 1 bonus = 3', o);
  E.attr(c, 'crew_tier', 0); E.attr(c, 'repeating_cohort_-RowA_impaired', '0'); E.attr(c, 'repeating_cohort_-RowA_type', 'gang');
  o = E.run('!bitdcrew roll cohort:-RowA 0', pat, tc)[0]; ok(/zerodice/.test(o), 'cohort pool 0 = zero dice', o);
  o = E.run('!bitdcrew roll cohort:-Gone 0', pat, tc); ok(has(o, /no longer on the sheet/), 'a removed cohort is reported', o);
  const d = E.crew('Cult', pat), td = E.token(d);
  o = E.run('!bitdcrew roll cohort1 0', pat, td); ok(has(o, /no longer on the sheet/), 'no cohort named: reported', o);
  E.attr(c, 'repeating_cohort_-RowA_name', 'Bad }} name | x'); o = E.run('!bitdcrew roll cohort:-RowA 0', pat, tc)[0];
  ok(!/\}\} name/.test(o) && /\{\{charname=Bad name \/ x \(/.test(o), 'cohort name is cleaned for the template', o);
}

// ---------------------------------------------------------------- T5 Entanglement result lookup (core)
{
  const { E, pat, quinn } = table();
  const a = E.crew('Bravos', pat), ta = E.token(a);
  const WANT = {
    c0: { low: 'Gang Trouble or The Usual Suspects', mid: 'Rivals or Unquiet Dead', high: 'Cooperation' },
    c1: { low: 'Gang Trouble or Questioning', mid: 'Reprisals or Unquiet Dead', high: 'Show of Force' },
    c2: { low: 'Flipped or Interrogation', mid: 'Demonic Notice or Show of Force', high: 'Arrest' }
  };
  const colOf = (h) => h >= 6 ? 'c2' : (h >= 4 ? 'c1' : 'c0');
  const rowOf = (d) => d >= 6 ? 'high' : (d >= 4 ? 'mid' : 'low');
  E.attr(a, 'wanted', 1);
  [0, 3, 4, 5, 6, 9].forEach(h => [1, 3, 4, 5, 6].forEach(die => {
    E.attr(a, 'heat', h); E.run('!bitdcrew roll wanted 0', pat, ta);
    const o = E.echo([die]);
    const want = WANT[colOf(h)][rowOf(die)];
    ok(o.length >= 1 && has(o, new RegExp('\\{\\{title=' + want.replace(/[()]/g, '\\$&') + '\\}\\}')) && has(o, new RegExp('Heat was ' + h + ',')), 'Heat ' + h + ' die ' + die + ' -> ' + want, o.map(t => t.slice(0, 160)));
  }));
  // several dice: the highest counts; zero dice: the lowest counts
  E.attr(a, 'heat', 5); E.attr(a, 'wanted', 3); E.run('!bitdcrew roll wanted 0', pat, ta);
  let o = E.echo([1, 3, 6]); ok(has(o, /Highest die 6/) && has(o, /Show of Force/), '3 dice [1,3,6]: highest 6', o);
  E.attr(a, 'wanted', 0); E.run('!bitdcrew roll wanted 0', pat, ta);
  o = E.echo([6, 2]); ok(has(o, /Lowest die 2/) && has(o, /Gang Trouble or Questioning/), 'zero dice [6,2]: lowest 2', o);
  E.run('!bitdcrew roll wanted 0', pat, ta); o = E.echo([5, 6]); ok(has(o, /Lowest die 5/) && has(o, /Reprisals/), 'zero dice [5,6]: lowest 5', o);
  // Heat is the Heat when the roll was made
  E.attr(a, 'wanted', 1); E.attr(a, 'heat', 2); E.run('!bitdcrew roll wanted 0', pat, ta); E.attr(a, 'heat', 8);
  o = E.echo([6]); ok(has(o, /Heat was 2,/) && has(o, /Cooperation/), 'Heat is read at roll time', o);
  // recipients: the GM and controllers, not other players
  E.run('!bitdcrew roll wanted 0', pat, ta); o = E.echo([4]);
  ok(E.out.some(x => /^\/w "GM"/.test(x.text)) && E.out.some(x => /^\/w "Pat"/.test(x.text)) && !E.out.some(x => /Quinn/.test(x.text)), 'result goes to the GM and the controller only', E.out.map(x => x.text.slice(0, 20)));
  // unreadable dice: no result, no crash
  E.attr(a, 'wanted', 2); E.run('!bitdcrew roll wanted 0', pat, ta); o = E.echo([6]);
  ok(o.length === 0 && E.logs.some(l => /could not read the dice/.test(l)), 'wrong number of dice: ignored and logged', [o, E.logs.slice(-2)]);
  E.run('!bitdcrew roll wanted 0', pat, ta); o = E.echo(undefined); ok(o.length === 0, 'no dice data: ignored');
  E.run('!bitdcrew roll wanted 0', pat, ta); o = E.echo([]); ok(o.length === 0, 'empty dice list: ignored');
  // someone else's card, or another crew's card, is not this roll; the right one is still picked up afterwards
  E.attr(a, 'wanted', 1); E.run('!bitdcrew roll wanted 0', pat, ta);
  o = E.echo([6], { pid: 'other-player' }); ok(o.length === 0, 'a card from another player is ignored');
  o = E.echo([6], { name: 'Someone Else' }); ok(o.length === 0, 'a card for another crew is ignored');
  o = E.echo([6]); ok(has(o, /Cooperation|Show of Force|Arrest/), 'the matching card is still picked up', o);
  o = E.echo([6]); ok(o.length === 0, 'a roll is looked up once');
  // Tier and cohort rolls never produce a lookup
  E.run('!bitdcrew roll tier 0', pat, ta); o = E.echo([6, 6]); ok(o.length === 0, 'Tier roll: no lookup');
  // Downtime on: no roll and so no lookup
  E.attr(a, 'setting_dc_downtime', '1'); E.run('!bitdcrew roll wanted 0', pat, ta);
  ok(E.out.every(x => !/template:blades/.test(x.text)), 'Downtime on: nothing posted to look up');
  ok(E.cbs.length === 0, 'no sendChat callback anywhere (it would stop the card posting)');
}

// ---------------------------------------------------------------- T6 Heat reaching 9 (token bar / sheet edits)
{
  const { E, gm, pat, quinn } = table();
  const a = E.crew('Bravos', pat); E.attr(a, 'heat', 8); E.attr(a, 'wanted', 1);
  let o = E.edit(a, 'heat', 8);
  ok(o.length === 0 && E.val(a, 'wanted') === '1', 'Heat 8/9 does nothing', o);
  o = E.edit(a, 'heat', 9);
  ok(E.val(a, 'heat') === '0' && E.val(a, 'wanted') === '2', 'Heat reaching 9: Heat 0, Wanted +1', [E.val(a, 'heat'), E.val(a, 'wanted')]);
  ok(o.length === 2 && o.some(t => /\/w "GM"/.test(t)) && o.some(t => /\/w "Pat"/.test(t)) && !o.some(t => /Quinn/.test(t)), 'card goes to the GM and the controller only', o.map(t => t.slice(0, 30)));
  ok(/Wanted level \+1 \(now 2\/4\)/.test(o[0]) && /Heat is cleared and the excess rolls over/.test(o[0]) && !/Bluecoats/.test(o[0]) && /Heat was set to 9\. It is now 0\/9/.test(o[0]), 'core card wording, no Deep Cuts text', o[0]);
  o = E.edit(a, 'heat', 0); ok(o.length === 0 && E.val(a, 'wanted') === '2', 'clearing Heat does not re-trigger');
  // rollover and several fills
  E.attr(a, 'wanted', 0); o = E.edit(a, 'heat', 11);
  ok(E.val(a, 'heat') === '2' && E.val(a, 'wanted') === '1', 'Heat typed past the end rolls over: 11 -> Heat 2, Wanted 1', [E.val(a, 'heat'), E.val(a, 'wanted')]);
  E.attr(a, 'wanted', 0); o = E.edit(a, 'heat', 19);
  ok(E.val(a, 'heat') === '1' && E.val(a, 'wanted') === '2' && /filled 2 times/.test(o.join(' ')), 'two fills: 19 -> Heat 1, Wanted +2', [E.val(a, 'heat'), E.val(a, 'wanted'), o.join(' ').slice(0, 200)]);
  // highest Wanted level reached
  E.attr(a, 'wanted', 4); o = E.edit(a, 'heat', 9);
  ok(E.val(a, 'wanted') === '4' && E.val(a, 'heat') === '0' && /already at its highest level \(4\)/.test(o[0]) && /Heat was cleared anyway/.test(o[0]), 'Wanted at 4: no new level, Heat cleared, warned', o[0]);
  E.attr(a, 'wanted', 3); o = E.edit(a, 'heat', 20);
  ok(E.val(a, 'wanted') === '4' && E.val(a, 'heat') === '2' && /Wanted level \+1/.test(o[0]) && /1 fill/.test(o[0]), 'two fills with only one level left', [E.val(a, 'wanted'), E.val(a, 'heat'), o[0]]);
  // the 5th Wanted box
  E.attr(a, 'setting_wanted_5th', '1'); E.attr(a, 'wanted', 0); E.attr(a, 'wantedDC', 4); o = E.edit(a, 'heat', 9);
  ok(E.val(a, 'wantedDC') === '5' && E.val(a, 'wanted') === '0' && /now 5\/5/.test(o[0]), '5th box on: the 5-box track gains the level, up to 5', [E.val(a, 'wantedDC'), E.val(a, 'wanted')]);
  o = E.edit(a, 'heat', 9); ok(E.val(a, 'wantedDC') === '5' && /highest level \(5\)/.test(o[0]), 'the 5-box track stops at 5', o[0]);
  // Deep Cuts Downtime: crew xp, Bluecoats
  const b = E.crew('Assassins', pat); E.attr(b, 'setting_dc_downtime', '1'); E.attr(b, 'wanted', 1);
  o = E.edit(b, 'heat', 9);
  ok(E.val(b, 'wanted') === '2' && /mark crew xp and pick Bluecoats/.test(o[0]) && /Bluecoats at Wanted level 2.*Serious Beatings \(Harm 2\), interrogation, or seizure of assets\./.test(o[0]) &&
     /bought off for 6 Coin \(wanted level \+ 4\)/.test(o[0]) && new RegExp('\\[Mark crew XP\\]\\(!bitdcrew adj xp\\+1 --c ' + b + '\\)').test(o[0]) && !/Slippery/.test(o[0]), 'Downtime on: xp reminder, Bluecoats line, buy-off cost, xp button', o[0]);
  [[0, 'Questioning, harassment'], [1, 'Beatings \\(Harm 1\\)'], [3, 'Severe Beatings'], [4, 'Lethal force']].forEach(r => {
    E.attr(b, 'wanted', Math.max(0, r[0] - 1)); const x = E.edit(b, 'heat', 9);
    if (r[0] > 0) { ok(new RegExp('Wanted level ' + r[0] + ',.*' + r[1]).test(x[0]), 'Bluecoats line for Wanted ' + r[0], x[0]); }
  });
  // Slippery (Deep Cuts p88): effective Wanted one lower
  const s = E.crew('Shadows', pat); E.attr(s, 'setting_dc_downtime', '1'); E.attr(s, 'wanted', 2);
  E.attr(s, 'repeating_crewability_-S1_name', 'Slippery'); E.attr(s, 'repeating_crewability_-S1_check', '1');
  o = E.edit(s, 'heat', 9);
  ok(E.val(s, 'wanted') === '3' && /Bluecoats at Wanted level 2,/.test(o[0]) && /bought off for 6 Coin/.test(o[0]) && /Slippery: your effective Wanted level is one less/.test(o[0]), 'Slippery: effective Wanted 2 at actual 3', o[0]);
  const s2 = E.crew('Shadows2', pat); E.attr(s2, 'wanted', 2); E.attr(s2, 'repeating_crewability_-S1_name', 'Slippery'); E.attr(s2, 'repeating_crewability_-S1_check', '1');
  o = E.edit(s2, 'heat', 9); ok(!/Slippery|Bluecoats/.test(o[0]), 'Slippery matters only with Downtime on', o[0]);
  const s3 = E.crew('Shadows3', pat); E.attr(s3, 'setting_dc_downtime', '1'); E.attr(s3, 'wanted', 2); E.attr(s3, 'repeating_crewability_-S1_name', 'Slippery');
  o = E.edit(s3, 'heat', 9); ok(!/Slippery/.test(o[0]), 'an unticked Slippery does nothing', o[0]);
  // crew sheets only; other attributes ignored
  const pc = E.char('Ayla', pat); o = E.edit(pc, 'heat', 9); ok(o.length === 0 && E.val(pc, 'wanted') === undefined && E.val(pc, 'heat') === '9', 'a character sheet is ignored', o);
  const fac = E.char('Factions', ''); E.attr(fac, 'sheet_type', 'faction'); o = E.edit(fac, 'heat', 9); ok(o.length === 0 && E.val(fac, 'wanted') === undefined, 'a faction sheet is ignored');
  const d = E.crew('Cult', pat); o = E.edit(d, 'rep', 9); ok(o.length === 0 && E.val(d, 'wanted') === undefined, 'other attributes ignored', o);
  // controlled by all: everyone is told
  const e = E.crew('Hawkers', 'all'); o = E.edit(e, 'heat', 9); ok(o.length === 3 && E.val(e, 'wanted') === '1', 'controlled by all: GM and every player', o.map(t => t.slice(0, 20)));
}

// ---------------------------------------------------------------- T6b the token bar stays in step with the attribute
{
  const { E, pat } = table();
  const a = E.crew('Bravos', pat), ta = E.token(a); E.attr(a, 'heat', 4);
  E.run('!bitdcrew setup', pat, ta);
  const tok = E.tok(ta);
  E.edit(a, 'heat', 9); tok.bar1_value = '9'; E.flush();
  ok(E.val(a, 'heat') === '0' && tok.bar1_value === '0', 'after the automatic reset a stale bar of 9 is corrected to 0', [E.val(a, 'heat'), tok.bar1_value]);
  tok.bar1_value = '9'; E.barEvent(ta); E.flush(); ok(tok.bar1_value === '0', 'a late bar event is corrected', tok.bar1_value);
  E.attr(a, 'heat', 5); tok.bar1_value = '5'; E.barEvent(ta); E.flush(); ok(tok.bar1_value === '5' && E.val(a, 'heat') === '5', 'a matching bar edit is untouched');
  // manual changes by the script move the bar too
  E.run('!bitdcrew adj heat+1', pat, ta); ok(E.val(a, 'heat') === '6' && tok.bar1_value === '6', 'Adjust moves the linked bar', tok.bar1_value);
  E.run('!bitdcrew adj heat+1', pat, ta); E.run('!bitdcrew adj heat+1', pat, ta); E.run('!bitdcrew adj heat+1', pat, ta);
  ok(E.val(a, 'heat') === '0' && E.val(a, 'wanted') === '2' && tok.bar1_value === '0', 'Heat filled by Adjust: bar follows the rollover', [E.val(a, 'heat'), tok.bar1_value]);
  const b = E.crew('Cult', pat), tb = E.token(b), tokb = E.tok(tb); E.attr(b, 'rep', 2); const repAttr = E.store.attrs.find(x => x._characterid === b && x.name === 'rep');
  tokb.bar1_link = repAttr.id; tokb.bar1_value = '7'; E.barEvent(tb); E.flush(); ok(tokb.bar1_value === '7', 'bars linked to other attributes untouched');
  const tc = E.token(b), tokc = E.tok(tc); tokc.bar1_value = '3'; E.barEvent(tc); E.flush(); ok(tokc.bar1_value === '3', 'unlinked bars untouched');
}

// ---------------------------------------------------------------- T7 Score, core rules
{
  const { E, gm, pat, quinn } = table();
  const a = E.crew('Bravos', pat), ta = E.token(a);
  let o = E.run('!bitdcrew score 2 0 0 0 0', pat, ta);
  ok(E.val(a, 'heat') === '2' && has(o, /Heat \+2 \(exposure 2\)/) && has(o, /Heat now .* 2\/9/), 'standard score: Heat 2', o);
  E.attr(a, 'heat', 0); o = E.run('!bitdcrew score 4 1 1 1 2', pat, ta);
  ok(E.val(a, 'heat') === '0' + '' || true, '');
  ok(E.val(a, 'heat') === String((4 + 1 + 1 + 1 + 2) % 9) && E.val(a, 'wanted') === '1' && has(o, /exposure 4, high-profile target \+1, hostile turf \+1, at war \+1, killing \+2/), 'all modifiers: 9 Heat = Wanted +1, Heat 0', [E.val(a, 'heat'), E.val(a, 'wanted')]);
  E.attr(a, 'heat', 7); E.attr(a, 'wanted', 0); o = E.run('!bitdcrew score 4 0 0 0 0', pat, ta);
  ok(E.val(a, 'heat') === '2' && E.val(a, 'wanted') === '1' && has(o, /Wanted level \+1/), 'the book example: 7 Heat + 4 = Wanted +1 and 2 Heat marked', [E.val(a, 'heat'), E.val(a, 'wanted')]);
  ok(E.val(a, 'rep') === undefined && E.val(a, 'crewcoin') === undefined && E.val(a, 'crewcoin_dc') === undefined, 'core score changes only Heat and Wanted');
  E.attr(a, 'heat', 0); const before = [E.val(a, 'heat'), E.val(a, 'wanted')].join();
  [['!bitdcrew score 3 0 0 0 0', 'exposure 3'], ['!bitdcrew score 2 2 0 0 0', 'target 2'], ['!bitdcrew score 2 0 0 0 1', 'killing 1'], ['!bitdcrew score x 0 0 0 0', 'text']].forEach(c => {
    const r = E.run(c[0], pat, ta); ok(has(r, /not valid/) && [E.val(a, 'heat'), E.val(a, 'wanted')].join() === before, 'invalid answer rejected: ' + c[1], r);
  });
  o = E.run('!bitdcrew score 2 0 0 0 0 1 4', pat, ta);
  ok(has(o, /out of date.*Rebuild/) && E.val(a, 'heat') === '0', 'Deep Cuts-length answers on a core crew: told to rebuild, nothing changed', o);
  const b = E.crew('Assassins', pat); E.attr(b, 'setting_dc_downtime', '1'); const tb = E.token(b);
  o = E.run('!bitdcrew score 2 0 0 0 0', pat, tb); ok(has(o, /out of date.*Rebuild/) && E.val(b, 'heat') === undefined, 'core-length answers on a Downtime crew: told to rebuild', o);
  o = E.run('!bitdcrew score 2 0 0 0 0', quinn, ta); ok(has(o, /only use this on crews you control/), 'score refused for a non-controller');
  // a Wanted card goes to the table when Heat fills
  E.attr(a, 'heat', 8); o = E.run('!bitdcrew score 2 0 0 0 0', pat, ta);
  ok(o.length === 3 && has(o, /^\/w "GM".*Wanted level \+1/) && !has(o, /Quinn/), 'score that fills Heat: score card to the clicker, Wanted card to GM and controller', o.map(t => t.slice(0, 40)));
}

// ---------------------------------------------------------------- T8 Score, Deep Cuts Downtime: Fallout, Rep, Payoff walk-through
{
  const { E, gm, pat, quinn } = table();
  const mk = (name, tier) => { const c = E.crew(name, pat); E.attr(c, 'setting_dc_downtime', '1'); E.attr(c, 'crew_tier', tier); return c; };
  const nonceOf = (texts) => { const m = /--idx (\S+?)\)/.exec(texts.join(' ')); return m ? m[1] : null; };
  const a = mk('Assassins', 2), ta = E.token(a);
  let o = E.run('!bitdcrew score 2 2 2 0 2 1 4', pat, ta);
  const card = o.find(t => /Fallout/.test(t));
  ok(E.val(a, 'heat') === '1' && E.val(a, 'wanted') === '1', 'Heat 2+2+2+2+0+2 = 10: Heat 1, Wanted +1', [E.val(a, 'heat'), E.val(a, 'wanted')]);
  ok(/Heat \+10 \(base 2, crew Tier \+2, target \+2, chaos or war \+2, witnesses \+2\)/.test(card), 'Heat breakdown', card);
  ok(E.val(a, 'rep') === '5' && /Rep \+5 \(1 per 2 Heat\)\. Rep now 5\/12/.test(card), 'Rep: 1 per 2 Heat = 5 (target Tier 1 is below the crew)', card);
  ok(/Payoff: 1 Coin per PC \(4\) plus 3 x the target's Tier \(1\) = 7 Coin\./.test(card), 'payoff base: 4 PCs + 3 x 1 = 7', card);
  ok(/mark crew xp and pick Bluecoats/.test(card) && /Bluecoats at Wanted level 1/.test(card) && /bought off for 5 Coin/.test(card), 'Fallout card carries the Wanted-level text', card);
  ok(o.some(t => /^\/w "GM"/.test(t) && /Wanted level/.test(t) && !/Fallout/.test(t)) && o.filter(t => /Wanted level/.test(t) && /Pat/.test(t.slice(0, 12))).length === 1, 'the table is told about the new Wanted level (clicker gets it in the Fallout card only)', o.map(t => t.slice(0, 40)));
  ok(!/Heat is 6 or more/.test(card), 'Heat 1: no entanglement line');
  ok(/Seized assets\? Pick one:/.test(card) && /seized none --c .* --idx/.test(card) && /seized cash/.test(card) && /seized fence8/.test(card), 'seized-assets buttons', card);
  ok(E.val(a, 'crewcoin') === undefined && E.val(a, 'crewcoin_dc') === undefined, 'no Coin is applied by the score itself');
  // No Traces
  const b = mk('Assassins2', 2), tb = E.token(b); E.attr(b, 'repeating_crewability_-N1_name', 'No Traces'); E.attr(b, 'repeating_crewability_-N1_check', '1');
  o = E.run('!bitdcrew score 2 2 2 0 2 1 4', pat, tb);
  ok(has(o, /Heat \+9 .*No Traces -1\)/) && E.val(b, 'wanted') === '1' && E.val(b, 'heat') === '0' && E.val(b, 'rep') === '4', 'No Traces: -1 Heat on the total (10 -> 9), Rep 1 per 2 = 4', [E.val(b, 'heat'), E.val(b, 'rep')]);
  const b2 = mk('Assassins3', 2), tb2 = E.token(b2); E.attr(b2, 'repeating_crewability_-N1_name', 'No Traces');
  E.run('!bitdcrew score 2 0 0 0 0 0 1', pat, tb2); ok(E.val(b2, 'heat') === '4', 'an unticked No Traces does nothing', E.val(b2, 'heat'));
  const b3 = mk('Assassins4', 2), tb3 = E.token(b3); E.attr(b3, 'repeating_crewability_-N1_name', 'No Traces'); E.attr(b3, 'repeating_crewability_-N1_check', '1'); E.attr(b3, 'crew_tier', 0);
  E.run('!bitdcrew score 0 0 0 0 0 0 1', pat, tb3); ok(E.val(b3, 'heat') === '0', 'No Traces never takes Heat below 0', E.val(b3, 'heat'));
  // Rep from a higher-Tier target, and the track limit
  const c = mk('Hawkers', 1), tc = E.token(c); E.attr(c, 'rep', 10);
  o = E.run('!bitdcrew score 0 0 0 0 0 4 2', pat, tc);
  ok(E.val(c, 'heat') === '1' && E.val(c, 'rep') === '12' && has(o, /Rep \+3 \(1 per 2 Heat, \+3 for the target's Tier\)\. Rep now 12\/12 \(the track is full\)/), 'target Tier 4 vs crew Tier 1: +3 Rep, capped at 12', [E.val(c, 'heat'), E.val(c, 'rep'), o.join(' ').slice(0, 300)]);
  // several fills in one score, Wanted limit, Heat 6 line
  const d = mk('Bravos', 4), td = E.token(d);
  o = E.run('!bitdcrew score 2 2 4 4 4 3 8', pat, td);
  ok(E.val(d, 'heat') === '2' && E.val(d, 'wanted') === '2' && has(o, /Heat \+20/) && has(o, /Heat filled 2 times/), 'Heat 20: two fills, Wanted +2, Heat 2', [E.val(d, 'heat'), E.val(d, 'wanted')]);
  E.attr(d, 'heat', 0); E.attr(d, 'wanted', 4); o = E.run('!bitdcrew score 2 2 4 4 4 3 8', pat, td);
  ok(E.val(d, 'wanted') === '4' && has(o, /already at its highest level \(4\)/), 'Wanted 4: capped and warned', o.join(' ').slice(0, 200));
  const e = mk('Cult', 0), te = E.token(e); o = E.run('!bitdcrew score 2 2 2 0 0 0 1', pat, te);
  ok(E.val(e, 'heat') === '6' && has(o, /Heat is 6 or more: the GM brings an entanglement into play/), 'Heat 6 or more: entanglement line', E.val(e, 'heat'));
  // validation
  const f = mk('Smugglers', 1), tf = E.token(f);
  [['3 0 0 0 0 0 1', 'base 3'], ['2 1 0 0 0 0 1', 'target 1'], ['2 0 1 0 0 0 1', 'chaos 1'], ['2 0 0 2 0 0 1', 'death 2'], ['2 0 0 0 1 0 1', 'witnesses 1'], ['2 0 0 0 0 7 1', 'tier 7'], ['2 0 0 0 0 0 0', 'pcs 0'], ['2 0 0 0 0 0 9', 'pcs 9']].forEach(c2 => {
    const r = E.run('!bitdcrew score ' + c2[0], pat, tf); ok(has(r, /not valid/) && E.val(f, 'heat') === undefined, 'invalid answer rejected: ' + c2[1], r);
  });
  ok(has(E.run('!bitdcrew score 2 0 0 0 0', pat, tf), /out of date/), 'wrong answer count on a Downtime crew');

  // ---- the Payoff walk-through
  const walk = (tier, scoreArgs, setup) => {
    const c = mk('W' + Math.random(), tier), t = E.token(c); if (setup) setup(c);
    const r = E.run('!bitdcrew score ' + scoreArgs, pat, t); return { c, t, n: nonceOf(r), r };
  };
  // Tier 2 crew, 4 PCs, target Tier 1: base 7. No seized assets: earned 7, tithe floor(7/4) = 1
  let w = walk(2, '2 0 0 0 0 1 4');
  o = E.run('!bitdcrew seized none --c ' + w.c + ' --idx ' + w.n, pat);
  ok(has(o, /Earned from the score: 7 Coin/) && has(o, /Tithe: you are Tier 2.*1 Coin/) && has(o, /tithe pay --c .* --idx/) && has(o, /tithe skip/) && has(o, /go into debt, accept a favor/), 'no seized assets: earned 7, tithe 1, pay / not pay buttons', o);
  ok(E.val(w.c, 'heat') === '4', 'seized none changes no Heat', E.val(w.c, 'heat'));
  o = E.run('!bitdcrew tithe pay --c ' + w.c + ' --idx ' + w.n, pat);
  ok(has(o, /Tithe paid: 1 Coin\. 6 Coin left/) && has(o, /deposit all --c .* --idx/) && has(o, /All 6 to the crew/) && has(o, /Half, 3, to the crew/) && has(o, /room for 4 more/), 'tithe paid: 6 to deposit, crew has room for 4 (no vault)', o);
  E.out.length = 0; o = E.run('!bitdcrew deposit all --c ' + w.c + ' --idx ' + w.n, pat);
  ok(E.val(w.c, 'crewcoin_dc') === '4' && has(o, /To the crew: 4 Coin \(crew now holds 4\)/) && has(o, /had room for only 4 of the 6/) && has(o, /Elsewhere \(PC stashes or a bank\): 2 Coin/), 'deposit all: limited by vault room, rest goes elsewhere', o);
  ok(E.out.filter(x => /^player\|/.test(x.who)).length === 1 && /^player\|/.test(E.out[0].who) && /Score recorded/.test(E.out[0].text) && /Heat \+4, Rep \+2/.test(E.out[0].text), 'the final summary is posted publicly', E.out.map(x => x.who));
  ok(E.out.length === 2 && /^\/w /.test(E.out[1].text) && /Heat and Hold/.test(E.out[1].text), 'a Heat and Hold card is whispered right after the final summary', E.out.map(x => x.who));
  ok(E.val(w.c, 'crewcoin') === undefined, 'the standard coin track is never written when Downtime is on');
  // once only
  [['seized cash', /Already done/], ['tithe skip', /Already done/], ['deposit none', /Already done/]].forEach(c2 => {
    const r = E.run('!bitdcrew ' + c2[0] + ' --c ' + w.c + ' --idx ' + w.n, pat); ok(has(r, c2[1]) && E.val(w.c, 'crewcoin_dc') === '4', 'a step is applied once: ' + c2[0], r);
  });
  // vault upgrades give room; cash +4; skip the tithe; half; none
  w = walk(2, '2 0 0 0 0 2 3', (c) => { E.attr(c, 'upgrade_vault_check_1', '1'); });
  // base = 3 + 3*2 = 9; cash -> 13; tithe 3
  o = E.run('!bitdcrew seized cash --c ' + w.c + ' --idx ' + w.n, pat);
  ok(has(o, /Seized load of cash: \+4 Coin/) && has(o, /Earned from the score: 13 Coin/) && has(o, /1 Coin for every 4 Coin earned: 3 Coin/), 'cash: +4 Coin, earned 13, tithe 3', o);
  o = E.run('!bitdcrew tithe skip --c ' + w.c + ' --idx ' + w.n, pat);
  ok(has(o, /Tithe not paid/) && has(o, /13 Coin to deposit/) && has(o, /room for 12 more/), 'tithe skipped: all 13 to deposit, vault gives room for 12', o);
  E.run('!bitdcrew deposit half --c ' + w.c + ' --idx ' + w.n, pat);
  ok(E.val(w.c, 'crewcoin_dc') === '6' && /Elsewhere \(PC stashes or a bank\): 7 Coin/.test(E.out[0].text), 'half of 13 = 6 to the crew, 7 elsewhere', [E.val(w.c, 'crewcoin_dc'), E.out[0].text]);
  w = walk(2, '2 0 0 0 0 0 2', (c) => { E.attr(c, 'upgrade_vault_check_1', '1'); E.attr(c, 'upgrade_vault_check_2', '1'); E.attr(c, 'crewcoin_dc', '20'); });
  E.run('!bitdcrew seized none --c ' + w.c + ' --idx ' + w.n, pat); E.run('!bitdcrew tithe pay --c ' + w.c + ' --idx ' + w.n, pat);
  o = E.run('!bitdcrew deposit all --c ' + w.c + ' --idx ' + w.n, pat);
  ok(E.val(w.c, 'crewcoin_dc') === '22' && has(o, /To the crew: 2 Coin \(crew now holds 22\)/) && !has(o, /had room for only/), 'two vaults (24 room): 2 Coin deposited on top of 20', o);
  w = walk(2, '2 0 0 0 0 0 5', (c) => { E.attr(c, 'upgrade_vault_check_1', '1'); E.attr(c, 'upgrade_vault_check_2', '1'); E.attr(c, 'crewcoin_dc', '23'); });
  E.run('!bitdcrew seized none --c ' + w.c + ' --idx ' + w.n, pat); E.run('!bitdcrew tithe skip --c ' + w.c + ' --idx ' + w.n, pat);
  E.run('!bitdcrew deposit all --c ' + w.c + ' --idx ' + w.n, pat);
  ok(E.val(w.c, 'crewcoin_dc') === '24', 'the track never goes past 24', E.val(w.c, 'crewcoin_dc'));
  w = walk(2, '2 0 0 0 0 0 4');
  E.run('!bitdcrew seized none --c ' + w.c + ' --idx ' + w.n, pat); E.run('!bitdcrew tithe pay --c ' + w.c + ' --idx ' + w.n, pat);
  E.run('!bitdcrew deposit none --c ' + w.c + ' --idx ' + w.n, pat);
  ok(E.val(w.c, 'crewcoin_dc') === undefined && /To the crew: 0 Coin/.test(E.out[0].text) && /Elsewhere \(PC stashes or a bank\): 3 Coin/.test(E.out[0].text), 'deposit none: nothing to the crew', E.out[0].text);
  // fencing valuables adds Heat: 1 per 4 Coin of value
  [['fence2', 2, 0], ['fence4', 4, 1], ['fence6', 6, 1], ['fence8', 8, 2]].forEach(f2 => {
    const x = walk(1, '0 0 0 0 0 0 1'); const h0 = getH(x.c);
    const r = E.run('!bitdcrew seized ' + f2[0] + ' --c ' + x.c + ' --idx ' + x.n, pat);
    ok(getH(x.c) === h0 + f2[2] && has(r, new RegExp('Fenced valuables: \\+' + f2[1] + ' Coin')) && has(r, new RegExp('Earned from the score: ' + (1 + f2[1]) + ' Coin')), f2[0] + ': +' + f2[1] + ' Coin and +' + f2[2] + ' Heat', r);
  });
  function getH(c) { return parseInt(E.val(c, 'heat'), 10); }
  // fencing can fill Heat
  w = walk(0, '0 0 0 0 0 0 1', (c) => { E.attr(c, 'heat', 8); });
  // tier 0 with base 0: total 0 -> heat stays 8; then fence8 adds 2 -> fills
  o = E.run('!bitdcrew seized fence8 --c ' + w.c + ' --idx ' + w.n, pat);
  ok(E.val(w.c, 'wanted') === '1' && E.val(w.c, 'heat') === '1' && has(o, /Wanted level \+1/), 'fencing that fills Heat: Wanted +1', [E.val(w.c, 'heat'), E.val(w.c, 'wanted')]);
  // Tier 3 or higher: no tithe, straight to the deposit
  w = walk(3, '2 0 0 0 0 1 2');
  o = E.run('!bitdcrew seized none --c ' + w.c + ' --idx ' + w.n, pat);
  ok(!has(o, /Tithe/) && has(o, /deposit all --c/) && has(o, /Earned from the score: 5 Coin/), 'Tier 3: no tithe, deposit buttons straight away', o);
  o = E.run('!bitdcrew tithe pay --c ' + w.c + ' --idx ' + w.n, pat); ok(has(o, /Already done/), 'no tithe step to take at Tier 3', o);
  E.run('!bitdcrew deposit all --c ' + w.c + ' --idx ' + w.n, pat); ok(E.val(w.c, 'crewcoin_dc') === '4', 'Tier 3 deposit uses the full 5 Coin up to room', E.val(w.c, 'crewcoin_dc'));
  // a tithe that rounds to nothing
  w = walk(2, '0 0 0 0 0 0 1'); o = E.run('!bitdcrew seized none --c ' + w.c + ' --idx ' + w.n, pat);
  ok(has(o, /Earned from the score: 1 Coin/) && !has(o, /Tithe:/) && has(o, /deposit all/), 'earned 1: tithe floor(1/4) = 0, no tithe step', o);
  // order and bad ids
  w = walk(2, '2 0 0 0 0 1 4');
  o = E.run('!bitdcrew tithe pay --c ' + w.c + ' --idx ' + w.n, pat); ok(has(o, /pick the seized assets step first/), 'tithe before seized assets is refused', o);
  o = E.run('!bitdcrew deposit all --c ' + w.c + ' --idx ' + w.n, pat); ok(has(o, /earlier steps first/), 'deposit before the earlier steps is refused', o);
  o = E.run('!bitdcrew seized none --c ' + w.c + ' --idx ' + w.n, pat); ok(has(o, /Earned from the score: 7 Coin/), 'the refused steps did not use up the later ones', o);
  o = E.run('!bitdcrew seized none --c ' + w.c + ' --idx nope', pat); ok(has(o, /no longer available/), 'unknown walk-through id', o);
  o = E.run('!bitdcrew seized none --c ' + w.c, pat); ok(has(o, /no longer available/), 'missing walk-through id', o);
  const other = mk('Other', 2); o = E.run('!bitdcrew seized none --c ' + other + ' --idx ' + w.n, pat); ok(has(o, /no longer available/), 'a walk-through id from another crew is refused', o);
  o = E.run('!bitdcrew seized bogus --c ' + w.c + ' --idx ' + w.n, pat); ok(has(o, /unknown seized-assets choice/), 'bad seized choice', o);
  o = E.run('!bitdcrew seized none --c ' + w.c + ' --idx ' + w.n, quinn); ok(has(o, /only use this on crews you control/), 'a non-controller cannot use the walk-through buttons');
  // the walk-through survives a script restart (it lives in state)
  w = walk(2, '2 0 0 0 0 1 4'); ok(Object.keys(E.env.state.BitDCrewTAM.flows).length >= 1 && E.env.state.BitDTAM === undefined, 'walk-through state is kept under the crew state key only');
  for (let i = 0; i < 50; i++) { walk(2, '2 0 0 0 0 1 4'); }
  ok(Object.keys(E.env.state.BitDCrewTAM.flows).length <= 40, 'old walk-throughs are dropped (40 kept)', Object.keys(E.env.state.BitDCrewTAM.flows).length);
  // the bank reminder only when the crew is wanted
  w = walk(2, '2 0 0 0 0 1 4', (c) => { E.attr(c, 'wanted', '1'); });
  E.run('!bitdcrew seized none --c ' + w.c + ' --idx ' + w.n, pat); E.run('!bitdcrew tithe pay --c ' + w.c + ' --idx ' + w.n, pat);
  E.run('!bitdcrew deposit all --c ' + w.c + ' --idx ' + w.n, pat); ok(/wanted levels, so it cannot reach any bank funds/.test(E.out[0].text), 'bank reminder when wanted');
  w = walk(2, '2 0 0 0 0 1 4');
  E.run('!bitdcrew seized none --c ' + w.c + ' --idx ' + w.n, pat); E.run('!bitdcrew tithe pay --c ' + w.c + ' --idx ' + w.n, pat);
  E.run('!bitdcrew deposit all --c ' + w.c + ' --idx ' + w.n, pat); ok(!/bank funds/.test(E.out[0].text), 'no bank reminder when not wanted');
}

// ---------------------------------------------------------------- T9 Adjust
{
  const { E, gm, pat, quinn } = table();
  const a = E.crew('Bravos', pat), ta = E.token(a);
  const run = (code) => E.run('!bitdcrew adj ' + code, pat, ta);
  let o;
  E.attr(a, 'heat', 8); o = run('heat+1');
  ok(E.val(a, 'heat') === '0' && E.val(a, 'wanted') === '1' && has(o, /Heat filled/) && has(o, /Wanted level \+1/), 'Heat +1 at 8 fills the track: Wanted +1', o);
  o = run('heat-1'); ok(has(o, /Already at the minimum/) && E.val(a, 'heat') === '0', 'Heat -1 floors at 0', o);
  run('heat+1'); run('heat+1'); run('heat-1'); ok(E.val(a, 'heat') === '1', 'Heat +1, +1, -1');
  // Wanted
  E.attr(a, 'wanted', 3); run('wanted+1'); o = run('wanted+1'); ok(E.val(a, 'wanted') === '4' && has(o, /Already at the maximum/), 'Wanted stops at 4', o);
  E.attr(a, 'wanted', 0); o = run('wanted-1'); ok(E.val(a, 'wanted') === '0' && has(o, /minimum/), 'Wanted floors at 0');
  E.attr(a, 'setting_wanted_5th', '1'); E.attr(a, 'wantedDC', 4); run('wanted+1'); o = run('wanted+1');
  ok(E.val(a, 'wantedDC') === '5' && E.val(a, 'wanted') === '0' && has(o, /maximum/), '5th box on: the 5-box track, up to 5', [E.val(a, 'wantedDC'), E.val(a, 'wanted')]);
  E.attr(a, 'setting_wanted_5th', '0');
  // Incarceration
  E.attr(a, 'wanted', 3); E.attr(a, 'heat', 7); o = run('incarc');
  ok(E.val(a, 'wanted') === '2' && E.val(a, 'heat') === '0' && has(o, /Wanted 3 to 2, Heat cleared/), 'Incarceration: Wanted -1, Heat cleared', o);
  E.attr(a, 'wanted', 0); E.attr(a, 'heat', 4); o = run('incarc'); ok(E.val(a, 'wanted') === '0' && E.val(a, 'heat') === '0' && has(o, /already 0/), 'Incarceration at Wanted 0: stays 0, Heat cleared', o);
  // Rep, Turf, Tier
  E.attr(a, 'rep', 11); run('rep+1'); o = run('rep+1'); ok(E.val(a, 'rep') === '12' && has(o, /maximum/), 'Rep stops at 12');
  E.attr(a, 'rep', 0); o = run('rep-1'); ok(E.val(a, 'rep') === '0', 'Rep floors at 0');
  E.attr(a, 'turf', 5); run('turf+1'); o = run('turf+1'); ok(E.val(a, 'turf') === '6' && has(o, /maximum/), 'Turf stops at 6');
  run('turf-1'); ok(E.val(a, 'turf') === '5', 'Turf -1');
  E.attr(a, 'crew_tier', 3); run('tier+1'); o = run('tier+1'); ok(E.val(a, 'crew_tier') === '4' && has(o, /maximum/), 'Tier stops at 4');
  E.attr(a, 'crew_tier', 0); o = run('tier-1'); ok(E.val(a, 'crew_tier') === '0', 'Tier floors at 0');
  // Coin: the track that matches the module
  E.attr(a, 'crewcoin', 14); run('coin+1'); run('coin+2'); o = run('coin+4');
  ok(E.val(a, 'crewcoin') === '16' && has(o, /maximum/) && E.val(a, 'crewcoin_dc') === undefined, 'standard coin track stops at 16, the Deep Cuts track is not written', [E.val(a, 'crewcoin'), E.val(a, 'crewcoin_dc')]);
  run('coin-4'); run('coin-2'); run('coin-1'); ok(E.val(a, 'crewcoin') === '9', 'coin -4, -2, -1');
  E.attr(a, 'crewcoin', 1); o = run('coin-4'); ok(E.val(a, 'crewcoin') === '0', 'coin floors at 0');
  const b = E.crew('Assassins', pat), tb = E.token(b); E.attr(b, 'setting_dc_downtime', '1'); E.attr(b, 'crewcoin_dc', 22);
  E.run('!bitdcrew adj coin+1', pat, tb); E.run('!bitdcrew adj coin+2', pat, tb); o = E.run('!bitdcrew adj coin+1', pat, tb);
  ok(E.val(b, 'crewcoin_dc') === '24' && has(o, /maximum/) && E.val(b, 'crewcoin') === undefined, 'Downtime on: Deep Cuts coin track to 24, standard track not written', [E.val(b, 'crewcoin_dc'), E.val(b, 'crewcoin')]);
  // Hold
  run('hold-weak'); ok(E.val(a, 'hold') === 'weak', 'hold set weak by hand'); run('hold-strong'); ok(E.val(a, 'hold') === 'strong', 'hold set strong by hand');
  o = run('holdassess'); ok(has(o, /Downtime module is off/) && E.val(a, 'hold') === 'strong', 'Assess hold refused with Downtime off', o);
  E.attr(b, 'turf', 1); E.attr(b, 'crew_tier', 2);
  o = E.run('!bitdcrew adj holdassess', pat, tb); ok(E.val(b, 'hold') === 'weak' && has(o, /Hold weak/), 'Assess hold: turf 1 < Tier 2 = weak', o);
  E.attr(b, 'turf', 2); E.run('!bitdcrew adj holdassess', pat, tb); ok(E.val(b, 'hold') === 'strong', 'Assess hold: turf 2 = Tier 2 = strong');
  E.attr(b, 'turf', 3); E.run('!bitdcrew adj holdassess', pat, tb); ok(E.val(b, 'hold') === 'strong', 'Assess hold: turf above Tier = strong');
  E.attr(b, 'crew_tier', 0); E.attr(b, 'turf', 0); E.run('!bitdcrew adj holdassess', pat, tb); ok(E.val(b, 'hold') === 'strong', 'Assess hold: Tier 0 with no turf = strong');
  // Crew XP, standard
  const c = E.crew('Cult', pat), tc = E.token(c);
  E.attr(c, 'crew_xp', 8); E.run('!bitdcrew adj xp+1', pat, tc); ok(E.val(c, 'crew_xp') === '9', 'crew xp +1');
  o = E.run('!bitdcrew adj xp+1', pat, tc);
  ok(E.val(c, 'crew_xp') === '10' && has(o, /Crew advancement tracker full/) && has(o, /new special ability or mark two crew upgrade boxes/) && has(o, /stash equal to the crew Tier\+2/) && has(o, /xpclear --c/), 'tracker full, both modules off: book reminder with a clear button', o);
  o = E.run('!bitdcrew adj xp+1', pat, tc); ok(E.val(c, 'crew_xp') === '10' && has(o, /Already at the maximum/) && !has(o, /Crew advancement tracker full/), 'xp stops at 10');
  o = E.run('!bitdcrew adj xpclear --c ' + c, pat); ok(E.val(c, 'crew_xp') === '0', 'tracker cleared by the button', o);
  // Downtime on, Advancement off: no reminder (upgrades cost Coin there, so the core text would be wrong)
  const d = E.crew('Hawkers', pat), td = E.token(d); E.attr(d, 'setting_dc_downtime', '1'); E.attr(d, 'crew_xp', 9);
  o = E.run('!bitdcrew adj xp+1', pat, td); ok(E.val(d, 'crew_xp') === '10' && !has(o, /Crew advancement tracker full/), 'Downtime on: no core advancement reminder', o);
  // Crew XP, Advancement clocks
  const e = E.crew('Shadows', pat), te = E.token(e); E.attr(e, 'setting_dc_advancement', '1');
  o = E.run('!bitdcrew adj xp+1', pat, te)[0];
  ok(E.val(e, 'dc_crew_xpclock_1') === '1' && /clock=1/.test(o) && /clocksize=6/.test(o) && /clockprogress=1/.test(o) && E.val(e, 'crew_xp') === undefined, 'Advancement on: ticks crew clock 1, not crew_xp', o);
  E.attr(e, 'dc_crew_xpclock_1', 6); E.run('!bitdcrew adj xp+1', pat, te); ok(E.val(e, 'dc_crew_xpclock_2') === '1', 'moves to the next clock when one is full');
  E.attr(e, 'dc_xp_clocksize', 4); ['1', '2', '3', '4'].forEach(i => E.attr(e, 'dc_crew_xpclock_' + i, 4));
  o = E.run('!bitdcrew adj xp+1', pat, te); ok(has(o, /All four crew advancement clocks are full/), 'all clocks full', o);
  // Debt clock
  o = E.run('!bitdcrew adj debt+1', pat, tc); ok(has(o, /Downtime module is off/) && E.val(c, 'crew_debt_dc') === undefined, 'debt refused without Downtime', o);
  o = E.run('!bitdcrew adj debt+1', pat, td)[0]; ok(E.val(d, 'crew_debt_dc') === '1' && /clock=1/.test(o) && /clocksize=4/.test(o) && /\^\{debt\}/.test(o), 'debt clock with Downtime', o);
  E.attr(d, 'crew_debt_dc', 4); o = E.run('!bitdcrew adj debt+1', pat, td); ok(has(o, /Already full/), 'debt clock full');
  E.run('!bitdcrew adj debt-1', pat, td); ok(E.val(d, 'crew_debt_dc') === '3', 'debt -1');
  // Reduce Heat (Deep Cuts)
  const f = E.crew('Smugglers', pat), tf = E.token(f); E.attr(f, 'setting_dc_downtime', '1'); E.attr(f, 'heat', 5); E.attr(f, 'crewcoin_dc', 3); E.attr(f, 'rep', 2);
  o = E.run('!bitdcrew adj rh-coin', pat, tf); ok(E.val(f, 'heat') === '4' && E.val(f, 'crewcoin_dc') === '2' && E.val(f, 'crewcoin') === undefined && has(o, /Spent 1 Coin/), 'Reduce Heat by spending 1 Coin', o);
  o = E.run('!bitdcrew adj rh-rep', pat, tf); ok(E.val(f, 'heat') === '3' && E.val(f, 'rep') === '1' && has(o, /Spent 1 Rep/), 'Reduce Heat by spending 1 Rep', o);
  E.attr(f, 'crewcoin_dc', 0); o = E.run('!bitdcrew adj rh-coin', pat, tf); ok(E.val(f, 'heat') === '3' && has(o, /no Coin to spend/), 'no Coin: refused', o);
  E.attr(f, 'rep', 0); o = E.run('!bitdcrew adj rh-rep', pat, tf); ok(E.val(f, 'heat') === '3' && has(o, /no Rep to spend/), 'no Rep: refused', o);
  E.attr(f, 'heat', 0); E.attr(f, 'crewcoin_dc', 3); o = E.run('!bitdcrew adj rh-coin', pat, tf); ok(E.val(f, 'crewcoin_dc') === '3' && has(o, /no Heat to reduce/), 'no Heat: Coin is not spent', o);
  o = run('rh-coin'); ok(has(o, /Deep Cuts Downtime rule/) && E.val(a, 'crewcoin') === '0', 'Reduce Heat refused with Downtime off', o);
  // Heat +1 with Downtime on carries the xp button
  E.attr(f, 'heat', 8); o = E.run('!bitdcrew adj heat+1', pat, tf); ok(has(o, /Mark crew XP/) && has(o, /Bluecoats/), 'Downtime on: Heat +1 that fills shows the Deep Cuts text', o);
  o = run('bogus'); ok(has(o, /unknown adjustment/), 'unknown adjustment', o);
  o = E.run('!bitdcrew adj heat+1', quinn, ta); ok(has(o, /only use this on crews you control/), 'adjust refused for a non-controller');
}

// ---------------------------------------------------------------- T10 abilities menu
{
  const { E, pat } = table();
  const a = E.crew('Assassins', pat), ta = E.token(a);
  E.attr(a, 'repeating_crewability_-RowA_name', 'Deadly'); E.attr(a, 'repeating_crewability_-RowA_check', 1);
  E.attr(a, 'repeating_crewability_-Row_B_name', "Crow's (veil] bracket"); E.attr(a, 'repeating_crewability_-Row_B_check', 1);
  E.attr(a, 'repeating_crewability_-RowC_name', '   '); E.attr(a, 'repeating_crewability_-RowC_check', 1);
  E.attr(a, 'repeating_crewability_-RowD_name', 'Veteran'); E.attr(a, 'repeating_crewability_-RowD_check', 0);
  E.attr(a, 'repeating_crewability_-RowE_name', 'Patron');
  E.attr(a, '_reporder_repeating_crewability', '-Row_B,-RowA,-RowC,-RowD,-RowE');
  const o = E.run('!bitdcrew abilities', pat, ta)[0];
  ok(o.indexOf('Crow') < o.indexOf('Deadly') && /repeating_crewability_-Row_B_Show\)/.test(o) && /repeating_crewability_-RowA_Show\)/.test(o) && /\^\{special_ability\}/.test(o), 'menu: sheet order, ids with underscores, type', o);
  ok(!/RowC/.test(o) && !/Veteran/.test(o) && !/Patron/.test(o), 'unticked and blank rows are not listed', o);
  ok(new RegExp('\\[Deadly\\]\\(~' + a + '\\|repeating_crewability_-RowA_Show\\)').test(o) && !/\[Crow's \(veil\]/.test(o) && /\[Crow's veil bracket\]/.test(o), 'native Show button, brackets stripped from the label', o);
  const b = E.crew('Hawkers', pat), tb = E.token(b); E.attr(b, 'repeating_crewability_-R1_name', 'Patron');
  ok(has(E.run('!bitdcrew abilities', pat, tb), /No crew abilities are ticked/), 'only unticked abilities: hint message');
  const c = E.crew('Cult', pat), tc = E.token(c); ok(has(E.run('!bitdcrew abilities', pat, tc), /No crew abilities are ticked/), 'no abilities: hint message');
}

// ---------------------------------------------------------------- T11 clocks
{
  const { E, pat, quinn } = table();
  const a = E.crew('Shadows', pat), ta = E.token(a);
  E.attr(a, 'repeating_crewclock_-C1_name', 'Rival crew'); E.attr(a, 'repeating_crewclock_-C1_size', 6); E.attr(a, 'repeating_crewclock_-C1_progress', 2);
  E.attr(a, 'repeating_crewclock_-C2_name', 'Safehouse (new)'); E.attr(a, 'repeating_crewclock_-C2_size', '');
  E.attr(a, 'repeating_crewclock_-C3_name', '  ');
  let o = E.run('!bitdcrew clocks', pat, ta)[0];
  ok(/Rival crew 2\/6/.test(o) && /Safehouse new 0\/4/.test(o) && !/-C3/.test(o), 'menu lists named clocks, size defaults to 4, blank rows skipped', o);
  ok(new RegExp('\\[-1\\]\\(!bitdcrew clock --c ' + a + ' --row -C1 --n -1\\)').test(o) && new RegExp('\\[\\+1\\]\\(!bitdcrew clock --c ' + a + ' --row -C1 --n 1\\)').test(o) && new RegExp('\\[Show\\]\\(~' + a + '\\|repeating_crewclock_-C1_Show\\)').test(o), 'tick buttons and the native Show button', o);
  o = E.run('!bitdcrew clock --c ' + a + ' --row -C1 --n 1', pat)[0];
  ok(E.val(a, 'repeating_crewclock_-C1_progress') === '3' && /clock=1/.test(o) && /clocksize=6/.test(o) && /clockprogress=3/.test(o) && /title=Rival crew/.test(o), 'clock +1: progress and the sheet clock card', o);
  E.run('!bitdcrew clock --c ' + a + ' --row -C1 --n 1', pat); E.run('!bitdcrew clock --c ' + a + ' --row -C1 --n 1', pat); E.run('!bitdcrew clock --c ' + a + ' --row -C1 --n 1', pat);
  o = E.run('!bitdcrew clock --c ' + a + ' --row -C1 --n 1', pat); ok(E.val(a, 'repeating_crewclock_-C1_progress') === '6' && has(o, /Already full/), 'clock stops at its size');
  o = E.run('!bitdcrew clock --c ' + a + ' --row -C2 --n -1', pat); ok(has(o, /Already empty/) && E.val(a, 'repeating_crewclock_-C2_progress') === undefined, 'clock stops at 0');
  E.run('!bitdcrew clock --c ' + a + ' --row -C2 --n 1', pat); ok(E.val(a, 'repeating_crewclock_-C2_progress') === '1', 'a clock with no progress attribute yet: created');
  o = E.run('!bitdcrew clock --c ' + a + ' --row -Gone --n 1', pat); ok(has(o, /no longer on the sheet/), 'missing clock reported', o);
  o = E.run('!bitdcrew clock --c ' + a + ' --row -C1 --n 0', pat); ok(has(o, /pick -1 or \+1/), 'zero step refused');
  o = E.run('!bitdcrew clock --c ' + a + ' --row -C1 --n 1', quinn); ok(has(o, /only use this on crews you control/), 'clock refused for a non-controller');
  const b = E.crew('Cult', pat), tb = E.token(b); ok(has(E.run('!bitdcrew clocks', pat, tb), /No crew clocks are named/), 'no clocks: hint');
}

// ---------------------------------------------------------------- T12 status
{
  const { E, pat } = table();
  const a = E.crew('Bravos', pat), ta = E.token(a);
  E.attr(a, 'heat', 5); E.attr(a, 'wanted', 2); E.attr(a, 'rep', 7); E.attr(a, 'turf', 2); E.attr(a, 'crew_tier', 2); E.attr(a, 'hold', 'weak'); E.attr(a, 'crewcoin', 6); E.attr(a, 'crew_xp', 3);
  E.attr(a, 'upgrade_vault_check_1', '1'); E.attr(a, 'claim_1_name', 'Turf'); E.attr(a, 'claim_1_check', '1'); E.attr(a, 'claim_2_name', 'claim_turf'); E.attr(a, 'claim_2_check', '1');
  E.attr(a, 'repeating_crewclock_-C1_name', 'Rival crew'); E.attr(a, 'repeating_crewclock_-C1_size', 6); E.attr(a, 'repeating_crewclock_-C1_progress', 2);
  E.attr(a, 'cohort1_name', 'Thugs'); E.attr(a, 'cohort1_type', 'gang');
  let o = E.run('!bitdcrew status', pat, ta)[0];
  ok(/Heat .{5}.{4} 5\/9/.test(o) && /Wanted .{2}.{2} 2\/4/.test(o) && /Rep 7\/12, Turf 2\/6, Tier 2\/4/.test(o) && /Hold weak\./.test(o) && /Coin 6 \(the crew can hold 8\)/.test(o) && /Crew XP 3\/10/.test(o) &&
     /Clock: Rival crew 2\/6/.test(o) && /Cohort: Thugs \(gang, quality 2\)/.test(o) && !/Debt/.test(o) && !/Heat is 6 or more/.test(o) && !/Assess hold/.test(o) && !/Note:/.test(o), 'core status lines', o);
  E.attr(a, 'claim_3_name', 'Turf'); E.attr(a, 'claim_3_check', '1');
  o = E.run('!bitdcrew status', pat, ta)[0]; ok(/Note: 2 turf boxes are marked but 3 Turf claims are ticked/.test(o), 'turf boxes and ticked Turf claims differ: noted', o);
  const b = E.crew('Assassins', pat), tb = E.token(b);
  ['setting_dc_downtime', 'setting_dc_advancement'].forEach(k => E.attr(b, k, '1'));
  E.attr(b, 'heat', 6); E.attr(b, 'turf', 1); E.attr(b, 'crew_tier', 2); E.attr(b, 'hold', 'strong'); E.attr(b, 'crewcoin_dc', 9); E.attr(b, 'crew_debt_dc', 2);
  E.attr(b, 'dc_crew_xpclock_1', 3); E.attr(b, 'dc_crew_xpclock_2', 6); E.attr(b, 'wanted', 3);
  E.attr(b, 'repeating_crewability_-S_name', 'Slippery'); E.attr(b, 'repeating_crewability_-S_check', '1');
  o = E.run('!bitdcrew status', pat, tb)[0];
  ok(/Wanted .{3}.{1} 3\/4 \(Slippery: effective 2\)/.test(o) && /Heat is 6 or more: the GM brings an entanglement into play/.test(o) && /Hold strong\. By the Deep Cuts rule \(turf 1, Tier 2\) it is weak\./.test(o) &&
     /adj holdassess --c/.test(o) && /Coin 9 \(the crew can hold 4\)/.test(o) && /Crew advancement clocks 3\/6  6\/6  0\/6  0\/6/.test(o) && /Debt clock .{2}.{2} 2\/4/.test(o) && !/Crew XP/.test(o), 'Downtime status lines', o);
  E.attr(b, 'hold', 'weak'); o = E.run('!bitdcrew status', pat, tb)[0]; ok(/it is weak\./.test(o) && !/Assess hold/.test(o), 'no Assess hold button when hold already follows the rule', o);
  const c = E.crew('Cult', pat), tc = E.token(c); E.attr(c, 'setting_wanted_5th', '1'); E.attr(c, 'wantedDC', 4); E.attr(c, 'wanted', 1);
  o = E.run('!bitdcrew status', pat, tc)[0]; ok(/Wanted \(5-box track\) .* 4\/5/.test(o), '5th box on: status shows the 5-box track', o);
  E.attr(c, 'setting_wanted_5th', '0'); o = E.run('!bitdcrew status', pat, tc)[0]; ok(/Wanted .* 1\/4/.test(o) && !/5-box/.test(o), '5th box off: the 4-box track');
  // vault room: standard 4/8/16, Deep Cuts 4/12/24
  const d = E.crew('Hawkers', pat), td = E.token(d);
  const room = (tid) => /can hold (\d+)/.exec(E.run('!bitdcrew status', pat, tid)[0])[1];
  ok(room(td) === '4', 'standard, no vault: 4'); E.attr(d, 'upgrade_vault_check_1', '1'); ok(room(td) === '8', 'standard, vault 1: 8'); E.attr(d, 'upgrade_vault_check_2', '1'); ok(room(td) === '16', 'standard, both vaults: 16');
  E.attr(d, 'setting_dc_downtime', '1'); ok(room(td) === '24', 'Deep Cuts, both vaults: 24'); E.attr(d, 'upgrade_vault_check_2', '0'); ok(room(td) === '12', 'Deep Cuts, vault 1: 12');
}

// ---------------------------------------------------------------- v0.2.0 helpers
let rowN = 0;
const tick = (E, cid, name, on) => { const r = '-T' + (++rowN); E.attr(cid, 'repeating_crewability_' + r + '_name', name); E.attr(cid, 'repeating_crewability_' + r + '_check', on === false ? '0' : '1'); };
const dtCrew = (E, owner, name, tier) => { const c = E.crew(name, owner); E.attr(c, 'setting_dc_downtime', '1'); E.attr(c, 'crew_tier', tier === undefined ? 2 : tier); return c; };
const ledger = (E, cid) => E.env.state.BitDCrewTAM.downtime[cid];
const idxOf = (texts) => { const m = /--idx (\S+?)\)/.exec(texts.join(' ')); return m ? m[1] : null; };

// ---------------------------------------------------------------- T15 party probe and the Payoff PC count
{
  const { E, gm, pat, quinn } = table();
  const a = dtCrew(E, pat, 'Assassins', 2), ta = E.token(a);
  const p1 = E.char('Ayla', pat), p2 = E.char('Bo', pat), p3 = E.char('Cy', pat), fac = E.char('Factions', ''); E.attr(fac, 'sheet_type', 'faction');
  let o = E.run('!bitdcrew party', gm);
  ok(has(o, /Characters checked: 5\. Party members found: 0/) && has(o, /None found/) && has(o, /No character has any tags the script can read/), 'party probe with nobody marked', o);
  E.party(p1, 'array'); E.party(p2, 'string'); E.party(p3, 'json'); E.party(a, 'array'); E.party(fac, 'array');
  o = E.run('!bitdcrew party', gm);
  ok(has(o, /Party members found: 5 \(3 player characters, 1 crew sheet\)/) && has(o, /Party member: Ayla \(character\)/) && has(o, /Party member: Assassins \(crew\)/) && has(o, /Party member: Factions \(faction\)/), 'probe lists array, text and JSON-text flags, with sheet types', o);
  ok(has(o, /Tags the script can read: .*_roll20_internal_party_tag_/), 'probe shows the raw tags it can read', o);
  E.rawTags(p3, ['some_other_tag']); o = E.run('!bitdcrew party', gm);
  ok(has(o, /Party members found: 4 \(2 player characters/) && has(o, /Cy: "?some_other_tag/), 'other tags are not party flags but are shown', o);
  o = E.run('!bitdcrew party', pat); ok(has(o, /only the GM can run the party check/), 'the party probe is GM only', o);
  // PC count from the party: player characters only (not crews or factions), at click time
  o = E.run('!bitdcrew score 2 0 0 0 0 1 party', pat, ta);
  ok(has(o, /Payoff: 1 Coin per PC \(2, the party\) plus 3 x the target's Tier \(1\) = 5 Coin\./), 'party count: 2 player characters, crew and faction not counted', o.map(t => t.slice(0, 80)));
  const n1 = idxOf(o); E.run('!bitdcrew seized none --c ' + a + ' --idx ' + n1, pat);
  ok(has(E.out.map(x => x.text), /Earned from the score: 5 Coin/), 'the party count flows into the payoff', E.out.map(x => x.text.slice(0, 60)));
  E.party(p3, 'array'); E.attr(a, 'heat', 0);
  o = E.run('!bitdcrew score 2 0 0 0 0 1 PARTY', pat, ta); ok(has(o, /\(3, the party\)/), 'the count is read each time, and "party" is not case sensitive', o.map(t => t.slice(0, 80)));
  o = E.run('!bitdcrew score 2 0 0 0 0 1 4', pat, ta); ok(has(o, /Payoff: 1 Coin per PC \(4\) plus/) && !has(o, /the party/), 'a typed count still works, because not every PC is on every score', o.map(t => t.slice(0, 80)));
  // nobody marked: nothing is applied and no Downtime is started
  const b = dtCrew(E, pat, 'Hawkers', 2), tb = E.token(b);
  E.rawTags(p1, []); E.rawTags(p2, undefined); E.rawTags(p3, ''); E.rawTags(a, []);
  o = E.run('!bitdcrew score 2 0 0 0 0 1 party', pat, tb);
  ok(has(o, /no player characters are marked as Party members/) && has(o, /Nothing was applied/) && E.val(b, 'heat') === undefined && E.val(b, 'rep') === undefined && !ledger(E, b), 'no party: told so, nothing applied, no Downtime started', o);
  // the prompt the token action asks
  E.run('!bitdcrew setup', pat, tb);
  const q = queries(E.abil(b).find(x => x.name === '4. Score').action);
  ok(q.length === 7 && q[6][0] === 'PCs for the Payoff (1 Coin each)' && q[6][1] === 'All party members,party' && q[6].slice(2).join(',') === '1,2,3,4,5,6,7,8', 'the Payoff prompt: Party first, then 1 to 8', q[6]);
  // a stale token action with the old label and numbers still works
  o = E.run('!bitdcrew score 2 0 0 0 0 1 6', pat, tb); ok(has(o, /Payoff: 1 Coin per PC \(6\)/), 'old numeric answers still work without a Rebuild');
  o = E.run('!bitdcrew score 2 0 0 0 0 1 9', pat, tb); ok(has(o, /not valid/), 'a typed count above 8 is still refused');
}

// ---------------------------------------------------------------- T16 debug switch
{
  const { E, gm, pat } = table();
  const a = dtCrew(E, pat, 'Cult', 2), ta = E.token(a);
  E.run('!bitdcrew score 2 0 0 0 0 0 2', pat, ta);
  ok(!E.logs.some(l => /BitDCrew debug/.test(l)), 'debug logging is off by default');
  let o = E.run('!bitdcrew debug on', pat); ok(has(o, /only the GM/) && !E.env.state.BitDCrewTAM.debug, 'debug switch is GM only', o);
  o = E.run('!bitdcrew debug', gm); ok(has(o, /debug logging is off/), 'debug reports its state', o);
  o = E.run('!bitdcrew debug on', gm); ok(has(o, /now on/) && E.env.state.BitDCrewTAM.debug === true, 'debug on', o);
  E.run('!bitdcrew score 2 0 0 0 0 0 2', pat, ta);
  ok(E.logs.some(l => /BitDCrew debug: downtime start/.test(l)) && E.logs.some(l => /BitDCrew debug: gainRep/.test(l)), 'with debug on the ledger and Rep steps are logged', E.logs.filter(l => /debug/.test(l)));
  E.run('!bitdcrew debug off', gm); const n = E.logs.length; E.run('!bitdcrew score 2 0 0 0 0 0 2', pat, ta);
  ok(E.logs.length === n, 'debug off: nothing more is logged');
}

// ---------------------------------------------------------------- T17 Downtime ledger and the Heat and Hold card
{
  const { E, gm, pat, quinn } = table();
  const a = dtCrew(E, pat, 'Smugglers', 2), ta = E.token(a);
  E.attr(a, 'heat', 5); E.attr(a, 'crewcoin_dc', 3); E.attr(a, 'rep', 4); E.attr(a, 'turf', 1);
  const b = E.crew('Bravos', pat), tb = E.token(b);   // core crew
  let o;
  // Downtime off
  ['adj hh', 'hh', 'adj dtstart', 'hhact jpt --idx x'].forEach(v => { const r = E.run('!bitdcrew ' + v, pat, tb); ok(has(r, /Deep Cuts Downtime step|need the Downtime module/) && !ledger(E, b), 'Downtime off: "' + v + '" refused', r); });
  // opening with nothing open starts a Downtime
  o = E.run('!bitdcrew adj hh', pat, ta);
  const L1 = ledger(E, a);
  ok(L1 && L1.ended === false && L1.startHeat === 5 && has(o, /Downtime started/) && has(o, /No Downtime was open/), 'Heat and Hold with no Downtime open starts one, remembering the Heat', o.map(x => x.slice(0, 50)));
  const card = o.find(t => /Heat and Hold/.test(t));
  ok(/Heat .{5}.{4} 5\/9\. Wanted 0\/4\./.test(card) && /Reduce Heat by 1 for each Coin or Rep you spend/.test(card) && /hhact rh-coin --c \S+ --idx \S+\)/.test(card) && /hhact rh-rep/.test(card) &&
     /Hold is strong\. By the Deep Cuts rule \(turf 1, Tier 2\) it is weak\./.test(card) && /hhact hold/.test(card) && /hhact end/.test(card), 'card: Heat, Reduce Heat, Hold line, Assess hold, End Downtime', card);
  ok(!/hhact jpt/.test(card) && !/This Downtime so far/.test(card), 'no Just Passing Through button unless ticked; no log yet');
  ok(idxOf([card]) === L1.id && new RegExp('--c ' + a + ' ').test(card), 'every button carries the crew and the Downtime id');
  // Reduce Heat from the card
  o = E.run('!bitdcrew hhact rh-coin --c ' + a + ' --idx ' + L1.id, pat);
  ok(E.val(a, 'heat') === '4' && E.val(a, 'crewcoin_dc') === '2' && E.val(a, 'crewcoin') === undefined && has(o, /Spent 1 Coin/) && has(o, /This Downtime so far:/) && has(o, /Spent 1 Coin for Heat -1\./), 'Reduce Heat by Coin: Heat -1, Coin -1, logged, card reposted', o.map(x => x.slice(0, 60)));
  o = E.run('!bitdcrew hhact rh-rep --c ' + a + ' --idx ' + L1.id, pat);
  ok(E.val(a, 'heat') === '3' && E.val(a, 'rep') === '3' && has(o, /Spent 1 Rep/), 'Reduce Heat by Rep: Heat -1, Rep -1', o.map(x => x.slice(0, 60)));
  E.attr(a, 'crewcoin_dc', 0); o = E.run('!bitdcrew hhact rh-coin --c ' + a + ' --idx ' + L1.id, pat);
  ok(E.val(a, 'heat') === '3' && has(o, /no Coin to spend/) && L1.log.length === 2, 'no Coin: refused and not logged', o.map(x => x.slice(0, 60)));
  // Just Passing Through: once per Downtime
  tick(E, a, 'Just Passing Through');
  o = E.run('!bitdcrew hh --c ' + a, pat);
  const c2 = o.find(t => /Heat and Hold/.test(t));
  ok(/Just Passing Through: during Downtime, take -1 Heat\./.test(c2) && /hhact jpt/.test(c2) && o.length === 1, 'ticked: the card offers Just Passing Through (the open Downtime is reused)', o.map(x => x.slice(0, 50)));
  o = E.run('!bitdcrew hhact jpt --c ' + a + ' --idx ' + L1.id, pat);
  ok(E.val(a, 'heat') === '2' && L1.used.jpt === true && has(o, /Just Passing Through: Heat -1 \(Heat now 2\)\./) && !has(o, /hhact jpt/), 'Just Passing Through: Heat -1, logged, button gone from the new card', o.map(x => x.slice(0, 60)));
  o = E.run('!bitdcrew hhact jpt --c ' + a + ' --idx ' + L1.id, pat); ok(E.val(a, 'heat') === '2' && has(o, /already used this Downtime/), 'Just Passing Through only once per Downtime', o);
  // assess hold
  o = E.run('!bitdcrew hhact hold --c ' + a + ' --idx ' + L1.id, pat);
  ok(E.val(a, 'hold') === 'weak' && L1.assessed === 'weak' && has(o, /Hold weak/), 'Assess hold from the card sets the hold by the Deep Cuts rule', o.map(x => x.slice(0, 60)));
  // a new Downtime makes the once-per-Downtime ability available again
  o = E.run('!bitdcrew adj dtstart', pat, ta); const L2 = ledger(E, a);
  ok(L2.id !== L1.id && L2.used.jpt === undefined && has(o, /hhact jpt/) && has(o, /Downtime started/), 'start a new Downtime from Adjust: new id, abilities available again', o.map(x => x.slice(0, 50)));
  o = E.run('!bitdcrew hhact rh-rep --c ' + a + ' --idx ' + L1.id, pat); ok(has(o, /no longer open/) && E.val(a, 'rep') === '3', 'a button from the replaced Downtime is refused', o);
  o = E.run('!bitdcrew hhact jpt --c ' + a + ' --idx nope', pat); ok(has(o, /no longer open/), 'an unknown Downtime id is refused', o);
  const other = dtCrew(E, pat, 'Cult', 2); o = E.run('!bitdcrew hhact hold --c ' + other + ' --idx ' + L2.id, pat);
  ok(has(o, /no longer open/) && E.val(other, 'hold') === undefined, 'a Downtime id from another crew is refused', o);
  // Just Passing Through: not ticked, or Heat 0
  const c = dtCrew(E, pat, 'Hawkers', 2), tc = E.token(c); E.attr(c, 'heat', 3);
  E.run('!bitdcrew adj dtstart', pat, tc); const Lc = ledger(E, c);
  o = E.run('!bitdcrew hhact jpt --c ' + c + ' --idx ' + Lc.id, pat); ok(has(o, /not ticked on this sheet/) && E.val(c, 'heat') === '3', 'an unticked Just Passing Through is refused', o);
  tick(E, c, 'Just Passing Through', false); o = E.run('!bitdcrew hhact jpt --c ' + c + ' --idx ' + Lc.id, pat); ok(has(o, /not ticked/), 'a row with the circle empty does not count');
  tick(E, c, 'just passing through'); E.attr(c, 'heat', 0);
  o = E.run('!bitdcrew hh --c ' + c, pat); ok(has(o, /Heat is 0, so there is nothing to reduce\./) && !has(o, /hhact jpt/) && !has(o, /hhact rh-coin/), 'Heat 0: no Reduce Heat or Just Passing Through buttons', o);
  o = E.run('!bitdcrew hhact jpt --c ' + c + ' --idx ' + Lc.id, pat); ok(has(o, /not used/) && !Lc.used.jpt, 'Heat 0: Just Passing Through is not spent', o);
  E.attr(c, 'heat', 2); o = E.run('!bitdcrew hhact jpt --c ' + c + ' --idx ' + Lc.id, pat); ok(E.val(c, 'heat') === '1' && Lc.used.jpt === true, 'it can still be used later, when there is Heat');
  // End Downtime: No Traces and Leverage
  const d = dtCrew(E, pat, 'Assassins', 2), td = E.token(d); tick(E, d, 'No Traces'); E.attr(d, 'rep', 4); E.attr(d, 'heat', 3);
  E.run('!bitdcrew adj dtstart', pat, td); const Ld = ledger(E, d);
  E.out.length = 0; o = E.run('!bitdcrew hhact end --c ' + d + ' --idx ' + Ld.id, pat);
  ok(Ld.ended === true && /^player\|/.test(E.out[0].who) && has(o, /Downtime ended/) && has(o, /Heat went from 3 \(when Heat and Hold opened\) to 3\./) && has(o, /No Traces: Heat is 3, so no Rep this time\./) && E.val(d, 'rep') === '4', 'End Downtime with Heat above 0: no Rep, public summary', o.map(x => x.slice(0, 80)));
  o = E.run('!bitdcrew hhact rh-coin --c ' + d + ' --idx ' + Ld.id, pat); ok(has(o, /Already ended/), 'buttons after End Downtime are refused', o);
  o = E.run('!bitdcrew hh --c ' + d, pat); const Ld2 = ledger(E, d); ok(Ld2.id !== Ld.id && has(o, /No Downtime was open/), 'Heat and Hold after End starts a fresh Downtime', o.map(x => x.slice(0, 50)));
  E.attr(d, 'heat', 0); Ld2.log.push('Just Passing Through: Heat -1 (Heat now 0).');
  E.out.length = 0; o = E.run('!bitdcrew hhact end --c ' + d + ' --idx ' + Ld2.id, pat);
  ok(E.val(d, 'rep') === '5' && has(o, /No Traces: the crew ended Downtime with zero Heat, so \+1 Rep\. Rep now 5\/12\./) && has(o, /Just Passing Through: Heat -1/) && !has(o, /Leverage/), 'End Downtime at Heat 0: No Traces gives +1 Rep, the log is in the summary', o.map(x => x.slice(0, 90)));
  const e = dtCrew(E, pat, 'Smugglers2', 2), te = E.token(e); tick(E, e, 'No Traces'); tick(E, e, 'Leverage'); E.attr(e, 'rep', 11);
  E.run('!bitdcrew adj dtstart', pat, te); o = E.run('!bitdcrew hhact end --c ' + e + ' --idx ' + ledger(E, e).id, pat);
  ok(E.val(e, 'rep') === '12' && has(o, /\+1 Rep \(\+1 more from Leverage\)\. Rep now 12\/12 \(the track is full\)/), 'No Traces and Leverage stack, capped at 12', o);
  const f = dtCrew(E, pat, 'Vigilantes', 2), tf = E.token(f); E.attr(f, 'rep', 3);
  E.run('!bitdcrew adj dtstart', pat, tf); E.run('!bitdcrew hhact end --c ' + f + ' --idx ' + ledger(E, f).id, pat); ok(E.val(f, 'rep') === '3', 'a crew without No Traces gets nothing at End Downtime');
  // a Score starts a Downtime; the next Score replaces it
  const g = dtCrew(E, pat, 'Shadows', 3), tg = E.token(g);
  E.run('!bitdcrew score 2 0 0 0 0 1 3', pat, tg); const Lg = ledger(E, g);
  ok(Lg && Lg.ended === false && Lg.log.length === 0, 'a Deep Cuts Score starts a Downtime');
  E.run('!bitdcrew score 2 0 0 0 0 1 3', pat, tg); ok(ledger(E, g).id !== Lg.id, 'the next Score replaces it');
  // the last Score step offers Heat and Hold, and only while a Downtime is open
  E.attr(g, 'heat', 0);
  let w = E.run('!bitdcrew score 2 0 0 0 0 1 3', pat, tg); const nid = idxOf(w), Lh = ledger(E, g);
  E.run('!bitdcrew seized none --c ' + g + ' --idx ' + nid, pat);
  E.out.length = 0; o = E.run('!bitdcrew deposit all --c ' + g + ' --idx ' + nid, pat);
  ok(E.out.length === 2 && /^\/w /.test(E.out[1].text) && /Heat and Hold/.test(E.out[1].text) && idxOf([E.out[1].text]) === Lh.id && Lh.startHeat !== null, 'after the deposit the Heat and Hold card is whispered with the open Downtime id', E.out.map(x => x.text.slice(0, 40)));
  w = E.run('!bitdcrew score 2 0 0 0 0 1 3', pat, tg); const nid2 = idxOf(w), Li = ledger(E, g);
  E.run('!bitdcrew hhact end --c ' + g + ' --idx ' + Li.id, pat);
  E.run('!bitdcrew seized none --c ' + g + ' --idx ' + nid2, pat); E.out.length = 0; E.run('!bitdcrew deposit all --c ' + g + ' --idx ' + nid2, pat);
  ok(E.out.length === 1, 'no Heat and Hold card when the Downtime was already ended', E.out.map(x => x.text.slice(0, 40)));
  // permissions
  o = E.run('!bitdcrew adj hh', quinn, ta); ok(has(o, /only use this on crews you control/), 'Heat and Hold refused for a non-controller');
  o = E.run('!bitdcrew hhact hold --c ' + a + ' --idx ' + ledger(E, a).id, quinn); ok(has(o, /only use this on crews you control/), 'its buttons are refused for a non-controller');
  o = E.run('!bitdcrew adj dtstart', quinn, ta); ok(has(o, /only use this on crews you control/), 'starting a Downtime is refused for a non-controller');
  o = E.run('!bitdcrew hhact bogus --c ' + a + ' --idx ' + ledger(E, a).id, pat); ok(has(o, /unknown Heat and Hold choice/), 'unknown Heat and Hold choice');
  // Status and the Adjust menu
  o = E.run('!bitdcrew status', pat, ta)[0];
  ok(/Downtime is open\. \[Heat and Hold\]\(!bitdcrew hh --c \S+\)/.test(o) && /Just Passing Through: \+1d to pass yourselves off as ordinary citizens while Heat is 4 or less \(active now\)/.test(o), 'Status: open Downtime link and the Just Passing Through line (Heat 2: active)', o);
  E.attr(a, 'heat', 7); o = E.run('!bitdcrew status', pat, ta)[0]; ok(/not active, Heat is 7/.test(o), 'Status: Just Passing Through not active above Heat 4');
  o = E.run('!bitdcrew status', pat, tb)[0]; ok(!/Downtime is open/.test(o) && !/Just Passing Through/.test(o), 'Status: nothing extra for a crew without the ability or the module');
  E.run('!bitdcrew hhact end --c ' + a + ' --idx ' + ledger(E, a).id, pat); o = E.run('!bitdcrew status', pat, ta)[0]; ok(!/Downtime is open/.test(o), 'Status: no open-Downtime link after End Downtime');
  E.run('!bitdcrew setup', pat, ta); E.run('!bitdcrew setup', pat, tb);
  const adjA = E.abil(a).find(x => x.name === '7. Adjust').action, adjB = E.abil(b).find(x => x.name === '7. Adjust').action;
  ok(!/Heat and Hold|dtstart|rh-coin|rh-rep|holdassess/.test(adjA) && !/Heat and Hold|dtstart|rh-coin|rh-rep|holdassess|debt/.test(adjB), 'Adjust carries no Downtime step for either kind of crew (they moved to 5. Downtime)');
  queries(adjA).forEach(q2 => ok(q2.slice(1).every(p => p.length > 0 && count(p, ',') <= 1), 'Adjust prompt still well formed', q2));
  // boundaries: No Traces needs Heat of exactly 0; Just Passing Through's +1d needs Heat of 4 or less
  const h1 = dtCrew(E, pat, 'Assassins9', 2), th1 = E.token(h1); tick(E, h1, 'No Traces'); E.attr(h1, 'rep', 4); E.attr(h1, 'heat', 1);
  E.run('!bitdcrew adj dtstart', pat, th1); o = E.run('!bitdcrew hhact end --c ' + h1 + ' --idx ' + ledger(E, h1).id, pat);
  ok(E.val(h1, 'rep') === '4' && has(o, /No Traces: Heat is 1, so no Rep this time\./), 'No Traces: Heat 1 at End Downtime earns nothing');
  E.attr(a, 'heat', 4); o = E.run('!bitdcrew status', pat, ta)[0]; ok(/\(active now\)/.test(o), 'Status: Just Passing Through is active at Heat 4');
  E.attr(a, 'heat', 5); o = E.run('!bitdcrew status', pat, ta)[0]; ok(/not active, Heat is 5/.test(o), 'Status: Just Passing Through is not active at Heat 5');
}

// ---------------------------------------------------------------- T18 Leverage
{
  const { E, pat, quinn } = table();
  const a = dtCrew(E, pat, 'Smugglers', 2), ta = E.token(a); tick(E, a, 'Leverage');
  let o = E.run('!bitdcrew score 2 0 0 0 0 1 4', pat, ta);
  ok(E.val(a, 'rep') === '3' && has(o, /Rep \+2 \(1 per 2 Heat\)\. Leverage: \+1 Rep\. Rep now 3\/12\./), 'Leverage: a Rep gain of 2 becomes 3, with a line on the card', o.map(x => x.slice(0, 120)));
  const n = idxOf(o); E.run('!bitdcrew seized none --c ' + a + ' --idx ' + n, pat); E.run('!bitdcrew tithe skip --c ' + a + ' --idx ' + n, pat); E.run('!bitdcrew deposit none --c ' + a + ' --idx ' + n, pat);
  ok(/Heat \+4, Rep \+3\./.test(E.out[0].text), 'the final summary counts the Leverage Rep', E.out[0].text);
  const b = dtCrew(E, pat, 'Smugglers2', 0), tb = E.token(b); tick(E, b, 'Leverage');
  o = E.run('!bitdcrew score 0 0 0 0 0 0 1', pat, tb);
  ok(E.val(b, 'rep') === undefined && has(o, /Rep \+0 /) && !has(o, /Leverage/), 'Leverage adds nothing to a gain of 0', o.map(x => x.slice(0, 120)));
  const c = dtCrew(E, pat, 'Smugglers3', 2), tc = E.token(c); tick(E, c, 'Leverage'); E.attr(c, 'rep', 11);
  o = E.run('!bitdcrew score 2 0 0 0 0 1 4', pat, tc);
  ok(E.val(c, 'rep') === '12' && has(o, /Leverage: \+1 Rep\. Rep now 12\/12 \(the track is full\)/), 'Rep is capped at 12 with Leverage', o.map(x => x.slice(0, 120)));
  const d = dtCrew(E, pat, 'Smugglers4', 2), td = E.token(d); tick(E, d, 'Leverage', false);
  o = E.run('!bitdcrew score 2 0 0 0 0 1 4', pat, td); ok(E.val(d, 'rep') === '2' && !has(o, /Leverage/), 'an unticked Leverage does nothing');
  const e = dtCrew(E, pat, 'Smugglers5', 2), te = E.token(e); tick(E, e, 'leverage'); E.attr(e, 'rep', 1);
  E.run('!bitdcrew adj rep+1', pat, te); ok(E.val(e, 'rep') === '2', 'a manual Adjust Rep +1 is not boosted by Leverage');
  const f = dtCrew(E, pat, 'Assassins', 2), tf = E.token(f); tick(E, f, 'Leverage'); tick(E, f, 'No Traces');
  o = E.run('!bitdcrew score 2 2 2 0 2 1 4', pat, tf);
  ok(E.val(f, 'rep') === '5' && has(o, /Rep \+4 \(1 per 2 Heat\)\. Leverage: \+1 Rep\. Rep now 5\/12\./), 'Leverage and No Traces together: Heat 10 - 1 = 9 gives Rep 4, +1 Leverage', o.map(x => x.slice(0, 140)));
}

// ---------------------------------------------------------------- T19 Misdirection
{
  const { E, pat, quinn } = table();
  const mk = (name, rep) => { const c = dtCrew(E, pat, name, 2); tick(E, c, 'Misdirection'); if (rep !== undefined) E.attr(c, 'rep', rep); return c; };
  const a = mk('Vigilantes', 0), ta = E.token(a);
  let o = E.run('!bitdcrew score 2 2 2 0 2 1 4', pat, ta);
  ok(E.val(a, 'rep') === '5' && has(o, /Misdirection: you may give up half the Rep earned \(2\)/) && has(o, /\[Misdirection: give up 2 Rep\]\(!bitdcrew misdirect --c \S+ --idx \S+\)/), 'Rep +5: Misdirection offers to give up half, rounded down (2)', o.map(x => x.slice(0, 120)));
  const n = idxOf(o);
  o = E.run('!bitdcrew misdirect --c ' + a + ' --idx ' + n, pat);
  ok(E.val(a, 'rep') === '3' && has(o, /Gave up 2 Rep/) && has(o, /Rep is now 3\/12/) && has(o, /Status is not tracked here/), 'the button lowers Rep by 2 and tells you to name the faction', o);
  o = E.run('!bitdcrew misdirect --c ' + a + ' --idx ' + n, pat); ok(E.val(a, 'rep') === '3' && has(o, /Already done/), 'Misdirection once per Score');
  o = E.run('!bitdcrew misdirect --c ' + a + ' --idx ' + n, quinn); ok(has(o, /only use this on crews you control/) && E.val(a, 'rep') === '3', 'refused for a non-controller');
  o = E.run('!bitdcrew misdirect --c ' + a + ' --idx nope', pat); ok(has(o, /no longer available/), 'unknown walk-through id');
  // Leverage counts as Rep gained: 5 + 1 = 6, half is 3
  const b = mk('Vigilantes2', 0), tb = E.token(b); tick(E, b, 'Leverage');
  o = E.run('!bitdcrew score 2 2 2 0 2 1 4', pat, tb); ok(E.val(b, 'rep') === '6' && has(o, /give up half the Rep earned \(3\)/), 'Leverage Rep is part of the Rep earned', o.map(x => x.slice(0, 120)));
  // too little to halve, a (nearly) full track, and an unticked or missing ability
  const c = mk('Vigilantes3', 0), tc = E.token(c); E.attr(c, 'crew_tier', 0);
  o = E.run('!bitdcrew score 2 0 0 0 0 0 1', pat, tc);
  ok(E.val(c, 'rep') === '1' && !has(o, /give up/) && has(o, /Misdirection is not offered: half of the Rep earned \(1\), rounded down, is 0/), 'an earn of 1 has no half to give up, and the card says why', o.map(x => x.slice(0, 160)));
  // B: the offer follows the Rep EARNED (5), not the Rep that fit under 12
  const d = mk('Vigilantes4', 11), td = E.token(d);
  o = E.run('!bitdcrew score 2 2 2 0 2 1 4', pat, td);
  ok(E.val(d, 'rep') === '12' && has(o, /give up half the Rep earned \(2\)/) && has(o, /\[Misdirection: give up 2 Rep\]/), 'Rep 11 and 5 earned: 1 fits, but the offer is still half of 5 (2)', o.map(x => x.slice(0, 160)));
  const nd = idxOf(o); o = E.run('!bitdcrew misdirect --c ' + d + ' --idx ' + nd, pat);
  ok(E.val(d, 'rep') === '10' && has(o, /Gave up 2 Rep/) && has(o, /Rep is now 10\/12/), 'the button takes 2 from the full track', o);
  const d2 = mk('Vigilantes4b', 12), td2 = E.token(d2);
  o = E.run('!bitdcrew score 2 2 2 0 2 1 4', pat, td2);
  ok(E.val(d2, 'rep') === '12' && has(o, /\[Misdirection: give up 2 Rep\]/), 'a track already at 12 still gets the offer (the user\'s live case)', o.map(x => x.slice(0, 160)));
  o = E.run('!bitdcrew misdirect --c ' + d2 + ' --idx ' + idxOf(o), pat); ok(E.val(d2, 'rep') === '10', 'and it costs real Rep, so a full track is no exploit');
  // the user's live Score: Heat 8, Rep 6 + 1 Leverage = 7 earned, half is 3, from a track at 11
  const u = mk('Vigilantes4c', 11), tu = E.token(u); tick(E, u, 'Leverage'); E.attr(u, 'crew_tier', 0);
  o = E.run('!bitdcrew score 2 2 4 0 0 2 2', pat, tu);
  ok(E.val(u, 'rep') === '12' && has(o, /give up half the Rep earned \(3\)/), 'live case: 7 earned, half is 3', o.map(x => x.slice(0, 200)));
  const e = mk('Vigilantes5', 10), te = E.token(e);
  o = E.run('!bitdcrew score 2 2 2 0 2 1 4', pat, te); ok(E.val(e, 'rep') === '12' && has(o, /give up half the Rep earned \(2\)/), 'Rep 10, 5 earned: half is 2', o.map(x => x.slice(0, 120)));
  const f = dtCrew(E, pat, 'Vigilantes6', 2), tf = E.token(f); tick(E, f, 'Misdirection', false);
  o = E.run('!bitdcrew score 2 2 2 0 2 1 4', pat, tf);
  ok(!has(o, /give up/) && has(o, /Misdirection is on the crew sheet but its circle is not ticked/), 'an unticked Misdirection is not offered, and the card says so', o.map(x => x.slice(0, 160)));
  const f2 = dtCrew(E, pat, 'Crew without it', 2), tf2 = E.token(f2);
  o = E.run('!bitdcrew score 2 2 2 0 2 1 4', pat, tf2); ok(!has(o, /Misdirection/), 'a crew with no Misdirection row hears nothing about it', o.map(x => x.slice(0, 160)));
  const g = mk('Vigilantes7', 0), tg = E.token(g); o = E.run('!bitdcrew score 2 2 2 0 2 1 4', pat, tg); const ng = idxOf(o);
  E.attr(g, 'rep', 1); o = E.run('!bitdcrew misdirect --c ' + g + ' --idx ' + ng, pat); ok(E.val(g, 'rep') === '0' && has(o, /Gave up 1 Rep/), 'Rep never goes below 0');
  // the final summary reports Rep earned and what fit
  const sc = mk('Vigilantes9', 10), tsc = E.token(sc); let nsc = idxOf(E.run('!bitdcrew score 2 2 2 0 2 1 4', pat, tsc));
  E.run('!bitdcrew seized none --c ' + sc + ' --idx ' + nsc, pat); E.run('!bitdcrew tithe skip --c ' + sc + ' --idx ' + nsc, pat); E.out.length = 0;
  o = E.run('!bitdcrew deposit none --c ' + sc + ' --idx ' + nsc, pat);
  ok(has(o, /Rep \+5 earned, 2 fit on the track\./), 'Score recorded says how much Rep was earned and how much fit', o.map(x => x.slice(0, 220)));
  const sd = mk('Vigilantes10', 0), tsd = E.token(sd); const nsd = idxOf(E.run('!bitdcrew score 2 2 2 0 2 1 4', pat, tsd));
  E.run('!bitdcrew seized none --c ' + sd + ' --idx ' + nsd, pat); E.run('!bitdcrew tithe skip --c ' + sd + ' --idx ' + nsd, pat); E.out.length = 0;
  o = E.run('!bitdcrew deposit none --c ' + sd + ' --idx ' + nsd, pat);
  ok(has(o, /Heat \+10, Rep \+5\./) && !has(o, /fit on the track/), 'when it all fits, the summary stays plain', o.map(x => x.slice(0, 220)));
  // a core crew's Heat card says which rule set ran
  const cc = E.crew('Core crew', pat); const tcc = E.token(cc);
  o = E.run('!bitdcrew score 2 0 0 0 0', pat, tcc);
  ok(has(o, /title=Heat\}\}/) && has(o, /Downtime module off: this is the core Score, Heat only/), 'the core Score card says the Downtime module is off', o.map(x => x.slice(0, 200)));
  const dc2 = dtCrew(E, pat, 'DT crew', 2); o = E.run('!bitdcrew score 2 0 0 0 0 0 1', pat, E.token(dc2));
  ok(!has(o, /Downtime module off/), 'a Downtime crew never gets that note');
  // a second Score has its own button
  const h = mk('Vigilantes8', 0), th = E.token(h);
  const r1 = idxOf(E.run('!bitdcrew score 2 2 2 0 2 1 4', pat, th)), r2 = idxOf(E.run('!bitdcrew score 2 2 2 0 2 1 4', pat, th));
  ok(r1 !== r2 && E.run('!bitdcrew misdirect --c ' + h + ' --idx ' + r2, pat).length > 0 && !has(E.run('!bitdcrew misdirect --c ' + h + ' --idx ' + r1, pat), /no longer available/), 'each Score has its own Misdirection button');
}

// ---------------------------------------------------------------- T20 composed Engagement roll (the core book questions)
{
  const { E, gm, pat, quinn } = table();
  const claim = (c, i, name, on) => { E.attr(c, 'claim_' + i + '_name', name); E.attr(c, 'claim_' + i + '_check', on === false ? '0' : '1'); };
  const mk = (name, dt) => { const c = E.crew(name, pat); if (dt !== false) E.attr(c, 'setting_dc_downtime', '1'); return c; };
  const act = (c, name) => { E.run('!bitdcrew setup', pat, E.token(c)); return E.abil(c).find(x => x.name === name).action; };
  const grab = (o) => {
    const t = o.find(x => /title-engagement/.test(x)) || '';
    const card = o.find(x => /template:bitd-broadcast/.test(x) && /\{\{type=Engagement\}\}/.test(x) && !/title=Confirm/.test(x) && !/title=(Critical|Controlled|Risky|Desperate)/.test(x)) || '';
    const ask = o.find(x => /title=Confirm/.test(x)) || '';
    return { o, t, card, ask, n: dice(t), zero: /zerodice=/.test(t), notes: (/\{\{content=([^}]*)\}\}/.exec(card) || [])[1] || '' };
  };
  // arguments: plan, approach, plan detail, friends and enemies, other elements
  const eng = (c, args, who) => grab(E.run('!bitdcrew engagement ' + args, who || pat, E.token(c)));
  const abil = (c, names) => names.forEach((nm, i) => { E.attr(c, 'repeating_crewability_-E' + i + '_name', nm); E.attr(c, 'repeating_crewability_-E' + i + '_check', '1'); });

  // the macro: plan type and the book's four questions, the same for every crew
  const plain = mk('Plain crew');
  const q1 = queries(act(plain, '2. Engagement'));
  ok(q1.length === 5 && q1[0][0] === 'Plan type' && q1[0].length === 7, 'five prompts: plan type and the four questions', q1.map(q => q[0]));
  ok(q1[0].slice(1).map(x => x.split(',')[1]).join() === 'assault,deception,stealth,occult,social,transport', 'the six plan types from the core book');
  ok(q1[1].slice(1).join('|') === 'Neither,0|Bold or daring (+1d),1|Overly complex or contingent (-1d),-1' && /^Approach/.test(q1[1][0]), 'question 1: bold or daring against overly complex', q1[1]);
  ok(q1[2].slice(1).join('|') === 'Neither,0|Exposes a weakness (+1d),1|Target strongest against it (-1d),-1' && /^Plan detail/.test(q1[2][0]), 'question 2: weakness against the target\'s strength', q1[2]);
  ok(q1[3].slice(1).join('|') === 'Neither,0|Friends or contacts help (+1d),1|Enemies or rivals interfere (-1d),-1' && /^Friends and enemies/.test(q1[3][0]), 'question 3: friends against enemies', q1[3]);
  ok(/^Other elements/.test(q1[4][0]) && q1[4].slice(1).join() === '0,1,2,3,-1,-2,-3', 'question 4: other elements, -3 to +3, 0 first', q1[4]);
  const withPred = mk('Assassins'); E.attr(withPred, 'repeating_crewability_-P1_name', 'Predators'); E.attr(withPred, 'repeating_crewability_-P1_check', '1');
  ok(act(withPred, '2. Engagement') === act(plain, '2. Engagement'), 'the macro does not depend on the crew\'s abilities (no murder prompt)');
  ok(!/murder/i.test(act(withPred, '2. Engagement')), 'no murder prompt');

  // the pool from the answers alone
  let r = eng(plain, 'stealth 0 0 0 0');
  ok(r.n === 1 && !r.zero && /\{\{type=action\}\}/.test(r.t) && /\{\{title-engagement=1\}\}/.test(r.t) && /\{\{title=\^\{engagement\}\}\}/.test(r.t) && /\{\{subtitle=\^\{roll_for\}\}\}/.test(r.t) && /\{\{short=short\}\}/.test(r.t), 'one die for sheer luck, native engagement card fields', r.t);
  ok(E.out.length === 2 && E.out.every(x => /^player\|/.test(x.who)) && /type=Engagement/.test(E.out[0].text) && /title-engagement/.test(E.out[1].text) && /charname=Plain crew/.test(E.out[1].text), 'two public cards as the player: the arithmetic, then the roll', E.out.map(x => x.text.slice(0, 80)));
  ok(!/notes=/.test(r.t) && /\{\{title=1d\}\}/.test(r.card) && /\{\{content=Stealth plan: 1 luck = 1d\.\}\}/.test(r.card), 'the roll card carries no notes line; the arithmetic card has the dice count as its title', r.card);
  r = eng(plain, 'assault 1 0 0 0'); ok(r.n === 2 && /1 luck, \+1 bold or daring = 2d\./.test(r.notes), 'bold or daring +1d', r.notes);
  r = eng(plain, 'assault -1 0 0 0'); ok(r.zero && r.n === 2 && /1 luck, -1 complex or contingent = 0d \(no dice: roll 2d and keep the lowest\)\./.test(r.notes), 'overly complex -1d: 0d means 2d, keep the lowest', r.notes);
  r = eng(plain, 'assault 0 1 0 0'); ok(r.n === 2 && /\+1 weak point exposed = 2d/.test(r.notes), 'a weak point +1d', r.notes);
  r = eng(plain, 'assault 0 -1 0 0'); ok(r.zero && /-1 target strongest here/.test(r.notes), 'the target\'s strength -1d', r.notes);
  r = eng(plain, 'assault 0 0 1 0'); ok(r.n === 2 && /\+1 friends or contacts help/.test(r.notes), 'friends +1d', r.notes);
  r = eng(plain, 'assault 0 0 -1 0'); ok(r.zero && /-1 enemies or rivals interfere/.test(r.notes), 'enemies -1d', r.notes);
  r = eng(plain, 'assault 0 0 0 3'); ok(r.n === 4 && /\+3 other elements = 4d/.test(r.notes), 'other elements +3', r.notes);
  r = eng(plain, 'assault 0 0 0 -3'); ok(r.zero && r.n === 2 && /-3 other elements = -2d|-3 other elements = 0d/.test(r.notes), 'other elements -3 is a pool below 0: 2d, keep the lowest', r.notes);
  r = eng(plain, 'assault 1 1 1 3'); ok(r.n === 7 && /1 luck, \+1 bold or daring, \+1 weak point exposed, \+1 friends or contacts help, \+3 other elements = 7d\./.test(r.notes), 'everything at once, in the book\'s order', r.notes);
  r = eng(plain, 'assault 1 -1 1 -1'); ok(r.n === 1 && /\+1 bold or daring, -1 target strongest here, \+1 friends or contacts help, -1 other elements = 1d/.test(r.notes), 'mixed answers net out (1 + 1 - 1 + 1 - 1)', r.notes);
  r = eng(plain, 'assault -1 -1 -1 -3'); ok(r.zero && r.n === 2, 'the worst case is still 2d, keep the lowest');

  // ticked crew abilities and claims that fit the plan are added automatically
  const dk = mk('Bravos'); abil(dk, ['Door Kickers']);
  ok(eng(dk, 'assault 0 0 0 0').n === 2 && eng(dk, 'stealth 0 0 0 0').n === 1 && eng(dk, 'social 0 0 0 0').n === 1, 'Door Kickers: +1d on an assault plan only');
  ok(/\+1 Door Kickers = 2d/.test(eng(dk, 'assault 0 0 0 0').notes), 'and the card names it');
  const ss = mk('Shadows'); abil(ss, ['Second Story']);
  ok(eng(ss, 'stealth 0 0 0 0').n === 2 && eng(ss, 'assault 0 0 0 0').n === 1 && eng(ss, 'deception 0 0 0 0').n === 1, 'Second Story: +1d on a stealth plan only');
  const off = mk('Unticked'); E.attr(off, 'repeating_crewability_-U_name', 'Door Kickers'); E.attr(off, 'repeating_crewability_-U_check', '0');
  ok(eng(off, 'assault 0 0 0 0').n === 1, 'an unticked ability adds nothing');
  const CLAIMS = { 'Ancient Altar': ['occult'], 'Bluecoat Confederates': ['assault'], 'City Records': ['stealth'], 'Cover Identities': ['deception', 'social'], 'Personal Clothier': ['social'], 'Secret Pathways': ['stealth'], 'Secret Routes': ['transport'] };
  Object.keys(CLAIMS).forEach(nm => {
    const c = mk('Claim ' + nm); claim(c, 3, nm);
    const bad = ['assault', 'deception', 'stealth', 'occult', 'social', 'transport'].filter(pl => eng(c, pl + ' 0 0 0 0').n !== 1 + (CLAIMS[nm].indexOf(pl) >= 0 ? 1 : 0));
    ok(bad.length === 0, 'claim ' + nm + ': +1d for ' + CLAIMS[nm].join(' and ') + ' only', bad);
  });
  const ci = mk('CoverBook'); claim(ci, 1, 'Cover Identities');
  ok(eng(ci, 'social 0 0 0 0').n === 2 && eng(ci, 'transport 0 0 0 0').n === 1, 'Cover Identities follows the core book: social, not transport');
  const nl = mk('Newline'); claim(nl, 2, 'Bluecoat\nConfederates'); claim(nl, 5, 'claim_secret_pathways'); claim(nl, 6, 'Secret\nRoutes');
  ok(eng(nl, 'assault 0 0 0 0').n === 2 && eng(nl, 'stealth 0 0 0 0').n === 2 && eng(nl, 'transport 0 0 0 0').n === 2, 'claim names spanning lines or carrying a key prefix still match');
  const uc = mk('UntickedClaim'); claim(uc, 4, 'City Records', false);
  ok(eng(uc, 'stealth 0 0 0 0').n === 1, 'an unticked claim adds nothing');
  const all = mk('Stack'); abil(all, ['Door Kickers']); claim(all, 1, 'Bluecoat Confederates');
  r = eng(all, 'assault 1 0 0 0'); ok(r.n === 4 && /1 luck, \+1 bold or daring, \+1 Door Kickers, \+1 Bluecoat Confederates = 4d/.test(r.notes), 'answers, ability and claim stack', r.notes);
  const core = mk('Core', false); abil(core, ['Second Story']);
  ok(eng(core, 'stealth 0 0 0 0').n === 2, 'a crew with Downtime off rolls the same');
  ok(eng(core, 'stealth 0 0 0 0', gm).n === 2, 'the GM can roll for any crew');
  // River items are not automated (user: hold on anything River)
  const df = mk('River'); abil(df, ['Deadly Focus']); claim(df, 7, 'The Governor');
  ok(eng(df, 'social 0 0 0 0').n === 1 && eng(df, 'stealth 0 0 0 0').n === 1 && eng(df, 'stealth 1 0 0 0').n === 2, 'Deadly Focus and The Governor change nothing');

  // Predators is asked, on a stealth or deception plan only
  const pr = mk('Assassins2'); abil(pr, ['Predators']);
  r = eng(pr, 'stealth 0 0 0 0');
  ok(r.t === '' && r.ask && E.out.length === 1 && /^player\|/.test(E.out[0].who) && /Stealth plan\. So far: 1 luck = 1d\./.test(r.ask) && /Confirm what applies \(each once\):/.test(r.ask) && /\[Predators: the goal is murder, \+1d\]\(!bitdcrew engadd x0 --c \S+ --idx \S+\)/.test(r.ask) && /\[Roll\]\(!bitdcrew engroll --c \S+ --idx \S+\)/.test(r.ask), 'a stealth plan with Predators ticked: nothing is rolled yet, a public card asks', r.ask);
  const nx = idxOf([r.ask]);
  let o = E.run('!bitdcrew engadd x0 --c ' + pr + ' --idx ' + nx, pat);
  ok(o.length === 1 && /Stealth plan\. So far: 1 luck, \+1 Predators = 2d\./.test(o[0]) && !/engadd/.test(o[0]) && /\[Roll\]/.test(o[0]) && /^player\|/.test(E.out[0].who), 'the button adds its die and reposts the card without that button', o);
  o = E.run('!bitdcrew engadd x0 --c ' + pr + ' --idx ' + nx, pat); ok(has(o, /Already added/) && !has(o, /title-engagement/), 'each button works once');
  o = E.run('!bitdcrew engroll --c ' + pr + ' --idx ' + nx, pat); r = grab(o);
  ok(r.n === 2 && /Stealth plan: 1 luck, \+1 Predators = 2d\./.test(r.notes) && E.out.length === 2 && E.out.every(x => /^player\|/.test(x.who)), 'Roll posts the arithmetic card and the roll once', o.map(x => x.slice(0, 120)));
  o = E.run('!bitdcrew engroll --c ' + pr + ' --idx ' + nx, pat); ok(has(o, /Already rolled/) && !has(o, /title-engagement/), 'a second Roll does nothing');
  o = E.run('!bitdcrew engadd x0 --c ' + pr + ' --idx ' + nx, pat); ok(has(o, /Already rolled/), 'and nothing can be added after the roll');
  r = eng(pr, 'deception 1 0 0 0'); ok(r.ask && /\+1 bold or daring = 2d/.test(r.ask), 'a deception plan is asked too, with the answers counted', r.ask);
  r = eng(pr, 'assault 0 0 0 0'); ok(r.ask === '' && r.n === 1, 'an assault plan is never asked about murder, it just rolls');
  r = eng(pr, 'occult 0 0 0 0'); ok(r.ask === '' && r.n === 1, 'nor an occult plan');
  const pr2 = mk('Assassins3'); E.attr(pr2, 'repeating_crewability_-P_name', 'Predators'); E.attr(pr2, 'repeating_crewability_-P_check', '0');
  r = eng(pr2, 'stealth 0 0 0 0'); ok(r.ask === '' && r.n === 1, 'an unticked Predators is not asked');
  const pr3 = mk('Assassins4'); abil(pr3, ['Predators', 'Second Story']); r = eng(pr3, 'stealth 0 0 0 0');
  ok(/1 luck, \+1 Second Story = 2d\./.test(r.ask), 'automatic sources are counted before the card is shown', r.ask);
  const rollNow = idxOf([r.ask]); o = E.run('!bitdcrew engroll --c ' + pr3 + ' --idx ' + rollNow, pat); ok(grab(o).n === 2 && !/Predators/.test(grab(o).notes), 'rolling without confirming leaves the extra out', o.map(x => x.slice(0, 100)));
  // button and card checks
  o = E.run('!bitdcrew engadd x7 --c ' + pr + ' --idx ' + idxOf([eng(pr, 'stealth 0 0 0 0').ask]), pat); ok(has(o, /unknown engagement choice/), 'unknown choice');
  o = E.run('!bitdcrew engadd x0 --c ' + pr + ' --idx nope', pat); ok(has(o, /no longer available/), 'unknown card');
  const pr4 = mk('Assassins5'); abil(pr4, ['Predators']); const nf = idxOf([eng(pr, 'stealth 0 0 0 0').ask]);
  o = E.run('!bitdcrew engadd x0 --c ' + pr4 + ' --idx ' + nf, pat); ok(has(o, /no longer available/), 'another crew cannot use the card');
  const sc = idxOf(E.run('!bitdcrew score 2 0 0 0 0 0 4', pat, E.token(pr)));
  o = E.run('!bitdcrew engadd x0 --c ' + pr + ' --idx ' + sc, pat); ok(has(o, /no longer available/), 'a Score card cannot be used as an engagement card');
  o = E.run('!bitdcrew engroll --c ' + pr + ' --idx ' + nf, quinn); ok(has(o, /only use this on crews you control/) && !has(o, /title-engagement/), 'a player who does not control the crew is refused');
  o = E.run('!bitdcrew engroll --c ' + pr + ' --idx ' + nf, gm); ok(grab(o).n === 1, 'the GM can roll any crew\'s card');

  // validation: nothing is rolled
  const bad = (c, args, re, why) => { const x = eng(c, args); ok(x.t === '' && x.ask === '' && has(x.o, re) && E.out.length === 1 && !/^player\|/.test(E.out[0].who), why, x.o); };
  bad(plain, 'raid 0 0 0 0', /answers are not valid/, 'unknown plan type');
  bad(plain, 'stealth 2 0 0 0', /answers are not valid/, 'approach above +1');
  bad(plain, 'stealth 0 -2 0 0', /answers are not valid/, 'plan detail below -1');
  bad(plain, 'stealth 0 0 x 0', /answers are not valid/, 'friends and enemies not a number');
  bad(plain, 'stealth 0 0 0 4', /answers are not valid/, 'other elements above +3');
  bad(plain, 'stealth 0 0 0 -4', /answers are not valid/, 'other elements below -3');
  bad(plain, 'stealth 0 0 0 1.5', /answers are not valid/, 'a fractional answer');
  bad(plain, 'stealth 0 0 0', /out of date.*Rebuild/, 'the old three-prompt macro is stale');
  bad(plain, 'stealth 0', /out of date.*Rebuild/, 'the older two-prompt macro is stale');
  bad(plain, 'stealth 0 0 0 0 0', /out of date.*Rebuild/, 'too many answers');
  bad(plain, '', /out of date/, 'no answers');
  const refused = eng(plain, 'stealth 0 0 0 0', quinn);
  ok(refused.t === '' && has(refused.o, /only use this on crews you control/), 'a player cannot roll for a crew they do not control', refused.o);
  const attrsOf = (c) => JSON.stringify(E.store.attrs.filter(a => a._characterid === c).map(a => [a.name, a.current]));
  const sheetBefore = attrsOf(plain); eng(plain, 'stealth 1 0 0 0'); eng(plain, 'occult -1 0 0 -2');
  ok(attrsOf(plain) === sheetBefore, 'a roll writes nothing to the crew sheet');

  // the outcome is read from the roll and named (core book, Engagement Roll)
  // earlier rolls in this block were never echoed back; flush their waiting timers so each outcome is matched to its own roll
  E.flush();
  const outcome = (args, dice_, c) => { E.flush(); eng(c || plain, args); return E.echo(dice_); };
  o = outcome('stealth 0 0 0 0', [6]);
  ok(o.length === 1 && /^player\|/.test(E.out[0].who) && /title=Controlled position/.test(o[0]) && /Dice 6\. Highest die 6: a good result\. You are in a controlled position when the action starts\./.test(o[0]), 'a 6 is a controlled position, posted publicly', o);
  ok(has(outcome('stealth 0 0 0 0', [5]), /title=Risky position/) && has(outcome('stealth 0 0 0 0', [4]), /title=Risky position/), '4 and 5 are risky');
  ok(has(outcome('stealth 0 0 0 0', [3]), /title=Desperate position/) && has(outcome('stealth 0 0 0 0', [1]), /title=Desperate position/), '1 to 3 are desperate');
  ok(has(outcome('stealth 1 0 0 0', [6, 6]), /title=Critical/) && has(outcome('stealth 1 0 0 0', [6, 6]), /already overcome the first obstacle/), 'two 6s are a critical');
  ok(has(outcome('stealth 1 0 0 0', [6, 5]), /title=Controlled position/) && has(outcome('stealth 1 0 0 0', [3, 2]), /title=Desperate position/), 'the highest die of several decides');
  o = outcome('stealth -1 0 0 0', [6, 2]); ok(has(o, /title=Desperate position/) && has(o, /Lowest die 2/), 'zero dice: 2d, the lowest decides', o);
  ok(has(outcome('stealth -1 0 0 0', [6, 6]), /title=Controlled position/) && !has(outcome('stealth -1 0 0 0', [6, 6]), /Critical/), 'zero dice can never be a critical');
  E.flush(); eng(plain, 'stealth 0 0 0 0'); o = E.echo(undefined); ok(has(o, /could not read the dice of the engagement roll/), 'unreadable dice: told how to read it by hand', o);
  E.flush(); eng(plain, 'stealth 0 0 0 0'); E.echo([4]); o = E.echo([4]); ok(o.length === 0, 'one roll is named once');
  E.flush(); eng(plain, 'stealth 0 0 0 0'); E.out.length = 0; E.flush();
  ok(E.out.some(x => /engagement roll could not be read, so no position was named/.test(x.text)), 'a roll that never comes back is reported', E.out.map(x => x.text.slice(0, 100)));
  // after the buttons too
  E.flush(); const pr5 = mk('Assassins6'); abil(pr5, ['Predators']); const nn = idxOf([eng(pr5, 'stealth 0 0 0 0').ask]);
  E.run('!bitdcrew engadd x0 --c ' + pr5 + ' --idx ' + nn, pat); E.run('!bitdcrew engroll --c ' + pr5 + ' --idx ' + nn, pat);
  ok(has(E.echo([6, 6]), /title=Critical/), 'the outcome follows a roll made from the card');
  E.flush();
}

// ---------------------------------------------------------------- T20b Engagement: abilities of Party player characters
{
  const { E, gm, pat, quinn } = table();
  const crew = E.crew('Spiders crew', pat); E.attr(crew, 'setting_dc_downtime', '1');
  const pc = (name, ctrl, abilities, party) => {
    const id = E.char(name, ctrl);
    (abilities || []).forEach((a, i) => { E.attr(id, 'repeating_ability_-A' + i + '_name', a[0]); E.attr(id, 'repeating_ability_-A' + i + '_check', a[1] === false ? '0' : '1'); });
    if (party !== false) E.party(id);
    return id;
  };
  const grab = (o) => ({ o, ask: o.find(x => /title=Confirm/.test(x)) || '', roll: o.find(x => /title-engagement/.test(x)) || '', card: o.find(x => /template:bitd-broadcast/.test(x) && /\{\{type=Engagement\}\}/.test(x) && !/title=Confirm/.test(x) && !/title=(Critical|Controlled|Risky|Desperate)/.test(x)) || '' });
  const eng = (args) => grab(E.run('!bitdcrew engagement ' + args, pat, E.token(crew)));
  const snap = (id) => JSON.stringify(E.store.attrs.filter(a => a._characterid === id).map(a => [a.name, a.current]));

  // nobody has the abilities: it rolls at once
  const ana = pc('Ana', pat, [['Weaving the Web']]), bo = pc('Bo', quinn, [['Eye for Weakness']]);
  const cy = pc('Cy', '', [['Weaving the Web']], false);   // not a Party member
  const before = [snap(ana), snap(bo), snap(cy)];
  let r = eng('social 0 0 0 0');
  ok(r.roll === '' && /Social plan\. So far: 1 luck = 1d\./.test(r.ask), 'a Party PC with an ability: the table is asked first', r.ask);
  ok(/\[Ana, Weaving the Web: gathered info, \+1d\]\(!bitdcrew engadd x0 /.test(r.ask) && /\[Bo, Eye for Weakness: used it to plan, \+1d\]\(!bitdcrew engadd x1 /.test(r.ask) && !/Cy/.test(r.ask), 'one button per Party PC ability, none for a PC who is not in the party', r.ask);
  const n = idxOf([r.ask]);
  E.run('!bitdcrew engadd x0 --c ' + crew + ' --idx ' + n, pat); let o = E.run('!bitdcrew engadd x1 --c ' + crew + ' --idx ' + n, pat);
  ok(/So far: 1 luck, \+1 Ana's Weaving the Web, \+1 Bo's Eye for Weakness = 3d\./.test(o[0]) && !/engadd/.test(o[0]), 'both added: the card names whose ability it is', o);
  r = grab(E.run('!bitdcrew engroll --c ' + crew + ' --idx ' + n, pat));
  ok(dice(r.roll) === 3 && /Social plan: 1 luck, \+1 Ana's Weaving the Web, \+1 Bo's Eye for Weakness = 3d\./.test(r.card), 'the roll and the public arithmetic card carry both', r.card);
  ok(snap(ana) === before[0] && snap(bo) === before[1] && snap(cy) === before[2], 'no attribute on any PC sheet was written');
  // the answers stack with them (Eye for Weakness with a weak point +1d)
  r = eng('stealth 0 1 0 0'); const n2 = idxOf([r.ask]); E.run('!bitdcrew engadd x1 --c ' + crew + ' --idx ' + n2, pat);
  r = grab(E.run('!bitdcrew engroll --c ' + crew + ' --idx ' + n2, pat)); ok(dice(r.roll) === 3 && /\+1 weak point exposed, \+1 Bo's Eye for Weakness = 3d/.test(r.card), 'Eye for Weakness stacks with a weak-point answer', r.card);
  // not every ability is asked about on every plan: these two apply to any plan
  ok(eng('assault 0 0 0 0').ask !== '' && eng('transport 0 0 0 0').ask !== '', 'asked on any plan type');

  // two PCs with the same ability both count; one PC with both abilities gives two buttons
  const T2 = table(); const E2 = T2.E; const crew2 = E2.crew('Crew 2', T2.pat);
  const mkpc = (name, ab) => { const id = E2.char(name, T2.pat); ab.forEach((a, i) => { E2.attr(id, 'repeating_ability_-A' + i + '_name', a); E2.attr(id, 'repeating_ability_-A' + i + '_check', '1'); }); E2.party(id); return id; };
  mkpc('Dee', ['Weaving the Web']); mkpc('Eli', ['weaving  the WEB']); mkpc('Fay', ['Eye for Weakness', 'Weaving the Web']);
  const g2 = (o) => ({ o, ask: o.find(x => /title=Confirm/.test(x)) || '' });
  const a2 = g2(E2.run('!bitdcrew engagement stealth 0 0 0 0', T2.pat, E2.token(crew2)));
  ok((a2.ask.match(/engadd x\d/g) || []).length === 4 && /Dee, Weaving the Web/.test(a2.ask) && /Eli, Weaving the Web/.test(a2.ask) && /Fay, Eye for Weakness/.test(a2.ask) && /Fay, Weaving the Web/.test(a2.ask), 'two PCs with one ability and one PC with two: four buttons; names match without case or spacing', a2.ask);
  const n3 = idxOf([a2.ask]); ['x0', 'x1', 'x2', 'x3'].forEach(x => E2.run('!bitdcrew engadd ' + x + ' --c ' + crew2 + ' --idx ' + n3, T2.pat));
  const f2 = E2.run('!bitdcrew engroll --c ' + crew2 + ' --idx ' + n3, T2.pat); ok(dice(f2.find(x => /title-engagement/.test(x)) || '') === 5, 'each PC\'s ability adds its own die (1 + 4)');
  // unticked, a crew sheet marked as a party member, a long name
  const T3 = table(); const E3 = T3.E; const crew3 = E3.crew('Crew 3', T3.pat); E3.attr(crew3, 'repeating_ability_-A_name', 'Weaving the Web'); E3.attr(crew3, 'repeating_ability_-A_check', '1'); E3.party(crew3);
  const gh = E3.char('Gus', T3.pat); E3.attr(gh, 'repeating_ability_-A_name', 'Weaving the Web'); E3.attr(gh, 'repeating_ability_-A_check', '0'); E3.party(gh);
  const hi = E3.char('Hal', T3.pat); E3.party(hi);
  let o3 = E3.run('!bitdcrew engagement stealth 0 0 0 0', T3.pat, E3.token(crew3));
  ok(!o3.some(x => /title=Confirm/.test(x)) && o3.some(x => /title-engagement/.test(x)), 'an unticked ability, a PC without it, and a crew sheet marked as a party member add no question', o3.map(x => x.slice(0, 100)));
  const lg = E3.char('Kharrakeen Abernathy Longname', T3.pat); E3.attr(lg, 'repeating_ability_-A_name', 'Eye for Weakness'); E3.attr(lg, 'repeating_ability_-A_check', '1'); E3.party(lg);
  o3 = E3.run('!bitdcrew engagement stealth 0 0 0 0', T3.pat, E3.token(crew3));
  const lab = (/\[([^\]]*Eye for Weakness[^\]]*)\]/.exec(o3.find(x => /title=Confirm/.test(x)) || '') || [])[1] || '';
  ok(lab.length <= 60 && /, \+1d$/.test(lab) && /^Kharrakeen Abern/.test(lab), 'a long PC name is shortened so the +1d stays on the button', lab);
  // a party PC alone is enough for the card even when the crew has nothing ticked; a core crew works too
  const T4 = table(); const E4 = T4.E; const core = E4.crew('Core crew', T4.pat); const iv = E4.char('Ivy', T4.pat); E4.attr(iv, 'repeating_ability_-A_name', 'Weaving the Web'); E4.attr(iv, 'repeating_ability_-A_check', '1'); E4.party(iv);
  ok(E4.run('!bitdcrew engagement occult 0 0 0 0', T4.pat, E4.token(core)).some(x => /Ivy, Weaving the Web/.test(x)), 'works on a crew with Downtime off');
}

// ---------------------------------------------------------------- T21 Status reminders for abilities with no number to change
{
  const { E, pat } = table();
  const c = E.crew('Mixed', pat), t = E.token(c);
  const names = ['Zealotry', 'Thorn in your Side', 'Roots', 'All Hands', 'Like Part of the Family'];
  names.forEach((nm, i) => { E.attr(c, 'repeating_crewability_-S' + i + '_name', nm); E.attr(c, 'repeating_crewability_-S' + i + '_check', '1'); });
  let o = E.run('!bitdcrew status', pat, t);
  ok(has(o, /Zealotry: your cohorts get \+1d to rolls against enemies of the faith/) && has(o, /Thorn in your Side: when you use Stealth or Assault plans against a higher Tier faction, your Tier counts as \+1/) && has(o, /Roots: during Downtime one of your contacts or cohorts/) && has(o, /All Hands: during Downtime, one of your cohorts may perform an additional Downtime activity to Acquire or Work/) && has(o, /Like Part of the Family: one of your vehicles is a cohort whose quality is equal to your Tier \+1/), 'each ticked reminder ability gets a Status line', o);
  E.attr(c, 'repeating_crewability_-S1_check', '0'); E.attr(c, 'repeating_crewability_-S3_name', 'ALL  HANDS');
  o = E.run('!bitdcrew status', pat, t);
  ok(!has(o, /Thorn in your Side/) && has(o, /All Hands:/) && has(o, /Zealotry/), 'an unticked ability has no line; names match without case or spacing');
  const d = E.crew('Bare', pat); o = E.run('!bitdcrew status', pat, E.token(d));
  ok(!has(o, /Zealotry|Thorn|Roots:|All Hands|Like Part/), 'a crew without them hears nothing');
  // the lines are plain text: no buttons, no state, nothing written
  ok(E.val(c, 'heat') === undefined && !has(E.run('!bitdcrew status', pat, t), /Zealotry.*\]\(!/), 'reminders are text only');
}

// ---------------------------------------------------------------- T22 Edge for the party (Action module)
{
  const { E, gm, pat, quinn } = table();
  const crew = (name, action, tick) => { const c = dtCrew(E, pat, name, 2); if (action !== false) E.attr(c, 'setting_dc_action', '1'); if (tick !== false) tick_(c); return c; };
  const tick_ = (c) => { E.attr(c, 'repeating_crewability_-B_name', 'Bound in Darkness'); E.attr(c, 'repeating_crewability_-B_check', '1'); };
  const ana = E.char('Ana', pat), bo = E.char('Bo', quinn), cy = E.char('Cy', ''), dee = E.char('Dee', '');
  E.party(ana); E.party(bo); E.party(dee, 'string');          // Cy is not in the party
  E.attr(ana, 'edge_amount', 0); E.attr(ana, 'stress', 3); E.attr(ana, 'repeating_ability_-X_name', 'Cloak');
  const attrA = E.store.attrs.find(a => a._characterid === ana && a.name === 'edge_amount');
  const tokA = E.token(ana); E.tok(tokA).bar2_link = attrA.id; E.tok(tokA).bar2_value = '0';
  const edge = (cid) => E.val(cid, 'edge_amount');
  const snap = (cid) => JSON.stringify(E.store.attrs.filter(a => a._characterid === cid && a.name !== 'edge_amount').map(a => [a.name, a.current]));
  const before = snap(ana);

  // the Adjust entry follows the Action module
  const c1 = crew('Cult'), t1 = E.token(c1), c3 = crew('NoAction', false);
  E.run('!bitdcrew setup', pat, t1); E.run('!bitdcrew setup', pat, E.token(c3));
  ok(!/beginscore|Begin score/.test(E.abil(c1).find(x => x.name === '7. Adjust').action) && !/beginscore/.test(E.abil(c3).find(x => x.name === '7. Adjust').action), 'Begin score is no longer an Adjust entry (it is offered after the engagement roll); the command still works by hand');
  ok(queries(E.abil(c1).find(x => x.name === '7. Adjust').action).every(q => q.slice(1).every(p => p.length > 0 && count(p, ',') <= 1)), 'the Adjust prompt is still well formed');

  // the card
  let o = E.run('!bitdcrew adj beginscore', pat, t1);
  ok(has(o, /Begin score/) && has(o, /each PC that has not lost favor with your deity gains 1 Edge/) && has(o, /\[All party PCs \+1 Edge\]\(!bitdcrew edge all --c \S+ --idx \S+\)/) && has(o, /\[Ana \+1 Edge\]\(!bitdcrew edge pc --row \S+ --c \S+ --idx \S+\)/) && has(o, /\[Bo \+1 Edge\]/) && has(o, /\[Dee \+1 Edge\]/) && !has(o, /Cy/), 'the card lists All and each party PC, not Cy', o);
  ok(edge(ana) === '0', 'opening the card changes nothing');
  const n1 = idxOf(o);
  o = E.run('!bitdcrew edge all --c ' + c1 + ' --idx ' + n1, pat);
  ok(edge(ana) === '1' && edge(bo) === '1' && edge(dee) === '1' && edge(cy) === undefined && has(o, /Ana Edge 0 to 1/) && has(o, /Bo Edge 0 to 1/), 'All gives each party PC 1 Edge and leaves Cy alone', o);
  ok(E.tok(tokA).bar2_value === '1', 'Ana\'s token bar 2 is set explicitly');
  o = E.run('!bitdcrew edge all --c ' + c1 + ' --idx ' + n1, pat);
  ok(edge(ana) === '1' && has(o, /Already done/), 'a second All on the same card does nothing');
  ok(snap(ana) === before, 'no other attribute on the PC sheet was written');
  // one at a time, then the rest
  const n2 = idxOf(E.run('!bitdcrew adj beginscore', pat, t1));
  o = E.run('!bitdcrew edge pc --row ' + ana + ' --c ' + c1 + ' --idx ' + n2, pat);
  ok(edge(ana) === '2' && has(o, /Ana Edge 1 to 2/) && edge(bo) === '1', 'one PC button gives that PC 1 Edge', o);
  o = E.run('!bitdcrew edge pc --row ' + ana + ' --c ' + c1 + ' --idx ' + n2, pat); ok(edge(ana) === '2' && has(o, /Already done/), 'the same PC button works once');
  o = E.run('!bitdcrew edge all --c ' + c1 + ' --idx ' + n2, pat);
  ok(edge(ana) === '2' && edge(bo) === '2' && edge(dee) === '2' && !has(o, /Ana Edge/), 'All afterwards skips the PC already done', o);
  const n3 = idxOf(E.run('!bitdcrew adj beginscore', pat, t1));
  o = E.run('!bitdcrew edge pc --row ' + cy + ' --c ' + c1 + ' --idx ' + n3, pat); ok(edge(cy) === undefined && has(o, /no longer marked as a Party member/), 'a PC not in the party is refused', o);
  E.attr(ana, 'edge_amount', 99); const n4 = idxOf(E.run('!bitdcrew adj beginscore', pat, t1));
  E.run('!bitdcrew edge pc --row ' + ana + ' --c ' + c1 + ' --idx ' + n4, pat); ok(edge(ana) === '99', 'Edge stops at 99, the PC script\'s own limit');
  E.attr(ana, 'edge_amount', 0);
  // the flow belongs to one crew and one kind
  o = E.run('!bitdcrew edge all --c ' + c1 + ' --idx nope', pat); ok(has(o, /no longer available/), 'unknown card');
  const c4 = crew('Other cult'); o = E.run('!bitdcrew edge all --c ' + c4 + ' --idx ' + n1, pat); ok(has(o, /no longer available/), 'another crew cannot use the card');
  o = E.run('!bitdcrew edge bogus --c ' + c1 + ' --idx ' + idxOf(E.run('!bitdcrew adj beginscore', pat, t1)), pat); ok(has(o, /unknown Edge choice/), 'unknown choice');
  // permissions
  o = E.run('!bitdcrew edge all --c ' + c1 + ' --idx ' + n1, quinn); ok(has(o, /only use this on crews you control/), 'a player who does not control the crew is refused');
  ok(has(E.run('!bitdcrew adj beginscore', gm, t1), /All party PCs/), 'the GM can open the card');

  // refusals say why and change nothing
  const c2 = crew('Cult2', true, false), t2 = E.token(c2);
  o = E.run('!bitdcrew adj beginscore', pat, t2); ok(has(o, /Bound in Darkness is not ticked/) && !has(o, /All party/), 'ability not ticked', o);
  o = E.run('!bitdcrew adj beginscore', pat, E.token(c3)); ok(has(o, /Bound in Darkness is not ticked|Action module.*off/), 'Action module off', o);
  const c5 = crew('Cult5', false, true); o = E.run('!bitdcrew adj beginscore', pat, E.token(c5)); ok(has(o, /Edge comes from the Deep Cuts Action module, and it is off for this crew/), 'ticked but the Action module is off', o);
  { const T = table(); const E2 = T.E; const pc = E2.char('Eli', T.pat); const k = E2.crew('Cult6', T.pat); E2.attr(k, 'setting_dc_action', '1'); E2.attr(k, 'repeating_crewability_-B_name', 'Bound in Darkness'); E2.attr(k, 'repeating_crewability_-B_check', '1');
    let o2 = E2.run('!bitdcrew adj beginscore', T.pat, E2.token(k));
    ok(has(o2, /no player characters are marked as Party members/) && has(o2, /Nothing was applied/) && E2.val(pc, 'edge_amount') === undefined, 'no party: refused, nothing applied', o2);
    E2.party(k); o2 = E2.run('!bitdcrew adj beginscore', T.pat, E2.token(k));
    ok(has(o2, /no player characters are marked as Party members/), 'a crew sheet marked as a party member is not a PC and does not count', o2);
  }

  // the Fallout card offers to clear Edge when Downtime starts
  const f1 = crew('Cult7'), tf = E.token(f1);
  E.attr(ana, 'edge_amount', 2); E.attr(bo, 'edge_amount', 0); E.attr(dee, 'edge_amount', 1); E.tok(tokA).bar2_value = '2';
  o = E.run('!bitdcrew score 2 0 0 0 0 0 4', pat, tf);
  ok(has(o, /Edge is lost when Downtime starts \(Deep Cuts, Action\): Ana 2, Dee 1\./) && has(o, /\[Clear Edge for the party\]\(!bitdcrew edge clear --c \S+ --idx \S+\)/) && !has(o, /Bo 0/), 'Fallout lists who holds Edge and offers the button', o.map(x => x.slice(0, 200)));
  ok(edge(ana) === '2', 'the Score itself clears nothing');
  const nf = idxOf(o);
  o = E.run('!bitdcrew edge clear --c ' + f1 + ' --idx ' + nf, pat);
  ok(edge(ana) === '0' && edge(dee) === '0' && edge(bo) === '0' && has(o, /Ana loses 2 Edge/) && has(o, /Dee loses 1 Edge/) && !has(o, /Bo loses/), 'the button clears every party PC\'s Edge and names them', o);
  ok(E.tok(tokA).bar2_value === '0', 'the token bar follows');
  o = E.run('!bitdcrew edge clear --c ' + f1 + ' --idx ' + nf, pat); ok(has(o, /Already done/), 'once per Score');
  E.attr(ana, 'edge_amount', 1); o = E.run('!bitdcrew edge all --c ' + f1 + ' --idx ' + nf, pat); ok(edge(ana) === '1' && has(o, /no longer available/), 'a Score card cannot be used as a Begin score card'); E.attr(ana, 'edge_amount', 0);
  // nobody holding Edge at click time: say so, and the button stays usable
  const f2 = crew('Cult8'), tf2 = E.token(f2); E.attr(ana, 'edge_amount', 1);
  const nf2 = idxOf(E.run('!bitdcrew score 2 0 0 0 0 0 4', pat, tf2)); E.attr(ana, 'edge_amount', 0);
  o = E.run('!bitdcrew edge clear --c ' + f2 + ' --idx ' + nf2, pat); ok(has(o, /no party PC has any Edge to clear/), 'nothing to clear: said so', o);
  E.attr(ana, 'edge_amount', 3); o = E.run('!bitdcrew edge clear --c ' + f2 + ' --idx ' + nf2, pat); ok(edge(ana) === '0' && has(o, /Ana loses 3 Edge/), 'and the button still works afterwards');
  // no line when nobody has Edge, when the Action module is off, or when it is not a Deep Cuts Score
  E.attr(ana, 'edge_amount', 0); E.attr(dee, 'edge_amount', 0);
  ok(!has(E.run('!bitdcrew score 2 0 0 0 0 0 4', pat, E.token(crew('Cult9'))), /Edge is lost|Clear Edge/), 'no Edge line when nobody has Edge');
  E.attr(ana, 'edge_amount', 2);
  ok(!has(E.run('!bitdcrew score 2 0 0 0 0 0 4', pat, E.token(crew('NoAct', false))), /Edge/), 'no Edge line when the Action module is off');
  ok(!has(E.run('!bitdcrew score 2 0 0 0', pat, E.token(E.crew('Core', pat))), /Edge/), 'the core Score card never mentions Edge');
  { const T = table(); const E2 = T.E; const k = dtCrew(E2, T.pat, 'Lonely', 2); E2.attr(k, 'setting_dc_action', '1');
    const o2 = E2.run('!bitdcrew score 2 0 0 0 0 0 4', T.pat, E2.token(k));
    ok(has(o2, /Edge is lost when Downtime starts, but no player characters are marked as Party members/), 'Action on and an empty party: the card says it cannot clear Edge', o2.map(x => x.slice(0, 200))); }
  ok(snap(ana) === before, 'across all of this, no PC attribute but edge_amount was written');
  E.flush();
}

// ---------------------------------------------------------------- T24 Bundle 6: claims
{
  const { E, gm, pat, quinn } = table();
  const claim = (c, i, name, on) => { E.attr(c, 'claim_' + i + '_name', name); E.attr(c, 'claim_' + i + '_check', on === false ? '0' : '1'); };
  const mk = (name, tier) => dtCrew(E, pat, name, tier === undefined ? 2 : tier);
  const fall = (o) => o.find(x => /title=Fallout/.test(x)) || '';
  const heatLine = (o) => (/Heat \+(\d+) \(([^)]*)\)/.exec(fall(o)) || [])[0];
  const run = (c, args) => E.run('!bitdcrew score ' + args, pat, E.token(c));

  // A. "-2 heat per score" claims
  let c = mk('Hawkers'); claim(c, 10, 'Cover Operation');
  let o = run(c, '2 0 0 0 0 0 4');
  ok(/Heat \+2 \(base 2, crew Tier \+2, Cover Operation -2\)/.test(heatLine(o)) && E.val(c, 'heat') === '2' && /Rep \+1 \(1 per 2 Heat\)/.test(fall(o)), 'Cover Operation: -2 off the Fallout Heat, and Rep follows the reduced Heat', o.map(x => x.slice(0, 200)));
  c = mk('Unticked'); claim(c, 10, 'Cover Operation', false); o = run(c, '2 0 0 0 0 0 4');
  ok(/Heat \+4 \(base 2, crew Tier \+2\)/.test(heatLine(o)), 'an unticked claim does nothing', heatLine(o));
  ['Bluecoat Intimidation', 'Bluecoat Confidants', 'claim_cover_operation', 'Cover\nOperation'].forEach((nm, i) => {
    const k = mk('H' + i); claim(k, 4, nm); const r = run(k, '2 0 0 0 0 0 4');
    ok(/Heat \+2 \(base 2, crew Tier \+2, .* -2\)/.test(heatLine(r)), nm.replace('\n', ' ') + ' also takes 2 off', heatLine(r));
  });
  c = mk('Two'); claim(c, 1, 'Cover Operation'); claim(c, 2, 'Bluecoat Intimidation'); o = run(c, '2 0 0 0 0 0 4');
  ok(/Heat \+0 \(base 2, crew Tier \+2, Cover Operation -2, Bluecoat Intimidation -2\)/.test(heatLine(o)) && E.val(c, 'heat') === '0' && /Rep \+0 /.test(fall(o)), 'two claims stack: 4 less 4 is 0', heatLine(o));
  c = mk('Low', 1); claim(c, 1, 'Cover Operation'); o = run(c, '0 0 0 0 0 0 4');
  ok(/Heat \+0 \(base 0, crew Tier \+1, Cover Operation -2, not below 0\)/.test(heatLine(o)), 'a total of 1 stops at 0', heatLine(o));
  c = mk('Over'); claim(c, 1, 'Cover Operation'); claim(c, 2, 'Bluecoat Intimidation'); claim(c, 3, 'Bluecoat Confidants'); o = run(c, '2 0 0 0 0 0 4');
  ok(/Bluecoat Confidants -2, not below 0\)/.test(heatLine(o)) && /Heat \+0 /.test(heatLine(o)), 'three claims on a total of 4: the note says Heat stops at 0', heatLine(o));
  c = mk('Smooth', 0); claim(c, 1, 'Cover Operation'); o = run(c, '0 0 0 0 0 0 4');
  ok(/Heat \+0 \(base 0, crew Tier \+0\)/.test(heatLine(o)), 'a total of 0 has no claim line', heatLine(o));
  c = mk('NT'); claim(c, 1, 'Cover Operation'); E.attr(c, 'repeating_crewability_-N_name', 'No Traces'); E.attr(c, 'repeating_crewability_-N_check', '1');
  o = run(c, '2 0 0 0 0 0 4'); ok(/Heat \+1 \(base 2, crew Tier \+2, No Traces -1, Cover Operation -2\)/.test(heatLine(o)), 'No Traces and a claim together', heatLine(o));
  c = mk('Big'); claim(c, 1, 'Cover Operation'); o = run(c, '2 2 2 0 2 0 4');
  ok(/Heat \+8 /.test(heatLine(o)) && /Rep \+4 /.test(fall(o)), 'Heat 10 less 2 = 8 gives Rep 4, not 5', fall(o).slice(0, 300));
  c = mk('Fence'); claim(c, 1, 'Cover Operation'); o = run(c, '2 0 0 0 0 0 4'); const nf = idxOf(o);
  E.run('!bitdcrew seized fence4 --c ' + c + ' --idx ' + nf, pat); ok(E.val(c, 'heat') === '3', 'fencing Heat is added after, and not reduced by the claim', E.val(c, 'heat'));
  const core = E.crew('Core', pat); claim(core, 3, 'Cover Operation'); o = E.run('!bitdcrew score 4 0 0 0 0', pat, E.token(core));
  ok(has(o, /Heat \+2 \(exposure 4, Cover Operation -2\)/) && E.val(core, 'heat') === '2', 'the core Score card applies it too', o.map(x => x.slice(0, 200)));
  o = E.run('!bitdcrew score 2 0 0 0 0', pat, E.token(core)); ok(has(o, /Heat \+0 \(exposure 2, Cover Operation -2, not below 0\)|Heat \+0 \(exposure 2, Cover Operation -2\)/), 'core: floor at 0', o.map(x => x.slice(0, 200)));

  // B. Victim Trophies: +1 Rep per score, inside the one Rep gain
  c = mk('Assassins'); claim(c, 6, 'Victim Trophies'); o = run(c, '2 0 0 0 0 0 4');
  ok(/Rep \+3 \(1 per 2 Heat, Victim Trophies \+1\)/.test(fall(o)) && E.val(c, 'rep') === '3', 'Victim Trophies adds 1 Rep', fall(o).slice(0, 300));
  c = mk('Assassins2'); claim(c, 6, 'Victim Trophies'); E.attr(c, 'repeating_crewability_-L_name', 'Leverage'); E.attr(c, 'repeating_crewability_-L_check', '1');
  o = run(c, '2 0 0 0 0 0 4'); ok(E.val(c, 'rep') === '4' && /Leverage: \+1 Rep/.test(fall(o)), 'with Leverage the +1 comes once for the whole gain', E.val(c, 'rep'));
  c = mk('Assassins3', 0); claim(c, 6, 'Victim Trophies'); o = run(c, '0 0 0 0 0 0 4'); ok(E.val(c, 'rep') === '1', 'it counts even on a score with no Heat', E.val(c, 'rep'));
  c = mk('Assassins4'); claim(c, 6, 'Victim Trophies'); E.attr(c, 'repeating_crewability_-M_name', 'Misdirection'); E.attr(c, 'repeating_crewability_-M_check', '1');
  o = run(c, '2 2 2 0 2 0 4'); ok(/give up half the Rep earned \(3\)/.test(fall(o)), 'Misdirection counts the Victim Trophies Rep (6 + 1, half is 3)', fall(o).slice(0, 400));

  // C. Publicity and Doskvol's Most Wanted: buttons, +2 Rep, no second Leverage
  c = mk('Vigilantes'); claim(c, 2, 'Publicity'); claim(c, 3, 'Doskvol’s Most Wanted'.replace('’', "'")); E.attr(c, 'repeating_crewability_-L_name', 'Leverage'); E.attr(c, 'repeating_crewability_-L_check', '1');
  o = run(c, '2 0 0 0 0 0 4'); const nr = idxOf(o);
  ok(has(o, /Claims that apply only to some scores/) && has(o, /\[Publicity: takedown score, \+2 Rep\]\(!bitdcrew claim rep0 --c \S+ --idx \S+\)/) && has(o, /\[Doskvol's Most Wanted: score against the law, \+2 Rep\]\(!bitdcrew claim rep1 /), 'both buttons appear when ticked', o.map(x => x.slice(0, 300)));
  const rep0 = E.val(c, 'rep');
  o = E.run('!bitdcrew claim rep0 --c ' + c + ' --idx ' + nr, pat);
  ok(E.val(c, 'rep') === String(Number(rep0) + 2) && has(o, /Publicity \+2 Rep/), 'Publicity: +2 Rep, not boosted by Leverage again', [rep0, E.val(c, 'rep')]);
  o = E.run('!bitdcrew claim rep0 --c ' + c + ' --idx ' + nr, pat); ok(has(o, /Already done/) && E.val(c, 'rep') === String(Number(rep0) + 2), 'once per Score');
  E.run('!bitdcrew claim rep1 --c ' + c + ' --idx ' + nr, pat); ok(E.val(c, 'rep') === String(Number(rep0) + 4), 'Doskvol\'s Most Wanted: +2 Rep');
  E.run('!bitdcrew seized none --c ' + c + ' --idx ' + nr, pat); E.run('!bitdcrew tithe skip --c ' + c + ' --idx ' + nr, pat); E.out.length = 0;
  o = E.run('!bitdcrew deposit none --c ' + c + ' --idx ' + nr, pat); ok(has(o, new RegExp('Rep \\+' + (Number(rep0) + 4) + '\\.')), 'the final summary counts the claim Rep', o.map(x => x.slice(0, 200)));
  const full = mk('Full'); claim(full, 2, 'Publicity'); E.attr(full, 'rep', 11); const nfull = idxOf(run(full, '0 0 0 0 0 0 4'));
  o = E.run('!bitdcrew claim rep0 --c ' + full + ' --idx ' + nfull, pat); ok(E.val(full, 'rep') === '12' && has(o, /the track is full/), 'Rep stops at 12', o);
  const none = mk('NoClaims'); o = run(none, '2 0 0 0 0 0 4'); ok(!has(o, /Claims that apply only/), 'no claims, no line');
  o = E.run('!bitdcrew claim rep0 --c ' + none + ' --idx ' + idxOf(o), pat); ok(has(o, /Publicity is not ticked/) && E.val(none, 'rep') === '2', 'a button for a claim that is not ticked is refused', o);
  o = E.run('!bitdcrew claim rep0 --c ' + c + ' --idx nope', pat); ok(has(o, /no longer available/), 'unknown card');
  o = E.run('!bitdcrew claim junk --c ' + c + ' --idx ' + nr, pat); ok(has(o, /unknown claim button/), 'unknown button');
  o = E.run('!bitdcrew claim rep0 --c ' + c + ' --idx ' + nr, quinn); ok(has(o, /only use this on crews you control/), 'a non-controller is refused');

  // D. +2 Coin claims: added to the Payoff before the seized step, so they count toward the tithe
  c = mk('Hawkers2'); claim(c, 7, 'Envoy'); claim(c, 8, 'Surplus Caches'); claim(c, 9, 'Loyal Fence', false);
  o = run(c, '2 0 0 0 0 0 4'); const nc = idxOf(o);
  ok(has(o, /\[Envoy: high-class clients, \+2 Coin\]\(!bitdcrew claim coin0 /) && has(o, /\[Surplus Caches: product sale or supply, \+2 Coin\]\(!bitdcrew claim coin4 /) && !has(o, /Loyal Fence/) && !has(o, /Fixer/), 'only ticked Coin claims get buttons', o.map(x => x.slice(0, 400)));
  o = E.run('!bitdcrew claim coin0 --c ' + c + ' --idx ' + nc, pat); ok(has(o, /Envoy \+2 Coin/) && has(o, /Payoff is now 6 Coin/), 'Envoy: Payoff 4 becomes 6', o);
  o = E.run('!bitdcrew claim coin0 --c ' + c + ' --idx ' + nc, pat); ok(has(o, /Already done/), 'once per Score');
  o = E.run('!bitdcrew claim coin4 --c ' + c + ' --idx ' + nc, pat); ok(has(o, /Payoff is now 8 Coin/), 'Surplus Caches: 8');
  o = E.run('!bitdcrew seized none --c ' + c + ' --idx ' + nc, pat); ok(has(o, /Earned from the score: 8 Coin/) && has(o, /Tithe: you are Tier 2.*2 Coin/), 'the +4 counts toward Earned and the tithe (8 Coin, tithe 2)', o);
  o = E.run('!bitdcrew claim coin1 --c ' + c + ' --idx ' + nc, pat); ok(has(o, /Fixer is not ticked/), 'unticked claim');
  claim(c, 11, 'Fixer'); o = E.run('!bitdcrew claim coin1 --c ' + c + ' --idx ' + nc, pat); ok(has(o, /seized assets step is already done/), 'after the seized step the Payoff is fixed', o);
  E.run('!bitdcrew tithe pay --c ' + c + ' --idx ' + nc, pat); E.out.length = 0; o = E.run('!bitdcrew deposit none --c ' + c + ' --idx ' + nc, pat);
  ok(has(o, /Earned 8 Coin, tithe 2 paid, 6 to deposit/), 'the summary carries the claim Coin', o.map(x => x.slice(0, 200)));
  const sc = mk('Hawkers3'); claim(sc, 1, 'Surplus Cache'); ok(has(run(sc, '2 0 0 0 0 0 4'), /Surplus Caches: product sale or supply/), 'the book spelling Surplus Cache also matches');

  // D2. The five later +2 Coin claims (v0.8.1): Terrorized Citizens, Offertory, Street Fence, Luxury Fence, Covert Drops
  const five = [['Terrorized Citizens', 'battle or extortion', 5], ['Offertory', 'occult operations', 6], ['Street Fence', 'lower-class targets', 7], ['Luxury Fence', 'high-class targets', 8], ['Covert Drops', 'espionage or sabotage', 9]];
  five.forEach(([nm, lbl, ix]) => {
    const k = mk('Coin' + ix); claim(k, 3, nm); const r = run(k, '2 0 0 0 0 0 4'), nk = idxOf(r);
    ok(has(r, new RegExp('\\[' + nm + ': ' + lbl + ', \\+2 Coin\\]\\(!bitdcrew claim coin' + ix + ' ')), nm + ': a +2 Coin button on the Fallout card', r.map(x => x.slice(0, 400)));
    const k1 = E.run('!bitdcrew claim coin' + ix + ' --c ' + k + ' --idx ' + nk, pat); ok(has(k1, new RegExp(nm + ' \\+2 Coin')) && has(k1, /Payoff is now 6 Coin/), nm + ': Payoff 4 becomes 6', k1);
    ok(has(E.run('!bitdcrew claim coin' + ix + ' --c ' + k + ' --idx ' + nk, pat), /Already done/), nm + ': once per Score');
    const k2 = E.run('!bitdcrew seized none --c ' + k + ' --idx ' + nk, pat); ok(has(k2, /Earned from the score: 6 Coin/), nm + ': the +2 counts toward Earned', k2);
    const ku = mk('NoCoin' + ix); claim(ku, 3, nm, false); const ru = run(ku, '2 0 0 0 0 0 4');
    ok(!has(ru, /Claims that apply only/), nm + ' unticked: no button');
    ok(has(E.run('!bitdcrew claim coin' + ix + ' --c ' + ku + ' --idx ' + idxOf(ru), pat), new RegExp(nm + ' is not ticked')), nm + ': a button for an unticked claim is refused');
  });
  // sheet spellings: a multi-line name, a translation key and the book spelling Covert Drop
  [['Terrorized\nCitizens', /Terrorized Citizens: battle or extortion/], ['claim_street_fence', /Street Fence: lower-class targets/], ['claim_luxury_fence', /Luxury Fence: high-class targets/], ['Covert Drop', /Covert Drops: espionage or sabotage/]].forEach(([nm, re]) => {
    const k = mk('Spell'); claim(k, 6, nm); ok(has(run(k, '2 0 0 0 0 0 4'), re), 'the sheet name ' + JSON.stringify(nm) + ' is recognised');
  });
  c = mk('AllTen'); ['Envoy', 'Fixer', 'Local Graft', 'Loyal Fence', 'Surplus Caches', 'Terrorized Citizens', 'Offertory', 'Street Fence', 'Luxury Fence', 'Covert Drops'].forEach((nm, i) => claim(c, i + 1, nm));
  o = run(c, '2 0 0 0 0 0 4'); const nall = idxOf(o);
  ok((fall(o).match(/!bitdcrew claim coin\d+ /g) || []).length === 10 && !/\(!bitdcrew claim coin\d{2}/.test(fall(o)), 'all ten Coin claims get their own button', o.map(x => x.slice(0, 600)));
  for (let i = 0; i < 10; i++) { E.run('!bitdcrew claim coin' + i + ' --c ' + c + ' --idx ' + nall, pat); }
  o = E.run('!bitdcrew seized none --c ' + c + ' --idx ' + nall, pat); ok(has(o, /Earned from the score: 24 Coin/), 'ten claims stack: 4 + 10 x 2 = 24 Coin', o);
  ok(has(E.run('!bitdcrew claim coin10 --c ' + c + ' --idx ' + nall, pat), /unknown claim button/) && has(E.run('!bitdcrew claim coin99 --c ' + c + ' --idx ' + nall, pat), /unknown claim button/), 'a coin index past the list is refused');
  c = mk('StatusFive'); claim(c, 1, 'Street Fence'); claim(c, 2, 'Covert Drops');
  o = E.run('!bitdcrew status', pat, E.token(c)); ok(has(o, /Street Fence \(\+2 Coin, a button on the Fallout card\); Covert Drops \(\+2 Coin, a button on the Fallout card\)/), 'Status lists the new Coin claims', o.map(x => x.slice(0, 500)));

  // E. Claim income in the Heat and Hold card
  c = mk('Smugglers'); claim(c, 2, 'Vice Den'); claim(c, 5, 'claim_side_business'); claim(c, 6, 'Info Biz'); E.attr(c, 'heat', 1);
  const tcc = E.token(c);
  o = E.run('!bitdcrew hh', pat, tcc); const dn = idxOf(o);
  ok(has(o, /Claim income \(roll your Tier in dice, highest die minus your Heat/) && has(o, /\[Vice Den income\]\(!bitdcrew hhact inc2 --c \S+ --idx \S+\)/) && has(o, /\[Side Business income\]\(!bitdcrew hhact inc5 /) && !has(o, /Info Biz/), 'the card lists the ticked income claims (Info Biz is not a core claim)', o.map(x => x.slice(0, 500)));
  o = E.run('!bitdcrew hhact inc2 --c ' + c + ' --idx ' + dn, pat);
  const roll = o.find(x => /title-fortune/.test(x)) || '';
  ok(dice(roll) === 2 && /\{\{type=fortune\}\}/.test(roll) && /\{\{notes=Vice Den income: 2 dice, highest die minus your Heat 1\.\}\}/.test(roll) && E.out.some(x => /^player\|/.test(x.who) && /title-fortune/.test(x.text)) && has(o, /Vice Den \(rolled\)/), 'a Tier 2 crew rolls 2 dice, posted as the player; the claim shows as rolled', o.map(x => x.slice(0, 300)));
  o = E.echo([3, 5]);
  ok(has(o, /Dice 3, 5\. Highest die 5, minus Heat 1 = 4 Coin\./) && has(o, /\[Add 4 Coin to the crew\]\(!bitdcrew hhact incpay2 --c \S+ --idx /), 'the dice are read and the result offered with a button', o.map(x => x.slice(0, 300)));
  o = E.run('!bitdcrew hhact incpay2 --c ' + c + ' --idx ' + dn, pat);
  ok(E.val(c, 'crewcoin_dc') === '4' && has(o, /Vice Den income: \+4 Coin to the crew/), 'the button adds the Coin (the crew has room for 4)', o.map(x => x.slice(0, 300)));
  o = E.run('!bitdcrew hhact incpay2 --c ' + c + ' --idx ' + dn, pat); ok(E.val(c, 'crewcoin_dc') === '4' && has(o, /Already done/), 'the Coin is added once');
  o = E.run('!bitdcrew hhact inc2 --c ' + c + ' --idx ' + dn, pat); ok(has(o, /Already done/) && !o.some(x => /title-fortune/.test(x)), 'a claim rolls once per Downtime');
  // the second claim: a die below the Heat earns nothing
  E.attr(c, 'heat', 6); o = E.run('!bitdcrew hhact inc5 --c ' + c + ' --idx ' + dn, pat); o = E.echo([5, 2]);
  ok(has(o, /Highest die 5, minus Heat 6 = 0 Coin\./) && has(o, /Nothing to add/) && !has(o, /Add 0/), 'Heat above the die: 0 Coin and no button', o.map(x => x.slice(0, 300)));
  o = E.run('!bitdcrew hhact incpay5 --c ' + c + ' --idx ' + dn, pat); ok(E.val(c, 'crewcoin_dc') === '4', 'and the payment code does nothing for a 0 result');
  // a new Downtime brings the claims back
  E.run('!bitdcrew adj dtstart', pat, tcc); const dn2 = idxOf(E.run('!bitdcrew hh', pat, tcc));
  ok(has(E.run('!bitdcrew hh', pat, tcc), /\[Vice Den income\]/), 'a new Downtime offers the claims again');
  // no room: the rest is for the player to record
  const d2 = mk('Room'); claim(d2, 1, 'Vice Den'); E.attr(d2, 'crewcoin_dc', 3); E.attr(d2, 'heat', 0); const td2 = E.token(d2);
  const nd2 = idxOf(E.run('!bitdcrew hh', pat, td2)); E.run('!bitdcrew hhact inc1 --c ' + d2 + ' --idx ' + nd2, pat); E.echo([4, 6]);
  o = E.run('!bitdcrew hhact incpay1 --c ' + d2 + ' --idx ' + nd2, pat); ok(E.val(d2, 'crewcoin_dc') === '4' && has(o, /\+1 Coin to the crew \(5 did not fit in the vaults/), 'only the vault room is added', o.map(x => x.slice(0, 300)));
  // Tier 0: 2d, keep the lowest
  const d3 = mk('Tier0', 0); claim(d3, 1, 'Drug Den'); E.attr(d3, 'heat', 0); const td3 = E.token(d3); const nd3 = idxOf(E.run('!bitdcrew hh', pat, td3));
  o = E.run('!bitdcrew hhact inc1 --c ' + d3 + ' --idx ' + nd3, pat); const r3 = o.find(x => /title-fortune/.test(x)) || '';
  ok(/zerodice=/.test(r3) && dice(r3) === 2 && /no dice, 2d keep the lowest/.test(r3), 'Tier 0 rolls 2d and keeps the lowest', r3);
  o = E.echo([6, 2]); ok(has(o, /Lowest die 2, minus Heat 0 = 2 Coin/), 'the lowest die is used', o.map(x => x.slice(0, 200)));
  // Heat is the Heat at the moment of the click
  const d4 = mk('HeatMoment'); claim(d4, 1, 'Gambling Den'); E.attr(d4, 'heat', 2); const td4 = E.token(d4); const nd4 = idxOf(E.run('!bitdcrew hh', pat, td4));
  E.run('!bitdcrew hhact inc1 --c ' + d4 + ' --idx ' + nd4, pat); E.attr(d4, 'heat', 5); o = E.echo([6, 3]); ok(has(o, /Highest die 6, minus Heat 2 = 4 Coin/), 'Heat is read when the roll is made', o.map(x => x.slice(0, 200)));
  // dice that cannot be read, a roll that never comes back, a Downtime that ended
  const d5 = mk('Unread'); claim(d5, 1, 'Vice Den'); const td5 = E.token(d5); const nd5 = idxOf(E.run('!bitdcrew hh', pat, td5));
  E.run('!bitdcrew hhact inc1 --c ' + d5 + ' --idx ' + nd5, pat); o = E.echo(undefined); ok(has(o, /could not read the dice of the Vice Den roll/), 'unreadable dice: told to work it out by hand', o.map(x => x.slice(0, 200)));
  const d6 = mk('Silent'); claim(d6, 1, 'Vice Den'); const td6 = E.token(d6); const nd6 = idxOf(E.run('!bitdcrew hh', pat, td6));
  E.out.length = 0; E.run('!bitdcrew hhact inc1 --c ' + d6 + ' --idx ' + nd6, pat); E.out.length = 0; E.flush();
  ok(E.out.some(x => /Vice Den roll could not be read/.test(x.text)), 'a roll that never comes back is reported after a while', E.out.map(x => x.text.slice(0, 120)));
  const d7 = mk('Ended'); claim(d7, 1, 'Vice Den'); const td7 = E.token(d7); const nd7 = idxOf(E.run('!bitdcrew hh', pat, td7));
  E.run('!bitdcrew hhact inc1 --c ' + d7 + ' --idx ' + nd7, pat); E.run('!bitdcrew hhact end --c ' + d7 + ' --idx ' + nd7, pat); o = E.echo([4, 4]);
  ok(has(o, /no longer open, so there is no button/) && !has(o, /hhact incpay/), 'the Downtime ended before the dice: no button', o.map(x => x.slice(0, 200)));
  // permissions and the unticked claim
  o = E.run('!bitdcrew hhact inc2 --c ' + c + ' --idx ' + dn2, quinn); ok(has(o, /only use this on crews you control/), 'a non-controller cannot roll income');
  claim(c, 2, 'Vice Den', false); o = E.run('!bitdcrew hhact inc2 --c ' + c + ' --idx ' + dn2, pat); ok(has(o, /no longer ticked/), 'a claim that was unticked since the card was posted');
  o = E.run('!bitdcrew hhact incpay9 --c ' + c + ' --idx ' + dn2, pat); ok(has(o, /no income waiting/), 'payment with nothing rolled');
  E.flush();

  // F. Status lists what the script counts
  c = mk('Statusy'); claim(c, 1, 'Cover Operation'); claim(c, 2, 'Victim Trophies'); claim(c, 3, 'Envoy'); claim(c, 4, 'Vice Den'); claim(c, 5, 'Secret Pathways'); claim(c, 6, 'Publicity');
  o = E.run('!bitdcrew status', pat, E.token(c));
  ok(has(o, /Claims the script counts: Cover Operation \(-2 Heat per score\); Victim Trophies \(\+1 Rep per score\); Publicity \(\+2 Rep, a button on the Fallout card\); Envoy \(\+2 Coin, a button on the Fallout card\); Vice Den \(income, a button in Heat and Hold\); Secret Pathways \(\+1d engagement, stealth plans\)\./), 'Status lists the claims in play', o.map(x => x.slice(0, 600)));
  c = E.crew('CoreStatus', pat); claim(c, 1, 'Cover Operation'); claim(c, 2, 'Victim Trophies'); claim(c, 3, 'Vice Den'); claim(c, 4, 'Personal Clothier');
  o = E.run('!bitdcrew status', pat, E.token(c)); ok(has(o, /Claims the script counts: Cover Operation \(-2 Heat per score\); Personal Clothier \(\+1d engagement, social plans\)\./), 'a core crew lists only the Heat and engagement claims', o.map(x => x.slice(0, 400)));
  o = E.run('!bitdcrew status', pat, E.token(E.crew('Plain', pat))); ok(!has(o, /Claims the script counts/), 'no claims, no line');
  // River claims are not automated
  c = mk('River'); claim(c, 1, 'Chief Magistrate'); claim(c, 2, 'State Treasurer'); claim(c, 3, 'Editor-in-Chief'); o = run(c, '2 0 0 0 0 0 4');
  ok(/Heat \+4 /.test(heatLine(o)) && !has(o, /Claims that apply only/) && !has(E.run('!bitdcrew status', pat, E.token(c)), /Claims the script counts/), 'River claims change nothing', heatLine(o));
}

// ---------------------------------------------------------------- T25 the Downtime button, and Begin score after the engagement roll
{
  const { E, gm, pat, quinn } = table();
  const names = (c) => { E.run('!bitdcrew setup', pat, E.token(c)); return E.abil(c).map(x => x.name).join('|'); };
  const dtc = dtCrew(E, pat, 'Hawkers', 2), core = E.crew('Bravos', pat);
  ok(names(dtc) === '1. Roll|2. Engagement|3. Fortune|4. Score|5. Downtime|6. Abilities|6a. Contacts|6b. Claims|6c. Crew Upgrades|7. Adjust|8. Clocks|9. Status|~ Rebuild', 'a Downtime crew has 13 token actions with 5. Downtime after Score', names(dtc));
  ok(names(core) === '1. Roll|2. Engagement|3. Fortune|4. Score|6. Abilities|6a. Contacts|6b. Claims|6c. Crew Upgrades|7. Adjust|8. Clocks|9. Status|~ Rebuild', 'a core crew has the gap at 5');
  ok(E.abil(dtc).find(x => x.name === '5. Downtime').action === '!bitdcrew hh' && E.abil(dtc).every(x => x.istokenaction === true && x.description === 'bitd-crew-tam'), 'the Downtime button runs the Heat and Hold command, no prompt');
  const adjOf = (c) => queries(E.abil(c).find(x => x.name === '7. Adjust').action)[0];
  const optsD = adjOf(dtc).slice(1).map(x => x.split(',').slice(-1)[0]), optsC = adjOf(core).slice(1).map(x => x.split(',').slice(-1)[0]);
  ok(optsD.length === 22 && optsC.length === 20, 'Adjust has 22 entries with Downtime on and 20 without', [optsD.length, optsC.length]);
  ok(['heat+1', 'heat-1', 'wanted+1', 'wanted-1', 'incarc', 'rep+1', 'rep-1', 'turf+1', 'turf-1', 'coin+1', 'coin+2', 'coin+4', 'coin-1', 'coin-2', 'coin-4', 'tier+1', 'tier-1', 'hold-strong', 'hold-weak', 'xp+1'].every(c => optsC.indexOf(c) >= 0) && optsD.indexOf('debt+1') >= 0 && optsD.indexOf('debt-1') >= 0 && optsC.indexOf('debt+1') < 0, 'the corrections stay: counters, Incarceration, Hold, XP, and Debt for Downtime crews');
  ok(['rh-coin', 'rh-rep', 'holdassess', 'hh', 'dtstart', 'beginscore'].every(c => optsD.indexOf(c) < 0), 'the Downtime and Score steps are gone from Adjust');
  // the button: opens the Heat and Hold card, starting a Downtime if none is open
  E.attr(dtc, 'heat', 3);
  let o = E.run('!bitdcrew hh', pat, E.token(dtc));
  ok(has(o, /Downtime started/) && has(o, /title=Downtime/) && has(o, /Reduce Heat by 1 for each Coin or Rep/) && has(o, /Assess hold/) && has(o, /End Downtime/), 'first click starts a Downtime and shows the Heat and Hold card', o.map(x => x.slice(0, 160)));
  const led = idxOf(o);
  o = E.run('!bitdcrew hh', pat, E.token(dtc)); ok(!has(o, /Downtime started/) && idxOf(o) === led, 'a second click shows the same open Downtime');
  o = E.run('!bitdcrew hh', pat, E.token(core)); ok(has(o, /Heat and Hold is a Deep Cuts Downtime step/), 'the command refuses a core crew');
  o = E.run('!bitdcrew hh', quinn, E.token(dtc)); ok(has(o, /only use this on crews you control/), 'a player who does not control the crew is refused');
  // Reduce Heat from the card is logged for End Downtime (the old Adjust entries were not)
  E.attr(dtc, 'crewcoin_dc', 2);
  E.run('!bitdcrew hhact rh-coin --c ' + dtc + ' --idx ' + led, pat); o = E.run('!bitdcrew hhact end --c ' + dtc + ' --idx ' + led, pat);
  ok(has(o, /Spent 1 Coin for Heat -1\./), 'what is done on the card shows in the End Downtime summary', o.map(x => x.slice(0, 200)));
  // stale macros keep working
  o = E.run('!bitdcrew adj dtstart', pat, E.token(dtc)); ok(has(o, /Downtime started/), 'an old Adjust entry still works until the crew is rebuilt');
  o = E.run('!bitdcrew hh', pat, E.token(dtc)); ok(has(o, /Heat and Hold/) && !has(o, /Downtime started/), 'and the new button joins the Downtime it opened');
  o = E.run('!bitdcrew hhact end --c ' + dtc + ' --idx ' + idxOf(o), pat); ok(has(o, /Downtime ended/), 'End Downtime still ends it');
  o = E.run('!bitdcrew hh', pat, E.token(dtc)); ok(has(o, /Downtime started/), 'after End Downtime the button starts a fresh one');
}

// ---------------------------------------------------------------- T25b Begin score is offered after the engagement roll
{
  const { E, gm, pat, quinn } = table();
  const crew = (name, action, tick) => { const c = dtCrew(E, pat, name, 2); if (action !== false) E.attr(c, 'setting_dc_action', '1'); if (tick !== false) { E.attr(c, 'repeating_crewability_-B_name', 'Bound in Darkness'); E.attr(c, 'repeating_crewability_-B_check', '1'); } return c; };
  const ana = E.char('Ana', pat), bo = E.char('Bo', quinn), cy = E.char('Cy', '');
  E.party(ana); E.party(bo); E.attr(ana, 'edge_amount', 0);
  const c1 = crew('Cult'), t1 = E.token(c1);
  let o = E.run('!bitdcrew engagement stealth 0 0 0 0', pat, t1);
  ok(o.length === 3 && /type=Engagement/.test(o[0]) && /title-engagement/.test(o[1]) && /title=Begin score/.test(o[2]) && E.out.every(x => /^player\|/.test(x.who)), 'after the roll, a public Begin score card follows the arithmetic and the roll', o.map(x => x.slice(0, 90)));
  ok(/\[All party PCs \+1 Edge\]\(!bitdcrew edge all --c \S+ --idx \S+\)/.test(o[2]) && /\[Ana \+1 Edge\]/.test(o[2]) && /\[Bo \+1 Edge\]/.test(o[2]) && !/Cy/.test(o[2]), 'it offers All and each Party PC', o[2]);
  const n = idxOf([o[2]]); o = E.run('!bitdcrew edge all --c ' + c1 + ' --idx ' + n, pat);
  ok(E.val(ana, 'edge_amount') === '1' && E.val(bo, 'edge_amount') === '1' && E.val(cy, 'edge_amount') === undefined, 'its buttons work as the old Adjust card did', o.map(x => x.slice(0, 120)));
  // each engagement roll offers its own card
  o = E.run('!bitdcrew engagement assault 0 0 0 0', pat, t1); const n2 = idxOf([o[2]]); ok(n2 && n2 !== n, 'every roll gets its own Begin score card');
  // asked first, offered only after Roll
  const c2 = crew('Cult2'); E.attr(c2, 'repeating_crewability_-P_name', 'Predators'); E.attr(c2, 'repeating_crewability_-P_check', '1');
  o = E.run('!bitdcrew engagement stealth 0 0 0 0', pat, E.token(c2)); const nn = idxOf(o);
  ok(o.length === 1 && /title=Confirm/.test(o[0]) && !has(o, /Begin score/), 'while the card asks questions there is no Begin score card yet', o.map(x => x.slice(0, 80)));
  o = E.run('!bitdcrew engroll --c ' + c2 + ' --idx ' + nn, pat); ok(o.length === 3 && /title=Begin score/.test(o[2]), 'it comes after Roll', o.map(x => x.slice(0, 80)));
  // not offered
  o = E.run('!bitdcrew engagement stealth 0 0 0 0', pat, E.token(crew('NoAbility', true, false))); ok(!has(o, /Begin score/) && o.length === 2, 'Bound in Darkness not ticked: nothing');
  o = E.run('!bitdcrew engagement stealth 0 0 0 0', pat, E.token(crew('NoAction', false, true))); ok(!has(o, /Begin score/) && o.length === 2, 'Action module off: nothing');
  o = E.run('!bitdcrew engagement stealth 0 0 0 0', pat, E.token(E.crew('Core', pat))); ok(!has(o, /Begin score/) && o.length === 2, 'a core crew: nothing');
  // ticked and enabled but nobody in the party: a hint, no card
  { const T = table(); const E2 = T.E; const k = E2.crew('Lonely', T.pat); E2.attr(k, 'setting_dc_action', '1'); E2.attr(k, 'repeating_crewability_-B_name', 'Bound in Darkness'); E2.attr(k, 'repeating_crewability_-B_check', '1');
    const o2 = E2.run('!bitdcrew engagement stealth 0 0 0 0', T.pat, E2.token(k));
    ok(!o2.some(x => /title=Begin score/.test(x)) && o2.some(x => /Bound in Darkness is ticked, but no player characters are marked as Party members/.test(x)) && o2.length === 3, 'no Party PCs: the roll happens, a hint says why no Edge was offered', o2.map(x => x.slice(0, 100))); }
  // the manual command still works
  o = E.run('!bitdcrew adj beginscore', pat, t1); ok(has(o, /title=Begin score/) && has(o, /All party PCs/), 'the manual command is still there');
  E.flush();
}

// ---------------------------------------------------------------- T26 6a. Contacts
{
  const { E, gm, pat, quinn } = table();
  const TRI = String.fromCharCode(0x25B2);
  const contact = (c, id, name, check, notes) => {
    E.attr(c, 'repeating_contact_' + id + '_name', name);
    if (check !== undefined) E.attr(c, 'repeating_contact_' + id + '_check', check);
    if (notes !== undefined) E.attr(c, 'repeating_contact_' + id + '_description', notes);
  };
  const crew = E.crew('Hawkers', pat), tok = E.token(crew);
  contact(crew, '-C1', 'Rolan Wott, a magistrate', '1', 'Feckless son at the Academy.\nOwes the crew a favor.');
  contact(crew, '-C2', 'Laroze, a Bluecoat', '0', 'Informant in the City Watch.');
  contact(crew, '-C3', '   ', '1', 'A row with no name');
  contact(crew, '-C4', 'Lydra, a deal broker', '1');
  contact(crew, '-C5', 'Hoxley [the smuggler] (old friend)', undefined, '   ');
  E.attr(crew, '_reporder_repeating_contact', '-C2,-C1,-C3,-C4,-C5');
  const before = JSON.stringify(E.store.attrs.filter(a => a._characterid === crew).map(a => [a.name, a.current]));

  // the bar: 6a sorts right after 6 and before 7, character by character
  const core = E.crew('Bravos', pat), dtc = E.crew('Smugglers', pat); E.attr(dtc, 'setting_dc_downtime', '1');
  [core, dtc].forEach(c => { E.run('!bitdcrew setup', pat, E.token(c)); const n = E.abil(c).map(x => x.name); ok(n.slice().sort().join('|') === n.join('|') && n.indexOf('6a. Contacts') === n.indexOf('6. Abilities') + 1 && n.indexOf('6b. Claims') === n.indexOf('6a. Contacts') + 1 && n.indexOf('6c. Crew Upgrades') === n.indexOf('6b. Claims') + 1 && n.indexOf('7. Adjust') === n.indexOf('6c. Crew Upgrades') + 1, 'the token action bar sorts 6a. Contacts, 6b. Claims and 6c. Crew Upgrades between Abilities and Adjust', n); });
  ok(E.abil(core).find(x => x.name === '6a. Contacts').action === '!bitdcrew contacts' && E.abil(dtc).find(x => x.name === '6a. Contacts').action === '!bitdcrew contacts', 'the button runs the contacts command, no prompt, on both kinds of crew');

  // the menu card
  let o = E.run('!bitdcrew contacts', pat, tok);
  ok(o.length === 1 && /^\/w "Pat" /.test(o[0]) && /\{\{type=Contacts\}\}/.test(o[0]) && /\{\{title=Show to the table\}\}/.test(o[0]), 'the menu is a whisper to the clicker', o);
  const lines = (o[0].match(/\[[^\]]*\]\(!bitdcrew contact [^)]*\)/g) || []);
  ok(lines.length === 4 && lines.map(x => x.replace(/\]\(.*$/, '').slice(1)).join('|') === 'Laroze, a Bluecoat|' + TRI + ' Rolan Wott, a magistrate|' + TRI + ' Lydra, a deal broker|Hoxley the smuggler old friend', 'one button per named contact in sheet order, a triangle only on favorites, blank rows skipped, brackets and parentheses taken out of labels', lines);
  ok(lines.every(x => /\(!bitdcrew contact --c \S+ --row -C\d\)$/.test(x)), 'each button carries the character and the row');
  ok(o[0].indexOf(TRI + ' marks a favorite contact.') > 0, 'the card explains the marker');
  ok(lines[0].indexOf(TRI) < 0 && lines[3].indexOf(TRI) < 0, 'a contact whose box is unchecked or missing is not a favorite');
  const longc = E.crew('Longname', pat); contact(longc, '-L1', 'A'.repeat(90), '1', 'x');
  const ll = (E.run('!bitdcrew contacts', pat, E.token(longc))[0].match(/\[([^\]]*)\]\(/) || [])[1] || '';
  ok(ll.length <= 60 && ll.indexOf(TRI) === 0, 'a very long name is shortened to fit a button', ll.length);
  const none = E.crew('Empty', pat); o = E.run('!bitdcrew contacts', pat, E.token(none));
  ok(/There are no contacts on this sheet\./.test(o[0]) && !/contact --c/.test(o[0]), 'a sheet with no contacts says so');
  ok(has(E.run('!bitdcrew contacts', quinn, tok), /only use this on crews you control/) && has(E.run('!bitdcrew contacts', gm, tok), /Show to the table/), 'players only on crews they control; the GM on any');
  ok(has(E.run('!bitdcrew contacts', pat, E.token(E.char('Ayla', pat))), /crew sheets only/), 'a PC sheet is refused');

  // a click shows the notes to the table
  const show = (row, who) => E.run('!bitdcrew contact --c ' + crew + ' --row ' + row, who || pat);
  o = show('-C1');
  ok(o.length === 1 && E.out.length === 1 && /^player\|/.test(E.out[0].who), 'the output is public, posted as the player', E.out.map(x => x.who));
  ok(/\{\{charname=Hawkers\}\}/.test(o[0]) && /\{\{type=Favorite contact\}\}/.test(o[0]) && o[0].indexOf('{{title=' + TRI + ' Rolan Wott, a magistrate}}') > 0, 'a favorite: header says Favorite contact and the title carries the triangle', o[0]);
  ok(o[0].indexOf('{{content=Feckless son at the Academy.\nOwes the crew a favor.}}') > 0, 'the notes are shown with their line breaks', o[0]);
  o = show('-C2'); ok(/\{\{type=Contact\}\}/.test(o[0]) && o[0].indexOf('{{title=Laroze, a Bluecoat}}') > 0 && o[0].indexOf(TRI) < 0 && /\{\{content=Informant in the City Watch\.\}\}/.test(o[0]), 'a contact that is not a favorite has no triangle', o[0]);
  o = show('-C4'); ok(/Favorite contact/.test(o[0]) && /No notes on the sheet for this contact\./.test(o[0]), 'a favorite with no notes says so', o[0]);
  o = show('-C5'); ok(/No notes on the sheet for this contact\./.test(o[0]) && o[0].indexOf('{{title=Hoxley (the smuggler) (old friend)}}') > 0, 'blank notes count as none; brackets in a name become parentheses in the title', o[0]);
  contact(crew, '-CA', 'Evil [x](!bitdcrew adj heat+1)\nsecond line', '0', 'n');
  o = show('-CA'); ok(!/\]\(/.test(o[0]) && o[0].indexOf('{{title=Evil (x)(!bitdcrew adj heat+1) second line}}') > 0, 'a name cannot make a live button or break the title across lines', o[0]);
  o = show('-C3'); ok(has(o, /no longer on the sheet/) && E.out.every(x => !/^player\|/.test(x.who)), 'a row with no name cannot be shown');
  o = show('-C9'); ok(has(o, /no longer on the sheet/), 'a deleted contact says so');
  o = E.run('!bitdcrew contact --c ' + crew, pat); ok(has(o, /no longer on the sheet/), 'no row given');
  o = show('-C1', quinn); ok(has(o, /only use this on crews you control/) && !has(o, /Favorite contact/), 'a player who does not control the crew is refused');
  ok(has(show('-C1', gm), /Favorite contact/), 'the GM can show any crew\'s contact');

  // text from the sheet cannot roll dice, make buttons or open templates
  contact(crew, '-C6', 'Risky notes', '0', 'See [[2d6]] and [roll](!bitdcrew adj heat+1) @{x|heat} %{a|b} ?{q} &{template:x} {{evil}} a|b');
  o = show('-C6'); const body = (/\{\{content=([\s\S]*)\}\}$/.exec(o[0]) || [])[1] || '';
  ok(body.length > 0 && !/[\[\]]/.test(body) && !/[@%?&]\{/.test(body) && !/\{\{|\}\}/.test(body) && !/\|/.test(body) && /See \(\(2d6\)\)/.test(body) && !/\]\(/.test(body), 'brackets, macro openers, braces and bars are neutralized in notes', body);
  contact(crew, '-C7', 'Long notes', '0', ('word '.repeat(600)).trim());
  o = show('-C7'); const lb = (/\{\{content=([\s\S]*)\}\}$/.exec(o[0]) || [])[1] || '';
  ok(lb.length < 2150 && /\.\.\. \(the notes were cut at 2000 characters\)$/.test(lb), 'notes over 2000 characters are cut, and the card says so', lb.length);
  contact(crew, '-C8', 'Gappy', '0', 'a\n\n\n\n\nb   \n  ');
  o = show('-C8'); ok(/\{\{content=a\n\nb\}\}/.test(o[0]), 'runs of blank lines and trailing spaces are tidied', o[0]);
  contact(crew, '-C9', 'Check spelled 1', ' 1 ', 'x'); ok(!/Favorite/.test(show('-C9')[0]), 'only a checked box (1) counts as a favorite');

  // nothing on the sheet is written
  const after = JSON.stringify(E.store.attrs.filter(a => a._characterid === crew && !/^repeating_contact_-C[6-9A]_/.test(a.name)).map(a => [a.name, a.current]));
  ok(after === before, 'the contacts command writes nothing to the crew sheet');
}

// ---------------------------------------------------------------- T27 6b. Claims
{
  const { E, gm, pat, quinn } = table();
  const ON = String.fromCharCode(0x25CF), OFF = String.fromCharCode(0x25CB);
  const TEXT = E.env.BitDCrewTAM._claimText;
  // the claims each core crew type has on its sheet (from the sheet's crew data); every one needs book text
  const SHEET_CLAIMS = {
    assassins: ['training rooms', 'vice den', 'fixer', 'informants', 'hagfish farm', 'victim trophies', 'cover operation', 'protection racket', 'infirmary', 'envoy', 'cover identities', 'city records'],
    bravos: ['barracks', 'terrorized citizens', 'informants', 'protection racket', 'fighting pits', 'infirmary', 'bluecoat intimidation', 'street fence', 'warehouses', 'bluecoat confederates'],
    cult: ['cloister', 'vice den', 'offertory', 'ancient obelisk', 'ancient tower', 'spirit well', 'ancient gate', 'sanctuary', 'sacred nexus', 'ancient altar'],
    hawkers: ['personal clothier', 'local graft', 'lookouts', 'informants', 'luxury venue', 'foreign market', 'vice den', 'surplus caches', 'cover operation', 'cover identities'],
    shadows: ['interrogation chamber', 'loyal fence', 'gambling den', 'tavern', 'drug den', 'informants', 'lookouts', 'hagfish farm', 'infirmary', 'covert drops', 'secret pathways'],
    smugglers: ['side business', 'luxury fence', 'vice den', 'tavern', 'ancient gate', 'secret routes', 'informants', 'fleet', 'cover operation', 'warehouse']
  };
  const bookText = (key, type) => { const e = (TEXT[key] || []).find(x => x[0].indexOf(type) >= 0); return e ? e[1] : undefined; };
  const missing = []; Object.keys(SHEET_CLAIMS).forEach(ty => SHEET_CLAIMS[ty].forEach(k => { if (!bookText(k, ty)) missing.push(ty + ': ' + k); }));
  ok(missing.length === 0, 'every claim on the six core crew types has book text for that crew', missing);
  const alltext = [].concat.apply([], Object.keys(TEXT).map(k => TEXT[k].map(e => e[1])));
  ok(alltext.length === 51 && alltext.every(x => /^[\x20-\x7e]+$/.test(x) && x.length > 30 && /^[A-Z+\-]/.test(x)), 'the data table is plain ASCII, sensibly formed, 51 texts', alltext.length);
  ok(bookText('cover operation', 'assassins') === 'You get -2 heat per score. The cover of a legitimate operation helps deflect some of the heat from law enforcement.', 'verbatim: Cover Operation for Assassins');
  ok(bookText('cover operation', 'smugglers') === 'You get -2 heat per score. What\'s your cover? Who did you seize it from?' && bookText('cover operation', 'hawkers') === bookText('cover operation', 'assassins') || bookText('cover operation', 'hawkers') !== undefined, 'Cover Operation is worded differently for Smugglers');
  ok(/new targets\.$/.test(bookText('informants', 'assassins')) && /new clients\.$/.test(bookText('informants', 'hawkers')), 'Informants differs by crew in its last word');
  ok(bookText('ancient gate', 'cult') !== bookText('ancient gate', 'smugglers') && /the spirits of the deathlands/.test(bookText('ancient gate', 'cult')), 'Ancient Gate differs between Cult and Smugglers');
  ok(/"collection"/.test(bookText('victim trophies', 'assassins')) && /"protection\."$/.test(bookText('protection racket', 'assassins')), 'quotation marks restored in the text');
  ok(!!TEXT['surplus caches'] && !!TEXT['covert drops'] && !!TEXT['warehouse'] && !!TEXT['warehouses'] && !TEXT['surplus cache'], 'the sheet\'s spelling is the key (Surplus Caches, Covert Drops, Warehouse)');

  // helpers
  const mkCrew = (name, type, claims, dt, act) => {
    const c = E.crew(name, pat); if (type !== undefined) E.attr(c, 'crew_type', type);
    if (dt) E.attr(c, 'setting_dc_downtime', '1'); if (act) E.attr(c, 'setting_dc_action', '1');
    claims.forEach(cl => { E.attr(c, 'claim_' + cl[0] + '_name', cl[1]); if (cl[2] !== undefined) E.attr(c, 'claim_' + cl[0] + '_check', cl[2] ? '1' : '0'); if (cl[3] !== undefined) E.attr(c, 'claim_' + cl[0] + '_desc', cl[3]); });
    return c;
  };
  const menu = (c, who) => E.run('!bitdcrew claims', who || pat, E.token(c));
  const info = (c, arg, who) => E.run('!bitdcrew claiminfo --c ' + c + ' ' + arg, who || pat);
  const body = (o) => (/\{\{content=([\s\S]*)\}\}$/.exec(o[0]) || [])[1] || '';
  const btns = (o) => (o[0].match(/\[[^\]]*\]\(!bitdcrew claiminfo [^)]*\)/g) || []);

  // the menu
  const asn = mkCrew('Assassins', 'Assassins', [[1, 'Training Rooms', true], [2, 'claim_vice_den', false], [3, 'Fixer', true, '+2 coin for\nlower-class targets'], [4, 'Informants', true], [7, 'Turf', true], [9, 'Turf', false], [10, 'Cover\nOperation', false]]);
  let o = menu(asn);
  ok(o.length === 1 && /^\/w "Pat" /.test(o[0]) && /\{\{type=Claims\}\}/.test(o[0]) && /\{\{title=Show to the table\}\}/.test(o[0]), 'the menu is a whisper to the clicker', o[0].slice(0, 120));
  const b = btns(o);
  ok(b.map(x => x.replace(/\]\(.*$/, '').slice(1)).join('|') === [ON + ' Training Rooms', OFF + ' Vice Den', ON + ' Fixer', ON + ' Informants', ON + ' Turf: 1 of 2 held', OFF + ' Cover Operation'].join('|').replace(/([●○]) /g, '$1 '), 'one button per claim in slot order, held or not held marked, the two turf slots merged into one button where the first sits', b);
  ok(/--n 1\)$/.test(b[0]) && /--n 2\)$/.test(b[1]) && /--row turf\)$/.test(b[4]) && /--n 10\)$/.test(b[5]), 'buttons carry the slot, turf carries the group');
  ok(body(o).indexOf(ON + ' held by the crew, ' + OFF + ' not held.') > 0, 'the card explains the markers');
  ok(has(menu(mkCrew('Empty', 'x', [])), /There are no claims on this sheet\./), 'a sheet with no claims says so');
  ok(has(menu(asn, quinn), /only use this on crews you control/) && has(menu(asn, gm), /Show to the table/), 'players only on crews they control; the GM on any');
  ok(has(E.run('!bitdcrew claims', pat, E.token(E.char('Ayla', pat))), /crew sheets only/), 'a PC sheet is refused');
  const odd = mkCrew('Odd', 'x', [[1, 'Bad [x](!bitdcrew adj heat+1) name', true], [2, 'claim_above_the_law', false], [3, 'claim_doskvol\'s_most_wanted', true]]);
  const ob = btns(menu(odd)).map(x => x.replace(/\]\(.*$/, '').slice(1));
  ok(ob.join('|') === [ON + ' Bad x!bitdcrew adj heat+1 name', OFF + ' Above the Law', ON + ' Doskvol\'s Most Wanted'].join('|'), 'names are tidied: brackets out, keys turned into words, small words kept lower case', ob);

  // the card
  o = info(asn, '--n 3');
  ok(o.length === 1 && E.out.length === 1 && /^player\|/.test(E.out[0].who), 'a click is shown to the table, as the player');
  ok(/\{\{type=Claim held\}\}/.test(o[0]) && o[0].indexOf('{{title=' + ON + ' Fixer}}') > 0 && /charname=Assassins/.test(o[0]), 'a held claim: header and title say so', o[0]);
  ok(body(o) === 'Held by this crew.\nRules (core book): You get +2 coin in payoff for scores that involve lower-class clients. This well-respected agent will help arrange for a better payoff from poorer clients.\nOn the sheet: +2 coin for lower-class targets', 'the held line, the book text, and the sheet text on one line each', body(o));
  o = info(asn, '--n 2');
  ok(/\{\{type=Claim not held\}\}/.test(o[0]) && o[0].indexOf('{{title=' + OFF + ' Vice Den}}') > 0 && /Not held by this crew\./.test(o[0]) && /Rules \(core book\): Any time during downtime, roll dice equal to your Tier\. You earn coin equal to the highest result, minus your heat\.\n?/.test(o[0]) && !/Is this claim a den/.test(o[0]) && !/On the sheet/.test(o[0]), 'a claim not held, in the Assassins wording, with no sheet text line when the sheet has none', o[0]);
  ok(/Cover Operation/.test(info(asn, '--n 10')[0]) && /helps deflect some of the heat/.test(info(asn, '--n 10')[0]), 'a name split over two lines on the sheet still finds its text');
  // the crew type decides the wording; an unknown type is worked out from the claims
  const hk = mkCrew('Hawkers', 'hawkers', [[5, 'Informants', true], [3, 'Local Graft', false]]);
  ok(/new clients\./.test(info(hk, '--n 5')[0]) && /new targets\./.test(info(asn, '--n 4')[0]), 'Informants reads "clients" for Hawkers and "targets" for Assassins');
  // the stated crew type decides when the claims alone cannot (Informants is on five crew types)
  ok(/new clients\./.test(info(mkCrew('OnlyInf1', 'Hawkers', [[5, 'Informants', true]]), '--n 5')[0]) && /new targets\./.test(info(mkCrew('OnlyInf2', 'ASSASSINS', [[5, 'Informants', true]]), '--n 5')[0]) && /new targets\./.test(info(mkCrew('OnlyInf3', 'Bravos crew', [[5, 'Informants', true]]), '--n 5')[0]) && /new clients\./.test(info(mkCrew('OnlyInf4', ' smugglers ', [[5, 'Informants', true]]), '--n 5')[0]), 'the crew type text is matched without case or extra words');
  const hk2 = mkCrew('Red Sashes', 'The Red Sashes', [[2, 'Personal Clothier', true], [3, 'Local Graft', true], [5, 'Informants', true], [12, 'Vice Den', true]]);
  ok(/new clients\./.test(info(hk2, '--n 5')[0]) && /Is this claim a den you've overtaken/.test(info(hk2, '--n 12')[0]), 'a crew type the script does not recognise is matched by its claims');
  const hk3 = mkCrew('NoType', undefined, [[2, 'Personal Clothier', true], [3, 'Local Graft', true], [5, 'Informants', true]]);
  ok(/new clients\./.test(info(hk3, '--n 5')[0]), 'and so is a crew with no type');
  // the sheet's own spellings
  const sh = mkCrew('Shadows', 'shadows', [[13, 'Covert Drops', true]]), sm = mkCrew('Smugglers', 'smugglers', [[15, 'Warehouse', false], [13, 'Fleet', true]]), hw = mkCrew('H2', 'Hawkers', [[13, 'Surplus Caches', true]]), br = mkCrew('Bravos', 'bravos', [[14, 'Warehouses', true]]);
  ok(/espionage or sabotage/.test(info(sh, '--n 13')[0]) && /smuggling runs/.test(info(sm, '--n 15')[0]) && /product sale or supply/.test(info(hw, '--n 13')[0]) && /after your battles/.test(info(br, '--n 14')[0]), 'Covert Drops, Warehouse (Smugglers), Surplus Caches and Warehouses (Bravos) all find their text');
  ok(/Fleet|Your cohorts have their own vehicles/.test(info(sm, '--n 13')[0]), 'Fleet has book text');

  // Deep Cuts replaces the wording when the module is on
  const w0 = mkCrew('Bravos core', 'bravos', [[14, 'Warehouses', true]]), w1 = mkCrew('Bravos DT', 'bravos', [[14, 'Warehouses', true]], true);
  o = info(w0, '--n 14'); const b0 = body(o).split('\n');
  ok(b0.length === 3 && /^Rules in force \(core book\): You get \+1d to acquire asset rolls\./.test(b0[1]) && b0[2] === 'Deep Cuts text (Downtime module, off for this crew): The crew gains an additional Acquire activity each Downtime. (Deep Cuts p88)', 'Warehouses with Downtime off: the core text is in force and the Deep Cuts text is shown', b0);
  o = info(w1, '--n 14'); const b1 = body(o).split('\n');
  ok(b1.length === 3 && b1[1] === 'Rules in force (Deep Cuts, Downtime module): The crew gains an additional Acquire activity each Downtime. (Deep Cuts p88)' && /^Core book text \(replaced while the module is on\): You get \+1d to acquire asset rolls\./.test(b1[2]), 'with Downtime on the Deep Cuts text is in force and the core text is marked replaced', b1);
  const i0 = mkCrew('Hawkers act off', 'hawkers', [[5, 'Informants', true]]), i1 = mkCrew('Hawkers act on', 'hawkers', [[5, 'Informants', true]], false, true);
  ok(/Rules in force \(core book\): You get \+1d to gather information/.test(body(info(i0, '--n 5'))) && /Deep Cuts text \(Action module, off for this crew\): You get \+1 tick on your long-term project clock when you work on an investigation during downtime\./.test(body(info(i0, '--n 5'))), 'Informants with the Action module off');
  ok(/Rules in force \(Deep Cuts, Action module\): You get \+1 tick on your long-term project clock/.test(body(info(i1, '--n 5'))) && /Core book text \(replaced while the module is on\): You get \+1d to gather information/.test(body(info(i1, '--n 5'))), 'and with it on');
  ok(!/Deep Cuts/.test(body(info(asn, '--n 3'))), 'a claim Deep Cuts does not change shows only its own text');

  // Infirmary (Assassins, Bravos, Shadows; Vigilantes show the same) and Sacred Nexus (Cult): +1d to healing rolls becomes a healing clock tick with the Downtime module
  const HEAL = '+1 tick to healing clock in downtime, in place of +1d to healing rolls. (Deep Cuts p88: "+1d to healing rolls instead counts as 1 tick on the healing clock." The Deep Cuts crew sheets v1.2b word the claim the same way.)';
  [['Assassins', 'assassins', 'Infirmary', /^Rules in force \(core book\): You get \+1d to healing treatment rolls\. The infirmary also has beds/], ['Bravos', 'bravos', 'Infirmary', /^Rules in force \(core book\): You get \+1d to healing treatment rolls\. The infirmary also has beds/],
    ['Shadows', 'shadows', 'Infirmary', /^Rules in force \(core book\): You get \+1d to healing treatment rolls\. The infirmary also has beds/], ['Cult', 'cult', 'Sacred Nexus', /^Rules in force \(core book\): You get \+1d to healing treatment rolls\. Ancient arcane energy/]].forEach(([nm, ty, cl, core]) => {
    const off = mkCrew(nm + ' heal off', ty, [[12, cl, true]]), on = mkCrew(nm + ' heal on', ty, [[12, cl, true]], true), act = mkCrew(nm + ' heal act', ty, [[12, cl, true]], false, true);
    const l0 = body(info(off, '--n 12')).split('\n'), l1 = body(info(on, '--n 12')).split('\n');
    ok(l0.length === 3 && core.test(l0[1]) && l0[2] === 'Deep Cuts text (Downtime module, off for this crew): ' + HEAL, cl + ' (' + nm + ') with Downtime off: the core text is in force, the Deep Cuts text is shown', l0);
    ok(l1.length === 3 && l1[1] === 'Rules in force (Deep Cuts, Downtime module): ' + HEAL && /^Core book text \(replaced while the module is on\): You get \+1d to healing treatment rolls\./.test(l1[2]), cl + ' (' + nm + ') with Downtime on: the tick text is in force, the core text is marked replaced', l1);
    ok(core.test(body(info(act, '--n 12')).split('\n')[1]) && /Downtime module, off for this crew/.test(body(info(act, '--n 12'))), cl + ': only the Downtime module changes it, the Action module does not');
  });
  ok(/Rules in force \(Deep Cuts, Downtime module\): \+1 tick to healing clock/.test(body(info(mkCrew('Vig heal', 'Vigilantes', [[12, 'Infirmary', false]], true), '--n 12'))), 'the Vigilantes Infirmary follows the same rule');

  // claims the book does not have: the sheet text
  const vg = mkCrew('Vigilantes', 'Vigilantes', [[3, 'Publicity', true, '+2 rep on\ntakedown scores'], [15, 'claim_doskvol\'s_most_wanted', false]]);
  o = info(vg, '--n 3'); ok(body(o) === 'Held by this crew.\nNo book text for this claim: the core book has no entry for it.\nOn the sheet: +2 rep on takedown scores', 'a Vigilantes claim: no book text, the sheet text instead', body(o));
  ok(/Doskvol's Most Wanted/.test(info(vg, '--n 15')[0]) && /No book text/.test(info(vg, '--n 15')[0]), 'the apostrophe claim name works');

  // Turf
  const tf = mkCrew('Turfy', 'Hawkers', [[1, 'Turf', true], [6, 'Turf', true], [7, 'Turf', false], [9, 'Turf', false]], false); E.attr(tf, 'turf', 2);
  o = info(tf, '--row turf'); const tb = body(o).split('\n');
  ok(/\{\{type=Claim held\}\}/.test(o[0]) && o[0].indexOf('{{title=' + ON + ' Turf: 2 of 4 held}}') > 0 && tb[0] === 'Turf claims held by this crew: 2 of 4.' && /^Rules \(core book\): As soon as you seize a claim/.test(tb[1]) && /Some claims count as turf\./.test(tb[1]) && /^Deep Cuts text \(Downtime module, off for this crew\): Your crew's hold on their Tier is measured by your number of turf claims\./.test(tb[2]) && tb[3] === 'Turf boxes marked on the sheet: 2.', 'the Turf card: how many are held, the core text, the Deep Cuts hold rule, the boxes on the sheet', tb);
  E.attr(tf, 'setting_dc_downtime', '1'); const tb2 = body(info(tf, '--row turf')).split('\n');
  ok(/^Rules in force \(Deep Cuts, Downtime module\): Your crew's hold/.test(tb2[1]) && /^Core book: As soon as you seize/.test(tb2[2]), 'with Downtime on the hold rule is the one in force');
  const nt = mkCrew('NoTurfHeld', 'Hawkers', [[1, 'Turf', false]]); o = info(nt, '--row turf'); ok(/Claim not held/.test(o[0]) && /Turf claims held by this crew: 0 of 1/.test(o[0]), 'no turf held');
  ok(has(info(asn, '--row turf'), /Turf claims held by this crew: 1 of 2/), 'turf on the Assassins sheet');

  // refusals
  ok(has(info(asn, '--n 99'), /no longer on the sheet/) && has(info(asn, '--n 5'), /no longer on the sheet/) && has(info(asn, '--n 7'), /no longer on the sheet/) && has(info(asn, ''), /no longer on the sheet/), 'an unknown slot, an empty slot, a turf slot asked for by number, and no slot are all refused');
  ok(has(info(mkCrew('NoTurf', 'x', [[2, 'Fixer', true]]), '--row turf'), /no turf claims on this sheet/), 'a Turf button on a sheet with no turf');
  ok(has(info(asn, '--n 3', quinn), /only use this on crews you control/) && has(info(asn, '--n 3', gm), /Claim held/), 'a player who does not control the crew is refused; the GM may');
  // text from the sheet cannot roll dice or make buttons
  const risky = mkCrew('Risky', 'x', [[1, 'Fixer', true, 'See [[2d6]] and [roll](!bitdcrew adj heat+1) @{x|heat} {{evil}}']]);
  const rb = body(info(risky, '--n 1')); ok(!/[\[\]]/.test(rb) && !/@\{|\{\{|\}\}/.test(rb) && /See \(\(2d6\)\)/.test(rb), 'sheet text is made safe before it is posted', rb);
  // nothing is written
  const snap = (c) => JSON.stringify(E.store.attrs.filter(a => a._characterid === c).map(a => [a.name, a.current]));
  const before = snap(asn); menu(asn); info(asn, '--n 3'); info(asn, '--row turf'); ok(snap(asn) === before, 'the claims commands write nothing to the sheet');
}

// ---------------------------------------------------------------- T28 6c. Crew Upgrades
{
  const { E, gm, pat, quinn } = table();
  const ON = String.fromCharCode(0x25CF), OFF = String.fromCharCode(0x25CB);
  const SHEET_TEXT = E.env.BitDCrewTAM._upgradeSheetText, BOOK = E.env.BitDCrewTAM._upgradeBook;
  const g = (s) => s.replace(/1/g, ON).replace(/0/g, OFF);   // "101" as circles
  const mk = (name, type, dt) => { const c = E.crew(name, pat); if (type !== undefined) E.attr(c, 'crew_type', type); if (dt) E.attr(c, 'setting_dc_downtime', '1'); return c; };
  // a crew-special row: boxes is a string like "110" (marked boxes), numboxes its length
  const spec = (c, id, name, boxes, cost, desc) => {
    const b = 'repeating_upgrade_' + id; E.attr(c, b + '_name', name); E.attr(c, b + '_numboxes', String(boxes.length));
    boxes.split('').forEach((x, i) => E.attr(c, b + '_check_' + (i + 1), x));
    if (cost !== undefined) E.attr(c, b + '_cost', String(cost)); if (desc !== undefined) E.attr(c, b + '_description', desc);
  };
  const fixed = (c, key, boxes, name, desc) => {
    boxes.split('').forEach((x, i) => E.attr(c, 'upgrade_' + key + '_check_' + (i + 1), x));
    if (name !== undefined) E.attr(c, 'upgrade_' + key + '_name', name); if (desc !== undefined) E.attr(c, 'upgrade_' + key + '_description', desc);
  };
  const menu = (c, who) => E.run('!bitdcrew upgrades', who || pat, E.token(c));
  const list = (c, cat, who) => E.run('!bitdcrew upgradelist --c ' + c + ' --row ' + cat, who || pat);
  // ref is "category:upgrade"; the buttons send them as two arguments (a colon inside one argument is what v0.9.0 sent, and Roll20 ignored it)
  const info = (c, ref, who) => { const i = ref.indexOf(':'); return E.run('!bitdcrew upgradeinfo --c ' + c + ' --row ' + (i < 0 ? ref : ref.slice(0, i)) + (i < 0 ? '' : ' --n ' + ref.slice(i + 1)), who || pat); };
  const body = (o) => (/\{\{content=([\s\S]*)\}\}$/.exec(o[0]) || [])[1] || '';
  const labels = (o) => (o[0].match(/\[[^\]]*\]\(!bitdcrew upgradeinfo [^)]*\)/g) || []).map(x => x.replace(/\]\(.*$/, '').slice(1));

  // the book table: plain ASCII, one text per name, verbatim samples
  const bt = [].concat.apply([], BOOK.map(e => e[1]));
  ok(BOOK.length === 19 && bt.every(x => /^[\x20-\x7e]+$/.test(x) && x.length > 40 && /^[A-Z]/.test(x)), 'the upgrade book table is plain ASCII and sensibly formed', BOOK.length);
  ok(Object.keys(SHEET_TEXT).length === 18 && Object.keys(SHEET_TEXT).every(k => /^[\x20-\x7e]+$/.test(SHEET_TEXT[k]) && SHEET_TEXT[k].length > 20), 'the sheet text copy has the 18 fixed upgrades');
  const dash = (s) => s.replace(/\u2014/g, ' - ').replace(/\u2019/g, "'");
  ok(Object.keys(SHEET_TEXT).every(k => SHEET_TEXT[k] === dash(TR['upgrade_' + k + '_description'])), 'the copy is the sheet translation text, key by key (the one dash written as a hyphen)', Object.keys(SHEET_TEXT).filter(k => SHEET_TEXT[k] !== dash(TR['upgrade_' + k + '_description'])));

  // card 1: four buttons, the crew type (not the crew name), counts
  const br = mk('The Red Sashes', 'Bravos');
  spec(br, '-U1', 'Hardened (+1 trauma box)', '110', 8); spec(br, '-U2', 'crew_upgrade_elite_thugs', '1', 10); spec(br, '-U3', 'Bravos rigging (2 free load of weapons or armor)', '0', 6);
  fixed(br, 'carriage', '10'); fixed(br, 'hidden', '1'); fixed(br, 'insight', '1'); fixed(br, 'mastery', '1110');
  let o = menu(br);
  ok(o.length === 1 && /^\/w "Pat" /.test(o[0]) && /\{\{type=Crew upgrades\}\}/.test(o[0]) && /\{\{title=Show to the table\}\}/.test(o[0]), 'card 1 is a whisper to the clicker', o[0].slice(0, 140));
  const b1 = o[0].match(/\[[^\]]*\]\(!bitdcrew upgradelist [^)]*\)/g) || [];
  ok(b1.map(x => x.replace(/\]\(.*$/, '').slice(1)).join('|') === 'Bravos Special|Lair|Training|Quality', 'four buttons: the crew type then Lair, Training, Quality (the crew name is not used)', b1);
  ok(b1.every((x, i) => x.indexOf('--c ' + br + ' --row ' + ['special', 'lair', 'training', 'quality'][i] + ')') > 0), 'each button names the crew and its category');
  const cb = body(o);
  ok(/Bravos Special: 1 of 3 taken, 1 in progress/.test(cb) && /Lair: 2 of 7 taken/.test(cb) && /Training: 1 of 5 taken, 1 in progress/.test(cb) && /Quality: 0 of 6 taken/.test(cb), 'card 1 counts taken and in progress per category (Hardened 2 of 3 and Mastery 3 of 4 are in progress)', cb);
  [['', 'Crew Special'], ['The Red Sashes (Hawkers)', 'Hawkers Special'], ['assassins', 'Assassins Special'], ['Cult of the Hollow', 'Cult Special'], ['river', 'River Special'], ['Emcees', 'Emcees Special']].forEach(([ty, want]) => {
    const c = mk('Label', ty); ok(new RegExp('\\[' + want + '\\]\\(!bitdcrew upgradelist').test(menu(c)[0]), 'the Special label for crew type ' + JSON.stringify(ty) + ' is ' + want);
  });
  ok(/\[Crew Special\]/.test(E.run('!bitdcrew upgrades', pat, E.token(E.crew('NoType', pat)))[0]), 'a crew with no type still gets a Special button');

  // card 2: sheet order, one circle per box, short names
  ['special', 'lair', 'training', 'quality'].forEach(cat => {
    const cmds = (list(br, cat)[0].match(/\(!bitdcrew upgradeinfo [^)]*\)/g) || []);
    ok(cmds.length > 0 && cmds.every(x => !/:/.test(x) && new RegExp('^\\(!bitdcrew upgradeinfo --c ' + br + ' --row ' + cat + ' --n \\S+\\)$').test(x)), 'the ' + cat + ' buttons send the category and the upgrade as separate arguments, with no colon', cmds);
  });
  // a button from the first release (category:upgrade in one argument) still works if it is pasted
  ok(/\{\{type=Upgrade taken\}\}/.test(E.run('!bitdcrew upgradeinfo --c ' + br + ' --row lair:hidden', pat)[0]) && has(E.run('!bitdcrew upgradeinfo --c ' + br + ' --row lair:nosuch', pat), /no longer on the sheet/), 'the old one-argument form still works');
  E.attr(br, '_reporder_repeating_upgrade', '-U3,-U1,-U2');
  o = list(br, 'special'); const l2 = labels(o);
  ok(/^\/w "Pat" /.test(o[0]) && /\{\{title=Bravos Special\}\}/.test(o[0]) && l2.join('|') === g('0') + ' Bravos rigging|' + g('110') + ' Hardened|' + g('1') + ' Elite Thugs', 'special rows in sheet order, circles per box, brackets and key prefixes dropped', l2);
  o = list(br, 'lair'); ok(labels(o).join('|') === [g('10') + ' Carriage', g('00') + ' Boat', g('1') + ' Hidden', g('0') + ' Quarters', g('00') + ' Secure', g('00') + ' Vault', g('0') + ' Workshop'].join('|'), 'lair: seven upgrades in sheet order, two circles for the two-box ones', labels(o));
  o = list(br, 'training'); ok(labels(o).join('|') === [g('1') + ' Insight', g('0') + ' Prowess', g('0') + ' Resolve', g('0') + ' Personal', g('1110') + ' Mastery'].join('|'), 'training: Mastery has four circles', labels(o));
  o = list(br, 'quality'); ok(labels(o).join('|') === ['Documents', 'Gear', 'Implements', 'Supplies', 'Tools', 'Weapons'].map(x => g('0') + ' ' + x).join('|'), 'quality: six one-box upgrades named from their keys when the sheet holds no name', labels(o));
  ok(/One circle per box on the sheet/.test(body(list(br, 'lair'))) && /except Carriage, Boat, Secure and Vault/.test(body(list(br, 'lair'))) && !/except Carriage/.test(body(list(br, 'training'))), 'the legend explains the circles; the lair legend names the exceptions');
  // the two boxes are not linked: the second alone counts, and shows as the second circle
  fixed(br, 'boat', '01'); o = list(br, 'lair'); ok(labels(o)[1] === g('01') + ' Boat', 'a marked second box alone shows as the second circle', labels(o));
  ok(/\{\{type=Upgrade taken\}\}/.test(info(br, 'lair:boat')[0]), 'and still counts as taken');
  E.attr(br, 'upgrade_boat_check_2', '0');
  // Smugglers rename Carriage and Boat to Vehicle (a translation key)
  const sm = mk('Smugglers', 'Smugglers'); fixed(sm, 'carriage', '10', 'vehicle'); fixed(sm, 'boat', '00', 'vehicle');
  o = list(sm, 'lair'); ok(labels(o).slice(0, 2).join('|') === g('10') + ' Vehicle|' + g('00') + ' Vehicle', 'Smugglers: two Vehicle rows', labels(o));
  ok(/Core book: All smugglers start with a vehicle/.test(info(sm, 'lair:carriage')[0]), 'the Vehicle row carries the core book Vehicle text');

  // card 3: public, posted as the clicker, with the state in the header
  const vt = mk('Vaulty', 'Hawkers', true); fixed(vt, 'vault', '10'); let c3 = info(vt, 'lair:vault');
  ok(c3.length === 1 && !/^\/w /.test(c3[0]) && /\{\{type=Upgrade taken\}\}/.test(c3[0]) && c3[0].indexOf('{{title=' + g('10') + ' Vault}}') > 0 && /charname=Vaulty/.test(c3[0]), 'card 3 is public: header, circles and name in the title', c3[0].slice(0, 200));
  let l3 = body(c3).split('\n');
  ok(l3[0] === 'Boxes on the sheet: ' + g('10') + ' (1 of 2 marked). Counts as taken from any box; a second box improves it.', 'the boxes line for a level upgrade', l3[0]);
  ok(l3[1] === 'Cost (Deep Cuts, Development, p83): 10 coin per box (20 coin for all 2 boxes).', 'Downtime crew: the cost line with the total', l3[1]);
  ok(l3[2] === 'Rules in force (Deep Cuts, Downtime module, p88): Vaults are bigger: the first holds 8 Coin, the second holds 12.', 'Downtime crew: the Deep Cuts vault rule is in force', l3[2]);
  ok(l3[3] === 'Sheet text (copy kept in the script): ' + SHEET_TEXT.vault && l3.length === 4, 'no text on the sheet: the script copy is used and says so', l3);
  fixed(vt, 'vault', '10', undefined, 'Our vault: a custom note.'); l3 = body(info(vt, 'lair:vault')).split('\n');
  ok(l3[3] === 'On the sheet: Our vault: a custom note.', 'text on the sheet is shown as the sheet text', l3[3]);
  const nvt = mk('VaultCore', 'Hawkers', false); fixed(nvt, 'vault', '11'); l3 = body(info(nvt, 'lair:vault')).split('\n');
  ok(l3.length === 3 && !/Cost/.test(l3.join('\n')) && /^Deep Cuts text \(Downtime module, off for this crew, p88\): Vaults are bigger/.test(l3[1]) && /^Sheet text/.test(l3[2]), 'a core crew: no cost, the Deep Cuts text only as information', l3);
  ok(/\{\{type=Upgrade taken\}\}/.test(info(nvt, 'lair:vault')[0]) && /Boxes on the sheet: .* \(2 of 2 marked\)/.test(l3[0]), 'two of two boxes');
  c3 = info(vt, 'lair:workshop'); ok(/\{\{type=Upgrade not taken\}\}/.test(c3[0]) && body(c3).split('\n')[0] === 'Box on the sheet: ' + OFF + ' (not marked).', 'a one-box upgrade not taken', body(c3));
  ok(/^Also in force \(Deep Cuts, Downtime module, p87\): Long-term project, Work activity: Add \+1 tick if you have a workshop/m.test(body(c3)), 'Workshop: the Deep Cuts line adds to the sheet text', body(c3));
  ['insight', 'prowess', 'resolve', 'personal', 'mastery'].forEach(k => ok(/Rules in force \(Deep Cuts, Downtime module, p88\): Training Upgrades: You always have access to a veteran instructor \(Quality rating 3\)/.test(body(info(vt, 'training:' + k))), 'Training rule in force for ' + k));
  const noCost = (r) => body(r).replace(/Cost \(Deep Cuts[^\n]*/, '');
  ok(!/Deep Cuts/.test(noCost(info(vt, 'lair:hidden'))) && !/Deep Cuts/.test(noCost(info(vt, 'quality:gear'))) && !/Deep Cuts/.test(noCost(info(vt, 'lair:carriage'))), 'upgrades Deep Cuts does not change show no Deep Cuts rule (only the cost line)');
  ok(/Core book, Quality: Each upgrade improves the quality rating of all the PCs' items of that type, beyond the quality established by the crew's Tier and fine items\./.test(body(info(vt, 'quality:tools'))) && !/Core book, Quality/.test(body(info(vt, 'lair:hidden'))), 'only Quality cards carry the Quality rule');

  // three-box specials and Mastery count only with every box
  const hd = mk('Hard', 'Assassins', true); spec(hd, '-H1', 'Hardened (+1 trauma box)', '011', 8); spec(hd, '-H2', 'Hardened (+1 trauma box)', '111', 8); spec(hd, '-H3', 'Hardened (+1 trauma box)', '000', 8);
  [['-H1', 'Upgrade in progress', '011', '2 of 3'], ['-H2', 'Upgrade taken', '111', '3 of 3'], ['-H3', 'Upgrade not taken', '000', '0 of 3']].forEach(([id, hdr, bx, cnt]) => {
    const r = info(hd, 'special:' + id), lines = body(r).split('\n');
    ok(new RegExp('\\{\\{type=' + hdr + '\\}\\}').test(r[0]) && lines[0] === 'Boxes on the sheet: ' + g(bx) + ' (' + cnt + ' marked). Counts as taken only when all 3 boxes are marked.', 'Hardened ' + bx + ': ' + hdr, lines[0]);
  });
  let hl = body(info(hd, 'special:-H1')).split('\n');
  ok(hl[1] === 'Sheet name: Hardened (+1 trauma box)' && hl[2] === 'Cost (Deep Cuts, Development, p83): 8 coin per box (24 coin for all 3 boxes).' && /^Core book: Each PC gets \+1 trauma box\. This costs three upgrades to unlock, not just one\./.test(hl[3]) && hl.length === 4, 'Hardened: the sheet name, the cost with the total, the core book text, and no sheet text (the drop-down is empty)', hl);
  [['0000', 'Upgrade not taken'], ['1110', 'Upgrade in progress'], ['1111', 'Upgrade taken']].forEach(([bx, hdr]) => {
    const m = mk('Mast' + bx, 'Bravos', true); fixed(m, 'mastery', bx); const r = info(m, 'training:mastery');
    ok(new RegExp('\\{\\{type=' + hdr + '\\}\\}').test(r[0]) && body(r).indexOf('Counts as taken only when all 4 boxes are marked.') > 0 && /Cost \(Deep Cuts, Development, p83\): 10 coin per box \(40 coin for all 4 boxes\)\./.test(body(r)), 'Mastery ' + bx + ': ' + hdr, body(r));
  });
  const cu = mk('Cust', 'x'); spec(cu, '-K1', 'Our own upgrade', '10'); ok(/Counts as taken only when all 2 boxes are marked/.test(body(info(cu, 'special:-K1'))) && /\{\{type=Upgrade in progress\}\}/.test(info(cu, 'special:-K1')[0]), 'a row you added with two boxes counts only when both are marked');

  // the core book text of every crew-special upgrade on the six core crew types, by the name the sheet writes
  const SPECIALS = {
    assassins: ['hardened', 'assassin_rigging', 'ironhook_contacts', 'elite_skulks', 'elite_thugs'], bravos: ['hardened', 'bravos_rigging', 'ironhook_contacts', 'elite_rovers', 'elite_thugs'],
    cult: ['ordained', 'cult_rigging', 'ritual_sanctum_in_lair', 'elite_adepts', 'elite_thugs'], hawkers: ['composed', "hawker's_rigging", 'ironhook_contacts', 'elite_rooks', 'elite_thugs'],
    shadows: ['steady', 'thief_rigging', 'underground_maps_&_passkeys', 'elite_rooks', 'elite_skulks'], smugglers: ['steady', "smuggler's_rigging", 'camouflage', 'elite_rovers', 'barge']
  };
  const noText = [];
  Object.keys(SPECIALS).forEach(ty => {
    const c = mk('S-' + ty, ty); SPECIALS[ty].forEach((k, i) => spec(c, '-S' + i, TR['crew_upgrade_' + k], k.indexOf('hardened') >= 0 || /^(ordained|composed|steady)$/.test(k) ? '000' : '0', 8));
    SPECIALS[ty].forEach((k, i) => { const r = info(c, 'special:-S' + i); if (!/Core book: /.test(r[0]) || /No book text/.test(r[0])) noText.push(ty + ': ' + k); });
    // and by the translation key
    const c2 = mk('K-' + ty, ty); SPECIALS[ty].forEach((k, i) => spec(c2, '-S' + i, 'crew_upgrade_' + k, '0'));
    SPECIALS[ty].forEach((k, i) => { const r = info(c2, 'special:-S' + i); if (!/Core book: /.test(r[0])) noText.push('key ' + ty + ': ' + k); });
  });
  ok(noText.length === 0, 'every crew-special upgrade on the six core crew types has core book text, by name and by key', noText);
  const vb = (k) => { const c = mk('V' + k, 'x'); spec(c, '-V', TR['crew_upgrade_' + k] || k, '1'); return body(info(c, 'special:-V')); };
  ok(/Core book: You get 2 free load worth of weapon or gear items\. For example, you could carry a pistol \(a weapon\) and burglary tools \(gear\) for zero load\./.test(vb('assassin_rigging')) && /Core book: One carried item is concealed and has no load\./.test(vb("hawker's_rigging")) && /Core book: Two of your carried items are perfectly concealed\./.test(vb("smuggler's_rigging")), 'verbatim samples: three rigging texts');
  ok(/Core book: All of your cohorts with the Rooks type get \+1d to quality rolls for Rook-related actions\./.test(vb('elite_rooks')) && /Core book: Your Tier is effectively \+1 higher in prison\./.test(vb('ironhook_contacts')) && /Core book: Add mobility to your lair\./.test(vb('barge')) && /Core book: You have easy passage through the underground canals/.test(vb('underground_maps_&_passkeys')), 'verbatim samples: Elite Rooks, Ironhook, Barge, Underground maps');
  ok(/\nCore book: Each PC gets \+1 stress box\. This costs three upgrades to unlock, not just one\.(\n|$)/.test(vb('steady')), 'Steady text');
  // the sheet puts the effect in brackets after some names: the card shows the full sheet name and no book text is lost to it
  ok(/Sheet name: Smuggler's rigging \(2 items carried are perfectly concealed\)/.test(vb("smuggler's_rigging")), 'the full sheet name is shown when it differs from the short name');

  // crews with no book text: the sheet name is all there is
  ['unbroken', 'vigilantes_attire', 'dedicated_crafters', 'irregulars', 'willing_to_fight', 'full_pockets', 'calm', 'improvised_load', 'jailbird_contacts', 'rituals_of_earth_and_blood', 'sustained', 'roots_rigging', 'emcee_rigging'].forEach(k => {
    ok(/No book text for this upgrade: the core book has no entry for it\./.test(vb(k)), 'no book text for ' + k);
  });
  // a sheet text typed into a special row is shown
  const sx = mk('SX', 'Bravos'); spec(sx, '-X', 'Hardened (+1 trauma box)', '111', 8, 'Typed by the GM.'); l3 = body(info(sx, 'special:-X')).split('\n');
  ok(l3[l3.length - 1] === 'On the sheet: Typed by the GM.' && /^Core book: /.test(l3[l3.length - 2]), 'a drop-down text typed into a special row follows the core book text', l3);
  // the cost comes from the row, not the table; a row with no cost shows no cost line
  const nc = mk('NoCost', 'Bravos', true); spec(nc, '-Z', 'Barge', '1'); ok(!/Cost/.test(body(info(nc, 'special:-Z'))), 'a special row with no cost box has no cost line');
  spec(nc, '-Y', 'Barge', '1', 10); ok(/Cost \(Deep Cuts, Development, p83\): 10 coin per box\./.test(body(info(nc, 'special:-Y'))), 'a one-box special row: cost per box, no total');

  // empty sheet, stale and wrong buttons, permissions
  const em = mk('Empty', 'Bravos');
  ok(/There are no crew-special upgrades on this sheet/.test(body(list(em, 'special'))) && labels(list(em, 'lair')).length === 7, 'no special rows: a message, and the fixed categories still list');
  ok(has(list(em, 'junk'), /unknown upgrade category/) && has(list(em, ''), /unknown upgrade category/), 'an unknown category is refused');
  ok(has(info(br, 'special:-Gone'), /no longer on the sheet/) && has(info(br, 'lair:nosuch'), /no longer on the sheet/) && has(info(br, 'junk:x'), /no longer on the sheet/) && has(info(br, ''), /no longer on the sheet/) && has(info(br, 'special:'), /no longer on the sheet/), 'a stale or malformed upgrade button is refused');
  ok(has(info(br, 'lair:hidden', quinn), /only use this on crews you control/) && has(list(br, 'lair', quinn), /only use this on crews you control/) && has(E.run('!bitdcrew upgrades', quinn, E.token(br)), /only use this on crews you control/) && has(info(br, 'lair:hidden', gm), /Upgrade taken/), 'a player who does not control the crew is refused on all three; the GM may');
  const pcOnly = E.crew('NotACrew', pat); E.attr(pcOnly, 'sheet_type', 'character'); ok(has(E.run('!bitdcrew upgrades', pat, E.token(pcOnly)), /crew sheets only/), 'a player character sheet is refused');
  // text from the sheet cannot roll dice or make buttons
  const rk = mk('Risky', 'x'); spec(rk, '-R', 'Evil [roll](!bitdcrew adj heat+1) @{x|heat} {{evil}} [[2d6]]', '1', 5, 'See [[2d6]] and [roll](!bitdcrew adj heat+1) @{x|heat} {{evil}} %{a|b} ?{q} &{r}');
  const rr = info(rk, 'special:-R'), rl = list(rk, 'special');
  ok(!/[\[\]]/.test(body(rr)) && !/@\{|\{\{evil|%\{|\?\{|&\{/.test(body(rr)) && !/\[\[|\{\{evil|@\{/.test(rr[0].replace(/\{\{(charname|type|title|content|charimage)=/g, '')) && /See \(\(2d6\)\)/.test(body(rr)), 'sheet text and names are made safe before they are posted', rr[0].slice(0, 300));
  ok(labels(rl).length === 1 && !/[\[\]()]/.test(labels(rl)[0]), 'a hostile name leaves a clean button label', labels(rl));
  // long and multi-line names
  const lg = mk('Long', 'x'); spec(lg, '-L', new Array(30).join('Elaborate '), '1'); spec(lg, '-M', 'Elite\nThugs', '1');
  ok(labels(list(lg, 'special')).every(x => x.length <= 60) && /\{\{title=[^\n}]*Elite Thugs\}\}/.test(info(lg, 'special:-M')[0]), 'a long name fits the button, a two-line name is one line in the title', labels(list(lg, 'special')));
  // a row with no name is skipped; a row id with dashes and underscores works
  const sk = mk('Skip', 'x'); spec(sk, '-Mab_c-d9', 'Real one', '1'); E.attr(sk, 'repeating_upgrade_-Blank_name', '  ');
  ok(labels(list(sk, 'special')).length === 1 && /Real one/.test(info(sk, 'special:-Mab_c-d9')[0]), 'blank rows are skipped and an awkward row id works');

  // the token action and nothing written
  const cc = E.crew('Core', pat), dd = mk('DT', 'Bravos', true);
  [cc, dd].forEach(c => { E.run('!bitdcrew setup', pat, E.token(c)); });
  ok(E.abil(cc).find(x => x.name === '6c. Crew Upgrades').action === '!bitdcrew upgrades' && E.abil(dd).find(x => x.name === '6c. Crew Upgrades').action === '!bitdcrew upgrades', 'the button runs the upgrades command, no prompt, on both kinds of crew');
  const snap = (c) => JSON.stringify(E.store.attrs.filter(a => a._characterid === c).map(a => [a.name, a.current]));
  const before = snap(br); menu(br); ['special', 'lair', 'training', 'quality'].forEach(k => list(br, k)); info(br, 'special:-U1'); info(br, 'lair:carriage'); info(br, 'training:mastery'); info(br, 'quality:gear');
  ok(snap(br) === before, 'the upgrade commands write nothing to the sheet');
}

// ---------------------------------------------------------------- T13 the two scripts together
if (PC_SRC) {
  const E = makeEnv(true); const gm = E.player('GM', true), pat = E.player('Pat', false), quinn = E.player('Quinn', false);
  E.ready();
  const names = E.store.macros.map(x => x.name).sort();
  ok(names.join(',') === 'BLADES_TAM,CREW_TAM' && E.store.macros.every(m => m.visibleto === 'all'), 'both global macros exist', names);
  const pc = E.char('Ayla', pat), crew = E.crew('Bravos', pat), tp = E.token(pc), tc = E.token(crew);
  E.attr(pc, 'stress', 3);
  let o = E.run('!bitd setup', pat, tp); const pcMade = E.abil(pc).length;
  ok(pcMade === 9 && E.abil(pc).every(x => x.description === 'bitd-tam'), 'PC setup still makes its 9 PC actions', pcMade);
  o = E.run('!bitdcrew setup', pat, tc);
  ok(E.abil(crew).length === 12 && E.abil(crew).every(x => x.description === 'bitd-crew-tam') && E.abil(pc).length === pcMade, 'crew setup makes its own 12 and leaves the PC ones alone', [E.abil(crew).length, E.abil(pc).length]);
  ok(E.abil(crew).map(x => x.name).join() !== E.abil(pc).map(x => x.name).join(), 'the two sets have different names');
  E.run('!bitd setup', pat, tp); E.run('!bitdcrew setup', pat, tc);
  ok(E.abil(pc).length === 9 && E.abil(crew).length === 12, 'rebuilding either leaves the other intact');
  // each script ignores the other's command and refuses the other's sheets
  o = E.run('!bitdcrew status', pat, tp); ok(has(o, /crew sheets only/) && !has(o, /Stress/), 'crew script refuses a PC sheet', o);
  o = E.run('!bitd status', pat, tc); ok(has(o, /crew or faction sheet/), 'PC script refuses a crew sheet', o);
  o = E.run('!bitdcrew adj heat+1', pat, tp); ok(E.val(pc, 'heat') === undefined, 'crew commands do not write on a PC');
  o = E.run('!bitd stress 1', pat, tc); ok(E.val(crew, 'stress') === undefined, 'PC commands do not write on a crew');
  // one command produces output from one script only
  E.out.length = 0; E.run('!bitdcrew status', pat, tc); ok(E.out.every(x => /BitDCrew|bitd-broadcast/.test(x.text)) && E.out.length === 1, 'a crew command is answered once, by the crew script', E.out.map(x => x.text.slice(0, 30)));
  E.out.length = 0; E.run('!bitd status', pat, tp); ok(E.out.length === 2, 'a PC command is answered by the PC script only (status + harm card)', E.out.length);
  // separate state keys
  E.run('!bitdcrew score 2 0 0 0 0', pat, tc);
  ok(typeof E.env.state.BitDCrewTAM === 'object' && E.env.BitDCrewTAM && E.env.BitDTAM && E.env.BitDCrewTAM !== E.env.BitDTAM, 'two separate top-level objects and state keys');
  // automatic rules do not cross: PC stress fires the PC rule only, crew heat the crew rule only
  E.attr(pc, 'stress', 8); E.attr(pc, 'trauma', 0); o = E.edit(pc, 'stress', 9);
  ok(E.val(pc, 'trauma') === '1' && E.val(pc, 'stress') === '0' && E.val(pc, 'heat') === undefined && o.every(t => !/Wanted/.test(t)), 'stress 9 on a PC: PC trauma rule fires, crew rule does not', o.map(t => t.slice(0, 30)));
  E.attr(crew, 'heat', 8); E.attr(crew, 'wanted', 0); o = E.edit(crew, 'heat', 9);
  ok(E.val(crew, 'wanted') === '1' && E.val(crew, 'heat') === '0' && E.val(crew, 'trauma') === undefined && o.every(t => !/Trauma/.test(t)), 'heat 9 on a crew: crew Wanted rule fires, PC rule does not', o.map(t => t.slice(0, 30)));
  // a crew bar linked to heat is left alone by the PC script's stress bar healing, and vice versa
  const tokC = E.tok(tc), tokP = E.tok(tp);
  tokC.bar1_value = '5'; E.attr(crew, 'heat', 2); E.barEvent(tc); E.flush(); ok(tokC.bar1_value === '2', 'crew bar corrected by the crew script');
  tokP.bar1_value = '7'; E.attr(pc, 'stress', 1); E.barEvent(tp); E.flush(); ok(tokP.bar1_value === '1', 'PC bar corrected by the PC script');
  // the PC script's text fixer owns these crew-sheet attributes: no crew verb may write them
  const FIXER_ATTRS = ['upgrade_vault_description', 'upgrade_insight_description', 'upgrade_prowess_description', 'upgrade_resolve_description', 'upgrade_personal_description', 'upgrade_mastery_description'];
  const seeded = {};
  FIXER_ATTRS.forEach(k => { seeded[k] = 'sheet text for ' + k; E.attr(crew, k, seeded[k]); });
  for (let i = 1; i <= 15; i++) { E.attr(crew, 'claim_' + i + '_name', i === 4 ? 'Informants' : 'Claim ' + i); E.attr(crew, 'claim_' + i + '_desc', 'claim text ' + i); }
  ['Crow\'s Veil', 'Emberdeath', 'Conviction', 'High Society', 'Pack Rats', 'All Hands', 'Reavers'].forEach((nm, i) => { E.attr(crew, 'repeating_crewability_-F' + i + '_name', nm); E.attr(crew, 'repeating_crewability_-F' + i + '_description', 'ability text ' + nm); E.attr(crew, 'repeating_crewability_-F' + i + '_check', '1'); });
  const snapshot = () => E.store.attrs.filter(a => a._characterid === crew && (/_description$/.test(a.name) || /^claim_\d+_desc$/.test(a.name))).map(a => a.name + '=' + a.current).sort().join('\n');
  const snap0 = snapshot(), fixlog0 = JSON.stringify(E.env.state.BitDTAM && E.env.state.BitDTAM.fixlog || []);
  ['setup', 'status', 'abilities', 'clocks', 'roll tier 1', 'roll wanted 0', 'adj heat+1', 'adj wanted+1', 'adj incarc', 'adj rep+1', 'adj turf+1', 'adj coin+2', 'adj tier+1', 'adj hold-weak', 'adj xp+1', 'score 2 0 0 0 0'].forEach(v => E.run('!bitdcrew ' + v, pat, tc));
  E.attr(crew, 'setting_dc_downtime', '1');
  ['setup', 'adj holdassess', 'adj rh-coin', 'adj debt+1', 'score 2 2 2 0 2 1 4', 'hh', 'adj dtstart', 'adj hh', 'status', 'party'].forEach(v => E.run('!bitdcrew ' + v, pat, tc));
  E.run('!bitdcrew party', gm, tc);
  { const L = E.env.state.BitDCrewTAM.downtime[crew]; if (L) { ['rh-coin', 'jpt', 'hold', 'end'].forEach(c => E.run('!bitdcrew hhact ' + c + ' --c ' + crew + ' --idx ' + L.id, pat)); } }
  E.flush();
  ok(snapshot() === snap0, 'no crew verb changed any attribute the PC text fixer owns', snapshot());
  ok(JSON.stringify(E.env.state.BitDTAM && E.env.state.BitDTAM.fixlog || []) === fixlog0, 'the PC fixer logged nothing because of crew writes');
  // every attribute the crew script created or changed is one of its own
  const ALLOWED = /^(heat|wanted|wantedDC|rep|turf|crew_tier|crewcoin|crewcoin_dc|hold|crew_xp|crew_debt_dc|dc_crew_xpclock_[1-4]|repeating_crewclock_.+_progress)$/;
  const seededNames = {}; E.store.attrs.forEach(a => { if (a._characterid === crew && !ALLOWED.test(a.name)) seededNames[a.name] = 1; });
  ok(Object.keys(seededNames).every(k => FIXER_ATTRS.indexOf(k) >= 0 || /^claim_|^repeating_crewability_|^sheet_type$|^setting_dc_downtime$|^stress$|^trauma$/.test(k)), 'the crew script wrote only crew-track attributes', Object.keys(seededNames));
}

// ---------------------------------------------------------------- T23 Edge written by the crew script is read by the PC script
if (PC_SRC) {
  const E = makeEnv(true); const gm = E.player('GM', true), pat = E.player('Pat', false);
  E.ready();
  const pc = E.char('Ayla', pat), tp = E.token(pc), crew = dtCrew(E, pat, 'Cult', 2), tc = E.token(crew);
  E.attr(crew, 'setting_dc_action', '1'); E.attr(crew, 'repeating_crewability_-B_name', 'Bound in Darkness'); E.attr(crew, 'repeating_crewability_-B_check', '1');
  E.party(pc); E.attr(pc, 'setting_dc_action', '1'); E.run('!bitd setup', pat, tp);
  const bar2 = E.tok(tp).bar2_link; const attr = E.store.attrs.find(a => a._characterid === pc && a.name === 'edge_amount');
  ok(attr && bar2 === attr.id, 'the PC script linked bar 2 to edge_amount', [bar2, attr && attr.id]);
  const n = idxOf(E.run('!bitdcrew adj beginscore', pat, tc));
  E.run('!bitdcrew edge all --c ' + crew + ' --idx ' + n, pat);
  ok(E.val(pc, 'edge_amount') === '1' && E.tok(tp).bar2_value === '1', 'the crew script moved the same attribute and the PC script\'s bar', [E.val(pc, 'edge_amount'), E.tok(tp).bar2_value]);
  const o = E.run('!bitd status', pat, tp);
  ok(has(o, /Edge 1/), 'the PC script reads it', o.map(x => x.slice(0, 120)));
  E.run('!bitd adj edge-1', pat, tp);
  ok(E.val(pc, 'edge_amount') === '0', 'and can spend it');
  ok(E.out.every(x => !/BitDCrew: something went wrong/.test(x.text)), 'no script error');
}

// ---------------------------------------------------------------- T14 static checks on the source
{
  ok(!/[^\x00-\x7f]/.test(SRC), 'source is plain ASCII');
  ok(!/`/.test(SRC) && !/=>/.test(SRC) && !/\b(let|const)\s+[a-zA-Z_$]/.test(SRC.replace(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"/g, "''")), 'ES5 only: no template literals, arrows, let or const');
  ok(/^\/\*[\s\S]*\*\/\s*var BitDCrewTAM = BitDCrewTAM \|\| \(function \(\) \{\s*'use strict';/.test(SRC) && /\}\(\)\);\s*$/.test(SRC), 'one IIFE with use strict');
  const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  ok(!/bitd-tam|BLADES_TAM|BitDTAM|!bitd[^c]|'!bitd'/.test(CODE.replace(/player characters use !bitd\)/, '').replace(/!bitdcrew/g, '')), 'no name shared with the PC script (command, marker, macro, variable)');
  ok(/MARK = 'bitd-crew-tam'/.test(SRC) && /CMD = '!bitdcrew'/.test(SRC) && /MACRO_NAME = 'CREW_TAM'/.test(SRC) && /STATE_KEY = 'BitDCrewTAM'/.test(SRC), 'the four crew identifiers');
  ok(!/_description|_desc\b|claim_/.test(SRC.replace(/'claim_' \+ i \+ '_(name|check)'/g, '').replace(/nm === 'claim_turf'/g, '').replace(/'repeating_contact_' \+ c\.row \+ '_description'/g, '').replace(/'claim_' \+ i \+ '_desc'/g, '').replace(/(base|prefix) \+ '_description'/g, '')), 'the source never names a text attribute owned by the PC text fixer (the contact notes, the claim text and the upgrade text on the sheet are read, never written)', SRC.match(/.{20}(_description|_desc\b|claim_).{20}/g));
  ok(!/sendChat\([^;]*,\s*function/.test(SRC) && !/sendChat\([^)]*\)\s*,\s*function/.test(SRC), 'no sendChat callback in the source');
  const keys = {}; (SRC.match(/\^\{([a-z_0-9]+)\}/g) || []).forEach(k => { keys[k.slice(2, -1)] = 1; });
  ['gang', 'elite', 'expert', 'rolls_their'].forEach(k => { keys[k] = 1; });
  const missing = Object.keys(keys).filter(k => !(k in TR));
  ok(Object.keys(keys).length >= 12 && missing.length === 0, 'every ^{key} the script uses exists in translation.json (' + Object.keys(keys).length + ' keys)', missing);
  ok(Object.keys(keys).indexOf('crew_tier') >= 0 && Object.keys(keys).indexOf('wantedroll1') >= 0 && Object.keys(keys).indexOf('cohort_quality') >= 0, 'the key list includes the crew roll keys', Object.keys(keys));
}

console.log(pass + ' passed, ' + fail + ' failed' + (PC_SRC ? '' : '  (coexistence tests SKIPPED: pass the PC script as the third argument)'));
process.exit(fail ? 1 : 0);

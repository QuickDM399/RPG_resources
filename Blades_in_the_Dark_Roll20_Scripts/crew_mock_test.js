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
  ok(names.length === 9 && names.join('|') === '1. Roll|2. Engagement|3. Fortune|4. Score|5. Abilities|6. Adjust|7. Clocks|8. Status|~ Rebuild', 'setup makes the 9 token actions in order', names);
  ok(E.abil(a).every(x => x.istokenaction === true && x.description === 'bitd-crew-tam'), 'abilities flagged with the crew marker');
  E.run('!bitdcrew setup', pat, ta);
  ok(E.abil(a).length === 9, 'rebuild is idempotent');
  o = E.run('!bitdcrew setup', pat, tb);
  ok(has(o, /only use this on crews you control/) && E.abil(b).length === 0, 'player refused on another crew, nothing written', o);
  E.run('!bitdcrew setup', gm, tb);
  ok(E.abil(b).length === 9, 'GM can set up any crew');
  // a user-made ability with a clashing name is skipped, not replaced
  E.store.abilities.push({ id: 'u1', _characterid: a, name: '8. Status', description: 'mine', action: 'x', istokenaction: true });
  o = E.run('!bitdcrew setup', pat, ta);
  ok(E.abil(a).filter(x => x.name === '8. Status').length === 1 && E.store.abilities.find(x => x.id === 'u1') && has(o, /Skipped/), 'user ability untouched and reported', o);
  o = E.run('!bitdcrew setup', pat);
  ok(has(o, /select one or more crew tokens/), 'setup without a token', o);
  o = E.run('!bitdcrew setup --c ' + a, pat);
  ok(E.abil(a).length === 9 && !has(o, /select/), 'setup by id works without a token', o);
  // crew controlled by everyone
  const c = E.crew('Smugglers', 'all'); const tc = E.token(c);
  E.run('!bitdcrew setup', quinn, tc);
  ok(E.abil(c).length === 9, 'crew controlled by all: any player can set it up');
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
  ok(/Reduce Heat: spend 1 Coin/.test(act(a, '6. Adjust')) && /Assess hold/.test(act(a, '6. Adjust')) && /Debt clock \+1/.test(act(a, '6. Adjust')), 'Downtime on: Adjust has Reduce Heat, Assess hold, Debt');
  ok(!/Reduce Heat/.test(act(b, '6. Adjust')) && !/Assess hold/.test(act(b, '6. Adjust')) && !/Debt/.test(act(b, '6. Adjust')) && /Incarceration/.test(act(b, '6. Adjust')), 'Downtime off: no Downtime entries, Incarceration present');
  // every prompt is well formed: option text,value with at most one comma, no empty options
  [a, b].forEach(cid => E.abil(cid).forEach(x => queries(x.action).forEach(q => {
    ok(q.slice(1).every(p => p.length > 0 && count(p, ',') <= 1), 'well-formed prompt in ' + x.name, q);
  })));
  // fixed native macros
  ok(/\{\{title-engagement=1\}\}/.test(act(b, '2. Engagement')) && /@\{selected\|numberofdice\}/.test(act(b, '2. Engagement')) && /\{\{small-title=small-title\}\}/.test(act(b, '2. Engagement')), 'Engagement is the sheet macro');
  ok(/\{\{type=fortune\}\}/.test(act(b, '3. Fortune')) && /@\{selected\|notes_query\}/.test(act(b, '3. Fortune')) && /\^\{roll\}/.test(act(b, '3. Fortune')), 'Fortune is the sheet crew macro');
  ok(act(b, '~ Rebuild') === '!bitdcrew setup' && act(b, '8. Status') === '!bitdcrew status' && act(b, '7. Clocks') === '!bitdcrew clocks' && act(b, '5. Abilities') === '!bitdcrew abilities', 'simple actions');
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
  ok(has(o, /Deep Cuts modules on: Advancement, Downtime, Harm, Load, Action\./) && has(o, /Rules used: Deep Cuts Downtime/) && E.abil(a).length === 9, 'all five modules on: setup lists them, Deep Cuts Downtime rules, 9 actions', o);
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
  ok(E.abil(c).length === 9 && E.val(c, 'heat') === undefined, 'setup by id does not touch bars or create heat', o);
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
  const adjA = E.abil(a).find(x => x.name === '6. Adjust').action, adjB = E.abil(b).find(x => x.name === '6. Adjust').action;
  ok(/Downtime: Heat and Hold,hh/.test(adjA) && /Downtime: start a new Downtime,dtstart/.test(adjA) && !/Heat and Hold/.test(adjB) && !/dtstart/.test(adjB), 'Adjust has the two Downtime entries only for a Downtime crew');
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
  ok(E.abil(crew).length === 9 && E.abil(crew).every(x => x.description === 'bitd-crew-tam') && E.abil(pc).length === pcMade, 'crew setup makes its own 9 and leaves the PC ones alone', [E.abil(crew).length, E.abil(pc).length]);
  ok(E.abil(crew).map(x => x.name).join() !== E.abil(pc).map(x => x.name).join(), 'the two sets have different names');
  E.run('!bitd setup', pat, tp); E.run('!bitdcrew setup', pat, tc);
  ok(E.abil(pc).length === 9 && E.abil(crew).length === 9, 'rebuilding either leaves the other intact');
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

// ---------------------------------------------------------------- T14 static checks on the source
{
  ok(!/[^\x00-\x7f]/.test(SRC), 'source is plain ASCII');
  ok(!/`/.test(SRC) && !/=>/.test(SRC) && !/\b(let|const)\s+[a-zA-Z_$]/.test(SRC.replace(/'[^']*'/g, "''")), 'ES5 only: no template literals, arrows, let or const');
  ok(/^\/\*[\s\S]*\*\/\s*var BitDCrewTAM = BitDCrewTAM \|\| \(function \(\) \{\s*'use strict';/.test(SRC) && /\}\(\)\);\s*$/.test(SRC), 'one IIFE with use strict');
  const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  ok(!/bitd-tam|BLADES_TAM|BitDTAM|!bitd[^c]|'!bitd'/.test(CODE.replace(/player characters use !bitd\)/, '').replace(/!bitdcrew/g, '')), 'no name shared with the PC script (command, marker, macro, variable)');
  ok(/MARK = 'bitd-crew-tam'/.test(SRC) && /CMD = '!bitdcrew'/.test(SRC) && /MACRO_NAME = 'CREW_TAM'/.test(SRC) && /STATE_KEY = 'BitDCrewTAM'/.test(SRC), 'the four crew identifiers');
  ok(!/_description|_desc\b|claim_/.test(SRC.replace(/'claim_' \+ i \+ '_(name|check)'/g, '').replace(/nm === 'claim_turf'/g, '')), 'the source never names a text attribute owned by the PC text fixer', SRC.match(/.{20}(_description|_desc\b|claim_).{20}/g));
  ok(!/sendChat\([^;]*,\s*function/.test(SRC) && !/sendChat\([^)]*\)\s*,\s*function/.test(SRC), 'no sendChat callback in the source');
  const keys = {}; (SRC.match(/\^\{([a-z_0-9]+)\}/g) || []).forEach(k => { keys[k.slice(2, -1)] = 1; });
  ['gang', 'elite', 'expert', 'rolls_their'].forEach(k => { keys[k] = 1; });
  const missing = Object.keys(keys).filter(k => !(k in TR));
  ok(Object.keys(keys).length >= 12 && missing.length === 0, 'every ^{key} the script uses exists in translation.json (' + Object.keys(keys).length + ' keys)', missing);
  ok(Object.keys(keys).indexOf('crew_tier') >= 0 && Object.keys(keys).indexOf('wantedroll1') >= 0 && Object.keys(keys).indexOf('cohort_quality') >= 0, 'the key list includes the crew roll keys', Object.keys(keys));
}

console.log(pass + ' passed, ' + fail + ' failed' + (PC_SRC ? '' : '  (coexistence tests SKIPPED: pass the PC script as the third argument)'));
process.exit(fail ? 1 : 0);

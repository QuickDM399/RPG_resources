/* BoB Token Action Maker  v0.1.0
 * Roll20 API script for the "Band of Blades Official" character sheet (sheet.json version 1695969506).
 * Scope: Rookie, Soldier and Specialist PCs (sheet_type = character). Legion roles, Chosen and Broken are not in v0.1.
 *
 * Setup:   select a PC token and run the global macro LEGION_TAM (or the "~ Rebuild" token action once a token has
 *          actions). GMs: any character. Players: only characters they control.
 * Command: !bobtam <verb> ...   (see route() for the verbs)
 * Debug:   !bobtam debug on|off (GM only) writes what the script decided to the API console.
 *
 * Design notes:
 *   - Rolls and cards use the sheet's own roll templates (blades, blades-broadcast) with the same fields the sheet's own
 *     buttons use. Action, resist and fortune rolls are composed here from the sheet attributes, because Roll20 cannot
 *     use a dropdown answer to pick a sheet button.
 *   - Token bar 1 is linked to stress. Bars 2 and 3 are left alone (the Position/Effect calculator reads them).
 *   - The sheet's own stress_max and trauma_max attributes use the Blades in the Dark numbers (9 and 4), so they are
 *     never read. The limits come from the book: 6 stress boxes (+2 per Hardened, 10 at most) and 2 trauma boxes
 *     (1 for a Rookie, 4 at most).
 *
 * Rules the script applies (Band of Blades core book; every one has a switch below):
 *   R1 Resistance: "Your character suffers 6 stress when they resist, minus the highest die result from the resistance
 *      roll ... If you get a critical result, you also clear 1 stress." (Resistance and Armor). With zero dice you roll
 *      two dice and take the lowest, and cannot roll a critical (Action Roll). Offered as a button, never applied alone.
 *   R2 Trauma: "When a PC needs to mark stress, and cannot, they suffer a level of trauma." (Stress and Trauma).
 *      The book does not say what stress becomes afterwards; the table's ruling is that stress goes back to 0.
 *   R3 Death: "If you mark your last available trauma box, you die." Notice only, nothing is removed.
 *   R4 Corruption: "When you gain your seventh point of corruption, reset your corruption to zero and gain a blight and
 *      a blight condition." Points are added one at a time, so leftover points count from 0.
 *   R5 Blight: "If you mark your fourth blight box, your character is completely corrupted." Notice only.
 *   R6 Harm: "If you need to mark a harm level but the row is already filled, the harm moves up to the next available
 *      row ... If you run out of spaces on the top row ... level 4 harm and is dying." Level 4 is a notice, nothing is written.
 *   R7 Load: "All of your armor is restored when you choose your load for the next mission." Choosing a load clears all
 *      four armor boxes.
 */
var BoBTAM = BoBTAM || (function () {
  'use strict';

  var VERSION = '0.1.0';
  var CMD = '!bobtam';
  var MARK = 'bob-tam';
  var SENDER = 'BoB';
  var MACRO_NAME = 'LEGION_TAM';

  // Token bar 1 = stress (linked to the sheet's stress attribute). Bars 2 and 3 are never touched.
  var LINK_STRESS_BAR = true;

  // R2: a stress bar value above the last box (typed on the token) is treated as "needs to mark stress and cannot".
  var AUTO_TRAUMA = true;
  // R2 ruling: after a trauma the stress track goes back to 0 (the book is silent). false = stress stays full.
  var STRESS_RESETS_ON_TRAUMA = true;
  // R7: choosing a load restores all armor.
  var LOAD_RESETS_ARMOR = true;

  var RESIST_BASE = 6;          // R1
  var BASE_STRESS = 6;          // boxes before Hardened
  var MAX_STRESS = 10;
  var BASE_TRAUMA = 2;          // boxes before Survivor (a Rookie has 1)
  var CORRUPTION_RESET = 7;     // R4: the 7th point resets corruption
  var CORRUPTION_BOXES = 6;
  var BLIGHT_MAX = 4;           // R5
  var UTILITY_LOAD = 2;
  var MAX_DICE = 12;            // the sheet's roll template draws die1 to die12

  // Line separator inside {{content=...}}
  var NL = '\n';

  // glyphs kept as char codes so the source stays plain ASCII
  var G_ON = String.fromCharCode(0x25CF), G_OFF = String.fromCharCode(0x25CB), G_HALF = String.fromCharCode(0x25D0);
  var G_CHECKED = String.fromCharCode(0x2611), G_BOX = String.fromCharCode(0x2610);

  var ATTRIBUTES = ['insight', 'prowess', 'resolve'];
  var ACTIONS = {
    insight: ['research', 'scout', 'rig'],
    prowess: ['wreck', 'skirmish', 'shoot', 'maneuver'],
    resolve: ['consort', 'discipline', 'marshal', 'sway']
  };
  var ACTION_KEYS = ACTIONS.insight.concat(ACTIONS.prowess, ACTIONS.resolve);
  var SPECIALIST = ['aim', 'anchor', 'channels', 'doctor', 'grit', 'scrounge', 'weave'];
  var TRAUMA_CONDITIONS = ['cold', 'haunted', 'obsessed', 'paranoid', 'reckless', 'soft', 'unstable', 'vicious'];
  var BLIGHT_CONDITIONS = ['anathema', 'host', 'hunger', 'miasma', 'mutation', 'rage', 'rot', 'visions'];
  var POSITIONS = ['Risky', 'Controlled', 'Desperate', 'Fortune'];
  var EFFECTS = ['Standard', 'Limited', 'Great', 'Extreme', 'Zero'];
  var BONUS_OPTIONS = '0|1|2|3|4|5|6|-1|-2|-3';
  var ARMOR = [['armor', 'armor', 'Armor'], ['heavy', 'armor_heavy', 'Heavy armor'], ['shield', 'shield', 'Shield'], ['special', 'special', 'Special armor']];
  var XP_TRACKS = [['insight', 'insight_xp', 'Insight', 6], ['prowess', 'prowess_xp', 'Prowess', 6], ['resolve', 'resolve_xp', 'Resolve', 6],
    ['specialist', 'specialist_xp', 'Specialist', 6], ['playbook', 'playbook_xp', 'Playbook', 8]];
  var HARM_SLOTS = { 3: ['harm3'], 2: ['harm2_1', 'harm2_2'], 1: ['harm1_1', 'harm1_2'] };

  var ABILITY_NAMES = ['1. Action', '2. Resist', '3. Fortune', '4. Abilities', '5. Harm',
    '6. Adjust', '7. Status', '8. Load', '~ Rebuild'];

  // ---------------------------------------------------------------- helpers

  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  // value that goes inside {{field=...}}
  function clean(s) {
    return String(s === undefined || s === null ? '' : s)
      .replace(/[\r\n]+/g, ' ').replace(/\{\{|\}\}/g, '').replace(/\|/g, '/').trim();
  }
  // text that goes inside a [label](cmd) chat button
  function btn(s) {
    return clean(s).replace(/[\[\]()]/g, '').replace(/\s+/g, ' ').slice(0, 60);
  }
  // free text that travels inside a command line
  function arg(s) {
    return String(s === undefined || s === null ? '' : s)
      .replace(/["\[\]()]/g, '').replace(/\{\{|\}\}/g, '').replace(/\|/g, '/').replace(/--+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 120);
  }

  function getAttr(cid, name, dflt) {
    var v = getAttrByName(cid, name);
    return (v === undefined || v === null || v === '') ? dflt : v;
  }
  function getNum(cid, name, dflt) {
    var n = parseInt(getAttrByName(cid, name), 10);
    return isNaN(n) ? (dflt || 0) : n;
  }
  function isOn(cid, name) { return String(getAttrByName(cid, name)) === '1'; }

  function setAttr(cid, name, value) {
    var a = findObjs({ _type: 'attribute', _characterid: cid, name: name })[0];
    if (!a) {
      createObj('attribute', { _characterid: cid, name: name, current: String(value) });
    } else {
      a.setWithWorker({ current: String(value) });
    }
  }

  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

  function bar(n, max) {
    var s = '';
    for (var i = 0; i < max; i++) { s += (i < n ? G_ON : G_OFF); }
    return s;
  }

  function botState() {
    state.BoBTAM = state.BoBTAM || {};
    state.BoBTAM.offers = state.BoBTAM.offers || {};
    return state.BoBTAM;
  }

  // debug switch (!bobtam debug on): notes go to the API console only
  function dbg(text) {
    if (botState().debug) { log('BoB debug: ' + text); }
  }

  function who(msg) {
    var p = getObj('player', msg.playerid);
    return p ? p.get('_displayname') : String(msg.who || 'gm').replace(/ \(GM\)$/, '');
  }
  function whisper(msg, text) { sendChat(SENDER, '/w "' + who(msg) + '" ' + text); }
  function whisperPlayer(playerId, text) {
    var p = getObj('player', playerId);
    if (p) { sendChat(SENDER, '/w "' + p.get('_displayname') + '" ' + text); }
  }
  // GMs plus the players who control the character (everyone if it is controlled by "all")
  function recipients(ch) {
    var cb = String(ch.get('controlledby') || '').split(','), ids = [];
    findObjs({ _type: 'player' }).forEach(function (p) {
      if (playerIsGM(p.id) || cb.indexOf('all') >= 0 || cb.indexOf(p.id) >= 0) { ids.push(p.id); }
    });
    return ids;
  }

  function info(cid) {
    var ch = getObj('character', cid);
    return { id: cid, name: ch ? ch.get('name') : '?', image: getAttr(cid, 'chat_image', '') };
  }

  // sheet "blades-broadcast" card
  function broadcast(c, o) {
    var s = '&{template:blades-broadcast} {{charname=' + clean(c.name) + '}}';
    if (o.type) { s += ' {{type=' + o.type + '}}'; }
    if (o.title) { s += ' {{title=' + o.title + '}}'; }
    if (o.content) { s += ' {{content=' + o.content + '}}'; }
    if (o.extra) { s += ' ' + o.extra; }
    if (c.image && !o.noimage) { s += ' {{charimage=' + clean(c.image) + '}}'; }
    return s;
  }

  // compact confirmation card: header type, big title, small content line
  function note(msg, c, type, title, content) {
    whisper(msg, broadcast(c, { type: clean(type), title: clean(title), content: clean(content) }));
  }

  function parse(content) {
    var t = content.trim().split(/\s+/);
    var o = { verb: String(t[1] || '').toLowerCase(), pos: [], c: null, level: null, text: '', row: null, sec: null, idx: null };
    for (var i = 2; i < t.length; i++) {
      if (t[i] === '--c') { o.c = t[++i]; }
      else if (t[i] === '--level') { o.level = t[++i]; }
      else if (t[i] === '--row') { o.row = t[++i]; }
      else if (t[i] === '--sec') { o.sec = t[++i]; }
      else if (t[i] === '--idx') { o.idx = t[++i]; }
      else if (t[i] === '--text') { o.text = t.slice(i + 1).join(' '); break; }
      else { o.pos.push(t[i]); }
    }
    return o;
  }

  function resolveChar(msg, o) {
    var id = o.c;
    if (!id && msg.selected && msg.selected.length) {
      var t = getObj('graphic', msg.selected[0]._id);
      if (t) { id = t.get('represents'); }
    }
    return id ? getObj('character', id) : null;
  }

  function allowed(msg, ch) {
    if (playerIsGM(msg.playerid)) { return true; }
    var cb = String(ch.get('controlledby') || '').split(',');
    return cb.indexOf('all') >= 0 || cb.indexOf(msg.playerid) >= 0;
  }

  // Common entry for every verb that works on one character. Returns {ch, c} or null.
  function target(msg, o) {
    var ch = resolveChar(msg, o);
    if (!ch) { whisper(msg, 'BoB: select a character token first.'); return null; }
    if (!allowed(msg, ch)) { whisper(msg, 'BoB: you can only use this on characters you control.'); return null; }
    var type = getAttr(ch.id, 'sheet_type', 'character');
    if (type !== 'character') {
      whisper(msg, 'BoB: ' + clean(ch.get('name')) + ' is a ' + clean(type) + ' sheet; v' + VERSION + ' supports Rookie, Soldier and Specialist character sheets only.');
      return null;
    }
    return { ch: ch, c: info(ch.id) };
  }

  function listRows(cid, section, field) {
    var re = new RegExp('^repeating_' + section + '_(.+)_' + field + '$');
    var rows = [];
    findObjs({ _type: 'attribute', _characterid: cid }).forEach(function (a) {
      var m = re.exec(a.get('name'));
      if (m) { rows.push({ row: m[1], value: a.get('current') }); }
    });
    var ord = findObjs({ _type: 'attribute', _characterid: cid, name: '_reporder_repeating_' + section })[0];
    if (ord) {
      var order = String(ord.get('current') || '').split(',');
      rows.sort(function (a, b) {
        var ia = order.indexOf(a.row), ib = order.indexOf(b.row);
        return (ia < 0 ? 9999 : ia) - (ib < 0 ? 9999 : ib);
      });
    }
    return rows;
  }

  // ---------------------------------------------------------------- sheet readers

  // the character's one specialist action (setting_specialist_action), or null (a Rookie has none)
  function specialistKey(cid) {
    var s = String(getAttr(cid, 'setting_specialist_action', '-')).toLowerCase();
    return SPECIALIST.indexOf(s) >= 0 ? s : null;
  }

  // Resist rating, as the sheet's calculateResistance worker builds it: the number of that group's actions rated above 0,
  // plus the heritage bonus, plus 1 for insight when the specialist action is rated (only one specialist action counts).
  function attrRating(cid, attr) {
    var n = 0;
    ACTIONS[attr].forEach(function (k) { if (getNum(cid, k, 0) > 0) { n++; } });
    n += getNum(cid, attr + '_bonus', 0);
    if (attr === 'insight') {
      var sp = specialistKey(cid);
      if (sp && getNum(cid, sp, 0) > 0) { n++; }
    }
    return n;
  }

  function stressMax(cid) { return clamp(BASE_STRESS + getNum(cid, 'setting_extra_stress', 0), BASE_STRESS, MAX_STRESS); }
  function traumaMax(cid) { return clamp(BASE_TRAUMA + getNum(cid, 'setting_extra_trauma', 0), 1, 4); }
  function blightMax() { return BLIGHT_MAX; }

  // ---------------------------------------------------------------- setup

  function actionDropdown(keys) {
    return keys.map(function (k) { return cap(k) + ' (@{selected|' + k + '})' + ',' + k; }).join('|');
  }

  function adjustMenu() {
    return 'Stress +1,stress+1|Stress +2 (push yourself),stress+2|Stress +3,stress+3|Stress -1,stress-1|Stress -2,stress-2|Stress -3,stress-3' +
      '|Clear all stress,stress0|Take trauma (pick a condition),trauma+1|Trauma -1,trauma-1' +
      '|Corruption +1,corr+1|Corruption +2,corr+2|Corruption +3,corr+3|Corruption -1,corr-1' +
      '|Take blight (pick a condition),blight+1|Blight -1,blight-1' +
      '|Armor: toggle used,armor|Heavy armor: toggle used,heavy|Shield: toggle used,shield|Special armor: toggle used,special' +
      '|Restore all armor,armor-restore' +
      '|Specialist action: spend 1 use,spec+1|Specialist action: restore all uses,spec0' +
      '|Mark Insight xp,xp-insight|Mark Prowess xp,xp-prowess|Mark Resolve xp,xp-resolve|Mark Specialist xp,xp-specialist|Mark Playbook xp,xp-playbook';
  }

  function tokenActions() {
    return [
      [ABILITY_NAMES[0], CMD + ' roll ?{Action|' + actionDropdown(ACTION_KEYS) + '} ?{Position|Risky|Controlled|Desperate|Fortune roll,Fortune} ?{Effect|' +
        EFFECTS.join('|') + '} ?{Bonus dice|' + BONUS_OPTIONS + '}'],
      [ABILITY_NAMES[1], CMD + ' resist ?{Resist|' + actionDropdown(ATTRIBUTES) + '} ?{Bonus dice|' + BONUS_OPTIONS + '}'],
      [ABILITY_NAMES[2], CMD + ' fortune ?{Fortune dice|0|1|2|3|4|5|6|Specialist action (@{selected|setting_specialist_action}),spec} --text ?{Notes (optional)|}'],
      [ABILITY_NAMES[3], CMD + ' abilities'],
      [ABILITY_NAMES[4], CMD + ' harm --level ?{Level|Level 1 (less effect),1|Level 2 (-1d),2|Level 3 (need help),3|Level 4 (fatal),4} --text ?{Harm description}'],
      [ABILITY_NAMES[5], CMD + ' adj ?{Adjust|' + adjustMenu() + '}'],
      [ABILITY_NAMES[6], CMD + ' status'],
      [ABILITY_NAMES[7], CMD + ' load'],
      [ABILITY_NAMES[8], CMD + ' setup']
    ];
  }

  // bar 1 = stress: linked attribute, max = stress boxes, shown to and editable by players
  function linkStressBar(tok, cid) {
    var a = findObjs({ _type: 'attribute', _characterid: cid, name: 'stress' })[0];
    if (!a) { a = createObj('attribute', { _characterid: cid, name: 'stress', current: String(getNum(cid, 'stress', 0)) }); }
    // link first, then value and max: linking copies the attribute's (empty) max over anything set in the same call
    tok.set({ bar1_link: a.id });
    tok.set({ bar1_value: a.get('current'), bar1_max: stressMax(cid), showplayers_bar1: true, playersedit_bar1: true });
    dbg('bar 1 linked to stress on token ' + tok.id + ', max ' + stressMax(cid));
  }

  // A linked token bar is not refreshed by an API write: set bar 1 (value and max) on every token linked to stress.
  function syncStressBars(cid) {
    var a = findObjs({ _type: 'attribute', _characterid: cid, name: 'stress' })[0];
    if (!a) { return; }
    findObjs({ _type: 'graphic', represents: cid }).forEach(function (g) {
      if (g.get('bar1_link') !== a.id) { return; }
      var cur = String(a.get('current')), max = stressMax(cid);
      if (String(g.get('bar1_value')) !== cur) { g.set('bar1_value', cur); dbg('bar 1 value set to ' + cur + ' on token ' + g.id); }
      if (String(g.get('bar1_max')) !== String(max)) { g.set('bar1_max', max); dbg('bar 1 max set to ' + max + ' on token ' + g.id); }
    });
  }

  function syncStressBarsLater(cid) {
    syncStressBars(cid);
    setTimeout(function () { syncStressBars(cid); }, 1500);
  }

  // A bar edit can be saved again after a script or automatic reset, leaving the bar out of step with the attribute.
  function healStressBar(tokId) {
    var tok = getObj('graphic', tokId), link = tok ? tok.get('bar1_link') : null, a = link ? getObj('attribute', link) : null;
    if (!a || a.get('name') !== 'stress') { return; }
    var cur = String(a.get('current'));
    if (String(tok.get('bar1_value')) !== cur) { tok.set('bar1_value', cur); dbg('healed bar 1 on token ' + tokId + ' to ' + cur); }
  }

  function doSetup(msg, o) {
    var seen = {}, count = 0;
    var targets = [], tokens = {};
    if (o.c) {
      targets.push(o);
    } else if (msg.selected && msg.selected.length) {
      msg.selected.forEach(function (s) {
        var t = getObj('graphic', s._id);
        var id = t ? t.get('represents') : null;
        if (!id) { return; }
        if (!seen[id]) { seen[id] = true; targets.push({ c: id }); tokens[id] = []; }
        tokens[id].push(t);
      });
    }
    if (!targets.length) { whisper(msg, 'BoB: select one or more character tokens first.'); return; }
    targets.forEach(function (to) {
      var t = target(msg, to);
      if (!t) { return; }
      var cid = t.ch.id;
      findObjs({ _type: 'ability', _characterid: cid }).forEach(function (a) {
        if (a.get('description') === MARK) { a.remove(); }
      });
      var taken = {};
      findObjs({ _type: 'ability', _characterid: cid }).forEach(function (a) { taken[a.get('name')] = true; });
      var made = 0, skipped = [];
      tokenActions().forEach(function (d) {
        if (taken[d[0]]) { skipped.push(d[0]); return; }
        createObj('ability', { _characterid: cid, name: d[0], description: MARK, action: d[1], istokenaction: true });
        made++;
      });
      var text = made + ' created.';
      if (skipped.length) { text += ' Skipped (an ability with that name already exists): ' + skipped.join(', ') + '.'; }
      if (LINK_STRESS_BAR) {
        var linked = (tokens[cid] || []).map(function (tok) { return linkStressBar(tok, cid); }).length;
        if (linked) { text += ' Bar 1 is linked to stress on ' + linked + ' token' + (linked > 1 ? 's' : '') + '.'; }
      }
      dbg('setup on ' + t.c.name + ': ' + made + ' created, ' + skipped.length + ' skipped');
      note(msg, t.c, 'Setup', 'Token actions ready', text);
      count++;
    });
    return count;
  }

  // ---------------------------------------------------------------- rolls

  // The sheet writes one field per die, with a comma after every die but the last: {{die1=[[d6]],}} {{die2=[[d6]]}}.
  // No dice (or fewer) means the zero-dice pair.
  function diceFields(pool) {
    var out = [], n, i;
    if (pool > 0) {
      n = Math.min(pool, MAX_DICE);
      for (i = 1; i <= n; i++) { out.push('{{die' + i + '=[[d6]]' + (i < n ? ',' : '') + '}}'); }
      return out.join(' ');
    }
    return '{{zerodie1=[[d6]],}} {{zerodie2=[[d6]]}}';
  }
  // how many d6 inline rolls diceFields(pool) produces
  function diceCount(pool) { return pool > 0 ? Math.min(pool, MAX_DICE) : 2; }

  // the sheet appends its title_text attribute as it is (it can hold a field such as {{title-text=1}}), so braces stay
  function cardTail(c, cid) {
    var tt = String(getAttr(cid, 'title_text', '')).replace(/[\r\n]+/g, ' ').trim();
    return (c.image ? ' {{charimage=' + clean(c.image) + '}}' : '') + (tt ? ' ' + tt : '');
  }

  // core action (11 of them): position, effect and the results block, exactly as the sheet's roll buttons
  function actionCard(t, key, position, effect, pool) {
    var posField = position === 'Fortune' ? '{{short=short}}' : '{{position=' + position + '}}';
    return '&{template:blades} {{title=^{' + key + '}}} {{title-' + key + '=1}} {{type=action}} {{subtitle=' + clean(t.c.name) + ' ^{rolls}}} ' +
      posField + ' {{results=1}} {{result_crit=^{action_roll_crit}}} {{result_6=^{action_roll_6}}} {{result_4_5=^{action_roll_4_5}}} ' +
      '{{result_1_3=^{action_roll_1_3}}} {{effect=' + effect + '}} ' + diceFields(pool) + cardTail(t.c, t.ch.id);
  }

  function resistCard(t, key, pool) {
    return '&{template:blades} {{title=^{' + key + '}}} {{title-' + key + '=1}} {{type=resist}} {{top=' + clean(t.c.name) + '}} ' +
      diceFields(pool) + ' {{notes=^{resist_instructions}}}' + cardTail(t.c, t.ch.id);
  }

  function fortuneCard(t, pool, notes) {
    return '&{template:blades} {{type=fortune}} {{subtitle=' + clean(t.c.name) + ' ^{rolls}}} ' + diceFields(pool) +
      ' {{title=^{fortune}}} {{title-fortune=1}}' + (notes ? ' {{notes=' + clean(notes) + '}}' : '') + cardTail(t.c, t.ch.id);
  }

  // specialist action: short card, no position, effect or results (sheet buttons roll_Aim and the others)
  function specialistCard(t, key, pool) {
    return '&{template:blades} {{title=^{' + key + '}}} {{title-' + key + '=1}} {{type=action}} {{subtitle=' + clean(t.c.name) +
      ' ^{rolls}}} {{short=short}} ' + diceFields(pool) + cardTail(t.c, t.ch.id);
  }

  function parseBonus(v) {
    var n = parseInt(v, 10);
    return isNaN(n) ? 0 : n;
  }

  function capNotice(msg, pool) {
    if (pool > MAX_DICE) { whisper(msg, 'BoB: the card shows at most ' + MAX_DICE + ' dice, so ' + MAX_DICE + ' were rolled instead of ' + pool + '.'); }
  }

  function doRoll(msg, o) {
    var t = target(msg, o); if (!t) { return; }
    var cid = t.ch.id, key = String(o.pos[0] || '').toLowerCase();
    if (ACTION_KEYS.indexOf(key) < 0) { whisper(msg, 'BoB: unknown action "' + clean(o.pos[0]) + '".'); return; }
    var position = cap(String(o.pos[1] || 'Risky').toLowerCase());
    if (POSITIONS.indexOf(position) < 0) { position = 'Risky'; }
    var effect = cap(String(o.pos[2] || 'Standard').toLowerCase());
    if (EFFECTS.indexOf(effect) < 0) { effect = 'Standard'; }
    var rating = getNum(cid, key, 0), bonus = parseBonus(o.pos[3]), pool = rating + bonus;
    var text = actionCard(t, key, position, effect, pool);
    dbg('roll ' + key + ' rating ' + rating + ' bonus ' + bonus + ' pool ' + pool + ' -> ' + text);
    capNotice(msg, pool);
    sendChat('player|' + msg.playerid, text);
  }

  function doResist(msg, o) {
    var t = target(msg, o); if (!t) { return; }
    var cid = t.ch.id, key = String(o.pos[0] || '').toLowerCase();
    if (ATTRIBUTES.indexOf(key) < 0) { whisper(msg, 'BoB: unknown attribute "' + clean(o.pos[0]) + '".'); return; }
    var rating = attrRating(cid, key), bonus = parseBonus(o.pos[1]), pool = rating + bonus;
    var text = resistCard(t, key, pool);
    dbg('resist ' + key + ' rating ' + rating + ' bonus ' + bonus + ' pool ' + pool + ' -> ' + text);
    capNotice(msg, pool);
    // the dropdown label shows the sheet's own stored rating; say so when it differs from the one built here
    var stored = parseInt(getAttrByName(cid, key), 10);
    if (!isNaN(stored) && stored !== rating) {
      whisper(msg, 'BoB: the sheet shows ' + cap(key) + ' ' + stored + ' but its actions add up to ' + rating + '. The roll used ' + rating +
        '. Open the sheet once so it recalculates.');
    }
    // a sendChat callback would stop the card being posted, so the card is posted as usual and the posted message is watched
    watchResist(msg.playerid, t, diceCount(pool), pool < 1);
    sendChat('player|' + msg.playerid, text);
  }

  function doFortune(msg, o) {
    var t = target(msg, o); if (!t) { return; }
    var cid = t.ch.id, what = String(o.pos[0] || '').toLowerCase(), text, pool;
    if (what === 'spec') {
      var sk = specialistKey(cid);
      if (!sk) { whisper(msg, 'BoB: ' + clean(t.c.name) + ' has no specialist action set on the sheet.'); return; }
      pool = getNum(cid, sk, 0);
      text = specialistCard(t, sk, pool);
    } else {
      pool = parseInt(what, 10);
      if (isNaN(pool) || pool < 0 || pool > 6) { whisper(msg, 'BoB: pick 0 to 6 dice, or the specialist action.'); return; }
      text = fortuneCard(t, pool, o.text);
    }
    dbg('fortune ' + what + ' pool ' + pool + ' -> ' + text);
    sendChat('player|' + msg.playerid, text);
  }

  // ---------------------------------------------------------------- resist: stress cost button (R1)

  var offerCount = 0;
  // resist rolls this script has just posted and not yet seen come back through the chat
  var watching = [];
  function watchResist(pid, t, dice, zero) {
    var now = Date.now();
    watching = watching.filter(function (w) { return now - w.at < 60000; });
    watching.push({ pid: pid, t: t, dice: dice, zero: zero, name: clean(t.c.name), at: now });
    dbg('watching a resist roll: ' + dice + ' dice' + (zero ? ' (zero dice, take the lowest)' : ''));
  }

  // values of the d6 inline rolls of a posted card, or null if there are not exactly as many as expected
  function readDice(msg, expected) {
    var rolls = (msg && msg.inlinerolls) || [], vals = [];
    rolls.forEach(function (r) {
      var rr = r && r.results && r.results.rolls && r.results.rolls[0];
      if (rr && rr.sides === 6 && rr.dice === 1) { vals.push(r.results.total); }
    });
    return vals.length === expected ? vals : null;
  }

  // a posted blades card: if it is a resist roll this script is watching, work out its stress cost
  function checkWatchedRoll(msg) {
    if (!watching.length) { return; }
    var content = String(msg.content || ''), i, w;
    for (i = 0; i < watching.length; i++) {
      w = watching[i];
      if (Date.now() - w.at > 60000) { continue; }
      if (msg.playerid && msg.playerid !== w.pid && msg.playerid !== 'API') { continue; }
      if (content.indexOf('{{type=resist}}') < 0 || content.indexOf('{{top=' + w.name + '}}') < 0) { continue; }
      watching.splice(i, 1);
      try { afterResist(msg, w); } catch (e) { log('BoB resist error: ' + (e && e.stack ? e.stack : e)); }
      return;
    }
  }

  function afterResist(msg, w) {
    var vals = readDice(msg, w.dice);
    if (!vals) { log('BoB: could not read the dice of that resistance roll, so no stress button was offered.'); return; }
    var best, crit = false;
    if (w.zero) { best = Math.min.apply(null, vals); }
    else {
      best = Math.max.apply(null, vals);
      crit = vals.filter(function (v) { return v === 6; }).length >= 2;
    }
    var cid = w.t.ch.id, cost = Math.max(0, RESIST_BASE - best), offers = botState().offers;
    dbg('resist dice ' + vals.join(',') + ' -> ' + (w.zero ? 'lowest ' : 'highest ') + best + ', cost ' + cost + (crit ? ', critical' : ''));
    var nonce = Date.now().toString(36) + (++offerCount), lines = [(w.zero ? 'Zero dice, lowest die: ' : 'Highest die: ') + best +
      '. Resisting costs ' + RESIST_BASE + ' minus ' + best + ' = ' + cost + ' stress.'];
    if (crit) {
      offers[nonce] = { c: cid, n: -1 };
      lines.push('Critical: also clear 1 stress.');
      lines.push('[Clear 1 stress](' + CMD + ' stress -1 --c ' + cid + ' --idx ' + nonce + ')');
    } else if (cost > 0) {
      offers[nonce] = { c: cid, n: cost };
      var free = stressMax(cid) - getNum(cid, 'stress', 0);
      if (cost > free) { lines.push('Only ' + free + ' stress box' + (free === 1 ? ' is' : 'es are') + ' free, so taking this causes trauma.'); }
      lines.push('[Take ' + cost + ' stress](' + CMD + ' stress ' + cost + ' --c ' + cid + ' --idx ' + nonce + ')');
    } else {
      lines.push('No stress to take.');
    }
    var keys = Object.keys(offers);
    if (keys.length > 60) { delete offers[keys[0]]; }
    var text = broadcast(w.t.c, { type: 'Resist', title: 'Stress cost', content: lines.join(NL) });
    recipients(w.t.ch).forEach(function (id) { whisperPlayer(id, text); });
  }

  // ---------------------------------------------------------------- abilities menu

  function doAbilities(msg, o) {
    var t = target(msg, o); if (!t) { return; }
    var cid = t.ch.id, names = listRows(cid, 'ability', 'name'), buttons = [];
    names.forEach(function (r) {
      var label = btn(r.value);
      if (!label) { return; }
      // only abilities the character has: the diamond next to the ability is ticked on the sheet
      if (String(getAttrByName(cid, 'repeating_ability_' + r.row + '_check')) !== '1') { return; }
      buttons.push('[' + label + '](' + CMD + ' ability --c ' + cid + ' --row ' + r.row + ')');
    });
    whisper(msg, broadcast(t.c, {
      type: '^{special_ability}',
      title: 'Show to the table',
      content: buttons.length ? buttons.join(' ') : 'No special abilities are ticked on this sheet. Tick the diamond next to an ability to list it here.'
    }));
  }

  // the card the sheet's own ability "Show" button posts, built here because the sheet has several same-named buttons
  function doAbilityShow(msg, o) {
    var t = target(msg, o); if (!t) { return; }
    var cid = t.ch.id, row = String(o.row || '');
    if (!/^[-A-Za-z0-9_]+$/.test(row)) { whisper(msg, 'BoB: unknown ability.'); return; }
    var name = String(getAttr(cid, 'repeating_ability_' + row + '_name', '')).trim();
    if (!name) { whisper(msg, 'BoB: that ability is no longer on the sheet.'); return; }
    var desc = clean(getAttr(cid, 'repeating_ability_' + row + '_description', ''));
    sendChat('player|' + msg.playerid, broadcast(t.c, { type: '^{special_ability}', title: clean(name), content: desc || 'No description on the sheet.' }));
  }

  // ---------------------------------------------------------------- stress, trauma, corruption, blight

  var TRACKS = {
    trauma: {
      attr: 'trauma', prefix: 'trauma_', conds: TRAUMA_CONDITIONS, label: 'Trauma', set: 'tcond', clear: 'tclear', max: traumaMax,
      last: 'This is the last trauma box: the character dies (Stress and Trauma, Death).'
    },
    blight: {
      attr: 'blight', prefix: 'blight_', conds: BLIGHT_CONDITIONS, label: 'Blight', set: 'bcond', clear: 'bclear', max: blightMax,
      last: 'This is the fourth blight box: the character is completely corrupted and no longer playable (Death).'
    }
  };

  function checkedConds(cid, kind) {
    var tr = TRACKS[kind];
    return tr.conds.filter(function (c) { return isOn(cid, tr.prefix + c); });
  }

  // card with the track, a death notice when its last box is marked, and a button per condition not yet chosen
  function condCardText(c, kind, headline) {
    var tr = TRACKS[kind], cid = c.id, max = tr.max(cid), n = getNum(cid, tr.attr, 0), have = checkedConds(cid, kind);
    var buttons = tr.conds.filter(function (x) { return have.indexOf(x) < 0; }).map(function (x) {
      return '[' + cap(x) + '](' + CMD + ' ' + tr.set + ' ' + x + ' --c ' + cid + ')';
    });
    var lines = [headline, tr.label + ' ' + bar(n, max) + ' ' + n + '/' + max];
    if (n >= max) { lines.push(tr.last); }
    if (buttons.length) { lines.push('Choose a ' + tr.label.toLowerCase() + ' condition: ' + buttons.join(' ')); }
    return broadcast(c, { type: tr.label === 'Trauma' ? 'Stress' : 'Corruption', title: tr.label, content: lines.join(NL) });
  }

  // one more box on a track; the sheet derives its own value from the ticked conditions, so a condition is chosen next
  function addBox(cid, kind, k) {
    var tr = TRACKS[kind], max = tr.max(cid);
    setAttr(cid, tr.attr, Math.min(getNum(cid, tr.attr, 0) + k, max));
  }

  function doCondition(msg, o, kind) {
    var t = target(msg, o); if (!t) { return; }
    var tr = TRACKS[kind], cid = t.ch.id, cond = String(o.pos[0] || '').toLowerCase();
    if (tr.conds.indexOf(cond) < 0) { whisper(msg, 'BoB: "' + clean(cond) + '" is not a ' + tr.label.toLowerCase() + ' condition.'); return; }
    setAttr(cid, tr.prefix + cond, '1');
    var have = checkedConds(cid, kind).length;
    if (have > getNum(cid, tr.attr, 0)) { setAttr(cid, tr.attr, Math.min(have, tr.max(cid))); }
    note(msg, t.c, tr.label, cap(cond), 'Condition marked. ' + tr.label + ' ' + getNum(cid, tr.attr, 0) + '/' + tr.max(cid) + '.');
  }

  function doConditionClear(msg, o, kind) {
    var t = target(msg, o); if (!t) { return; }
    var tr = TRACKS[kind], cid = t.ch.id, cond = String(o.pos[0] || '').toLowerCase();
    if (tr.conds.indexOf(cond) < 0 || !isOn(cid, tr.prefix + cond)) { whisper(msg, 'BoB: that condition is not marked.'); return; }
    setAttr(cid, tr.prefix + cond, '0');
    setAttr(cid, tr.attr, Math.max(0, getNum(cid, tr.attr, 0) - 1));
    note(msg, t.c, tr.label, cap(cond) + ' cleared', tr.label + ' ' + getNum(cid, tr.attr, 0) + '/' + tr.max(cid) + '.');
  }

  function boxDown(msg, t, kind) {
    var tr = TRACKS[kind], cid = t.ch.id, have = checkedConds(cid, kind);
    if (have.length) {
      var buttons = have.map(function (x) { return '[' + cap(x) + '](' + CMD + ' ' + tr.clear + ' ' + x + ' --c ' + cid + ')'; });
      whisper(msg, broadcast(t.c, { type: tr.label, title: 'Clear a condition', content: 'Pick the condition to clear: ' + buttons.join(' ') }));
      return;
    }
    var n = Math.max(0, getNum(cid, tr.attr, 0) - 1);
    setAttr(cid, tr.attr, n);
    note(msg, t.c, tr.label, tr.label + ' ' + n + ' / ' + tr.max(cid), bar(n, tr.max(cid)));
  }

  // R2: trauma, then stress back to 0 (or full, by switch)
  function stressOverflow(cid) {
    var max = stressMax(cid), after = STRESS_RESETS_ON_TRAUMA ? 0 : max;
    setAttr(cid, 'stress', after);
    addBox(cid, 'trauma', 1);
    syncStressBarsLater(cid);
    dbg('stress overflow: trauma now ' + getNum(cid, 'trauma', 0) + ', stress set to ' + after);
    return 'No stress box was free, so the character suffers trauma and is taken out of action.' +
      (STRESS_RESETS_ON_TRAUMA ? ' Stress goes back to 0.' : ' Stress stays full.');
  }

  // positive n: mark stress (R2 when it does not fit); negative n: clear stress
  function changeStress(msg, t, n) {
    var cid = t.ch.id, max = stressMax(cid), cur = getNum(cid, 'stress', 0), next;
    if (n < 0) {
      next = Math.max(0, cur + n);
      setAttr(cid, 'stress', next);
      syncStressBarsLater(cid);
      note(msg, t.c, 'Stress', 'Stress ' + next + ' / ' + max, bar(next, max));
      return;
    }
    if (cur + n > max) {
      whisper(msg, condCardText(t.c, 'trauma', stressOverflow(cid)));
      return;
    }
    next = cur + n;
    setAttr(cid, 'stress', next);
    syncStressBarsLater(cid);
    note(msg, t.c, 'Stress', 'Stress ' + next + ' / ' + max, bar(next, max));
  }

  function doStress(msg, o) {
    var t = target(msg, o); if (!t) { return; }
    var cid = t.ch.id, n = parseInt(o.pos[0], 10);
    if (isNaN(n) || n === 0) { whisper(msg, 'BoB: pick a stress amount.'); return; }
    if (o.idx) {
      var offers = botState().offers, off = offers[o.idx];
      if (!off || off.c !== cid || off.n !== n) { note(msg, t.c, 'Stress', 'Already applied', 'That stress offer was already used. Use Adjust for another change.'); return; }
      delete offers[o.idx];
    }
    changeStress(msg, t, n);
  }

  // stress attribute changed on a token bar or the sheet: a value above the last box means stress had to be marked and could not
  function autoTrauma(obj) {
    var cid = obj.get('_characterid'), ch = getObj('character', cid);
    if (!ch || getAttr(cid, 'sheet_type', 'character') !== 'character') { return; }
    var cur = parseInt(obj.get('current'), 10), max = stressMax(cid);
    if (isNaN(cur) || cur <= max) { return; }
    dbg('stress attribute reached ' + cur + ' (max ' + max + '): automatic trauma');
    var headline = stressOverflow(cid);
    findObjs({ _type: 'graphic', represents: cid }).forEach(function (g) {
      setTimeout(function () { healStressBar(g.id); }, 1500);
    });
    var text = condCardText(info(cid), 'trauma', 'Stress went past the last box. ' + headline);
    recipients(ch).forEach(function (id) { whisperPlayer(id, text); });
  }

  // R4: corruption points one at a time; the 7th resets corruption to 0 and gives a blight
  function addCorruption(cid, n) {
    var cur = getNum(cid, 'corruption', 0), blights = 0, i;
    for (i = 0; i < n; i++) {
      cur++;
      if (cur >= CORRUPTION_RESET) { cur = 0; blights++; }
    }
    setAttr(cid, 'corruption', cur);
    return { corruption: cur, blights: blights };
  }

  function doCorruption(msg, t, n) {
    var cid = t.ch.id, res = addCorruption(cid, n);
    dbg('corruption +' + n + ' -> ' + res.corruption + ', blights gained ' + res.blights);
    if (res.blights > 0) {
      addBox(cid, 'blight', res.blights);
      whisper(msg, condCardText(t.c, 'blight', 'That was the seventh point of corruption. Corruption resets to ' + res.corruption + ' and the character gains ' +
        (res.blights > 1 ? res.blights + ' blights' : 'a blight') + ' and a blight condition.'));
      return;
    }
    note(msg, t.c, 'Corruption', 'Corruption ' + res.corruption + ' / ' + CORRUPTION_BOXES, bar(res.corruption, CORRUPTION_BOXES));
  }

  // ---------------------------------------------------------------- adjust (armor, specialist uses, xp, counters)

  function counter(msg, t, attrName, delta, lo, hi, label) {
    var cid = t.ch.id, cur = getNum(cid, attrName, 0), next = clamp(cur + delta, lo, hi);
    if (next === cur) { note(msg, t.c, label, label + ' ' + cur, delta > 0 ? 'Already at the maximum.' : 'Already at the minimum.'); return; }
    setAttr(cid, attrName, next);
    note(msg, t.c, label, label + ' ' + next, 'Was ' + cur + '.');
  }

  function toggle(msg, t, attrName, label) {
    var cid = t.ch.id, was = isOn(cid, attrName);
    setAttr(cid, attrName, was ? '0' : '1');
    note(msg, t.c, 'Armor', label + ': ' + (was ? 'free' : 'used'), (was ? 'Marked free.' : 'Marked used.'));
  }

  function restoreArmor(cid) {
    ARMOR.forEach(function (a) { setAttr(cid, a[1], '0'); });
  }

  // each rank of the specialist action gives one use per mission; marked circles are uses spent
  function specialistUse(msg, t, restore) {
    var cid = t.ch.id, sk = specialistKey(cid);
    if (!sk) { whisper(msg, 'BoB: ' + clean(t.c.name) + ' has no specialist action set on the sheet.'); return; }
    var rating = getNum(cid, sk, 0), used = getNum(cid, sk + '_uses', 0);
    if (restore) {
      setAttr(cid, sk + '_uses', 0);
      note(msg, t.c, cap(sk), 'Uses restored', cap(sk) + ': 0 of ' + rating + ' uses marked.');
      return;
    }
    if (used >= rating) { note(msg, t.c, cap(sk), 'No uses left', cap(sk) + ' rank ' + rating + ': all ' + rating + ' uses are marked.'); return; }
    setAttr(cid, sk + '_uses', used + 1);
    note(msg, t.c, cap(sk), 'Use marked', cap(sk) + ': ' + (used + 1) + ' of ' + rating + ' uses marked.');
  }

  function xpTrack(key) {
    for (var i = 0; i < XP_TRACKS.length; i++) { if (XP_TRACKS[i][0] === key) { return XP_TRACKS[i]; } }
    return null;
  }

  function doAdjust(msg, o) {
    var t = target(msg, o); if (!t) { return; }
    var cid = t.ch.id, code = String(o.pos[0] || ''), m, i;
    if ((m = /^stress([+-][0-9]+)$/.exec(code))) { changeStress(msg, t, parseInt(m[1], 10)); return; }
    if ((m = /^corr([+-][0-9]+)$/.exec(code))) {
      var d = parseInt(m[1], 10);
      if (d > 0) { doCorruption(msg, t, d); }
      else { counter(msg, t, 'corruption', d, 0, CORRUPTION_BOXES, 'Corruption'); }
      return;
    }
    if ((m = /^xp-([a-z]+)$/.exec(code))) {
      var tk = xpTrack(m[1]);
      if (!tk) { whisper(msg, 'BoB: unknown xp track "' + clean(m[1]) + '".'); return; }
      if (tk[0] === 'specialist' && !specialistKey(cid)) { whisper(msg, 'BoB: ' + clean(t.c.name) + ' has no specialist action set on the sheet.'); return; }
      counter(msg, t, tk[1], 1, 0, tk[3], tk[2] + ' xp');
      return;
    }
    for (i = 0; i < ARMOR.length; i++) {
      if (code === ARMOR[i][0]) { toggle(msg, t, ARMOR[i][1], ARMOR[i][2]); return; }
    }
    switch (code) {
      case 'stress0':
        setAttr(cid, 'stress', 0);
        syncStressBarsLater(cid);
        note(msg, t.c, 'Stress', 'Stress 0 / ' + stressMax(cid), bar(0, stressMax(cid)));
        break;
      case 'trauma+1':
        addBox(cid, 'trauma', 1);
        whisper(msg, condCardText(t.c, 'trauma', 'Trauma taken by hand. The character is taken out of action.'));
        break;
      case 'trauma-1': boxDown(msg, t, 'trauma'); break;
      case 'blight+1':
        addBox(cid, 'blight', 1);
        whisper(msg, condCardText(t.c, 'blight', 'Blight taken by hand.'));
        break;
      case 'blight-1': boxDown(msg, t, 'blight'); break;
      case 'armor-restore':
        restoreArmor(cid);
        note(msg, t.c, 'Armor', 'Armor restored', 'All four armor boxes are marked free.');
        break;
      case 'spec+1': specialistUse(msg, t, false); break;
      case 'spec0': specialistUse(msg, t, true); break;
      default: whisper(msg, 'BoB: unknown adjustment "' + clean(code) + '".');
    }
  }

  // ---------------------------------------------------------------- harm (R6)

  function harmCardText(c) {
    var cid = c.id, s = '&{template:blades-broadcast} {{charname=' + clean(c.name) + '}} {{harm=1}}';
    ['harm3', 'harm2_1', 'harm2_2', 'harm1_1', 'harm1_2'].forEach(function (n) { s += ' {{' + n + '=' + clean(getAttr(cid, n, '')) + '}}'; });
    if (c.image) { s += ' {{charimage=' + clean(c.image) + '}}'; }
    return s;
  }

  function freeSlot(cid, level) {
    var free = null;
    (HARM_SLOTS[level] || []).forEach(function (s) { if (!free && !String(getAttr(cid, s, '')).trim()) { free = s; } });
    return free;
  }

  function doAddHarm(msg, o) {
    var t = target(msg, o); if (!t) { return; }
    var cid = t.ch.id, level = parseInt(o.level, 10), text = arg(o.text);
    if (isNaN(level) || level < 1 || level > 4) { whisper(msg, 'BoB: harm level must be 1 to 4.'); return; }
    if (!text) { whisper(msg, 'BoB: describe the harm.'); return; }
    var asked = level, free = null;
    while (level <= 3 && !free) {
      free = freeSlot(cid, level);
      if (!free) { level++; }
    }
    if (!free) {
      // R6: no space left from that level up, so it is level 4
      dbg('harm "' + text + '" asked at level ' + asked + ': no free slot, level 4');
      note(msg, t.c, 'Harm', 'Level 4: fatal harm', '"' + clean(text) + '" does not fit' + (asked < 4 ? ' at level ' + asked + ' or above' : '') +
        '. Level 4 harm is fatal and the character is dying unless they resist it (Consequences and Harm, Death). Nothing was written to the sheet.');
      return;
    }
    setAttr(cid, free, text);
    dbg('harm "' + text + '" asked at level ' + asked + ', written to ' + free);
    note(msg, t.c, 'Harm', 'Level ' + level, clean(text) + (level !== asked ? ' (level ' + asked + ' was full, so it moved up to level ' + level + ')' : '') + '.');
    whisper(msg, harmCardText(t.c));
  }

  function doHarmMenu(msg, o) {
    var t = target(msg, o); if (!t) { return; }
    var cid = t.ch.id, buttons = [];
    [3, 2, 1].forEach(function (lv) {
      HARM_SLOTS[lv].forEach(function (slot) {
        var val = String(getAttr(cid, slot, '')).trim();
        if (!val) { return; }
        buttons.push('[Clear L' + lv + ': ' + btn(val) + '](' + CMD + ' harmclear --c ' + cid + ' --row ' + slot + ')');
      });
    });
    var content = buttons.length ? buttons.join(' ') : 'No harm is recorded.';
    content += NL + '[Share harm with the table](' + CMD + ' shareharm --c ' + cid + ')';
    whisper(msg, broadcast(t.c, { type: 'Harm', title: 'Harm', content: content }));
  }

  function doHarmClear(msg, o) {
    var t = target(msg, o); if (!t) { return; }
    var cid = t.ch.id, slot = o.row;
    if (!/^harm(3|2_1|2_2|1_1|1_2)$/.test(String(slot))) { whisper(msg, 'BoB: unknown harm slot.'); return; }
    var was = String(getAttr(cid, slot, '')).trim();
    if (!was) { whisper(msg, 'BoB: that harm is already cleared.'); return; }
    setAttr(cid, slot, '');
    note(msg, t.c, 'Harm', 'Cleared', clean(was) + '.');
  }

  function doShareHarm(msg, o) {
    var t = target(msg, o); if (!t) { return; }
    sendChat('player|' + msg.playerid, harmCardText(t.c));
  }

  // ---------------------------------------------------------------- status

  function xpLine(cid) {
    var sk = specialistKey(cid);
    return XP_TRACKS.filter(function (x) { return x[0] !== 'specialist' || sk; }).map(function (x) {
      return x[2] + ' ' + getNum(cid, x[1], 0) + '/' + x[3];
    }).join(', ');
  }

  function doStatus(msg, o) {
    var t = target(msg, o); if (!t) { return; }
    var cid = t.ch.id, L = [], c = ' --c ' + cid;
    var smax = stressMax(cid), s = getNum(cid, 'stress', 0);
    var tmax = traumaMax(cid), tr = getNum(cid, 'trauma', 0), tconds = checkedConds(cid, 'trauma');
    var cor = getNum(cid, 'corruption', 0), bl = getNum(cid, 'blight', 0), bconds = checkedConds(cid, 'blight');
    L.push('Stress ' + bar(s, smax) + ' ' + s + '/' + smax + ' [Stress -1](' + CMD + ' adj stress-1' + c + ') [Stress +1](' + CMD + ' adj stress+1' + c +
      ') [Stress +2](' + CMD + ' adj stress+2' + c + ')');
    L.push('Trauma ' + bar(tr, tmax) + ' ' + tr + '/' + tmax + (tconds.length ? ' (' + tconds.map(cap).join(', ') + ')' : ''));
    L.push('Corruption ' + bar(cor, CORRUPTION_BOXES) + ' ' + cor + '/' + CORRUPTION_BOXES + ' [Corruption +1](' + CMD + ' adj corr+1' + c +
      ') [Corruption -1](' + CMD + ' adj corr-1' + c + ')');
    L.push('Blight ' + bar(bl, BLIGHT_MAX) + ' ' + bl + '/' + BLIGHT_MAX + (bconds.length ? ' (' + bconds.map(cap).join(', ') + ')' : ''));
    L.push('Armor: ' + ARMOR.map(function (a) {
      return '[' + a[2] + ' ' + (isOn(cid, a[1]) ? G_CHECKED + ' used' : G_BOX + ' free') + '](' + CMD + ' adj ' + a[0] + c + ')';
    }).join(' ') + ' [Restore all armor](' + CMD + ' adj armor-restore' + c + ')');
    var sk = specialistKey(cid);
    if (sk) {
      var rating = getNum(cid, sk, 0), used = getNum(cid, sk + '_uses', 0);
      L.push('Specialist action: ' + cap(sk) + ' rank ' + rating + ', ' + used + ' of ' + rating + ' uses marked [Spend 1 use](' + CMD + ' adj spec+1' + c +
        ') [Restore uses](' + CMD + ' adj spec0' + c + ')');
    }
    L.push('XP: ' + xpLine(cid));
    L.push(XP_TRACKS.filter(function (x) { return x[0] !== 'specialist' || sk; }).map(function (x) {
      return '[XP ' + x[2] + '](' + CMD + ' adj xp-' + x[0] + c + ')';
    }).join(' '));
    L.push('[Clear or share harm](' + CMD + ' harmmenu' + c + ') [Load](' + CMD + ' load' + c + ')');
    whisper(msg, broadcast(t.c, { type: '', title: 'Status', content: L.join(NL) }));
    whisper(msg, harmCardText(t.c));
  }

  // ---------------------------------------------------------------- load

  var LOAD_TIERS = ['light', 'normal', 'heavy'];

  // the sheet's standard item attributes (blades.html, item_<tier>_<kind>_<n>); a playbook shows the ones with _show = 1.
  // si = one item, do = a choice of two (_check 1 or 2), "1box" = one box (_check), "3uses" = three use circles (_uses), desc = extra text.
  var FIXED_IDS = {
    light: 'si_fine_0 si_fine_1 do_fine_0 si_fine_3uses_0 si_fine_desc_0 si_fine_1box_0 si_0 si_1 si_2 si_3 si_1uses_0 si_3uses_0 si_4uses_0 si_5uses_0 si_1box_0'.split(' '),
    normal: 'si_fine_0 do_fine_0 si_fine_desc_0 si_fine_3uses_0 si_0 do_0 si_desc_0 si_1box_0 si_1uses_0 si_3uses_0 si_5uses_0'.split(' '),
    heavy: 'si_fine_0 si_fine_desc_0 do_fine_0 do_fine_desc_0 si_0 si_1 si_1uses_0 si_1uses_1'.split(' ')
  };

  // standard items the character shows (_show = 1), in sheet order
  function fixedItems(cid) {
    var out = [];
    LOAD_TIERS.forEach(function (tier) {
      FIXED_IDS[tier].forEach(function (suffix) {
        var id = 'item_' + tier + '_' + suffix, um, kind;
        if (String(getAttrByName(cid, id + '_show')) !== '1') { return; }
        var name = clean(getAttr(cid, id + '_name', ''));
        if (/^do_/.test(suffix)) { kind = 'pair'; }
        else if (/_[0-9]box_/.test(suffix)) { kind = 'box'; }
        else if ((um = /_([0-9])uses_/.exec(suffix))) { kind = 'uses'; }
        else { kind = 'plain'; }
        if (!name && kind !== 'pair') { return; }
        out.push({
          id: id, tier: tier, kind: kind, name: name, fine: /_fine_/.test(suffix), max: um ? parseInt(um[1], 10) : 0,
          name2: kind === 'pair' ? clean(getAttr(cid, id + '_name2', '')) : '',
          extra: /_desc_/.test(suffix) ? clean(getAttr(cid, id + '_extra', '')) : '',
          check: (kind === 'pair' || kind === 'box') ? String(getAttrByName(cid, id + '_check')) : '',
          used: kind === 'uses' ? getNum(cid, id + '_uses', 0) : 0
        });
      });
    });
    return out;
  }

  function utilityRows(cid) {
    var out = [];
    listRows(cid, 'item', 'name').forEach(function (r) {
      var name = clean(r.value);
      if (!name) { return; }
      var base = 'repeating_item_' + r.row + '_';
      out.push({
        row: r.row, base: base, name: name, boxes: clamp(getNum(cid, base + 'num_boxes', 1) || 1, 1, 2), check: getNum(cid, base + 'check', 0),
        uses: clamp(getNum(cid, base + 'num_uses', 0), 0, 5), used: getNum(cid, base + 'item_uses', 0)
      });
    });
    return out;
  }

  function itemButton(label, cid, sec, row, idx) {
    return '[' + btn(label) + '](' + CMD + ' loaditem --c ' + cid + ' --sec ' + sec + ' --row ' + row + (idx ? ' --idx ' + idx : '') + ')';
  }

  function renderFixed(cid, it) {
    var nm = it.name + (it.fine ? ' (fine)' : '') + (it.extra ? ' - ' + it.extra : '');
    if (it.kind === 'box') { return itemButton((it.check === '1' ? G_CHECKED : G_BOX) + ' ' + nm, cid, 'fixed', it.id); }
    if (it.kind === 'uses') { return itemButton(it.name + (it.fine ? ' fine' : '') + ' ' + it.used + '/' + it.max, cid, 'fixed', it.id); }
    if (it.kind === 'pair') {
      return itemButton((it.check === '1' ? G_ON : G_OFF) + ' ' + (it.name || '?'), cid, 'fixed', it.id, '1') + ' or ' +
        itemButton((it.check === '2' ? G_ON : G_OFF) + ' ' + (it.name2 || '?'), cid, 'fixed', it.id, '2');
    }
    return nm;
  }

  function doLoad(msg, o) {
    var t = target(msg, o); if (!t) { return; }
    var cid = t.ch.id, current = String(getAttr(cid, 'load', '')).toLowerCase(), L = [];
    if (LOAD_TIERS.indexOf(current) < 0) { current = ''; }
    L.push('Load: ' + LOAD_TIERS.map(function (s) {
      return '[' + (current === s ? G_ON + ' ' : '') + cap(s) + '](' + CMD + ' loadstyle ' + s + ' --c ' + cid + ')';
    }).join(' '));
    if (!current) {
      L.push('No load chosen. Pick Light, Normal or Heavy to list its items. Each tier includes the one before it.');
    } else {
      LOAD_TIERS.forEach(function (tier) {
        if (LOAD_TIERS.indexOf(tier) > LOAD_TIERS.indexOf(current)) { return; }
        var items = fixedItems(cid).filter(function (x) { return x.tier === tier; });
        L.push(cap(tier) + ': ' + (items.length ? items.map(function (it) { return renderFixed(cid, it); }).join('  ') : 'no items listed on this sheet'));
      });
    }
    var util = utilityRows(cid), marked = 0;
    util.forEach(function (u) { marked += u.check; });
    L.push('Utility (' + UTILITY_LOAD + ' load, more if the Quartermaster allows), marked ' + marked + ':');
    L.push(util.length ? util.map(function (u) {
      var s = itemButton((u.check >= u.boxes ? G_ON : (u.check ? G_HALF : G_OFF)) + ' ' + u.name + (u.boxes > 1 ? ' x' + u.boxes : ''), cid, 'utility', u.row, 'c');
      if (u.uses > 0) { s += ' ' + itemButton(u.name + ' uses ' + u.used + '/' + u.uses, cid, 'utility', u.row, 'u'); }
      return s;
    }).join('  ') : 'No utility items are listed on this sheet.');
    whisper(msg, broadcast(t.c, { type: '', title: 'Load', content: L.join(NL) }));
  }

  // R7: choosing a load restores all armor
  function doLoadStyle(msg, o) {
    var t = target(msg, o); if (!t) { return; }
    var cid = t.ch.id, style = String(o.pos[0] || '').toLowerCase();
    if (LOAD_TIERS.indexOf(style) < 0) { whisper(msg, 'BoB: "' + clean(style) + '" is not a load.'); return; }
    setAttr(cid, 'load', style);
    if (LOAD_RESETS_ARMOR) {
      restoreArmor(cid);
      note(msg, t.c, 'Load', cap(style) + ' load', 'Armor restored: all four armor boxes are marked free (Resistance and Armor).');
    }
    dbg('load ' + style + (LOAD_RESETS_ARMOR ? ', armor restored' : ''));
    doLoad(msg, { c: cid, pos: [] });
  }

  function doLoadItem(msg, o) {
    var t = target(msg, o); if (!t) { return; }
    var cid = t.ch.id, row = String(o.row || '');
    if (o.sec === 'fixed') {
      var it = fixedItems(cid).filter(function (x) { return x.id === row; })[0];
      if (!it) { whisper(msg, 'BoB: that item is no longer on the sheet.'); return; }
      if (it.kind === 'box') { setAttr(cid, it.id + '_check', it.check === '1' ? '0' : '1'); }
      else if (it.kind === 'pair') {
        var pick = String(o.idx);
        if (pick !== '1' && pick !== '2') { whisper(msg, 'BoB: pick the first or the second item.'); return; }
        setAttr(cid, it.id + '_check', it.check === pick ? '0' : pick);
      } else if (it.kind === 'uses') { setAttr(cid, it.id + '_uses', it.used >= it.max ? 0 : it.used + 1); }
      else { whisper(msg, 'BoB: that item has no box to mark.'); return; }
    } else if (o.sec === 'utility') {
      var u = utilityRows(cid).filter(function (x) { return x.row === row; })[0];
      if (!u) { whisper(msg, 'BoB: that item is no longer on the sheet.'); return; }
      if (o.idx === 'u') {
        if (u.uses < 1) { whisper(msg, 'BoB: that item has no uses.'); return; }
        setAttr(cid, u.base + 'item_uses', u.used >= u.uses ? 0 : u.used + 1);
      } else {
        setAttr(cid, u.base + 'check', u.check >= u.boxes ? 0 : u.check + 1);
      }
    } else { whisper(msg, 'BoB: unknown item list.'); return; }
    doLoad(msg, { c: cid, pos: [] });
  }

  // ---------------------------------------------------------------- router

  function doDebug(msg, o) {
    if (!playerIsGM(msg.playerid)) { whisper(msg, 'BoB: only the GM can switch debugging.'); return; }
    var mode = String(o.pos[0] || '').toLowerCase();
    if (mode === 'on' || mode === 'off') { botState().debug = mode === 'on'; }
    whisper(msg, 'BoB: debugging is ' + (botState().debug ? 'on' : 'off') + '. Use !bobtam debug on or off. Notes go to the API console.');
  }

  function route(msg, o) {
    switch (o.verb) {
      case 'setup': case 'rebuild': return doSetup(msg, o);
      case 'roll': return doRoll(msg, o);
      case 'resist': return doResist(msg, o);
      case 'fortune': return doFortune(msg, o);
      case 'abilities': return doAbilities(msg, o);
      case 'ability': return doAbilityShow(msg, o);
      case 'stress': return doStress(msg, o);
      case 'tcond': return doCondition(msg, o, 'trauma');
      case 'tclear': return doConditionClear(msg, o, 'trauma');
      case 'bcond': return doCondition(msg, o, 'blight');
      case 'bclear': return doConditionClear(msg, o, 'blight');
      case 'adj': return doAdjust(msg, o);
      case 'harm': return doAddHarm(msg, o);
      case 'harmmenu': return doHarmMenu(msg, o);
      case 'harmclear': return doHarmClear(msg, o);
      case 'shareharm': return doShareHarm(msg, o);
      case 'status': return doStatus(msg, o);
      case 'load': return doLoad(msg, o);
      case 'loadstyle': return doLoadStyle(msg, o);
      case 'loaditem': return doLoadItem(msg, o);
      case 'debug': return doDebug(msg, o);
      default:
        whisper(msg, 'BoB Token Action Maker v' + VERSION + ': select a PC token and run ' + MACRO_NAME +
          ' (or the ~ Rebuild token action) to build the token actions.');
    }
  }

  function ensureMacro() {
    var gms = findObjs({ _type: 'player' }).filter(function (p) { return playerIsGM(p.id); });
    if (!gms.length) { return; }
    var m = findObjs({ _type: 'macro', name: MACRO_NAME })[0];
    if (!m) {
      createObj('macro', { _playerid: gms[0].id, name: MACRO_NAME, action: CMD + ' setup', visibleto: 'all' });
    } else {
      if (m.get('visibleto') !== 'all') { m.set('visibleto', 'all'); }
      if (m.get('action') !== CMD + ' setup') { m.set('action', CMD + ' setup'); }
    }
  }

  function register() {
    on('chat:message', function (msg) {
      if (msg.type !== 'api') { if (msg.rolltemplate === 'blades') { checkWatchedRoll(msg); } return; }
      if (String(msg.content).split(/\s+/)[0] !== CMD) { return; }
      try {
        dbg('command from ' + who(msg) + ': ' + msg.content);
        route(msg, parse(msg.content));
      } catch (e) {
        log('BoB error: ' + (e && e.stack ? e.stack : e));
        try { whisper(msg, 'BoB: something went wrong (' + clean(e && e.message ? e.message : e) + '). Check the API console.'); } catch (e2) { /* ignore */ }
      }
    });
    on('change:attribute:current', function (obj) {
      var nm = String(obj.get('name'));
      if (AUTO_TRAUMA && nm === 'stress') { autoTrauma(obj); }
      if (LINK_STRESS_BAR && nm === 'setting_extra_stress') { syncStressBars(obj.get('_characterid')); }
    });
    on('change:graphic:bar1_value', function (obj) {
      if (!LINK_STRESS_BAR) { return; }
      var id = obj.id;
      setTimeout(function () { healStressBar(id); }, 2000);
    });
    on('ready', function () {
      ensureMacro();
      log('BoB Token Action Maker v' + VERSION + ' ready');
    });
  }

  register();

  return { VERSION: VERSION, _route: route, _parse: parse };
}());

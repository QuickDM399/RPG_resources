/* BitD Crew Token Action Maker  v0.2.0
 * Roll20 API script for the Evil Hat "Blades in the Dark" sheet (v3.11), CREW sheets only.
 * Companion to "BitD Token Action Maker.js" (player characters, command !bitd). The two scripts share nothing:
 *   command !bitdcrew | variable BitDCrewTAM | state key BitDCrewTAM | ability marker bitd-crew-tam | macro CREW_TAM
 *
 * Setup:   select a crew token and run the global macro CREW_TAM (or the "~ Rebuild" token action once a token has
 *          actions). GMs: any crew. Players: only crews they control. Run ~ Rebuild again after a Deep Cuts module is
 *          switched on or off, or after a cohort is added or renamed (the token action text is built from the sheet).
 * Command: !bitdcrew <verb> ...   (see route() for the verbs)
 *
 * Rules: every automatic rule is from the books (see the Spec). Core rules apply to a crew with the Deep Cuts Downtime
 * module off, Deep Cuts rules to a crew with it on (per-crew setting_dc_downtime, read at click time).
 *   - Heat reaching 9: +1 Wanted, Heat clears, the excess rolls over (core, Heat). Fires on token bar 1 / sheet edits.
 *   - Score (button 4): Heat from the score. Downtime on: Fallout, Rep and the walk through the Payoff (Deep Cuts p80-81).
 *   - Entanglement roll (core only) names the table result; Deep Cuts has no entanglement roll.
 *   - Deep Cuts Downtime crews: a Heat and Hold card with a once-per-Downtime ledger (Just Passing Through, Reduce Heat,
 *     Assess hold, End Downtime with No Traces' +1 Rep), Leverage's +1 Rep on every Rep gain, Misdirection after a Score.
 *   - Party link: !bitdcrew party (GM) lists the characters Roll20 marks as Party members; the Score's PC count can use it.
 *   - !bitdcrew debug on|off (GM) writes the new flows to the API console.
 */
var BitDCrewTAM = BitDCrewTAM || (function () {
  'use strict';

  var VERSION = '0.2.0';
  var CMD = '!bitdcrew';
  var MARK = 'bitd-crew-tam';
  var SENDER = 'BitDCrew';
  var MACRO_NAME = 'CREW_TAM';
  var STATE_KEY = 'BitDCrewTAM';
  // Roll20's Party member flag, reported (not yet verified in this game) as this tag inside a character's tags property
  var PARTY_TAG = '_roll20_internal_party_tag_';

  // When Heat reaches 9 (token bar 1, the sheet or any other edit) add a Wanted level and clear Heat with rollover.
  var AUTO_HEAT = true;
  // After a script-posted Entanglement roll (core rules), read the dice and name the table result.
  var AUTO_ENTANGLEMENT = true;

  // Line separator inside {{content=...}}
  var NL = '\n';

  var HEAT_MAX = 9, REP_MAX = 12, TURF_MAX = 6, TIER_MAX = 4, CREW_XP_MAX = 10;
  var FLOW_MAX = 40;

  // glyphs kept as char codes so the source stays plain ASCII
  var G_ON = String.fromCharCode(0x25CF), G_OFF = String.fromCharCode(0x25CB);
  var RE_SQ = new RegExp('[' + String.fromCharCode(0x2018, 0x2019) + ']', 'g');

  var ABILITY_NAMES = ['1. Roll', '2. Engagement', '3. Fortune', '4. Score', '5. Abilities', '6. Adjust',
    '7. Clocks', '8. Status', '~ Rebuild'];

  // Core book, Entanglements: columns by Heat, rows by the roll result (1-3, 4/5, 6).
  var ENT_COLUMNS = [
    { name: 'Heat 0-3', rows: [['Gang Trouble', 'The Usual Suspects'], ['Rivals', 'Unquiet Dead'], ['Cooperation']] },
    { name: 'Heat 4-5', rows: [['Gang Trouble', 'Questioning'], ['Reprisals', 'Unquiet Dead'], ['Show of Force']] },
    { name: 'Heat 6+', rows: [['Flipped', 'Interrogation'], ['Demonic Notice', 'Show of Force'], ['Arrest']] }
  ];
  var ENT_ROW_NAMES = ['1-3', '4/5', '6'];

  // Deep Cuts p82, Bluecoats entanglement by Wanted level 0 to 4
  var BLUECOATS = [
    'Questioning, harassment, threats, observation/tailing.',
    'Beatings (Harm 1), demands, observation/tailing.',
    'Serious Beatings (Harm 2), interrogation, or seizure of assets.',
    'Severe Beatings (Harm 3), an arrest, or destruction of assets.',
    'Lethal force, arrests, or destruction/seizure of lair and all assets.'
  ];

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
  // option text inside a ?{Label|text,value} prompt: no comma, bar, brace or bracket
  function opt(s) {
    return clean(s).replace(/[,\[\]{}()]/g, '').replace(/\s+/g, ' ').slice(0, 40);
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

  function normName(s) {
    return String(s === undefined || s === null ? '' : s).replace(RE_SQ, "'").replace(/\s+/g, ' ').trim().toLowerCase();
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

  // sheet "bitd-broadcast" card
  function broadcast(c, o) {
    var s = '&{template:bitd-broadcast} {{charname=' + clean(c.name) + '}}';
    if (o.type) { s += ' {{type=' + o.type + '}}'; }
    if (o.title) { s += ' {{title=' + o.title + '}}'; }
    if (o.content) { s += ' {{content=' + o.content + '}}'; }
    if (c.image && !o.noimage) { s += ' {{charimage=' + clean(c.image) + '}}'; }
    return s;
  }

  // compact confirmation card: header type, big title, small content line
  function note(msg, c, type, title, content) {
    whisper(msg, broadcast(c, { type: clean(type), title: clean(title), content: clean(content) }));
  }

  function parse(content) {
    var t = content.trim().split(/\s+/);
    var o = { verb: String(t[1] || '').toLowerCase(), pos: [], c: null, row: null, idx: null, n: null };
    for (var i = 2; i < t.length; i++) {
      if (t[i] === '--c') { o.c = t[++i]; }
      else if (t[i] === '--row') { o.row = t[++i]; }
      else if (t[i] === '--idx') { o.idx = t[++i]; }
      else if (t[i] === '--n') { o.n = t[++i]; }
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

  // Common entry for every verb that works on one crew. Returns {ch, c} or null.
  function target(msg, o) {
    var ch = resolveChar(msg, o);
    if (!ch) { whisper(msg, 'BitDCrew: select a crew token first.'); return null; }
    if (!allowed(msg, ch)) { whisper(msg, 'BitDCrew: you can only use this on crews you control.'); return null; }
    if (getAttr(ch.id, 'sheet_type', 'character') !== 'crew') {
      whisper(msg, 'BitDCrew: ' + clean(ch.get('name')) + ' is a character or faction sheet. This script handles crew sheets only (player characters use !bitd).');
      return null;
    }
    return { ch: ch, c: info(ch.id) };
  }

  function mods(cid) {
    return {
      action: isOn(cid, 'setting_dc_action'),
      advancement: isOn(cid, 'setting_dc_advancement'),
      downtime: isOn(cid, 'setting_dc_downtime'),
      harm: isOn(cid, 'setting_dc_harm'),
      load: isOn(cid, 'setting_dc_load')
    };
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

  function botState() {
    state[STATE_KEY] = state[STATE_KEY] || {};
    state[STATE_KEY].flows = state[STATE_KEY].flows || {};
    state[STATE_KEY].downtime = state[STATE_KEY].downtime || {};
    return state[STATE_KEY];
  }
  // verbose API-console logging for the newer flows; switched by !bitdcrew debug on|off
  function dbg(text) { if (botState().debug) { log('BitDCrew debug: ' + text); } }

  // ---------------------------------------------------------------- sheet readers

  // Wanted: the 4-box track (wanted) normally; the 5-box track (wantedDC) when the sheet's 5th Wanted box is switched on
  function wantedInfo(cid) {
    return isOn(cid, 'setting_wanted_5th') ? { attr: 'wantedDC', max: 5, label: 'Wanted (5-box track)' } : { attr: 'wanted', max: 4, label: 'Wanted' };
  }

  // the crew's ticked abilities as a set of normalized names (a row counts only when its circle is ticked)
  function abilitiesOn(cid) {
    var on = {};
    listRows(cid, 'crewability', 'name').forEach(function (r) {
      if (String(getAttrByName(cid, 'repeating_crewability_' + r.row + '_check')) === '1') { on[normName(r.value)] = true; }
    });
    return on;
  }
  function crewAbilityOn(cid, name) { return abilitiesOn(cid)[normName(name)] === true; }

  // Deep Cuts p88: Slippery makes the effective Wanted level one less than the actual value
  function slipperyOn(cid) { return mods(cid).downtime && crewAbilityOn(cid, 'Slippery'); }
  function effectiveWanted(cid) {
    var actual = getNum(cid, wantedInfo(cid).attr, 0);
    return slipperyOn(cid) ? Math.max(0, actual - 1) : actual;
  }

  // The sheet's coin track: crewcoin (16 boxes) normally, crewcoin_dc (24 boxes) with the Downtime module
  function coinTrack(cid) {
    return mods(cid).downtime ? { attr: 'crewcoin_dc', max: 24 } : { attr: 'crewcoin', max: 16 };
  }
  // coin the crew can hold: 4 on hand plus the vaults (sheet text: standard 4 / 8 / 16, Deep Cuts 4 / 12 / 24)
  function coinCapacity(cid) {
    var dt = mods(cid).downtime, v1 = isOn(cid, 'upgrade_vault_check_1'), v2 = isOn(cid, 'upgrade_vault_check_2');
    return dt ? 4 + (v1 ? 8 : 0) + (v2 ? 12 : 0) : 4 + (v1 ? 4 : 0) + (v2 ? 8 : 0);
  }

  function turfClaimsTicked(cid) {
    var n = 0;
    for (var i = 1; i <= 15; i++) {
      var nm = normName(getAttrByName(cid, 'claim_' + i + '_name'));
      if ((nm === 'turf' || nm === 'claim_turf') && isOn(cid, 'claim_' + i + '_check')) { n++; }
    }
    return n;
  }

  // Party member flag (Roll20): the character's tags hold PARTY_TAG, as an array or as text
  function isPartyMember(ch) {
    var t;
    try { t = ch.get('tags'); } catch (e) { return false; }
    if (t === undefined || t === null || t === '') { return false; }
    return (typeof t === 'string' ? t : JSON.stringify(t)).indexOf(PARTY_TAG) >= 0;
  }
  function partyCharacters() { return findObjs({ _type: 'character' }).filter(isPartyMember); }
  function partyPcCount() {
    return partyCharacters().filter(function (c) { return getAttr(c.id, 'sheet_type', 'character') === 'character'; }).length;
  }

  // Rep the script gives the crew. Leverage: "Whenever you gain rep, gain +1 rep" (not for a gain of 0). Capped at the track.
  function gainRep(cid, n) {
    var before = getNum(cid, 'rep', 0), bonus = (n > 0 && crewAbilityOn(cid, 'Leverage')) ? 1 : 0;
    var want = n + bonus, after = Math.min(REP_MAX, before + want);
    if (after !== before) { setAttr(cid, 'rep', after); }
    dbg('gainRep ' + cid + ' asked ' + n + ' bonus ' + bonus + ': ' + before + ' to ' + after);
    return { asked: n, bonus: bonus, before: before, after: after, applied: after - before, full: before + want > REP_MAX };
  }

  function cohortList(cid) {
    var out = [];
    var n1 = String(getAttr(cid, 'cohort1_name', '')).trim();
    if (n1) { out.push({ code: 'cohort1', prefix: 'cohort1', name: n1 }); }
    listRows(cid, 'cohort', 'name').forEach(function (r) {
      var nm = String(r.value || '').trim();
      if (nm) { out.push({ code: 'cohort:' + r.row, prefix: 'repeating_cohort_' + r.row, name: nm }); }
    });
    return out;
  }
  function cohortType(cid, prefix) {
    var t = String(getAttr(cid, prefix + '_type', 'gang')).toLowerCase();
    return (t === 'gang' || t === 'elite' || t === 'expert') ? t : 'gang';
  }
  // sheet rule (calculateCohortDice): Tier, minus impaired, plus 1 for elite or expert
  function cohortPool(cid, prefix) {
    return getNum(cid, 'crew_tier', 0) - getNum(cid, prefix + '_impaired', 0) +
      ((cohortType(cid, prefix) === 'elite' || cohortType(cid, prefix) === 'expert') ? 1 : 0);
  }

  // ---------------------------------------------------------------- setup

  function intList(a, b) {
    var out = [];
    for (var i = a; i <= b; i++) { out.push(i); }
    return out.join('|');
  }

  function scoreMacro(dt) {
    if (!dt) {
      return CMD + ' score ?{Exposure|Smooth and quiet 0,0|Contained 2,2|Loud and chaotic 4,4|Wild 6,6}' +
        ' ?{High-profile or well-connected target|No,0|Yes +1,1}' +
        ' ?{On hostile turf|No,0|Yes +1,1}' +
        ' ?{At war with another faction|No,0|Yes +1,1}' +
        ' ?{Killing involved|No,0|Yes +2,2}';
    }
    return CMD + ' score ?{Base Heat|Smooth and low exposure 0,0|Standard criminal operation 2,2}' +
      ' ?{Target|Ordinary target 0,0|High profile or well-connected +2,2}' +
      ' ?{Chaos|None 0,0|Open combat or destruction or mayhem +2,2|At war with another faction +2,2|Both +4,4}' +
      ' ?{Death|No death 0,0|Death in connection to the score +4,4}' +
      ' ?{Witnesses|None 0,0|Witnesses who can be questioned +2,2|Crew members identified +4,4}' +
      ' ?{Target Tier|' + intList(0, 6) + '}' +
      ' ?{PCs for the Payoff (1 Coin each)|All party members,party|' + intList(1, 8) + '}';
  }

  function tokenActions(cid) {
    var m = mods(cid), dt = m.downtime;
    var rollOpts = ['Tier (@{selected|crew_tier}),tier'];
    if (!dt) { rollOpts.push('Entanglement (@{selected|' + wantedInfo(cid).attr + '}),wanted'); }
    cohortList(cid).forEach(function (c) { rollOpts.push('Cohort ' + opt(c.name) + ',' + c.code); });
    var adjust = 'Heat +1,heat+1|Heat -1,heat-1|Wanted +1,wanted+1|Wanted -1,wanted-1' +
      '|Incarceration (Wanted -1 and clear Heat),incarc' +
      '|Rep +1,rep+1|Rep -1,rep-1|Turf +1,turf+1|Turf -1,turf-1' +
      '|Coin +1,coin+1|Coin +2,coin+2|Coin +4,coin+4|Coin -1,coin-1|Coin -2,coin-2|Coin -4,coin-4' +
      '|Tier +1,tier+1|Tier -1,tier-1|Hold: strong,hold-strong|Hold: weak,hold-weak' +
      '|Mark crew XP,xp+1' +
      (dt ? '|Assess hold (Downtime rule),holdassess|Reduce Heat: spend 1 Coin,rh-coin|Reduce Heat: spend 1 Rep,rh-rep' +
        '|Debt clock +1,debt+1|Debt clock -1,debt-1|Downtime: Heat and Hold,hh|Downtime: start a new Downtime,dtstart' : '');
    var engagement = '&{template:blades} {{charname=@{selected|character_name}}} {{type=action}} {{short=short}} ' +
      '{{small-title=small-title}} {{subtitle=^{roll_for}}} {{title-engagement=1}} {{title=^{engagement}}} ' +
      '@{selected|numberofdice} {{charimage=@{selected|chat_image}}} @{selected|title_text}';
    var fortune = '&{template:blades} {{charname=@{selected|character_name}}} {{type=fortune}} {{subtitle=^{roll}}} ' +
      '{{title-fortune=1}} {{title=^{fortune}}} @{selected|numberofdice} {{notes=@{selected|notes_query}}} ' +
      '{{charimage=@{selected|chat_image}}} @{selected|title_text}';
    return [
      [ABILITY_NAMES[0], CMD + ' roll ?{Roll|' + rollOpts.join('|') + '} ?{Bonus dice|0|1|2|3|4|5|6|-1|-2|-3}'],
      [ABILITY_NAMES[1], engagement],
      [ABILITY_NAMES[2], fortune],
      [ABILITY_NAMES[3], scoreMacro(dt)],
      [ABILITY_NAMES[4], CMD + ' abilities'],
      [ABILITY_NAMES[5], CMD + ' adj ?{Adjust|' + adjust + '}'],
      [ABILITY_NAMES[6], CMD + ' clocks'],
      [ABILITY_NAMES[7], CMD + ' status'],
      [ABILITY_NAMES[8], CMD + ' setup']
    ];
  }

  // bar 1 = Heat: linked attribute, max = Heat boxes, shown to and editable by players
  function linkHeatBar(tok, cid) {
    var a = findObjs({ _type: 'attribute', _characterid: cid, name: 'heat' })[0];
    if (!a) { a = createObj('attribute', { _characterid: cid, name: 'heat', current: String(getNum(cid, 'heat', 0)) }); }
    // link first, then value and max: linking copies the attribute's (empty) max over anything set in the same call
    tok.set({ bar1_link: a.id });
    tok.set({ bar1_value: a.get('current'), bar1_max: HEAT_MAX, showplayers_bar1: true, playersedit_bar1: true });
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
    if (!targets.length) { whisper(msg, 'BitDCrew: select one or more crew tokens first.'); return; }
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
      tokenActions(cid).forEach(function (d) {
        if (taken[d[0]]) { skipped.push(d[0]); return; }
        createObj('ability', { _characterid: cid, name: d[0], description: MARK, action: d[1], istokenaction: true });
        made++;
      });
      var m = mods(cid), on = [];
      ['advancement', 'downtime', 'harm', 'load', 'action'].forEach(function (k) { if (m[k]) { on.push(cap(k)); } });
      var text = made + ' created. Deep Cuts modules on: ' + (on.length ? on.join(', ') : 'none') + '. Rules used: ' +
        (m.downtime ? 'Deep Cuts Downtime' : 'core') + '.';
      if (skipped.length) { text += ' Skipped (an ability with that name already exists): ' + skipped.join(', ') + '.'; }
      var linked = (tokens[cid] || []).map(function (tok) { return linkHeatBar(tok, cid); }).length;
      if (linked) { text += ' Bar 1 is linked to Heat on ' + linked + ' token' + (linked > 1 ? 's' : '') + '.'; }
      note(msg, t.c, 'Setup', 'Token actions ready', text);
      count++;
    });
    return count;
  }

  // ---------------------------------------------------------------- Heat, Wanted

  // A linked token bar is not refreshed by an API write, so any bar 1 linked to heat is set to the attribute value.
  function syncHeatBars(cid) {
    var a = findObjs({ _type: 'attribute', _characterid: cid, name: 'heat' })[0];
    if (!a) { return; }
    findObjs({ _type: 'graphic', represents: cid }).forEach(function (g) {
      if (g.get('bar1_link') !== a.id) { return; }
      var cur = String(a.get('current'));
      if (String(g.get('bar1_value')) !== cur) { g.set('bar1_value', cur); }
    });
  }
  function healHeatBar(tokId) {
    var tok = getObj('graphic', tokId), link = tok ? tok.get('bar1_link') : null, a = link ? getObj('attribute', link) : null;
    if (!a || a.get('name') !== 'heat') { return; }
    var cur = String(a.get('current'));
    if (String(tok.get('bar1_value')) !== cur) { tok.set('bar1_value', cur); }
  }

  // Heat from a given starting value, with the book's rollover: each time it reaches 9 the crew gains a Wanted level
  // (up to the track's highest level) and Heat clears, the excess rolling over (core, Heat).
  function applyHeat(cid, startHeat, amount) {
    var w = wantedInfo(cid), wanted0 = getNum(cid, w.attr, 0);
    var total = Math.max(0, startHeat + amount), wraps = 0, wanted = wanted0, capped = 0;
    while (total >= HEAT_MAX) {
      total -= HEAT_MAX; wraps++;
      if (wanted < w.max) { wanted++; } else { capped++; }
    }
    setAttr(cid, 'heat', total);
    if (wanted !== wanted0) { setAttr(cid, w.attr, wanted); }
    syncHeatBars(cid);
    setTimeout(function () { syncHeatBars(cid); }, 1500);
    return { cid: cid, before: startHeat, after: total, wraps: wraps, capped: capped, w: w, wantedBefore: wanted0, wantedAfter: wanted };
  }
  function addHeat(cid, amount) { return applyHeat(cid, getNum(cid, 'heat', 0), amount); }

  // lines of the card shown when Heat filled (empty if it did not)
  function wantedLines(cid, res) {
    var L = [];
    if (res.wraps < 1) { return L; }
    var gained = res.wantedAfter - res.wantedBefore, m = mods(cid);
    if (gained > 0) {
      L.push('Heat reached ' + HEAT_MAX + ': Wanted level +' + gained + ' (now ' + res.wantedAfter + '/' + res.w.max + '). Heat is cleared and the excess rolls over (core rules, Heat).');
    }
    if (res.wraps > 1) { L.push('Heat filled ' + res.wraps + ' times in one go.'); }
    if (res.capped > 0) {
      L.push('Wanted was already at its highest level (' + res.w.max + '), so no level was added for ' + res.capped + ' fill' + (res.capped > 1 ? 's' : '') + '. Heat was cleared anyway.');
    }
    if (m.downtime && gained > 0) {
      var eff = Math.min(4, effectiveWanted(cid));
      L.push('Deep Cuts, Entanglements: mark crew xp and pick Bluecoats as the entanglement.');
      L.push('Bluecoats at Wanted level ' + eff + ', reduced by any positive Status you have with them: ' + BLUECOATS[eff]);
      L.push('They can be bought off for ' + (eff + 4) + ' Coin (wanted level + 4).');
      if (slipperyOn(cid)) {
        L.push('Slippery: your effective Wanted level is one less than the actual one, and any Coin, Heat or Rep cost you pay for an entanglement is reduced by one.');
      }
      L.push('[Mark crew XP](' + CMD + ' adj xp+1 --c ' + cid + ')');
    }
    return L;
  }

  function wantedCardText(c, res, headline) {
    var lines = [];
    if (headline) { lines.push(headline); }
    lines = lines.concat(wantedLines(c.id, res));
    return broadcast(c, { type: 'Heat', title: 'Wanted level', content: lines.join(NL) });
  }
  function announceWanted(ch, c, res, headline, exceptPid) {
    var text = wantedCardText(c, res, headline);
    recipients(ch).forEach(function (id) { if (id !== exceptPid) { whisperPlayer(id, text); } });
  }

  // heat attribute changed (token bar 1, the sheet): the track is full
  function autoHeat(obj) {
    var cid = obj.get('_characterid'), ch = getObj('character', cid);
    if (!ch || getAttr(cid, 'sheet_type', 'character') !== 'crew') { return; }
    var cur = parseInt(obj.get('current'), 10);
    if (isNaN(cur) || cur < HEAT_MAX) { return; }
    var res = applyHeat(cid, cur, 0);
    findObjs({ _type: 'graphic', represents: cid }).forEach(function (g) {
      setTimeout(function () { healHeatBar(g.id); }, 1500);
    });
    announceWanted(ch, info(cid), res, 'Heat was set to ' + cur + '. It is now ' + res.after + '/' + HEAT_MAX + '.', null);
  }

  // ---------------------------------------------------------------- rolls

  function diceField(pool) {
    if (pool > 0) {
      var d = [];
      for (var i = 0; i < pool; i++) { d.push('[[d6]]'); }
      return 'dice=' + d.join(', ');
    }
    return 'zerodice=[[d6]], [[d6]]';
  }

  function tail(cid, c) {
    return (c.image ? ' {{charimage=' + clean(c.image) + '}}' : '') + ' ' + getAttr(cid, 'title_text', '');
  }

  // Entanglement rolls posted by this script and not yet seen come back through the chat
  var watching = [];
  function watchRoll(w) {
    var now = Date.now();
    watching = watching.filter(function (x) { return now - x.at < 60000; });
    w.at = now;
    watching.push(w);
  }

  // values of the d6 inline rolls of a posted card, or null if there are not exactly n of them
  function readDice(msg, n) {
    var rolls = msg.inlinerolls || [], vals = [];
    rolls.forEach(function (r) {
      var rr = r && r.results && r.results.rolls && r.results.rolls[0];
      if (rr && rr.sides === 6 && rr.dice === 1) { vals.push(r.results.total); }
    });
    return vals.length === n ? vals : null;
  }

  function checkWatchedRoll(msg) {
    if (!watching.length) { return; }
    var content = String(msg.content || ''), i, w;
    for (i = 0; i < watching.length; i++) {
      w = watching[i];
      if (Date.now() - w.at > 60000) { continue; }
      if (msg.playerid && msg.playerid !== w.pid && msg.playerid !== 'API') { continue; }
      if (content.indexOf('{{title-entanglement=1}}') < 0 || content.indexOf('{{charname=' + w.name + '}}') < 0) { continue; }
      watching.splice(i, 1);
      try { afterEntanglementRoll(msg, w); } catch (e) { log('BitDCrew entanglement error: ' + (e && e.stack ? e.stack : e)); }
      return;
    }
  }

  // core, Entanglements: the column is the crew's Heat, the row is the result of the roll
  function afterEntanglementRoll(msg, w) {
    var vals = readDice(msg, w.dice);
    if (!vals) { log('BitDCrew: could not read the dice of that Entanglement roll, so no result was named.'); return; }
    var die = vals[0], i;
    for (i = 1; i < vals.length; i++) { die = w.lowest ? Math.min(die, vals[i]) : Math.max(die, vals[i]); }
    var col = ENT_COLUMNS[w.heat >= 6 ? 2 : (w.heat >= 4 ? 1 : 0)], row = die >= 6 ? 2 : (die >= 4 ? 1 : 0);
    var ch = getObj('character', w.cid);
    if (!ch) { return; }
    var text = broadcast(info(w.cid), {
      type: 'Entanglement', title: col.rows[row].join(' or '),
      content: 'Heat was ' + w.heat + ', so the ' + col.name + ' column. ' + (w.lowest ? 'Lowest' : 'Highest') + ' die ' + die +
        ' is the ' + ENT_ROW_NAMES[row] + ' row: ' + col.rows[row].join(' or ') + '.' + NL +
        'Pick one if there are two. Bring it into play now or hold it for the right moment (core rules, Entanglements).'
    });
    recipients(ch).forEach(function (id) { whisperPlayer(id, text); });
  }

  function doRoll(msg, o) {
    var t = target(msg, o); if (!t) { return; }
    var cid = t.ch.id, what = String(o.pos[0] || ''), bonus = parseInt(o.pos[1], 10);
    if (isNaN(bonus)) { bonus = 0; }
    bonus = clamp(bonus, -3, 6);
    var m = mods(cid), pool, text;
    if (what === 'tier') {
      pool = getNum(cid, 'crew_tier', 0) + bonus;
      text = '&{template:blades} {{charname=' + clean(t.c.name) + '}} {{type=resist}} {{short=short}} {{title-crew_tier=1}} ' +
        '{{title=^{crew_tier}}} {{subtitle=^{roll_their}}} {{' + diceField(pool) + '}}' + tail(cid, t.c);
      sendChat('player|' + msg.playerid, text);
    } else if (what === 'wanted') {
      if (m.downtime) {
        whisper(msg, 'BitDCrew: Deep Cuts Downtime has no entanglement roll. The GM brings an entanglement in when Heat is 6 or more, or when the fiction demands it. Run ~ Rebuild to update the token actions.');
        return;
      }
      var wi = wantedInfo(cid), heat = getNum(cid, 'heat', 0);
      pool = getNum(cid, wi.attr, 0) + bonus;
      text = '&{template:blades} {{charname=' + clean(t.c.name) + '}} {{type=vice}} {{short=short}} {{title-entanglement=1}} ' +
        '{{title=^{entanglement}}} {{subtitle=^{wantedroll1}' + heat + ' ' + clean(getAttr(cid, 'setting_heat_label', 'Heat')) + '^{wantedroll2}}} ' +
        '{{' + diceField(pool) + '}}' + tail(cid, t.c);
      if (AUTO_ENTANGLEMENT) {
        watchRoll({ pid: msg.playerid, cid: cid, name: clean(t.c.name), heat: heat, dice: pool > 0 ? pool : 2, lowest: pool <= 0 });
      }
      // a sendChat callback would stop the card being posted, so it is posted as usual and the posted message is watched
      sendChat('player|' + msg.playerid, text);
    } else if (what === 'cohort1' || what.indexOf('cohort:') === 0) {
      var co = cohortList(cid).filter(function (c) { return c.code === what; })[0];
      if (!co) { whisper(msg, 'BitDCrew: that cohort is no longer on the sheet. Run ~ Rebuild to refresh the Roll list.'); return; }
      var type = cohortType(cid, co.prefix), sub = clean(getAttr(cid, co.prefix + '_subtype', ''));
      var verb = clean(getAttr(cid, co.prefix + '_verb', type === 'expert' ? '^{rolls_their}' : '^{roll_their}'));
      pool = cohortPool(cid, co.prefix) + bonus;
      text = '&{template:blades} {{type=resist}} {{short=short}} {{charname=' + clean(co.name).replace(/\s+/g, ' ') + ' (^{' + type + '}' + (sub ? ', ' + sub : '') + ')}} ' +
        '{{title-cohort_quality=1}} {{title=^{cohort_quality}}} {{subtitle=' + verb + '}} {{' + diceField(pool) + '}}' + tail(cid, t.c);
      sendChat('player|' + msg.playerid, text);
    } else {
      whisper(msg, 'BitDCrew: unknown roll "' + clean(o.pos[0]) + '".');
    }
  }

  // ---------------------------------------------------------------- abilities and clocks menus

  function doAbilities(msg, o) {
    var t = target(msg, o); if (!t) { return; }
    var cid = t.ch.id, buttons = [];
    listRows(cid, 'crewability', 'name').forEach(function (r) {
      var label = btn(r.value);
      if (!label) { return; }
      // only abilities the crew has: the circle next to the ability is ticked on the sheet
      if (String(getAttrByName(cid, 'repeating_crewability_' + r.row + '_check')) !== '1') { return; }
      buttons.push('[' + label + '](~' + cid + '|repeating_crewability_' + r.row + '_Show)');
    });
    whisper(msg, broadcast(t.c, {
      type: '^{special_ability}',
      title: 'Show to the table',
      content: buttons.length ? buttons.join(' ') : 'No crew abilities are ticked on this sheet. Tick the circle next to an ability to list it here.'
    }));
  }

  function clockSize(cid, base) {
    var n = getNum(cid, base + '_size', 0);
    return [4, 6, 8, 10, 12].indexOf(n) >= 0 ? n : 4;
  }
  function crewClocks(cid) {
    var out = [];
    listRows(cid, 'crewclock', 'name').forEach(function (r) {
      var nm = String(r.value || '').trim();
      if (!nm) { return; }
      var base = 'repeating_crewclock_' + r.row;
      out.push({ row: r.row, name: nm, base: base, size: clockSize(cid, base), progress: getNum(cid, base + '_progress', 0) });
    });
    return out;
  }

  function doClocks(msg, o) {
    var t = target(msg, o); if (!t) { return; }
    var cid = t.ch.id, L = [];
    crewClocks(cid).forEach(function (k) {
      L.push(btn(k.name) + ' ' + k.progress + '/' + k.size + ' [-1](' + CMD + ' clock --c ' + cid + ' --row ' + k.row + ' --n -1) ' +
        '[+1](' + CMD + ' clock --c ' + cid + ' --row ' + k.row + ' --n 1) ' +
        '[Show](~' + cid + '|repeating_crewclock_' + k.row + '_Show)');
    });
    whisper(msg, broadcast(t.c, { type: '', title: 'Clocks', content: L.length ? L.join(NL) : 'No crew clocks are named on this sheet.' }));
  }

  function clockCard(msg, c, title, n, size) {
    whisper(msg, '&{template:bitd-broadcast} {{charname=' + clean(c.name) + '}} {{title=' + title + '}} {{clock=1}} {{clocksize=' + size +
      '}} {{clockprogress=' + n + '}}');
  }

  function doClockTick(msg, o) {
    var t = target(msg, o); if (!t) { return; }
    var cid = t.ch.id, delta = parseInt(o.n, 10);
    if (isNaN(delta) || delta === 0) { whisper(msg, 'BitDCrew: pick -1 or +1.'); return; }
    var k = crewClocks(cid).filter(function (x) { return x.row === o.row; })[0];
    if (!k) { whisper(msg, 'BitDCrew: that clock is no longer on the sheet.'); return; }
    var next = clamp(k.progress + (delta > 0 ? 1 : -1), 0, k.size);
    if (next === k.progress) { note(msg, t.c, 'Clock', btn(k.name) + ' ' + k.progress + ' / ' + k.size, delta > 0 ? 'Already full.' : 'Already empty.'); return; }
    setAttr(cid, k.base + '_progress', next);
    clockCard(msg, t.c, clean(k.name), next, k.size);
  }

  // ---------------------------------------------------------------- adjust

  function counter(msg, t, attrName, delta, lo, hi, label, noteText) {
    var cid = t.ch.id, cur = getNum(cid, attrName, 0), next = clamp(cur + delta, lo, hi);
    if (next === cur) { note(msg, t.c, label, label + ' ' + cur, delta > 0 ? 'Already at the maximum.' : 'Already at the minimum.'); return; }
    setAttr(cid, attrName, next);
    note(msg, t.c, label, label + ' ' + next + ' / ' + hi, 'Was ' + cur + '.' + (noteText ? ' ' + noteText : ''));
  }

  function tickClock(msg, t, attrName, delta, size, title) {
    var cid = t.ch.id, cur = getNum(cid, attrName, 0), next = clamp(cur + delta, 0, size);
    if (next === cur) { note(msg, t.c, 'Clock', cur + ' / ' + size, (delta > 0 ? 'Already full.' : 'Already empty.')); return; }
    setAttr(cid, attrName, next);
    clockCard(msg, t.c, title, next, size);
  }

  function adjustHeat(msg, t, delta) {
    var cid = t.ch.id, cur = getNum(cid, 'heat', 0);
    if (delta < 0 && cur === 0) { note(msg, t.c, 'Heat', 'Heat 0', 'Already at the minimum.'); return; }
    var res = addHeat(cid, delta);
    note(msg, t.c, 'Heat', 'Heat ' + res.after + ' / ' + HEAT_MAX, bar(res.after, HEAT_MAX) + (res.wraps ? ' Heat filled: see the Wanted card.' : ''));
    if (res.wraps) { announceWanted(t.ch, t.c, res, null, null); }
  }

  function adjustWanted(msg, t, delta) {
    var cid = t.ch.id, w = wantedInfo(cid);
    counter(msg, t, w.attr, delta, 0, w.max, 'Wanted');
  }

  function markCrewXp(msg, t) {
    var cid = t.ch.id, m = mods(cid);
    if (m.advancement) {
      var size = getNum(cid, 'dc_xp_clocksize', 6);
      for (var i = 1; i <= 4; i++) {
        var cur = getNum(cid, 'dc_crew_xpclock_' + i, 0);
        if (cur < size) {
          setAttr(cid, 'dc_crew_xpclock_' + i, cur + 1);
          clockCard(msg, t.c, 'Crew advancement clock ' + i, cur + 1, size);
          return;
        }
      }
      note(msg, t.c, 'XP', 'All clocks full', 'All four crew advancement clocks are full. Spend them on an advance, or add another clock (Deep Cuts, Advancement).');
      return;
    }
    var before = getNum(cid, 'crew_xp', 0);
    if (before >= CREW_XP_MAX) { note(msg, t.c, 'XP', 'Crew XP ' + before, 'Already at the maximum.'); return; }
    setAttr(cid, 'crew_xp', before + 1);
    note(msg, t.c, 'XP', 'Crew XP ' + (before + 1) + ' / ' + CREW_XP_MAX, 'Was ' + before + '.');
    // core crew advancement (both Deep Cuts modules off): reminder only, nothing is cleared or paid out
    if (before + 1 >= CREW_XP_MAX && !m.downtime) {
      whisper(msg, broadcast(t.c, {
        type: 'Crew XP', title: 'Crew advancement tracker full',
        content: 'Clear the marks and take a new special ability or mark two crew upgrade boxes (core rules, Crew Advancement). ' +
          'Each PC gets stash equal to the crew Tier+2 for the advance.' + NL +
          '[Clear the XP tracker](' + CMD + ' adj xpclear --c ' + cid + ')'
      }));
    }
  }

  function doAdjust(msg, o) {
    var t = target(msg, o); if (!t) { return; }
    var cid = t.ch.id, code = String(o.pos[0] || ''), m = mods(cid), tr = coinTrack(cid), res;
    switch (code) {
      case 'heat+1': adjustHeat(msg, t, 1); break;
      case 'heat-1': adjustHeat(msg, t, -1); break;
      case 'wanted+1': adjustWanted(msg, t, 1); break;
      case 'wanted-1': adjustWanted(msg, t, -1); break;
      case 'incarc':
        // core, Incarceration: the wanted level is reduced by 1 and the crew clears its Heat
        var wi = wantedInfo(cid), wnow = getNum(cid, wi.attr, 0), wnext = Math.max(0, wnow - 1);
        setAttr(cid, wi.attr, wnext);
        setAttr(cid, 'heat', 0);
        syncHeatBars(cid);
        note(msg, t.c, 'Heat', 'Incarceration', 'Wanted ' + wnow + ' to ' + wnext + ', Heat cleared (core rules, Incarceration).' + (wnow === 0 ? ' Wanted was already 0.' : ''));
        break;
      case 'rep+1': counter(msg, t, 'rep', 1, 0, REP_MAX, 'Rep'); break;
      case 'rep-1': counter(msg, t, 'rep', -1, 0, REP_MAX, 'Rep'); break;
      case 'turf+1': counter(msg, t, 'turf', 1, 0, TURF_MAX, 'Turf'); break;
      case 'turf-1': counter(msg, t, 'turf', -1, 0, TURF_MAX, 'Turf'); break;
      case 'coin+1': counter(msg, t, tr.attr, 1, 0, tr.max, 'Coin'); break;
      case 'coin+2': counter(msg, t, tr.attr, 2, 0, tr.max, 'Coin'); break;
      case 'coin+4': counter(msg, t, tr.attr, 4, 0, tr.max, 'Coin'); break;
      case 'coin-1': counter(msg, t, tr.attr, -1, 0, tr.max, 'Coin'); break;
      case 'coin-2': counter(msg, t, tr.attr, -2, 0, tr.max, 'Coin'); break;
      case 'coin-4': counter(msg, t, tr.attr, -4, 0, tr.max, 'Coin'); break;
      case 'tier+1': counter(msg, t, 'crew_tier', 1, 0, TIER_MAX, 'Tier'); break;
      case 'tier-1': counter(msg, t, 'crew_tier', -1, 0, TIER_MAX, 'Tier'); break;
      case 'hold-strong':
      case 'hold-weak':
        setAttr(cid, 'hold', code === 'hold-strong' ? 'strong' : 'weak');
        note(msg, t.c, 'Hold', 'Hold ' + (code === 'hold-strong' ? 'strong' : 'weak'), 'Set by hand.');
        break;
      case 'holdassess':
        if (!m.downtime) { whisper(msg, 'BitDCrew: the Downtime module is off for this crew, so hold is set by hand.'); break; }
        assessHold(msg, t);
        break;
      case 'xp+1': markCrewXp(msg, t); break;
      case 'xpclear':
        setAttr(cid, 'crew_xp', 0);
        note(msg, t.c, 'XP', 'Crew XP 0', 'Tracker cleared.');
        break;
      case 'debt+1':
      case 'debt-1':
        if (!m.downtime) { whisper(msg, 'BitDCrew: the Downtime module is off for this crew.'); break; }
        tickClock(msg, t, 'crew_debt_dc', code === 'debt+1' ? 1 : -1, getNum(cid, 'crew_debt_dc_max', 4), '^{debt}');
        break;
      case 'rh-coin':
      case 'rh-rep':
        // Deep Cuts, Reduce Heat: Heat -1 for each Coin or Rep the crew expends
        if (!m.downtime) { whisper(msg, 'BitDCrew: Reduce Heat by spending Coin or Rep is a Deep Cuts Downtime rule, and the module is off for this crew.'); break; }
        reduceHeat(msg, t, code === 'rh-coin' ? 'Coin' : 'Rep');
        break;
      case 'hh': doHeatHold(msg, o); break;
      case 'dtstart': doDowntimeStart(msg, t); break;
      default: whisper(msg, 'BitDCrew: unknown adjustment "' + clean(code) + '".');
    }
  }

  // Deep Cuts, Assess Hold: strong hold when turf claims are equal to or greater than the Tier
  function holdByRule(cid) { return getNum(cid, 'turf', 0) >= getNum(cid, 'crew_tier', 0) ? 'strong' : 'weak'; }

  function assessHold(msg, t) {
    var cid = t.ch.id, holdNow = holdByRule(cid);
    setAttr(cid, 'hold', holdNow);
    note(msg, t.c, 'Hold', 'Hold ' + holdNow, 'Turf ' + getNum(cid, 'turf', 0) + ', Tier ' + getNum(cid, 'crew_tier', 0) +
      '. Strong hold needs turf claims equal to or greater than your Tier (Deep Cuts, Assess Hold).');
    return holdNow;
  }

  // Deep Cuts, Reduce Heat: Heat -1 for each Coin or Rep the crew expends. Returns true when it was applied.
  function reduceHeat(msg, t, payName) {
    var cid = t.ch.id, pay = payName === 'Coin' ? coinTrack(cid).attr : 'rep';
    if (getNum(cid, 'heat', 0) < 1) { note(msg, t.c, 'Heat', 'Heat 0', 'There is no Heat to reduce.'); return false; }
    if (getNum(cid, pay, 0) < 1) { note(msg, t.c, 'Heat', 'No ' + payName, 'The crew has no ' + payName + ' to spend.'); return false; }
    setAttr(cid, pay, getNum(cid, pay, 0) - 1);
    var res = addHeat(cid, -1);
    note(msg, t.c, 'Heat', 'Heat ' + res.after + ' / ' + HEAT_MAX, 'Spent 1 ' + payName + ' (now ' + getNum(cid, pay, 0) + ') to reduce Heat by 1 (Deep Cuts, Reduce Heat).');
    return true;
  }

  // ---------------------------------------------------------------- Downtime ledger and the Heat and Hold card
  // One record per crew: what was used this Downtime (once-per-Downtime abilities) and what happened. A Deep Cuts Score
  // starts one; so does Adjust > Downtime: start a new Downtime. End Downtime closes it.

  function startDowntime(cid, why) {
    var st = botState(), prev = st.downtime[cid];
    var rec = { id: Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36), at: Date.now(), used: {}, log: [], ended: false, startHeat: null, assessed: null };
    st.downtime[cid] = rec;
    dbg('downtime start ' + cid + ' ' + rec.id + ' (' + why + ')' + (prev && !prev.ended ? ', replacing an open one' : ''));
    return rec;
  }
  function openDowntime(cid) {
    var d = botState().downtime[cid];
    return (d && !d.ended) ? d : null;
  }
  // the open Downtime a Heat and Hold button belongs to, or null (after telling the player why)
  function ledgerFor(msg, t, o) {
    var d = botState().downtime[t.ch.id];
    if (!d || !o.idx || d.id !== o.idx) {
      whisper(msg, 'BitDCrew: that Downtime is no longer open. Open Heat and Hold again from Adjust, or start a new Downtime there.');
      return null;
    }
    if (d.ended) { note(msg, t.c, 'Downtime', 'Already ended', 'That Downtime was ended. Start a new one from Adjust.'); return null; }
    return d;
  }

  function heatHoldText(t, d) {
    var cid = t.ch.id, ab = abilitiesOn(cid), L = [], heat = getNum(cid, 'heat', 0), w = wantedInfo(cid);
    var turf = getNum(cid, 'turf', 0), tier = getNum(cid, 'crew_tier', 0), hold = String(getAttr(cid, 'hold', 'strong')).toLowerCase();
    var b = function (code, label) { return '[' + label + '](' + CMD + ' hhact ' + code + ' --c ' + cid + ' --idx ' + d.id + ')'; };
    L.push('Heat ' + bar(heat, HEAT_MAX) + ' ' + heat + '/' + HEAT_MAX + '. ' + w.label + ' ' + getNum(cid, w.attr, 0) + '/' + w.max + '.');
    if (heat > 0) {
      L.push('Reduce Heat by 1 for each Coin or Rep you spend (Deep Cuts, Heat and Hold): ' + b('rh-coin', 'Spend 1 Coin: Heat -1') + ' ' + b('rh-rep', 'Spend 1 Rep: Heat -1'));
    } else {
      L.push('Heat is 0, so there is nothing to reduce.');
    }
    if (ab['just passing through'] === true && !d.used.jpt && heat > 0) {
      L.push('Just Passing Through: during Downtime, take -1 Heat. ' + b('jpt', 'Just Passing Through: Heat -1'));
    }
    L.push('Hold is ' + hold + '. By the Deep Cuts rule (turf ' + turf + ', Tier ' + tier + ') it is ' + holdByRule(cid) + '. ' + b('hold', 'Assess hold'));
    if (d.log.length) { L.push('This Downtime so far:'); d.log.forEach(function (x) { L.push(x); }); }
    L.push(b('end', 'End Downtime'));
    return broadcast(t.c, { type: 'Heat and Hold', title: 'Downtime', content: L.join(NL) });
  }

  function doHeatHold(msg, o) {
    var t = target(msg, o); if (!t) { return; }
    var cid = t.ch.id;
    if (!mods(cid).downtime) { whisper(msg, 'BitDCrew: Heat and Hold is a Deep Cuts Downtime step, and the module is off for this crew.'); return; }
    var d = openDowntime(cid);
    if (!d) {
      d = startDowntime(cid, 'opened Heat and Hold');
      note(msg, t.c, 'Downtime', 'Downtime started', 'No Downtime was open, so one was started now.');
    }
    if (d.startHeat === null) { d.startHeat = getNum(cid, 'heat', 0); }
    whisper(msg, heatHoldText(t, d));
  }

  function doDowntimeStart(msg, t) {
    var cid = t.ch.id;
    if (!mods(cid).downtime) { whisper(msg, 'BitDCrew: Downtime steps need the Downtime module, and it is off for this crew.'); return; }
    var d = startDowntime(cid, 'adjust');
    d.startHeat = getNum(cid, 'heat', 0);
    note(msg, t.c, 'Downtime', 'Downtime started', 'A new Downtime is open. Anything used in an earlier one is available again.');
    whisper(msg, heatHoldText(t, d));
  }

  function doHhAct(msg, o) {
    var t = target(msg, o); if (!t) { return; }
    var cid = t.ch.id, code = String(o.pos[0] || ''), res;
    if (!mods(cid).downtime) { whisper(msg, 'BitDCrew: Heat and Hold is a Deep Cuts Downtime step, and the module is off for this crew.'); return; }
    var d = ledgerFor(msg, t, o); if (!d) { return; }
    dbg('hhact ' + code + ' ' + cid + ' ' + d.id);
    switch (code) {
      case 'rh-coin':
      case 'rh-rep':
        if (reduceHeat(msg, t, code === 'rh-coin' ? 'Coin' : 'Rep')) { d.log.push('Spent 1 ' + (code === 'rh-coin' ? 'Coin' : 'Rep') + ' for Heat -1.'); }
        break;
      case 'jpt':
        if (!crewAbilityOn(cid, 'Just Passing Through')) { whisper(msg, 'BitDCrew: Just Passing Through is not ticked on this sheet.'); return; }
        if (d.used.jpt) { note(msg, t.c, 'Downtime', 'Already used', 'Just Passing Through was already used this Downtime.'); return; }
        if (getNum(cid, 'heat', 0) < 1) { note(msg, t.c, 'Heat', 'Heat 0', 'There is no Heat to reduce, so Just Passing Through was not used.'); return; }
        d.used.jpt = true;
        res = addHeat(cid, -1);
        d.log.push('Just Passing Through: Heat -1 (Heat now ' + res.after + ').');
        break;
      case 'hold':
        d.assessed = assessHold(msg, t);
        break;
      case 'end': endDowntime(msg, t, d); return;
      default: whisper(msg, 'BitDCrew: unknown Heat and Hold choice.'); return;
    }
    whisper(msg, heatHoldText(t, d));
  }

  // End Downtime: No Traces' "When you end downtime with zero Heat, take +1 Rep" (Deep Cuts p88), then a public summary
  function endDowntime(msg, t, d) {
    var cid = t.ch.id, ab = abilitiesOn(cid), L = [], heat = getNum(cid, 'heat', 0), r;
    d.ended = true;
    L.push(d.startHeat !== null ? 'Heat went from ' + d.startHeat + ' (when Heat and Hold opened) to ' + heat + '.' : 'Heat is ' + heat + '.');
    d.log.forEach(function (x) { L.push(x); });
    if (ab['no traces'] === true) {
      if (heat === 0) {
        r = gainRep(cid, 1);
        L.push('No Traces: the crew ended Downtime with zero Heat, so +1 Rep' + (r.bonus ? ' (+1 more from Leverage)' : '') + '. Rep now ' + r.after + '/' + REP_MAX + (r.full ? ' (the track is full)' : '') + '.');
      } else {
        L.push('No Traces: Heat is ' + heat + ', so no Rep this time.');
      }
    }
    L.push('Hold is ' + String(getAttr(cid, 'hold', 'strong')).toLowerCase() + (d.assessed ? ' (assessed: ' + d.assessed + ')' : '') + '.');
    dbg('downtime end ' + cid + ' ' + d.id);
    sendChat('player|' + msg.playerid, broadcast(t.c, { type: 'Downtime', title: 'Downtime ended', content: L.join(NL) }));
  }

  // ---------------------------------------------------------------- score and payoff

  function intOk(v, list) { return !isNaN(v) && list.indexOf(v) >= 0; }

  function newFlow(cid, data) {
    var st = botState(), nonce = Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36);
    data.cid = cid; data.at = Date.now(); data.done = {};
    st.flows[nonce] = data;
    var keys = Object.keys(st.flows);
    if (keys.length > FLOW_MAX) {
      keys.sort(function (a, b) { return st.flows[a].at - st.flows[b].at; });
      while (keys.length > FLOW_MAX) { delete st.flows[keys.shift()]; }
    }
    return nonce;
  }

  // the flow a payoff button belongs to, or null (after telling the player why)
  function flowFor(msg, t, o, step) {
    var flow = o.idx ? botState().flows[o.idx] : null;
    if (!flow || flow.cid !== t.ch.id) { whisper(msg, 'BitDCrew: that score walk-through is no longer available. Start again from 4. Score.'); return null; }
    if (flow.done[step]) { note(msg, t.c, 'Score', 'Already done', 'That step was already applied. Use Adjust for corrections.'); return null; }
    flow.done[step] = true;
    return flow;
  }

  function doScore(msg, o) {
    var t = target(msg, o); if (!t) { return; }
    var cid = t.ch.id, m = mods(cid), a = o.pos.map(function (x) { return parseInt(x, 10); });
    if (m.downtime) {
      if (a.length !== 7) { whisper(msg, 'BitDCrew: this token action is out of date (the Downtime module changed). Run ~ Rebuild.'); return; }
      // the last answer may be "party": count the player characters Roll20 marks as Party members
      var fromParty = String(o.pos[6]).toLowerCase() === 'party';
      if (fromParty) {
        var pn = partyPcCount();
        if (pn < 1) {
          whisper(msg, 'BitDCrew: no player characters are marked as Party members, so there is nothing to count. Mark them in Roll20 (Edit character, Party member) or pick a number. Nothing was applied.');
          return;
        }
        a[6] = pn;
      }
      if (!intOk(a[0], [0, 2]) || !intOk(a[1], [0, 2]) || !intOk(a[2], [0, 2, 4]) || !intOk(a[3], [0, 4]) || !intOk(a[4], [0, 2, 4]) ||
          !intOk(a[5], [0, 1, 2, 3, 4, 5, 6]) || !(fromParty || intOk(a[6], [1, 2, 3, 4, 5, 6, 7, 8]))) {
        whisper(msg, 'BitDCrew: those score answers are not valid.'); return;
      }
      scoreDeepCuts(msg, t, a, fromParty);
    } else {
      if (a.length !== 5) { whisper(msg, 'BitDCrew: this token action is out of date (the Downtime module changed). Run ~ Rebuild.'); return; }
      if (!intOk(a[0], [0, 2, 4, 6]) || !intOk(a[1], [0, 1]) || !intOk(a[2], [0, 1]) || !intOk(a[3], [0, 1]) || !intOk(a[4], [0, 2])) {
        whisper(msg, 'BitDCrew: those score answers are not valid.'); return;
      }
      scoreCore(msg, t, a);
    }
  }

  // core, Heat: 0/2/4/6 by exposure, +1 high-profile target, +1 hostile turf, +1 at war, +2 killing
  function scoreCore(msg, t, a) {
    var cid = t.ch.id, total = a[0] + a[1] + a[2] + a[3] + a[4], parts = ['exposure ' + a[0]];
    if (a[1]) { parts.push('high-profile target +1'); }
    if (a[2]) { parts.push('hostile turf +1'); }
    if (a[3]) { parts.push('at war +1'); }
    if (a[4]) { parts.push('killing +2'); }
    var res = addHeat(cid, total);
    var L = ['Heat +' + total + ' (' + parts.join(', ') + ').', 'Heat now ' + bar(res.after, HEAT_MAX) + ' ' + res.after + '/' + HEAT_MAX + '.'];
    whisper(msg, broadcast(t.c, { type: 'Score', title: 'Heat', content: L.join(NL) }));
    if (res.wraps) { announceWanted(t.ch, t.c, res, null, null); }
  }

  // Deep Cuts p80-81: Fallout (Heat), Rep, then the Payoff in steps. Heat and Rep are applied now; Coin only by button.
  function scoreDeepCuts(msg, t, a, fromParty) {
    var cid = t.ch.id, tier = getNum(cid, 'crew_tier', 0);
    var base = a[0], target1 = a[1], chaos = a[2], death = a[3], wit = a[4], tTier = a[5], pcs = a[6];
    startDowntime(cid, 'score');
    var total = base + tier + target1 + chaos + death + wit, parts = ['base ' + base, 'crew Tier +' + tier];
    if (target1) { parts.push('target +' + target1); }
    if (chaos) { parts.push('chaos or war +' + chaos); }
    if (death) { parts.push('death +' + death); }
    if (wit) { parts.push('witnesses +' + wit); }
    var L = [];
    if (total > 0 && crewAbilityOn(cid, 'No Traces')) {
      total -= 1; parts.push('No Traces -1');
    }
    var res = addHeat(cid, total);
    L.push('Heat +' + total + ' (' + parts.join(', ') + ').');
    L.push('Heat now ' + bar(res.after, HEAT_MAX) + ' ' + res.after + '/' + HEAT_MAX + '.');
    var wl = wantedLines(cid, res);
    if (wl.length) { L = L.concat(wl); }
    if (res.after >= 6) { L.push('Heat is 6 or more: the GM brings an entanglement into play (Deep Cuts, Entanglements).'); }
    // Rep: 1 per 2 Heat generated by the score, +1 per Tier of the target above the crew's Tier
    var repGain = Math.floor(total / 2) + Math.max(0, tTier - tier), rg = gainRep(cid, repGain);
    L.push('Rep +' + repGain + ' (1 per 2 Heat' + (tTier > tier ? ', +' + (tTier - tier) + ' for the target\'s Tier' : '') + '). ' +
      (rg.bonus ? 'Leverage: +1 Rep. ' : '') + 'Rep now ' + rg.after + '/' + REP_MAX + (rg.full ? ' (the track is full)' : '') + '.');
    var payoff = pcs + 3 * tTier;
    L.push('Payoff: 1 Coin per PC (' + pcs + (fromParty ? ', the party' : '') + ') plus 3 x the target\'s Tier (' + tTier + ') = ' + payoff + ' Coin.');
    // Misdirection: "sacrifice half the rep gained" so another faction loses Status instead of the crew (round down)
    var give = Math.floor(rg.applied / 2);
    var nonce = newFlow(cid, { base: payoff, tier: tier, heatGain: total, repGain: repGain + rg.bonus, misdirect: give });
    if (crewAbilityOn(cid, 'Misdirection') && rg.applied >= 2) {
      L.push('Misdirection: you may give up half the Rep gained (' + give + ') so another faction loses Status with your target instead of your crew.');
      L.push('[Misdirection: give up ' + give + ' Rep](' + CMD + ' misdirect --c ' + cid + ' --idx ' + nonce + ')');
    }
    var pick = function (code, label) { return '[' + label + '](' + CMD + ' seized ' + code + ' --c ' + cid + ' --idx ' + nonce + ')'; };
    L.push('Seized assets? Pick one:');
    L.push([pick('none', 'No seized assets'), pick('cash', 'Seized load of cash +4 Coin'), pick('fence2', 'Fence valuables for 2 Coin'),
      pick('fence4', 'Fence valuables for 4 Coin, +1 Heat'), pick('fence6', 'Fence valuables for 6 Coin, +1 Heat'),
      pick('fence8', 'Fence valuables for 8 Coin, +2 Heat')].join(' '));
    whisper(msg, broadcast(t.c, { type: 'Score', title: 'Fallout', content: L.join(NL) }));
    if (res.wraps) { announceWanted(t.ch, t.c, res, null, msg.playerid); }
  }

  function doMisdirect(msg, o) {
    var t = target(msg, o); if (!t) { return; }
    var flow = flowFor(msg, t, o, 'misdirect'); if (!flow) { return; }
    var cid = t.ch.id, give = flow.misdirect || 0;
    if (give < 1) { flow.done.misdirect = false; whisper(msg, 'BitDCrew: there is no Rep to give up for that score.'); return; }
    var before = getNum(cid, 'rep', 0), after = Math.max(0, before - give);
    setAttr(cid, 'rep', after);
    whisper(msg, broadcast(t.c, {
      type: 'Misdirection', title: 'Gave up ' + (before - after) + ' Rep',
      content: 'Rep is now ' + after + '/' + REP_MAX + '. Name the faction that loses Status with your target instead of your crew, and say how you pin it on them. Status is not tracked here.'
    }));
  }

  function doSeized(msg, o) {
    var t = target(msg, o); if (!t) { return; }
    var code = String(o.pos[0] || ''), coins = { none: 0, cash: 4, fence2: 2, fence4: 4, fence6: 6, fence8: 8 };
    if (!coins.hasOwnProperty(code)) { whisper(msg, 'BitDCrew: unknown seized-assets choice.'); return; }
    var flow = flowFor(msg, t, o, 'seized'); if (!flow) { return; }
    var cid = t.ch.id, L = [], heat = code.indexOf('fence') === 0 ? Math.floor(coins[code] / 4) : 0;
    if (coins[code]) { L.push((code === 'cash' ? 'Seized load of cash' : 'Fenced valuables') + ': +' + coins[code] + ' Coin.'); }
    if (heat) {
      var res = addHeat(cid, heat);
      L.push('Fencing valuables brings +' + heat + ' Heat (1 per 4 Coin of value). Heat now ' + res.after + '/' + HEAT_MAX + '.');
      L = L.concat(wantedLines(cid, res));
      if (res.wraps) { announceWanted(t.ch, t.c, res, null, msg.playerid); }
    }
    flow.earned = flow.base + coins[code];
    L.push('Earned from the score: ' + flow.earned + ' Coin.');
    var nonce = o.idx;
    // Deep Cuts, Tithe: Tier 2 or lower pays the ward boss 1 Coin for every 4 Coin earned
    flow.tithe = flow.tier <= 2 ? Math.floor(flow.earned / 4) : 0;
    if (flow.tithe > 0) {
      L.push('Tithe: you are Tier ' + flow.tier + ', so pay your ward boss 1 Coin for every 4 Coin earned: ' + flow.tithe + ' Coin.');
      L.push('If you cannot or will not pay, ask the GM if the boss will let you go into debt, accept a favor instead, or if their patience has run out.');
      L.push('[Pay the tithe: ' + flow.tithe + ' Coin](' + CMD + ' tithe pay --c ' + cid + ' --idx ' + nonce + ') ' +
        '[Not paying the tithe](' + CMD + ' tithe skip --c ' + cid + ' --idx ' + nonce + ')');
      whisper(msg, broadcast(t.c, { type: 'Score', title: 'Payoff', content: L.join(NL) }));
    } else {
      flow.net = flow.earned;
      flow.done.tithe = true;
      L = L.concat(depositLines(cid, flow, nonce));
      whisper(msg, broadcast(t.c, { type: 'Score', title: 'Payoff', content: L.join(NL) }));
    }
  }

  function doTithe(msg, o) {
    var t = target(msg, o); if (!t) { return; }
    var code = String(o.pos[0] || '');
    if (code !== 'pay' && code !== 'skip') { whisper(msg, 'BitDCrew: unknown tithe choice.'); return; }
    var flow = flowFor(msg, t, o, 'tithe'); if (!flow) { return; }
    if (flow.earned === undefined) { flow.done.tithe = false; whisper(msg, 'BitDCrew: pick the seized assets step first.'); return; }
    var cid = t.ch.id, L = [];
    flow.net = flow.earned - (code === 'pay' ? flow.tithe : 0);
    flow.paid = code === 'pay' ? flow.tithe : 0;
    L.push(code === 'pay' ? 'Tithe paid: ' + flow.tithe + ' Coin. ' + flow.net + ' Coin left to deposit.' : 'Tithe not paid. Work out the debt, favor or lost patience with the GM. ' + flow.net + ' Coin to deposit.');
    L = L.concat(depositLines(cid, flow, o.idx));
    whisper(msg, broadcast(t.c, { type: 'Score', title: 'Deposit', content: L.join(NL) }));
  }

  // Deep Cuts, Vaults & Banks: the crew's vaults, the Scoundrels' stashes, or a bank
  function depositLines(cid, flow, nonce) {
    var tr = coinTrack(cid), cap1 = coinCapacity(cid), cur = getNum(cid, tr.attr, 0), room = Math.max(0, cap1 - cur), L = [];
    L.push('Where does the Coin go? The crew holds ' + cur + ' Coin and has room for ' + room + ' more (4 on hand plus its vaults).');
    var half = Math.floor(flow.net / 2);
    L.push('[All ' + flow.net + ' to the crew](' + CMD + ' deposit all --c ' + cid + ' --idx ' + nonce + ') ' +
      '[Half, ' + half + ', to the crew](' + CMD + ' deposit half --c ' + cid + ' --idx ' + nonce + ') ' +
      '[None to the crew](' + CMD + ' deposit none --c ' + cid + ' --idx ' + nonce + ')');
    L.push('Coin that does not go to the crew goes to PC stashes or a bank. Record it there by hand.');
    return L;
  }

  function doDeposit(msg, o) {
    var t = target(msg, o); if (!t) { return; }
    var code = String(o.pos[0] || '');
    if (code !== 'all' && code !== 'half' && code !== 'none') { whisper(msg, 'BitDCrew: unknown deposit choice.'); return; }
    var flow = flowFor(msg, t, o, 'deposit'); if (!flow) { return; }
    if (flow.net === undefined) { flow.done.deposit = false; whisper(msg, 'BitDCrew: finish the earlier steps first.'); return; }
    var cid = t.ch.id, tr = coinTrack(cid), cur = getNum(cid, tr.attr, 0), want = code === 'all' ? flow.net : (code === 'half' ? Math.floor(flow.net / 2) : 0);
    var room = Math.max(0, Math.min(coinCapacity(cid), tr.max) - cur), put = Math.min(want, room), next = cur + put;
    if (put > 0) { setAttr(cid, tr.attr, next); }
    var elsewhere = flow.net - put, L = [];
    L.push('Heat +' + flow.heatGain + ', Rep +' + flow.repGain + '.');
    L.push('Earned ' + flow.earned + ' Coin' + (flow.paid ? ', tithe ' + flow.paid + ' paid' : '') + ', ' + flow.net + ' to deposit.');
    L.push('To the crew: ' + put + ' Coin (crew now holds ' + next + ').');
    if (want > put) { L.push('The crew\'s vaults had room for only ' + put + ' of the ' + want + ' Coin you chose.'); }
    L.push('Elsewhere (PC stashes or a bank): ' + elsewhere + ' Coin.');
    if (getNum(cid, wantedInfo(cid).attr, 0) > 0) {
      L.push('The crew has wanted levels, so it cannot reach any bank funds until they are gone (Deep Cuts, Vaults and Banks).');
    }
    sendChat('player|' + msg.playerid, broadcast(t.c, { type: 'Score', title: 'Score recorded', content: L.join(NL) }));
    // the Score is done: the Heat and Hold step comes next
    var dd = openDowntime(cid);
    if (dd) {
      if (dd.startHeat === null) { dd.startHeat = getNum(cid, 'heat', 0); }
      whisper(msg, heatHoldText(t, dd));
    }
  }

  // ---------------------------------------------------------------- status

  function doStatus(msg, o) {
    var t = target(msg, o); if (!t) { return; }
    var cid = t.ch.id, m = mods(cid), L = [], dt = m.downtime;
    var heat = getNum(cid, 'heat', 0), w = wantedInfo(cid), wn = getNum(cid, w.attr, 0);
    L.push('Heat ' + bar(heat, HEAT_MAX) + ' ' + heat + '/' + HEAT_MAX);
    L.push(w.label + ' ' + bar(wn, w.max) + ' ' + wn + '/' + w.max + (slipperyOn(cid) ? ' (Slippery: effective ' + effectiveWanted(cid) + ')' : ''));
    if (dt && heat >= 6) { L.push('Heat is 6 or more: the GM brings an entanglement into play (Deep Cuts, Entanglements).'); }
    var turf = getNum(cid, 'turf', 0), ticked = turfClaimsTicked(cid);
    L.push('Rep ' + getNum(cid, 'rep', 0) + '/' + REP_MAX + ', Turf ' + turf + '/' + TURF_MAX + ', Tier ' + getNum(cid, 'crew_tier', 0) + '/' + TIER_MAX);
    if (ticked !== turf) { L.push('Note: ' + turf + ' turf boxes are marked but ' + ticked + ' Turf claims are ticked. They should match.'); }
    var hold = String(getAttr(cid, 'hold', 'strong')).toLowerCase();
    if (dt) {
      var rule = holdByRule(cid);
      L.push('Hold ' + hold + '. By the Deep Cuts rule (turf ' + turf + ', Tier ' + getNum(cid, 'crew_tier', 0) + ') it is ' + rule + '.' +
        (rule !== hold ? ' [Assess hold](' + CMD + ' adj holdassess --c ' + cid + ')' : ''));
    } else {
      L.push('Hold ' + hold + '.');
    }
    if (abilitiesOn(cid)['just passing through'] === true) {
      L.push('Just Passing Through: +1d to pass yourselves off as ordinary citizens while Heat is 4 or less (' + (heat <= 4 ? 'active now' : 'not active, Heat is ' + heat) + ').');
    }
    if (dt && openDowntime(cid)) { L.push('Downtime is open. [Heat and Hold](' + CMD + ' hh --c ' + cid + ')'); }
    var tr = coinTrack(cid);
    L.push('Coin ' + getNum(cid, tr.attr, 0) + ' (the crew can hold ' + coinCapacity(cid) + ')');
    if (m.advancement) {
      var size = getNum(cid, 'dc_xp_clocksize', 6), cl = [];
      for (var i = 1; i <= 4; i++) { cl.push(getNum(cid, 'dc_crew_xpclock_' + i, 0) + '/' + size); }
      L.push('Crew advancement clocks ' + cl.join('  '));
    } else {
      L.push('Crew XP ' + getNum(cid, 'crew_xp', 0) + '/' + CREW_XP_MAX);
    }
    if (dt) {
      var dmax = getNum(cid, 'crew_debt_dc_max', 4), dn = getNum(cid, 'crew_debt_dc', 0);
      L.push('Debt clock ' + bar(dn, dmax) + ' ' + dn + '/' + dmax);
    }
    crewClocks(cid).forEach(function (k) { L.push('Clock: ' + btn(k.name) + ' ' + k.progress + '/' + k.size); });
    cohortList(cid).forEach(function (c) {
      var imp = getNum(cid, c.prefix + '_impaired', 0);
      L.push('Cohort: ' + btn(c.name) + ' (' + cohortType(cid, c.prefix) + ', quality ' + cohortPool(cid, c.prefix) + (imp ? ', impaired' : '') + ')');
    });
    whisper(msg, broadcast(t.c, { type: '', title: 'Status', content: L.join(NL) }));
  }

  // GM tool: which characters does the script see as Roll20 Party members? Also shows the raw tags it can read.
  function doParty(msg, o) {
    if (!playerIsGM(msg.playerid)) { whisper(msg, 'BitDCrew: only the GM can run the party check.'); return; }
    var chars = findObjs({ _type: 'character' }), party = chars.filter(isPartyMember), L = [], seen = [], pcs = 0, crews = 0;
    party.forEach(function (c) {
      var st = getAttr(c.id, 'sheet_type', 'character');
      if (st === 'character') { pcs++; } else if (st === 'crew') { crews++; }
      L.push('Party member: ' + btn(c.get('name')) + ' (' + st + ')');
    });
    chars.forEach(function (c) {
      var t; try { t = c.get('tags'); } catch (e) { t = undefined; }
      var s = (t === undefined || t === null) ? '' : (typeof t === 'string' ? t : JSON.stringify(t));
      if (s && s !== '[]') { seen.push(btn(c.get('name')) + ': ' + btn(s).slice(0, 50)); }
    });
    L.unshift('Characters checked: ' + chars.length + '. Party members found: ' + party.length + ' (' + pcs + ' player character' + (pcs === 1 ? '' : 's') + ', ' + crews + ' crew sheet' + (crews === 1 ? '' : 's') + ').');
    if (!party.length) { L.push('None found. If you marked party members in Roll20 (Edit character, Party member), this script cannot see the flag.'); }
    L.push(seen.length ? 'Tags the script can read: ' + seen.slice(0, 8).join('; ') : 'No character has any tags the script can read.');
    log('BitDCrew party check: ' + party.length + ' party member(s) of ' + chars.length + ' characters; tags seen: ' + seen.length);
    whisper(msg, broadcast({ name: 'Party check', image: '' }, { type: 'Party', title: 'Party check', content: L.join(NL) }));
  }

  function doDebug(msg, o) {
    if (!playerIsGM(msg.playerid)) { whisper(msg, 'BitDCrew: only the GM can change debug logging.'); return; }
    var mode = String(o.pos[0] || '').toLowerCase(), st = botState();
    if (mode === 'on') { st.debug = true; }
    else if (mode === 'off') { st.debug = false; }
    else { whisper(msg, 'BitDCrew: debug logging is ' + (st.debug ? 'on' : 'off') + '. Use !bitdcrew debug on or off.'); return; }
    whisper(msg, 'BitDCrew: debug logging is now ' + (st.debug ? 'on' : 'off') + '. Messages go to the API console.');
  }

  // ---------------------------------------------------------------- router

  function route(msg, o) {
    switch (o.verb) {
      case 'setup': case 'rebuild': return doSetup(msg, o);
      case 'roll': return doRoll(msg, o);
      case 'abilities': return doAbilities(msg, o);
      case 'clocks': return doClocks(msg, o);
      case 'clock': return doClockTick(msg, o);
      case 'adj': return doAdjust(msg, o);
      case 'score': return doScore(msg, o);
      case 'seized': return doSeized(msg, o);
      case 'tithe': return doTithe(msg, o);
      case 'deposit': return doDeposit(msg, o);
      case 'misdirect': return doMisdirect(msg, o);
      case 'hh': return doHeatHold(msg, o);
      case 'hhact': return doHhAct(msg, o);
      case 'party': return doParty(msg, o);
      case 'debug': return doDebug(msg, o);
      case 'status': return doStatus(msg, o);
      default:
        whisper(msg, 'BitD Crew Token Action Maker v' + VERSION + ': select a crew token and run ' + MACRO_NAME +
          ' (or the ~ Rebuild token action) to build the token actions.');
    }
  }

  function ensureMacro() {
    var gms = findObjs({ _type: 'player' }).filter(function (p) { return playerIsGM(p.id); });
    if (!gms.length) { return; }
    var m = findObjs({ _type: 'macro', name: MACRO_NAME })[0];
    if (!m) {
      createObj('macro', { _playerid: gms[0].id, name: MACRO_NAME, action: CMD + ' setup', visibleto: 'all' });
    } else if (m.get('visibleto') !== 'all') {
      m.set('visibleto', 'all');
    }
  }

  function register() {
    on('chat:message', function (msg) {
      if (msg.type !== 'api') { if (msg.rolltemplate === 'blades') { checkWatchedRoll(msg); } return; }
      if (String(msg.content).split(/\s+/)[0] !== CMD) { return; }
      try {
        route(msg, parse(msg.content));
      } catch (e) {
        log('BitDCrew error: ' + (e && e.stack ? e.stack : e));
        try { whisper(msg, 'BitDCrew: something went wrong (' + clean(e && e.message ? e.message : e) + '). Check the API console.'); } catch (e2) { /* ignore */ }
      }
    });
    on('change:attribute:current', function (obj) {
      if (AUTO_HEAT && String(obj.get('name')) === 'heat') { autoHeat(obj); }
    });
    on('change:graphic:bar1_value', function (obj) {
      if (!AUTO_HEAT) { return; }
      var id = obj.id;
      setTimeout(function () { healHeatBar(id); }, 2000);
    });
    on('ready', function () {
      botState();
      ensureMacro();
      log('BitD Crew Token Action Maker v' + VERSION + ' ready');
    });
  }

  register();

  return { VERSION: VERSION, _route: route, _parse: parse, _entanglement: ENT_COLUMNS };
}());

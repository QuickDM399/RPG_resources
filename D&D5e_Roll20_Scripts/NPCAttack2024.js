// NPCAttack2024.js — Roll20 API script v6.0.0
//
// Extends NPC2024Setup with a targeted-attack workflow:
//   1. Select NPC token → click NPC-Attack in the token bar
//   2. Click an attack button → Roll20 prompts: click a target token on the map
//   3. Choose Normal / Advantage / Disadvantage
//   4. Script rolls d20, reads target AC from bar2, applies damage to bar1 HP on hit
//   5. Results posted publicly to chat (everyone sees hit/miss + damage + HP change)
//
// SETUP (run once — replaces NPC2024Setup.js macros):
//   !npc-setup-macros  — creates NPC-Abilities | NPC-Attack | NPC-Saves | NPC-Checks
//
// ALL existing !npc-* commands from NPC2024Setup.js are preserved here.
// Upload this script and remove NPC2024Setup.js — do not run both simultaneously.
//
// NEW COMMANDS:
//   !npc-tatk-menu         — shows targeted attack card (called by NPC-Attack macro)
//   !npc-tatk-debug-ac     — dumps AC info (bar2, store) for selected token (GM only)

var NPCAttack2024 = NPCAttack2024 || (function () {
  'use strict';

  var VERSION = '6.1.0';

  var lastAutoMenuId = null;

  var ABILITIES = ['Strength','Dexterity','Constitution','Intelligence','Wisdom','Charisma'];
  var SHORT = { Strength:'STR', Dexterity:'DEX', Constitution:'CON', Intelligence:'INT', Wisdom:'WIS', Charisma:'CHA' };
  var SKILL_AB = {
    Athletics:'Strength',
    Acrobatics:'Dexterity', 'Sleight of Hand':'Dexterity', Stealth:'Dexterity',
    Arcana:'Intelligence', History:'Intelligence', Investigation:'Intelligence',
    Nature:'Intelligence', Religion:'Intelligence',
    'Animal Handling':'Wisdom', Insight:'Wisdom', Medicine:'Wisdom',
    Perception:'Wisdom', Survival:'Wisdom',
    Deception:'Charisma', Intimidation:'Charisma', Performance:'Charisma', Persuasion:'Charisma'
  };

  // ── Utilities ──────────────────────────────────────────────────────────────

  function mod(score) { return Math.floor((score - 10) / 2); }
  function fmt(n)     { return (n >= 0 ? '+' : '') + n; }
  function tryArr(s)  { try { return JSON.parse(s || '[]'); } catch(_) { return []; } }
  function cr2pb(cr) {
    var m = { '1/8':0.125, '1/4':0.25, '1/2':0.5 };
    var n = m[String(cr)] !== undefined ? m[String(cr)] : (parseFloat(String(cr)) || 0);
    if (n < 5) return 2; if (n < 9) return 3; if (n < 13) return 4; if (n < 17) return 5; return 6;
  }
  function safe(s) {
    return String(s || '').replace(/}}/g,'} }').replace(/{{/g,'{ {').replace(/\|/g,'&#124;').trim();
  }
  function safeLabel(s) {
    return String(s || '').replace(/}}/g,'').replace(/{{/g,'').replace(/\[/g,'').replace(/\]/g,'').trim();
  }
  function tokenize(s) {
    return (s.match(/"[^"]*"|[^\s]+/g) || []).map(function(t){ return t.replace(/^"|"$/g,''); });
  }
  function cName(cid) { var c = getObj('character',cid); return c ? c.get('name') : 'NPC'; }
  function hasNPCAoE(desc) {
    return /Saving Throw/i.test(desc || '') && /(Cone|Sphere|Cube|Line)/i.test(desc || '');
  }

  // ── Store helpers ──────────────────────────────────────────────────────────

  function getStore(cid) {
    var a = findObjs({ _type:'attribute', _characterid:cid, name:'store' })[0];
    if (!a) return null;
    var v = a.get('current');
    if (!v) return null;
    if (typeof v === 'object') return v;
    try { return JSON.parse(v); } catch(_) { log('[NPCAttack2024] bad store: '+cid); return null; }
  }

  function is2024NPC(cid) {
    var a = findObjs({ _type:'attribute', _characterid:cid, name:'appState' })[0];
    return !!(a && a.get('current') === 'npc');
  }

  // ── Parse store ────────────────────────────────────────────────────────────

  function parseStore(st) {
    var ig = (st.integrants && st.integrants.integrants) || {};
    var cr = (st.npc && st.npc.challengeRating) || '0';
    var pb = cr2pb(cr);
    var d = {
      pb:pb, cr:cr,
      sc:{ Strength:10, Dexterity:10, Constitution:10, Intelligence:10, Wisdom:10, Charisma:10 },
      profSaves:[], profSkills:[],
      attacks:[], dmg:{},
      actions:[], reactions:[], bonus:[], legendary:[], features:[],
      desc:{}
    };
    Object.keys(ig).forEach(function(uuid) {
      var e = ig[uuid]; if (!e || !e.type) return;
      var sid = e.shortID || uuid;
      switch (e.type) {
        case 'Ability Score':
          if (e.ability && d.sc.hasOwnProperty(e.ability)) {
            var fv = e.valueFormula && e.valueFormula.flatValue;
            d.sc[e.ability] = (fv != null) ? fv : 10;
          }
          break;
        case 'Proficiency':
          if (e.category === 'Saving Throw' && e.proficiency) d.profSaves.push(e.proficiency);
          else if (e.category === 'Skill' && e.proficiency)
            d.profSkills.push({ name:e.proficiency, level:e.proficiencyLevel||'Proficient', ability:SKILL_AB[e.proficiency]||'Strength' });
          break;
        case 'Attack':
          if (e.shortID) {
            var pl = (e.attack && e.attack.proficiencyLevel) || 'Proficient';
            d.attacks.push({ sid:e.shortID, name:e.name||'Attack', atkType:(e.attack&&e.attack.type)||'Melee', prof:pl!=='Not Proficient', kids:tryArr(e.childIDs) });
          }
          break;
        case 'Damage':
          d.dmg[uuid] = { n:e.diceCount||1, sz:e.diceSize||'d6', b:e._bonus||0, t:e.damageType||'' };
          break;
        case 'Action': {
          var desc = safe(e.description||'');
          var atype = e.actionType||'Action';
          var entry = { sid:sid, name:e.name||'Action', description:desc };
          d.desc[sid] = { name:e.name||'Action', description:desc, type:atype };
          if      (atype==='Reaction')    d.reactions.push(entry);
          else if (atype==='BonusAction') d.bonus.push(entry);
          else if (atype==='Legendary')   d.legendary.push(entry);
          else                            d.actions.push(entry);
          break;
        }
        case 'Features': {
          var fdesc = safe(e.description||'');
          d.features.push({ sid:sid, name:e.name||'Feature', description:fdesc });
          d.desc[sid] = { name:e.name||'Feature', description:fdesc, type:'Trait' };
          break;
        }
      }
    });
    return d;
  }

  // ── Original menu builders (unchanged from NPC2024Setup.js) ───────────────

  function menuAbilities(cid) {
    var st = getStore(cid);
    if (!st) { sendChat('NPCAttack2024', '/w gm Cannot read store for character ' + cid); return; }
    var d = parseStore(st);
    var nm = cName(cid);
    var PREFIX = '/w gm &{template:default} ';
    var LIMIT  = 2300;
    var parts  = ['{{name=' + safe(nm) + ' (CR ' + d.cr + '  PB+' + d.pb + ')}}'];

    if (d.attacks.length) {
      var atkBtns = d.attacks.map(function(a) {
        var abilName = a.atkType === 'Ranged' ? 'Dexterity' : 'Strength';
        var toHit    = mod(d.sc[abilName]||10) + (a.prof ? d.pb : 0);
        return '[' + safeLabel(a.name) + ' ' + fmt(toHit) + '](!npc-atk ' + cid + ' ' + a.sid + ' ?{Copies&#124;1})';
      }).join(' ');
      parts.push('{{Attacks=' + atkBtns + '}}');
    }

    function tryAdd(label, items) {
      if (!items.length) return;
      var btns = items.map(function(a) {
        if (hasNPCAoE(a.description)) {
          return '[' + safeLabel(a.name) + '](!aoe-npc-cast ' + cid + ' ' + a.sid + ')';
        }
        return '[' + safeLabel(a.name) + '](!npc-desc ' + cid + ' ' + a.sid + ')';
      }).join(' ');
      if ((PREFIX + parts.join(' ') + ' {{' + label + '=' + btns + '}}').length <= LIMIT)
        parts.push('{{' + label + '=' + btns + '}}');
    }
    tryAdd('Actions',   d.actions);
    tryAdd('Bonus',     d.bonus);
    tryAdd('Reactions', d.reactions);
    tryAdd('Legendary', d.legendary);
    tryAdd('Traits',    d.features);

    sendChat('NPCAttack2024', PREFIX + parts.join(' '));
  }

  function menuSaves(cid) {
    var st = getStore(cid);
    if (!st) { sendChat('NPCAttack2024', '/w gm Cannot read store for character ' + cid); return; }
    var d = parseStore(st);
    var nm = cName(cid);
    var btns = ABILITIES.map(function(ab) {
      var prof = d.profSaves.indexOf(ab) !== -1;
      var b    = mod(d.sc[ab]||10) + (prof ? d.pb : 0);
      var lbl  = SHORT[ab] + ' ' + fmt(b) + (prof ? '*' : '');
      return '[' + lbl + '](!npc-save ' + cid + ' ' + ab + ' ?{Copies&#124;1})';
    }).join(' ');
    sendChat('NPCAttack2024', '/w gm &{template:default} {{name=' + safe(nm) + ' Saves}} {{* = proficient  PB +' + d.pb + '}} {{Saves=' + btns + '}}');
  }

  function menuChecks(cid) {
    var st = getStore(cid);
    if (!st) { sendChat('NPCAttack2024', '/w gm Cannot read store for character ' + cid); return; }
    var d = parseStore(st);
    var nm = cName(cid);
    var abBtns = ABILITIES.map(function(ab) {
      var b = mod(d.sc[ab]||10);
      return '[' + SHORT[ab] + ' ' + fmt(b) + '](!npc-check ' + cid + ' ' + ab + ' ?{Copies&#124;1})';
    }).join(' ');
    var parts = ['{{name=' + safe(nm) + ' Checks}}', '{{Ability=' + abBtns + '}}'];
    if (d.profSkills.length) {
      var skBtns = d.profSkills.map(function(s) {
        var mult  = s.level === 'Expertise' ? 2 : 1;
        var b     = mod(d.sc[s.ability]||10) + mult * d.pb;
        var stars = s.level === 'Expertise' ? '**' : '*';
        var arg   = s.name.indexOf(' ') !== -1 ? '"' + s.name + '"' : s.name;
        return '[' + safeLabel(s.name) + ' ' + fmt(b) + stars + '](!npc-check ' + cid + ' ' + arg + ' ?{Copies&#124;1})';
      }).join(' ');
      parts.push('{{Skills * prof  ** expertise=' + skBtns + '}}');
    }
    sendChat('NPCAttack2024', '/w gm &{template:default} ' + parts.join(' '));
  }

  // ── NEW: Targeted attack menu ──────────────────────────────────────────────
  // Same card layout as menuAbilities, but attack buttons trigger the targeted
  // workflow: @{target} prompts GM to click a token, then adv/dis/normal query.

  function menuTargetedAbilities(cid) {
    var st = getStore(cid);
    if (!st) { sendChat('NPCAttack2024', '/w gm Cannot read store for character ' + cid); return; }
    var d = parseStore(st);
    var nm = cName(cid);
    var PREFIX = '/w gm &{template:default} ';
    var LIMIT  = 2300;
    var parts  = ['{{name=' + safe(nm) + ' (CR ' + d.cr + '  PB+' + d.pb + ') — Targeted Attack}}'];

    if (d.attacks.length) {
      var atkBtns = '';
      for (var ai = 0; ai < d.attacks.length; ai++) {
        var a = d.attacks[ai];
        var abilName = a.atkType === 'Ranged' ? 'Dexterity' : 'Strength';
        var toHit = mod(d.sc[abilName]||10) + (a.prof ? d.pb : 0);
        // @{target|token_id} prompts GM to click a token; ?{Roll|...} shows adv/dis dropdown.
        // Both are resolved by Roll20 client before the command reaches the API.
        var btn = '[' + safeLabel(a.name) + ' ' + fmt(toHit) + ']' +
          '(!npc-tatk ' + cid + ' ' + a.sid +
          ' ?{Roll&#124;Normal,normal&#124;Advantage,adv&#124;Disadvantage,dis})';
        atkBtns += (atkBtns ? ' ' : '') + btn;
      }
      parts.push('{{Attacks=' + atkBtns + '}}');
    }

    // Non-attack items use the same buttons as the original card
    function tryAdd(label, items) {
      if (!items.length) return;
      var btns = '';
      for (var ii = 0; ii < items.length; ii++) {
        var item = items[ii];
        var b = hasNPCAoE(item.description)
          ? '[' + safeLabel(item.name) + '](!aoe-npc-cast ' + cid + ' ' + item.sid + ')'
          : '[' + safeLabel(item.name) + '](!npc-desc ' + cid + ' ' + item.sid + ')';
        btns += (btns ? ' ' : '') + b;
      }
      var candidate = PREFIX + parts.join(' ') + ' {{' + label + '=' + btns + '}}';
      if (candidate.length <= LIMIT) parts.push('{{' + label + '=' + btns + '}}');
    }
    tryAdd('Actions',   d.actions);
    tryAdd('Bonus',     d.bonus);
    tryAdd('Reactions', d.reactions);
    tryAdd('Legendary', d.legendary);
    tryAdd('Traits',    d.features);

    sendChat('NPCAttack2024', PREFIX + parts.join(' '));
  }

  // ── NEW: Step 1 — whisper "select target" card ────────────────────────────
  // Called by !npc-tatk after the GM chooses adv/dis/normal.
  // Embeds the Fire button so the GM just selects a token on the map and clicks it.

  function doTatkSelect(npcCid, sid, rollType) {
    var st = getStore(npcCid);
    if (!st) { sendChat('NPCAttack2024', '/w gm Cannot read NPC store.'); return; }
    var d = parseStore(st);
    var atk = null;
    for (var ai = 0; ai < d.attacks.length; ai++) {
      if (d.attacks[ai].sid === sid) { atk = d.attacks[ai]; break; }
    }
    if (!atk) { sendChat('NPCAttack2024', '/w gm Attack not found: ' + sid); return; }
    var abilName = atk.atkType === 'Ranged' ? 'Dexterity' : 'Strength';
    var toHit = mod(d.sc[abilName]||10) + (atk.prof ? d.pb : 0);
    var rollLabel = rollType === 'adv' ? 'Advantage' : rollType === 'dis' ? 'Disadvantage' : 'Normal';
    var fireBtn = '[Fire — ' + safeLabel(atk.name) + ' ' + fmt(toHit) + ' (' + rollLabel + ')]' +
      '(!npc-tatk-fire ' + npcCid + ' ' + sid + ' ' + rollType + ')';
    sendChat('NPCAttack2024', '/w gm &{template:default} ' +
      '{{name=' + safe(cName(npcCid)) + ': ' + safe(atk.name) + '}}' +
      '{{Roll Type=' + rollLabel + '}}' +
      '{{Step 2=Select the target token on the map, then click:}}' +
      '{{=' + fireBtn + '}}');
  }

  // ── NEW: Step 2 — execute targeted attack ─────────────────────────────────
  // Called by !npc-tatk-fire after the GM selects a target token and clicks Fire.
  // Target is read from msg.selected (whatever the GM has selected on the map).
  // Rolls d20 (or 2d20 for adv/dis), compares to target bar2 (AC),
  // rolls damage on hit (crits double dice count, not the bonus),
  // decrements target bar1 (HP), posts public result card.

  function doTargetedAttack(npcCid, sid, targetTokId, rollType) {
    var st = getStore(npcCid);
    if (!st) { sendChat('NPCAttack2024', '/w gm Cannot read NPC store for ' + npcCid + '.'); return; }
    var d = parseStore(st);

    var atk = null;
    for (var ai = 0; ai < d.attacks.length; ai++) {
      if (d.attacks[ai].sid === sid) { atk = d.attacks[ai]; break; }
    }
    if (!atk) { sendChat('NPCAttack2024', '/w gm Attack not found: ' + sid); return; }

    var targetTok = getObj('graphic', targetTokId);
    if (!targetTok) { sendChat('NPCAttack2024', '/w gm Target token not found (id: ' + targetTokId + ').'); return; }

    var targetName = targetTok.get('name') || 'Target';
    var acRaw = targetTok.get('bar2_value');
    var ac = parseInt(acRaw);
    if (isNaN(ac)) {
      sendChat('NPCAttack2024', '/w gm Warning: ' + safe(targetName) + ' has no AC on bar2 — defaulting to 10. Run !npc-tatk-debug-ac to inspect.');
      ac = 10;
    }
    var curHp = parseInt(targetTok.get('bar1_value')) || 0;

    // Attack bonus (same formula as doAttack)
    var abilName = atk.atkType === 'Ranged' ? 'Dexterity' : 'Strength';
    var toHit = mod(d.sc[abilName]||10) + (atk.prof ? d.pb : 0);

    // Roll d20(s)
    var da = randomInteger(20);
    var db = (rollType === 'adv' || rollType === 'dis') ? randomInteger(20) : 0;
    var d20roll, rollDesc, rollAdv;
    if (rollType === 'adv') {
      d20roll = Math.max(da, db);
      rollAdv = 'Adv';
      rollDesc = '(' + Math.min(da, db) + ', ' + d20roll + ')';
    } else if (rollType === 'dis') {
      d20roll = Math.min(da, db);
      rollAdv = 'Dis';
      rollDesc = '(' + d20roll + ', ' + Math.max(da, db) + ')';
    } else {
      d20roll = da;
      rollAdv = '';
      rollDesc = '' + d20roll;
    }

    var isCrit   = d20roll === 20;
    var isFumble = d20roll === 1;
    var total    = d20roll + toHit;
    // Nat 20 = auto-hit crit; nat 1 = auto-miss; otherwise compare to AC
    var hit = isCrit || (!isFumble && total >= ac);

    // Collect damage components linked to this attack
    var dmgComponents = [];
    for (var ki = 0; ki < atk.kids.length; ki++) {
      var dg = d.dmg[atk.kids[ki]];
      if (dg) dmgComponents.push(dg);
    }

    // Roll damage (only on hit)
    var dmgTotal = 0, newHp = curHp;
    var dmgDisplay = '';   // e.g. "2d8 [3,6+4=13] Slashing + 1d6 [5=5] Poison"
    var dmgTotalDisplay = '';

    if (hit && dmgComponents.length) {
      var dmgParts = [];
      for (var di = 0; di < dmgComponents.length; di++) {
        var dg2 = dmgComponents[di];
        // Crit: double dice count, keep bonus unchanged
        var diceCount = isCrit ? dg2.n * 2 : dg2.n;
        var diceSize  = parseInt(('' + dg2.sz).replace('d', '')) || 6;
        var rolls = [];
        for (var ri = 0; ri < diceCount; ri++) {
          rolls.push(randomInteger(diceSize));
        }
        var diceSum = 0;
        for (var rj = 0; rj < rolls.length; rj++) diceSum += rolls[rj];
        var partTotal = diceSum + dg2.b;
        dmgTotal += partTotal;

        var expr = diceCount + dg2.sz + (dg2.b !== 0 ? fmt(dg2.b) : '');
        var rollStr = rolls.join(',') + (dg2.b !== 0 ? fmt(dg2.b) : '') + '=' + partTotal;
        dmgParts.push(expr + ' [' + rollStr + ']' + (dg2.t ? ' ' + safe(dg2.t) : ''));
      }
      newHp = Math.max(0, curHp - dmgTotal);
      targetTok.set('bar1_value', newHp);

      if (dmgParts.length === 1) {
        dmgDisplay = dmgParts[0];
      } else {
        dmgDisplay = dmgParts.join(' + ');
        dmgTotalDisplay = '' + dmgTotal + ' total';
      }
    }

    // Build public result card (no /w prefix = everyone sees it)
    var attackLine = rollDesc + fmt(toHit) + ' = ' + total + (rollAdv ? ' [' + rollAdv + ']' : '');
    var parts = [
      '{{name=' + safe(cName(npcCid)) + ': ' + safe(atk.name) + '}}',
      '{{Target=' + safe(targetName) + ' (AC ' + ac + ')}}',
      '{{Attack Roll=' + attackLine + '}}'
    ];

    if (isFumble) {
      parts.push('{{Result=Miss (Natural 1)}}');
    } else if (isCrit) {
      parts.push('{{Result=CRITICAL HIT}}');
      if (dmgDisplay) {
        parts.push('{{Damage=' + dmgDisplay + '}}');
        if (dmgTotalDisplay) parts.push('{{Total=' + dmgTotalDisplay + '}}');
        parts.push('{{HP=' + safe(targetName) + ': ' + curHp + ' -> ' + newHp + '}}');
      }
    } else if (hit) {
      parts.push('{{Result=HIT (' + total + ' vs AC ' + ac + ')}}');
      if (dmgDisplay) {
        parts.push('{{Damage=' + dmgDisplay + '}}');
        if (dmgTotalDisplay) parts.push('{{Total=' + dmgTotalDisplay + '}}');
        parts.push('{{HP=' + safe(targetName) + ': ' + curHp + ' -> ' + newHp + '}}');
      }
    } else {
      parts.push('{{Result=Miss (' + total + ' vs AC ' + ac + ')}}');
    }

    sendChat('character|' + npcCid, '&{template:default} ' + parts.join(' '));
  }

  // ── Original roll handlers (unchanged from NPC2024Setup.js) ───────────────

  function doSave(cid, ability, n) {
    var st = getStore(cid); if (!st) return;
    var d = parseStore(st);
    var ab   = ABILITIES.filter(function(a){ return a.toLowerCase() === ability.toLowerCase(); })[0] || ability;
    var prof = d.profSaves.indexOf(ab) !== -1;
    var b    = mod(d.sc[ab]||10) + (prof ? d.pb : 0);
    var lbl  = (SHORT[ab]||ab) + ' Save' + (prof ? '*' : '');
    var parts = ['{{name=' + safe(cName(cid)) + ': ' + lbl + '}}'];
    for (var i = 1; i <= n; i++)
      parts.push('{{' + (n > 1 ? 'Roll ' + i : 'Roll') + '=[[1d20' + fmt(b) + ']]}}');
    sendChat('NPCAttack2024', '/w gm &{template:default} ' + parts.join(' '));
  }

  function doCheck(cid, skillOrAb, n) {
    var st = getStore(cid); if (!st) return;
    var d = parseStore(st);
    var isAb = ABILITIES.some(function(a){ return a.toLowerCase() === skillOrAb.toLowerCase(); });
    var b, lbl;
    if (isAb) {
      var ab = ABILITIES.filter(function(a){ return a.toLowerCase() === skillOrAb.toLowerCase(); })[0];
      b = mod(d.sc[ab]||10);
      lbl = (SHORT[ab]||ab) + ' Check';
    } else {
      var sa  = SKILL_AB[skillOrAb] || 'Strength';
      var sk  = d.profSkills.filter(function(s){ return s.name.toLowerCase() === skillOrAb.toLowerCase(); })[0];
      var mul = sk ? (sk.level === 'Expertise' ? 2 : 1) : 0;
      b   = mod(d.sc[sa]||10) + mul * d.pb;
      lbl = skillOrAb + (sk ? (mul === 2 ? '**' : '*') : '');
    }
    var parts = ['{{name=' + safe(cName(cid)) + ': ' + lbl + '}}'];
    for (var i = 1; i <= n; i++)
      parts.push('{{' + (n > 1 ? 'Roll ' + i : 'Roll') + '=[[1d20' + fmt(b) + ']]}}');
    sendChat('NPCAttack2024', '/w gm &{template:default} ' + parts.join(' '));
  }

  function doAttack(cid, sid, n) {
    var st = getStore(cid); if (!st) return;
    var d  = parseStore(st);
    var atk = d.attacks.filter(function(a){ return a.sid === sid; })[0];
    if (!atk) { sendChat('NPCAttack2024', '/w gm Attack not found: ' + sid); return; }
    var abilName = atk.atkType === 'Ranged' ? 'Dexterity' : 'Strength';
    var toHit    = mod(d.sc[abilName]||10) + (atk.prof ? d.pb : 0);
    var dmgParts = atk.kids.map(function(uuid){ return d.dmg[uuid]; }).filter(Boolean).map(function(dg){
      return { expr: dg.n + dg.sz + (dg.b !== 0 ? fmt(dg.b) : ''), type: dg.t };
    });
    var parts = ['{{name=' + safe(cName(cid)) + ': ' + safe(atk.name) + '}}'];
    for (var i = 1; i <= n; i++) {
      var sfx = n > 1 ? ' ' + i : '';
      parts.push('{{Hit' + sfx + '=[[1d20' + fmt(toHit) + ']]}}');
      if (dmgParts.length)
        parts.push('{{Dmg' + sfx + '=' + dmgParts.map(function(p){ return '[[' + p.expr + ']] ' + safe(p.type); }).join(' + ') + '}}');
    }
    sendChat('NPCAttack2024', '/w gm &{template:default} ' + parts.join(' '));
  }

  function doDesc(cid, sid) {
    var st = getStore(cid); if (!st) return;
    var d  = parseStore(st);
    var info = d.desc[sid];
    if (!info) { sendChat('NPCAttack2024', '/w gm Description not found: ' + sid); return; }
    sendChat('NPCAttack2024', '/w gm &{template:default} {{name=' + safe(info.name) + '}} {{Creature=' + safe(cName(cid)) + '}} {{Type=' + info.type + '}} {{Description=' + info.description + '}}');
  }

  // ── NEW: AC debug ──────────────────────────────────────────────────────────
  // Run !npc-tatk-debug-ac with a token selected. Dumps bar2, store.npc.armorClass,
  // and any integrants that look AC-related so you can confirm the correct AC source.

  function debugAC(cid, tokId) {
    var lines = ['**AC Debug v' + VERSION + '**'];
    var tok = tokId ? getObj('graphic', tokId) : null;

    if (tok) {
      lines.push('Token: ' + (tok.get('name') || '(unnamed)'));
      lines.push('bar1_value (HP): ' + String(tok.get('bar1_value')));
      lines.push('bar2_value (AC): ' + String(tok.get('bar2_value')));
      lines.push('bar2_max: '        + String(tok.get('bar2_max')));
      lines.push('bar2_link (attr id): ' + String(tok.get('bar2_link')));
    } else {
      lines.push('No token found — select a token first.');
    }

    if (cid) {
      var c = getObj('character', cid);
      lines.push('Character: ' + (c ? '"' + c.get('name') + '"' : 'NOT FOUND') + '  id=' + cid);
      var appA = findObjs({ _type:'attribute', _characterid:cid, name:'appState' })[0];
      lines.push('appState: ' + (appA ? appA.get('current') : 'not found'));

      var st = getStore(cid);
      if (st) {
        // NPC top-level AC fields
        if (st.npc) {
          lines.push('store.npc.armorClass: ' + String(st.npc.armorClass));
          lines.push('store.npc.armorType: '  + String(st.npc.armorType));
        }

        // Scan integrants for AC-related entries
        var ints = (st.integrants && st.integrants.integrants) || {};
        var ks = Object.keys(ints);
        var acRelated = [];
        for (var i = 0; i < ks.length; i++) {
          var e = ints[ks[i]];
          var et = ('' + (e.type || '')).toLowerCase();
          var en = ('' + (e.name || '')).toLowerCase();
          if (et.indexOf('armor') !== -1 || et === 'ac' || et === 'defense' ||
              en.indexOf('armor') !== -1 || en === 'ac' || en.indexOf(' ac') !== -1 ||
              en.indexOf('shield') !== -1 || en.indexOf('unarmored') !== -1) {
            var vf = e.valueFormula ? JSON.stringify(e.valueFormula) : String(e.value !== undefined ? e.value : '');
            acRelated.push('  [' + e.type + '] ' + (e.name || '') +
              ' | val=' + vf.substring(0, 80) +
              (e._enabled === false ? ' (DISABLED)' : ''));
          }
        }
        if (acRelated.length) {
          lines.push('AC-related integrants (' + acRelated.length + '):');
          for (var j = 0; j < acRelated.length; j++) lines.push(acRelated[j]);
        } else {
          lines.push('No AC-related integrants found.');
        }

        // Check for a plain "ac" character attribute (legacy or sheet-linked)
        var acAttrs = findObjs({ _type:'attribute', _characterid:cid });
        var acFound = [];
        for (var k = 0; k < acAttrs.length; k++) {
          var an = (acAttrs[k].get('name') || '').toLowerCase();
          if (an === 'ac' || an === 'armor_class' || an === 'armorclass') {
            acFound.push('  attr "' + acAttrs[k].get('name') + '" = ' + acAttrs[k].get('current'));
          }
        }
        if (acFound.length) {
          lines.push('AC character attributes:');
          for (var l = 0; l < acFound.length; l++) lines.push(acFound[l]);
        }
      } else {
        lines.push('Store: not found.');
      }
    }

    sendChat('NPCAttack2024', '/w gm ' + lines.join('\n'));
  }

  // ── Auto NPC-Attack card on turn change ─────────────────────────────────────
  // When the initiative tracker advances to an NPC's turn, auto-whisper the
  // targeted attack card to the GM. Delays 500ms so TurnMarker1's round/turn
  // announcements appear first.

  function handleAutoTurnMenu(obj, prev) {
    if (!state.NPCAttack2024 || !state.NPCAttack2024.autoMenu) return;
    if (!Campaign().get('initiativepage')) return;

    var prevOrder, curOrder;
    try {
      prevOrder = JSON.parse(prev.turnorder || '[]');
      curOrder  = JSON.parse(obj.get('turnorder') || '[]');
    } catch(_) { return; }

    if (!curOrder.length) return;

    var curFirstId = curOrder[0].id;
    // Only proceed if the first turn actually changed
    if (prevOrder.length && prevOrder[0].id === curFirstId) return;
    // Dedup: don't fire twice for the same token (TurnMarker1 may modify
    // the turn order multiple times during a single turn transition)
    if (curFirstId === lastAutoMenuId) return;

    lastAutoMenuId = curFirstId;

    var tok = getObj('graphic', curFirstId);
    if (!tok) return;

    var cid = tok.get('represents');
    if (!cid) return;
    if (!is2024NPC(cid)) return;

    // Delay so TurnMarker1 announcements appear first, then verify this
    // token is still current (turn may have advanced past it during the delay)
    setTimeout(function() {
      var currentOrder;
      try { currentOrder = JSON.parse(Campaign().get('turnorder') || '[]'); }
      catch(_) { return; }
      if (currentOrder.length && currentOrder[0].id === curFirstId) {
        menuTargetedAbilities(cid);
      }
    }, 500);
  }

  // ── Global macro setup ────────────────────────────────────────────────────────

  function setupMacros(gmId) {
    var defs = [
      { name:'NPC-Abilities', action:'!npc-menu' },
      { name:'NPC-Attack',    action:'!npc-tatk-menu' },
      { name:'NPC-Saves',     action:'!npc-saves' },
      { name:'NPC-Checks',    action:'!npc-checks' }
    ];
    for (var i = 0; i < defs.length; i++) {
      var existing = findObjs({ _type:'macro', name:defs[i].name });
      for (var j = 0; j < existing.length; j++) existing[j].remove();
      createObj('macro', { playerid:gmId, name:defs[i].name, action:defs[i].action, istokenaction:true });
    }
    sendChat('NPCAttack2024', '/w gm **Macros created:** NPC-Abilities | NPC-Attack | NPC-Saves | NPC-Checks. ' +
      'If they don\'t appear in the token bar, open Collections → each macro → enable "Show in Token Bar".');
    log('[NPCAttack2024] macros created by ' + gmId);
  }

  // ── Events ─────────────────────────────────────────────────────────────────

  on('ready', function() {
    log('[NPCAttack2024] v' + VERSION + ' ready.');

    // Persistent config (survives sandbox restarts)
    if (!state.NPCAttack2024) {
      state.NPCAttack2024 = { autoMenu: true };
    }

    // Auto-show NPC-Attack card when initiative advances to an NPC
    on('change:campaign:turnorder', function(obj, prev) {
      handleAutoTurnMenu(obj, prev);
    });

    on('chat:message', function(msg) {
      if (msg.type !== 'api') return;
      if (!msg.content || msg.content.indexOf('!npc-') !== 0) return;
      if (!getObj('player', msg.playerid)) return;
      if (!playerIsGM(msg.playerid)) { sendChat('NPCAttack2024', '/w gm GM only.'); return; }

      var toks   = tokenize(msg.content);
      var cmd    = toks[0];
      var selTok = msg.selected && msg.selected.length && getObj('graphic', msg.selected[0]._id);
      var selCid = (selTok && selTok.get('represents')) || null;

      // Roll20 character IDs are long alphanumeric strings, never bare integers.
      // A bare integer in toks[1] means it came from a ?{Copies|N} prompt, not a cid.
      var rawT1  = toks[1];
      var cid    = (rawT1 && !/^\d+$/.test(rawT1)) ? rawT1 : selCid;
      var n      = Math.max(1, Math.min(10, parseInt(toks[toks.length-1], 10) || 1));

      // ── Setup ────────────────────────────────────────────────────────────────
      if (cmd === '!npc-setup-macros') {
        setupMacros(msg.playerid);

      // ── Original menu commands ────────────────────────────────────────────
      } else if (cmd === '!npc-menu') {
        if (!cid) { sendChat('NPCAttack2024', '/w gm Select an NPC token first.'); return; }
        if (!is2024NPC(cid)) { sendChat('NPCAttack2024', '/w gm "' + cName(cid) + '" is not a 2024 NPC.'); return; }
        menuAbilities(cid);

      } else if (cmd === '!npc-saves') {
        if (!cid) { sendChat('NPCAttack2024', '/w gm Select an NPC token first.'); return; }
        if (!is2024NPC(cid)) { sendChat('NPCAttack2024', '/w gm "' + cName(cid) + '" is not a 2024 NPC.'); return; }
        menuSaves(cid);

      } else if (cmd === '!npc-checks') {
        if (!cid) { sendChat('NPCAttack2024', '/w gm Select an NPC token first.'); return; }
        if (!is2024NPC(cid)) { sendChat('NPCAttack2024', '/w gm "' + cName(cid) + '" is not a 2024 NPC.'); return; }
        menuChecks(cid);

      // ── NEW: Targeted attack menu ─────────────────────────────────────────
      } else if (cmd === '!npc-tatk-menu') {
        if (!cid) { sendChat('NPCAttack2024', '/w gm Select an NPC token first.'); return; }
        if (!is2024NPC(cid)) { sendChat('NPCAttack2024', '/w gm "' + cName(cid) + '" is not a 2024 NPC.'); return; }
        menuTargetedAbilities(cid);

      // ── Original roll commands ────────────────────────────────────────────
      } else if (cmd === '!npc-atk' && toks[2]) {
        doAttack(cid, toks[2], n);

      } else if (cmd === '!npc-save' && toks[2]) {
        doSave(cid, toks[2], n);

      } else if (cmd === '!npc-check' && toks[2]) {
        doCheck(cid, toks[2], n);

      } else if (cmd === '!npc-desc' && toks[2]) {
        doDesc(cid, toks[2]);

      // ── NEW: Step 1 — store attack intent, whisper "select target + Fire" ──
      // toks[1]=npcCid  toks[2]=attackSid  toks[3]=rollType
      } else if (cmd === '!npc-tatk' && toks[2] && toks[3]) {
        doTatkSelect(cid, toks[2], toks[3]);

      // ── NEW: Step 2 — GM selected target token and clicked Fire ──────────
      // toks[1]=npcCid  toks[2]=attackSid  toks[3]=rollType
      // selTok = the PC token the GM had selected on the map when clicking Fire
      } else if (cmd === '!npc-tatk-fire' && toks[2] && toks[3]) {
        if (!selTok) { sendChat('NPCAttack2024', '/w gm No token selected — select the target token on the map first, then click Fire.'); return; }
        doTargetedAttack(cid, toks[2], selTok.id, toks[3] || 'normal');

      // ── NEW: AC debug ─────────────────────────────────────────────────────
      } else if (cmd === '!npc-tatk-debug-ac') {
        if (!cid && !selTok) { sendChat('NPCAttack2024', '/w gm Select a token first.'); return; }
        debugAC(cid, selTok ? selTok.id : null);

      // ── Toggle auto NPC-Attack card on turn change ──────────────────────
      } else if (cmd === '!npc-auto-menu') {
        state.NPCAttack2024.autoMenu = !state.NPCAttack2024.autoMenu;
        sendChat('NPCAttack2024', '/w gm Auto NPC-Attack card on turn change is now ' +
          (state.NPCAttack2024.autoMenu ? 'ON' : 'OFF') + '.');

      // ── Original debug ────────────────────────────────────────────────────
      } else if (cmd === '!npc-debug') {
        if (!cid) { sendChat('NPCAttack2024', '/w gm Select a token first.'); return; }
        var dc   = getObj('character', cid);
        var dabs = findObjs({ _type:'ability', _characterid:cid });
        var dst  = getStore(cid);
        var dl   = [
          '**NPC Debug v' + VERSION + '**',
          'toks[1]=' + String(rawT1) + '  selCid=' + String(selCid) + '  resolvedCid=' + String(cid),
          'Char: ' + (dc ? '"' + dc.get('name') + '"' : 'NOT FOUND') + '  id=' + cid,
          'is2024NPC: ' + is2024NPC(cid) + '  store: ' + (dst ? 'ok' : 'null'),
          'Abilities (' + dabs.length + '):'
        ];
        dabs.forEach(function(a){
          dl.push('  [' + a.get('name') + '] tok=' + a.get('istokenaction') + ' len=' + String(a.get('action')||'').length);
        });
        var gMacros = findObjs({ _type:'macro', playerid:msg.playerid });
        var npcMacroNames = gMacros.filter(function(m){ return m.get('name').indexOf('NPC-')===0; }).map(function(m){ return m.get('name') + ':' + String(m.get('action')).substring(0,30); });
        dl.push('NPC global macros: ' + (npcMacroNames.length ? npcMacroNames.join(', ') : '(none)'));
        sendChat('NPCAttack2024', '/w gm ' + dl.join('\n'));
      }
    });
  });

  return { version: VERSION };
}());

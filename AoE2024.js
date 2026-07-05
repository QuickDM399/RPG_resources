// AoE2024.js — AoE spell macro builder for the 2024 Beacon sheet
// Works with both PC (appState==='sheet') and NPC (appState==='npc') characters.
//
// COMMANDS:
//   (Any player — select your token first)
//   !aoe-build <spell name> [--dc <n>]  — PC selected; reads store, creates token-action macro
//   !aoe-spells                          — PC selected; lists available AoE spells
//
//   (GM only — NPC actions)
//   !aoe-npc-spells                     — selected NPC token; lists AoE-capable actions
//   !aoe-npc-cast <cid> <sid>           — show NPC AoE cast card (called from NPC-Abilities card)
//
//   (Any player)
//   !aoe-help                           — show commands + workflow in chat (with clickable buttons)
//   !aoe-cast  <...params>              — token action built by !aoe-build; shows cast card
//   !aoe-launch <...params>             — cast-level button; places draggable blast-zone token
//   !aoe-detonate <cid>                 — Detonate button; auto-detects hits, rolls saves, applies HP
//
// SUPPORTED AoE SHAPES (auto-detected from Beacon store):
//   Sphere / Cube  — drag orange circle to blast CENTER
//   Cone           — drag orange marker to the FAR TIP of the cone (away from caster)
//   Line           — drag orange marker to the FAR END of the line (away from caster)
//
// WORKFLOW (player-friendly, no layer switching):
//   1. GM runs: select PC token → !aoe-build Fireball        (one-time setup per spell)
//   2. Player clicks Fireball-AoE token action               (cast card whispered to player)
//   3. Player clicks "Cast at 3rd (8d6)"                     (marker appears on map)
//   4. Player drags the marker to the target area per shape instructions above
//   5. Player clicks 💥 Detonate! in chat                    (auto-detects tokens, resolves)
//
// INSTALL: paste into Roll20 API editor and save.

var AoE2024 = AoE2024 || (function () {
  'use strict';

  var VERSION = '1.7.0';
  var ABILITIES = ['Strength','Dexterity','Constitution','Intelligence','Wisdom','Charisma'];
  var SHORT = {Strength:'STR',Dexterity:'DEX',Constitution:'CON',Intelligence:'INT',Wisdom:'WIS',Charisma:'CHA'};

  // Pending blast zones: keyed by caster cid
  var aoeState = {};

  // GM-controlled settings (persisted via Roll20 state on toggle)
  var cfg = { playerResults: true, debug: false };

  // ── Utilities ─────────────────────────────────────────────────────────────────

  function mod(score) { return Math.floor((score - 10) / 2); }
  function fmt(n)     { return (n >= 0 ? '+' : '') + n; }

  function safe(s) {
    return String(s || '')
      .replace(/\}\}/g, '&#125;&#125;')
      .replace(/\{\{/g,  '&#123;&#123;')
      .replace(/\|/g,    '&#124;');
  }

  function tokenize(s) {
    var out = [], cur = '', inQ = false;
    for (var i = 0; i < s.length; i++) {
      var c = s[i];
      var isOpen  = (c === '"' || c === '“');
      var isClose = (c === '"' || c === '”');
      if (isOpen  && !inQ) { inQ = true;  continue; }
      if (isClose &&  inQ) { inQ = false; continue; }
      if (c === ' ' && !inQ) { if (cur) { out.push(cur); cur = ''; } continue; }
      cur += c;
    }
    if (cur) out.push(cur);
    return out;
  }

  function ordinal(n) {
    var v = n % 100, s = ['th','st','nd','rd'];
    return n + (s[(v-20)%10] || s[v] || s[0]);
  }

  function cName(cid) {
    var c = getObj('character', cid);
    return c ? c.get('name') : 'Unknown';
  }

  // Whisper prefix for whoever sent the message (player or GM).
  function wMe(msg) {
    if (playerIsGM(msg.playerid)) return '/w gm ';
    var p = getObj('player', msg.playerid);
    return p ? '/w "' + p.get('_displayname') + '" ' : '/w gm ';
  }

  // ── Store access ──────────────────────────────────────────────────────────────

  function getStore(cid) {
    var a = findObjs({ _type:'attribute', _characterid:cid, name:'store' })[0];
    if (!a) return null;
    var v = a.get('current');
    if (!v) return null;
    if (typeof v === 'object') return v;
    try { return JSON.parse(v); } catch(_) { return null; }
  }

  function getAppState(cid) {
    var a = findObjs({ _type:'attribute', _characterid:cid, name:'appState' })[0];
    return a ? a.get('current') : null;
  }

  // ── Beacon PC parsing ─────────────────────────────────────────────────────────

  function findSpellByName(ints, name) {
    var ln = name.toLowerCase();
    return Object.keys(ints).filter(function (k) {
      var e = ints[k];
      return e.type === 'Spell' && e._enabled && e.name.toLowerCase() === ln;
    })[0] || null;
  }

  function parseSpellData(ints, spellId) {
    var spell = ints[spellId];
    if (!spell) return null;

    var atkIds = []; try { atkIds = JSON.parse(spell.childIDs || '[]'); } catch(_) {}
    var atk = atkIds.length ? ints[atkIds[0]] : null;

    var dmgIds = []; if (atk) { try { dmgIds = JSON.parse(atk.childIDs || '[]'); } catch(_) {} }
    var dmg = dmgIds.length ? ints[dmgIds[0]] : null;

    var upcast = null;
    if (dmgIds[0]) {
      var uk = Object.keys(ints).filter(function (k) {
        var e = ints[k];
        return e.type === 'Upcasting' && e.parentID === dmgIds[0] && e._enabled;
      })[0];
      if (uk) upcast = ints[uk];
    }

    var aoeShape  = (spell.aoe && spell.aoe.shape) || (atk && atk.aoe && atk.aoe.shape) || 'Sphere';
    var sizeStr   = (spell.aoe && spell.aoe.size)  || (atk && atk.aoe && atk.aoe.size)  || '20 foot radius';
    var sm        = sizeStr.match(/(\d+)/);
    var saveAb    = (atk && atk.save && atk.save.saveAbility) || null;

    // No Damage child means effect-only spell (e.g. Faerie Fire, Hypnotic Pattern)
    var hasDmg = !!(dmg && dmg.damageType);

    return {
      id:          spellId,
      name:        spell.name,
      level:       parseInt(spell.level) || 0,
      aoeShape:    aoeShape,
      aoeRadius:   sm ? parseInt(sm[1]) : 20,
      saveAbility: saveAb,
      halfOnSave:  !!(atk && atk.save && atk.save.onSucceed &&
                      atk.save.onSucceed.toLowerCase().indexOf('half') !== -1),
      diceCount:   hasDmg ? (parseInt(dmg.diceCount) || 0) : 0,
      diceSize:    hasDmg ? (dmg.diceSize || '')            : '',
      damageType:  hasDmg ? dmg.damageType                  : null,
      upcastDice:  upcast ? (parseInt(upcast.value) || 0)   : 0,
      parentId:    spell.parentID || ''
    };
  }

  // ── NPC action parsing ────────────────────────────────────────────────────────

  // Returns structured AoE params from a Beacon NPC action description, or null if
  // the action isn't an AoE saving throw.
  function parseNPCAoEDesc(desc) {
    if (!desc) return null;
    if (!/Saving Throw/i.test(desc)) return null;
    if (!/(Cone|Sphere|Cube|Line)/i.test(desc)) return null;
    var saveMatch = desc.match(/(\w+) Saving Throw/i);
    var dcMatch   = desc.match(/DC (\d+)/);
    var aoeMatch  = desc.match(/(\d+)[- ]foot(?:[- ]radius)? (Cone|Sphere|Cube|Line)/i);
    if (!saveMatch || !dcMatch || !aoeMatch) return null;
    var diceMatch  = desc.match(/\[\[(\d+)(d\d+)\]\]/);
    var dmgMatch   = desc.match(/\(\d+d\d+\)\)\s+(\w+)\s+damage/i);
    var halfOnSave = /\*Success:\*\s*Half/i.test(desc);
    return {
      saveAbility: saveMatch[1],
      dc:          parseInt(dcMatch[1]),
      aoeShape:    aoeMatch[2],
      aoeSize:     parseInt(aoeMatch[1]),
      diceCount:   diceMatch ? parseInt(diceMatch[1]) : 0,
      diceSize:    diceMatch ? diceMatch[2] : 'none',
      damageType:  dmgMatch  ? dmgMatch[1]  : 'none',
      halfOnSave:  halfOnSave
    };
  }

  // Strip Beacon markdown (*text*) and resolve inline dice ([[14d8]] (14d8) → 14d8)
  // so description text is readable in Roll20 chat templates.
  function cleanNPCDesc(raw) {
    return (raw || '')
      .replace(/\[\[(\d+d\d+)\]\]\s*\(\d+d\d+\)/g, '$1')  // [[14d8]] (14d8) → 14d8
      .replace(/\[\[([^\]]+)\]\]/g, '$1')                   // any remaining [[x]] → x
      .replace(/\*/g, '')                                    // strip * markers
      .replace(/\n/g, '<br>');
  }

  function getSpellcastingAbility(ints, spellData) {
    var cid = spellData.parentId;
    if (!cid) return 'Intelligence';
    var k = Object.keys(ints).filter(function (k) {
      var e = ints[k];
      return e.type === 'Spellcasting' && e.parentID === cid && e._enabled;
    })[0];
    return k ? (ints[k].ability || 'Intelligence') : 'Intelligence';
  }

  function getAbilityScore(ints, ability) {
    var normal = 0, attuned = 0;
    Object.keys(ints).forEach(function (k) {
      var e = ints[k];
      if (e.type === 'Ability Score' && e.ability === ability && e._enabled) {
        // Skip phantom entries: no parent, orphaned parent, or parent with no type
        if (!e.parentID) return;
        var parentEntry = ints[e.parentID];
        if (!parentEntry || !parentEntry.type) return;
        var v = (e.valueFormula && e.valueFormula.flatValue) || 0;
        // Attunement items SET the score (take max); everything else adds
        if (parentEntry.type === 'Attunement') {
          attuned = Math.max(attuned, v);
        } else {
          normal += v;
        }
      }
    });
    return Math.max(normal, attuned) || 10;
  }

  function getTotalLevel(ints) {
    var mx = {};
    Object.keys(ints).forEach(function (k) {
      var e = ints[k];
      if (e.type === 'Hit Dice' && e._enabled) {
        var m = e.name.match(/\(Level (\d+)\)/);
        if (m) { var c = e.name.replace(/ Hit Dice.*/,'').trim(), l = parseInt(m[1]); if (!mx[c] || l > mx[c]) mx[c] = l; }
      }
    });
    var t = 0; Object.keys(mx).forEach(function (k) { t += mx[k]; }); return t || 1;
  }

  function getPB(lvl) { return Math.floor((lvl - 1) / 4) + 2; }

  // Returns mod(score) plus any enabled Ability Score Modifier bonuses for this ability.
  // Deduped by name to guard against phantom duplicates.
  function getAbilityMod(ints, ability) {
    var base = mod(getAbilityScore(ints, ability));
    var bonus = 0, seen = {};
    Object.keys(ints).forEach(function(k) {
      var e = ints[k];
      if (e.type === 'Ability Score Modifier' && e.ability === ability && e._enabled) {
        var n = e.name || k;
        if (seen[n]) return;
        seen[n] = true;
        var fv = e.valueFormula && e.valueFormula.flatValue;
        if (typeof fv === 'number') bonus += fv;
      }
    });
    return base + bonus;
  }

  var ABILITY_NAMES = {
    strength:'Strength', str:'Strength',
    dexterity:'Dexterity', dex:'Dexterity',
    constitution:'Constitution', con:'Constitution',
    intelligence:'Intelligence', 'int':'Intelligence',
    wisdom:'Wisdom', wis:'Wisdom',
    charisma:'Charisma', cha:'Charisma'
  };

  // Evaluates Beacon customFormula strings.
  // Beacon stores formulas as Roll20 attribute references, e.g. max(@{charisma_mod}, 1).
  function evalCustomFormula(formula, ints) {
    // max(@{ability_mod}, N)  — Roll20 reference format (actual Beacon storage)
    var m = formula.match(/max\(\s*@\{([a-z]+)[^}]+\}\s*,\s*(-?\d+)\s*\)/i);
    if (m) {
      var ab = ABILITY_NAMES[m[1].toLowerCase()];
      if (ab) return Math.max(mod(getAbilityScore(ints, ab)), parseInt(m[2], 10));
    }
    // max(ability_mod, N)  — plain text fallback
    var m2 = formula.match(/max\(\s*([a-z]+)[^a-z,)]+mod\s*,\s*(-?\d+)\s*\)/i);
    if (m2) {
      var ab2 = ABILITY_NAMES[m2[1].toLowerCase()];
      if (ab2) return Math.max(mod(getAbilityScore(ints, ab2)), parseInt(m2[2], 10));
    }
    // bare @{ability_mod}
    var m3 = formula.match(/^\s*@\{([a-z]+)[^}]+\}\s*$/i);
    if (m3) {
      var ab3 = ABILITY_NAMES[m3[1].toLowerCase()];
      if (ab3) return mod(getAbilityScore(ints, ab3));
    }
    // flat number
    var n = Number(formula.trim());
    return isNaN(n) ? 0 : n;
  }

  function getPCSaveBonus(ints, ability) {
    var score = getAbilityScore(ints, ability);
    var pb    = getPB(getTotalLevel(ints));
    var ks = Object.keys(ints);
    var prof = false;
    for (var i = 0; i < ks.length; i++) {
      var ep = ints[ks[i]];
      if (ep.type === 'Proficiency' && ep.category === 'Saving Throw' && ep.proficiency === ability && ep._enabled) {
        prof = true; break;
      }
    }
    // Sum enabled Saving Throw integrants (e.g. Aura of Protection).
    // Deduplicate by formula string — same formula means same bonus, only count once.
    var stBonus = 0, seenFormulas = {};
    for (var j = 0; j < ks.length; j++) {
      var es = ints[ks[j]];
      if (es.type === 'Saving Throw' && es.ability === ability && es._enabled && es.valueFormula) {
        var fkey = es.valueFormula.customFormula || String(es.valueFormula.flatValue !== undefined ? es.valueFormula.flatValue : '');
        if (!fkey || seenFormulas[fkey]) continue;
        seenFormulas[fkey] = true;
        if (es.valueFormula.customFormula) {
          stBonus += evalCustomFormula(es.valueFormula.customFormula, ints);
        } else if (typeof es.valueFormula.flatValue === 'number') {
          stBonus += es.valueFormula.flatValue;
        }
      }
    }
    return mod(score) + (prof ? pb : 0) + stBonus;
  }

  // ── Beacon NPC parsing ────────────────────────────────────────────────────────

  function cr2pb(cr) {
    var n = parseFloat(cr) || 0;
    if (n <= 4) return 2; if (n <= 8) return 3; if (n <= 12) return 4;
    if (n <= 16) return 5; if (n <= 20) return 6; if (n <= 24) return 7;
    if (n <= 28) return 8; return 9;
  }

  function parseNPCForSave(st, ability) {
    var ints = st.integrants && st.integrants.integrants || {};
    var se = Object.keys(ints).map(function (k) { return ints[k]; })
               .filter(function (e) { return e.type === 'Ability Score' && e.ability === ability; })[0];
    var score = se ? (se.valueFormula && se.valueFormula.flatValue || 10) : 10;
    var prof  = Object.keys(ints).some(function (k) {
      var e = ints[k];
      return e.type === 'Proficiency' && e.category === 'Saving Throw' && e.proficiency === ability;
    });
    return mod(score) + (prof ? cr2pb(st.npc && st.npc.challengeRating || 0) : 0);
  }

  // ── Damage defense (resistance / immunity) ────────────────────────────────────

  // Beacon 2024 stores defenses as integrants of type 'Defense' with names like
  // 'Immunity: Fire' or 'Resistance: Cold'. Falls back to store.npc array fields
  // used by older sheet versions.
  function getDefenseStatus(tStore, appSt, dmgType) {
    if (!tStore || !dmgType || dmgType === 'none') return 'normal';
    var dt = dmgType.toLowerCase().trim();

    function toList(raw) {
      if (!raw) return [];
      if (Array.isArray(raw)) return raw;
      return ('' + raw).split(/[,;]+/).map(function(s) { return s.trim(); });
    }
    function listMatchesDt(list) {
      for (var li = 0; li < list.length; li++) {
        var v = ('' + (list[li] || '')).toLowerCase().trim();
        if (v === dt || v.indexOf(dt + ' ') === 0 || v.indexOf(dt + ',') === 0) return true;
      }
      return false;
    }

    var isImmune = false, isResist = false;
    var ints = (tStore.integrants && tStore.integrants.integrants) || {};
    var ks = Object.keys(ints);
    for (var i = 0; i < ks.length; i++) {
      var e = ints[ks[i]];
      if (!e._enabled) continue;
      var et = ('' + (e.type || '')).toLowerCase();
      var en = ('' + (e.name || '')).toLowerCase();

      // Primary format: type='Defense', name='Immunity: Fire' or 'Resistance: Cold'
      if (et === 'defense') {
        if (en === 'immunity: '   + dt) { isImmune = true; break; }
        if (en === 'resistance: ' + dt) { isResist = true; }
        continue;
      }
      // Fallback: older integrant types used by some Beacon versions. Only
      // touch e.value/e.damage here — for unrelated integrant types (Ability
      // Score, Proficiency, Spell, ...) those fields are often numbers, and
      // blindly calling .toLowerCase() on them crashes (this is what was
      // breaking PC results — PCs simply have far more integrant types than
      // NPCs, so this path was reached and threw before reaching the real check).
      if (et === 'damage immunity' || et === 'damage resistance') {
        var ed  = '' + (e.damageType || e.value || e.damage || e.name || '');
        var edl = ed.toLowerCase().trim();
        var edMatch = edl === dt || edl.indexOf(dt + ' ') === 0 || edl.indexOf(dt + ',') === 0;
        if (et === 'damage immunity'   && edMatch) { isImmune = true; break; }
        if (et === 'damage resistance' && edMatch) { isResist = true; }
      }
    }

    // Fallback: store.npc arrays used by some Beacon versions
    if (!isImmune && !isResist && appSt === 'npc') {
      var npc = tStore.npc || {};
      if (listMatchesDt(toList(npc.damageImmunities || npc.immunities)))   isImmune = true;
      if (!isImmune && listMatchesDt(toList(npc.damageResistances || npc.resistances))) isResist = true;
    }

    return isImmune ? 'immune' : isResist ? 'resist' : 'normal';
  }

  // Returns true if the character has Magic Resistance (advantage on spell saves).
  // Beacon 2024 stores this as an enabled integrant: type='Features', name='Magic Resistance'.
  function hasMagicResistance(tStore) {
    var ints = (tStore && tStore.integrants && tStore.integrants.integrants) || {};
    var ks = Object.keys(ints);
    for (var i = 0; i < ks.length; i++) {
      var e = ints[ks[i]];
      if (e._enabled && ('' + (e.name || '')).toLowerCase() === 'magic resistance') return true;
    }
    return false;
  }

  // ── Macro action builder ──────────────────────────────────────────────────────

  function buildMacroAction(cid, sd, dc) {
    return ['!aoe-cast', cid, '"' + sd.name + '"', sd.saveAbility || 'Dexterity',
            dc, sd.diceCount, sd.diceSize || 'none', sd.damageType || 'none',
            sd.halfOnSave ? 'half' : 'full', sd.level, sd.aoeShape, sd.aoeRadius, sd.upcastDice
           ].join(' ');
  }

  // ── Special effects ───────────────────────────────────────────────────────────

  function dmgTypeToFXColor(dmgType) {
    var map = {
      cold:'frost', frost:'frost',
      fire:'fire',
      acid:'acid',
      necrotic:'death',
      radiant:'holy',
      poison:'slime',
      thunder:'smoke',
      lightning:'water',
      force:'magic',
      psychic:'charm',
      bludgeoning:'blood', slashing:'blood', piercing:'blood'
    };
    return map[(dmgType || '').toLowerCase()] || 'magic';
  }

  function spawnAoEFX(shape, pageId, ox, oy, mx, my, dmgType, noDmg) {
    var color = dmgTypeToFXColor(dmgType);
    if (shape === 'cone') {
      spawnFxBetweenPoints({x: ox, y: oy}, {x: mx, y: my}, 'breath-' + color, pageId);
    } else if (shape === 'line') {
      spawnFxBetweenPoints({x: ox, y: oy}, {x: mx, y: my}, 'beam-' + color, pageId);
    } else {
      spawnFx(mx, my, (noDmg ? 'glow' : 'nova') + '-' + color, pageId);
    }
  }

  // ── Page scale ────────────────────────────────────────────────────────────────

  function pixPerFoot(pageId) {
    var pg = getObj('page', pageId);
    if (!pg) return 14;
    // snapping_increment is in grid units where 1.0 = standard square (70 canvas px)
    var gridPx    = (parseFloat(pg.get('snapping_increment')) || 1) * 70;
    var ftPerGrid = parseFloat(pg.get('scale_number')) || 5;
    return gridPx / ftPerGrid;
  }

  // ── Shape detection helpers ───────────────────────────────────────────────────

  // Grid-snap tolerance: 1x1 tokens snap to square centres (35px offset) while
  // 2x2+ tokens snap to grid corners (0px offset), causing a systematic 2-3px
  // gap at the boundary. This constant absorbs that rounding error.
  var SNAP_TOL = 5;

  // 5e Sphere: AABB vs circle. Finds the nearest point on the token's bounding
  // box to the AoE centre and checks distance ≤ radius.
  function inSphere(tx, ty, tw, th, cx, cy, radiusPx) {
    var r = radiusPx + SNAP_TOL;
    var dx = Math.max(Math.abs(tx - cx) - tw / 2, 0);
    var dy = Math.max(Math.abs(ty - cy) - th / 2, 0);
    return dx * dx + dy * dy <= r * r;
  }

  // 5e Cube "originating from you": a fixed-size square adjacent to the caster,
  // extending toward the direction marker (only the angle matters — drag
  // distance is ignored, since the cube's size is fixed by the spell).
  // Rotated-square vs token AABB overlap test (separating axis theorem).
  function inCubeFromOrigin(tx, ty, tw, th, ox, oy, dirX, dirY, side) {
    var dx = dirX - ox, dy = dirY - oy;
    var len = Math.sqrt(dx*dx + dy*dy);
    if (len === 0) return false;
    var ux = dx / len, uy = dy / len;   // forward axis (caster -> direction)
    var px = -uy, py = ux;              // perpendicular axis
    var half = side / 2 + SNAP_TOL;

    // Near face of the cube touches the caster; centroid is side/2 forward.
    var ccx = ox + ux * side / 2, ccy = oy + uy * side / 2;

    var cCorners = [
      { x: ccx + ux*half + px*half, y: ccy + uy*half + py*half },
      { x: ccx + ux*half - px*half, y: ccy + uy*half - py*half },
      { x: ccx - ux*half + px*half, y: ccy - uy*half + py*half },
      { x: ccx - ux*half - px*half, y: ccy - uy*half - py*half }
    ];
    var tCorners = [
      { x: tx - tw/2, y: ty - th/2 }, { x: tx + tw/2, y: ty - th/2 },
      { x: tx - tw/2, y: ty + th/2 }, { x: tx + tw/2, y: ty + th/2 }
    ];
    var axes = [ {x:ux,y:uy}, {x:px,y:py}, {x:1,y:0}, {x:0,y:1} ];

    for (var ai = 0; ai < axes.length; ai++) {
      var ax = axes[ai].x, ay = axes[ai].y;
      var cMin = Infinity, cMax = -Infinity, tMin = Infinity, tMax = -Infinity;
      for (var i = 0; i < 4; i++) {
        var cp = cCorners[i].x*ax + cCorners[i].y*ay;
        if (cp < cMin) cMin = cp; if (cp > cMax) cMax = cp;
        var tp = tCorners[i].x*ax + tCorners[i].y*ay;
        if (tp < tMin) tMin = tp; if (tp > tMax) tMax = tp;
      }
      if (cMax < tMin || tMax < cMin) return false; // separating axis found
    }
    return true;
  }

  // 5e Cone: origin at caster, tip at marker. Width at distance d = d (half-angle ~26.6°).
  // Includes token if any part of it is inside the cone triangle.
  function inCone(tx, ty, tokR, ox, oy, tipX, tipY) {
    var dx = tipX - ox, dy = tipY - oy;
    var len = Math.sqrt(dx*dx + dy*dy);
    if (len === 0) return false;
    var vx = tx - ox, vy = ty - oy;
    var axial = (vx*dx + vy*dy) / len;           // distance along cone axis
    var perp  = Math.abs(vx*dy - vy*dx) / len;   // perpendicular offset from axis
    // At axial distance a, cone half-width = a/2. Token overlaps if closest point is inside.
    return axial >= -tokR && axial <= len + tokR && perp <= axial / 2 + tokR;
  }

  // 5e Line: origin at caster, end at marker, width 5ft (standard).
  function inLine(tx, ty, tokR, ox, oy, endX, endY, widthPx) {
    var dx = endX - ox, dy = endY - oy;
    var len = Math.sqrt(dx*dx + dy*dy);
    if (len === 0) return false;
    var vx = tx - ox, vy = ty - oy;
    var axial = (vx*dx + vy*dy) / len;
    var perp  = Math.abs(vx*dy - vy*dx) / len;
    return axial >= -tokR && axial <= len + tokR && perp <= widthPx / 2 + tokR;
  }

  // ── Blast-zone token (objects layer, movable by all players) ─────────────────

  // aoeShape: 'Sphere'|'Cone'|'Line'|'Cube'  (case-insensitive)
  function launchAoE(msg, cid, spellSlug, saveAb, dc, totalDice, diceSize, dmgType, halfFlag, aoeRadius, aoeShape) {
    var spellName = spellSlug.replace(/_/g, ' ');
    var shape     = (aoeShape || 'Sphere').toLowerCase();
    var pageId    = Campaign().get('playerpageid');
    var ppf       = pixPerFoot(pageId);
    var gridPx    = (parseFloat(getObj('page', pageId).get('snapping_increment')) || 1) * 70;

    // Start at caster token; fall back to page centre
    var pg   = getObj('page', pageId);
    var defX = pg.get('width')  * gridPx / 2;
    var defY = pg.get('height') * gridPx / 2;
    var ct   = findObjs({ _type:'graphic', represents:cid, _pageid:pageId });
    var cx   = ct.length ? ct[0].get('left')   : defX;
    var cy   = ct.length ? ct[0].get('top')    : defY;
    var img  = ct.length ? ct[0].get('imgsrc') : 'https://s3.amazonaws.com/files.d20.io/images/4277579/iQYjFOsYC5JsuOPUCI9RGA/thumb.png';

    // All markers are 1 grid square — small and draggable, doesn't block view.
    // Sphere blast radius shown as a semi-transparent aura instead.
    // Cube ("originating from you") is anchored to the caster and only uses
    // the marker to indicate direction, like Cone/Line.
    var isCentered = (shape === 'sphere');
    var diameter   = Math.round(gridPx);

    // Marker starts 1 grid square south of the caster so it isn't hidden under their token
    var startX = cx, startY = cy + gridPx;

    // Remove any existing blast zone for this caster
    if (aoeState[cid]) {
      var old = getObj('graphic', aoeState[cid].markerId);
      if (old) old.remove();
    }

    var marker = createObj('graphic', {
      _pageid:      pageId,
      imgsrc:       img,
      left:         startX,
      top:          startY,
      width:        diameter,
      height:       diameter,
      layer:        'objects',
      controlledby: 'all',
      name:         '[AoE] ' + spellName,
      showname:     true,
      bar1_value:   '',
      bar1_max:     ''
    });
    marker.set('tint_color', '#ff4400');

    // Sphere: aura shows the blast radius as a semi-transparent overlay.
    // Roll20 draws aura1_radius from the marker's EDGE, not its centre, so
    // naively using the spell's true radius would render a circle that's
    // half a grid square (2.5ft on a standard 5ft grid) too big. Shrink the
    // displayed radius so the visible circle lines up with the actual
    // mechanical hit area (which uses the true, unpadded radius).
    if (isCentered) {
      var ftPerGrid       = gridPx / ppf;
      var visualAuraRadius = Math.max(0, parseInt(aoeRadius) - ftPerGrid / 2);
      marker.set({
        aura1_radius:      visualAuraRadius,
        aura1_color:       '#ff4400',
        showplayers_aura1: true
      });
    }

    var descData = getSpellDescription(cid, spellName);

    aoeState[cid] = {
      markerId:    marker.id,
      pageId:      pageId,
      spellName:   spellName,
      aoeShape:    shape,
      saveAb:      saveAb,
      dc:          parseInt(dc),
      totalDice:   parseInt(totalDice),
      diceSize:    diceSize,
      dmgType:     dmgType,
      halfOnSave:  halfFlag === 'half',
      aoeRadius:   parseInt(aoeRadius),
      ppf:         ppf,
      description: descData.description || '',
      upcastText:  descData.upcastText  || ''
    };

    var instructions;
    if (shape === 'sphere') {
      instructions = 'Drag **[AoE] ' + spellName + '** (orange circle) to the blast **center**, then click:';
    } else if (shape === 'cube') {
      instructions = 'Drag **[AoE] ' + spellName + '** (orange marker) in the **direction** you want the ' +
        aoeRadius + '-foot cube to extend from you (stays anchored to you — only the direction dragged matters, not the distance), then click:';
    } else {
      instructions = 'Drag **[AoE] ' + spellName + '** (orange marker) to the **far end** of the ' +
        shape + ' (away from your character), then click:';
    }

    sendChat('AoE2024', wMe(msg) +
      '🔥 **' + spellName + '** marker placed!\n' + instructions + '\n' +
      '[💥 Detonate!](!aoe-detonate ' + cid + ')');
  }

  // ── Detonation ────────────────────────────────────────────────────────────────

  function detonateAoE(msg, cid) {
    var state = aoeState[cid];
    if (!state) {
      sendChat('AoE2024', wMe(msg) + 'No pending blast zone for ' + cName(cid) +
        '. Click a cast-level button first.');
      return;
    }

    var marker = getObj('graphic', state.markerId);
    if (!marker) {
      delete aoeState[cid];
      sendChat('AoE2024', wMe(msg) + 'Blast zone token was removed. Click a cast-level button to place a new one.');
      return;
    }

    var mx = marker.get('left');
    var my = marker.get('top');
    // True D&D radius/side measured from the origin point. Roll20's aura
    // visual (sphere only) is drawn from the marker's edge, so it'll look
    // ~2.5ft larger than the actual mechanical area — that's a cosmetic
    // Roll20 quirk we intentionally don't compensate for anymore.
    var radiusPx = state.aoeRadius * state.ppf;

    marker.remove();
    delete aoeState[cid];

    var shape = state.aoeShape || 'sphere';

    // For origin-based shapes (cone/line/cube "originating from you"), get caster position
    var ox = mx, oy = my;
    if (shape === 'cone' || shape === 'line' || shape === 'cube') {
      var cToks = findObjs({ _type:'graphic', represents:cid, _pageid:state.pageId });
      if (!cToks.length) {
        sendChat('AoE2024', wMe(msg) + 'Cannot find ' + cName(cid) + '\'s token on this page.');
        return;
      }
      ox = cToks[0].get('left');
      oy = cToks[0].get('top');
    }

    // Spawn visual effect. For a self-originating cube, centre the burst on
    // the cube's actual footprint (between caster and direction point)
    // rather than on the possibly-far-dragged direction marker.
    var noDmgFX = !state.diceSize || state.dmgType === 'none' || state.totalDice === 0;
    var fxX = mx, fxY = my;
    if (shape === 'cube') {
      var fdx = mx - ox, fdy = my - oy;
      var flen = Math.sqrt(fdx*fdx + fdy*fdy) || 1;
      fxX = ox + (fdx / flen) * (radiusPx / 2);
      fxY = oy + (fdy / flen) * (radiusPx / 2);
    }
    spawnAoEFX(shape, state.pageId, ox, oy, fxX, fxY, state.dmgType, noDmgFX);

    // Line width = 5ft in pixels (standard 5e line width)
    var lineWidthPx = 5 * state.ppf;

    var allToks  = findObjs({ _type:'graphic', _pageid:state.pageId, layer:'objects' });
    var affected = [];
    var dbgHeader = (shape === 'cube')
      ? 'origin:(' + Math.round(ox) + ',' + Math.round(oy) + ') dir:(' + Math.round(mx) + ',' + Math.round(my) +
        ') side:' + Math.round(radiusPx) + 'px (' + state.aoeRadius + 'ft × ' + state.ppf.toFixed(1) + 'px/ft)'
      : 'center:(' + Math.round(mx) + ',' + Math.round(my) + ') radius:' + Math.round(radiusPx) +
        'px (' + state.aoeRadius + 'ft × ' + state.ppf.toFixed(1) + 'px/ft)';
    var dbgLines = cfg.debug ? [dbgHeader] : null;
    // Cone/Line/Cube originate AT the caster (they're the apex/edge, not
    // inside the area) — exclude their own token from these shapes. A token
    // sitting exactly at the origin trivially satisfies the cone/line/cube
    // overlap tests (axial=0, perp=0), which is correct for OTHER tokens
    // standing on that spot but wrong for the caster themself.
    var excludeCaster = (shape === 'cone' || shape === 'line' || shape === 'cube');

    for (var ai = 0; ai < allToks.length; ai++) {
      var tok = allToks[ai];
      if (tok.id === state.markerId) continue;
      var tcid = tok.get('represents');
      if (excludeCaster && tcid === cid) continue;
      if (!tcid && !tok.get('bar1_value') && !tok.get('name')) continue;
      if ((tok.get('name') || '').indexOf('[AoE]') === 0) continue;
      var tx = tok.get('left'), ty = tok.get('top');
      var tw = tok.get('width'), th = tok.get('height');
      var tokR = Math.min(tw, th) / 2;
      var hit = false;
      if (shape === 'cone')        hit = inCone(tx, ty, tokR, ox, oy, mx, my);
      else if (shape === 'line') hit = inLine(tx, ty, tokR, ox, oy, mx, my, lineWidthPx);
      else if (shape === 'cube') hit = inCubeFromOrigin(tx, ty, tw, th, ox, oy, mx, my, radiusPx);
      else                       hit = inSphere(tx, ty, tw, th, mx, my, radiusPx);
      if (hit) affected.push(tok);
      if (dbgLines) {
        var ddx = Math.max(Math.abs(tx - mx) - tw/2, 0);
        var ddy = Math.max(Math.abs(ty - my) - th/2, 0);
        var ddist = Math.round(Math.sqrt(ddx*ddx + ddy*ddy));
        dbgLines.push((hit ? '✓' : '✗') + ' ' + (tok.get('name') || tcid || tok.id) + ' [' + Math.round(tw) + 'x' + Math.round(th) + '] dist:' + ddist + '/' + Math.round(radiusPx));
      }
    }

    if (dbgLines) {
      sendChat('AoE2024', '/w gm ' + dbgLines.join('<br>'));
    }

    if (!affected.length) {
      sendChat('AoE2024', wMe(msg) + 'No tokens found in ' + shape + ' area. Reposition and try again.');
      return;
    }

    applyAoEDamage(msg, affected, cid, state);
  }

  // ── Damage application ────────────────────────────────────────────────────────

  function applyAoEDamage(msg, tokenList, cid, state) {
    var noDmg     = !state.diceSize || state.dmgType === 'none' || state.totalDice === 0;
    var facets    = (!noDmg && state.diceSize) ? (parseInt(state.diceSize.replace('d','')) || 6) : 6;
    var saveShort = SHORT[state.saveAb] || (state.saveAb || 'DEX').slice(0,3).toUpperCase();

    var saveDesc = noDmg
      ? 'Save or suffer effect'
      : (state.halfOnSave ? 'Half on save' : 'No dmg on save');

    var parts = [
      '&{template:default}',
      '{{name=' + (noDmg ? '🔮' : '💥') + ' ' + safe(state.spellName) + '}}',
      '{{Caster=' + safe(cName(cid)) + '}}',
      '{{Save=' + saveShort + ' DC ' + state.dc + ' | ' + saveDesc + '}}'
    ];

    if (state.description) {
      parts.push('{{Effect=' + safe(state.description).replace(/\n/g, '<br>') + '}}');
    }

    var totalDmg = 0, affected = 0, saved_count = 0, count = 0;

    for (var ti = 0; ti < tokenList.length; ti++) {
      try {
        var tok     = tokenList[ti];
        count++;
        var tcid    = tok.get('represents');
        var tokName = tok.get('name') || (tcid ? cName(tcid) : 'Token');

        var saveBonus = 0, tStore = null, appSt = null, magicAdv = false;
        if (tcid) {
          tStore = getStore(tcid);
          appSt  = getAppState(tcid);
          if (tStore) {
            magicAdv = hasMagicResistance(tStore);
            if (tStore.integrants) {
              var intMap = tStore.integrants.integrants;
              if (intMap) {
                saveBonus = appSt === 'npc'
                  ? parseNPCForSave(tStore, state.saveAb)
                  : getPCSaveBonus(intMap, state.saveAb);
              }
            }
          }
        }

        var d20, rollStr;
        if (magicAdv) {
          var ra = randomInteger(20), rb = randomInteger(20);
          d20 = Math.max(ra, rb);
          rollStr = Math.min(ra, rb) + ',' + d20 + '→' + d20;
        } else {
          d20 = randomInteger(20);
          rollStr = '' + d20;
        }
        var total = d20 + saveBonus;
        var saved = total >= state.dc;
        if (saved) { saved_count++; } else { affected++; }

        var saveStr = saved
          ? 'Saved (' + rollStr + fmt(saveBonus) + '=' + total + ')'
          : 'Failed (' + rollStr + fmt(saveBonus) + '=' + total + ')';

        if (noDmg) {
          var effectStr = saved ? 'No effect' : 'Effect applied';
          parts.push('{{' + safe(tokName) + '=' + saveStr + ' | ' + effectStr + '}}');
        } else {
          var raw = 0;
          for (var di = 0; di < state.totalDice; di++) { raw += randomInteger(facets); }
          var dmg = saved ? (state.halfOnSave ? Math.floor(raw / 2) : 0) : raw;

          // Resistance/immunity applied after save (so save-for-half + resist = quarter).
          var defense = tStore ? getDefenseStatus(tStore, appSt, state.dmgType) : 'normal';
          var defNote = '';
          if (defense === 'immune') {
            dmg = 0;
          } else if (defense === 'resist' && dmg > 0) {
            dmg = Math.floor(dmg / 2);
            defNote = ' [resist]';
          }

          var curHp = parseInt(tok.get('bar1_value')) || 0;
          var newHp = curHp;
          if (dmg > 0) {
            newHp = Math.max(0, curHp - dmg);
            tok.set('bar1_value', newHp);
          }

          totalDmg += dmg;

          var dmgStr, hpStr = '';
          if (defense === 'immune') {
            dmgStr = 'Immune (' + state.dmgType + ')';
          } else if (dmg > 0) {
            dmgStr = dmg + ' ' + state.dmgType + (saved && state.halfOnSave ? ' (half)' : '') + defNote;
            hpStr  = ' (' + curHp + '->' + newHp + ' HP)';
          } else {
            dmgStr = 'No damage';
          }
          parts.push('{{' + safe(tokName) + '=' + saveStr + ' | ' + dmgStr + hpStr + '}}');
        }
      } catch(e) {
        log('AoE2024 token error: ' + e);
        parts.push('{{Error=Could not process one target}}');
      }
    }

    var summary = noDmg
      ? affected + ' affected, ' + saved_count + ' saved (out of ' + count + ')'
      : totalDmg + ' ' + safe(state.dmgType) + ' to ' + count + ' target' + (count !== 1 ? 's' : '');
    parts.push('{{Result=' + summary + '}}');

    // Toggle ON = public (everyone sees it); OFF = GM-only whisper.
    var resultWhisper = cfg.playerResults ? '' : '/w gm ';
    sendChat('character|' + cid, resultWhisper + parts.join(' '));
  }

  // ── Cast card ─────────────────────────────────────────────────────────────────

  // Fetched fresh on !aoe-cast rather than stored in the macro command
  // (description text is too long and contains characters that break command parsing).
  function getSpellDescription(cid, spellName) {
    var store = getStore(cid);
    if (!store || !store.integrants) return {};
    var ints    = store.integrants.integrants;
    var spellId = findSpellByName(ints, spellName);
    if (!spellId) return {};
    var spell = ints[spellId];
    return {
      description: (spell.description || '').toString().trim(),
      upcastText:  (spell.upcastText  || '').toString().trim()
    };
  }

  // ── Help card ─────────────────────────────────────────────────────────────────

  function showHelp(msg) {
    var w    = wMe(msg);
    var isGM = playerIsGM(msg.playerid);

    var parts = [
      '&{template:default}',
      '{{name=AoE2024 v' + VERSION + ' — Quick Reference}}'
    ];

    parts.push(
      '{{Setup (select your token first)=' +
      '[📋 List Spells](!aoe-spells)' +
      ' — ' +
      '[🔨 Build Macro](!aoe-build ?{Spell Name?|Fireball})' +
      '}}'
    );
    parts.push('{{DC Override=!aoe-build [Spell Name] --dc [n]}}');
    var resultsOn = cfg.playerResults;
    parts.push('{{[Toggle Detonate Results](!aoe-toggle-results)=' + (resultsOn ? 'Public (everyone)' : 'GM only') + '}}');
    if (isGM) {
      parts.push('{{NPC Setup=!aoe-npc-spells (select NPC token)}}');
    }

    parts.push(
      '{{Adjust Save DC (select token first)=' +
      '[🎯 Set DC](!aoe-setdc ?{Spell name — use underscores for spaces e.g. Burning_Hands|Fireball} ?{New Save DC|15})' +
      '}}'
    );

    parts.push('{{Step 1=Click the spell token action → cast card in chat}}');
    parts.push('{{Step 2=Click a Cast at Nth Level button → orange marker placed}}');
    parts.push('{{Step 3=Drag the orange marker to the target area}}');
    parts.push('{{Step 4=Click the 💥 Detonate! button in chat → saves and damage resolved}}');
    parts.push('{{Sphere or Cube=Drag circle to the blast CENTER}}');
    parts.push('{{Cone=Drag marker to the far TIP (away from your character)}}');
    parts.push('{{Line=Drag marker to the far END (away from your character)}}');

    sendChat('AoE2024', w + parts.join(' '));
  }

  function showCastCard(msg, cid, spellName, saveAb, dc, baseDice, diceSize, dmgType,
                        halfFlag, baseLevel, aoeShape, aoeRadius, upcastDice,
                        description, upcastText) {
    var noDmg     = (dmgType === 'none' || diceSize === 'none' || !diceSize || parseInt(baseDice) === 0);
    var halfStr   = halfFlag === 'half' ? 'Half on save' : 'No damage on save';
    var saveShort = SHORT[saveAb] || saveAb.slice(0,3).toUpperCase();
    var base      = parseInt(baseDice) || 0, upcast = parseInt(upcastDice) || 0, lvl0 = parseInt(baseLevel);
    var slug      = spellName.replace(/\s+/g, '_');
    var tail      = ' ' + (diceSize || '') + ' ' + dmgType + ' ' + halfFlag + ' ' + aoeRadius + ' ' + (aoeShape || 'Sphere');

    var parts = [
      '&{template:default}',
      '{{name=' + safe(spellName) + '}}',
      '{{Caster=' + safe(cName(cid)) + '}}',
      '{{AoE=' + safe(aoeShape) + ' — ' + aoeRadius + ' ft}}',
      '{{Save=' + saveShort + ' DC ' + dc + '}}'
    ];

    if (noDmg) {
      parts.push('{{Effect=Save or suffer effect — no damage}}');
    } else {
      parts.push('{{Damage=' + base + diceSize + ' ' + safe(dmgType) +
        (upcast ? ' (+' + upcast + diceSize + '/slot)' : '') + '}}');
      parts.push('{{On&amp;nbsp;Save=' + halfStr + '}}');
    }

    if (description) {
      parts.push('{{Description=' + safe(description).replace(/\n/g, '<br>') + '}}');
    }
    if (upcastText) {
      parts.push('{{At Higher Levels=' + safe(upcastText).replace(/\n/g, '<br>') + '}}');
    }

    // Cast buttons — no-damage spells show just the slot level (no upcast buttons if upcast=0)
    var maxLvl = (noDmg && upcast === 0) ? lvl0 : Math.min(lvl0 + 4, 9);
    for (var lvl = lvl0; lvl <= maxLvl; lvl++) {
      var dice = noDmg ? 0 : (base + (lvl > lvl0 ? (lvl - lvl0) * upcast : 0));
      var cmd  = '!aoe-launch ' + cid + ' ' + slug + ' ' + saveAb + ' ' + dc + ' ' + dice + tail;
      var label = noDmg
        ? 'Cast at ' + ordinal(lvl)
        : 'Cast at ' + ordinal(lvl) + ' (' + dice + diceSize + ')';
      parts.push('{{[' + label + '](' + cmd + ')=Places AoE marker on map}}');
    }

    sendChat('character|' + cid, wMe(msg) + parts.join(' '));
  }

  // ── NPC AoE cast card ─────────────────────────────────────────────────────────

  function showNPCCastCard(msg, cid, actionName, actionType, aoe, rawDescription) {
    var noDmg     = (!aoe.diceCount || aoe.diceSize === 'none' || aoe.damageType === 'none');
    var saveShort = SHORT[aoe.saveAbility] || (aoe.saveAbility || 'DEX').slice(0,3).toUpperCase();
    var typeLabel = (actionType === 'Legendary') ? 'Legendary Action' : 'Action';
    var slug      = actionName.replace(/[()]/g, '').replace(/\s+/g, '_');
    var diceArg   = noDmg ? '0'    : String(aoe.diceCount);
    var sizeArg   = noDmg ? 'none' : aoe.diceSize;
    var typeArg   = noDmg ? 'none' : (aoe.damageType || 'none');
    var halfArg   = aoe.halfOnSave ? 'half' : 'full';

    var launchCmd = '!aoe-launch ' + cid + ' ' + slug + ' ' + aoe.saveAbility + ' ' + aoe.dc +
      ' ' + diceArg + ' ' + sizeArg + ' ' + typeArg + ' ' + halfArg + ' ' + aoe.aoeSize + ' ' + aoe.aoeShape;

    var parts = [
      '&{template:default}',
      '{{name=' + safe(actionName) + '}}',
      '{{Creature=' + safe(cName(cid)) + '}}',
      '{{Type=' + typeLabel + '}}',
      '{{AoE=' + safe(aoe.aoeShape) + ' — ' + aoe.aoeSize + ' ft}}',
      '{{Save=' + saveShort + ' DC ' + aoe.dc + '}}'
    ];

    if (noDmg) {
      parts.push('{{Effect=Save or suffer effect — no damage}}');
    } else {
      parts.push('{{Damage=' + aoe.diceCount + aoe.diceSize + ' ' + safe(aoe.damageType) + '}}');
      parts.push('{{On&amp;nbsp;Save=' + (aoe.halfOnSave ? 'Half damage' : 'No damage') + '}}');
    }

    if (rawDescription) {
      parts.push('{{Description=' + safe(cleanNPCDesc(rawDescription)) + '}}');
    }

    parts.push('{{[🌀 Place AoE Marker](' + launchCmd + ')=Drag to target then Detonate}}');

    sendChat('NPC2024', '/w gm ' + parts.join(' '));
  }

  // ── Command handler ───────────────────────────────────────────────────────────

  on('ready', function () {
    log('AoE2024 v' + VERSION + ' ready.');
    state.AoE2024 = state.AoE2024 || {};
    if (state.AoE2024.playerResults !== undefined) cfg.playerResults = state.AoE2024.playerResults;
    if (state.AoE2024.debug !== undefined) cfg.debug = state.AoE2024.debug;

    on('chat:message', function (msg) {
      if (msg.type !== 'api') return;
      if (!msg.content || msg.content.indexOf('!aoe-') !== 0) return;

      var toks   = tokenize(msg.content);
      var cmd    = toks[0];
      var selTok = msg.selected && msg.selected.length && getObj('graphic', msg.selected[0]._id);
      var selCid = selTok ? selTok.get('represents') : null;
      var isGM   = playerIsGM(msg.playerid);

      // ── GM-only commands ──────────────────────────────────────────────────

      if (cmd === '!aoe-npc-spells' || cmd === '!aoe-npc-cast' || cmd === '!aoe-toggle-results') {
        if (!isGM) { sendChat('AoE2024', wMe(msg) + 'GM only.'); return; }
      }

      if (cmd === '!aoe-toggle-results') {
        cfg.playerResults = !cfg.playerResults;
        state.AoE2024.playerResults = cfg.playerResults;
        sendChat('AoE2024', '/w gm Detonate results now ' + (cfg.playerResults ? 'public (everyone sees them).' : 'GM only.'));
        return;
      }

      if (cmd === '!aoe-debug') {
        if (!isGM) { sendChat('AoE2024', wMe(msg) + 'GM only.'); return; }
        cfg.debug = !cfg.debug;
        state.AoE2024.debug = cfg.debug;
        sendChat('AoE2024', '/w gm AoE debug logging ' + (cfg.debug ? 'ON — detonate to see token hit-test details in chat.' : 'OFF.'));
        return;
      }

      if (cmd === '!aoe-npc-spells') {
        if (!selCid) { sendChat('AoE2024', '/w gm Select an NPC token first.'); return; }
        var store = getStore(selCid);
        if (!store || !store.integrants) { sendChat('AoE2024', '/w gm No Beacon NPC store found.'); return; }
        var ints = store.integrants.integrants;
        var list = Object.keys(ints).filter(function (k) {
          var e = ints[k];
          return e.type === 'Action' && e._enabled && parseNPCAoEDesc(e.description);
        }).map(function (k) {
          var e = ints[k], a = parseNPCAoEDesc(e.description);
          return e.name + ' (' + (e.actionType||'Action') + ', ' + a.aoeShape + ' ' + a.aoeSize + 'ft' +
            (a.diceCount ? ', ' + a.diceCount + a.diceSize + ' ' + a.damageType : ', effect') + ')';
        }).sort();
        sendChat('AoE2024', '/w gm **AoE actions for ' + cName(selCid) + ':**\n' + (list.length ? list.join('\n') : 'None found'));
        return;
      }

      if (cmd === '!aoe-npc-cast') {
        var npcCid = toks[1], npcSid = toks[2];
        if (!npcCid || !npcSid) { sendChat('AoE2024', '/w gm Usage: !aoe-npc-cast <cid> <sid>'); return; }
        var store = getStore(npcCid);
        if (!store || !store.integrants) { sendChat('AoE2024', '/w gm Cannot read NPC store.'); return; }
        var ints = store.integrants.integrants;
        var action = null;
        Object.keys(ints).forEach(function (k) {
          if (!action && (ints[k].shortID === npcSid || k === npcSid)) action = ints[k];
        });
        if (!action) { sendChat('AoE2024', '/w gm Action ' + npcSid + ' not found.'); return; }
        var aoe = parseNPCAoEDesc(action.description);
        if (!aoe) { sendChat('AoE2024', '/w gm This action has no parseable AoE.'); return; }
        showNPCCastCard(msg, npcCid, action.name, action.actionType || 'Action', aoe, action.description);
        return;
      }

      if (cmd === '!aoe-spells') {
        if (!selCid) { sendChat('AoE2024', '/w gm Select a PC token first.'); return; }
        var store = getStore(selCid);
        if (!store) { sendChat('AoE2024', '/w gm No Beacon store found.'); return; }
        var ints = store.integrants.integrants;
        var list = Object.keys(ints).filter(function (k) {
          var e = ints[k]; return e.type === 'Spell' && e._enabled && e.aoe && e.aoe.shape;
        }).map(function (k) {
          var e = ints[k]; return e.name + ' (lv' + e.level + ', ' + e.aoe.shape + ' ' + e.aoe.size + ')';
        }).sort();
        sendChat('AoE2024', '/w gm **AoE spells for ' + cName(selCid) + ':**\n' + list.join('\n'));
        return;
      }

      if (cmd === '!aoe-build') {
        if (!selCid) { sendChat('AoE2024', '/w gm Select a PC token first.'); return; }
        var dcOverride = null, rawArgs = toks.slice(1), di = rawArgs.indexOf('--dc');
        if (di !== -1 && rawArgs[di + 1]) { dcOverride = parseInt(rawArgs[di + 1]); rawArgs.splice(di, 2); }
        var spellName = rawArgs.join(' ').trim();
        if (!spellName) {
          sendChat('AoE2024', '/w gm Usage: !aoe-build <spell name> [--dc <n>]\nRun !aoe-spells first.');
          return;
        }
        var store = getStore(selCid);
        if (!store) { sendChat('AoE2024', '/w gm No Beacon store found.'); return; }
        var ints = store.integrants.integrants;
        var spellId = findSpellByName(ints, spellName);
        if (!spellId) {
          var avail = Object.keys(ints).filter(function (k) {
            var e = ints[k]; return e.type === 'Spell' && e._enabled && e.aoe && e.aoe.shape;
          }).map(function (k) { return ints[k].name; }).sort();
          sendChat('AoE2024', '/w gm Spell "' + spellName + '" not found or has no AoE.\nAvailable: ' +
            (avail.join(', ') || 'none'));
          return;
        }
        var sd = parseSpellData(ints, spellId);
        if (!sd) { sendChat('AoE2024', '/w gm Could not parse spell data.'); return; }
        var scAb  = getSpellcastingAbility(ints, sd);
        var score = getAbilityScore(ints, scAb);
        var lvl   = getTotalLevel(ints);
        var pb    = getPB(lvl);
        var dc    = dcOverride !== null ? dcOverride : (8 + pb + mod(score));
        var macro = sd.name.replace(/\s+/g, '') + '-AoE';
        findObjs({ _type:'ability', _characterid:selCid, name:macro }).forEach(function (a) { a.remove(); });
        createObj('ability', { _characterid:selCid, name:macro, action:buildMacroAction(selCid, sd, dc), istokenaction:true });
        var dcNote = dcOverride !== null
          ? ' (manually set)'
          : ' (8+' + pb + '+' + fmt(mod(score)) + ' ' + (SHORT[scAb]||scAb) + ' — verify on sheet!)';
        var dmgLine = sd.damageType
          ? '• ' + sd.diceCount + sd.diceSize + ' ' + sd.damageType +
              (sd.upcastDice ? ' +' + sd.upcastDice + sd.diceSize + '/slot' : '') + '\n' +
            '• On save: ' + (sd.halfOnSave ? 'half damage' : 'no damage') + '\n'
          : '• Effect only — no damage\n';
        sendChat('AoE2024', '/w gm **✅ ' + macro + ' built for ' + cName(selCid) + '**\n' +
          '• ' + sd.name + ' ' + ordinal(sd.level) + ' | ' + sd.aoeShape + ' ' + sd.aoeRadius + 'ft\n' +
          dmgLine +
          '• ' + (sd.saveAbility||'?') + ' save DC ' + dc + dcNote + '\n' +
          'To override DC: !aoe-build ' + sd.name + ' --dc <n>');
        return;
      }

      // ── Player-accessible commands ────────────────────────────────────────

      if (cmd === '!aoe-help') { showHelp(msg); return; }

      // !aoe-cast <cid> <name> <saveAb> <dc> <dice> <size> <type> <half|full> <baseLevel> <shape> <radius> <upcastDice>
      if (cmd === '!aoe-cast') {
        if (toks.length < 13) { sendChat('AoE2024', wMe(msg) + 'Malformed — rebuild with !aoe-build.'); return; }
        var spellDesc = getSpellDescription(toks[1], toks[2]);
        showCastCard(msg, toks[1], toks[2], toks[3], toks[4], toks[5], toks[6],
                     toks[7], toks[8], toks[9], toks[10], toks[11], toks[12],
                     spellDesc.description, spellDesc.upcastText);
        return;
      }

      // !aoe-launch <cid> <slug> <saveAb> <dc> <totalDice> <size> <type> <half|full> <radius> <shape>
      if (cmd === '!aoe-launch') {
        if (toks.length < 10) { sendChat('AoE2024', wMe(msg) + 'Malformed !aoe-launch.'); return; }
        launchAoE(msg, toks[1], toks[2], toks[3], toks[4], toks[5], toks[6], toks[7], toks[8], toks[9], toks[10] || 'Sphere');
        return;
      }

      // !aoe-debug-save [ability]  — GM only, select target token first
      if (cmd === '!aoe-debug-save') {
        if (!isGM) { sendChat('AoE2024', wMe(msg) + 'GM only.'); return; }
        var dbSelTok = msg.selected && msg.selected[0];
        var dbCid = dbSelTok ? getObj('graphic', dbSelTok._id).get('represents') : toks[1];
        var dbAb = toks[1] || 'Constitution';
        if (!dbCid) { sendChat('AoE2024', wMe(msg) + 'Select a token first.'); return; }
        var dbAbLow = dbAb.toLowerCase();
        // Test every plausible attribute name format the Beacon sheet might expose
        var candidates = [
          dbAbLow + '_save_bonus',
          dbAbLow.slice(0,3) + '_save_bonus',
          dbAbLow + '_save',
          dbAbLow.slice(0,3) + '_save',
          'savingthrow_' + dbAbLow,
          dbAbLow + 'Save',
          dbAbLow + 'SavingThrow'
        ];
        var attrResults = candidates.map(function(n) {
          var v = getAttrByName(dbCid, n);
          return n + '=' + JSON.stringify(v);
        });
        // Also show integrant entries for this ability
        var dbStore = getStore(dbCid);
        var dbInts = dbStore && dbStore.integrants && dbStore.integrants.integrants || {};
        var dbEntries = [];
        Object.keys(dbInts).forEach(function(k) {
          var e = dbInts[k];
          if (e.type === 'Ability Score' && e.ability === dbAb) {
            var parent = e.parentID && dbInts[e.parentID];
            dbEntries.push('val=' + (e.valueFormula && e.valueFormula.flatValue) +
              ' enabled=' + e._enabled + ' parentType=' + (parent && parent.type || '?') +
              ' [' + (e.name || '') + ']');
          }
        });
        var dbProfEntries = [];
        Object.keys(dbInts).forEach(function(k) {
          var e = dbInts[k];
          if (e.type === 'Proficiency' && e.category === 'Saving Throw') {
            dbProfEntries.push((e.proficiency || '?') + ' enabled=' + e._enabled + ' [' + (e.name || '') + ']');
          }
        });
        // Collect all unique integrant types so we can spot unknown bonus types
        var typeCount = {};
        Object.keys(dbInts).forEach(function(k) {
          var t = dbInts[k].type || '(none)';
          typeCount[t] = (typeCount[t] || 0) + 1;
        });
        var typeSummary = Object.keys(typeCount).sort().map(function(t) {
          return t + '×' + typeCount[t];
        });
        // Look for anything that might be a save bonus / feature bonus not already covered
        var dbOtherSave = [];
        Object.keys(dbInts).forEach(function(k) {
          var e = dbInts[k];
          var t = e.type || '';
          if (t === 'Ability Score' || t === 'Proficiency' || t === 'Hit Dice' ||
              t === 'Spell' || t === 'Attack' || t === 'Damage' || t === 'Upcasting' ||
              t === 'Attunement' || t === 'Spellcasting' || t === 'Class' ||
              t === 'Feature' || t === '') return;
          // Show anything enabled with a flatValue or referencing an ability
          var fv = e.valueFormula && e.valueFormula.flatValue;
          var ab = e.ability || e.saveAbility || '';
          if (!e._enabled) return;
          dbOtherSave.push(t + ' | ' + (e.name || k.slice(0,8)) +
            (ab ? ' | ab=' + ab : '') +
            (fv !== undefined ? ' | val=' + fv : '') +
            (e.formula ? ' | formula=' + e.formula : ''));
        });
        sendChat('AoE2024', wMe(msg) +
          '&{template:default}{{name=' + cName(dbCid) + ' — ' + dbAb + ' debug}}' +
          '{{getAttrByName=' + attrResults.join('<br>') + '}}' +
          '{{integrants=' + (dbEntries.join('<br>') || 'none') + '}}' +
          '{{save proficiencies=' + (dbProfEntries.join('<br>') || 'none') + '}}' +
          '{{integrant score=' + getAbilityScore(dbInts, dbAb) + '}}' +
          '{{integrant mod=' + getAbilityMod(dbInts, dbAb) + '}}' +
          '{{integrant save=' + getPCSaveBonus(dbInts, dbAb) + '}}' +
          '{{all types=' + typeSummary.join(', ') + '}}' +
          '{{other enabled bonuses=' + (dbOtherSave.join('<br>') || 'none') + '}}');
        return;
      }

      // !aoe-test-st [ability]  — GM only; step-by-step Saving Throw bonus trace
      if (cmd === '!aoe-test-st') {
        if (!isGM) { sendChat('AoE2024', wMe(msg) + 'GM only.'); return; }
        var tstSelTok = msg.selected && msg.selected[0];
        var tstCid = tstSelTok ? getObj('graphic', tstSelTok._id).get('represents') : null;
        if (!tstCid) { sendChat('AoE2024', wMe(msg) + 'Select a token first.'); return; }
        var tstAb = toks[1] || 'Constitution';
        var tstStore = getStore(tstCid);
        var tstInts = tstStore && tstStore.integrants && tstStore.integrants.integrants || {};
        var tstLines = [];
        var tstTotal = 0;
        Object.keys(tstInts).forEach(function(k) {
          var e = tstInts[k];
          if (e.type === 'Saving Throw') {
            var ab = e.ability;
            var en = e._enabled;
            var hasFormula = e.valueFormula && e.valueFormula.customFormula;
            var formulaResult = hasFormula ? evalCustomFormula(e.valueFormula.customFormula, tstInts) : 'N/A';
            tstLines.push('ab=' + ab + ' enabled=' + en + ' matches=' + (ab === tstAb && en) +
              (hasFormula ? ' formula="' + e.valueFormula.customFormula + '" result=' + formulaResult : ' noFormula') +
              ' [' + (e.name || k.slice(0,8)) + ']');
            if (ab === tstAb && en && hasFormula) tstTotal += formulaResult;
          }
        });
        var tstChaMod = mod(getAbilityScore(tstInts, 'Charisma'));
        // Grab first Saving Throw formula for char-code inspection
        var tstRawFormula = '';
        Object.keys(tstInts).some(function(k) {
          var e = tstInts[k];
          if (e.type === 'Saving Throw' && e.valueFormula && e.valueFormula.customFormula) {
            tstRawFormula = e.valueFormula.customFormula; return true;
          }
        });
        var tstCodes = [];
        for (var ci = 0; ci < Math.min(tstRawFormula.length, 15); ci++) {
          tstCodes.push(tstRawFormula.charCodeAt(ci));
        }
        var tstMatchTest = tstRawFormula ? (tstRawFormula.match(/max\(/i) ? 'YES' : 'NO') : 'n/a';
        sendChat('AoE2024', wMe(msg) +
          '&{template:default}{{name=ST test ' + tstAb + '}}' +
          '{{charisma_mod=' + tstChaMod + '}}' +
          '{{formula len=' + tstRawFormula.length + '}}' +
          '{{first 15 charcodes=' + tstCodes.join(',') + '}}' +
          '{{max( matches regex?=' + tstMatchTest + '}}' +
          '{{hardcoded eval=' + evalCustomFormula('max(charisma_mod, 1)', tstInts) + '}}' +
          '{{stored eval=' + evalCustomFormula(tstRawFormula, tstInts) + '}}' +
          '{{total stBonus=' + tstTotal + '}}');
        return;
      }

      // !aoe-debug-st [ability]  — GM only; shows raw valueFormula for Saving Throw integrants
      if (cmd === '!aoe-debug-st') {
        if (!isGM) { sendChat('AoE2024', wMe(msg) + 'GM only.'); return; }
        var stSelTok = msg.selected && msg.selected[0];
        var stCid = stSelTok ? getObj('graphic', stSelTok._id).get('represents') : null;
        if (!stCid) { sendChat('AoE2024', wMe(msg) + 'Select a token first.'); return; }
        var stAb = toks[1] || 'Constitution';
        var stStore = getStore(stCid);
        var stInts = stStore && stStore.integrants && stStore.integrants.integrants || {};
        var stLines = [];
        Object.keys(stInts).forEach(function(k) {
          var e = stInts[k];
          if (e.type === 'Saving Throw' && e.ability === stAb) {
            stLines.push((e.name || k.slice(0,8)) +
              ' enabled=' + e._enabled +
              ' | vf=' + JSON.stringify(e.valueFormula || null));
          }
        });
        sendChat('AoE2024', wMe(msg) +
          '&{template:default}{{name=' + cName(stCid) + ' — ST ' + stAb + '}}' +
          '{{entries=' + (stLines.join('<br>') || 'none') + '}}');
        return;
      }

      // !aoe-debug-defenses  — GM only, select target token; shows resistance/immunity data
      if (cmd === '!aoe-debug-defenses') {
        if (!isGM) { sendChat('AoE2024', wMe(msg) + 'GM only.'); return; }
        var defSelTok = msg.selected && msg.selected[0];
        var defCid = defSelTok ? getObj('graphic', defSelTok._id).get('represents') : null;
        if (!defCid) { sendChat('AoE2024', wMe(msg) + 'Select a token first.'); return; }
        var defStore = getStore(defCid);
        var defAppSt = getAppState(defCid);
        if (!defStore) { sendChat('AoE2024', wMe(msg) + 'No store found.'); return; }

        // 1. Top-level keys of the store (to find any section we missed)
        var defStoreKeys = Object.keys(defStore).join(', ');

        // 2. Full store.npc dump (as JSON, trimmed to avoid overflow)
        var defNpc = defStore.npc || {};
        var defNpcJson = JSON.stringify(defNpc);
        // Send npc JSON as a separate raw whisper so template doesn't truncate it
        sendChat('AoE2024', '/w gm [defenses] store keys: ' + defStoreKeys);
        sendChat('AoE2024', '/w gm [defenses] store.npc = ' + defNpcJson);

        // 3. All integrants whose name or type contains resist/immun/magic
        var defInts = defStore.integrants && defStore.integrants.integrants || {};
        var defRelInts = [];
        Object.keys(defInts).forEach(function(k) {
          var e = defInts[k];
          var combo = ((e.type||'') + '|' + (e.name||'') + '|' + (e.description||'')).toLowerCase();
          if (combo.indexOf('resist') !== -1 || combo.indexOf('immun') !== -1 || combo.indexOf('magic') !== -1) {
            defRelInts.push('[' + (e._enabled ? 'ON' : 'off') + '] ' + (e.type||'?') + ' — ' + (e.name||'(unnamed)'));
          }
        });
        sendChat('AoE2024', '/w gm [defenses] relevant integrants: ' + (defRelInts.join(' | ') || 'none'));
        return;
      }

      // !aoe-detonate <cid>
      if (cmd === '!aoe-detonate') {
        if (!toks[1]) { sendChat('AoE2024', wMe(msg) + 'Usage: !aoe-detonate <cid>'); return; }
        detonateAoE(msg, toks[1]);
        return;
      }

      // !aoe-setdc <spell_slug> <new_dc>  (use underscores for spaces)
      if (cmd === '!aoe-setdc') {
        if (!toks[1] || !toks[2]) {
          sendChat('AoE2024', wMe(msg) + 'Usage: !aoe-setdc <Spell_Name> <DC>');
          return;
        }
        var selTok = msg.selected && msg.selected[0];
        if (!selTok) { sendChat('AoE2024', wMe(msg) + 'Select your character token first.'); return; }
        var selGfx = getObj('graphic', selTok._id);
        if (!selGfx) { sendChat('AoE2024', wMe(msg) + 'Token not found.'); return; }
        var selCid   = selGfx.get('represents');
        var dcSpellName = toks[1].replace(/_/g, ' ');
        var dcMacroName = dcSpellName + '-AoE';
        var dcNewVal    = parseInt(toks[2]);
        if (isNaN(dcNewVal) || dcNewVal < 1) { sendChat('AoE2024', wMe(msg) + 'DC must be a positive number.'); return; }
        var abilities = findObjs({ _type:'ability', _characterid:selCid, name:dcMacroName });
        if (!abilities.length) {
          sendChat('AoE2024', wMe(msg) + 'No macro named "' + dcMacroName + '" found. Run !aoe-build first.');
          return;
        }
        var ab = abilities[0];
        var atoks = tokenize(ab.get('action'));
        // action format: !aoe-cast <cid> "<name>" <saveAb> <dc> <dice> <size> <type> <half> <level> <shape> <radius> <upcast>
        if (atoks.length < 13) { sendChat('AoE2024', wMe(msg) + 'Macro looks malformed — rebuild with !aoe-build.'); return; }
        atoks[4] = String(dcNewVal);
        var newAction = [atoks[0], atoks[1], '"' + atoks[2] + '"',
                         atoks[3], atoks[4]].concat(atoks.slice(5)).join(' ');
        ab.set('action', newAction);
        sendChat('AoE2024', wMe(msg) + '✅ **' + dcSpellName + '** save DC updated to **' + dcNewVal + '**.');
        return;
      }
    });
  });

  return { version: VERSION };
}());

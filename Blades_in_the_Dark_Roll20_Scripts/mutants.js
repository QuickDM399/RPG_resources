'use strict';
// Deliberately breaks "BitD Generators.js" one line at a time and checks that mock_test_gen.js
// FAILS for each break. A mutant that still passes means the tests would not catch that bug.
//
// Run:   node mutants.js
// (set NODE_PATH to a folder containing acorn if you want the ES5 parse check to run in each)

const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

const SCRIPT = path.join(__dirname, 'BitD Generators.js');
const SRC = fs.readFileSync(SCRIPT, 'utf8');
const TEST = path.join(__dirname, 'mock_test_gen.js');

// { name, from, to, nth } : replace the nth (default 1st) occurrence of "from" with "to"
const MUTANTS = [
  { name: 'ghost: sort dice ascending (take lowest, not highest)', from: 'return b - a;', to: 'return a - b;' },
  { name: 'ghost: column uses the highest die, not the second highest', from: 'col = dice[1];', to: 'col = dice[0];' },
  { name: 'ghost: years rolled on a d6 instead of a d20', from: 'var v = die(20);', to: 'var v = die(6);' },
  { name: 'ghost: years limit raised from 100 to 200', from: 'var MAX_YEARS = 100;', to: 'var MAX_YEARS = 200;' },
  { name: 'ghost: re-rolling years no longer re-rolls the trait', from: "if (card.gen === 'ghost' && line.key === 'years') {", to: 'if (false) {' },
  { name: 'd66: tens and units swapped', from: 'arr[(a - 1) * 6 + (b - 1)]', to: 'arr[(b - 1) * 6 + (a - 1)]' },
  { name: 'ranged rows: row chosen with the column die', from: 'ri = t.die[r - 1]', to: 'ri = t.die[c - 1]' },
  { name: 'A OR B: sides swapped', from: 'text: s === 1 ? row.a : row.b,', to: 'text: s === 1 ? row.b : row.a,' },
  { name: 'twist: a d4 of 3 gives two complications', from: 'if (g <= 3) { return [twistOne(g, \'d4 \' + g)]; }', to: 'if (g <= 2) { return [twistOne(g, \'d4 \' + g)]; }' },
  { name: 'twist: duplicate second complication kept', from: 'while (b.text === a.text && tries < MAX_TRIES) {\n            l2', to: 'while (false) {\n            l2' },
  { name: 'connected: duplicate second result kept', from: 'while (b.text === a.text && tries < MAX_TRIES) { b = pickList(', to: 'while (false) { b = pickList(' },
  { name: 'faction: a d4 of 4 gives only one', from: "a.dice = 'd4 ' + g + (g === 4 ? ' (two), ' : ', ') + a.dice;\n            if (g <= 3) { return [a]; }\n            var b = pickD66", to: "a.dice = 'd4 ' + g + (g === 4 ? ' (two), ' : ', ') + a.dice;\n            if (g <= 4) { return [a]; }\n            var b = pickD66" },
  { name: 'Ghost of (roll again): nesting limit lowered', from: 'it.text === GHOST_OF && depth < 3', to: 'it.text === GHOST_OF && depth < 2' },
  { name: 'gender: Roll Again is not rolled again', from: '} while (gv === ROLL_AGAIN && tries < MAX_TRIES);', to: '} while (false);' },
  { name: 'looks: the second look also gets a gender', from: 'if (items.length === 0) {\n                do {', to: 'if (true) {\n                do {' },
  { name: 'heritage: Foreigner and Akorosi swapped', from: 'if (v !== FOREIGNER) {', to: 'if (v === FOREIGNER) {' },
  { name: 'items: the 4-item list rolled on a d6', from: 'r = die(list.length);', to: 'r = die(6);' },
  { name: 'props: list chosen on a d6 instead of a d9', from: 'var lists = DATA.streets.props, l = die(lists.length)', to: 'var lists = DATA.streets.props, l = die(6)' },
  { name: 'permissions: GM check removed', from: 'if (!playerIsGM(msg.playerid)) { refuse(msg); return; }', to: 'if (false) { refuse(msg); return; }' },
  { name: 'refusal: quotes in the player name not stripped', from: ".replace(/\"/g, '');\n    }\n\n    // ---", to: ";\n    }\n\n    // ---" },
  { name: 'html: ampersand not escaped', from: ".replace(/&/g, '&amp;')", to: ".replace(/&/g, '&')" },
  { name: 'html: a button command may contain a quote', from: "if (command.indexOf('\"') !== -1) { throw new Error('button command contains a quote: ' + command); }", to: '' },
  { name: '+ button: duplicates not re-rolled', from: '} while (dup && tries < MAX_TRIES);', to: '} while (false);' },
  { name: 'state: card limit off by one', from: 'while (st.order.length > MAX_CARDS) {', to: 'while (st.order.length > MAX_CARDS + 1) {' },
  { name: 'mode: public mode ignored', from: "(st.mode === 'public' ? '/direct ' : '/w gm ')", to: "'/w gm '" },
  { name: 'share: posted as a whisper', from: "sendChat(SENDER, '/direct ' + renderCard(card, false, 'shared'));", to: "sendChat(SENDER, '/w gm ' + renderCard(card, false, 'shared'));" },
  { name: 'macro: made visible to everyone', from: "visibleto: ''", to: "visibleto: 'all'" },
  { name: 'macro: stale action not repaired', from: "if (m.get('action') !== action) {", to: 'if (false) {' },
  { name: 'state: other-schema state keeps its cards', from: 'nextId: 1, cards: {}, order: []', to: 'nextId: 1, cards: (s && s.cards) || {}, order: (s && s.order) || []' },
  { name: 'dice: a hidden extra die is rolled for the name', from: "defLine('npc', 'name', 'Name', { repeatable: true, roll: function () { return pickList(DATA.people.names); } });", to: "defLine('npc', 'name', 'Name', { repeatable: true, roll: function () { die(6); return pickList(DATA.people.names); } });" },
  { name: 'data: two Ghost Traits cells swapped', from: '"Jealous","Desperate"', to: '"Desperate","Jealous"' },
  { name: 'data: a spelling fix not applied', from: '"The Cloud of Woe"', to: '"Thew Cloud of Woe"' },
  { name: 'data: a name pool entry changed', from: '"Booker. Ankhayat"', to: '"Booker","Ankhayat"' },
  { name: 'data: Rumor row 4 option B left empty', from: 'The Church of the Ecstasy of the Flesh is seeking a new Apex.', to: '' },
  { name: 'data: a range label die map changed (Use 1-3 / 4,5 / 6)', from: '"die":[0,0,0,1,1,2],"rows":[["Residential"', to: '"die":[0,0,1,1,1,2],"rows":[["Residential"' },
  { name: 'rumor flip does nothing', from: 'var t = it.text; it.text = it.other; it.other = t;', to: '' },
  { name: 'job variant toggle always common', from: 'line.variant = line.variant === def.variants[0] ? def.variants[1] : def.variants[0];', to: 'line.variant = def.variants[0];' }
];

function nthIndex(s, sub, n) { let i = -1; for (let k = 0; k < n; k++) { i = s.indexOf(sub, i + 1); if (i < 0) { return -1; } } return i; }

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bitdgen-mut-'));
const tmp = path.join(dir, 'mutant.js');
let survived = 0, caught = 0, broken = 0;
const rows = [];
MUTANTS.forEach((m, k) => {
  const i = nthIndex(SRC, m.from, m.nth || 1);
  if (i < 0) { broken++; rows.push(['NOT APPLIED', m.name]); return; }
  fs.writeFileSync(tmp, SRC.slice(0, i) + m.to + SRC.slice(i + m.from.length));
  const r = cp.spawnSync(process.execPath, [TEST, tmp], { encoding: 'utf8', timeout: 120000, env: Object.assign({}, process.env) });
  const last = (r.stdout || '').trim().split('\n').pop();
  if (r.status !== 0) { caught++; rows.push(['caught', m.name, last]); } else { survived++; rows.push(['SURVIVED', m.name, last]); }
});
rows.forEach(r => console.log((r[0] + '          ').slice(0, 11) + r[1] + (r[2] ? '   [' + r[2] + ']' : '')));
console.log('\n' + MUTANTS.length + ' deliberate breaks: ' + caught + ' caught by the tests, ' + survived + ' survived, ' + broken + ' did not apply');
fs.rmSync(dir, { recursive: true, force: true });
process.exit(survived || broken ? 1 : 0);

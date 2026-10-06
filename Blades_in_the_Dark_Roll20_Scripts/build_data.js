'use strict';
// Build step for "BitD Generators.js".
//
// Reads "Generator handouts.md" (the verified snapshot of the five Generators
// handouts), checks it, and writes the script's data block between
//   // BEGIN GENERATED DATA   and   // END GENERATED DATA
// so that no table cell is typed by hand.
//
// Usage:
//   node build_data.js            parse, verify, write the data block into the script
//   node build_data.js --check    parse, verify, and fail if the script's data block is stale
//
// What it verifies (any failure stops the build, nothing is written):
//   1. Each handout block's length and checksum equal the values printed in the data file.
//   2. Every table's row and cell counts equal its "*Table N: R rows x C columns*" line.
//   3. Every list has the expected number of items and numbered lists count 1..N.
//   4. The document structure (headings, tables, lists) is exactly the expected order.
//   5. The user-approved readings (Style items, Demon Features items) contain exactly the
//      words of the handout paragraph, in order, so nothing was lost or invented.
//   6. Each approved spelling fix matches exactly the expected number of places.
//   7. The verified examples from the handoff (Ghost Traits rows 1, 3, 6; Looks row 1;
//      Goals row "1, 2"; Demon Types Affinity).

var fs = require('fs');
var path = require('path');

var DATA_FILE = path.join(__dirname, 'Generator handouts.md');
var SCRIPT_FILE = path.join(__dirname, 'BitD Generators.js');
var BEGIN = '    // BEGIN GENERATED DATA';
var END = '    // END GENERATED DATA';

var SNAPSHOT_DATE = '2026-10-05';

// ---------------------------------------------------------------------------
// Decisions made by the user (these are not in the handouts)
// ---------------------------------------------------------------------------

// People > Style: the handout gives one run of words with no separators. This is the
// 37-item split the user approved. Step 5 proves it uses exactly the handout's words.
var STYLE_ITEMS = [
  'Tricorn Hat', 'Long Coat', 'Hood & Veil', 'Short Cloak', 'Knit Cap', 'Slim Jacket',
  'Hooded Coat', 'Tall Boots', 'Work Boots', 'Mask & Robes', 'Suit & Vest', 'Collared Shirt',
  'Suspenders', 'Rough Tunic', 'Skirt & Blouse', 'Wide Belt', 'Fitted Dress', 'Heavy Cloak',
  'Thick Greatcoat', 'Soft Boots', 'Loose Silks', 'Sharp Trousers', 'Waxed Coat', 'Long Scarf',
  'Leathers', 'Eelskin Bodysuit', 'Hide & Furs', 'Uniform', 'Tatters', 'Fitted Leggings',
  'Apron', 'Heavy Gloves', 'Face Mask', 'Tool Belt', 'Crutches', 'Cane', 'Wheelchair'
];

// Devils > Demon Features: the commas in the handout paragraph do not mark item boundaries
// reliably. This is the 19-item reading the user approved. Step 5 proves the words match.
var FEATURE_ITEMS = [
  'Black shark eyes',
  'Scales (onyx, iridescent, crystalline, metallic, etc.)',
  'Razor-sharp claws',
  'Bony protrusions',
  'Multiple eyes',
  'Lashing tail',
  'Leathery wings',
  'Spines',
  'Dripping ichor',
  'Glowing eyes or markings',
  'Hair or fur (drifting as if underwater, burning with a cool fire, etc.)',
  'Feathers',
  'Multiple arms',
  'Tentacles',
  'Hard shell, metallic plates',
  'Lights dim or flare',
  'Plants wither or grow wildly',
  'Mechanisms grind to a stop',
  'Liquid freezes, boils, turns to blood or ashes'
];

// Spelling fixes the user approved. "expect" is the exact number of places each must hit.
// Names (People > Names) are deliberately NOT touched: the user said they are not typos.
var FIXES = [
  { from: 'annointed', to: 'anointed', expect: 2 },
  { from: 'Thew Cloud of Woe', to: 'The Cloud of Woe', expect: 1 },
  { from: 'acoylyte', to: 'acolyte', expect: 2 },
  { from: 'sewing the seeds', to: 'sowing the seeds', expect: 1 },
  { from: 'Stairs, Ramps. Terraces', to: 'Stairs, Ramps, Terraces', expect: 1 },
  { from: 'Ecstacy', to: 'Ecstasy', expect: 2 }
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fail(msg) { throw new Error('BUILD FAILED: ' + msg); }
function assert(cond, msg) { if (!cond) { fail(msg); } }

function checksum(s) {
  var h = 0, i;
  for (i = 0; i < s.length; i++) { h = ((h << 5) - h + s.charCodeAt(i)) | 0; }
  return h;
}

function stripItalic(s) {
  var m = /^\*(.*)\*(\.?)$/.exec(s);
  assert(m, 'not an italic line: ' + s);
  return m[1] + m[2];
}

// ---------------------------------------------------------------------------
// Step 1: handout blocks and their checksums
// ---------------------------------------------------------------------------

function readHandouts(text) {
  var out = {}, order = [];
  var re = /^\| (.+?) \| `(.+?)` \| ([\d,]+) \| (-?\d+), (-?\d+) \|$/gm, m;
  while ((m = re.exec(text))) {
    out[m[1]] = { name: m[1], id: m[2], size: parseInt(m[3].replace(/,/g, ''), 10), chars: parseInt(m[4], 10), sum: parseInt(m[5], 10) };
    order.push(m[1]);
  }
  assert(order.length === 5, 'expected 5 handouts in the header table, found ' + order.length);
  order.forEach(function (name) {
    var b = '<!-- BEGIN HANDOUT ' + name + ' -->\n', e = '<!-- END HANDOUT ' + name + ' -->';
    var i = text.indexOf(b), j = text.indexOf(e);
    assert(i >= 0 && j > i, 'markers for ' + name + ' not found');
    var body = text.slice(i + b.length, j);
    assert(body.length === out[name].chars, name + ': length ' + body.length + ' != ' + out[name].chars);
    assert(checksum(body) === out[name].sum, name + ': checksum ' + checksum(body) + ' != ' + out[name].sum);
    out[name].body = body;
  });
  return { map: out, order: order };
}

// ---------------------------------------------------------------------------
// Step 2: Markdown to a flat list of items
// ---------------------------------------------------------------------------

function splitCells(line) {
  var s = line.trim();
  assert(s.charAt(0) === '|' && s.charAt(s.length - 1) === '|', 'bad table line: ' + line);
  return s.slice(1, -1).split('|').map(function (c) { return c.trim(); });
}

function parseBlock(body) {
  var lines = body.split('\n'), items = [], i = 0, m;
  while (i < lines.length) {
    var line = lines[i];
    if (/^\s*$/.test(line)) { i++; continue; }
    if ((m = /^(#{1,6}) (.+)$/.exec(line))) { items.push({ t: 'h', level: m[1].length, text: m[2] }); i++; continue; }
    if (line.trim() === '---') { items.push({ t: 'hr' }); i++; continue; }
    if ((m = /^\*Table (\d+): (\d+) rows x (\d+) columns, (.+)\*$/.exec(line))) {
      var tbl = { t: 'table', n: +m[1], rows: +m[2], cols: +m[3], headerless: /NO header row/.test(m[4]) };
      i++;
      while (/^\s*$/.test(lines[i])) { i++; }
      var tl = [];
      while (i < lines.length && lines[i].charAt(0) === '|') { tl.push(lines[i]); i++; }
      assert(tl.length >= 3, 'table ' + tbl.n + ' too short');
      assert(/^\|( --- \|)+$/.test(tl[1].trim()) || /^\| --- /.test(tl[1]), 'table ' + tbl.n + ' has no separator row');
      tbl.header = splitCells(tl[0]);
      tbl.body = tl.slice(2).map(splitCells);
      items.push(tbl);
      continue;
    }
    if ((m = /^\*Note: (.*)\*$/.exec(line))) { items.push({ t: 'note', text: m[1] }); i++; continue; }
    if (/^\s*- /.test(line)) {
      var bl = [];
      while (i < lines.length && /^\s*- /.test(lines[i])) { bl.push(lines[i].replace(/^\s*- /, '')); i++; }
      items.push({ t: 'ul', items: bl });
      continue;
    }
    if (/^\d+\. /.test(line)) {
      var nl = [];
      while (i < lines.length && /^\d+\. /.test(lines[i])) { nl.push(/^(\d+)\. (.*)$/.exec(lines[i])); i++; }
      nl.forEach(function (x, k) { assert(+x[1] === k + 1, 'numbered list out of sequence near: ' + x[0]); });
      items.push({ t: 'ol', items: nl.map(function (x) { return x[2]; }) });
      continue;
    }
    if (/^\*.*\*\.?$/.test(line)) { items.push({ t: 'i', text: stripItalic(line) }); i++; continue; }
    items.push({ t: 'p', text: line }); i++;
  }
  return items;
}

// A strict cursor: the build fails if the document is not in exactly the expected order.
function Cursor(items, name) { this.items = items; this.i = 0; this.name = name; }
Cursor.prototype.take = function (t, pred, what) {
  var it = this.items[this.i];
  if (!it || it.t !== t || (pred && !pred(it))) { fail(this.name + ': expected ' + what + ' at item ' + this.i + ', got ' + JSON.stringify(it)); }
  this.i++;
  return it;
};
Cursor.prototype.h = function (level, text) { return this.take('h', function (x) { return x.level === level && x.text === text; }, 'heading ' + level + ' "' + text + '"'); };
Cursor.prototype.p = function (text) { return this.take('p', text === undefined ? null : function (x) { return x.text === text; }, 'paragraph ' + (text || '')); };
Cursor.prototype.italic = function (text) { return this.take('i', text === undefined ? null : function (x) { return x.text === text; }, 'italic ' + (text || '')); };
Cursor.prototype.ul = function (n) { var x = this.take('ul', function (y) { return n === undefined || y.items.length === n; }, 'bullet list of ' + n); return x.items; };
Cursor.prototype.ol = function (n) { var x = this.take('ol', function (y) { return n === undefined || y.items.length === n; }, 'numbered list of ' + n); return x.items; };
Cursor.prototype.hr = function () { return this.take('hr', null, 'rule'); };
Cursor.prototype.note = function () { return this.take('note', null, 'note'); };
Cursor.prototype.table = function (n) {
  var t = this.take('table', function (x) { return x.n === n; }, 'table ' + n);
  var cols = t.cols, bodyRows = t.body.length;
  assert(t.header.length === cols, this.name + ' table ' + n + ': header has ' + t.header.length + ' cells, expected ' + cols);
  t.body.forEach(function (r, k) { assert(r.length === cols, this.name + ' table ' + n + ' row ' + (k + 1) + ': ' + r.length + ' cells, expected ' + cols); }, this);
  if (t.headerless) {
    assert(t.header.every(function (c) { return c === ''; }), this.name + ' table ' + n + ': headerless table has header text');
    assert(bodyRows === t.rows, this.name + ' table ' + n + ': ' + bodyRows + ' data rows, expected ' + t.rows);
  } else {
    assert(bodyRows + 1 === t.rows, this.name + ' table ' + n + ': ' + (bodyRows + 1) + ' rows incl. header, expected ' + t.rows);
  }
  return t;
};
Cursor.prototype.done = function () { assert(this.i === this.items.length, this.name + ': ' + (this.items.length - this.i) + ' unexpected items left at the end'); };

// ---------------------------------------------------------------------------
// Step 3: table and label helpers
// ---------------------------------------------------------------------------

function labelDice(label) {
  var m, out = [], a, b, k;
  if ((m = /^([1-6])-([1-6])$/.exec(label))) { a = +m[1]; b = +m[2]; for (k = a; k <= b; k++) { out.push(k); } return out; }
  assert(/^[1-6](\s*,\s*[1-6])*$/.test(label), 'bad dice label "' + label + '"');
  label.split(',').forEach(function (x) { out.push(+x.trim()); });
  return out;
}

// labels like "1-3", "4,5", "6" -> die[d-1] = row index; every d in 1..6 covered exactly once
function dieMap(labels, what) {
  var die = [0, 0, 0, 0, 0, 0], seen = {};
  labels.forEach(function (lab, idx) {
    labelDice(lab).forEach(function (d) {
      assert(!seen[d], what + ': die face ' + d + ' used twice');
      seen[d] = true; die[d - 1] = idx;
    });
  });
  for (var d = 1; d <= 6; d++) { assert(seen[d], what + ': die face ' + d + ' not covered'); }
  return die;
}

function headerIs(t, expected, what) {
  assert(JSON.stringify(t.header) === JSON.stringify(expected), what + ': unexpected header ' + JSON.stringify(t.header));
}
var H6 = ['', '1', '2', '3', '4', '5', '6'];

// 6 rows labelled 1..6 by 6 columns
function grid6(t, what) {
  headerIs(t, H6, what);
  assert(t.body.length === 6, what + ': expected 6 rows');
  return t.body.map(function (r, k) { assert(r[0] === String(k + 1), what + ': row label ' + r[0] + ' at row ' + (k + 1)); return r.slice(1); });
}

// rows with range labels ("1-3", "4,5", "6" or "1, 2" ...) by 6 columns
function ranged(t, what, nRows) {
  headerIs(t, H6, what);
  assert(t.body.length === nRows, what + ': expected ' + nRows + ' rows');
  var labels = t.body.map(function (r) { return r[0]; });
  return { labels: labels, die: dieMap(labels, what), rows: t.body.map(function (r) { return r.slice(1); }) };
}

// d66 label "1 1" or "11" -> index 0..35 (first digit = first die)
function d66Index(label, what) {
  var m = /^([1-6]) ?([1-6])$/.exec(label);
  assert(m, what + ': bad d66 label "' + label + '"');
  return (+m[1] - 1) * 6 + (+m[2] - 1);
}

// 36 rows labelled as d66; returns one array per data column, in d66 order
function d66Columns(rows, what, nCols) {
  assert(rows.length === 36, what + ': expected 36 rows, found ' + rows.length);
  var cols = [], k, c;
  for (c = 0; c < nCols; c++) { cols.push(new Array(36)); }
  rows.forEach(function (r) {
    var idx = d66Index(r[0], what);
    for (c = 0; c < nCols; c++) { assert(cols[c][idx] === undefined, what + ': duplicate d66 label ' + r[0]); cols[c][idx] = r[c + 1]; }
  });
  for (c = 0; c < nCols; c++) { for (k = 0; k < 36; k++) { assert(cols[c][k] !== undefined, what + ': d66 label missing at index ' + k); } }
  return cols;
}

// bullets "label: value"
function labelled(items, what) {
  var labels = [], values = [];
  items.forEach(function (s) {
    var m = /^([\d,\-\s]+): (.+)$/.exec(s);
    assert(m, what + ': bad labelled item "' + s + '"');
    labels.push(m[1].trim()); values.push(m[2]);
  });
  return { labels: labels, die: dieMap(labels, what), items: values };
}

// bullets "N text" where N counts 1..n (Scores)
function numbered(items, what) {
  return items.map(function (s, k) {
    var m = /^(\d+) (.+)$/.exec(s);
    assert(m && +m[1] === k + 1, what + ': item ' + (k + 1) + ' is "' + s + '"');
    return m[2];
  });
}

function splitList(paragraph, what) {
  var parts = paragraph.split(', ').map(function (s) { return s.trim(); });
  var last = parts.length - 1;
  if (/\.$/.test(parts[last])) { parts[last] = parts[last].slice(0, -1); }
  parts.forEach(function (s) { assert(s.length > 0, what + ': empty item'); });
  return parts;
}

// "A OR B" rows: label, A, OR, B (possibly with empty padding cells in between or after)
function orRows(t, what) {
  assert(t.body.length === 6, what + ': expected 6 rows');
  return t.body.map(function (r, k) {
    assert(r[0] === String(k + 1), what + ': row label ' + r[0]);
    var cells = r.slice(1).filter(function (c) { return c !== ''; });
    assert(cells.length === 3 && cells[1] === 'OR', what + ' row ' + (k + 1) + ': expected A, OR, B but found ' + JSON.stringify(cells));
    return { a: cells[0], b: cells[2] };
  });
}

// ---------------------------------------------------------------------------
// Step 4: assemble the data
// ---------------------------------------------------------------------------

function words(s) { return s.replace(/,/g, '').split(/\s+/).filter(function (w) { return w.length > 0; }); }

function buildPeople(items) {
  var c = new Cursor(items, 'People');
  c.h(4, 'Looks');
  var gender = labelled(c.ul(4), 'People gender');
  var looks = grid6(c.table(1), 'People Looks');
  c.h(4, 'Heritage');
  var heritage = labelled(c.ul(2), 'People heritage');
  c.h(5, 'Foreigners');
  var foreigners = labelled(c.ul(5), 'People foreigners');
  var tycherosiNote = c.italic().text;
  c.h(4, 'Style');
  var styleParagraph = c.p().text;
  assert(STYLE_ITEMS.join(' ') === styleParagraph, 'Style items do not reproduce the handout paragraph word for word');
  c.h(4, 'Goals');
  var goals = ranged(c.table(2), 'People Goals', 3);
  c.p('Preferred Methods');
  var methods = ranged(c.table(3), 'People Preferred Methods', 3);
  c.p('Professions: Common');
  var jobsCommon = grid6(c.table(4), 'People Professions Common');
  c.h(4, 'Professions: Rare');
  var jobsRare = grid6(c.table(5), 'People Professions Rare');
  var t6 = c.table(6);
  headerIs(t6, ['Roll 2d6', 'Traits', 'Interests', 'Quirks'], 'People Traits table');
  var tiq = d66Columns(t6.body, 'People Traits table', 3);
  c.p('Names');
  var n1 = splitList(c.p().text, 'Names 1'), n2 = splitList(c.p().text, 'Names 2'), n3 = splitList(c.p().text, 'Names 3');
  c.done();
  assert(n1.length === 83 && n2.length === 48 && n3.length === 39, 'Names: expected 83 + 48 + 39, found ' + n1.length + ' + ' + n2.length + ' + ' + n3.length);
  return {
    gender: gender, looks: looks, heritage: heritage, foreigners: foreigners, tycherosiNote: tycherosiNote,
    style: STYLE_ITEMS.slice(), goals: goals, methods: methods, jobsCommon: jobsCommon, jobsRare: jobsRare,
    traits: tiq[0], interests: tiq[1], quirks: tiq[2],
    names: n1.concat(n2, n3)
  };
}

function buildDevils(items) {
  var c = new Cursor(items, 'Devils');
  c.h(2, 'Devils');
  c.h(4, 'Ghost Traits');
  c.italic('Row: Roll 1d per year of ghostly existence, take highest');
  var ghostTraits = grid6(c.table(1), 'Devils Ghost Traits');
  c.h(4, 'Ghostly Secondary Effects');
  var ghostEffects = ranged(c.table(2), 'Devils Ghostly Secondary Effects', 3);
  c.h(4, 'Demon Types');
  var t3 = c.table(3);
  headerIs(t3, H6, 'Devils Demon Types');
  assert(t3.body.length === 2 && t3.body[0][0] === 'Affinity' && t3.body[1][0] === 'Aspect', 'Demon Types rows');
  var affinity = t3.body[0].slice(1), aspect = t3.body[1].slice(1);
  c.h(4, 'Demon Desires');
  c.p();
  var desires = ranged(c.table(4), 'Devils Demon Desires', 3);
  c.h(4, 'Summoned Horrors');
  var horrors = grid6(c.table(5), 'Devils Summoned Horrors');
  c.h(4, 'Demon Names');
  var demonNames = c.p().text.split(', ').map(function (s) { return s.trim(); });
  c.h(4, 'Demon Features');
  var featureParagraph = c.p().text;
  // the paragraph ends with a list-terminating period, which is not part of the last item
  assert(/\.$/.test(featureParagraph), 'Demon Features paragraph no longer ends with a period');
  assert(JSON.stringify(words(FEATURE_ITEMS.join(' '))) === JSON.stringify(words(featureParagraph.slice(0, -1))), 'Demon Features items do not reproduce the handout paragraph word for word');
  c.h(4, 'Forgotten Gods and Cult Practices');
  c.p();
  var t6 = c.table(6);
  var gp = d66Columns(t6.body, 'Devils Forgotten Gods', 2);
  c.done();
  assert(demonNames.length === 17, 'Demon Names: expected 17, found ' + demonNames.length);
  return {
    ghostTraits: ghostTraits, ghostEffects: ghostEffects, affinity: affinity, aspect: aspect, desires: desires,
    horrors: horrors, demonNames: demonNames, features: FEATURE_ITEMS.slice(), gods: gp[0], practices: gp[1]
  };
}

function buildStreets(items) {
  var c = new Cursor(items, 'Streets & Buildings');
  c.h(3, 'Streets');
  c.h(4, 'Mood');
  var mt = c.table(1);
  assert(mt.body.length === 6, 'Mood rows');
  var mood = mt.body.map(function (r, k) { assert(r[0] === String(k + 1), 'Mood label'); return r[1]; });
  c.h(4, 'Impressions');
  c.italic('(Typical of Doskvol)');
  var it = c.table(2);
  headerIs(it, ['', 'Sights', 'Sounds', 'Smells'], 'Streets Impressions');
  assert(it.body.length === 6, 'Impressions rows');
  var sights = [], sounds = [], smells = [];
  it.body.forEach(function (r, k) { assert(r[0] === String(k + 1), 'Impressions label'); sights.push(r[1]); sounds.push(r[2]); smells.push(r[3]); });
  c.h(4, 'Use');
  c.italic('(Many streets have multiple uses)');
  var use = ranged(c.table(3), 'Streets Use', 3);
  c.h(4, 'Type');
  var type = ranged(c.table(4), 'Streets Type', 3);
  c.h(4, 'Details');
  var sdetails = grid6(c.table(5), 'Streets Details');
  c.h(4, 'Props');
  var props = [], k;
  for (k = 0; k < 9; k++) { props.push(c.ol(6)); }
  c.h(3, 'Buildings');
  c.h(4, 'Exterior');
  c.italic('Some buildings have multiple exterior elements');
  var et = c.table(6);
  headerIs(et, H6, 'Buildings Exterior');
  assert(et.body.length === 2 && et.body[0][0] === 'Material' && et.body[1][0] === 'Details', 'Exterior rows');
  var material = et.body[0].slice(1), exterior = et.body[1].slice(1);
  c.h(4, 'Use: Common');
  c.italic('Many buildings have multiple uses');
  var useCommon = grid6(c.table(7), 'Buildings Use Common');
  c.h(4, 'Use: Rare');
  c.italic('Many buildings have multiple uses');
  var useRare = grid6(c.table(8), 'Buildings Use Rare');
  c.h(4, 'Details');
  var bdetails = grid6(c.table(9), 'Buildings Details');
  c.h(4, 'Items');
  var bitems = [c.ol(6), c.ol(6), c.ol(6), c.ol(6), c.ol(4)];
  c.done();
  return {
    streets: { mood: mood, sights: sights, sounds: sounds, smells: smells, use: use, type: type, details: sdetails, props: props },
    buildings: { material: material, exterior: exterior, useCommon: useCommon, useRare: useRare, details: bdetails, items: bitems }
  };
}

function buildScores(items) {
  var c = new Cursor(items, 'Scores');
  c.h(2, 'Scores');
  function groups(names, what) {
    var lists = names.map(function (n) { c.h(4, n); return numbered(c.ul(6), what + ' ' + n); });
    return { names: names, lists: lists };
  }
  c.h(3, 'Client / Target');
  var clientTarget = groups(['Civilian', 'Criminal', 'Political', 'Strange'], 'Client');
  c.h(3, 'Work');
  var work = groups(['Skullduggery', 'Violence', 'Underworld', 'Unnatural'], 'Work');
  c.h(3, 'Twist or Complication');
  var twist = [numbered(c.ul(6), 'Twist 1')]; c.hr();
  twist.push(numbered(c.ul(6), 'Twist 2')); c.hr();
  twist.push(numbered(c.ul(6), 'Twist 3'));
  c.h(3, 'Connected to A Person...');
  var connected = numbered(c.ul(6), 'Connected');
  // the note is italic with the closing period outside the asterisks: "*...in some way*."
  var connectedNote = c.italic().text;
  c.h(3, '... and Factions');
  c.italic('(Roll 2d6)');
  var fl = c.ul(36);
  var factions = new Array(36);
  fl.forEach(function (s) {
    var m = /^([1-6][1-6]) (.+)$/.exec(s);
    assert(m, 'Factions: bad item "' + s + '"');
    var idx = d66Index(m[1], 'Factions');
    assert(factions[idx] === undefined, 'Factions: duplicate ' + m[1]);
    factions[idx] = m[2];
  });
  factions.forEach(function (f, k) { assert(f !== undefined, 'Factions: missing index ' + k); });
  c.done();
  return { clientTarget: clientTarget, work: work, twist: twist, connected: connected, connectedNote: connectedNote, factions: factions };
}

function buildRumors(items) {
  var c = new Cursor(items, 'Rumors');
  c.h(2, 'Overheard in Duskwall');
  var groups = [[]];
  while (c.items[c.i] && (c.items[c.i].t === 'i' || c.items[c.i].t === 'hr')) {
    var it = c.items[c.i++];
    if (it.t === 'hr') { groups.push([]); } else { groups[groups.length - 1].push(it.text); }
  }
  if (groups[groups.length - 1].length === 0) { groups.pop(); }
  groups.forEach(function (g, k) { assert(g.length > 0, 'Overheard exchange ' + (k + 1) + ' is empty'); });
  assert(groups.length === 8, 'Overheard: expected 8 exchanges, found ' + groups.length);
  c.h(4, 'Rumors on The Street');
  var streetNote = c.italic().text;
  var rst = c.table(1);
  c.note();
  var street = orRows(rst, 'Rumors on The Street');
  c.h(4, 'City Events in The Newspapers');
  var newsNote = c.italic().text;
  var news = grid6(c.table(2), 'City Events');
  c.h(4, 'Remarkable Occurrences');
  var occNote = c.italic().text;
  var occurrence = orRows(c.table(3), 'Remarkable Occurrences');
  c.done();
  return { overheard: groups, street: street, streetNote: streetNote, news: news, newsNote: newsNote, occurrence: occurrence, occurrenceNote: occNote };
}

// ---------------------------------------------------------------------------
// Step 6: spelling fixes (deep walk over every string)
// ---------------------------------------------------------------------------

function applyFixes(data) {
  var report = FIXES.map(function (f) { return { from: f.from, to: f.to, count: 0, paths: [] }; });
  function walk(node, p, set) {
    if (typeof node === 'string') {
      var s = node;
      FIXES.forEach(function (f, k) {
        var n = s.split(f.from).length - 1;
        if (n > 0) { report[k].count += n; report[k].paths.push(p); s = s.split(f.from).join(f.to); }
      });
      if (s !== node) { set(s); }
    } else if (Array.isArray(node)) {
      node.forEach(function (x, i) { walk(x, p + '[' + i + ']', function (v) { node[i] = v; }); });
    } else if (node && typeof node === 'object') {
      Object.keys(node).forEach(function (key) { walk(node[key], p ? p + '.' + key : key, function (v) { node[key] = v; }); });
    }
  }
  walk(data, '', function () {});
  FIXES.forEach(function (f, k) { assert(report[k].count === f.expect, 'fix "' + f.from + '" hit ' + report[k].count + ' places, expected ' + f.expect); });
  return report;
}

// ---------------------------------------------------------------------------
// Step 7: verified examples from the handoff
// ---------------------------------------------------------------------------

function verifyExamples(D) {
  function eq(a, b, what) { assert(JSON.stringify(a) === JSON.stringify(b), 'verified example failed: ' + what + ' = ' + JSON.stringify(a)); }
  eq(D.devils.ghostTraits[0], ['Jealous', 'Desperate', 'Violent', 'Hysterical', 'Skittish', 'Fleeting'], 'Ghost Traits row 1');
  eq(D.devils.ghostTraits[2], ['Prophetic', 'Insightful', 'True', 'Revelatory', 'Guiding', 'Instructive'], 'Ghost Traits row 3');
  eq(D.devils.ghostTraits[5], ['Mad', 'Chaotic', 'Bizarre', 'Destructive', 'Insane', 'Vile'], 'Ghost Traits row 6');
  eq(D.people.looks[0], ['Large', 'Lovely', 'Weathered', 'Chiseled', 'Handsome', 'Athletic'], 'Looks row 1');
  eq(D.people.goals.rows[0], ['Wealth', 'Power', 'Authority', 'Prestige, Fame', 'Control', 'Knowledge'], 'Goals row "1, 2"');
  eq(D.people.goals.labels[0], '1, 2', 'Goals row label');
  eq(D.devils.affinity, ['Sea, Water', 'Darkness', 'Earth, Metal', 'Fire, Smoke', 'Sky, Stars', 'Storm, Wind'], 'Demon Types Affinity');
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

function asciiJson(v) {
  return JSON.stringify(v).replace(/[\u0080-￿]/g, function (c) { return '\\u' + ('0000' + c.charCodeAt(0).toString(16)).slice(-4); });
}

function buildData(text) {
  var hd = readHandouts(text);
  var blocks = {};
  hd.order.forEach(function (n) { blocks[n] = parseBlock(hd.map[n].body); });
  var sb = buildStreets(blocks['Streets & Buildings']);
  var D = {
    snapshot: SNAPSHOT_DATE,
    handouts: hd.order.map(function (n) { var h = hd.map[n]; return { name: n, id: h.id, size: h.size, chars: h.chars, sum: h.sum }; }),
    people: buildPeople(blocks.People),
    devils: buildDevils(blocks.Devils),
    streets: sb.streets,
    buildings: sb.buildings,
    scores: buildScores(blocks.Scores),
    rumors: buildRumors(blocks.Rumors)
  };
  D.fixes = applyFixes(D);
  verifyExamples(D);
  return D;
}

function dataBlock(D) {
  var keys = Object.keys(D), lines = [];
  lines.push(BEGIN);
  lines.push('    // Generated by build_data.js from "Generator handouts.md". Do not edit by hand; re-run the build.');
  lines.push('    var DATA = {');
  keys.forEach(function (k, i) { lines.push('        ' + k + ': ' + asciiJson(D[k]) + (i < keys.length - 1 ? ',' : '')); });
  lines.push('    };');
  lines.push(END);
  return lines.join('\n');
}

function report(D) {
  var n = function (a) { return a.length; };
  var rows = [
    ['People Looks (grid)', '6x6'], ['People Goals / Methods', n(D.people.goals.rows) + 'x6 / ' + n(D.people.methods.rows) + 'x6'],
    ['People Jobs common / rare', '6x6 / 6x6'], ['People Traits / Interests / Quirks', n(D.people.traits) + ' / ' + n(D.people.interests) + ' / ' + n(D.people.quirks) + ' (d66)'],
    ['People Style items', n(D.people.style)], ['People Names', n(D.people.names)],
    ['Devils Ghost Traits', '6x6'], ['Devils Secondary Effects', n(D.devils.ghostEffects.rows) + 'x6'], ['Devils Demon Desires', n(D.devils.desires.rows) + 'x6'],
    ['Devils Summoned Horrors', '6x6'], ['Devils Demon Names / Features', n(D.devils.demonNames) + ' / ' + n(D.devils.features)],
    ['Devils Gods / Practices', n(D.devils.gods) + ' / ' + n(D.devils.practices) + ' (d66)'],
    ['Streets Mood / Use / Type / Details', n(D.streets.mood) + ' / ' + n(D.streets.use.rows) + 'x6 / ' + n(D.streets.type.rows) + 'x6 / 6x6'],
    ['Streets Impressions', n(D.streets.sights) + ' rows x 3'], ['Streets Props', n(D.streets.props) + ' lists of 6'],
    ['Buildings Material / Exterior', n(D.buildings.material) + ' / ' + n(D.buildings.exterior)], ['Buildings Use common / rare / Details', '6x6 each'],
    ['Buildings Items', D.buildings.items.map(n).join(', ') + ' items per list'],
    ['Scores Client lists / Work lists / Twist lists', n(D.scores.clientTarget.lists) + ' / ' + n(D.scores.work.lists) + ' / ' + n(D.scores.twist)],
    ['Scores Connected / Factions', n(D.scores.connected) + ' / ' + n(D.scores.factions) + ' (d66)'],
    ['Rumors Overheard / Street / News / Occurrences', n(D.rumors.overheard) + ' / ' + n(D.rumors.street) + ' / 6x6 / ' + n(D.rumors.occurrence)]
  ];
  console.log('Handout checksums: all 5 match the data file.');
  console.log('Table row/cell counts: all match the "*Table N: R rows x C columns*" lines.');
  rows.forEach(function (r) { console.log('  ' + r[0] + ': ' + r[1]); });
  D.fixes.forEach(function (f) { console.log('  fix "' + f.from + '" -> "' + f.to + '": ' + f.count + ' place(s) at ' + f.paths.join(', ')); });
}

function main() {
  var text = fs.readFileSync(DATA_FILE, 'utf8');
  var D = buildData(text);
  var block = dataBlock(D);
  var src = fs.readFileSync(SCRIPT_FILE, 'utf8');
  var i = src.indexOf(BEGIN), j = src.indexOf(END);
  assert(i >= 0 && j > i, 'markers not found in ' + SCRIPT_FILE);
  var out = src.slice(0, i) + block + src.slice(j + END.length);
  if (process.argv.indexOf('--check') >= 0) {
    if (out !== src) { console.error('STALE: the data block in the script does not match the data file. Run: node build_data.js'); process.exit(1); }
    console.log('OK: the data block in the script is current.');
    report(D);
    return;
  }
  if (!/^[\x00-\x7f]*$/.test(out)) { fail('output is not ASCII'); }
  fs.writeFileSync(SCRIPT_FILE, out);
  console.log('Wrote the data block into BitD Generators.js (' + out.length + ' characters).');
  report(D);
}

if (require.main === module) { main(); }
module.exports = { buildData: buildData, parseBlock: parseBlock, checksum: checksum };

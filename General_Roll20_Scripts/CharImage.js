// CharImage.js — Roll20 API Script
// Automates character avatar, portrait handout, and default token setup.
//
// SETUP — create two macro buttons (My Settings → Macros → + Add).
// Tick "Show in Bar" on both.
//
//   Name: New Character
//   Text: !char-image-new ?{Character Name}
//
//   Name: Add Character Image
//   Text: !char-image-existing ?{Character Name}
//
// WORKFLOW (everything after the first click is buttons or drag-and-drop):
//   1. Click a macro button → type character name → Enter
//   2. Click buttons to answer prompts
//   3. When asked for an image, drag it onto the canvas
//      — the script detects it automatically and shows Confirm / Try Again buttons
//
// COMMANDS:
//   !char-image-cancel   Cancel any in-progress setup
//   !char-image-debug    Toggle debug output on/off (off by default)
//
// GRID_PX below assumes a standard 70px grid. Change it if your game differs.

var CharImage = CharImage || (function () {
    'use strict';

    var GRID_PX = 70;
    var DEBUG   = false;

    var sessions        = {};
    var waitingPlayerid = null;

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------

    function w(msg) {
        sendChat('CharImage', '/w gm ' + msg);
    }

    function dbg(label, value) {
        if (!DEBUG) return;
        sendChat('CharImage',
            '/w gm <span style="color:#f90;font-size:0.85em"><b>[DBG]</b> '
            + label + ': ' + String(value) + '</span>');
    }

    function btn(list) {
        return list.map(function (b) {
            return '[' + b.label + '](' + b.cmd + ')';
        }).join(' &nbsp; ');
    }

    // Avatar src: strip query string (Roll20 avatar field works with clean URL)
    function makeAvatarSrc(src) {
        return src ? src.replace(/\?.*$/, '') : '';
    }

    // Convert Roll20 CDN URL to /thumb variant with no query string.
    // createObj('graphic') and char.set('defaulttoken') both require this format.
    function toThumbUrl(src) {
        if (!src) return '';
        var u = src.indexOf('?') !== -1 ? src.substring(0, src.indexOf('?')) : src;
        if (u.indexOf('/thumb.') !== -1) return u;
        return u.replace(/\/(max|original|med|large)(\.[a-z]+)$/i, '/thumb$2');
    }

    // Token src: must be /thumb.webp — no query string — or Roll20 rejects it
    function makeTokenSrc(src) {
        return toThumbUrl(src);
    }

    // -----------------------------------------------------------------------
    // Core actions
    // -----------------------------------------------------------------------

    function doAvatar(s) {
        var char = s.character;
        var name = char.get('name');
        var src  = s.avatarSrc;

        dbg('doAvatar src', src);
        char.set('avatar', src);

        var handout = createObj('handout', {
            name:             'Portrait: ' + name,
            archived:         false,
            inplayerjournals: '',
            controlledby:     ''
        });
        handout.set('avatar', src);
        dbg('Handout id', handout.id);

        // Bio is a TinyMCE HTML field — must use an <a> tag, not Markdown [text](url)
        char.get('bio', function (existing) {
            dbg('Existing bio', existing || '(empty)');
            var link = '<p><a href="http://journal.roll20.net/handout/' + handout.id + '">Portrait: ' + name + '</a></p>';
            char.set('bio', link + (existing || ''));
            dbg('Bio set to', link);
        });

        setTimeout(function () {
            handout.set('archived', true);
            dbg('Handout archived', handout.id);
        }, 1500);

        w('&#10003; Avatar set. Portrait handout created, archived, and linked in Bio &amp; Info.');
    }

    function doToken(s) {
        var char = s.character;
        var src  = s.tokenSrc;   // already /thumb.webp — no query string
        var px   = GRID_PX * s.tokenSize;

        dbg('doToken name', char.get('name'));
        dbg('doToken src',  src || '(EMPTY — image URL not captured)');
        dbg('doToken px',   px);

        if (!src) {
            w('<b>Error:</b> no token image URL was captured. Enable debug (!char-image-debug) and try again.');
            return;
        }

        // Find the player page to place the token on
        var pageId = Campaign().get('playerpageid');
        if (!pageId) {
            var pages = findObjs({ _type: 'page' });
            if (pages && pages.length > 0) pageId = pages[0].id;
        }
        if (!pageId) {
            w('<b>Error:</b> could not find a page to place the token on.');
            return;
        }

        // createObj('graphic') is the reliable Roll20 API path for tokens.
        // Requires /thumb.webp URL with no query string (confirmed from NPCSetup).
        var placed = createObj('graphic', {
            _pageid:          pageId,
            layer:            'objects',
            imgsrc:           src,
            left:             35,
            top:              35,
            width:            px,
            height:           px,
            represents:       char.id,
            name:             char.get('name'),
            showname:         false,
            showplayers_name: false,
        });

        if (!placed) {
            w('<b>Error:</b> could not place token on canvas. Check the API console (imgsrc or page issue).');
            return;
        }

        dbg('Token placed on canvas', placed.id);

        // Also attempt char.set('defaulttoken') — may work now that a graphic
        // representing this character exists on canvas. Same /thumb URL required.
        var tokenJSON = JSON.stringify({
            width:            px,
            height:           px,
            imgsrc:           src,
            name:             char.get('name'),
            show_tooltip:     false,
            represents:       char.id,
            bar1_value:       '',
            bar1_max:         '',
            bar2_value:       '',
            bar2_max:         '',
            bar3_value:       '',
            bar3_max:         '',
            showname:         false,
            showplayers_name: false,
        });
        setTimeout(function () {
            char.get('defaulttoken', function () {
                char.set('defaulttoken', tokenJSON);
                dbg('defaulttoken set attempt', tokenJSON.substring(0, 120));
            });
        }, 1000);

        w('&#10003; Token placed on canvas (' + s.tokenSize + '&times;' + s.tokenSize + ' sq).'
          + '<br>Right-click the token &rarr; <b>Set as Default Token</b>.'
          + '<br><i>(The script also attempts to set it automatically — the right-click is only needed if that doesn\'t stick.)</i>');
    }

    // -----------------------------------------------------------------------
    // Prompts
    // -----------------------------------------------------------------------

    function promptMode(name) {
        w('<b>CharImage &mdash; ' + name + '</b><br>What would you like to set up?<br><br>' +
          btn([
              { label: 'Avatar + Portrait', cmd: '!ci 1' },
              { label: 'Token Only',        cmd: '!ci 2' },
              { label: 'Both',              cmd: '!ci 3' }
          ]));
    }

    function promptTokenSize() {
        w('<b>Token size?</b><br><br>' +
          btn([
              { label: '1&times;1', cmd: '!ci 1' },
              { label: '2&times;2', cmd: '!ci 2' },
              { label: '3&times;3', cmd: '!ci 3' },
              { label: '4&times;4', cmd: '!ci 4' },
              { label: '5&times;5', cmd: '!ci 5' },
              { label: '6&times;6', cmd: '!ci 6' }
          ]));
    }

    function promptSameImage() {
        w('<b>Same image for both avatar and token?</b><br><br>' +
          btn([
              { label: 'Yes &mdash; Same Image',      cmd: '!ci y' },
              { label: 'No &mdash; Different Images', cmd: '!ci n' }
          ]));
    }

    function promptDragImage(label) {
        w('Drag the <b>' + label + ' image</b> onto the canvas &mdash; ' +
          'it will be detected automatically.<br><br>' +
          btn([{ label: '&#10006; Cancel Setup', cmd: '!char-image-cancel' }]));
    }

    function promptConfirmImage(filename, rawSrc) {
        dbg('Image pending — rawSrc', rawSrc);
        w('Image detected: <i>' + filename + '</i><br><br>' +
          btn([
              { label: '&#10003; Use This Image', cmd: '!ci confirm' },
              { label: '&#8635; Try Again',        cmd: '!ci retry'  }
          ]));
    }

    // -----------------------------------------------------------------------
    // Session helpers
    // -----------------------------------------------------------------------

    function startSession(playerid, character) {
        sessions[playerid] = {
            step:       'mode',
            character:  character,
            mode:       null,
            tokenSize:  1,
            sameImage:  null,
            avatarSrc:  null,
            tokenSrc:   null,
            pendingRaw: null   // raw URL from add:graphic, cleaned differently for avatar vs token
        };
        dbg('Session started', character.get('name'));
        promptMode(character.get('name'));
    }

    function armWait(playerid, label) {
        waitingPlayerid = playerid;
        dbg('Arming image wait', label);
        promptDragImage(label);
    }

    function clearSession(playerid) {
        if (waitingPlayerid === playerid) waitingPlayerid = null;
        delete sessions[playerid];
        dbg('Session cleared', playerid);
    }

    // -----------------------------------------------------------------------
    // Graphic auto-detection
    // CRITICAL: waitingPlayerid guard MUST be the absolute first line.
    // This event fires for every graphic on the map at page load — without
    // the immediate bail-out it floods chat and triggers Roll20's loop detector.
    // -----------------------------------------------------------------------

    on('add:graphic', function (graphic) {
        if (!waitingPlayerid) return;

        var raw = graphic.get('imgsrc') || '';
        dbg('add:graphic raw src', raw.substring(0, 100));

        if (!raw || raw.indexOf('http') !== 0) return;

        var playerid = waitingPlayerid;
        var s        = sessions[playerid];
        if (!s) { waitingPlayerid = null; return; }

        s.pendingRaw    = raw;   // store the raw URL; we'll clean it differently per use
        waitingPlayerid = null;

        var filename = raw.split('/').pop().replace(/\?.*$/, '');
        promptConfirmImage(filename, raw);
    });

    // -----------------------------------------------------------------------
    // Step handlers
    // -----------------------------------------------------------------------

    function stepMode(playerid, reply) {
        var s = sessions[playerid];
        dbg('stepMode reply', reply);
        if (!['1', '2', '3'].includes(reply)) { promptMode(s.character.get('name')); return; }
        s.mode = reply;

        if (reply === '1') {
            s.step = 'select_avatar';
            armWait(playerid, 'avatar');
        } else {
            s.step = 'token_size';
            promptTokenSize();
        }
    }

    function stepTokenSize(playerid, reply) {
        var s    = sessions[playerid];
        var size = parseInt(reply, 10);
        dbg('stepTokenSize', size);
        if (isNaN(size) || size < 1 || size > 6) { promptTokenSize(); return; }
        s.tokenSize = size;

        if (s.mode === '2') {
            s.step = 'select_token';
            armWait(playerid, 'token');
        } else {
            s.step = 'same_image';
            promptSameImage();
        }
    }

    function stepSameImage(playerid, reply) {
        var s = sessions[playerid];
        dbg('stepSameImage reply', reply);
        if (reply === 'y') {
            s.sameImage = true;
            s.step      = 'select_avatar';
            armWait(playerid, 'avatar + token');
        } else if (reply === 'n') {
            s.sameImage = false;
            s.step      = 'select_avatar';
            armWait(playerid, 'avatar');
        } else {
            promptSameImage();
        }
    }

    function stepConfirm(playerid) {
        var s = sessions[playerid];

        dbg('stepConfirm step',       s.step);
        dbg('stepConfirm pendingRaw', s.pendingRaw || '(empty — graphic was never detected)');
        dbg('stepConfirm sameImage',  String(s.sameImage));
        dbg('stepConfirm mode',       s.mode);

        if (!s.pendingRaw) {
            w('No image detected yet. Drag the image onto the canvas first, then confirm.');
            return;
        }

        var raw      = s.pendingRaw;
        s.pendingRaw = null;

        if (s.step === 'select_avatar') {
            s.avatarSrc = makeAvatarSrc(raw);
            dbg('avatarSrc set', s.avatarSrc);

            if (s.mode === '1') {
                doAvatar(s);
                clearSession(playerid);

            } else if (s.sameImage) {
                // Same image for both: use raw URL for token (must stay as med.webp?timestamp)
                s.tokenSrc = makeTokenSrc(raw);
                dbg('tokenSrc set (same image)', s.tokenSrc);
                doAvatar(s);
                doToken(s);
                clearSession(playerid);

            } else {
                // Different images: go get the token image
                s.step = 'select_token';
                armWait(playerid, 'token');
            }

        } else if (s.step === 'select_token') {
            s.tokenSrc = makeTokenSrc(raw);
            dbg('tokenSrc set (separate image)', s.tokenSrc);

            if (s.mode === '3') doAvatar(s);
            doToken(s);
            clearSession(playerid);

        } else {
            dbg('stepConfirm unexpected step', s.step);
            w('Unexpected state: ' + s.step + '. Type <b>!char-image-cancel</b> to reset.');
        }
    }

    function stepRetry(playerid) {
        var s        = sessions[playerid];
        s.pendingRaw = null;
        var label    = s.step === 'select_avatar'
            ? (s.sameImage ? 'avatar + token' : 'avatar')
            : 'token';
        dbg('stepRetry', label);
        armWait(playerid, label);
    }

    // -----------------------------------------------------------------------
    // Chat listener
    // -----------------------------------------------------------------------

    on('chat:message', function (msg) {
        if (msg.type !== 'api') return;

        var playerid = msg.playerid;
        var parts    = msg.content.trim().split(/\s+/);
        var cmd      = parts[0];
        var rest     = parts.slice(1).join(' ').trim();

        if (cmd === '!char-image-debug') {
            DEBUG = !DEBUG;
            w('Debug mode <b>' + (DEBUG ? 'ON' : 'OFF') + '</b>.');
            return;
        }

        // Diagnostic: read defaulttoken + bio from any character
        // Usage: !char-image-readtoken Character Name
        if (cmd === '!char-image-readtoken') {
            if (!rest) { w('Usage: !char-image-readtoken Character Name'); return; }
            var diag = findObjs({ _type: 'character', name: rest });
            if (!diag.length) { w('Character "' + rest + '" not found.'); return; }
            var dc = diag[0];
            w('<b>Diagnostics for: ' + dc.get('name') + '</b><br>id: ' + dc.id);
            w('avatar: ' + (dc.get('avatar') || '(none)'));
            dc.get('defaulttoken', function (dt) {
                w('<b>defaulttoken:</b><br><pre>' + (dt || '(empty)') + '</pre>');
            });
            dc.get('bio', function (bio) {
                w('<b>bio:</b><br>' + (bio || '(empty)'));
            });
            return;
        }

        if (cmd === '!char-image-cancel') {
            if (sessions[playerid]) { clearSession(playerid); w('Setup cancelled.'); }
            else w('No active setup to cancel.');
            return;
        }

        if (cmd === '!char-image-new') {
            if (!rest) { w('Character name is required.'); return; }
            if (sessions[playerid]) { w('Setup in progress. Type <b>!char-image-cancel</b> first.'); return; }
            if (findObjs({ _type: 'character', name: rest }).length) {
                w('A character named "<b>' + rest + '</b>" already exists. Use <b>Add Character Image</b> instead.');
                return;
            }
            var newChar = createObj('character', { name: rest, inplayerjournals: '', controlledby: '' });
            dbg('Character created', newChar.id + ' / ' + rest);
            w('Character <b>' + rest + '</b> created.');
            startSession(playerid, newChar);
            return;
        }

        if (cmd === '!char-image-existing') {
            if (!rest) { w('Character name is required.'); return; }
            if (sessions[playerid]) { w('Setup in progress. Type <b>!char-image-cancel</b> first.'); return; }
            var found = findObjs({ _type: 'character', name: rest });
            dbg('findObjs result', found.length + ' match(es) for "' + rest + '"');
            if (!found.length) { w('Character "<b>' + rest + '</b>" not found. Check spelling.'); return; }
            startSession(playerid, found[0]);
            return;
        }

        if (cmd === '!ci') {
            var s = sessions[playerid];
            if (!s) {
                w('No active setup. Click <b>New Character</b> or <b>Add Character Image</b> to start.');
                return;
            }
            var reply = (parts[1] || '').toLowerCase().trim();
            dbg('!ci step=' + s.step, 'reply=' + reply);

            if (reply === 'confirm') { stepConfirm(playerid); return; }
            if (reply === 'retry')   { stepRetry(playerid);   return; }

            switch (s.step) {
                case 'mode':          stepMode(playerid, reply);      break;
                case 'token_size':    stepTokenSize(playerid, reply); break;
                case 'same_image':    stepSameImage(playerid, reply); break;
                case 'select_avatar':
                case 'select_token':
                    w('Drag the image onto the canvas — it will be detected automatically.');
                    break;
                default:
                    w('Unexpected state: ' + s.step + '. Type <b>!char-image-cancel</b> to reset.');
            }
        }
    });

    log('CharImage loaded.');

}());

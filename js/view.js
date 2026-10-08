// js/view.js - Leaflet 2D flat-map view for RASSVET (class extracted from main.js)
import {
  CDN_URLS,
  DEFAULT_GROUPS,
  GROUP_COLORS,
  TIME_SPEED,
  RENDER,
  MAP
} from './config.js';
import * as utils from './utils.js';
import * as satelliteJS from './satellite.mjs';
const satellite = satelliteJS;
// trail length in seconds of simulated time; configurable via the UI control
let TRAIL_LENGTH_SEC = RENDER.TRAIL_LENGTH_SEC;
import * as hashMatrix from './hashMatrix.js';
import {
  normalizeKey,
  groupKeyToName,
  formatClock,
  createCheckbox,
  createDot,
  splitAroundAntimeridian
} from './view_helpers.v2.js?v=11';

const TRAIL_PRESETS = [
  ['15 min', 900],
  ['30 min', 1800],
  ['1h', 3600],
  ['3h', 10800],
  ['6h', 21600],
  ['12h', 43200],
  ['24h', 86400]
];

// Fixed playback speed steps (1x = real time).
const SPEED_PRESETS = [
  ['1x (real)', 1],
  ['2x', 2],
  ['3x', 3],
  ['4x', 4],
  ['6x', 6],
  ['8x', 8],
  ['10x', 10],
  ['12x', 12],
  ['16x', 16],
  ['24x', 24],
  ['32x', 32],
  ['64x', 64],
  ['100x', 100]
];

// ---------- Viewer ----------
class LeafletView {
  constructor() {
    this.map = null;
    this.sats = {};
    this.groupInfo = {};
    this.running = true;       // run in real-time from the start
    this.speed = 1;            // 1x = real time
    this._simTime = null;
    this._playStartTime = null;
    this._playSimStart = null;
    this._targetCenter = null;
    this._userInteracting = false;
    this._lastFrame = null;
  }
// ---------- Selection matrix (persisted in the URL hash) ----------
  // Format: #satellites=[key1,key2,...]  — the group keys that are visible;
  // every group not listed is hidden. Selected keys are sorted alphabetically.
  _parseSelectionHash() {
    const raw = location.hash.slice(1);
    const parts = raw ? raw.split('&') : [];
    let satellitePart = null;
    for (const part of parts) {
      if (part.startsWith('satellites=')) {
        satellitePart = part.slice('satellites='.length);
      } else if (part.startsWith('trailLength=')) {
        const sec = parseInt(part.slice('trailLength='.length), 10);
        if (!isNaN(sec)) {
          TRAIL_LENGTH_SEC = sec;
        }
      }
    }
    if (satellitePart !== null) {
      const selected = hashMatrix.parseSelectionHash('satellites=' + satellitePart, Object.keys(this.groupInfo));
      for (const key of Object.keys(this.groupInfo)) {
        this.groupInfo[key].visible = selected.has(key);
      }
    }
  }

  _persistSelectionHash() {
    const selection = hashMatrix.buildSelectionHash(this.groupInfo);
    const fullHash = selection + '&trailLength=' + TRAIL_LENGTH_SEC;
    if (location.hash.slice(1) === fullHash) return;
    history.replaceState(null, '', location.pathname + '?' + location.search + '#' + fullHash);
  }

  // trim every in-memory trail to the current time length (used when the user
  // changes the trail-length control)
  trimAllTrails() {
    const maxCount = Math.min(RENDER.MAX_TRAIL_HIST,
      Math.ceil(TRAIL_LENGTH_SEC / RENDER.TRAIL_CADENCE_SEC) + 1);
    for (const groupSats of Object.values(this.sats)) {
      for (const sat of groupSats) {
        if (sat.satrec && sat.satrec.error === 0 && this._simTime) {
          // rebuild backward history when duration increased (or always keep
          // the trail ending at the current live point)
          const pushEvery = RENDER.TRAIL_CADENCE_SEC * 1000;
          const trailLenMs = TRAIL_LENGTH_SEC * 1000;
          const initPoints = [];
          const probe = new Date(this._simTime);
          while (initPoints.length < RENDER.MAX_TRAIL_HIST) {
            probe.setTime(probe.getTime() - pushEvery);
            if (this._simTime.getTime() - probe.getTime() > trailLenMs) break;
            try {
              const res = satellite.propagate(sat.satrec, probe);
              if (!res || res.position.x === 0) break;
              initPoints.push(utils.posEcfToLatLng(satellite.eciToEcf(res.position, satellite.gstime(probe)), probe));
            } catch (e) {
              break;
            }
          }
          // rebuild trail from fresh backward history, ending with current live point
          const currentRes = satellite.propagate(sat.satrec, this._simTime);
          const currentLatLng = (currentRes && currentRes.position && currentRes.position.x !== 0)
            ? utils.posEcfToLatLng(satellite.eciToEcf(currentRes.position, satellite.gstime(this._simTime)), this._simTime)
            : null;
          sat.trail = initPoints.reverse();
          if (currentLatLng) sat.trail.push(currentLatLng);
          sat._lastCadPos = currentRes?.position || null;
          sat._lastCadPosTime = this._simTime.getTime();
        }
        if (sat.trail && sat.trail.length > maxCount) {
          sat.trail.splice(0, sat.trail.length - maxCount);
        }
      }
    }
  }

  async init() {
    this.map = L.map('map', {
      zoomControl: false,
      attributionControl: true
    }).setView([MAP.START_LAT, MAP.START_LON], MAP.START_ZOOM);

    L.tileLayer(MAP.TILE_URL, {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(this.map);

    L.control.zoom({ position: 'bottomright' }).addTo(this.map);

    if (MAP.AUTO_CENTER) {
      this._currentCenter = L.latLng(MAP.START_LAT, MAP.START_LON);
      this._targetCenter = this._currentCenter.clone();
      this.map.on('dragstart', () => { this._userInteracting = true; });
      this.map.on('dragend', () => { this._userInteracting = false; });
    }

    await this.loadCatalog();
    this._parseSelectionHash();
    this.assignCaps();
    // re-apply whenever the user manually edits the URL hash
    window.addEventListener('hashchange', () => {
      this._parseSelectionHash();
      this.updateUI();
      this._persistSelectionHash();
    });
    this.makeUI();
    this.updateUI();

    this._simTime = this._simTime || new Date();
    this.animate();

    const statusEl = document.getElementById('rassvet-status');
    if (statusEl) {
      statusEl.textContent = 'READY';
      statusEl.classList.add('ready');
    }
    console.log(
      'RASSVET: playback running at ' + this.speed + 'x; sim time =',
      this._simTime?.toISOString().slice(0, 19)
    );
  }

  async loadCatalog() {
    let groupEntries = [];
    let catalog = undefined;
    let simStart = null;
    try {
      const text = await utils.loadTLEFile('data/catalog.json');
      catalog = JSON.parse(text);
      if (Array.isArray(catalog.groups)) {
        console.log(
          'RASSVET: catalog v1 loaded: ' + catalog.satelliteCount +
          ' sats, ' + catalog.groups.length + ' groups'
        );
        const byGroup = {};
        for (const csat of catalog.satellites || []) {
          const key = normalizeKey(csat.group);
          (byGroup[key] = byGroup[key] || []).push(csat);
        }
        for (const g of catalog.groups) {
          const key = normalizeKey(g.group);
          if (byGroup[key]?.length) {
            groupEntries.push([key, {
              name: DEFAULT_GROUPS[key]?.name || g.group,
              description: g.coverage ? g.coverage + ' constellation' : '',
              files: [],
              sats: byGroup[key]
            }]);
          }
        }
        simStart = new Date(catalog.satellites[0]?.epoch || new Date());
      } else {
        simStart = new Date();
        const keys = Object.keys(catalog?.groups || {});
        console.log('RASSVET: catalog legacy loaded, groups:', keys.join(', '));
        if (catalog.groups) {
          groupEntries = Object.entries(catalog.groups);
        }
      }
    } catch (e) {
      console.warn('RASSVET: catalog.json not found (' + e.message + '), auto-discovering TLE files from data/tles/');
      groupEntries = await this.autoDiscover();
    }

    if (!simStart) simStart = new Date();
    for (const [key, info] of groupEntries) {
      const merged = {
        ...DEFAULT_GROUPS[key] || {},
        name: info.name || groupKeyToName(key),
        description: info.description || '',
        files: info.files || [],
        color: GROUP_COLORS[key] || '#9E9E9E',
        loadedCount: 0,
        visible: false,
        elements: { markers: [], polylines: [] }
      };
      if (key === 'rassvet') merged.visible = true;
      const groupSats = [];
      for (const file of merged.files) {
        try {
          const text = await utils.loadTLEFile(file);
          const fileName = file.replace(/^.*\//, '').replace(/\.txt$/i, '');
          const { sats } = utils.parseTLESGroup(text, fileName);
          groupSats.push(...sats);
        } catch (e) {
          console.warn('RASSVET: could not load TLE file', file, e.message);
        }
      }
      if (info.sats && Array.isArray(info.sats)) {
        for (const csat of info.sats) {
          try {
            const satrec = satellite.twoline2satrec(csat.tleLine1, csat.tleLine2);
            if (satrec.error !== 0) throw new Error('parse error');
            groupSats.push({
              name: csat.commonName || csat.name,
              noradId: csat.noradId,
              satrec: satrec,
              groupKey: key,
              addedToMap: false,
              userHidden: false,
              trail: []
            });
          } catch (e) {
            console.warn('RASSVET: skip ' + (csat.commonName || csat.name) + ':', e.message);
          }
        }
      }
      for (const sat of groupSats) {
        sat.trail = [];
        sat.addedToMap = false;
        sat.userHidden = false;
        sat.groupKey = key;
        if (!sat.name) sat.name = sat.name || (sat.satrec?.satnum ? 'SAT-'+sat.satrec.satnum : 'unknown');
      }
      merged.sats = groupSats;
      merged.loadedCount = groupSats.length;
      merged.visible = !!(catalog?.defaults?.visible || []).includes(key);
      this.sats[key] = groupSats;
      this.groupInfo[key] = merged;
    }

    const total = Object.values(this.groupInfo).reduce((a, g) => a + g.loadedCount, 0);
    if (total === 0) {
      console.warn('RASSVET: no satellites loaded; please add TLE data (data/tles/*.txt with @ GROUP= headers)');
    } else {
      console.log('RASSVET: loaded ' + total + ' satellites across ' + Object.keys(this.groupInfo).length + ' groups');
    }

    if (catalog && !catalog.defaults?.visible && Array.isArray(catalog.groups)) {
      for (const key of Object.keys(this.groupInfo)) {
        this.groupInfo[key].visible = true;
      }
    }

    if (simStart) {
      this._simTime = simStart;
      console.log('RASSVET: sim start time set to', simStart.toISOString());
    }
  }

  async autoDiscover() {
    let html = '';
    try { html = await utils.loadTLEFile('data/tles/').then(t => t.slice(0, 50000)); } catch (e) { html = ''; }
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    const links = [...tmp.querySelectorAll('a[href]')]
      .map(a => a.href)
      .filter(h => h.match(/\.txt$/i));
    const groupEntries = [];
    for (const link of links) {
      try {
        const text = await utils.loadTLEFile(link);
        const linkName = link.replace(/^.*\//, '').replace(/\.txt$/i, '');
      const { groupName, sats } = utils.parseTLESGroup(text, linkName);
        const key = normalizeKey(groupName);
        groupEntries.push([key, { name: groupName, description: '', files: [], sats }]);
      } catch (e) {
        console.warn('RASSVET: could not load discovered TLE file', link, e.message);
      }
    }
    return groupEntries;
  }

  assignCaps() {
    for (const [key, groupSats] of Object.entries(this.sats)) {
      const gi = this.groupInfo[key];
      const color = gi.color;
      const icon = utils.createSatIcon(color);
      for (const sat of groupSats) {
        sat.marker = L.marker([0, 0], { icon });
        sat.marker.bindTooltip(sat.name + '<br><span style="font-size:0.85em;opacity:0.8">NORAD ' + (sat.noradId || sat.satrec?.satnum || '') + '</span>', {
          permanent: true, direction: 'right', offset: [8, -8],
          className: 'sat-label-tooltip', opacity: 0.9
        });
        sat.polylines = []; // one polyline per segment (trail may cross antimeridian)
        const p = L.polyline([], {
          color: color,
          weight: RENDER.TRAIL_WIDTH,
          opacity: RENDER.TRAIL_OPACITY
        });
        sat.polylines.push(p);
        gi.elements.markers.push(sat.marker);
        gi.elements.polylines.push(p);
        sat._lastCadPos = null;
        sat._lastCadPosTime = null;
      }
    }
  }

  makeUI() {
    const left = document.getElementById('rassvet-left');
    const right = document.getElementById('rassvet-right');
    if (!left || !right) return;

    const playBtn = document.createElement('button');
    playBtn.id = 'playback-btn';
    playBtn.style.cssText = 'padding:2px 8px;cursor:pointer;font-size:12px;';
    playBtn.textContent = 'Play';
    playBtn.addEventListener('click', () => this.togglePlayback());
    left.appendChild(playBtn);

    const resetBtn = document.createElement('button');
    resetBtn.id = 'reset-time-btn';
    resetBtn.style.cssText = 'padding:2px 8px;cursor:pointer;font-size:11px;';
    resetBtn.title = 'Jump back to real time and reset speed to 1x';
    resetBtn.textContent = 'Reset to Real';
    resetBtn.addEventListener('click', () => this.resetToRealTime());
    left.appendChild(resetBtn);

    const speedRow = document.createElement('label');
    speedRow.className = 'rassvet-label';
    speedRow.innerHTML = 'Speed';
    const speedSelect = document.createElement('select');
    speedSelect.id = 'speed-select';
    speedSelect.style.cssText = 'padding:2px 6px;background:#0e151d;color:#e8f1ff;border:1px solid var(--panel-border);border-radius:4px;font-size:12px;';
    for (const [label, mult] of SPEED_PRESETS) {
      const opt = document.createElement('option');
      opt.value = mult;
      opt.textContent = label;
      speedSelect.appendChild(opt);
    }
    speedSelect.addEventListener('change', (e) => {
      this.speed = Number(e.target.value);
      this.updateUI();
    });
    speedRow.appendChild(speedSelect);
    left.appendChild(speedRow);

    const dateRow = document.createElement('label');
    dateRow.className = 'rassvet-label';
    dateRow.innerHTML = 'Date';
    const dateVal = document.createElement('span');
    dateVal.id = 'date-val';
    dateVal.textContent = formatClock(this._simTime);
    dateRow.appendChild(dateVal);
    left.appendChild(dateRow);

    const trailRow = document.createElement('label');
    trailRow.className = 'rassvet-label';
    trailRow.innerHTML = 'Trail';
    const trailSelect = document.createElement('select');
    trailSelect.id = 'trail-length';
    trailSelect.style.cssText = 'padding:2px 6px;background:#0e151d;color:#e8f1ff;border:1px solid var(--panel-border);border-radius:4px;font-size:12px;';
    for (const [label, sec] of TRAIL_PRESETS) {
      const opt = document.createElement('option');
      opt.value = sec;
      opt.textContent = label;
      trailSelect.appendChild(opt);
    }
    trailSelect.addEventListener('change', (e) => {
      TRAIL_LENGTH_SEC = Number(e.target.value);
      this.trimAllTrails();
      this.updateUI();
      this._persistSelectionHash();
    });
    trailRow.appendChild(trailSelect);
    left.appendChild(trailRow);

    const groupList = document.getElementById('rassvet-group-list');
    if (groupList) {
      const sorted = Object.entries(this.groupInfo).sort((a, b) =>
        (a[1].loadedCount || 0) - (b[1].loadedCount || 0)
      );
      for (const [key, gi] of sorted) {
        const cb = createCheckbox(
          (DEFAULT_GROUPS[key]?.name || groupKeyToName(key)) +
          '  (' + (gi.loadedCount || 0) + ')',
          key,
          (name, checked) => this.handleGroupToggle(name, checked)
        );
        const dot = createDot(gi.color);
        cb.label.insertBefore(dot, cb.label.firstChild);
        groupList.appendChild(cb.label);
        const sub = document.createElement('div');
        sub.style.cssText = 'padding-left:18px;display:flex;flex-direction:column;gap:2px;';
        for (const sat of (this.sats[key] || []).slice().sort((a, b) => {
          const s1 = a.name || '';
          const s2 = b.name || '';
          const re = /(\d+)|(\D+)/g;
          const chunks1 = s1.match(re) || [];
          const chunks2 = s2.match(re) || [];
          for (let i = 0; i < Math.min(chunks1.length, chunks2.length); i++) {
            const c1 = chunks1[i];
            const c2 = chunks2[i];
            const n1 = parseInt(c1, 10);
            const n2 = parseInt(c2, 10);
            if (!isNaN(n1) && !isNaN(n2)) {
              if (n1 !== n2) return n1 - n2;
            } else {
              if (c1 < c2) return -1;
              if (c1 > c2) return 1;
            }
          }
          return chunks1.length - chunks2.length;
        })) {
          const label = document.createElement('label');
          label.style.cssText = 'display:flex;align-items:center;gap:6px;cursor:pointer;font-size:11px;color:#aaa;user-select:none;';
          const input = document.createElement('input');
          input.type = 'checkbox';
          input.dataset.group = key;
          input.dataset.sat = sat.name;
          input.dataset.norad = (sat.noradId != null) ? sat.noradId : (sat.satrec ? sat.satrec.satnum : '') || '';
          input.checked = !!sat.addedToMap;
          input.addEventListener('change', () => this.handleSatToggle(key, sat.name, input.checked));
          const span = document.createElement('span');
          span.textContent = (sat.name || ('SAT-' + (sat.satrec?.satnum || ''))) + ((sat.noradId != null) ? ' (NORAD ' + sat.noradId + ')' : '');
          label.appendChild(input);
          label.appendChild(span);
          sub.appendChild(label);
        }
        groupList.appendChild(sub);
      }
    }
  }

  updateUI() {
    const btn = document.getElementById('playback-btn');
    if (btn) btn.textContent = this.running ? 'Pause' : 'Play';
    const sel = document.getElementById('speed-select');
    if (sel) sel.value = this.speed;
    const dateVal = document.getElementById('date-val');
    if (dateVal) dateVal.textContent = formatClock(this._simTime);
    const trailSel = document.getElementById('trail-length');
    if (trailSel) trailSel.value = TRAIL_LENGTH_SEC;
    for (const [key, gi] of Object.entries(this.groupInfo)) {
      const cb = document.querySelector(
        'input[type="checkbox"][data-group="' + key + '"]:not([data-sat])'
      );
      if (cb) cb.checked = !!gi.visible;
    }
    for (const [key, sats] of Object.entries(this.sats)) {
      for (const sat of sats) {
        const el = document.querySelector(
          'input[type="checkbox"][data-group="' + key + '"][data-sat="' + sat.name + '"]'
        );
        if (el) el.checked = !!sat.addedToMap;
      }
    }
  }

  handleGroupToggle(key, visible) {
    const gi = this.groupInfo[key];
    if (!gi) return;
    gi.visible = visible;
    const el = gi.elements;
    for (const m of el.markers) {
      if (visible) {
        m.addTo(this.map);
        // markers added back; update flag via draw loop on next frame
      } else {
        this.map.removeLayer(m);
      }
    }
    for (const p of el.polylines) {
      visible ? p.addTo(this.map) : this.map.removeLayer(p);
    }
    for (const sat of (this.sats[key] || [])) {
      sat.userHidden = false;
      sat.addedToMap = visible;
    }
    this.updateUI();
    this._persistSelectionHash();
  }

  handleSatToggle(key, satName, visible) {
    const sats = this.sats[key];
    if (!sats) return;
    const sat = sats.find(s => s.name === satName);
    if (!sat) return;
    sat.userHidden = !visible;
    if (visible) {
      if (!sat.addedToMap) {
        sat.marker?.addTo(this.map);
        for (const p of sat.polylines) p.addTo(this.map);
        sat.addedToMap = true;
      }
    } else {
      if (sat.addedToMap) {
        this.map.removeLayer(sat.marker);
        for (const p of sat.polylines) this.map.removeLayer(p);
        sat.addedToMap = false;
      }
    }
    this.updateUI();
  }

  togglePlayback() {
    this.running = !this.running;
    if (this.running && !this._playStartTime) {
      // start real-time simulation from the current sim time
      this._playStartTime = Date.now();
      this._playSimStart = new Date(this._simTime);
    }
    this.updateUI();
  }

  // jump the clock to real time and reset playback to 1x
  resetToRealTime() {
    this._simTime = new Date();
    this._playStartTime = Date.now();
    this._playSimStart = new Date(this._simTime);
    this.speed = 1;
    this.running = true;
    this.updateUI();
  }

  animate() {
    if (!this.running) return;
    const now = Date.now();
    this._lastFrame = now;
    this._frameCount = (this._frameCount || 0) + 1;

    // initialize playback timing on the first frame (init() calls animate
    // before the user could have clicked Play)
    if (!this._playStartTime) {
      this._playStartTime = now;
      this._playSimStart = new Date(this._simTime);
    }
    if (this.running) {
      const realSec = (now - this._playStartTime) / 1000;
      this._simTime = new Date(
        this._playSimStart.getTime() + realSec * this.speed * 1000
      );
    }
    // debug: print once every 3 seconds
    if (this._frameCount % 180 === 0) {
      console.log('RASSVET anim frame', this._frameCount, '| simTime:', this._simTime.toISOString().slice(0, 19), '| speed:', this.speed, '| playing:', this.running, '| playStartTime:', this._playStartTime);
    }
    this.updateUI();

    let addedCount = 0;
    for (const groupSats of Object.values(this.sats)) {
      for (const sat of groupSats) {
        if (!sat.satrec) continue;
        try {
          // build the full initial historical trail at startup so the orbit is
          // visible immediately instead of waiting for cadence points to accrue;
          // propagate backwards from the current sim time and keep the newest
          // point so the normal cadence logic below appends forward from now.
           if (sat.trail.length === 0) {
            const pushEvery = RENDER.TRAIL_CADENCE_SEC * 1000;
             const trailLenMs = TRAIL_LENGTH_SEC * 1000;
             const initPoints = [];
             const probe = new Date(this._simTime);
             while (initPoints.length < RENDER.MAX_TRAIL_HIST) {
               probe.setTime(probe.getTime() - pushEvery);
               // stop when going back more than the configured trail length
               if (this._simTime.getTime() - probe.getTime() > trailLenMs) break;
                const res = satellite.propagate(sat.satrec, probe);
                if (!res || res.position.x === 0 || sat.satrec.error) {
                  if (!sat._degenerateWarned) {
                    console.warn(
                      'RASSVET: skip ' + sat.name + ': degenerate satellite ' +
                      '(satrec.error = ' + sat.satrec.error + '); orbit unusable, skipping'
                    );
                    sat._degenerateWarned = true;
                  }
                  break;
                }
              initPoints.push(utils.posEcfToLatLng(satellite.eciToEcf(res.position, satellite.gstime(probe)), probe));
             }
             sat.trail = initPoints.reverse();
           }
           const result = satellite.propagate(sat.satrec, this._simTime);
           if (!result || result.position.x === 0 || sat.satrec.error) {
             if (!sat._degenerateWarned) {
               console.warn(
                 'RASSVET: skip ' + sat.name + ': degenerate satellite ' +
                 '(satrec.error = ' + sat.satrec.error + '); orbit unusable, skipping'
               );
               sat._degenerateWarned = true;
             }
             continue;
           }
           const [lat, lng] = utils.posEcfToLatLng(satellite.eciToEcf(result.position, satellite.gstime(this._simTime)), this._simTime);
           if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
           // debug: show first satellite state once
           if (!this._drawDebugLogged) {
             this._drawDebugLogged = true;
             const firstSat = Object.values(this.sats)[0]?.[0];
             console.log('RASSVET draw loop first sat:', firstSat?.name,
                         '| prop pos:', JSON.stringify(result.position),
                         '| lat/lng:', [lat, lng].map(v => v.toFixed(4)),
                         '| marker:', firstSat?.marker ? firstSat.marker.getLatLng().toString() : 'none',
                         '| trailLen:', this.trail ? this.trail.length : (firstSat?.trail?.length || 'n/a'),
                         '| simTime:', this._simTime.toISOString());
           }
          // debug: show raw position + parse error for first sat
          if (!this._debugLogged) {
            this._debugLogged = true;
            console.log('RASSVET DEBUG: sat', sat.name, 'satrec.error =', sat.satrec.error,
                        'pos =', JSON.stringify(result.position),
                        'time =', this._simTime?.toISOString());
          }
          // build the historical trail at cadence-bounded intervals via linear
          // interpolation chained from the last cadence-boundary position.
          // One propagation per frame, smooth wave at any speed.
           const pushEvery = RENDER.TRAIL_CADENCE_SEC * 1000;
           if (sat._lastCadPos == null) {
              sat._lastCadPos = result.position;
              sat._lastCadPosTime = this._simTime.getTime();
              sat.trail.push([lat, lng]);
            } else {
              const simNow = this._simTime.getTime();
              const dt = simNow - sat._lastCadPosTime;
              let t = sat._lastCadPosTime;
              // add cadence points only in the gap strictly BEFORE the current
              // position, so the current position is always the last point
              while (simNow - t > pushEvery) {
                t += pushEvery;
                const frac = (t - sat._lastCadPosTime) / dt;
                const p = {
                  x: sat._lastCadPos.x + (result.position.x - sat._lastCadPos.x) * frac,
                  y: sat._lastCadPos.y + (result.position.y - sat._lastCadPos.y) * frac,
                  z: sat._lastCadPos.z + (result.position.z - sat._lastCadPos.z) * frac
                };
                sat.trail.push(
                  utils.posEcfToLatLng(satellite.eciToEcf(p, satellite.gstime(new Date(t))), new Date(t))
                );
                sat._lastCadPos = p;
                sat._lastCadPosTime = t;
              }
              // append current only when at least one full cadence interval passed
              // (at 1x this is most frames, but here dt accumulates); otherwise
              // just update the live endpoint so we don't duplicate points
              if (dt >= pushEvery) {
                sat.trail.push([lat, lng]);
                sat._lastCadPos = result.position;
                sat._lastCadPosTime = simNow;
              } else {
                if (sat.trail.length > 0) sat.trail[sat.trail.length - 1] = [lat, lng];
              }
            }
           // cap the trail to the configured time length (cadence points), with
           // MAX_TRAIL_HIST as a hard safety ceiling
           const maxCount = Math.min(RENDER.MAX_TRAIL_HIST,
             Math.ceil(TRAIL_LENGTH_SEC / RENDER.TRAIL_CADENCE_SEC) + 1);
           if (sat.trail.length > maxCount) {
             sat.trail.splice(0, sat.trail.length - maxCount);
           }
          // downsample to evenly spaced points (keeps the wave smooth,
          // ~400 points regardless of history length, preserves wave shape)
          const drawn = utils.downsampleLatLngs(sat.trail, RENDER.MAX_TRAIL_POINTS);
           const segments = splitAroundAntimeridian(drawn);
           const color = this.groupInfo[sat.groupKey].color;
           const gi = this.groupInfo[sat.groupKey];
           sat.marker.setLatLng([lat, lng]);
          // ensure a polyline exists for every segment; new ones are added to
          // the group elements so show/hide works.
          for (let i = sat.polylines.length; i < segments.length; i++) {
            const p = L.polyline([], {
              color: color,
              weight: RENDER.TRAIL_WIDTH,
              opacity: RENDER.TRAIL_OPACITY
            });
            if (sat.addedToMap) p.addTo(this.map);
            sat.polylines.push(p);
            gi.elements.polylines.push(p);
          }
          // clear old segments that are no longer needed
          for (let i = segments.length; i < sat.polylines.length; i++) {
            sat.polylines[i].setLatLngs([]);
          }
          // draw each segment on its own polyline
          segments.forEach((seg, i) => {
            sat.polylines[i].setLatLngs(seg);
          });
          if (this.groupInfo[sat.groupKey].visible && !sat.addedToMap && !sat.userHidden) {
            sat.marker.addTo(this.map);
            for (const p of sat.polylines) p.addTo(this.map);
            sat.addedToMap = true;
            addedCount++;
          }
        } catch (e) {
          console.warn('RASSVET: propagate fail', sat.name, e.message);
        }
      }
    }
    if (addedCount > 0) {
      console.log('RASSVET: added ' + addedCount + ' markers to map this frame');
    }

    if (MAP.AUTO_CENTER && !this._userInteracting) {
      const visible = [];
      for (const groupSats of Object.values(this.sats)) {
        for (const sat of groupSats) {
          const trail = sat.trail;
          if (trail.length && this.groupInfo[sat.groupKey].visible) {
            visible.push(trail[trail.length - 1]);
          }
        }
      }
      if (visible.length) {
        const mean = visible.reduce(
          (a, b) => [a[0] + b[0], a[1] + b[1]], [0, 0]
        ).map(v => v / visible.length);
        this._targetCenter = L.latLng(mean);
      }
      const dLat = this._targetCenter.lat - this._currentCenter.lat;
      const dLon = this._targetCenter.lng - this._currentCenter.lng;
      this._currentCenter = L.latLng(
        this._currentCenter.lat + dLat * MAP.AUTO_CENTER_SPEED,
        this._currentCenter.lng + dLon * MAP.AUTO_CENTER_SPEED
      );
      const dist = this._currentCenter.distanceTo(this._targetCenter);
      if (dist > 0.02) {
        this.map.setView(
          [this._currentCenter.lat, this._currentCenter.lng],
          this.map.getZoom(),
          { animate: false }
        );
      }
    }

    requestAnimationFrame(() => this.animate());
  }
}

export { LeafletView };

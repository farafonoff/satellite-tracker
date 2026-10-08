// js/main.js - RASSVET satellite tracker (Leaflet 2D flat map)
import {
  CDN_URLS,
  DEFAULT_GROUPS,
  GROUP_COLORS,
  TIME_SPEED,
  RENDER,
  MAP
} from './config.js';
import * as utils from './utils.js';

// ---------- helpers ----------
function normalizeKey(key) {
  return key.toLowerCase().replace(/\s+/g, '-');
}
function groupKeyToName(key) {
  return key.replace(/-/g, ' ');
}
function formatClock(date) {
  return date.toISOString().slice(0, 19).replace('T', ' ') + ' UTC';
}

// ---------- UI helpers ----------
function createCheckbox(labelText, groupName) {
  const label = document.createElement('label');
  label.style.cssText = 'display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;color:#fff;user-select:none;';
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.dataset.group = groupName;
  cb.checked = true;
  cb.addEventListener('change', () => {
    leafView.handleGroupToggle(groupName, cb.checked);
  });
  const name = document.createElement('span');
  name.textContent = labelText;
  label.appendChild(cb);
  label.appendChild(name);
  return { checkbox: cb, label: label };
}

function createDot(color) {
  const dot = document.createElement('div');
  dot.style.cssText =
    'width:10px;height:10px;border-radius:50%;background:' +
    color + ';display:inline-block;vertical-align:middle;margin-right:6px;';
  return dot;
}

// ---------- Viewer ----------
class LeafletView {
  constructor() {
    this.map = null;
    this.sats = {};
    this.groupInfo = {};
    this.running = true;
    this.speed = TIME_SPEED.default;
    this._simTime = null;
    this._playStartTime = null;
    this._playSimStart = null;
    this._animationId = null;
    this._currentCenter = null;
    this._targetCenter = null;
    this._userInteracting = false;
    this._lastFrame = null;
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
    this.assignCaps();
    this.makeUI();
    this.updateUI();

    this._simTime = this._simTime || new Date();
    this.animate();

    const statusEl = document.getElementById('rassvet-status');
    if (statusEl) {
      statusEl.textContent = 'READY';
      statusEl.classList.add('ready');
    }
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
      const groupSats = [];
      for (const file of merged.files) {
        try {
          const text = await utils.loadTLEFile(file);
          const { sats } = utils.parseTLESGroup(text);
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
      const { groupName, sats } = utils.parseTLESGroup(await utils.loadTLEFile(link));
      const key = normalizeKey(groupName);
      groupEntries.push([key, { name: groupName, description: '', files: [], sats }]);
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
        sat.polyline = L.polyline([], {
          color: color,
          weight: RENDER.TRAIL_WIDTH,
          opacity: 0.7
        });
        gi.elements.markers.push(sat.marker);
        gi.elements.polylines.push(sat.polyline);
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

    const speedRow = document.createElement('label');
    speedRow.className = 'rassvet-label';
    speedRow.innerHTML = 'Speed';
    const speedRange = document.createElement('input');
    speedRange.type = 'range';
    speedRange.id = 'speed-range';
    speedRange.min = TIME_SPEED.min;
    speedRange.max = TIME_SPEED.max;
    speedRange.step = TIME_SPEED.step;
    speedRange.value = this.speed;
    speedRange.addEventListener('input', (e) => {
      this.speed = Number(e.target.value);
      this.updateUI();
    });
    const speedVal = document.createElement('span');
    speedVal.id = 'speed-val';
    speedVal.className = 'rassvet-speed-val';
    speedVal.textContent = '1x';
    speedRow.appendChild(speedRange);
    speedRow.appendChild(speedVal);
    left.appendChild(speedRow);

    const dateRow = document.createElement('label');
    dateRow.className = 'rassvet-label';
    dateRow.innerHTML = 'Date';
    const dateVal = document.createElement('span');
    dateVal.id = 'date-val';
    dateVal.textContent = formatClock(this._simTime);
    dateRow.appendChild(dateVal);
    left.appendChild(dateRow);

    const groupList = document.getElementById('rassvet-group-list');
    if (groupList) {
      const sorted = Object.entries(this.groupInfo).sort((a, b) =>
        (a[1].loadedCount || 0) - (b[1].loadedCount || 0)
      );
      for (const [key, gi] of sorted) {
        const cb = createCheckbox(
          groupKeyToName(key) + '  (' + (gi.loadedCount || 0) + ')',
          key
        );
        const dot = createDot(gi.color);
        cb.label.insertBefore(dot, cb.label.firstChild);
        cb.checkbox.addEventListener('change', () =>
          this.handleGroupToggle(key, cb.checkbox.checked)
        );
        groupList.appendChild(cb.label);
      }
    }
  }

  updateUI() {
    const btn = document.getElementById('playback-btn');
    if (btn) btn.textContent = this.running ? 'Play' : 'Pause';
    const range = document.getElementById('speed-range');
    if (range) range.value = this.speed;
    const val = document.getElementById('speed-val');
    if (val) val.textContent = this.speed + 'x';
    const dateVal = document.getElementById('date-val');
    if (dateVal) dateVal.textContent = formatClock(this._simTime);
    for (const [key, gi] of Object.entries(this.groupInfo)) {
      const cb = document.querySelector(
        'input[type="checkbox"][data-group="' + key + '"]'
      );
      if (cb) cb.checked = !!gi.visible;
    }
  }

  handleGroupToggle(key, visible) {
    const gi = this.groupInfo[key];
    if (!gi) return;
    gi.visible = visible;
    const el = gi.elements;
    for (const m of el.markers) {
      visible ? m.addTo(this.map) : this.map.removeLayer(m);
    }
    for (const p of el.polylines) {
      visible ? p.addTo(this.map) : this.map.removeLayer(p);
    }
    this.updateUI();
  }

  togglePlayback() {
    this.running = !this.running;
    if (this.running) {
      this._playStartTime = Date.now();
      this._playSimStart = new Date(this._simTime);
      this.animate();
    }
    this.updateUI();
  }

  animate() {
    if (!this.running) return;
    const now = Date.now();
    this._lastFrame = now;

    if (this.running && this._playStartTime) {
      const realSec = (now - this._playStartTime) / 1000;
      this._simTime = new Date(
        this._playSimStart.getTime() + realSec * this.speed * 1000
      );
    }
    this.updateUI();

    let addedCount = 0;
    for (const groupSats of Object.values(this.sats)) {
      for (const sat of groupSats) {
        if (!sat.satrec) continue;
        try {
          const result = satellite.propagate(sat.satrec, this._simTime);
          if (!result || result.position.x === 0) continue;
          const [lat, lng] = utils.posEcfToLatLng(result.position, this._simTime);
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
          // debug: show raw position + parse error for first sat
          if (!this._debugLogged) {
            this._debugLogged = true;
            console.log('RASSVET DEBUG: sat', sat.name, 'satrec.error =', sat.satrec.error,
                        'pos =', JSON.stringify(result.position),
                        'time =', this._simTime?.toISOString());
          }
          // cadence: add to the trail once per RENDER.TRAIL_CADENCE_SEC, not every
          // frame; always push the first point immediately so the polyline is never
          // a single invisible point, then keep the wave growing at cadence.
          const pushEvery = RENDER.TRAIL_CADENCE_SEC * 1000;
          if (sat.trail.length === 0 || now - (sat._lastTrailPush || 0) >= pushEvery) {
            sat.trail.push([lat, lng]);
            sat._lastTrailPush = now;
            // hard cap the array so it cannot grow without bound
            if (sat.trail.length > RENDER.MAX_TRAIL_POINTS * 4) {
              sat.trail.splice(0, sat.trail.length - RENDER.MAX_TRAIL_POINTS * 2);
            }
          }
          // downsample long trails before drawing (preserves the wave shape)
          const drawn = utils.downsampleLatLngs(sat.trail, RENDER.MAX_TRAIL_POINTS);
          sat.marker.setLatLng([lat, lng]);
          sat.polyline.setLatLngs(drawn);
          if (this.groupInfo[sat.groupKey].visible && !sat.addedToMap) {
            sat.marker.addTo(this.map);
            sat.polyline.addTo(this.map);
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

// Bootstrap: attach to window and start.
const leafView = new LeafletView();
window.leafView = leafView;
leafView.init().catch(e => {
  console.error('RASSVET: failed to initialize', e);
  if (window.rassvetShowError) window.rassvetShowError('RASSVET: ' + e.message);
});

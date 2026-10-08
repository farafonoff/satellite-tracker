// js/view_helpers.js - small view helpers for RASSVET (extracted from main.js)

export function normalizeKey(key) {
  return key.toLowerCase().replace(/\s+/g, '-').replace(/_/g, '-');
}
export function groupKeyToName(key) {
  return key.replace(/-/g, ' ');
}
export function formatClock(date) {
  return date.toISOString().slice(0, 19).replace('T', ' ') + ' UTC';
}
export function createCheckbox(labelText, groupName, onToggle) {
  const label = document.createElement('label');
  label.style.cssText = 'display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;color:#fff;user-select:none;';
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.dataset.group = groupName;
  cb.checked = true;
  cb.addEventListener('change', () => {
    onToggle(groupName, cb.checked);
  });
  const name = document.createElement('span');
  name.textContent = labelText;
  label.appendChild(cb);
  label.appendChild(name);
  return { checkbox: cb, label: label };
}

export function createDot(color) {
  const dot = document.createElement('div');
  dot.style.cssText =
    'width:10px;height:10px;border-radius:50%;background:' +
    color + ';display:inline-block;vertical-align:middle;margin-right:6px;';
  return dot;
}

/** Split an array of [lat,lng] into segments whenever the longitude jumps
 * across the antimeridian (Leaflet would otherwise draw across the whole map). */
export function splitAroundAntimeridian(points) {
  if (!points || points.length <= 1) return [points.slice()];
  const segments = [];
  let seg = [points[0].slice()];
  for (let i = 1; i < points.length; i++) {
    const prev = seg[seg.length - 1][1];
    const cur = points[i][1];
    if (Math.abs(cur - prev) > 180) {
      segments.push(seg);
      seg = [points[i].slice()];
    } else {
      seg.push(points[i].slice());
    }
  }
  segments.push(seg);
  return segments;
}

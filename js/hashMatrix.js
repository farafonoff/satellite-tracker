// js/hashMatrix.js - selection matrix encoding for the URL hash
//
// Format: #satellites=[key1,key2,...]
//   selected group keys are listed, sorted alphabetically; every group NOT
//   listed is hidden. A missing or malformed matrix defaults to everything visible.

/**
 * Parse the selection matrix out of a hash fragment.
 * @param {string} hash  hash string WITHOUT the leading '#'.
 * @param {string[]} groupKeys  all group keys currently loaded by the app.
 * @returns {Set<string>}  the set of keys that are visible.
 */
export function parseSelectionHash(hash, groupKeys) {
  const selected = new Set(groupKeys); // default: everything visible
  const eq = hash.indexOf('=');
  if (eq === -1) return selected;
  const tail = hash.slice(eq + 1);
  const m = tail.match(/^\[(.*)\]$/);
  if (!m) return selected; // malformed: ignore and keep default
  const keys = m[1].split(',').map(k => k.trim()).filter(Boolean);
  // enable only keys that actually exist in the app; unknown keys are dropped
  return new Set(keys.filter(k => selected.has(k)));
}

/**
 * Build the hash fragment for the current selection matrix.
 * @param {Object.<string,{visible:boolean}>} groupInfo
 * @returns {string}  e.g. "satellites=[geo,glonass]"
 */
export function buildSelectionHash(groupInfo) {
  const keys = Object.keys(groupInfo)
    .filter(k => groupInfo[k].visible)
    .sort();
  return 'satellites=[' + keys.join(',') + ']';
}

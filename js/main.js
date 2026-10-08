// js/main.js - RASSVET satellite tracker (Leaflet 2D flat map)
import { normalizeKey, groupKeyToName, formatClock } from './view_helpers.v2.js?v=11';
import { createCheckbox, createDot } from './view_helpers.v2.js?v=11';
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
// (now imported from './view_helpers.js')

// ---------- UI helpers ----------
// (now imported from './view_helpers.js')

// js/main.js - RASSVET satellite tracker (Leaflet 2D flat map), entry point
import { LeafletView } from './view.js?v=11';

// ---------- helpers ----------
// (moved to './view_helpers.js')

// ---------- UI helpers ----------
// (moved to './view_helpers.js')

// Bootstrap: attach to window and start.
const leafView = new LeafletView();
window.leafView = leafView;
leafView.init().catch(e => {
  console.error('RASSVET: failed to initialize', e);
  if (window.rassvetShowError) window.rassvetShowError('RASSVET: ' + e.message);
});

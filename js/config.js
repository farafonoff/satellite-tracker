// js/config.js - RASSVET configuration

// External dependencies (loaded from CDN in index.html; satellite.js also has
// a local bundled copy). All working: jsdelivr + OSM tile serving.
export const CDN_URLS = {
  satelliteJs:  'https://cdn.jsdelivr.net/npm/satellite.js@3.0.1/satellite.mjs',
  satelliteJsFallback: 'js/satellite.mjs'
};

// Satellite groups requested by the RASSVET theme. Each entry is populated at
// runtime from data/catalog.json (or auto-discovered from data/tles/*.txt when
// the catalog is absent). Group keys are used as JS identifiers; names are display names.
export const DEFAULT_GROUPS = {
  'resurs-p':   { name: 'Resurs-P',   description: 'Resurs-P high-resolution Earth observation' },
  'meteor-m':   { name: 'Meteor-M',   description: 'Meteor-M polar-orbiting weather satellites' },
  'kanopus-v':  { name: 'Kanopus-V',  description: 'Kanopus-V Earth observation satellites' },
  'express-geo': { name: 'Express-Geo', description: 'Express-Geo geostationary communications' },
  'glonass':    { name: 'GLONASS',    description: 'GLONASS global navigation constellation'  },
  'luch':       { name: 'Luch',       description: 'Luch relay communications'  },
  'starlink':   { name: 'Starlink',   description: 'Starlink broadband constellation (demo)'  },
  'testsats':   { name: 'Test Sats',  description: 'Test satellites (demo)'  },
  'geo':        { name: 'GEO',        description: 'Geostationary Russian communications' },
  'molniya-anomalous': { name: 'Molniya Anom', description: 'Molniya-type satellites (anomalous data)' },
  'rusnet':     { name: 'RusNet',     description: 'Russian high-speed network constellation' },
  'rassvet':    { name: 'Rassvet',    description: 'Rassvet satellite group' }
};

// Marker color per group (visible on the dark theme).
export const GROUP_COLORS = {
  'resurs-p':    '#4FC3F7',
  'meteor-m':    '#81C784',
  'kanopus-v':   '#FFD54F',
  'express-geo': '#F48FB1',
  'glonass':     '#BA68C8',
  'luch':        '#E0E0E0',
  'starlink':    '#7E57C2',
  'testsats':    '#FFB74D',
  'geo':         '#FB8C00',
  'molniya-anomalous': '#E53935',
  'rusnet':      '#00ACC1',
  'rassvet':     '#FF8A65'
};

// Time / simulation speed controls (1x realtime is the starting speed).
export const TIME_SPEED = { min: 1, max: 100, default: 1, step: 1 };

// Rendering limits for performance (markers + polyline trails).
export const RENDER = {
  MAX_VISIBLE_SATS: 250,       // hard cap on simultaneously rendered satellites
  TRAIL_LENGTH:     40,        // legacy; trail is now cadence/downsample/time-controlled
  MARKER_SCALE:     0.75,      // marker size scaling factor
  TRAIL_WIDTH:      3,         // trail polyline width in pixels
  TRAIL_OPACITY:    0.85,      // trail polyline opacity
  TRAIL_CADENCE_SEC: 1,        // append one historical point per N seconds of sim time
  TRAIL_LENGTH_SEC: 3600,      // default trail length in seconds (1 hour)
  MAX_TRAIL_POINTS: 400,       // drawn points after downsample (keeps the wave smooth)
  MAX_TRAIL_HIST:   10000      // hard cap on historical buffer (~2.8h @ 1s cadence)
};

// Flat-map (Leaflet) view settings.
export const MAP = {
  TILE_URL:   'https://tile.openstreetmap.org/{z}/{x}/{y}.png',  // OSM basemap
  START_LAT:  35,                 // initial map center lat
  START_LON:  90,                 // initial map center lon
  START_ZOOM: 3,                  // initial zoom
  AUTO_CENTER: false,             // keep map centered on the visible-sat mean position
  AUTO_CENTER_SPEED: 0.15         // fraction of remaining distance to center per frame
};

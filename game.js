// ============================================================
// NEON CHECKERS - 3D Browser Checkers
// Three.js + retro 80s synthwave UI on a kitchen table
// ============================================================
import * as THREE from 'three';

// ------------------------------------------------------------
// Constants
// ------------------------------------------------------------
const SQUARE = 1.0;
const BOARD_THICKNESS = 0.45;
const BOARD_TOP_Y = BOARD_THICKNESS / 2; // top surface of board base box
const SQUARE_TOP_Y = BOARD_TOP_Y + 0.06; // top of inlaid square tiles
const PIECE_Y = SQUARE_TOP_Y + 0.005;     // pieces rest on the square tops
const RED = 'red';
const BLACK = 'black';

const COLORS = {
  redPiece:        0xc9152a,
  redPieceAccent:  0xffd23f,
  blackPiece:      0x1a0d2e,
  blackPieceAccent:0x9a4dff,
  woodLight:       0xe7c189,
  woodDark:        0x4a2418,
  frame:           0x3a1a0c,
  table:           0x6b3a1a,
  validMove:       0x00f0ff,
  selected:        0xffd23f,
  jump:            0xff2d95,
};

// ------------------------------------------------------------
// Game state
// ------------------------------------------------------------
const state = {
  mode: '2p',          // '1p' or '2p'
  difficulty: 'easy',
  board: [],           // board[row][col] = { color, king, mesh } | null
  current: RED,
  selected: null,      // {row, col} | null
  validMoves: [],      // current selectable moves for selected piece
  mustJumpFrom: null,  // {row,col} when multi-jumping
  scores: { red: 0, black: 0 },
  pieceCount: { red: 12, black: 12 },
  busy: false,
  gameOver: false,
  comboCount: 0,
};

// ------------------------------------------------------------
// Three.js essentials
// ------------------------------------------------------------
let scene, camera, renderer;
let raycaster, pointer;
let pieceGroup, highlightGroup, squareGroup;
const squareMeshes = [];      // 64 square meshes for raycasting
const validMoveMarkers = [];  // ring meshes for valid moves

// ============================================================
// BOOT
// ============================================================
init();

function init() {
  setupRenderer();
  setupSceneBase();
  buildTable();
  pieceGroup = new THREE.Group();
  squareGroup = new THREE.Group();
  highlightGroup = new THREE.Group();
  scene.add(squareGroup, highlightGroup, pieceGroup);
  buildBoard();

  raycaster = new THREE.Raycaster();
  pointer = new THREE.Vector2();
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', () => setTimeout(onResize, 50));
  renderer.domElement.addEventListener('pointerdown', onPointerDown);

  attachUI();
  onResize(); // fit camera for current viewport (incl. iOS portrait)
  animate();
}

// ============================================================
// THREE.JS SETUP
// ============================================================
function setupRenderer() {
  const wrap = document.getElementById('canvas-wrap');
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  wrap.appendChild(renderer.domElement);
}

function setupSceneBase() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0d0420);
  scene.fog = new THREE.Fog(0x0d0420, 14, 32);

  camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 8.5, 9.5);
  camera.lookAt(0, 0, 0);

  // Warm ambient (kitchen feel)
  scene.add(new THREE.AmbientLight(0xffe7c4, 0.45));

  // Hanging pendant lamp
  const pendant = new THREE.PointLight(0xffd29a, 1.8, 28, 1.4);
  pendant.position.set(0, 7, 0);
  pendant.castShadow = true;
  pendant.shadow.mapSize.set(1024, 1024);
  pendant.shadow.bias = -0.0008;
  pendant.shadow.radius = 4;
  scene.add(pendant);

  // Subtle violet rim from the synthwave room
  const rim = new THREE.DirectionalLight(0xa64dff, 0.4);
  rim.position.set(-6, 5, -6);
  scene.add(rim);

  const fill = new THREE.DirectionalLight(0x00f0ff, 0.18);
  fill.position.set(8, 4, 8);
  scene.add(fill);

  // Bulb visualization
  const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0xfff2c4 })
  );
  bulb.position.copy(pendant.position);
  scene.add(bulb);

  // Lamp shade (cone) above bulb
  const shade = new THREE.Mesh(
    new THREE.ConeGeometry(0.7, 0.6, 24, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x8a3030, roughness: 0.6, side: THREE.DoubleSide, emissive: 0x401010, emissiveIntensity: 0.15 })
  );
  shade.position.set(0, 7.5, 0);
  scene.add(shade);

  // Cord
  const cord = new THREE.Mesh(
    new THREE.CylinderGeometry(0.015, 0.015, 4, 6),
    new THREE.MeshStandardMaterial({ color: 0x111 })
  );
  cord.position.set(0, 9.7, 0);
  scene.add(cord);
}

// ============================================================
// PROCEDURAL TEXTURES
// ============================================================
function makeWoodTexture(baseHex, darkHex, scale = 1) {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const ctx = c.getContext('2d');
  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, 512, 512);

  // grain streaks
  for (let i = 0; i < 90; i++) {
    ctx.strokeStyle = `rgba(0,0,0,${Math.random() * 0.18 + 0.04})`;
    ctx.lineWidth = Math.random() * 1.6 + 0.4;
    ctx.beginPath();
    let y = Math.random() * 512;
    ctx.moveTo(0, y);
    for (let x = 0; x < 512; x += 6) {
      y += (Math.random() - 0.5) * 4;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // knots
  for (let i = 0; i < 5; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const r = Math.random() * 12 + 5;
    const g = ctx.createRadialGradient(x, y, 1, x, y, r);
    g.addColorStop(0, darkHex);
    g.addColorStop(0.6, darkHex + '88');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(scale, scale);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makePieceFaceTexture(color) {
  // color: 'red' or 'black' (drives palette)
  const isRed = color === RED;
  const base = isRed ? '#9c0e1f' : '#15091f';
  const accent = isRed ? '#ffd23f' : '#a64dff';
  const accentSoft = isRed ? '#ff7a7a' : '#5e2db2';
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const ctx = c.getContext('2d');

  // Fill entire canvas to ensure no transparent corners (no sorting issues)
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 512, 512);

  // radial highlight (engraved feel)
  const grd = ctx.createRadialGradient(256, 220, 30, 256, 256, 250);
  grd.addColorStop(0, 'rgba(255,255,255,0.18)');
  grd.addColorStop(0.5, 'rgba(255,255,255,0.04)');
  grd.addColorStop(1, 'rgba(0,0,0,0.30)');
  ctx.fillStyle = grd;
  ctx.beginPath(); ctx.arc(256, 256, 250, 0, Math.PI * 2); ctx.fill();

  // outer dotted ring
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * Math.PI * 2;
    const x = 256 + Math.cos(a) * 222;
    const y = 256 + Math.sin(a) * 222;
    ctx.fillStyle = accent;
    ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill();
  }

  // inner ring
  ctx.strokeStyle = accent;
  ctx.lineWidth = 4;
  ctx.beginPath(); ctx.arc(256, 256, 195, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(256, 256, 180, 0, Math.PI * 2); ctx.stroke();

  // engraved 8-point star (shadow first)
  ctx.save();
  ctx.translate(2, 3);
  drawStar(ctx, 256, 256, 8, 140, 60, 'rgba(0,0,0,0.55)');
  ctx.restore();
  drawStar(ctx, 256, 256, 8, 140, 60, accent);

  // central inner star highlight
  drawStar(ctx, 256, 256, 8, 110, 45, accentSoft);

  // letter "C" badge
  ctx.fillStyle = base;
  ctx.beginPath(); ctx.arc(256, 256, 56, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = accent;
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(256, 256, 56, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = accent;
  ctx.font = 'bold 78px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('C', 256, 264);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function makeKingFaceTexture(color) {
  const isRed = color === RED;
  const base = isRed ? '#9c0e1f' : '#15091f';
  const accent = isRed ? '#ffd23f' : '#a64dff';
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const ctx = c.getContext('2d');

  // Fill entire canvas (opaque)
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 512, 512);

  // dotted outer ring (denser for king)
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    const x = 256 + Math.cos(a) * 222;
    const y = 256 + Math.sin(a) * 222;
    ctx.fillStyle = accent;
    ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.fill();
  }
  ctx.strokeStyle = accent;
  ctx.lineWidth = 5;
  ctx.beginPath(); ctx.arc(256, 256, 200, 0, Math.PI * 2); ctx.stroke();

  // crown shape
  ctx.save();
  ctx.translate(256, 280);
  // crown base
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.moveTo(-110, 30);
  ctx.lineTo(110, 30);
  ctx.lineTo(110, 0);
  ctx.lineTo(-110, 0);
  ctx.closePath();
  ctx.fill();
  // 5 points
  const tips = [-110, -55, 0, 55, 110];
  ctx.beginPath();
  ctx.moveTo(-110, 0);
  for (let i = 0; i < tips.length; i++) {
    const x = tips[i];
    const peak = (i % 2 === 0) ? -90 : -60;
    ctx.lineTo(x, peak);
    if (i < tips.length - 1) {
      const nx = tips[i+1];
      ctx.lineTo((x + nx) / 2, -10);
    }
  }
  ctx.lineTo(110, 0);
  ctx.closePath();
  ctx.fill();
  // jewels
  ctx.fillStyle = '#ff2d95';
  ctx.beginPath(); ctx.arc(-55, -50, 8, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(0, -75, 10, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(55, -50, 8, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#00f0ff';
  ctx.beginPath(); ctx.arc(-100, 15, 6, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(100, 15, 6, 0, Math.PI * 2); ctx.fill();
  ctx.restore();

  // K letter under crown
  ctx.fillStyle = accent;
  ctx.font = 'bold 56px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('K', 256, 130);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function drawStar(ctx, cx, cy, points, outer, inner, fill) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const r = (i % 2 === 0) ? outer : inner;
    const a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
}

// ============================================================
// TABLE + BOARD
// ============================================================
function buildTable() {
  const tableTex = makeWoodTexture('#8b5a2b', '#3d1d09', 1);

  // Round kitchen tabletop
  const top = new THREE.Mesh(
    new THREE.CylinderGeometry(11, 11, 0.5, 64),
    new THREE.MeshStandardMaterial({ map: tableTex, roughness: 0.7, metalness: 0.05 })
  );
  top.position.y = -0.3;
  top.receiveShadow = true;
  scene.add(top);

  // Edge ring (decorative beveled lip on table)
  const lip = new THREE.Mesh(
    new THREE.TorusGeometry(11, 0.18, 12, 80),
    new THREE.MeshStandardMaterial({ color: 0x3d1d09, roughness: 0.6 })
  );
  lip.rotation.x = Math.PI / 2;
  lip.position.y = -0.05;
  scene.add(lip);

  // Pedestal leg (thick column)
  const leg = new THREE.Mesh(
    new THREE.CylinderGeometry(1.0, 1.4, 4, 24),
    new THREE.MeshStandardMaterial({ map: tableTex, roughness: 0.8 })
  );
  leg.position.y = -2.3;
  leg.castShadow = true;
  scene.add(leg);

  // Floor (for grounding)
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(40, 48),
    new THREE.MeshStandardMaterial({ color: 0x140a25, roughness: 0.95 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -4.5;
  floor.receiveShadow = true;
  scene.add(floor);
}

function buildBoard() {
  const lightTex = makeWoodTexture('#e7c189', '#7a4a1c', 1);
  const darkTex  = makeWoodTexture('#4a2418', '#1a0902', 1);
  const frameTex = makeWoodTexture('#3a1a0c', '#100400', 1);

  // ---- Frame base (large) ----
  const FRAME_OUTER = 9.6;
  const FRAME_INNER = 8.0;
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(FRAME_OUTER, BOARD_THICKNESS, FRAME_OUTER),
    new THREE.MeshStandardMaterial({ map: frameTex, roughness: 0.55 })
  );
  base.position.y = 0;
  base.receiveShadow = true;
  base.castShadow = true;
  scene.add(base);

  // ---- Inlaid playing area (slightly recessed with squares on top) ----
  // We give the board's top surface 64 alternating squares as separate meshes
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const isDark = (row + col) % 2 === 0;
      const mat = new THREE.MeshStandardMaterial({
        map: isDark ? darkTex : lightTex,
        roughness: isDark ? 0.45 : 0.55,
        metalness: 0.05,
      });
      const sq = new THREE.Mesh(new THREE.BoxGeometry(SQUARE, 0.06, SQUARE), mat);
      const { x, z } = boardToWorld(row, col);
      sq.position.set(x, BOARD_TOP_Y + 0.03, z); // top of square at SQUARE_TOP_Y
      sq.receiveShadow = true;
      sq.userData = { type: 'square', row, col, isDark, baseEmissive: 0x000000 };
      mat.emissive = new THREE.Color(0x000000);
      mat.emissiveIntensity = 0.0;
      squareGroup.add(sq);
      squareMeshes.push(sq);
    }
  }

  // ---- Ridges around the edge of the frame ----
  // Layered molding: concentric raised lips (in HALF-widths from board center).
  buildFrameMoldings(FRAME_OUTER / 2, FRAME_INNER / 2);
}

function buildFrameMoldings(outerHalf, innerHalf) {
  const matBase = new THREE.MeshStandardMaterial({ color: 0x3a1a0c, roughness: 0.5 });
  const matAccent = new THREE.MeshStandardMaterial({
    color: 0xffd23f, emissive: 0x442200, emissiveIntensity: 0.35,
    roughness: 0.35, metalness: 0.55,
  });

  // Each ridge is a rectangular ring spanning [innerHalf..outerHalf] half-widths.
  const ridges = [
    { o: outerHalf,        i: outerHalf - 0.10, h: 0.20, y: BOARD_TOP_Y + 0.10, m: matBase   }, // tallest outer lip
    { o: outerHalf - 0.10, i: outerHalf - 0.18, h: 0.10, y: BOARD_TOP_Y + 0.05, m: matAccent }, // gold pinstripe
    { o: outerHalf - 0.18, i: outerHalf - 0.32, h: 0.16, y: BOARD_TOP_Y + 0.08, m: matBase   }, // mid rail
    { o: outerHalf - 0.32, i: outerHalf - 0.38, h: 0.06, y: BOARD_TOP_Y + 0.03, m: matAccent }, // secondary gold
    { o: outerHalf - 0.38, i: innerHalf,        h: 0.12, y: BOARD_TOP_Y + 0.06, m: matBase   }, // inner shoulder
  ];

  for (const r of ridges) {
    const w = r.o - r.i;
    if (w <= 0) continue;
    const center = (r.o + r.i) / 2;     // centerline distance from board origin
    const fullLen = r.o * 2;            // full length of horizontal segments
    const sideLen = (r.i + r.o) - 2 * w; // length of vertical segments to avoid corner overlap

    const top = new THREE.Mesh(new THREE.BoxGeometry(fullLen, r.h, w), r.m);
    top.position.set(0, r.y, -center);
    const bot = top.clone();
    bot.position.z = center;
    const left = new THREE.Mesh(new THREE.BoxGeometry(w, r.h, Math.max(0.01, sideLen)), r.m);
    left.position.set(-center, r.y, 0);
    const right = left.clone();
    right.position.x = center;
    [top, bot, left, right].forEach(m => { m.castShadow = true; m.receiveShadow = true; });
    scene.add(top, bot, left, right);
  }

  // Decorative corner caps with neon star
  const cornerMat = new THREE.MeshStandardMaterial({
    color: 0xffd23f, roughness: 0.3, metalness: 0.65,
    emissive: 0x553300, emissiveIntensity: 0.5,
  });
  const corners = [[-1,-1],[-1,1],[1,-1],[1,1]];
  const cornerOffset = outerHalf - 0.05;
  for (const [sx, sz] of corners) {
    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.26, 0.30, 0.28, 20),
      cornerMat
    );
    cap.position.set(sx * cornerOffset, BOARD_TOP_Y + 0.18, sz * cornerOffset);
    cap.castShadow = true;
    scene.add(cap);
    const star = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.13),
      new THREE.MeshStandardMaterial({
        color: 0xff2d95, emissive: 0xff2d95, emissiveIntensity: 0.8, metalness: 0.5,
      })
    );
    star.position.set(sx * cornerOffset, BOARD_TOP_Y + 0.40, sz * cornerOffset);
    star.rotation.y = Math.PI / 4;
    scene.add(star);
  }
}

// ============================================================
// PIECES
// ============================================================
function buildPieceMesh(color, isKing) {
  const group = new THREE.Group();

  // ---- Lathed body with ridged side profile ----
  // Profile starts at (baseR, 0) so there's NO bottom cap (we'll close with a
  // textured bottomFace), and ends at (0, height) producing only the top cap.
  const points = [];
  const baseR = 0.40;
  const ridgeR = 0.43;
  const layers = [
    { r: baseR,    y: 0.00 },
    { r: ridgeR,   y: 0.025 },
    { r: baseR,    y: 0.05 },
    { r: ridgeR,   y: 0.075 },
    { r: baseR,    y: 0.10 },
    { r: ridgeR,   y: 0.125 },
    { r: baseR,    y: 0.15 },
    { r: ridgeR,   y: 0.175 },
    { r: baseR - 0.01, y: 0.20 },
    { r: 0,        y: 0.20 },
  ];
  for (const p of layers) points.push(new THREE.Vector2(p.r, p.y));

  const bodyMat = new THREE.MeshStandardMaterial({
    color: color === RED ? COLORS.redPiece : COLORS.blackPiece,
    roughness: 0.45,
    metalness: 0.25,
    emissive: color === RED ? 0x300405 : 0x080414,
    emissiveIntensity: 0.25,
  });

  const body = new THREE.Mesh(new THREE.LatheGeometry(points, 48), bodyMat);
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  // ---- Top face decal (imprinted graphic) ----
  const topTex = isKing ? makeKingFaceTexture(color) : makePieceFaceTexture(color);
  const topMat = new THREE.MeshStandardMaterial({
    map: topTex, roughness: 0.32, metalness: 0.2,
  });
  const topFace = new THREE.Mesh(new THREE.CircleGeometry(0.39, 48), topMat);
  topFace.rotation.x = -Math.PI / 2;
  topFace.position.y = 0.205;
  group.add(topFace);

  // ---- Bottom face decal (visible during capture flip) ----
  const botTex = isKing ? makeKingFaceTexture(color) : makePieceFaceTexture(color);
  const botMat = new THREE.MeshStandardMaterial({
    map: botTex, roughness: 0.32, metalness: 0.2,
  });
  const bottomFace = new THREE.Mesh(new THREE.CircleGeometry(0.39, 48), botMat);
  bottomFace.rotation.x = Math.PI / 2;     // face -Y
  bottomFace.position.y = 0.001;            // sits inside the open bottom of the lathe
  group.add(bottomFace);

  // ---- King: extra crown puck ----
  if (isKing) {
    const crown = new THREE.Mesh(
      new THREE.CylinderGeometry(0.30, 0.34, 0.12, 36),
      new THREE.MeshStandardMaterial({
        color: color === RED ? 0xffd23f : 0xa64dff,
        emissive: color === RED ? 0x553300 : 0x2a1066,
        emissiveIntensity: 0.6,
        metalness: 0.7,
        roughness: 0.25,
      })
    );
    crown.position.y = 0.26;
    crown.castShadow = true;
    group.add(crown);
    // Spike on top
    const spike = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.10),
      new THREE.MeshStandardMaterial({
        color: 0xff2d95, emissive: 0xff2d95, emissiveIntensity: 0.8, metalness: 0.6
      })
    );
    spike.position.y = 0.40;
    group.add(spike);
  }

  group.userData = { type: 'piece' };
  return group;
}

// ============================================================
// COORDINATE HELPERS
// ============================================================
function boardToWorld(row, col) {
  // row 0 -> closest to camera (+Z); row 7 -> back (-Z)
  return {
    x: (col - 3.5) * SQUARE,
    z: (3.5 - row) * SQUARE,
  };
}
function inBounds(r, c) { return r >= 0 && r < 8 && c >= 0 && c < 8; }

// ============================================================
// GAME RESET / NEW GAME
// ============================================================
function newGame() {
  // Clear meshes
  while (pieceGroup.children.length) {
    const m = pieceGroup.children[0];
    pieceGroup.remove(m);
    disposeGroup(m);
  }
  clearValidMoveMarkers();
  clearSquareHighlights();

  // Reset state
  state.board = Array.from({ length: 8 }, () => Array(8).fill(null));
  state.current = RED;
  state.selected = null;
  state.validMoves = [];
  state.mustJumpFrom = null;
  state.scores = { red: 0, black: 0 };
  state.pieceCount = { red: 12, black: 12 };
  state.busy = false;
  state.gameOver = false;
  state.comboCount = 0;

  // Place pieces. RED at near rows (0,1,2). BLACK at far rows (5,6,7).
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const isDark = (row + col) % 2 === 0;
      if (!isDark) continue;
      let color = null;
      if (row < 3) color = RED;
      else if (row > 4) color = BLACK;
      if (color) {
        const piece = { color, king: false };
        const mesh = buildPieceMesh(color, false);
        const { x, z } = boardToWorld(row, col);
        mesh.position.set(x, PIECE_Y, z);
        piece.mesh = mesh;
        pieceGroup.add(mesh);
        state.board[row][col] = piece;
      }
    }
  }

  updateHUD();
}

function disposeGroup(g) {
  g.traverse(o => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (m.map) m.map.dispose();
        m.dispose();
      }
    }
  });
}

// ============================================================
// MOVE GENERATION
// ============================================================
function getMovesForPiece(board, r, c, jumpsOnly = false) {
  const piece = board[r][c];
  if (!piece) return [];
  const dirs = piece.king
    ? [[1,1],[1,-1],[-1,1],[-1,-1]]
    : (piece.color === RED ? [[1,1],[1,-1]] : [[-1,1],[-1,-1]]);

  const moves = [];

  if (!jumpsOnly) {
    for (const [dr, dc] of dirs) {
      const nr = r + dr, nc = c + dc;
      if (inBounds(nr, nc) && !board[nr][nc]) {
        moves.push({ fromRow: r, fromCol: c, toRow: nr, toCol: nc, captures: [] });
      }
    }
  }
  for (const [dr, dc] of dirs) {
    const mr = r + dr, mc = c + dc;
    const lr = r + 2 * dr, lc = c + 2 * dc;
    if (inBounds(lr, lc) && !board[lr][lc] && inBounds(mr, mc)
        && board[mr][mc] && board[mr][mc].color !== piece.color) {
      moves.push({ fromRow: r, fromCol: c, toRow: lr, toCol: lc, captures: [{ row: mr, col: mc }] });
    }
  }
  return moves;
}

function getAllMoves(board, color) {
  let regular = [], jumps = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (!p || p.color !== color) continue;
      const ms = getMovesForPiece(board, r, c);
      for (const m of ms) {
        if (m.captures.length) jumps.push(m); else regular.push(m);
      }
    }
  }
  return jumps.length ? jumps : regular;
}

// ============================================================
// INPUT (clicks) and SELECTION
// ============================================================
function onPointerDown(e) {
  if (state.busy || state.gameOver) return;
  if (state.mode === '1p' && state.current === BLACK) return; // AI's turn

  pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);

  // Check clicked square via squareMeshes (always the visible top of board)
  const hits = raycaster.intersectObjects(squareMeshes, false);
  if (!hits.length) {
    deselect();
    return;
  }
  const sq = hits[0].object.userData;
  const { row, col } = sq;

  // If a valid-move target was clicked while a piece is selected -> move
  if (state.selected) {
    const move = state.validMoves.find(m => m.toRow === row && m.toCol === col);
    if (move) {
      executeMove(move);
      return;
    }
  }

  // Otherwise try to select a piece
  const piece = state.board[row] && state.board[row][col];

  // Mid multi-jump: only the jumping piece is selectable
  if (state.mustJumpFrom &&
      (state.mustJumpFrom.row !== row || state.mustJumpFrom.col !== col)) {
    flashRejectedSquare(row, col);
    showToast('FINISH THE JUMP!', 'COMPLETE THE COMBO', 'combo');
    hintSquares([state.mustJumpFrom], 0xffd23f);
    return;
  }

  if (piece && piece.color === state.current) {
    selectPiece(row, col);
  } else if (piece && piece.color !== state.current) {
    // Clicked an opponent piece
    flashRejectedSquare(row, col);
    deselect();
  } else {
    deselect();
  }
}

function selectPiece(row, col) {
  // Compute valid moves for this piece, respecting forced-jump rules
  const allPlayerMoves = getAllMoves(state.board, state.current);
  const playerHasJump = allPlayerMoves.some(m => m.captures.length);

  const onlyJumps = playerHasJump || !!state.mustJumpFrom;
  const myMoves = getMovesForPiece(state.board, row, col, onlyJumps);

  let validMoves;
  if (onlyJumps) validMoves = myMoves.filter(m => m.captures.length);
  else            validMoves = myMoves;

  if (validMoves.length === 0) {
    // Explain WHY the click didn't do anything
    deselect();
    flashRejectedSquare(row, col);

    if (playerHasJump) {
      // Forced-jump rule kicked in: piece has step moves but a jump is forced elsewhere
      showToast('MUST JUMP!', `${state.current.toUpperCase()} HAS A CAPTURE`, 'combo');
      const jumperPositions = uniquePositions(allPlayerMoves.map(m => ({ row: m.fromRow, col: m.fromCol })));
      hintSquares(jumperPositions, 0xffd23f);
    } else {
      // Piece is genuinely blocked
      showToast('BLOCKED!', 'TRY ANOTHER PIECE', '');
      // Also hint pieces that DO have moves
      const movers = uniquePositions(allPlayerMoves.map(m => ({ row: m.fromRow, col: m.fromCol })));
      if (movers.length) hintSquares(movers, 0x00f0ff);
    }
    return;
  }

  state.selected = { row, col };
  state.validMoves = validMoves;
  showSelectionHighlights();
}

function uniquePositions(positions) {
  const seen = new Set();
  const out = [];
  for (const p of positions) {
    const k = `${p.row},${p.col}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(p);
  }
  return out;
}

function deselect() {
  state.selected = null;
  state.validMoves = [];
  clearValidMoveMarkers();
  clearSquareHighlights();
}

// ============================================================
// VISUAL HIGHLIGHTS
// ============================================================
function clearValidMoveMarkers() {
  for (const m of validMoveMarkers) {
    highlightGroup.remove(m);
    if (m.geometry) m.geometry.dispose();
    if (m.material) m.material.dispose();
  }
  validMoveMarkers.length = 0;
}

function clearSquareHighlights() {
  for (const sq of squareMeshes) {
    if (sq.material.emissiveIntensity) {
      sq.material.emissive.setHex(0x000000);
      sq.material.emissiveIntensity = 0;
    }
  }
}

// Brief red flash on a square the user clicked but couldn't act on
function flashRejectedSquare(row, col) {
  const sq = squareMeshes.find(s => s.userData.row === row && s.userData.col === col);
  if (!sq) return;
  sq.material.emissive.setHex(0xff2d95);
  sq.material.emissiveIntensity = 0.85;
  setTimeout(() => {
    // Don't clobber the selection highlight if a piece was selected here meanwhile
    if (state.selected && state.selected.row === row && state.selected.col === col) return;
    sq.material.emissive.setHex(0x000000);
    sq.material.emissiveIntensity = 0;
  }, 450);
}

// Transient gold/cyan rings on the legal pieces the player should consider
function hintSquares(positions, hexColor) {
  for (const p of positions) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.34, 0.46, 32),
      new THREE.MeshBasicMaterial({
        color: hexColor,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.95,
      })
    );
    ring.rotation.x = -Math.PI / 2;
    const { x, z } = boardToWorld(p.row, p.col);
    ring.position.set(x, SQUARE_TOP_Y + 0.014, z);
    highlightGroup.add(ring);

    const start = performance.now();
    const dur = 1300;
    (function fade() {
      if (!ring.parent) return;
      const t = (performance.now() - start) / dur;
      if (t >= 1) {
        highlightGroup.remove(ring);
        ring.geometry.dispose();
        ring.material.dispose();
        return;
      }
      ring.material.opacity = 0.95 * (1 - t);
      ring.scale.setScalar(1 + t * 0.5);
      requestAnimationFrame(fade);
    })();
  }
}

function showSelectionHighlights() {
  clearValidMoveMarkers();
  clearSquareHighlights();
  // Glow the selected square
  const selSq = squareMeshes.find(s => s.userData.row === state.selected.row && s.userData.col === state.selected.col);
  if (selSq) {
    selSq.material.emissive.setHex(COLORS.selected);
    selSq.material.emissiveIntensity = 0.5;
  }
  // Add glowing ring at each valid destination
  for (const m of state.validMoves) {
    const isJump = m.captures.length > 0;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.30, 0.42, 32),
      new THREE.MeshBasicMaterial({
        color: isJump ? COLORS.jump : COLORS.validMove,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.9,
      })
    );
    ring.rotation.x = -Math.PI / 2;
    const { x, z } = boardToWorld(m.toRow, m.toCol);
    ring.position.set(x, SQUARE_TOP_Y + 0.012, z);
    ring.userData.pulse = true;
    ring.userData.color = isJump ? COLORS.jump : COLORS.validMove;
    highlightGroup.add(ring);
    validMoveMarkers.push(ring);
  }
}

// ============================================================
// EXECUTING MOVES (with animation)
// ============================================================
async function executeMove(move) {
  state.busy = true;
  clearValidMoveMarkers();
  clearSquareHighlights();

  const piece = state.board[move.fromRow][move.fromCol];
  const isJump = move.captures.length > 0;

  // Update logical board
  state.board[move.fromRow][move.fromCol] = null;
  state.board[move.toRow][move.toCol] = piece;

  // Animate
  const { x: fx, z: fz } = boardToWorld(move.fromRow, move.fromCol);
  const { x: tx, z: tz } = boardToWorld(move.toRow, move.toCol);
  const arc = isJump ? 0.9 : 0.25;
  const dur = isJump ? 380 : 240;
  await tweenMesh(piece.mesh, { x: fx, y: PIECE_Y, z: fz }, { x: tx, y: PIECE_Y, z: tz }, dur, arc);

  // Resolve captures
  if (isJump) {
    for (const cap of move.captures) {
      const capPiece = state.board[cap.row][cap.col];
      if (capPiece) {
        state.board[cap.row][cap.col] = null;
        state.pieceCount[capPiece.color]--;
        // shrink + fade out
        await capturePieceAnim(capPiece.mesh);
        pieceGroup.remove(capPiece.mesh);
        disposeGroup(capPiece.mesh);
      }
    }
    state.scores[state.current]++;
    state.comboCount++;
    showJumpToast();
    spawnSparks();
  }

  // King promotion
  let promoted = false;
  if (!piece.king) {
    if (piece.color === RED && move.toRow === 7) { piece.king = true; promoted = true; }
    else if (piece.color === BLACK && move.toRow === 0) { piece.king = true; promoted = true; }
  }
  if (promoted) {
    // Replace mesh with king mesh
    const oldMesh = piece.mesh;
    pieceGroup.remove(oldMesh);
    disposeGroup(oldMesh);
    const km = buildPieceMesh(piece.color, true);
    const { x, z } = boardToWorld(move.toRow, move.toCol);
    km.position.set(x, PIECE_Y, z);
    piece.mesh = km;
    pieceGroup.add(km);
    await kingPulse(km);
    showToast('👑 KING ME! 👑', `${piece.color.toUpperCase()} CROWNED`, 'king');
  }

  updateHUD();

  // Check multi-jump opportunity for SAME piece. (American checkers rule:
  // promotion ends the turn even if more jumps would otherwise be available.)
  if (isJump && !promoted) {
    const more = getMovesForPiece(state.board, move.toRow, move.toCol, true)
                  .filter(m => m.captures.length);
    if (more.length) {
      state.mustJumpFrom = { row: move.toRow, col: move.toCol };
      state.busy = false;
      if (state.mode === '1p' && state.current === BLACK) {
        // AI continues its own multi-jump
        setTimeout(aiTurn, 350);
      } else {
        // Auto-highlight next jump for the human
        selectPiece(move.toRow, move.toCol);
      }
      return;
    }
  }

  // End turn
  state.mustJumpFrom = null;
  state.selected = null;
  state.validMoves = [];
  state.comboCount = 0;
  state.current = state.current === RED ? BLACK : RED;
  state.busy = false;

  if (checkGameOver()) return;
  updateHUD();

  // AI move?
  if (state.mode === '1p' && state.current === BLACK) {
    setTimeout(aiTurn, 380);
  } else {
    // Human turn — pre-hint forced jumps so the player knows what's expected
    const playerMoves = getAllMoves(state.board, state.current);
    if (playerMoves.length && playerMoves.every(m => m.captures.length)) {
      const jumpers = uniquePositions(playerMoves.map(m => ({ row: m.fromRow, col: m.fromCol })));
      hintSquares(jumpers, 0xffd23f);
    }
  }
}

function tweenMesh(mesh, from, to, duration, arcHeight) {
  return new Promise(resolve => {
    const start = performance.now();
    function step() {
      const t = Math.min(1, (performance.now() - start) / duration);
      const e = easeInOutCubic(t);
      mesh.position.x = from.x + (to.x - from.x) * e;
      mesh.position.z = from.z + (to.z - from.z) * e;
      mesh.position.y = from.y + (to.y - from.y) * e + (arcHeight ? Math.sin(t * Math.PI) * arcHeight : 0);
      // tiny spin during arc
      mesh.rotation.y += 0.06;
      if (t < 1) requestAnimationFrame(step);
      else resolve();
    }
    requestAnimationFrame(step);
  });
}

function capturePieceAnim(mesh) {
  return new Promise(resolve => {
    const start = performance.now();
    const dur = 380;
    const initialY = mesh.position.y;
    function step() {
      const t = Math.min(1, (performance.now() - start) / dur);
      mesh.position.y = initialY + t * 1.4;
      mesh.rotation.x = t * Math.PI * 1.5;
      mesh.rotation.z = t * Math.PI * 0.8;
      mesh.scale.setScalar(1 - t);
      if (t < 1) requestAnimationFrame(step);
      else resolve();
    }
    requestAnimationFrame(step);
  });
}

function kingPulse(mesh) {
  return new Promise(resolve => {
    const start = performance.now();
    const dur = 500;
    function step() {
      const t = Math.min(1, (performance.now() - start) / dur);
      const s = 1 + Math.sin(t * Math.PI) * 0.35;
      mesh.scale.setScalar(s);
      if (t < 1) requestAnimationFrame(step);
      else { mesh.scale.setScalar(1); resolve(); }
    }
    step();
  });
}

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// ============================================================
// AI
// ============================================================
function aiTurn() {
  if (state.gameOver) return;
  state.busy = true;
  const move = pickAiMove();
  state.busy = false;
  if (!move) {
    // No moves -> game over
    checkGameOver();
    return;
  }
  // Execute via same path so animations + multi-jump work
  executeMove(move);
}

function pickAiMove() {
  let moves;
  if (state.mustJumpFrom) {
    // Forced multi-jump: only this piece's jumps are legal
    moves = getMovesForPiece(state.board, state.mustJumpFrom.row, state.mustJumpFrom.col, true)
              .filter(m => m.captures.length);
  } else {
    moves = getAllMoves(state.board, BLACK);
  }
  if (!moves.length) return null;

  if (state.difficulty === 'easy') {
    return moves[Math.floor(Math.random() * moves.length)];
  }

  // Score each move (higher = better for BLACK)
  const scored = moves.map(m => ({ m, s: scoreMove(m) }));
  if (state.difficulty === 'normal') {
    scored.sort((a, b) => b.s - a.s);
    // Pick from top with mild randomness
    const top = scored.filter(x => x.s >= scored[0].s - 0.5);
    return top[Math.floor(Math.random() * top.length)].m;
  }

  // HARD: 3-ply minimax with alpha-beta
  let best = null, bestVal = -Infinity;
  for (const m of moves) {
    const sim = simulateMove(state.board, m, BLACK);
    const v = minimax(sim.board, RED, 2, -Infinity, Infinity, sim.continueTurn ? BLACK : null, sim.continueFrom);
    if (v > bestVal) { bestVal = v; best = m; }
  }
  return best || moves[0];
}

function scoreMove(m) {
  // Heuristic for normal AI
  let s = 0;
  if (m.captures.length) s += 5 * m.captures.length;
  // Reaching king row
  const piece = state.board[m.fromRow][m.fromCol];
  if (piece && !piece.king) {
    if (piece.color === BLACK && m.toRow === 0) s += 6;
    if (piece.color === RED && m.toRow === 7) s += 6;
  }
  // Center bias
  const dc = Math.abs(m.toCol - 3.5);
  s += (4 - dc) * 0.2;
  // Avoid moving back row guards too early (random tiebreak)
  s += Math.random() * 0.3;
  return s;
}

function evalBoard(board) {
  // Positive favors BLACK (AI), negative favors RED.
  let score = 0;
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const p = board[r][c];
    if (!p) continue;
    const v = (p.king ? 1.7 : 1.0)
            + (p.color === BLACK ? (7 - r) * 0.04 : r * 0.04) // advance forward
            + (Math.abs(c - 3.5) < 2.5 ? 0.05 : 0);
    score += p.color === BLACK ? v : -v;
  }
  return score;
}

function simulateMove(board, m, color) {
  // Returns { board: clonedAfterMove, continueTurn: bool, continueFrom: {row,col}|null }
  const nb = cloneBoard(board);
  const piece = { ...nb[m.fromRow][m.fromCol] };
  nb[m.fromRow][m.fromCol] = null;
  for (const cap of m.captures) nb[cap.row][cap.col] = null;
  let promoted = false;
  if (!piece.king) {
    if (piece.color === RED && m.toRow === 7) { piece.king = true; promoted = true; }
    else if (piece.color === BLACK && m.toRow === 0) { piece.king = true; promoted = true; }
  }
  nb[m.toRow][m.toCol] = piece;
  let continueTurn = false, continueFrom = null;
  if (m.captures.length && !promoted) {
    const more = getMovesForPiece(nb, m.toRow, m.toCol, true).filter(x => x.captures.length);
    if (more.length) { continueTurn = true; continueFrom = { row: m.toRow, col: m.toCol }; }
  }
  return { board: nb, continueTurn, continueFrom };
}

function cloneBoard(board) {
  const nb = Array.from({ length: 8 }, () => Array(8).fill(null));
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const p = board[r][c];
    if (p) nb[r][c] = { color: p.color, king: p.king };
  }
  return nb;
}

function minimax(board, toMove, depth, alpha, beta, forcedColor, forcedFrom) {
  if (depth === 0) return evalBoard(board);
  let moves;
  if (forcedColor) {
    // Continue forced multi-jump for forcedColor at forcedFrom
    moves = getMovesForPiece(board, forcedFrom.row, forcedFrom.col, true).filter(m => m.captures.length);
    toMove = forcedColor;
  } else {
    moves = getAllMoves(board, toMove);
  }
  if (!moves.length) {
    // Side to move loses
    return toMove === BLACK ? -1000 + (10 - depth) : 1000 - (10 - depth);
  }
  const isMax = toMove === BLACK;
  let best = isMax ? -Infinity : Infinity;
  for (const m of moves) {
    const sim = simulateMove(board, m, toMove);
    const next = sim.continueTurn ? toMove : (toMove === BLACK ? RED : BLACK);
    const v = minimax(sim.board, next, depth - 1, alpha, beta,
                      sim.continueTurn ? toMove : null, sim.continueFrom);
    if (isMax) { best = Math.max(best, v); alpha = Math.max(alpha, v); }
    else       { best = Math.min(best, v); beta  = Math.min(beta,  v); }
    if (beta <= alpha) break;
  }
  return best;
}

// ============================================================
// GAME OVER
// ============================================================
function checkGameOver() {
  const myMoves = getAllMoves(state.board, state.current);
  if (myMoves.length === 0 || state.pieceCount.red === 0 || state.pieceCount.black === 0) {
    state.gameOver = true;
    const winner = (state.pieceCount.red === 0) ? BLACK :
                   (state.pieceCount.black === 0) ? RED :
                   (state.current === RED ? BLACK : RED);
    setTimeout(() => showGameOver(winner), 600);
    return true;
  }
  return false;
}

// ============================================================
// HUD / TOASTS
// ============================================================
function updateHUD() {
  document.getElementById('score-red').textContent = state.scores.red;
  document.getElementById('score-black').textContent = state.scores.black;
  document.getElementById('pieces-red').textContent = `${state.pieceCount.red} LEFT`;
  document.getElementById('pieces-black').textContent = `${state.pieceCount.black} LEFT`;
  const turnEl = document.getElementById('turn-text');
  turnEl.textContent = state.current === RED ? "RED'S TURN" : "BLACK'S TURN";
  const banner = document.getElementById('turn-banner');
  banner.style.borderColor = state.current === RED ? '#ff4040' : '#a64dff';
  banner.style.color = state.current === RED ? '#ff4040' : '#a64dff';
  banner.style.textShadow = `0 0 8px ${state.current === RED ? '#ff4040' : '#a64dff'}`;
}

function showJumpToast() {
  const player = state.current.toUpperCase();
  let msg, sub;
  if (state.comboCount >= 3) {
    msg = '🔥 TRIPLE JUMP! 🔥';
    sub = `${player} IS UNSTOPPABLE`;
  } else if (state.comboCount === 2) {
    msg = '⚡ DOUBLE JUMP! ⚡';
    sub = `${player} ON A ROLL`;
  } else {
    const phrases = ['BOOM!', 'GOTCHA!', 'JUMPED!', 'KING ME!', 'YEAHHH!', 'POW!'];
    msg = phrases[Math.floor(Math.random() * phrases.length)];
    sub = `+1 FOR ${player}`;
  }
  const cls = state.comboCount >= 2 ? 'combo' : '';
  showToast(msg, sub, cls);
}

function showToast(text, sub = '', cls = '') {
  const container = document.getElementById('toast-container');
  const t = document.createElement('div');
  t.className = 'toast ' + cls;
  t.innerHTML = text + (sub ? `<span class="sub">${sub}</span>` : '');
  container.appendChild(t);
  setTimeout(() => t.remove(), 1700);
}

function spawnSparks() {
  const container = document.getElementById('toast-container');
  const colors = ['#ffd23f', '#ff2d95', '#00f0ff', '#a64dff', '#ff4040'];
  for (let i = 0; i < 22; i++) {
    const s = document.createElement('div');
    s.className = 'spark';
    s.style.color = colors[i % colors.length];
    s.style.background = colors[i % colors.length];
    const angle = Math.random() * Math.PI * 2;
    const dist = 120 + Math.random() * 180;
    s.style.setProperty('--dx', `${Math.cos(angle) * dist}px`);
    s.style.setProperty('--dy', `${Math.sin(angle) * dist}px`);
    container.appendChild(s);
    setTimeout(() => s.remove(), 1200);
  }
}

function showGameOver(winner) {
  document.getElementById('game').classList.remove('show');
  const go = document.getElementById('gameover');
  go.classList.add('show');
  const sub = document.getElementById('gameover-sub');
  sub.textContent = `${winner.toUpperCase()} WINS  -  ${state.scores[winner]} JUMPS`;
  document.getElementById('gameover-title').innerHTML = `<span class="title-line top">GAME</span><span class="title-line bottom">OVER</span>`;
}

// ============================================================
// UI HOOKS
// ============================================================
function attachUI() {
  let pendingMode = null;

  const modeBtns = document.querySelectorAll('.neon-btn[data-mode]');
  modeBtns.forEach(b => b.addEventListener('click', () => {
    modeBtns.forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    pendingMode = b.dataset.mode;
    document.getElementById('start-game').classList.remove('hidden');
    const diffRow = document.getElementById('difficulty-row');
    if (pendingMode === '1p') diffRow.classList.remove('hidden');
    else diffRow.classList.add('hidden');
  }));

  const diffBtns = document.querySelectorAll('.diff-btn');
  diffBtns.forEach(b => b.addEventListener('click', () => {
    diffBtns.forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    state.difficulty = b.dataset.diff;
  }));

  document.getElementById('start-game').addEventListener('click', () => {
    if (!pendingMode) return;
    state.mode = pendingMode;
    document.getElementById('menu').classList.remove('show');
    document.getElementById('gameover').classList.remove('show');
    document.getElementById('game').classList.add('show');
    newGame();
    onResize();
  });

  document.getElementById('btn-menu').addEventListener('click', () => {
    document.getElementById('game').classList.remove('show');
    document.getElementById('menu').classList.add('show');
  });
  document.getElementById('btn-restart').addEventListener('click', () => newGame());
  document.getElementById('btn-rematch').addEventListener('click', () => {
    document.getElementById('gameover').classList.remove('show');
    document.getElementById('game').classList.add('show');
    newGame();
  });
  document.getElementById('btn-back-menu').addEventListener('click', () => {
    document.getElementById('gameover').classList.remove('show');
    document.getElementById('menu').classList.add('show');
  });
}

// ============================================================
// LOOP
// ============================================================
function onResize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const aspect = w / h;
  camera.aspect = aspect;

  // Fit camera so the whole board (with margin) is always visible.
  // Half-extent we want covered both horizontally and vertically (board ~10
  // wide + frame moldings).
  const halfExtent = 5.6;

  if (aspect >= 1.0) {
    // Landscape: original framing
    camera.fov = 42;
    camera.position.set(0, 8.5, 9.5);
  } else {
    // Portrait: widen FOV and pull camera back along the same look angle
    // so the board fits the narrow dimension.
    camera.fov = Math.min(72, 42 + (1 - aspect) * 60);
    const t = Math.tan((camera.fov * Math.PI) / 360);
    const distForHeight = halfExtent / t;
    const distForWidth  = halfExtent / (t * aspect);
    const dist = Math.max(11, distForHeight, distForWidth) * 1.04;
    const elev = Math.atan2(8.5, 9.5); // preserve landscape elevation angle
    camera.position.set(0, dist * Math.sin(elev), dist * Math.cos(elev));

    // Push fog out so the board doesn't get washed out at the new distance
    scene.fog.near = dist + 4;
    scene.fog.far  = dist + 22;
  }

  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}

function animate() {
  requestAnimationFrame(animate);
  // Pulse valid-move rings
  const t = performance.now() * 0.004;
  for (const ring of validMoveMarkers) {
    const s = 1 + Math.sin(t) * 0.12;
    ring.scale.setScalar(s);
    ring.material.opacity = 0.65 + Math.sin(t * 1.4) * 0.25;
  }
  // Pulse selected square
  if (state.selected) {
    const sq = squareMeshes.find(s => s.userData.row === state.selected.row && s.userData.col === state.selected.col);
    if (sq) sq.material.emissiveIntensity = 0.4 + Math.sin(t * 2) * 0.25;
  }
  renderer.render(scene, camera);
}

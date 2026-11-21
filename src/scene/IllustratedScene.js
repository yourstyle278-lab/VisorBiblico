// IllustratedScene.js — El "Visor" como una ILUSTRACIÓN DEL LIBRO que cobra vida.
//
// Reemplaza a Scene3D.js (geometría 3D oscura de Three.js) porque el Visor no
// puede verse descuadrado del libro. Cada lámina es una imagen de papel
// recortado que el navegador anima con WebGL: no es 3D, es un cuadro vivo.
//
// TURNO 21 — DE DOS LÁMINAS A UNA SECUENCIA ("metraje"):
//  • El pasaje trae una lámina por momento del relato (9 en Marcos 4:35-41:
//    anochecer, "le llevaron como estaba", tempestad, despertar, "levantándose",
//    "Calla, enmudece", bonanza, "¿por qué estáis así amedrentados?" y el
//    asombro final). Están alineadas entre sí por la madera de la barca, así
//    que al pasar de una a otra la barca no se mueve y solo cambian las
//    figuras, las olas, la luz y las nubes.
//  • La app avisa en qué versículo y en qué punto de la narración va
//    (cue(versículo, avance 0..1)) y la escena elige la lámina que toca. La
//    tabla CUES dice qué lámina entra en cada momento; TRANSITIONS, con qué
//    efecto (fundido suave, frente oscuro de tormenta, destello, frente
//    dorado); LOOKS, qué lluvia/olas/rayos/motas lleva cada lámina.
//  • Si un cambio llega mientras otro está en curso, espera su turno (no hay
//    saltos bruscos). Un salto (botones, reinicio) corta en seco.
//  • Compatibilidad: si el pasaje solo trae { storm, calm } (la versión
//    anterior de illustrations.js) funciona como antes: tormenta → bonanza
//    según la etapa que pide la app.
//
// TÉCNICA (heredada, T11–T20):
//  1. Dos láminas mezcladas con una disolución de ruido (fbm) que nace en el
//     punto de foco (Jesús) y avanza; en los frentes nítidos hay un borde de
//     luz.
//  2. Las olas desplazan el mar solo FUERA de la barca; las nubes se deslizan
//     como una sola pieza; el mar sigue vivo en la calma; ondas concéntricas.
//  3. Lluvia en capas, rayos de luz y motas doradas que suben por los rayos.
//  4. Cámara: vaivén, giro y empuje leves (rígidos, de toda la lámina); más en
//     la tormenta.
//  5. Revelado tipo portal al aparecer la lámina.
//  6. REGLA (T20, R12): Jesús, los discípulos y la barca NO se deforman nunca;
//     solo se mueven con la cámara. (En T19 ondulaban como "gusanitos".)
//  7. Ahorro: el ruido de la disolución y del portal solo se calcula mientras
//     están en curso; la lluvia y las motas, solo si la lámina las lleva; tope
//     de ~30 fotogramas/s y de píxeles; respeta "reducir movimiento".
//
// RESPALDO: si el navegador no da WebGL (o el shader no compila), se usan dos
// <img> apiladas con fundido (sin movimiento, pero con el cambio de láminas).
//
// Interfaz pública: render(elapsed, stage), snapToStage(stage), cue(verse,
// progress, snap), triggerLightning(), reveal(ms), resetReveal(), dispose().

const VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = vec2(aPos.x * 0.5 + 0.5, 0.5 - aPos.y * 0.5);
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 vUv;
uniform sampler2D uImgA;
uniform sampler2D uImgB;
uniform float uTime;
uniform float uAspect;
uniform float uProg;
uniform float uSoft;
uniform vec2 uFocus;
uniform vec3 uEdgeCol;
uniform float uEdgeAmt;
uniform vec4 uLookA;
uniform vec4 uLookB;
uniform vec2 uMotes;
uniform float uFlash;
uniform float uReveal;
uniform float uMotion;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p = p * 2.03 + 17.0;
    a *= 0.5;
  }
  return v;
}

// Una capa de lluvia: rayas finas inclinadas hacia abajo-izquierda.
float rainLayer(vec2 uv, float scale, float speed, float seed) {
  vec2 p = vec2(uv.x * uAspect + uv.y * 0.28, uv.y);
  vec2 g = vec2(p.x * scale, p.y * scale * 0.18 - uTime * speed);
  vec2 id = floor(g);
  vec2 f = fract(g);
  float on = step(0.72, hash(id + seed));
  float xoff = 0.2 + 0.6 * hash(id + seed + 5.3);
  float line = smoothstep(0.07, 0.0, abs(f.x - xoff));
  float len = smoothstep(0.0, 0.25, f.y) * (1.0 - smoothstep(0.55, 1.0, f.y));
  return on * line * len;
}

void main() {
  vec2 uv = vUv;                 // espacio de pantalla: bordes, portal y lluvia
  vec2 asp = vec2(uAspect, 1.0);
  float prog = clamp(uProg, 0.0, 1.0);

  // --- CÁMARA: vaivén, giro y empuje leves, rígidos (toda la lámina a la vez).
  // Más fuertes con la tensión de la tormenta (la lluvia de la lámina).
  float tension = clamp(mix(uLookA.x, uLookB.x, prog), 0.0, 1.0);
  float sway = (0.4 + 0.6 * tension) * uMotion;
  vec2 cam = vec2(
    (noise(vec2(uTime * 0.21, 1.7)) - 0.5) * 0.020 + sin(uTime * 0.83) * 0.004 * tension,
    (noise(vec2(uTime * 0.17, 9.1)) - 0.5) * 0.014 + sin(uTime * 1.21) * 0.005 * tension) * sway;
  float roll = ((noise(vec2(uTime * 0.15, 4.2)) - 0.5) * 0.030 + sin(uTime * 0.61) * 0.006 * tension) * sway;
  float zoom = 1.02 + (0.030 * tension + 0.006 * sin(uTime * 0.29)) * uMotion;
  vec2 pc = (uv - vec2(0.5, 0.56)) * asp;
  pc = vec2(cos(roll) * pc.x - sin(roll) * pc.y, sin(roll) * pc.x + cos(roll) * pc.y);
  vec2 iuv = vec2(0.5, 0.56) + (pc / asp) / zoom + cam;   // espacio de la lámina

  // --- Máscaras de región (las láminas están alineadas por la barca) ---
  float water = smoothstep(0.60, 0.72, iuv.y);
  float jesus = 1.0 - smoothstep(0.4, 1.0, length((iuv - vec2(0.63, 0.52)) / vec2(0.10, 0.26)));
  float sky = 1.0 - smoothstep(0.24, 0.46, iuv.y);
  float fig = max(jesus, 1.0 - smoothstep(0.5, 1.0, length((iuv - vec2(0.62, 0.30)) / vec2(0.10, 0.18))));
  sky *= 1.0 - 0.92 * fig;
  float hull = 1.0 - smoothstep(0.78, 1.10, length((iuv - vec2(0.52, 0.64)) / vec2(0.32, 0.21)));
  float sea = water * (1.0 - hull);

  // --- Disolución A -> B: frente de ruido que nace en el foco (Jesús).
  // El ruido solo se calcula mientras el frente avanza (ahorra batería).
  vec2 q = (iuv - uFocus) * asp;
  float dist = length(q);
  float m = 0.0;
  float edge = 0.0;
  if (prog >= 0.997) {
    m = 1.0;
  } else if (prog > 0.003) {
    float n = fbm(iuv * asp * 4.0 + vec2(0.0, uTime * 0.02));
    float sw = mix(0.07, 0.85, uSoft);
    float front = mix(-0.30, 1.62 + sw, prog);
    float t = front - dist + (n - 0.5) * mix(0.44, 0.20, uSoft);
    m = smoothstep(0.0, sw, t);
    edge = smoothstep(0.0, 0.03, t) * (1.0 - smoothstep(0.03, 0.12, t)) * (1.0 - uSoft);
  }

  // --- Parámetros de cada lámina, mezclados donde ya llegó la nueva ---
  vec4 lk = mix(uLookA, uLookB, m);
  float rain = lk.x;
  float wave = lk.y;
  float raysAmt = lk.z;
  float ripple = lk.w;
  float motes = mix(uMotes.x, uMotes.y, m);

  // --- Desplazamientos ---
  // REGLA: lo que está pintado como objeto sólido (Jesús, los discípulos, la
  // barca) NO se deforma nunca; solo se mueve con la cámara. Las deformaciones
  // se aplican al mar libre (fuera de una elipse alrededor de la barca) y al
  // cielo.
  vec2 d = vec2(0.0);
  float W = wave * uMotion;
  d.x += sin(iuv.y * 26.0 + uTime * 1.5) * 0.0065 * sea * W;
  d.y += sin(iuv.x * 13.0 - uTime * 1.7 + iuv.y * 5.0) * 0.0085 * sea * W;
  d.y += sin(iuv.x * 31.0 + uTime * 2.3) * 0.0030 * sea * W;
  // Nubes: se deslizan despacio como una sola pieza, sin deformarse.
  d.x += sin(uTime * 0.11) * 0.008 * sky * uMotion;
  d.y += sin(uTime * 0.17 + 1.0) * 0.003 * sky * uMotion * (0.5 + 0.5 * tension);
  // Ondas concéntricas desde la barca.
  vec2 rp = (iuv - vec2(0.52, 0.80)) * asp * vec2(1.0, 2.2);
  float rd = length(rp);
  float rz = sea * ripple * smoothstep(1.0, 0.05, rd) * uMotion;
  d.y += sin(rd * 48.0 - uTime * 1.3) * 0.0055 * rz;
  d.x += cos(rd * 40.0 - uTime * 1.1) * 0.0025 * rz;

  vec2 suv = clamp(iuv + d, 0.001, 0.999);
  vec3 ca = texture2D(uImgA, suv).rgb;
  vec3 cb = texture2D(uImgB, suv).rgb;
  vec3 col = mix(ca, cb, m);

  // Borde de luz (o de sombra) del frente y halo alrededor del foco.
  col += edge * uEdgeCol * uEdgeAmt * (1.0 + 0.37 * sin(uTime * 3.0));
  float pulse = sin(3.14159 * prog);
  col += uEdgeCol * (0.45 * uEdgeAmt) * pulse * exp(-dist * 1.4);

  // --- Rayos de luz que nacen del hueco entre las nubes ---
  if (raysAmt > 0.01) {
    vec2 rq = (iuv - vec2(0.47, 0.16)) * asp;
    float ang = atan(rq.y, rq.x);
    float rl = length(rq);
    float wob = noise(vec2(ang * 3.0, uTime * 0.05)) + 0.5 * noise(vec2(ang * 6.0, uTime * 0.07 + 3.0));
    float beam = 0.5 + 0.5 * sin(ang * 15.0 + wob * 2.0 + uTime * 0.18);
    beam = pow(beam, 4.0);
    float breathe = 0.88 + 0.12 * sin(uTime * 0.7 + ang * 3.0);
    float rays = beam * breathe * exp(-rl * 1.7) * smoothstep(0.02, 0.20, rq.y);
    col += vec3(1.0, 0.84, 0.52) * rays * 0.28 * raysAmt;
  }

  // --- Motas de luz dorada que suben por los rayos (solo en láminas de luz) ---
  if (max(uMotes.x, uMotes.y) > 0.05 && motes > 0.02) {
    vec2 mq = (iuv - vec2(0.47, 0.16)) * asp;
    float ml = length(mq);
    float acc = 0.0;
    for (int i = 0; i < 2; i++) {
      float fi = float(i);
      vec2 g = vec2(iuv.x * uAspect, iuv.y) * (15.0 + fi * 10.0);
      g.y += uTime * (0.32 + 0.18 * fi);
      g.x += sin(uTime * 0.4 + fi * 2.0 + floor(g.y) * 1.7) * 0.35;
      vec2 id = floor(g);
      vec2 f = fract(g) - 0.5;
      float h = hash(id + fi * 17.0);
      vec2 off = (vec2(hash(id + 3.1), hash(id + 7.7)) - 0.5) * 0.5;
      float tw = 0.5 + 0.5 * sin(uTime * (1.5 + 2.0 * h) + h * 40.0);
      acc += step(0.80, h) * smoothstep(0.10, 0.0, length(f - off)) * tw;
    }
    float zone = smoothstep(0.02, 0.30, mq.y) * exp(-ml * 1.2);
    col += vec3(1.0, 0.86, 0.55) * acc * zone * motes * 1.1;
  }

  // --- Lluvia (solo donde la lámina la lleva) ---
  if (max(uLookA.x, uLookB.x) > 0.01) {
    float r = rainLayer(uv, 38.0, 3.2, 0.0) * 0.9
            + rainLayer(uv, 60.0, 4.6, 13.0) * 0.6
            + rainLayer(uv, 90.0, 6.0, 29.0) * 0.4;
    col = mix(col, vec3(0.95, 0.93, 0.88), clamp(r, 0.0, 1.0) * 0.46 * rain);
  }

  // --- Relámpago (solo sobre láminas con tormenta) ---
  col += vec3(0.85, 0.88, 1.0) * uFlash * 0.5 * clamp(rain, 0.0, 1.0);
  col = max(col, vec3(0.0));

  // --- Fundido de los bordes con el papel de la página ---
  float ex = smoothstep(0.0, 0.05, uv.x) * smoothstep(0.0, 0.05, 1.0 - uv.x);
  float ey = smoothstep(0.0, 0.06, uv.y) * smoothstep(0.0, 0.07, 1.0 - uv.y);
  float alpha = ex * ey;

  // --- Revelado tipo portal: anillo dorado que se abre desde el centro ---
  if (uReveal < 0.995) {
    vec2 cq = (uv - vec2(0.5, 0.52)) * asp;
    float cd = length(cq);
    float n2 = fbm(uv * asp * 3.0 + 7.3);
    float rt = mix(-0.35, 1.5, clamp(uReveal, 0.0, 1.0)) - cd + (n2 - 0.5) * 0.5;
    float rm = smoothstep(0.0, 0.10, rt);
    float redge = smoothstep(0.0, 0.04, rt) * (1.0 - smoothstep(0.04, 0.22, rt));
    col += redge * vec3(1.0, 0.82, 0.45) * 0.5;
    alpha *= clamp(rm + redge * 0.6, 0.0, 1.0);
  }

  gl_FragColor = vec4(col * alpha, alpha);
}`;

// ---------------------------------------------------------------------------
// DATOS DE LA SECUENCIA (Marcos 4:35-41). Se pueden sustituir con
// illustrations.js: { cues, looks, transitions, focus } en el pasaje.
// ---------------------------------------------------------------------------

// Qué lámina entra y cuándo: versículo (v) y avance dentro de su narración
// (at, 0 = al empezar, 1 = al terminar). El avance se mide en caracteres del
// texto, por eso los cambios caen en la frase que corresponde:
//   v38 0,86  "…que perecemos?"  -> Jesús se levanta (la original de tormenta)
//   v39 0,14  "reprendió al viento" -> el mandato
//   v39 0,60  "Y cesó el viento…"   -> la bonanza (la original de calma)
export const CUES = [
  { v: 35, at: 0, frame: 'v35' },
  { v: 36, at: 0, frame: 'v36' },
  { v: 37, at: 0, frame: 'v37' },
  { v: 38, at: 0, frame: 'v38' },
  { v: 38, at: 0.86, frame: 'storm0' },
  { v: 39, at: 0.14, frame: 'v39' },
  { v: 39, at: 0.6, frame: 'calm0' },
  { v: 40, at: 0, frame: 'v40' },
  { v: 41, at: 0, frame: 'v41' },
];

// Qué lleva cada lámina: lluvia, olas, rayos añadidos, ondas y motas de luz.
// (Las láminas ya traen su propia luz y lluvia pintadas; esto solo les da
// vida.) 'storm' y 'calm' son las dos de la versión anterior.
const LOOKS = {
  v35: { rain: 0, wave: 0.1, rays: 0.0, ripple: 0.7, motes: 0 },
  v36: { rain: 0, wave: 0.1, rays: 0.35, ripple: 0.7, motes: 0.45 },
  v37: { rain: 1.0, wave: 1.0, rays: 0.1, ripple: 0, motes: 0 },
  v38: { rain: 1.0, wave: 0.95, rays: 0.1, ripple: 0, motes: 0 },
  storm0: { rain: 0.9, wave: 0.85, rays: 0.15, ripple: 0, motes: 0 },
  v39: { rain: 0.3, wave: 0.45, rays: 0.25, ripple: 0.2, motes: 0 },
  calm0: { rain: 0, wave: 0.14, rays: 0.7, ripple: 0.8, motes: 0.6 },
  v40: { rain: 0, wave: 0.1, rays: 0.4, ripple: 0.7, motes: 0.5 },
  v41: { rain: 0, wave: 0.1, rays: 0.4, ripple: 0.8, motes: 0.6 },
  storm: { rain: 1.0, wave: 1.0, rays: 0.15, ripple: 0, motes: 0 },
  calm: { rain: 0, wave: 0.14, rays: 0.9, ripple: 0.8, motes: 0.6 },
};
const DEFAULT_LOOK = { rain: 0, wave: 0.1, rays: 0.4, ripple: 0.5, motes: 0.3 };

// Dónde nace el frente de la disolución (donde está Jesús en cada lámina).
const FOCUS = {
  v35: [0.61, 0.47], v36: [0.64, 0.5], v37: [0.72, 0.54], v38: [0.64, 0.52],
  storm0: [0.62, 0.45], v39: [0.65, 0.47], calm0: [0.6, 0.45], v40: [0.62, 0.5],
  v41: [0.62, 0.5], storm: [0.625, 0.36], calm: [0.625, 0.36],
};
const DEFAULT_FOCUS = [0.62, 0.5];

// Cómo entra cada lámina. dur: segundos. soft: 0 frente nítido … 1 fundido
// suave. edge: color del borde del frente (negativo = sombra); amt: fuerza.
const TRANSITIONS = {
  v35: { dur: 2.0, soft: 0.9, edge: [0, 0, 0], amt: 0 },
  v36: { dur: 3.2, soft: 0.85, edge: [0, 0, 0], amt: 0 },
  // Llega la tormenta: frente oscuro.
  v37: { dur: 3.0, soft: 0.45, edge: [-0.3, -0.27, -0.18], amt: 0.9 },
  v38: { dur: 2.4, soft: 0.85, edge: [0, 0, 0], amt: 0 },
  // "Y levantándose": destello frío.
  storm0: { dur: 1.8, soft: 0.55, edge: [0.8, 0.86, 1.0], amt: 0.4 },
  // El mandato: frente dorado.
  v39: { dur: 2.4, soft: 0.15, edge: [1.0, 0.8, 0.42], amt: 0.42 },
  // La bonanza: frente dorado lento.
  calm0: { dur: 3.0, soft: 0.2, edge: [1.0, 0.8, 0.42], amt: 0.4 },
  v40: { dur: 3.2, soft: 0.85, edge: [0, 0, 0], amt: 0 },
  v41: { dur: 3.2, soft: 0.85, edge: [0, 0, 0], amt: 0 },
  storm: { dur: 2.5, soft: 0.8, edge: [0, 0, 0], amt: 0 },
  calm: { dur: 4.5, soft: 0.1, edge: [1.0, 0.8, 0.42], amt: 0.38 },
};
const DEFAULT_TRANSITION = { dur: 3.0, soft: 0.85, edge: [0, 0, 0], amt: 0 };

// Si la app todavía solo avisa de la "etapa" (versión anterior de la app),
// se elige la lámina a partir de ella.
const STAGE_FRAME_MULTI = { 'storm-building': 'v37', 'storm-peak': 'v38', command: 'v39', calm: 'v41' };
const STAGE_FRAME_LEGACY = { 'storm-building': 'storm', 'storm-peak': 'storm', command: 'calm', calm: 'calm' };

const UNIFORMS = [
  'uImgA', 'uImgB', 'uTime', 'uAspect', 'uProg', 'uSoft', 'uFocus', 'uEdgeCol',
  'uEdgeAmt', 'uLookA', 'uLookB', 'uMotes', 'uFlash', 'uReveal', 'uMotion',
];

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const lookOf = (table, key) => ({ ...DEFAULT_LOOK, ...(table[key] || {}) });

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('No se pudo cargar una lámina.'));
    img.src = src;
  });
}

export class IllustratedScene {
  // containerEl: el contenedor de la lámina (puede estar oculto al construir —
  // se mide en cada dibujo). illustrations: { frames: {clave: imagen}, cues?,
  // looks?, transitions?, focus? } o, en la versión anterior, { storm, calm }.
  constructor(containerEl, illustrations) {
    this.container = containerEl;
    this._illus = illustrations;
    this.ready = false;
    this.isFallback = false;

    // Datos de la secuencia (los del pasaje mandan sobre los de por defecto).
    this._multi = !!(illustrations && illustrations.frames);
    const frames = this._multi ? illustrations.frames : { storm: illustrations.storm, calm: illustrations.calm };
    this._frames = {};
    Object.keys(frames).forEach((k) => { this._frames[k] = { src: frames[k], tex: null }; });
    this._cues = (illustrations && illustrations.cues) || CUES;
    this._looks = { ...LOOKS, ...((illustrations && illustrations.looks) || {}) };
    this._transitions = { ...TRANSITIONS, ...((illustrations && illustrations.transitions) || {}) };
    this._focusTable = { ...FOCUS, ...((illustrations && illustrations.focus) || {}) };

    // Estado de la secuencia: A es la lámina que se va, B la que llega.
    const first = this._multi && this._frames[this._cues[0].frame] ? this._cues[0].frame : Object.keys(this._frames)[0];
    this._A = first;
    this._B = first;
    this._prog = 1; // 1 = se ve B por completo
    this._tStart = 0;
    this._trans = this._transFor(first);
    this._queued = null;
    this._cueDriven = false;
    this._lastStage = null;

    this._lastElapsed = 0;
    this._lastDrawT = -1;
    this._time = 0;
    this._flash = 0;
    this._reveal = 0;
    this._revealing = false;
    this._size = { w: 0, h: 0 };
    this._lost = false;
    // Accesibilidad: con "reducir movimiento" activado en el sistema, el
    // movimiento de cámara y de las olas baja a un tercio.
    this._motion =
      typeof window !== 'undefined' && window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0.35 : 1;

    this._canvas = document.createElement('canvas');
    this._canvas.style.cssText = 'display:block;width:100%;height:100%;';
    this._canvas.setAttribute('role', 'img');
    this._canvas.setAttribute('aria-label', 'Ilustración animada del pasaje: Jesús calma la tempestad');

    this._gl = this._canvas.getContext('webgl', {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      powerPreference: 'low-power',
    });

    this._onLost = (e) => { e.preventDefault(); this._lost = true; };
    this._onRestored = () => { this._lost = false; this._initGL(); this._draw(); };

    if (this._gl) {
      this.container.appendChild(this._canvas);
      this._canvas.addEventListener('webglcontextlost', this._onLost);
      this._canvas.addEventListener('webglcontextrestored', this._onRestored);
      this._initGL();
    } else {
      this._initFallback();
    }

    // La lámina está oculta (display:none) hasta que empieza la inmersión:
    // al hacerse visible hay que volver a medir y dibujar.
    if (typeof ResizeObserver !== 'undefined') {
      this._ro = new ResizeObserver(() => this._draw());
      this._ro.observe(this.container);
    }
  }

  // ---------- Datos por lámina ----------
  _lookFor(key) { return lookOf(this._looks, key); }
  _transFor(key) { return { ...DEFAULT_TRANSITION, ...(this._transitions[key] || {}) }; }
  _focusFor(key) { return this._focusTable[key] || DEFAULT_FOCUS; }

  // ---------- WebGL ----------
  _initGL() {
    const gl = this._gl;
    const compile = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(s);
        gl.deleteShader(s);
        throw new Error('Shader: ' + log);
      }
      return s;
    };
    try {
      const prog = gl.createProgram();
      gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
      gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        throw new Error('Link: ' + gl.getProgramInfoLog(prog));
      }
      this._prog = prog;
    } catch (err) {
      // Un shader que no compila en este teléfono no debe dejar la lámina
      // en blanco: se pasa al respaldo sin WebGL.
      console.warn('IllustratedScene: WebGL no disponible, uso respaldo.', err);
      this._canvas.remove();
      this._gl = null;
      this._initFallback();
      return;
    }
    gl.useProgram(this._prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(this._prog, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    this._u = {};
    UNIFORMS.forEach((n) => { this._u[n] = gl.getUniformLocation(this._prog, n); });
    gl.uniform1i(this._u.uImgA, 0);
    gl.uniform1i(this._u.uImgB, 1);

    // Cada lámina se sube a la tarjeta gráfica en cuanto carga; la primera que
    // hace falta sale enseguida y el resto va llegando detrás.
    this.ready = false;
    Object.keys(this._frames).forEach((key) => {
      this._frames[key].tex = null;
      loadImage(this._frames[key].src)
        .then((img) => {
          if (!this._gl) return; // ya cayó al respaldo
          if (!this._aspect) this._aspect = img.naturalWidth / img.naturalHeight;
          const tex = gl.createTexture();
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, tex);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
          // Texturas de tamaño no potencia de 2 en WebGL1: sin mipmaps y con CLAMP.
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
          this._frames[key].tex = tex;
          this.ready = !!this._frames[this._A].tex;
          this._draw();
        })
        .catch((err) => {
          console.warn('IllustratedScene: no se cargó la lámina ' + key + '.', err);
        });
    });
  }

  _resizeCanvas() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (!w || !h) return false;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let pw = Math.round(w * dpr);
    let ph = Math.round(h * dpr);
    // Tope de píxeles por fotograma (la lámina ampliada en horizontal es grande):
    // protege la batería y la fluidez en teléfonos de gama media.
    const MAX_PX = 1.0e6;
    if (pw * ph > MAX_PX) {
      const k = Math.sqrt(MAX_PX / (pw * ph));
      pw = Math.round(pw * k);
      ph = Math.round(ph * k);
    }
    if (this._canvas.width !== pw || this._canvas.height !== ph) {
      this._canvas.width = pw;
      this._canvas.height = ph;
    }
    return true;
  }

  _draw() {
    if (this.isFallback) { this._drawFallback(); return; }
    const gl = this._gl;
    if (!gl || this._lost) return;
    const ta = this._frames[this._A] && this._frames[this._A].tex;
    const tbRaw = this._frames[this._B] && this._frames[this._B].tex;
    if (!ta) return; // la lámina de partida aún no ha cargado
    const tb = tbRaw || ta; // si la que llega aún no cargó, no hay transición visible
    if (!this._resizeCanvas()) return; // oculto o sin tamaño: nada que dibujar
    gl.viewport(0, 0, this._canvas.width, this._canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, ta);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, tb);

    const u = this._u;
    const la = this._lookFor(this._A);
    const lb = this._lookFor(this._B);
    const p = this._prog;
    const f = this._focusFor(this._B);
    const e = this._trans.edge;
    gl.uniform1f(u.uTime, this._time);
    gl.uniform1f(u.uAspect, this._aspect || 1.655);
    gl.uniform1f(u.uProg, p * p * (3 - 2 * p));
    gl.uniform1f(u.uSoft, this._trans.soft);
    gl.uniform2f(u.uFocus, f[0], f[1]);
    gl.uniform3f(u.uEdgeCol, e[0], e[1], e[2]);
    gl.uniform1f(u.uEdgeAmt, this._trans.amt);
    gl.uniform4f(u.uLookA, la.rain, la.wave, la.rays, la.ripple);
    gl.uniform4f(u.uLookB, lb.rain, lb.wave, lb.rays, lb.ripple);
    gl.uniform2f(u.uMotes, la.motes, lb.motes);
    gl.uniform1f(u.uFlash, this._flash);
    gl.uniform1f(u.uReveal, this._reveal);
    gl.uniform1f(u.uMotion, this._motion);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  // ---------- Respaldo sin WebGL ----------
  _initFallback() {
    this.isFallback = true;
    this.ready = true;
    const wrap = document.createElement('div');
    wrap.style.cssText =
      'position:relative;width:100%;height:100%;opacity:0;' +
      '-webkit-mask-image:radial-gradient(ellipse at center,#000 58%,transparent 100%);' +
      'mask-image:radial-gradient(ellipse at center,#000 58%,transparent 100%);';
    const mk = (top) => {
      const im = document.createElement('img');
      im.alt = '';
      im.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;' + (top ? 'opacity:0;' : '');
      wrap.appendChild(im);
      return im;
    };
    this._fb = { wrap, a: mk(false), b: mk(true), srcA: '', srcB: '' };
    this.container.appendChild(wrap);
  }

  _drawFallback() {
    if (!this._fb) return;
    const sa = (this._frames[this._A] || {}).src || '';
    const sb = (this._frames[this._B] || {}).src || '';
    if (sa !== this._fb.srcA) { this._fb.a.src = sa; this._fb.srcA = sa; }
    if (sb !== this._fb.srcB) { this._fb.b.src = sb; this._fb.srcB = sb; }
    this._fb.b.style.opacity = String(clamp(this._prog, 0, 1));
    this._fb.wrap.style.opacity = String(clamp(this._reveal * 1.4, 0, 1));
  }

  // ---------- Secuencia de láminas ----------
  // Qué lámina toca en (versículo, avance 0..1): la última de la tabla cuyo
  // momento ya pasó (los versículos anteriores cuentan completos).
  _frameAt(verse, progress) {
    let key = this._cues[0].frame;
    for (let i = 0; i < this._cues.length; i += 1) {
      const c = this._cues[i];
      if (c.v < verse || (c.v === verse && c.at <= progress + 1e-6)) key = c.frame;
      else break;
    }
    return key;
  }

  _startTransition(key) {
    this._A = this._B;
    this._B = key;
    this._prog = 0;
    this._tStart = this._lastElapsed;
    this._trans = this._transFor(key);
  }

  // Ir a una lámina. snap = corte en seco (saltos y reinicios); si no, entra
  // con su transición, o espera su turno si hay otra en curso.
  _goto(key, snap = false) {
    if (!this._frames[key]) return; // clave desconocida: se ignora
    if (snap) {
      this._A = key;
      this._B = key;
      this._prog = 1;
      this._queued = null;
      this._trans = this._transFor(key);
      this._flash = 0;
      this._draw();
      return;
    }
    if (this._prog >= 1) {
      if (key === this._B) return;
      this._startTransition(key);
    } else if (key === this._B) {
      this._queued = null; // ya viaja hacia esa
      return;
    } else {
      this._queued = key; // espera a que termine la actual
      return;
    }
    this._draw();
  }

  // La app avisa dónde va la narración. progress = posición en el versículo
  // (0 al empezar, 1 al terminar); snap = salto (no continuación natural).
  cue(verse, progress = 0, snap = false) {
    this._cueDriven = true;
    const p = clamp(progress, 0, 1);
    this._goto(this._multi ? this._frameAt(verse, p) : this._legacyFrameAt(verse, p), snap);
  }

  // Compatibilidad: con el illustrations.js de dos láminas ({ storm, calm })
  // la bonanza llega al "Y cesó el viento" del versículo 39.
  _legacyFrameAt(verse, progress) {
    return verse < 39 || (verse === 39 && progress < 0.6) ? 'storm' : 'calm';
  }

  _stageFrame(stage) {
    const table = this._multi ? STAGE_FRAME_MULTI : STAGE_FRAME_LEGACY;
    return table[stage] || table['storm-building'];
  }

  // ---------- Interfaz pública (igual que Scene3D) ----------
  // stage: 'storm-building' | 'storm-peak' | 'command' | 'calm'.
  // Solo manda si la app no usa cue() (versión anterior de la app).
  render(elapsedSeconds, stage) {
    const dt = clamp(elapsedSeconds - this._lastElapsed, 0, 0.2);
    this._lastElapsed = elapsedSeconds;
    this._time = elapsedSeconds;
    if (!this._cueDriven && stage && stage !== this._lastStage) {
      this._lastStage = stage;
      this._goto(this._stageFrame(stage), false);
    }
    // Avance de la transición en curso (por el reloj de la animación: se
    // detiene al pausar) y arranque de la que esperaba su turno.
    if (this._prog < 1) {
      this._prog = clamp((elapsedSeconds - this._tStart) / this._trans.dur, 0, 1);
      if (this._prog >= 1) {
        this._A = this._B;
        if (this._queued && this._queued !== this._B) {
          const next = this._queued;
          this._queued = null;
          this._startTransition(next);
        }
      }
    }
    this._flash = Math.max(0, this._flash - dt * 3.2);
    // Tope de ~30 fotogramas/s: el movimiento es lento y así la lámina grande
    // no calienta el teléfono ni gasta batería de más.
    const since = elapsedSeconds - this._lastDrawT;
    if (since >= 0 && since < 0.028) return;
    this._lastDrawT = elapsedSeconds;
    this._draw();
  }

  // Corte duro, sin transición (reinicio de la secuencia o salto de
  // versículo hacia atrás). Solo para la app anterior: la nueva usa cue().
  snapToStage(stage) {
    if (this._cueDriven) return;
    this._lastStage = stage;
    this._goto(this._stageFrame(stage), true);
  }

  triggerLightning() {
    this._flash = 1;
    this._draw();
  }

  // Aparición tipo portal de la lámina en la página (ms).
  reveal(durationMs = 1700) {
    this._revealing = true;
    const from = performance.now();
    const tick = (now) => {
      if (!this._revealing) return;
      const t = clamp((now - from) / durationMs, 0, 1);
      this._reveal = t * t * (3 - 2 * t);
      this._draw();
      if (t < 1) requestAnimationFrame(tick);
      else this._revealing = false;
    };
    requestAnimationFrame(tick);
  }

  resetReveal() {
    this._revealing = false;
    this._reveal = 0;
    this._draw();
  }

  dispose() {
    this._revealing = false;
    if (this._ro) this._ro.disconnect();
    this._canvas.removeEventListener('webglcontextlost', this._onLost);
    this._canvas.removeEventListener('webglcontextrestored', this._onRestored);
    this.container.replaceChildren();
  }
}

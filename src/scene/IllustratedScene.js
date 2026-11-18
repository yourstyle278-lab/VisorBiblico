// IllustratedScene.js — El "Visor" como una ILUSTRACIÓN DEL LIBRO que cobra vida.
//
// Reemplaza a Scene3D.js (geometría 3D oscura de Three.js) porque el
// Visor no puede verse descuadrado del libro: tiene que ser una lámina
// impresa en la página, en el estilo exacto de papel recortado de las
// imágenes de referencia (Turno 18). Mantiene LA MISMA interfaz que
// Scene3D — render(elapsedSeconds, stage), snapToStage(stage),
// triggerLightning() — así que la narración, el reloj de animación, el
// suavizado y el corte duro (Turnos 11-12) siguen funcionando igual.
// Nuevo: reveal() / resetReveal() para la aparición tipo "portal".
//
// TÉCNICA (investigada en el Turno 18): un solo fragment shader sobre un
// rectángulo, en WebGL directo — Three.js no hace falta para una imagen
// plana y esto pesa mucho menos. Capas, todas controladas por la etapa:
//  1. Desplazamiento de olas y balanceo de la barca (solo en la zona del
//     agua/barca, según la composición de las láminas).
//  2. Lluvia procedural en tres capas, inclinada como la pintada.
//  3. Rayos de luz aditivos que nacen del hueco entre las nubes.
//  4. Disolución tormenta→bonanza: un frente de ruido que nace en
//     Jesús y se expande, con un borde dorado brillante — es lo que da
//     el "movimiento de paz" en vez de un corte (la técnica habitual de
//     transiciones por umbral de ruido entre dos texturas).
//  5. Ondas concéntricas que se expanden desde la barca en la bonanza.
//  6. Revelado tipo portal al aparecer la lámina en la página.
// Esquinas/bordes se funden con el papel de la página (alfa), no hay
// rectángulo negro.
//
// TURNO 19 — MÁS MOVIMIENTO (con las mismas dos láminas, sin imágenes nuevas):
//  7. Cámara: vaivén y giro leves (más en la tormenta), empuje hacia la
//     escena al crecer la tensión y retirada al llegar la calma.
//  8. Paralaje de papel recortado: cielo, barca y mar se desplazan distinto.
//  9. Olas ~3x más amplias y barca que cabecea girando sobre su centro; nubes
//     que se deslizan y "hierven"; la túnica respira con la brisa.
// 10. En la bonanza el mar sigue respirando (antes quedaba inmóvil), ondas
//     más amplias y motas de luz dorada subiendo por los rayos.
// Ahorro: el ruido de la disolución y del portal solo se calcula mientras
// están en curso; la lluvia solo mientras llueve.
//
// RESPALDO: si el navegador no da WebGL, se usan dos <img> apiladas con
// fundido de opacidad — sin lluvia ni olas, pero la lámina y la
// transición siguen ahí.

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
uniform sampler2D uStorm;
uniform sampler2D uCalm;
uniform float uTime;
uniform float uAspect;
uniform float uCalmAmt;
uniform float uRain;
uniform float uWave;
uniform float uRays;
uniform float uRipple;
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

// Una capa de lluvia: rayas finas inclinadas hacia abajo-izquierda,
// como las pintadas en la lámina de tormenta.
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

  // --- CÁMARA (Turno 19): la lámina deja de ser un cuadro fijo. Vaivén y giro
  // leves, más fuertes en la tormenta; la cámara "empuja" hacia la escena
  // al crecer la tensión y se retira al llegar la calma.
  float tension = clamp(uRain, 0.0, 1.0);
  float sway = (0.4 + 0.6 * tension) * uMotion;
  vec2 cam = vec2(
    (noise(vec2(uTime * 0.21, 1.7)) - 0.5) * 0.020 + sin(uTime * 0.83) * 0.004 * tension,
    (noise(vec2(uTime * 0.17, 9.1)) - 0.5) * 0.014 + sin(uTime * 1.21) * 0.005 * tension) * sway;
  float roll = ((noise(vec2(uTime * 0.15, 4.2)) - 0.5) * 0.030 + sin(uTime * 0.61) * 0.006 * tension) * sway;
  float zoom = 1.02 + (0.030 * tension + 0.006 * sin(uTime * 0.29)) * uMotion;
  vec2 pc = (uv - vec2(0.5, 0.56)) * asp;
  pc = vec2(cos(roll) * pc.x - sin(roll) * pc.y, sin(roll) * pc.x + cos(roll) * pc.y);
  vec2 iuv = vec2(0.5, 0.56) + (pc / asp) / zoom + cam;   // espacio de la imagen

  // --- Máscaras de región (según la composición de las dos láminas) ---
  float water = smoothstep(0.60, 0.72, iuv.y);
  float boat = 1.0 - smoothstep(0.55, 1.0, length((iuv - vec2(0.52, 0.67)) / vec2(0.31, 0.17)));
  float jesus = 1.0 - smoothstep(0.4, 1.0, length((iuv - vec2(0.63, 0.52)) / vec2(0.10, 0.26)));
  float sky = 1.0 - smoothstep(0.24, 0.46, iuv.y);
  // La figura de Jesús (cabeza y torso) sube hasta la zona de nubes: no debe
  // moverse con ellas, sino con la barca en la que está de pie.
  float fig = max(jesus, 1.0 - smoothstep(0.5, 1.0, length((iuv - vec2(0.62, 0.30)) / vec2(0.10, 0.18))));
  sky *= 1.0 - 0.92 * fig;

  // --- Desplazamientos ---
  vec2 d = vec2(0.0);
  float W = uWave * uMotion;
  // Paralaje de papel recortado: el cielo se desplaza menos que la cámara y el mar más.
  d += cam * (0.30 * water - 0.55 * sky);
  // Olas: franjas de papel que se deslizan y cabecean.
  d.x += sin(iuv.y * 26.0 + uTime * 1.5) * 0.0065 * water * W;
  d.y += sin(iuv.x * 13.0 - uTime * 1.7 + iuv.y * 5.0) * 0.0085 * water * W;
  d.y += sin(iuv.x * 31.0 + uTime * 2.3) * 0.0030 * water * W;
  // Barca: cabeceo (giro sobre su centro), subida y bajada, y vaivén.
  vec2 bp = (iuv - vec2(0.52, 0.70)) * asp;
  float pitch = (sin(uTime * 1.05) * 0.030 + sin(uTime * 0.47 + 1.3) * 0.012) * W;
  d += vec2(-bp.y / uAspect, bp.x) * pitch * boat;
  d.y += sin(uTime * 1.15 + iuv.x * 4.0) * 0.0090 * boat * W;
  d.x += sin(uTime * 0.9) * 0.0045 * boat * W;
  // Nubes: se deslizan y "hierven" despacio (más en la tormenta).
  if (sky > 0.001) {
    float sm = uMotion * (0.35 + 0.65 * tension);
    vec2 cn = vec2(iuv.x * 2.2 + uTime * 0.05, iuv.y * 2.6);
    d.x += (noise(cn + vec2(0.0, uTime * 0.07)) - 0.5) * 0.026 * sky * sm;
    d.y += (noise(cn * 1.7 + vec2(5.2 - uTime * 0.06, 1.3)) - 0.5) * 0.016 * sky * sm;
    d.x += sin(uTime * 0.11) * 0.010 * sky * uMotion;
  }
  // Ondas concéntricas desde la barca en la bonanza.
  vec2 rp = (iuv - vec2(0.52, 0.80)) * asp * vec2(1.0, 2.2);
  float rd = length(rp);
  float rz = water * uRipple * smoothstep(1.0, 0.05, rd) * uMotion;
  d.y += sin(rd * 48.0 - uTime * 1.3) * 0.0055 * rz;
  d.x += cos(rd * 40.0 - uTime * 1.1) * 0.0025 * rz;
  // Túnica de Jesús: la brisa (siempre un poco, más en la tormenta).
  float jm = jesus * (0.35 + 0.65 * uWave) * uMotion;
  d.x += sin(iuv.y * 34.0 + uTime * 1.9) * 0.0035 * jm;
  d.y += sin(iuv.x * 26.0 + uTime * 1.4) * 0.0015 * jm;

  vec2 suv = clamp(iuv + d, 0.001, 0.999);
  vec3 cs = texture2D(uStorm, suv).rgb;
  vec3 cc = texture2D(uCalm, suv).rgb;

  // --- Disolución tormenta -> bonanza: frente de ruido que nace en Jesús ---
  // (el ruido solo se calcula mientras el frente avanza: ahorra batería)
  vec2 q = (iuv - vec2(0.625, 0.36)) * asp;
  float dist = length(q);
  float calmAmt = clamp(uCalmAmt, 0.0, 1.0);
  float m = 0.0;
  float edge = 0.0;
  if (calmAmt >= 0.97) {
    m = 1.0;
  } else if (calmAmt > 0.002) {
    float n = fbm(iuv * asp * 4.0 + vec2(0.0, uTime * 0.02));
    float front = mix(-0.25, 1.67, calmAmt);
    float t = front - dist + (n - 0.5) * 0.44;
    m = smoothstep(0.0, 0.07, t);
    edge = smoothstep(0.0, 0.03, t) * (1.0 - smoothstep(0.03, 0.12, t));
  }

  vec3 col = mix(cs, cc, m);
  col += edge * vec3(1.0, 0.80, 0.42) * (0.38 + 0.14 * sin(uTime * 3.0));
  float pulse = sin(3.14159 * calmAmt);
  col += vec3(0.20, 0.13, 0.04) * pulse * exp(-dist * 1.4);

  // --- Rayos de luz que nacen del hueco entre las nubes ---
  vec2 rq = (iuv - vec2(0.47, 0.16)) * asp;
  float ang = atan(rq.y, rq.x);
  float rl = length(rq);
  float wob = noise(vec2(ang * 3.0, uTime * 0.05)) + 0.5 * noise(vec2(ang * 6.0, uTime * 0.07 + 3.0));
  float beam = 0.5 + 0.5 * sin(ang * 15.0 + wob * 2.0 + uTime * 0.18);
  beam = pow(beam, 4.0);
  float breathe = 0.88 + 0.12 * sin(uTime * 0.7 + ang * 3.0);
  float rays = beam * breathe * exp(-rl * 1.7) * smoothstep(0.02, 0.20, rq.y);
  col += vec3(1.0, 0.84, 0.52) * rays * 0.28 * uRays;

  // --- Motas de luz dorada que suben por los rayos (solo en la bonanza) ---
  if (uRays > 0.05 && calmAmt > 0.3) {
    float motes = 0.0;
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
      motes += step(0.80, h) * smoothstep(0.10, 0.0, length(f - off)) * tw;
    }
    float zone = smoothstep(0.02, 0.30, rq.y) * exp(-rl * 1.2);
    col += vec3(1.0, 0.86, 0.55) * motes * zone * uRays * smoothstep(0.3, 0.9, calmAmt) * 1.1;
  }

  // --- Lluvia (solo donde sigue la tormenta) ---
  if (uRain > 0.01 && calmAmt < 0.97) {
    float r = rainLayer(uv, 38.0, 3.2, 0.0) * 0.9
            + rainLayer(uv, 60.0, 4.6, 13.0) * 0.6
            + rainLayer(uv, 90.0, 6.0, 29.0) * 0.4;
    col = mix(col, vec3(0.95, 0.93, 0.88), clamp(r, 0.0, 1.0) * 0.46 * uRain * (1.0 - m));
  }

  // --- Relámpago ---
  col += vec3(0.85, 0.88, 1.0) * uFlash * 0.5 * (1.0 - m);

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

// Valores objetivo por etapa — mismas etapas que usa el resto de la app.
// calm: avance de la disolución (0 tormenta, 1 bonanza).
const STAGE_TARGETS = {
  'storm-building': { calm: 0, rain: 0.45, wave: 0.55, rays: 0.12, ripple: 0 },
  'storm-peak': { calm: 0, rain: 1.0, wave: 1.0, rays: 0.15, ripple: 0 },
  command: { calm: 1, rain: 0.0, wave: 0.25, rays: 1.0, ripple: 0.35 },
  // Turno 19: en la bonanza el mar respira con suavidad (antes wave=0 dejaba
  // la lámina completamente inmóvil y parecía una foto).
  calm: { calm: 1, rain: 0.0, wave: 0.14, rays: 0.9, ripple: 0.8 },
};
// Constantes de tiempo (segundos) del suavizado. La disolución es lenta a
// propósito: "no es parar en seco sino un movimiento de paz" (Turno 11).
const TAU = { calm: 4.5, rain: 2.2, wave: 2.6, rays: 2.4, ripple: 2.4 };
const UNIFORMS = [
  'uStorm', 'uCalm', 'uTime', 'uAspect', 'uCalmAmt', 'uRain', 'uWave',
  'uRays', 'uRipple', 'uFlash', 'uReveal', 'uMotion',
];

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

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
  // se mide en cada dibujo). illustrations: { storm, calm } (data-URI o URL).
  constructor(containerEl, illustrations) {
    this.container = containerEl;
    this._illus = illustrations;
    this.ready = false;
    this.isFallback = false;

    this._cur = { calm: 0, rain: 0.45, wave: 0.55, rays: 0.12, ripple: 0 };
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

    this._tex = [];
    this.ready = false;
    Promise.all([loadImage(this._illus.storm), loadImage(this._illus.calm)])
      .then(([storm, calm]) => {
        if (!this._gl) return; // ya cayó al respaldo
        this._aspect = storm.naturalWidth / storm.naturalHeight;
        [storm, calm].forEach((img, i) => {
          const tex = gl.createTexture();
          gl.activeTexture(gl.TEXTURE0 + i);
          gl.bindTexture(gl.TEXTURE_2D, tex);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
          // Texturas de tamaño no potencia de 2 en WebGL1: sin mipmaps y con CLAMP.
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
          this._tex[i] = tex;
        });
        gl.uniform1i(this._u.uStorm, 0);
        gl.uniform1i(this._u.uCalm, 1);
        this.ready = true;
        this._draw();
      })
      .catch((err) => {
        console.warn('IllustratedScene: no se cargaron las láminas.', err);
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
    if (!gl || !this.ready || this._lost) return;
    if (!this._resizeCanvas()) return; // oculto o sin tamaño: nada que dibujar
    gl.viewport(0, 0, this._canvas.width, this._canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    const u = this._u;
    gl.uniform1f(u.uTime, this._time);
    gl.uniform1f(u.uAspect, this._aspect);
    gl.uniform1f(u.uCalmAmt, this._cur.calm);
    gl.uniform1f(u.uRain, this._cur.rain);
    gl.uniform1f(u.uWave, this._cur.wave);
    gl.uniform1f(u.uRays, this._cur.rays);
    gl.uniform1f(u.uRipple, this._cur.ripple);
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
    const mk = (src, top) => {
      const im = document.createElement('img');
      im.src = src;
      im.alt = '';
      im.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;' + (top ? 'opacity:0;' : '');
      wrap.appendChild(im);
      return im;
    };
    this._fb = { wrap, storm: mk(this._illus.storm, false), calm: mk(this._illus.calm, true) };
    this.container.appendChild(wrap);
  }

  _drawFallback() {
    if (!this._fb) return;
    this._fb.calm.style.opacity = String(clamp(this._cur.calm, 0, 1));
    this._fb.wrap.style.opacity = String(clamp(this._reveal * 1.4, 0, 1));
  }

  // ---------- Interfaz pública (igual que Scene3D) ----------
  // stage: 'storm-building' | 'storm-peak' | 'command' | 'calm'
  render(elapsedSeconds, stage) {
    const dt = clamp(elapsedSeconds - this._lastElapsed, 0, 0.2);
    this._lastElapsed = elapsedSeconds;
    this._time = elapsedSeconds;
    const target = STAGE_TARGETS[stage] || STAGE_TARGETS['storm-building'];
    Object.keys(target).forEach((k) => {
      this._cur[k] += (target[k] - this._cur[k]) * (1 - Math.exp(-dt / TAU[k]));
    });
    this._flash = Math.max(0, this._flash - dt * 3.2);
    // Tope de ~30 fotogramas/s: el movimiento es lento y así la lámina grande
    // no calienta el teléfono ni gasta batería de más. Los cuadros intermedios
    // no se dibujan (el estado y el suavizado sí avanzan en cada llamada).
    const since = elapsedSeconds - this._lastDrawT;
    if (since >= 0 && since < 0.028) return;
    this._lastDrawT = elapsedSeconds;
    this._draw();
  }

  // Corte duro, sin transición (reinicio de la secuencia o salto de
  // versículo hacia atrás) — mismo motivo que en Scene3D (Turno 12): sin
  // esto, volver de la bonanza a la tormenta se vería como "rebobinar".
  snapToStage(stage) {
    const target = STAGE_TARGETS[stage] || STAGE_TARGETS['storm-building'];
    Object.assign(this._cur, target);
    this._flash = 0;
    this._draw();
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

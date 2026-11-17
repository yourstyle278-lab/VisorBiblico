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
  vec2 uv = vUv;
  vec2 asp = vec2(uAspect, 1.0);

  // --- Máscaras de región (según la composición de las dos láminas) ---
  float water = smoothstep(0.60, 0.72, uv.y);
  float boat = 1.0 - smoothstep(0.55, 1.0, length((uv - vec2(0.52, 0.67)) / vec2(0.31, 0.17)));
  float jesus = 1.0 - smoothstep(0.4, 1.0, length((uv - vec2(0.63, 0.52)) / vec2(0.10, 0.26)));

  // --- Desplazamientos: olas, balanceo, ondas de bonanza, túnica ---
  vec2 d = vec2(0.0);
  d.x += sin(uv.y * 22.0 + uTime * 1.6) * 0.0022 * water * uWave;
  d.y += sin(uv.x * 17.0 - uTime * 1.3 + uv.y * 6.0) * 0.0038 * water * uWave;
  d.y += sin(uTime * 1.15 + uv.x * 4.0) * 0.0050 * boat * uWave;
  d.x += sin(uTime * 0.9) * 0.0022 * boat * uWave;
  vec2 rp = (uv - vec2(0.52, 0.80)) * asp * vec2(1.0, 2.2);
  float rd = length(rp);
  d.y += sin(rd * 48.0 - uTime * 1.2) * 0.0024 * water * uRipple * smoothstep(1.0, 0.05, rd);
  d.x += sin(uv.y * 34.0 + uTime * 1.3) * 0.0016 * jesus;
  vec2 suv = clamp(uv + d, 0.001, 0.999);

  vec3 cs = texture2D(uStorm, suv).rgb;
  vec3 cc = texture2D(uCalm, suv).rgb;

  // --- Disolución tormenta -> bonanza: frente de ruido que nace en Jesús ---
  vec2 q = (uv - vec2(0.625, 0.36)) * asp;
  float dist = length(q);
  float n = fbm(uv * asp * 4.0 + vec2(0.0, uTime * 0.02));
  float front = mix(-0.25, 1.67, clamp(uCalmAmt, 0.0, 1.0));
  float t = front - dist + (n - 0.5) * 0.44;
  float m = smoothstep(0.0, 0.07, t);
  float edge = smoothstep(0.0, 0.03, t) * (1.0 - smoothstep(0.03, 0.12, t));

  vec3 col = mix(cs, cc, m);
  col += edge * vec3(1.0, 0.80, 0.42) * (0.38 + 0.14 * sin(uTime * 3.0));
  float pulse = sin(3.14159 * clamp(uCalmAmt, 0.0, 1.0));
  col += vec3(0.20, 0.13, 0.04) * pulse * exp(-dist * 1.4);

  // --- Rayos de luz que nacen del hueco entre las nubes ---
  vec2 rq = (uv - vec2(0.47, 0.16)) * asp;
  float ang = atan(rq.y, rq.x);
  float rl = length(rq);
  float beam = 0.5 + 0.5 * sin(ang * 15.0 + fbm(vec2(ang * 3.0, uTime * 0.05)) * 3.0 + uTime * 0.18);
  beam = pow(beam, 4.0);
  float rays = beam * exp(-rl * 1.7) * smoothstep(0.02, 0.20, rq.y);
  col += vec3(1.0, 0.84, 0.52) * rays * 0.28 * uRays;

  // --- Lluvia (solo donde sigue la tormenta) ---
  float r = rainLayer(uv, 38.0, 3.2, 0.0) * 0.9
          + rainLayer(uv, 60.0, 4.6, 13.0) * 0.6
          + rainLayer(uv, 90.0, 6.0, 29.0) * 0.4;
  col = mix(col, vec3(0.95, 0.93, 0.88), clamp(r, 0.0, 1.0) * 0.42 * uRain * (1.0 - m));

  // --- Relámpago ---
  col += vec3(0.85, 0.88, 1.0) * uFlash * 0.5 * (1.0 - m);

  // --- Fundido de los bordes con el papel de la página ---
  float ex = smoothstep(0.0, 0.05, uv.x) * smoothstep(0.0, 0.05, 1.0 - uv.x);
  float ey = smoothstep(0.0, 0.06, uv.y) * smoothstep(0.0, 0.07, 1.0 - uv.y);
  float alpha = ex * ey;

  // --- Revelado tipo portal: anillo dorado que se abre desde el centro ---
  vec2 cq = (uv - vec2(0.5, 0.52)) * asp;
  float cd = length(cq);
  float n2 = fbm(uv * asp * 3.0 + 7.3);
  float rt = mix(-0.35, 1.5, clamp(uReveal, 0.0, 1.0)) - cd + (n2 - 0.5) * 0.5;
  float rm = smoothstep(0.0, 0.10, rt);
  float redge = smoothstep(0.0, 0.04, rt) * (1.0 - smoothstep(0.04, 0.22, rt));
  col += redge * vec3(1.0, 0.82, 0.45) * 0.5;
  alpha *= clamp(rm + redge * 0.6, 0.0, 1.0);

  gl_FragColor = vec4(col * alpha, alpha);
}`;

// Valores objetivo por etapa — mismas etapas que usa el resto de la app.
// calm: avance de la disolución (0 tormenta, 1 bonanza).
const STAGE_TARGETS = {
  'storm-building': { calm: 0, rain: 0.45, wave: 0.55, rays: 0.12, ripple: 0 },
  'storm-peak': { calm: 0, rain: 1.0, wave: 1.0, rays: 0.15, ripple: 0 },
  command: { calm: 1, rain: 0.0, wave: 0.2, rays: 1.0, ripple: 0.35 },
  calm: { calm: 1, rain: 0.0, wave: 0.0, rays: 0.9, ripple: 0.8 },
};
// Constantes de tiempo (segundos) del suavizado. La disolución es lenta a
// propósito: "no es parar en seco sino un movimiento de paz" (Turno 11).
const TAU = { calm: 4.5, rain: 2.2, wave: 2.6, rays: 2.4, ripple: 2.4 };
const UNIFORMS = [
  'uStorm', 'uCalm', 'uTime', 'uAspect', 'uCalmAmt', 'uRain', 'uWave',
  'uRays', 'uRipple', 'uFlash', 'uReveal',
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
    this._time = 0;
    this._flash = 0;
    this._reveal = 0;
    this._revealing = false;
    this._size = { w: 0, h: 0 };
    this._lost = false;

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
    const pw = Math.round(w * dpr);
    const ph = Math.round(h * dpr);
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

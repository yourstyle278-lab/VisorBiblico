// Scene3D.js — Escena 3D con enfoque HÍBRIDO: 3D en vivo (mar, cámara,
// luces) + siluetas planas tipo "recorte de papel" para la barca y las
// figuras (teatro de sombras), en vez de geometría 3D genérica.
//
// CAMBIO TURNO 11 (ruta: src/scene/Scene3D.js) — a partir de tu prueba
// real en el teléfono del Turno 10:
// 1) "Falta iluminación y claridad para ver a las personas en la barca":
//    las figuras usan MeshBasicMaterial (silueta pura, no reacciona a
//    ninguna luz de la escena) — así que el problema NUNCA fue poca luz
//    SOBRE ellas, sino poco contraste DETRÁS de ellas: en tormenta, el
//    fondo (niebla + mar) era casi tan oscuro como la silueta misma. Se
//    subió backLight de tormenta de 1.5 a un valor bastante más alto
//    (target ~3.2) — esa luz sí ilumina el mar (MeshStandardMaterial),
//    creando un fondo más visible detrás de la barca sin tocar el color
//    de la silueta ni volver a acercarse a los valores que causaron el
//    destello del Turno 8.
// 2) "No hay fluidez de movimiento como en las siluetas de Harry Potter":
//    antes las figuras eran formas rígidas sin ninguna animación propia
//    (solo el balanceo del grupo entero de la barca). Se agregó:
//    - Una leve oscilación de "estar vivo" en Jesús de pie y en los 3
//      discípulos (rotación sutil, con una fase distinta por figura para
//      que no se muevan todos igual — eso se ve robótico).
//    - Jesús ya NO cambia de dormido a de pie de un salto: hay una
//      transición de ~2s con una coreografía en dos tiempos (primero se
//      incorpora — mezcla de opacidad entre la figura dormida y la de
//      pie —, y solo después extiende el brazo desde una posición de
//      descanso hasta el gesto de mandato), más un pequeño ascenso en Y.
// 3) "La gran bonanza no es parar en seco sino un movimiento de paz":
//    antes, TODOS los valores dependientes de la etapa (amplitud/
//    frecuencia de las olas, paleta de color del mar/niebla/ambiente,
//    intensidad de la luz trasera) saltaban de golpe al cambiar de
//    etapa. Ahora hay un solo mecanismo de suavizado (ease exponencial
//    con base en el tiempo real transcurrido, no en el framerate) que
//    se aplica a TODOS esos valores por igual — así que tanto que la
//    tormenta se agrave como que amaine se sienten como un movimiento
//    continuo, nunca como un corte.
//
// Interfaz pública SIN cambios: constructor(containerEl),
// render(elapsedSeconds, stage), triggerLightning().
//
// Nota de honestidad: sigue sin haber confirmación en un navegador real
// para ESTE cambio específico — se revisó a mano cada valor y cada
// fórmula, y la sintaxis pasa node --check, pero las proporciones y
// tiempos exactos (qué tan rápido se ve bien la subida del brazo, cuánto
// contraste hace falta de verdad) solo se pueden afinar con la prueba en
// tu teléfono. Trátalo como un paso adelante, no como algo cerrado.

import * as THREE from 'three';

const PALETTE = {
  storm: {
    fog: 0x0b1620,
    seaDeep: 0x082830,
    seaShallow: 0x1f6b78,
    ambient: 0x1e293b,
  },
  calm: {
    fog: 0x16313a,
    seaDeep: 0x0d4d55,
    seaShallow: 0x2fa79c,
    ambient: 0x4a3a1e,
  },
};

const SILHOUETTE_COLOR = 0x03040a;
const RAIN_COLOR = 0xaec6d1;

// Cuánto tardan en "alcanzar" al valor objetivo los parámetros que se
// suavizan (olas, colores, luz). Más alto = transición más lenta/pacífica.
const TRANSITION_SECONDS = 2.2;
// Cuánto tarda Jesús en pasar de dormido a de pie con el brazo extendido.
const RISE_SECONDS = 2.0;
// Fracción inicial de ese tiempo dedicada a "incorporarse" antes de que
// el brazo empiece a moverse (coreografía en dos tiempos).
const RISE_BEFORE_ARM = 0.4;

export class Scene3D {
  constructor(containerEl) {
    this.container = containerEl;
    this._buildScene();

    // --- Estado suavizado: se acerca al objetivo cada frame, no salta ---
    this._curWaveAmp = 0.8;
    this._curWaveFreq = 1.8;
    this._curBackLight = 1.5;
    this._curFog = new THREE.Color(PALETTE.storm.fog);
    this._curAmbient = new THREE.Color(PALETTE.storm.ambient);
    this._curDeep = new THREE.Color(PALETTE.storm.seaDeep);
    this._curShallow = new THREE.Color(PALETTE.storm.seaShallow);
    this._riseProgress = 0; // 0 = dormido, 1 = de pie y con el brazo en alto
    this._lastElapsed = 0;
  }

  _buildScene() {
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(PALETTE.storm.fog, 0.04);

    this.camera = new THREE.PerspectiveCamera(
      60,
      this.container.clientWidth / this.container.clientHeight,
      0.1,
      1000
    );
    this.camera.position.set(0, 3, 10);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.container.appendChild(this.renderer.domElement);

    this.ambientLight = new THREE.AmbientLight(PALETTE.storm.ambient, 1.8);
    this.scene.add(this.ambientLight);

    // Luz cálida detrás de la barca: crea el fondo iluminado contra el
    // que las siluetas oscuras se recortan (look de teatro de sombras).
    // Es la ÚNICA fuente real de contraste para verlas, porque su propio
    // material no reacciona a la luz (ver comentario de cabecera, punto 1).
    this.backLight = new THREE.PointLight(0xffd27a, 0, 60);
    this.backLight.position.set(0, 4, -8);
    this.scene.add(this.backLight);

    this.lightningLight = new THREE.PointLight(0x38bdf8, 0, 100);
    this.lightningLight.position.set(0, 15, -10);
    this.scene.add(this.lightningLight);

    this._buildOcean();
    this._buildSilhouettes();
    this._buildRain();

    window.addEventListener('resize', () => this._onResize());
  }

  _buildOcean() {
    const geo = new THREE.PlaneGeometry(60, 60, 48, 48);
    const count = geo.attributes.position.count;
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(count * 3), 3));

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.7,
      metalness: 0.15,
    });
    this.oceanMesh = new THREE.Mesh(geo, mat);
    this.oceanMesh.rotation.x = -Math.PI / 2;
    this.scene.add(this.oceanMesh);
  }

  // --- Siluetas planas ("recorte de papel") ---------------------------
  // Construye una figura como forma 2D plana (túnica + cabeza + brazo
  // opcional). Ahora el material siempre es transparent:true (aunque
  // empiece en opacity 1) para poder desvanecer/aparecer figuras sin
  // saltos — lo usa la transición de Jesús. armRestAngle es el ángulo de
  // reposo del brazo; armTargetAngle es a dónde debe llegar cuando
  // riseProgress = 1 (si la figura no anima el brazo, ambos son iguales).
  _makeRobedFigure({
    height = 1.0,
    hemWidth = 0.5,
    shoulderWidth = 0.24,
    headRadius = 0.13,
    armAngle = null,
    armRestAngle = null,
    armLength = 0.55,
    leanZ = 0,
  } = {}) {
    const group = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({
      color: SILHOUETTE_COLOR,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 1,
    });
    group.userData.mat = mat;

    const shoulderY = height * 0.78;
    const bodyShape = new THREE.Shape();
    bodyShape.moveTo(-hemWidth / 2, 0);
    bodyShape.lineTo(hemWidth / 2, 0);
    bodyShape.quadraticCurveTo(hemWidth / 2, shoulderY * 0.6, shoulderWidth / 2, shoulderY);
    bodyShape.lineTo(-shoulderWidth / 2, shoulderY);
    bodyShape.quadraticCurveTo(-hemWidth / 2, shoulderY * 0.6, -hemWidth / 2, 0);
    const body = new THREE.Mesh(new THREE.ShapeGeometry(bodyShape), mat);
    group.add(body);

    const head = new THREE.Mesh(new THREE.CircleGeometry(headRadius, 12), mat);
    head.position.set(0, shoulderY + headRadius * 0.95, 0.001);
    group.add(head);

    if (armAngle !== null) {
      const armW = 0.06;
      const armShape = new THREE.Shape();
      armShape.moveTo(-armW / 2, 0);
      armShape.lineTo(armW / 2, 0);
      armShape.lineTo(armW / 3, armLength);
      armShape.lineTo(-armW / 3, armLength);
      const arm = new THREE.Mesh(new THREE.ShapeGeometry(armShape), mat);
      arm.position.set(0, shoulderY * 0.92, 0.001);
      arm.rotation.z = armRestAngle !== null ? armRestAngle : armAngle;
      group.add(arm);
      group.userData.arm = arm;
      group.userData.armRestAngle = armRestAngle !== null ? armRestAngle : armAngle;
      group.userData.armTargetAngle = armAngle;
    }

    if (leanZ) group.rotation.x = leanZ;
    return group;
  }

  _buildSilhouettes() {
    this.boatGroup = new THREE.Group();
    const silhouetteMat = new THREE.MeshBasicMaterial({
      color: SILHOUETTE_COLOR,
      side: THREE.DoubleSide,
    });

    // --- Casco: perfil 2D extruido ---
    const hullProfile = new THREE.Shape();
    hullProfile.moveTo(-1.7, 0.55);
    hullProfile.quadraticCurveTo(-2.0, 0.15, -1.55, -0.4);
    hullProfile.quadraticCurveTo(-0.5, -0.62, 0.5, -0.58);
    hullProfile.quadraticCurveTo(1.6, -0.48, 1.85, 0.05);
    hullProfile.quadraticCurveTo(2.0, 0.4, 1.65, 0.55);
    hullProfile.lineTo(-1.7, 0.55);
    const hullGeo = new THREE.ExtrudeGeometry(hullProfile, { depth: 1.5, bevelEnabled: false });
    hullGeo.translate(0, 0, -0.75);
    const hull = new THREE.Mesh(hullGeo, silhouetteMat);
    this.boatGroup.add(hull);

    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 2.6, 8), silhouetteMat);
    mast.position.set(-0.2, 1.85, 0);
    this.boatGroup.add(mast);

    // --- Jesús: dos poses; la transición entre ellas se anima en
    // render() a través de _riseProgress, no es un salto de visibilidad ---
    this.jesusSleeping = this._makeRobedFigure({
      height: 0.75,
      hemWidth: 0.62,
      shoulderWidth: 0.3,
      headRadius: 0.13,
    });
    this.jesusSleeping.rotation.z = Math.PI / 2;
    this.jesusSleeping.position.set(0.9, 0.42, 0);
    this.boatGroup.add(this.jesusSleeping);

    // armRestAngle: el brazo empieza casi pegado al cuerpo (reposo, recién
    // incorporado); armAngle (target): el gesto de mandato ya extendido.
    this.jesusStanding = this._makeRobedFigure({
      height: 1.35,
      hemWidth: 0.58,
      shoulderWidth: 0.26,
      headRadius: 0.14,
      armAngle: -Math.PI / 3.2,
      armRestAngle: 0.12,
    });
    this._jesusStandingBaseY = 0.5;
    this.jesusStanding.position.set(0.9, this._jesusStandingBaseY, 0);
    this.boatGroup.add(this.jesusStanding);

    // --- Discípulos: 3 poses distintas entre sí ---
    this.discipleFigures = [
      this._makeRobedFigure({ height: 0.85, hemWidth: 0.42, shoulderWidth: 0.2, headRadius: 0.1, leanZ: 0.35 }),
      this._makeRobedFigure({ height: 0.8, hemWidth: 0.4, shoulderWidth: 0.19, headRadius: 0.1, armAngle: Math.PI / 2.4, armLength: 0.4 }),
      this._makeRobedFigure({ height: 0.78, hemWidth: 0.44, shoulderWidth: 0.2, headRadius: 0.1, leanZ: -0.5 }),
    ];
    const disciplePositions = [
      [-0.55, 0.42, 0.35],
      [-0.9, 0.4, -0.32],
      [-0.15, 0.4, 0.45],
    ];
    this.discipleFigures.forEach((fig, i) => {
      fig.position.set(...disciplePositions[i]);
      fig.userData.baseRotZ = fig.rotation.z;
      this.boatGroup.add(fig);
    });

    this.boatGroup.position.set(0, 0.5, 0);
    this.scene.add(this.boatGroup);
  }

  _buildRain() {
    this._rainCount = 300;
    const positions = new Float32Array(this._rainCount * 6);
    for (let i = 0; i < this._rainCount; i++) this._resetDrop(positions, i, true);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.LineBasicMaterial({ color: RAIN_COLOR, transparent: true, opacity: 0.55 });
    this.particleSystem = new THREE.LineSegments(geo, mat);
    this.scene.add(this.particleSystem);
  }

  _resetDrop(positions, i, randomHeight) {
    const x = (Math.random() - 0.5) * 30;
    const z = (Math.random() - 0.5) * 30;
    const y = randomHeight ? Math.random() * 15 : 15;
    const len = 0.35 + Math.random() * 0.3;
    const base = i * 6;
    positions[base] = x;
    positions[base + 1] = y;
    positions[base + 2] = z;
    positions[base + 3] = x;
    positions[base + 4] = y - len;
    positions[base + 5] = z;
  }

  _onResize() {
    if (!this.container) return;
    this.camera.aspect = this.container.clientWidth / this.container.clientHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
  }

  // stage: 'storm-building' | 'storm-peak' | 'command' | 'calm'
  render(elapsedSeconds, stage) {
    // dt real desde el último frame (no asume 60fps); acotado para que un
    // frame largo (pestaña en segundo plano, primer frame) no produzca un
    // salto de golpe en los valores suavizados.
    const dt = Math.max(0, Math.min(0.2, elapsedSeconds - this._lastElapsed));
    this._lastElapsed = elapsedSeconds;
    const t = dt > 0 ? 1 - Math.exp(-dt / TRANSITION_SECONDS) : 0;
    const tRise = dt > 0 ? 1 - Math.exp(-dt / RISE_SECONDS) : 0;

    const isStorm = stage === 'storm-building' || stage === 'storm-peak';
    const isCalm = stage === 'calm';
    const jesusAwake = stage === 'command' || stage === 'calm';
    const targetPalette = isCalm ? PALETTE.calm : PALETTE.storm;

    const targetWaveAmp = isStorm ? 0.8 : 0.15;
    const targetWaveFreq = isStorm ? 1.8 : 0.4;
    // Tormenta sube de 1.5 a ~3.2: más contraste para ver la barca y a
    // las personas sin perder el ánimo sombrío frente a Mandato (4) y
    // Calma (6). No se toca metalness/roughness del mar (eso fue lo que
    // causó el destello del Turno 8) — solo la intensidad de esta luz.
    const targetBackLight = isCalm ? 6 : stage === 'command' ? 4 : 3.2;

    this._curWaveAmp += (targetWaveAmp - this._curWaveAmp) * t;
    this._curWaveFreq += (targetWaveFreq - this._curWaveFreq) * t;
    this._curBackLight += (targetBackLight - this._curBackLight) * t;
    this._curFog.lerp(new THREE.Color(targetPalette.fog), t);
    this._curAmbient.lerp(new THREE.Color(targetPalette.ambient), t);
    this._curDeep.lerp(new THREE.Color(targetPalette.seaDeep), t);
    this._curShallow.lerp(new THREE.Color(targetPalette.seaShallow), t);
    this._riseProgress += ((jesusAwake ? 1 : 0) - this._riseProgress) * tRise;

    // --- Jesús: coreografía en dos tiempos, nunca un salto ---
    const r = this._riseProgress;
    this.jesusSleeping.userData.mat.opacity = 1 - r;
    this.jesusSleeping.visible = r < 0.98;
    this.jesusStanding.userData.mat.opacity = r;
    this.jesusStanding.visible = r > 0.02;
    this.jesusStanding.position.y = this._jesusStandingBaseY - (1 - r) * 0.15;
    const arm = this.jesusStanding.userData.arm;
    if (arm) {
      const armT = THREE.MathUtils.clamp((r - RISE_BEFORE_ARM) / (1 - RISE_BEFORE_ARM), 0, 1);
      arm.rotation.z = THREE.MathUtils.lerp(
        this.jesusStanding.userData.armRestAngle,
        this.jesusStanding.userData.armTargetAngle,
        armT
      );
    }
    // Oscilación sutil de "estar vivo" — con riseProgress de factor para
    // que crezca junto con la aparición de la figura, y una fase propia
    // para no verse sincronizada con los discípulos.
    this.jesusStanding.rotation.z = Math.sin(elapsedSeconds * 0.7 + 1.3) * 0.045 * r;

    this.discipleFigures.forEach((fig, i) => {
      const phase = i * 2.09;
      const speed = 0.55 + i * 0.12;
      fig.rotation.z = (fig.userData.baseRotZ || 0) + Math.sin(elapsedSeconds * speed + phase) * 0.05;
    });

    // --- Mar: mismo enfoque de antes, ahora con los valores suavizados ---
    const dr = this._curDeep.r, dg = this._curDeep.g, db = this._curDeep.b;
    const sr = this._curShallow.r, sg = this._curShallow.g, sb = this._curShallow.b;
    const waveAmp = this._curWaveAmp;
    const waveFreq = this._curWaveFreq;

    const pos = this.oceanMesh.geometry.attributes.position;
    const col = this.oceanMesh.geometry.attributes.color;
    for (let i = 0; i < pos.count; i++) {
      const u = pos.getX(i);
      const v = pos.getY(i);
      const wave1 = Math.sin(u * 0.5 + elapsedSeconds * waveFreq) * Math.cos(v * 0.5 + elapsedSeconds * waveFreq);
      const wave2 = Math.sin(u * 0.18 - elapsedSeconds * waveFreq * 0.6 + v * 0.12) * 0.5;
      const z = (wave1 + wave2) * waveAmp;
      pos.setZ(i, z);

      const tHeight = THREE.MathUtils.clamp((z / (waveAmp * 1.4)) * 0.5 + 0.5, 0, 1);
      col.setXYZ(i, dr + (sr - dr) * tHeight, dg + (sg - dg) * tHeight, db + (sb - db) * tHeight);
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
    this.oceanMesh.material.roughness = isCalm ? 0.55 : 0.7;

    this.boatGroup.position.y = Math.sin(elapsedSeconds * waveFreq) * waveAmp + 0.5;
    this.boatGroup.rotation.x = Math.sin(elapsedSeconds * 1.5) * (isStorm ? 0.25 : 0.04);
    this.boatGroup.rotation.z = Math.cos(elapsedSeconds * 1.2) * (isStorm ? 0.18 : 0.03);

    this.particleSystem.visible = isStorm;
    if (isStorm) {
      const positions = this.particleSystem.geometry.attributes.position.array;
      const fallSpeed = 0.5;
      for (let i = 0; i < this._rainCount; i++) {
        const base = i * 6;
        positions[base + 1] -= fallSpeed;
        positions[base + 4] -= fallSpeed;
        if (positions[base + 1] < 0) this._resetDrop(positions, i, false);
      }
      this.particleSystem.geometry.attributes.position.needsUpdate = true;
    }

    this.scene.fog.color.copy(this._curFog);
    this.ambientLight.color.copy(this._curAmbient);
    this.backLight.intensity = this._curBackLight;

    this.renderer.render(this.scene, this.camera);
  }

  triggerLightning() {
    this.lightningLight.intensity = 8;
    setTimeout(() => {
      this.lightningLight.intensity = 0;
    }, 120);
  }
}

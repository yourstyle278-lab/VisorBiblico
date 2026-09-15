// Scene3D.js — Escena 3D con enfoque HÍBRIDO: 3D en vivo (mar, cámara,
// luces) + siluetas planas tipo "recorte de papel" para la barca y las
// figuras (teatro de sombras), en vez de geometría 3D genérica.
//
// CAMBIO TURNO 10 (ruta: src/scene/Scene3D.js) — pedido explícito del
// usuario después de revisar el Turno 9:
// 1) Las siluetas deben leerse como personajes reales, no conos/cápsulas.
//    Se reconstruyeron como formas 2D planas (THREE.Shape: túnica con
//    contorno que se angosta hacia los hombros + cabeza + brazo opcional)
//    en vez de primitivas 3D genéricas. Jesús tiene dos poses pre-
//    construidas (dormido / de pie con el brazo en el gesto del mandato)
//    que se alternan por visibilidad según la etapa — no se reconstruye
//    geometría en cada cambio, así que es barato en cada frame.
// 2) La barca debe leerse como barca, no como un cono. Nuevo casco: un
//    perfil 2D (proa, fondo y popa curvos) extruido para dar manga
//    (ancho) — ya no hace falta rotar un cono para simular un casco.
// 3) El usuario corrigió expresamente la propuesta del Turno 9 de que el
//    mar combinara con el tono cálido de la página: "quiero que sea
//    color mar, no que combine con la página". Paleta de azules/
//    turquesas independiente del resto de la interfaz, con degradado de
//    color POR VÉRTICE según la altura de la ola (más claro en las
//    crestas, más oscuro en los valles) en vez de un color plano. Se
//    quitó el modo wireframe de la tormenta — una cuadrícula no se ve
//    como mar real. El material sigue siendo MeshStandardMaterial (con
//    luz), no se vuelve a un material plano sin luz.
// 4) La lluvia debe verse como lluvia, "con sus colores": se cambió de
//    puntos redondos cian saturado a segmentos alargados (streaks) de
//    tono gris-azulado pálido y translúcido — se lee como gota cayendo,
//    no como confeti.
//
// Interfaz pública SIN cambios (para no tocar AppController.js ni
// index.html): constructor(containerEl), render(elapsedSeconds, stage),
// triggerLightning().
//
// Nota de honestidad (mismo aviso que el resto del proyecto): esto se
// escribió sin poder abrir un navegador real. Se verificó la sintaxis
// (node --check) y se revisó cada forma a mano, pero no hay
// confirmación visual todavía — trátalo como primera versión para
// probar en tu teléfono, no como un hecho terminado. Las proporciones
// exactas de las siluetas son lo primero que probablemente haya que
// afinar una vez la veas correr.

import * as THREE from 'three';

// Paleta de mar independiente del tono de la página — a pedido expreso
// del usuario, "color mar" real, no un mar que combine con el pergamino.
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

export class Scene3D {
  constructor(containerEl) {
    this.container = containerEl;
    this._buildScene();
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
    // Mismo número de segmentos que antes (48x48) — el cambio está en la
    // función de ola y en el color, no en la resolución de la malla, para
    // no arriesgar el rendimiento ya probado en el teléfono del usuario.
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
  // opcional) en vez de primitivas 3D. Al quedar en el plano XY mirando
  // a +Z, encara de frente a la cámara fija del proyecto sin necesidad
  // de recalcular orientación cada frame (la cámara no orbita).
  _makeRobedFigure({
    height = 1.0,
    hemWidth = 0.5,
    shoulderWidth = 0.24,
    headRadius = 0.13,
    armAngle = null, // radianes; null = sin brazo levantado
    armLength = 0.55,
    leanZ = 0, // inclinación hacia adelante/atrás
  } = {}) {
    const group = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({
      color: SILHOUETTE_COLOR,
      side: THREE.DoubleSide,
    });

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
      arm.rotation.z = armAngle;
      group.add(arm);
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

    // --- Casco: perfil 2D extruido, ya no un cono ---
    // Perfil dibujado en el plano X (eslora) / Y (altura); se extruye en
    // Z para dar la manga del casco — así no hace falta rotar la forma
    // para "acostarla" como pasaba con el cono anterior.
    const hullProfile = new THREE.Shape();
    hullProfile.moveTo(-1.7, 0.55);
    hullProfile.quadraticCurveTo(-2.0, 0.15, -1.55, -0.4);
    hullProfile.quadraticCurveTo(-0.5, -0.62, 0.5, -0.58);
    hullProfile.quadraticCurveTo(1.6, -0.48, 1.85, 0.05);
    hullProfile.quadraticCurveTo(2.0, 0.4, 1.65, 0.55);
    hullProfile.lineTo(-1.7, 0.55);
    const hullGeo = new THREE.ExtrudeGeometry(hullProfile, { depth: 1.5, bevelEnabled: false });
    hullGeo.translate(0, 0, -0.75); // centrar la manga en Z
    const hull = new THREE.Mesh(hullGeo, silhouetteMat);
    this.boatGroup.add(hull);

    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 2.6, 8), silhouetteMat);
    mast.position.set(-0.2, 1.85, 0);
    this.boatGroup.add(mast);

    // --- Jesús: dos poses pre-construidas; se alterna visibilidad en
    // render() según la etapa, nunca se reconstruye geometría ---
    this.jesusSleeping = this._makeRobedFigure({
      height: 0.75,
      hemWidth: 0.62,
      shoulderWidth: 0.3,
      headRadius: 0.13,
    });
    this.jesusSleeping.rotation.z = Math.PI / 2; // recostado a lo largo de la barca
    this.jesusSleeping.position.set(0.9, 0.42, 0);
    this.boatGroup.add(this.jesusSleeping);

    this.jesusStanding = this._makeRobedFigure({
      height: 1.35,
      hemWidth: 0.58,
      shoulderWidth: 0.26,
      headRadius: 0.14,
      armAngle: -Math.PI / 3.2,
    });
    this.jesusStanding.position.set(0.9, 0.5, 0);
    this.jesusStanding.visible = false;
    this.boatGroup.add(this.jesusStanding);

    // --- Discípulos: 3 poses distintas entre sí, no copias idénticas ---
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
      this.boatGroup.add(fig);
    });

    this.boatGroup.position.set(0, 0.5, 0);
    this.scene.add(this.boatGroup);
  }

  _buildRain() {
    // Segmentos alargados (streaks) en vez de puntos redondos: se leen
    // como gotas cayendo, no como confeti. Color gris-azulado
    // translúcido en vez del cian saturado anterior.
    this._rainCount = 300;
    const positions = new Float32Array(this._rainCount * 6); // 2 puntos x 3 coords
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
    const isStorm = stage === 'storm-building' || stage === 'storm-peak';
    const isCalm = stage === 'calm';
    const jesusAwake = stage === 'command' || stage === 'calm';
    this.jesusSleeping.visible = !jesusAwake;
    this.jesusStanding.visible = jesusAwake;

    const waveFreq = isStorm ? 1.8 : 0.4;
    const waveAmp = isStorm ? 0.8 : 0.15;
    const palette = isCalm ? PALETTE.calm : PALETTE.storm;

    // Colores extraídos UNA vez por frame (no por vértice) para no crear
    // basura de memoria en el bucle de abajo — importante para que esto
    // corra bien en un móvil.
    const deep = new THREE.Color(palette.seaDeep);
    const shallow = new THREE.Color(palette.seaShallow);
    const dr = deep.r, dg = deep.g, db = deep.b;
    const sr = shallow.r, sg = shallow.g, sb = shallow.b;

    const pos = this.oceanMesh.geometry.attributes.position;
    const col = this.oceanMesh.geometry.attributes.color;
    for (let i = 0; i < pos.count; i++) {
      const u = pos.getX(i);
      const v = pos.getY(i);
      // Dos direcciones de ola superpuestas (antes solo una) para que el
      // movimiento no se vea como una cuadrícula regular sino orgánico.
      const wave1 = Math.sin(u * 0.5 + elapsedSeconds * waveFreq) * Math.cos(v * 0.5 + elapsedSeconds * waveFreq);
      const wave2 = Math.sin(u * 0.18 - elapsedSeconds * waveFreq * 0.6 + v * 0.12) * 0.5;
      const z = (wave1 + wave2) * waveAmp;
      pos.setZ(i, z);

      const t = THREE.MathUtils.clamp((z / (waveAmp * 1.4)) * 0.5 + 0.5, 0, 1);
      col.setXYZ(i, dr + (sr - dr) * t, dg + (sg - dg) * t, db + (sb - db) * t);
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
    // Un poco más de brillo en calma (mar liso) que en tormenta (mar
    // picado) — sin acercarse al valor que causó el destello del Turno 8.
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

    this.scene.fog.color.setHex(palette.fog);
    this.ambientLight.color.setHex(palette.ambient);
    this.backLight.intensity = isCalm ? 6 : stage === 'command' ? 4 : 1.5;

    this.renderer.render(this.scene, this.camera);
  }

  triggerLightning() {
    this.lightningLight.intensity = 8;
    setTimeout(() => {
      this.lightningLight.intensity = 0;
    }, 120);
  }
}

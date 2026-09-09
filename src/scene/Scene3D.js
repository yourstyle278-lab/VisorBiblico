// Scene3D.js — Escena 3D con enfoque HÍBRIDO: se conserva el océano y la
// cámara en vivo del archivo original, con tratamiento de siluetas para
// la barca y las figuras.
//
// CAMBIO TURNO 7 (ruta: src/scene/Scene3D.js):
// - La luz de fondo durante la tormenta estaba en 0 (el usuario reportó
//   "no veo mayor claridad" — confirmado en el código). Un teatro de
//   sombras necesita algo de luz detrás de las siluetas siempre. Ahora:
//   tormenta = luz tenue y fría (antes 0), mandato = luz media, calma =
//   luz fuerte y cálida (sin cambios). También se subió la luz ambiental
//   general. Esto NO toca el diseño de las siluetas en sí (geometría 3D
//   genérica) — ese rediseño a formas planas ilustradas sigue pendiente
//   de que confirmes que quieres ir por ahí (ver DCM sección 5.2).

import * as THREE from 'three';

const PALETTE = {
  storm: { fog: 0x050811, sea: 0x0ea5e9, ambient: 0x1e293b },
  calm: { fog: 0x1a1408, sea: 0xd97706, ambient: 0x4a3a1e },
};

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
    const geo = new THREE.PlaneGeometry(60, 60, 48, 48);
    const mat = new THREE.MeshStandardMaterial({
      color: PALETTE.storm.sea,
      wireframe: true,
      roughness: 0.1,
      metalness: 0.8,
    });
    this.oceanMesh = new THREE.Mesh(geo, mat);
    this.oceanMesh.rotation.x = -Math.PI / 2;
    this.scene.add(this.oceanMesh);
  }

  _buildSilhouettes() {
    const silhouetteMat = new THREE.MeshBasicMaterial({ color: 0x03040a });

    this.boatGroup = new THREE.Group();

    const hull = new THREE.Mesh(new THREE.ConeGeometry(1.3, 3.2, 6), silhouetteMat);
    hull.rotation.z = Math.PI / 2;
    this.boatGroup.add(hull);

    // Figura de Jesús: más alta, sin rostro, de pie — se distingue de
    // los discípulos por altura y postura, no por rasgos.
    this.jesusFigure = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.18, 1.0, 4, 8),
      silhouetteMat
    );
    this.jesusFigure.position.set(0.9, 0.9, 0);
    this.boatGroup.add(this.jesusFigure);

    this.discipleFigures = [];
    const disciplePositions = [
      [-0.6, 0.55, 0.3],
      [-0.9, 0.55, -0.3],
      [-0.2, 0.55, 0.4],
    ];
    disciplePositions.forEach(([x, y, z]) => {
      const disciple = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.14, 0.6, 4, 8),
        silhouetteMat
      );
      disciple.position.set(x, y, z);
      this.boatGroup.add(disciple);
      this.discipleFigures.push(disciple);
    });

    this.boatGroup.position.set(0, 0.5, 0);
    this.scene.add(this.boatGroup);
  }

  _buildRain() {
    const particleCount = 400;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount * 3; i += 3) {
      positions[i] = (Math.random() - 0.5) * 30;
      positions[i + 1] = Math.random() * 15;
      positions[i + 2] = (Math.random() - 0.5) * 30;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.08,
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.6,
    });
    this.particleSystem = new THREE.Points(geo, mat);
    this.scene.add(this.particleSystem);
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

    const waveFreq = isStorm ? 1.8 : 0.4;
    const waveAmp = isStorm ? 0.8 : 0.15;

    const pos = this.oceanMesh.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const u = pos.getX(i);
      const v = pos.getY(i);
      const z =
        Math.sin(u * 0.5 + elapsedSeconds * waveFreq) *
        Math.cos(v * 0.5 + elapsedSeconds * waveFreq) *
        waveAmp;
      pos.setZ(i, z);
    }
    pos.needsUpdate = true;

    this.boatGroup.position.y = Math.sin(elapsedSeconds * waveFreq) * waveAmp + 0.5;
    this.boatGroup.rotation.x = Math.sin(elapsedSeconds * 1.5) * (isStorm ? 0.25 : 0.04);
    this.boatGroup.rotation.z = Math.cos(elapsedSeconds * 1.2) * (isStorm ? 0.18 : 0.03);

    this.particleSystem.visible = isStorm;
    if (isStorm) {
      const positions = this.particleSystem.geometry.attributes.position.array;
      for (let i = 1; i < positions.length; i += 3) {
        positions[i] -= 0.3;
        if (positions[i] < 0) positions[i] = 15;
      }
      this.particleSystem.geometry.attributes.position.needsUpdate = true;
    }

    const palette = isCalm ? PALETTE.calm : PALETTE.storm;
    this.scene.fog.color.setHex(palette.fog);
    this.oceanMesh.material.color.setHex(palette.sea);
    this.oceanMesh.material.wireframe = !isCalm;
    this.ambientLight.color.setHex(palette.ambient);
    // Turno 7: antes la tormenta se quedaba en 0 (negro casi total).
    // Ahora mantiene algo de luz fría siempre, para que las siluetas se
    // vean como tal en vez de manchas negras en la nada.
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

/**
 * ThreeViewer.js - optional 3D view of a VolumeBuilder volume using Three.js,
 * loaded lazily (only when the user opens the view) from `url`; no build step.
 * Cells are instanced boxes colored from Palette; NULL/unwritten cells are
 * absent. Drag to rotate. Needs WebGL and network access to the Three.js URL.
 */
import Palette from '../Palette.js';

export default class ThreeViewer {
  static THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

  static async open(container, volume, { maxVoxels = 150000, url = ThreeViewer.THREE_URL, spacing = 1.6 } = {}) {
    if (volume.voxels === 0) throw new Error('No written cells to display.');
    if (volume.voxels > maxVoxels) throw new Error(`Volume has ${volume.voxels} cells; the viewer limit is ${maxVoxels}.`);
    const THREE = await import(url);
    container.replaceChildren();
    const w = container.clientWidth || 640, h = container.clientHeight || 420;
    const renderer = new THREE.WebGLRenderer({ antialias: false }), scene = new THREE.Scene(), group = new THREE.Group();
    renderer.setSize(w, h); container.appendChild(renderer.domElement);
    const { rows, cols, layers } = volume.bounds, span = Math.max(rows, cols, layers * spacing);
    const camera = new THREE.PerspectiveCamera(50, w / h, 0.1, span * 10);
    camera.position.set(0, 0, span * 1.6);
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial(), volume.voxels), m = new THREE.Matrix4();
    let i = 0;
    for (const layer of volume.layers) for (const c of layer.cells) {
      m.setPosition(c.col - cols / 2, -(c.row - rows / 2), (layer.z - layers / 2) * spacing);
      mesh.setMatrixAt(i, m); mesh.setColorAt(i, new THREE.Color(Palette.hexOf(c.code))); i++;
    }
    group.add(mesh); scene.add(group);
    const draw = () => renderer.render(scene, camera);
    let drag = null;
    const el = renderer.domElement;
    el.addEventListener('pointerdown', (e) => { drag = [e.clientX, e.clientY]; el.setPointerCapture(e.pointerId); });
    el.addEventListener('pointerup', () => { drag = null; });
    el.addEventListener('pointermove', (e) => { if (!drag) return; group.rotation.y += (e.clientX - drag[0]) * 0.01; group.rotation.x += (e.clientY - drag[1]) * 0.01; drag = [e.clientX, e.clientY]; draw(); });
    draw();
    return { dispose: () => { renderer.dispose(); container.replaceChildren(); } };
  }
}

// Maillage du terrain : sable sur le plat, roche sur les pentes (mélange selon l'inclinaison).
import * as THREE from 'three';
import type { TerrainMap } from '../mapgen/terrain';
import { fbm } from '../core/rng';
import { BASE } from './assets';

function tex(name: string, srgb: boolean): THREE.Texture {
  const t = new THREE.TextureLoader().load(BASE + 'assets/tex/' + name);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildTerrainMesh(map: TerrainMap): THREE.Object3D {
  const { n, ext, heights, levels } = map;
  const pos = new Float32Array(n * n * 3), uv = new Float32Array(n * n * 2), col = new Float32Array(n * n * 3);
  const UV = 0.085;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const k = j * n + i, x = i - ext, z = j - ext;
    pos[k * 3] = x; pos[k * 3 + 1] = heights[k]; pos[k * 3 + 2] = z;
    uv[k * 2] = x * UV; uv[k * 2 + 1] = z * UV;
    // Variation de teinte à grande échelle + plateaux hauts légèrement plus clairs.
    const macro = 0.82 + 0.36 * fbm(x * 0.012 + 9, z * 0.012 + 9, map.seed + 71, 3);
    const lv = levels[k];
    const lift = lv === 1 ? 1.05 : lv === 2 ? 1.1 : lv === 3 ? 0.8 : 1;
    // Ombrage du relief : pied de falaise assombri, rebord éclairci, pour bien lire les plateaux vus de dessus.
    let up = 0, down = 0;
    if (i > 2 && j > 2 && i < n - 3 && j < n - 3) for (let dj = -3; dj <= 3; dj += 3) for (let di = -3; di <= 3; di += 3) {
      const d = heights[(j + dj) * n + i + di] - heights[k];
      if (d > up) up = d; if (-d > down) down = -d;
    }
    const ao = (1 - Math.min(0.38, Math.max(0, up - 1) * 0.085)) * (1 + Math.min(0.1, Math.max(0, down - 1) * 0.025));
    col[k * 3] = macro * lift * ao; col[k * 3 + 1] = macro * lift * ao * (lv === 2 ? 0.97 : 1); col[k * 3 + 2] = macro * lift * ao * (lv === 2 ? 0.93 : 1);
  }
  const idx = new Uint32Array((n - 1) * (n - 1) * 6);
  let q = 0;
  for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) {
    const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
    idx[q++] = a; idx[q++] = c; idx[q++] = b; idx[q++] = b; idx[q++] = c; idx[q++] = d;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeVertexNormals();

  const rock = tex('rock_diff.jpg', true);
  const mat = new THREE.MeshStandardMaterial({
    map: tex('sand_diff.jpg', true), normalMap: tex('sand_nor.jpg', false),
    normalScale: new THREE.Vector2(0.9, 0.9), roughness: 0.95, metalness: 0, vertexColors: true,
  });
  /** 1 = prairies des âges anciens, 0 = désert de l'âge galactique (fixé par World.setAge). */
  const uGreen = { value: 0 };
  mat.userData.uniforms = { uGreen };
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uGreen = uGreen;
    shader.uniforms.tRock = { value: rock };
    shader.uniforms.uSandTint = { value: new THREE.Color(1.5, 0.92, 0.62) };
    shader.uniforms.uRockTint = { value: new THREE.Color(0.42, 0.21, 0.15) };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNrm;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = position;\nvWNrm = normal;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D tRock;\nuniform float uGreen;\nuniform vec3 uSandTint;\nuniform vec3 uRockTint;\nvarying vec3 vWPos;\nvarying vec3 vWNrm;')
      .replace('#include <map_fragment>', `
        if (vWPos.y < -8.0) discard;                       // le vide intersidéral : on voit les étoiles au travers
        vec3 wn = normalize(vWNrm);
        float rockF = smoothstep(0.12, 0.3, 1.0 - clamp(wn.y, 0.0, 1.0));
        vec2 uvS = vWPos.xz * 0.085;
        vec3 sandC = mix(texture2D(map, uvS).rgb, texture2D(map, uvS * 0.27 + vec2(0.37, 0.11)).rgb, 0.45) * uSandTint;
        vec2 bw = abs(wn.xz); bw /= (bw.x + bw.y + 1e-4);
        vec3 rockC = (texture2D(tRock, vWPos.zy * vec2(0.09, 0.16)).rgb * bw.x + texture2D(tRock, vWPos.xy * vec2(0.09, 0.16)).rgb * bw.y) * uRockTint;
        // strates horizontales dans la falaise
        rockC *= 0.94 + 0.06 * sin(vWPos.y * 7.0 + sin(vWPos.x * 0.21 + vWPos.z * 0.17) * 2.0);
        // Âges anciens : herbe (teinte tirée de la même texture), roche grise, plages près de la mer.
        float lum = dot(sandC, vec3(0.3, 0.45, 0.25));
        float grassVar = 0.5 + 0.5 * sin(vWPos.x * 0.07 + sin(vWPos.z * 0.05) * 2.0) * sin(vWPos.z * 0.06 + 1.3);
        vec3 grassC = mix(vec3(0.11, 0.22, 0.05), vec3(0.21, 0.30, 0.07), grassVar) * (0.6 + lum * 0.5);
        float beach = 1.0 - smoothstep(-1.7, -0.55, vWPos.y);
        grassC = mix(grassC, vec3(0.62, 0.53, 0.36) * (0.7 + lum * 0.4), beach);
        sandC = mix(sandC, grassC, uGreen);
        rockC = mix(rockC, (rockC / uRockTint) * vec3(0.42, 0.39, 0.35), uGreen);
        diffuseColor.rgb *= mix(sandC, rockC, rockF) * mix(0.18, 1.0, smoothstep(-8.0, -0.6, vWPos.y));
      `);
  };
  // Découpage en morceaux de 48 m : seuls ceux qui sont à l'écran (et dans la zone d'ombre) sont dessinés.
  const group = new THREE.Group(); group.name = 'terrain'; group.userData.mat = mat;
  const P = geo.getAttribute('position').array as Float32Array, N = geo.getAttribute('normal').array as Float32Array;
  const C = 48;
  for (let j0 = 0; j0 < n - 1; j0 += C) for (let i0 = 0; i0 < n - 1; i0 += C) {
    const i1 = Math.min(i0 + C, n - 1), j1 = Math.min(j0 + C, n - 1), w = i1 - i0 + 1, h = j1 - j0 + 1;
    // Morceau entièrement dans le vide (sous le niveau du sol) : inutile.
    let any = false;
    for (let j = j0; j <= j1 && !any; j++) for (let i = i0; i <= i1; i++) if (heights[j * n + i] > -8) { any = true; break; }
    if (!any) continue;
    const cp = new Float32Array(w * h * 3), cn = new Float32Array(w * h * 3), cu = new Float32Array(w * h * 2), cc = new Float32Array(w * h * 3);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const src = (j0 + j) * n + i0 + i, dst = j * w + i;
      cp.set(P.subarray(src * 3, src * 3 + 3), dst * 3); cn.set(N.subarray(src * 3, src * 3 + 3), dst * 3);
      cu.set(uv.subarray(src * 2, src * 2 + 2), dst * 2); cc.set(col.subarray(src * 3, src * 3 + 3), dst * 3);
    }
    const ci = new Uint32Array((w - 1) * (h - 1) * 6); let k = 0;
    for (let j = 0; j < h - 1; j++) for (let i = 0; i < w - 1; i++) { const a = j * w + i, b = a + 1, c = a + w, d = c + 1; ci[k++] = a; ci[k++] = c; ci[k++] = b; ci[k++] = b; ci[k++] = c; ci[k++] = d; }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(cp, 3)); g.setAttribute('normal', new THREE.BufferAttribute(cn, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(cu, 2)); g.setAttribute('color', new THREE.BufferAttribute(cc, 3));
    g.setIndex(new THREE.BufferAttribute(ci, 1)); g.computeBoundingSphere(); g.computeBoundingBox();
    const m = new THREE.Mesh(g, mat); m.receiveShadow = true; m.castShadow = true;
    group.add(m);
  }
  geo.dispose();
  return group;
}

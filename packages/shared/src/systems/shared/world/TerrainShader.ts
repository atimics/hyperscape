/**
 * TerrainShader - TSL Node Material for terrain rendering
 * Uses pre-generated Perlin noise texture for dirt/grass mixing
 */

import THREE, {
  MeshStandardNodeMaterial,
  texture,
  positionWorld,
  normalWorld,
  cameraPosition,
  uniform,
  float,
  vec2,
  vec3,
  abs,
  pow,
  add,
  sub,
  mul,
  div,
  mix,
  smoothstep,
  dot,
  normalize,
  length,
  Fn,
} from "../../../extras/three/three";

export const TERRAIN_CONSTANTS = {
  TRIPLANAR_SCALE: 0.5, // Texture tiling
  SNOW_HEIGHT: 50.0,
  FOG_NEAR: 500.0,
  FOG_FAR: 2000.0,
  NOISE_SCALE: 0.0008, // Larger dirt patches (smaller = bigger patches)
  DIRT_THRESHOLD: 0.5, // Lower = more dirt, higher = more grass
};

// ============================================================================
// PERLIN NOISE TEXTURE GENERATION
// ============================================================================

// Cached noise texture - generated once, reused everywhere
let cachedNoiseTexture: THREE.DataTexture | null = null;
const NOISE_SIZE = 256; // Texture resolution

// Simple Perlin-like noise implementation
function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function lerp(a: number, b: number, t: number): number {
  return a + t * (b - a);
}

function grad(hash: number, x: number, y: number): number {
  const h = hash & 3;
  const u = h < 2 ? x : y;
  const v = h < 2 ? y : x;
  return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
}

// Seeded permutation table for deterministic noise
function createPermutation(seed: number): number[] {
  const p: number[] = [];
  for (let i = 0; i < 256; i++) p[i] = i;

  // Fisher-Yates shuffle with seed
  let s = seed;
  for (let i = 255; i > 0; i--) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const j = s % (i + 1);
    [p[i], p[j]] = [p[j], p[i]];
  }

  // Double the permutation table
  return [...p, ...p];
}

function perlin2D(x: number, y: number, perm: number[]): number {
  const X = Math.floor(x) & 255;
  const Y = Math.floor(y) & 255;

  const xf = x - Math.floor(x);
  const yf = y - Math.floor(y);

  const u = fade(xf);
  const v = fade(yf);

  const aa = perm[perm[X] + Y];
  const ab = perm[perm[X] + Y + 1];
  const ba = perm[perm[X + 1] + Y];
  const bb = perm[perm[X + 1] + Y + 1];

  const x1 = lerp(grad(aa, xf, yf), grad(ba, xf - 1, yf), u);
  const x2 = lerp(grad(ab, xf, yf - 1), grad(bb, xf - 1, yf - 1), u);

  return lerp(x1, x2, v);
}

// Multi-octave fractal noise
function fbm(
  x: number,
  y: number,
  perm: number[],
  octaves: number = 4,
): number {
  let value = 0;
  let amplitude = 0.5;
  let frequency = 1;
  let maxValue = 0;

  for (let i = 0; i < octaves; i++) {
    value += amplitude * perlin2D(x * frequency, y * frequency, perm);
    maxValue += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }

  return value / maxValue;
}

/**
 * Seamless 2D Perlin noise using proper torus mapping
 * Maps the 2D plane onto a 4D torus to eliminate seams
 */
function seamlessPerlin2D(x: number, y: number, perm: number[]): number {
  // Map 2D coordinates to 4D torus
  // This creates truly seamless tiling
  const TWO_PI = Math.PI * 2;
  const radius = 1.0;

  // Convert to angles (0-1 maps to 0-2PI)
  const angleX = x * TWO_PI;
  const angleY = y * TWO_PI;

  // Map to 4D coordinates on a torus
  const nx = Math.cos(angleX) * radius;
  const ny = Math.sin(angleX) * radius;
  const nz = Math.cos(angleY) * radius;
  const nw = Math.sin(angleY) * radius;

  // Sample 2D noise at 4 different 2D positions and blend
  // This simulates 4D noise sampling using 2D noise
  const n1 = perlin2D(nx * 4 + 100, nz * 4 + 100, perm);
  const n2 = perlin2D(ny * 4 + 200, nw * 4 + 200, perm);
  const n3 = perlin2D(nx * 4 + ny * 4 + 300, nz * 4 + nw * 4 + 300, perm);

  return (n1 + n2 + n3) / 3;
}

/**
 * Multi-octave seamless fractal noise
 */
function seamlessFbm(
  x: number,
  y: number,
  perm: number[],
  octaves: number = 4,
): number {
  let value = 0;
  let amplitude = 0.5;
  let maxValue = 0;

  for (let i = 0; i < octaves; i++) {
    // Each octave uses a different offset to add variation
    const ox = x + i * 17.3;
    const oy = y + i * 31.7;
    value += amplitude * seamlessPerlin2D(ox, oy, perm);
    maxValue += amplitude;
    amplitude *= 0.5;
  }

  return value / maxValue;
}

/**
 * Generate a Perlin noise texture - call once at startup
 * Returns a DataTexture that tiles seamlessly
 */
export function generateNoiseTexture(seed: number = 12345): THREE.DataTexture {
  if (cachedNoiseTexture) return cachedNoiseTexture;

  const perm = createPermutation(seed);
  const data = new Uint8Array(NOISE_SIZE * NOISE_SIZE * 4);

  for (let y = 0; y < NOISE_SIZE; y++) {
    for (let x = 0; x < NOISE_SIZE; x++) {
      // Normalize to 0-1 range
      const nx = x / NOISE_SIZE;
      const ny = y / NOISE_SIZE;

      // Use seamless noise that tiles perfectly
      const noise = seamlessFbm(nx, ny, perm, 4);

      // Normalize from [-1, 1] to [0, 1]
      const value = (noise + 1) * 0.5;
      const byte = Math.floor(Math.max(0, Math.min(255, value * 255)));

      const idx = (y * NOISE_SIZE + x) * 4;
      data[idx] = byte; // R
      data[idx + 1] = byte; // G
      data[idx + 2] = byte; // B
      data[idx + 3] = 255; // A
    }
  }

  const tex = new THREE.DataTexture(
    data,
    NOISE_SIZE,
    NOISE_SIZE,
    THREE.RGBAFormat,
  );
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;

  cachedNoiseTexture = tex;
  console.log("[TerrainShader] Generated seamless Perlin noise texture");
  return tex;
}

/**
 * Get the cached noise texture (for GrassSystem alignment)
 */
export function getNoiseTexture(): THREE.DataTexture | null {
  return cachedNoiseTexture;
}

// Cached permutation for CPU sampling
let cachedPerm: number[] | null = null;

/**
 * Sample noise at world position (for CPU-side grass placement)
 * Returns 0-1 value matching EXACTLY what the shader samples from the texture
 */
export function sampleNoiseAtPosition(
  worldX: number,
  worldZ: number,
  seed: number = 12345,
): number {
  // Ensure permutation is created
  if (!cachedPerm) {
    cachedPerm = createPermutation(seed);
  }

  // Calculate UV the same way the shader does
  const u = worldX * TERRAIN_CONSTANTS.NOISE_SCALE;
  const v = worldZ * TERRAIN_CONSTANTS.NOISE_SCALE;

  // The texture tiles, so wrap to 0-1
  const wrappedU = u - Math.floor(u);
  const wrappedV = v - Math.floor(v);

  // Sample the same seamless noise function used to generate the texture
  const noise = seamlessFbm(wrappedU, wrappedV, cachedPerm, 4);
  return (noise + 1) * 0.5;
}

// ============================================================================
// TERRAIN MATERIAL
// ============================================================================

const triplanarSample = Fn(
  ([tex, worldPos, normal, scale]: [
    THREE.Texture,
    ReturnType<typeof positionWorld>,
    ReturnType<typeof normalWorld>,
    ReturnType<typeof float>,
  ]) => {
    const scaledPos = mul(worldPos, scale);
    const blendWeights = pow(abs(normal), vec3(4.0));
    const weightSum = add(add(blendWeights.x, blendWeights.y), blendWeights.z);
    const weights = div(blendWeights, weightSum);

    const xSample = texture(tex, vec2(scaledPos.y, scaledPos.z)).rgb;
    const ySample = texture(tex, vec2(scaledPos.x, scaledPos.z)).rgb;
    const zSample = texture(tex, vec2(scaledPos.x, scaledPos.y)).rgb;

    return add(
      add(mul(xSample, weights.x), mul(ySample, weights.y)),
      mul(zSample, weights.z),
    );
  },
);

function createPlaceholderTexture(color: number): THREE.Texture {
  if (typeof document === "undefined") {
    const data = new Uint8Array([
      (color >> 16) & 0xff,
      (color >> 8) & 0xff,
      color & 0xff,
      255,
    ]);
    const tex = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.needsUpdate = true;
    return tex;
  }
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 2;
  const ctx = canvas.getContext("2d")!;
  const c = new THREE.Color(color);
  ctx.fillStyle = `rgb(${c.r * 255}, ${c.g * 255}, ${c.b * 255})`;
  ctx.fillRect(0, 0, 2, 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

export type TerrainUniforms = {
  sunPosition: { value: THREE.Vector3 };
};

export function createTerrainMaterial(
  textures: Map<string, THREE.Texture>,
): THREE.Material & { terrainUniforms: TerrainUniforms } {
  // Ensure noise texture is generated
  const noiseTex = generateNoiseTexture();

  const placeholders = {
    grass: createPlaceholderTexture(0x5a9216),
    dirt: createPlaceholderTexture(0x6b4423),
    rock: createPlaceholderTexture(0x7a7265),
    sand: createPlaceholderTexture(0xc2b280),
    snow: createPlaceholderTexture(0xf0f8ff),
  };

  const grassTex = textures.get("grass") || placeholders.grass;
  const dirtTex = textures.get("dirt") || placeholders.dirt;
  const rockTex = textures.get("rock") || placeholders.rock;
  const sandTex = textures.get("sand") || placeholders.sand;
  const snowTex = textures.get("snow") || placeholders.snow;

  const sunPositionUniform = uniform(vec3(100, 100, 100));
  const triplanarScale = uniform(float(TERRAIN_CONSTANTS.TRIPLANAR_SCALE));
  const noiseScale = uniform(float(TERRAIN_CONSTANTS.NOISE_SCALE));

  const worldPos = positionWorld;
  const worldNormal = normalWorld;

  const grassTexColor = triplanarSample(
    grassTex,
    worldPos,
    worldNormal,
    triplanarScale,
  );
  const dirtTexColor = triplanarSample(
    dirtTex,
    worldPos,
    worldNormal,
    triplanarScale,
  );
  const rockColor = triplanarSample(
    rockTex,
    worldPos,
    worldNormal,
    triplanarScale,
  );
  const sandColor = triplanarSample(
    sandTex,
    worldPos,
    worldNormal,
    triplanarScale,
  );
  const snowColor = triplanarSample(
    snowTex,
    worldPos,
    worldNormal,
    triplanarScale,
  );

  // Slightly darken grass to preserve the rich green of stylized_grass_d.png
  const grassColor = mul(grassTexColor, float(0.8));

  // Strong brown tint for dirt patches - make it clearly brown, not gray
  const warmBrown = vec3(0.65, 0.45, 0.28);
  const dirtColor = mul(dirtTexColor, warmBrown);

  const height = worldPos.y;
  const slope = sub(float(1.0), abs(worldNormal.y));

  // Sample Perlin noise texture for dirt patches
  const noiseUV = mul(vec2(worldPos.x, worldPos.z), noiseScale);
  const noiseValue = texture(noiseTex, noiseUV).r;

  // Sharp threshold for distinct patches - grass is majority
  const dirtPatchFactor = smoothstep(
    float(TERRAIN_CONSTANTS.DIRT_THRESHOLD),
    float(TERRAIN_CONSTANTS.DIRT_THRESHOLD + 0.03),
    noiseValue,
  );

  // Only apply dirt patches on flat ground
  const flatnessFactor = smoothstep(float(0.3), float(0.15), slope);
  const finalDirtFactor = mul(dirtPatchFactor, flatnessFactor);

  // Blend grass and dirt based on noise - grass is the base
  let blendedColor = mix(grassColor, dirtColor, finalDirtFactor);

  // Slope-based dirt on steeper areas
  blendedColor = mix(
    blendedColor,
    dirtColor,
    mul(smoothstep(float(0.3), float(0.5), slope), float(0.5)),
  );

  // Rock on steep slopes
  blendedColor = mix(
    blendedColor,
    rockColor,
    smoothstep(float(0.6), float(0.75), slope),
  );

  // Snow at high elevation
  blendedColor = mix(
    blendedColor,
    snowColor,
    smoothstep(float(TERRAIN_CONSTANTS.SNOW_HEIGHT), float(60.0), height),
  );

  // Sand near water level on flat areas
  const sandBlend = mul(
    smoothstep(float(5.0), float(0.0), height),
    smoothstep(float(0.3), float(0.0), slope),
  );
  blendedColor = mix(blendedColor, sandColor, sandBlend);

  // Lighting
  const N = normalize(worldNormal);
  const sunDir = normalize(sunPositionUniform);
  const NdotL = dot(N, sunDir);
  const halfLambert = add(mul(NdotL, float(0.5)), float(0.5));
  const diffuse = mul(halfLambert, halfLambert);

  // Moderate lighting to preserve texture richness
  const skyColor = vec3(0.7, 0.78, 0.68);
  const skyLight = add(mul(N.y, float(0.5)), float(0.5));
  const ambient = mul(mul(skyColor, skyLight), float(0.3));
  const sunColor = vec3(1.0, 0.95, 0.85);
  const diffuseLight = mul(mul(sunColor, diffuse), float(0.7));
  const litColor = mul(blendedColor, add(ambient, diffuseLight));

  // Fog
  const dist = length(sub(worldPos, cameraPosition));
  const fogFactor = smoothstep(
    float(TERRAIN_CONSTANTS.FOG_NEAR),
    float(TERRAIN_CONSTANTS.FOG_FAR),
    dist,
  );
  const fogColor = vec3(0.83, 0.78, 0.72);
  const finalColor = mix(litColor, fogColor, fogFactor);

  const material = new MeshStandardNodeMaterial();
  material.colorNode = finalColor;
  material.roughness = 0.9;
  material.metalness = 0.0;
  material.side = THREE.FrontSide;
  material.transparent = false;
  material.depthWrite = true;
  material.depthTest = true;

  const terrainUniforms: TerrainUniforms = { sunPosition: sunPositionUniform };
  const result = material as typeof material & {
    terrainUniforms: TerrainUniforms;
  };
  result.terrainUniforms = terrainUniforms;
  return result;
}

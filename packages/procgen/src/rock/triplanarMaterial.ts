/**
 * Triplanar Procedural Rock Material
 *
 * Real-time triplanar projection shader for procedural rock textures.
 * Samples noise patterns in world space and blends based on surface normals.
 */

import * as THREE from "three";
import type { RockParams, TexturePatternType } from "./types";
import { TexturePattern } from "./types";

// ============================================================================
// SHADER CODE
// ============================================================================

const vertexShader = /* glsl */ `
varying vec3 vWorldPosition;
varying vec3 vWorldNormal;
varying vec3 vVertexColor;

#ifdef USE_VERTEX_COLORS
  attribute vec3 color;
#endif

void main() {
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPos.xyz;
  vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
  
  #ifdef USE_VERTEX_COLORS
    vVertexColor = color;
  #else
    vVertexColor = vec3(1.0);
  #endif
  
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

const fragmentShader = /* glsl */ `
uniform vec3 baseColor;
uniform vec3 secondaryColor;
uniform vec3 accentColor;
uniform float textureScale;
uniform float textureDetail;
uniform float textureContrast;
uniform float textureBlend;
uniform float roughness;
uniform float metalness;
uniform int patternType;

varying vec3 vWorldPosition;
varying vec3 vWorldNormal;
varying vec3 vVertexColor;

// Simplex noise functions
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
  const vec2 C = vec2(1.0/6.0, 1.0/3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  
  i = mod289(i);
  vec4 p = permute(permute(permute(
    i.z + vec4(0.0, i1.z, i2.z, 1.0))
    + i.y + vec4(0.0, i1.y, i2.y, 1.0))
    + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;
  
  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}

// FBM (Fractal Brownian Motion)
float fbm(vec3 p, int octaves) {
  float value = 0.0;
  float amplitude = 1.0;
  float frequency = 1.0;
  float maxValue = 0.0;
  
  for (int i = 0; i < 8; i++) {
    if (i >= octaves) break;
    value += snoise(p * frequency) * amplitude;
    maxValue += amplitude;
    amplitude *= 0.5;
    frequency *= 2.0;
  }
  
  return value / maxValue;
}

// Pattern sampling functions
float sampleNoise(vec2 uv) {
  return fbm(vec3(uv, 0.0), int(textureDetail)) * 0.5 + 0.5;
}

float sampleLayered(vec2 uv) {
  float layerNoise = fbm(vec3(uv.x * 0.5, uv.y * 3.0, 0.0), int(textureDetail));
  float layerY = uv.y * 4.0 + layerNoise * 0.5;
  float value = sin(layerY * 3.14159 * 2.0) * 0.5 + 0.5;
  return pow(value, 0.7);
}

float sampleSpeckled(vec2 uv) {
  float speckle = 0.0;
  float amp = 1.0;
  float freq = 1.0;
  for (int i = 0; i < 4; i++) {
    float n = snoise(vec3(uv * freq, 0.0));
    speckle += abs(n) * amp;
    amp *= 0.5;
    freq *= 2.2;
  }
  float spots = snoise(vec3(uv * 0.8, 0.0));
  float value = speckle * 0.6 + (spots > 0.3 ? 0.3 : 0.0);
  float darkSpots = snoise(vec3(uv * 15.0, 0.0));
  if (darkSpots > 0.6) value -= 0.3;
  return clamp(value, 0.0, 1.0);
}

float sampleVeined(vec2 uv) {
  float warp = fbm(vec3(uv, 0.0), int(textureDetail));
  vec2 veinUV = uv + warp * 0.5;
  float vein = abs(sin((veinUV.x + veinUV.y) * 3.14159 * 2.0));
  vein = pow(vein, 0.3);
  float vein2 = abs(sin((veinUV.x * 1.5 - veinUV.y * 0.8) * 3.14159 * 3.0));
  vein2 = pow(vein2, 0.5);
  return 1.0 - min(vein, vein2) * 0.7;
}

float sampleCellular(vec2 uv) {
  float cellSize = 0.15;
  vec2 cell = floor(uv / cellSize);
  float minDist = 10.0;
  float secondDist = 10.0;
  
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 neighbor = cell + vec2(float(x), float(y));
      float seed = neighbor.x * 127.0 + neighbor.y * 311.0;
      vec2 point = (neighbor + 0.5 + vec2(sin(seed), cos(seed * 1.3)) * 0.5) * cellSize;
      float dist = distance(uv, point);
      if (dist < minDist) {
        secondDist = minDist;
        minDist = dist;
      } else if (dist < secondDist) {
        secondDist = dist;
      }
    }
  }
  
  float edge = secondDist - minDist;
  return pow(min(1.0, edge * 15.0), 0.5);
}

float sampleFlow(vec2 uv) {
  float flowWarp = fbm(vec3(uv * 0.5, 0.0), int(textureDetail));
  vec2 flowUV = uv + flowWarp * 1.5;
  float flow = fbm(vec3(flowUV.x, flowUV.y * 0.3, 0.0), int(textureDetail)) * 0.5 + 0.5;
  float streak = sin((flowUV.x * 2.0 + flow * 3.0) * 3.14159);
  return flow * 0.7 + streak * 0.15 + 0.15;
}

float samplePattern(vec2 uv) {
  float value = 0.0;
  
  // Pattern type: 0=noise, 1=layered, 2=speckled, 3=veined, 4=cellular, 5=flow
  if (patternType == 0) {
    value = sampleNoise(uv);
  } else if (patternType == 1) {
    value = sampleLayered(uv);
  } else if (patternType == 2) {
    value = sampleSpeckled(uv);
  } else if (patternType == 3) {
    value = sampleVeined(uv);
  } else if (patternType == 4) {
    value = sampleCellular(uv);
  } else if (patternType == 5) {
    value = sampleFlow(uv);
  }
  
  // Apply contrast
  return pow(clamp(value, 0.0, 1.0), 1.0 / textureContrast);
}

void main() {
  // Triplanar blend weights from world normal
  vec3 blend = abs(vWorldNormal);
  blend = pow(blend, vec3(4.0)); // Sharpen blend
  blend /= (blend.x + blend.y + blend.z + 0.0001);
  
  // Sample pattern on each plane (triplanar)
  vec3 scaledPos = vWorldPosition * textureScale;
  float valYZ = samplePattern(scaledPos.yz); // X-facing
  float valXZ = samplePattern(scaledPos.xz); // Y-facing
  float valXY = samplePattern(scaledPos.xy); // Z-facing
  
  // Blend based on normal
  float patternValue = valYZ * blend.x + valXZ * blend.y + valXY * blend.z;
  
  // Map pattern value to colors
  vec3 texColor;
  if (patternValue < 0.5) {
    texColor = mix(accentColor, baseColor, patternValue * 2.0);
  } else {
    texColor = mix(baseColor, secondaryColor, (patternValue - 0.5) * 2.0);
  }
  
  // Blend with vertex colors
  vec3 finalColor = mix(vVertexColor, texColor, textureBlend);
  
  // Simple lighting (basic Lambert + ambient)
  vec3 lightDir = normalize(vec3(0.5, 1.0, 0.3));
  float NdotL = max(dot(vWorldNormal, lightDir), 0.0);
  float ambient = 0.3;
  float diffuse = NdotL * 0.7;
  
  finalColor *= (ambient + diffuse);
  
  gl_FragColor = vec4(finalColor, 1.0);
}
`;

// ============================================================================
// MATERIAL CREATION
// ============================================================================

/**
 * Get pattern type index from pattern name
 */
function getPatternIndex(pattern: TexturePatternType): number {
  switch (pattern) {
    case TexturePattern.Noise:
      return 0;
    case TexturePattern.Layered:
      return 1;
    case TexturePattern.Speckled:
      return 2;
    case TexturePattern.Veined:
      return 3;
    case TexturePattern.Cellular:
      return 4;
    case TexturePattern.Flow:
      return 5;
    default:
      return 0;
  }
}

/**
 * Parse hex color to THREE.Color
 */
function hexToColor(hex: string): THREE.Color {
  return new THREE.Color(hex);
}

/**
 * Create a triplanar procedural rock material
 */
export function createTriplanarRockMaterial(
  params: RockParams,
): THREE.ShaderMaterial {
  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      baseColor: { value: hexToColor(params.colors.baseColor) },
      secondaryColor: { value: hexToColor(params.colors.secondaryColor) },
      accentColor: { value: hexToColor(params.colors.accentColor) },
      textureScale: { value: params.texture.scale },
      textureDetail: { value: params.texture.detail },
      textureContrast: { value: params.texture.contrast },
      textureBlend: { value: params.textureBlend },
      roughness: { value: params.material.roughness },
      metalness: { value: params.material.metalness },
      patternType: { value: getPatternIndex(params.texture.pattern) },
    },
    defines: {
      USE_VERTEX_COLORS: "",
    },
  });

  return material;
}

/**
 * Update triplanar material uniforms
 */
export function updateTriplanarMaterial(
  material: THREE.ShaderMaterial,
  params: RockParams,
): void {
  material.uniforms.baseColor.value = hexToColor(params.colors.baseColor);
  material.uniforms.secondaryColor.value = hexToColor(
    params.colors.secondaryColor,
  );
  material.uniforms.accentColor.value = hexToColor(params.colors.accentColor);
  material.uniforms.textureScale.value = params.texture.scale;
  material.uniforms.textureDetail.value = params.texture.detail;
  material.uniforms.textureContrast.value = params.texture.contrast;
  material.uniforms.textureBlend.value = params.textureBlend;
  material.uniforms.roughness.value = params.material.roughness;
  material.uniforms.metalness.value = params.material.metalness;
  material.uniforms.patternType.value = getPatternIndex(params.texture.pattern);
}

export const HEAT_COLORS = ['#163777', '#087f83', '#f8db50'] as const;
export const heatGradient = `linear-gradient(90deg in srgb, ${HEAT_COLORS.join(', ')})`;

const [low, middle, high] = HEAT_COLORS.map((hex) => {
  const n = parseInt(hex.slice(1), 16);
  return `vec3(${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => (c / 255).toFixed(8)).join(', ')})`;
});

export const heatVertexShader = `
  uniform sampler2D uSensors;
  uniform int uCount;
  uniform int uTextureWidth;
  uniform float uMin;
  uniform float uMax;
  uniform float uPointSize;
  out float vScalar;

  float estimate(vec3 at) {
    float closest = 0.0;
    float weights = 0.0;
    float weighted = 0.0;
    float exact = 0.0;
    float exactCount = 0.0;
    for (int i = 0; i < uCount; ++i) {
      vec4 sensor = texelFetch(uSensors, ivec2(i % uTextureWidth, i / uTextureWidth), 0);
      float scalar = uMin == uMax ? 0.5 : (sensor.w - uMin) / (uMax - uMin);
      vec3 delta = sensor.xyz - at;
      float squared = dot(delta, delta);
      if (squared == 0.0) {
        exact += scalar;
        exactCount += 1.0;
      } else {
        // Rescale all weights by the nearest squared distance to keep 1/d^2 bounded.
        if (closest == 0.0 || squared < closest) {
          float adjust = closest == 0.0 ? 0.0 : squared / closest;
          weights *= adjust;
          weighted *= adjust;
          closest = squared;
        }
        float weight = closest / squared;
        weights += weight;
        weighted += weight * scalar;
      }
    }
    return exactCount > 0.0 ? exact / exactCount : weighted / max(weights, 1.0);
  }

  void main() {
    vScalar = estimate((modelMatrix * vec4(position, 1.0)).xyz);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = uPointSize;
  }
`;

export function heatFragmentShader(points: boolean): string {
  return `
    in float vScalar;
    out vec4 heatColor;
    void main() {
      float value = clamp(vScalar, 0.0, 1.0);
      vec3 color = value <= 0.5 ? mix(${low}, ${middle}, value * 2.0) : mix(${middle}, ${high}, (value - 0.5) * 2.0);
      ${points ? 'float alpha = 0.40 * (1.0 - smoothstep(0.14, 0.50, length(gl_PointCoord - 0.5)));' : 'float alpha = 1.0;'}
      heatColor = vec4(color, alpha);
    }
  `;
}

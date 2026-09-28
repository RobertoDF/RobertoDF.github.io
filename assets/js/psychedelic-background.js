(function () {
  "use strict";

  var canvas = document.getElementById("psychedelic-background");
  if (!canvas) return;

  var gl = canvas.getContext("webgl", { antialias: false, alpha: false, premultipliedAlpha: false });
  if (!gl) {
    document.documentElement.classList.add("psychedelic-fallback");
    canvas.remove();
    return;
  }

  var vertexSource = [
    "attribute vec2 aPosition;",
    "void main() { gl_Position = vec4(aPosition, 0.0, 1.0); }"
  ].join("\n");

  var fragmentSource = [
    "precision highp float;",
    "uniform vec2 uResolution;",
    "uniform float uTime;",
    "uniform vec2 uPointer;",
    "",
    "mat2 rot(float a) { float s = sin(a), c = cos(a); return mat2(c, -s, s, c); }",
    "float hash(float n) { return fract(sin(n * 127.1) * 43758.5453); }",
    "",
    "// Twist space around a few wandering centres.",
    "vec2 warp(vec2 p, float t) {",
    "  for (int i = 0; i < 5; i++) {",
    "    float fi = float(i);",
    "    float h = hash(fi + 1.0);",
    "    vec2 c = vec2(cos(t * (0.35 + 0.2 * h) + h * 40.0), sin(t * (0.28 + 0.25 * h) + h * 17.0) * 0.6);",
    "    vec2 d = p - c;",
    "    float r = length(d);",
    "    float ring = 0.5 + 0.5 * cos(r * 9.0 - t * 1.5 + h * 6.0);",
    "    float amount = exp(-r * 1.8) * ring * 3.2 * sin(t * 0.6 + h * 30.0);",
    "    p = c + rot(amount) * d;",
    "  }",
    "  vec2 m = p - uPointer;",
    "  p = uPointer + rot(0.9 * exp(-dot(m, m) * 6.0)) * m;",
    "  return p;",
    "}",
    "",
    "float field(vec2 p, float t) {",
    "  vec2 q = warp(p, t);",
    "  return sin(q.x * 2.3 + t * 0.4) * cos(q.y * 2.1 - t * 0.3) + 0.5 * sin(length(q) * 3.0 - t * 0.5);",
    "}",
    "",
    "void main() {",
    "  float aspect = uResolution.x / uResolution.y;",
    "  vec2 uv = gl_FragCoord.xy / uResolution;",
    "  vec2 p = (uv - 0.5) * vec2(aspect, 1.0) * 1.6;",
    "  float t = uTime * 0.12;",
    "",
    "  float e = 0.004;",
    "  float f = field(p, t);",
    "  float fx = field(p + vec2(e, 0.0), t);",
    "  float fy = field(p + vec2(0.0, e), t);",
    "  vec3 n = normalize(vec3((f - fx) / e * 0.02, (f - fy) / e * 0.02, 1.0));",
    "",
    "  vec3 base = vec3(0.965, 0.945, 0.925);",
    "  vec3 col = base * 0.68;",
    "  vec3 lightCol[3];",
    "  lightCol[0] = vec3(1.0, 0.25, 0.55);",
    "  lightCol[1] = vec3(0.2, 0.9, 0.6);",
    "  lightCol[2] = vec3(0.3, 0.45, 1.0);",
    "  for (int i = 0; i < 3; i++) {",
    "    float a = t * 0.9 + float(i) * 2.094;",
    "    vec3 lp = vec3(cos(a) * aspect * 0.9, sin(a * 1.3) * 0.9, 0.9);",
    "    vec3 ld = lp - vec3(p, 0.0);",
    "    float atten = 1.0 / (0.6 + dot(ld, ld));",
    "    float diff = max(dot(n, normalize(ld)), 0.0);",
    "    col += lightCol[i] * diff * atten * 0.6;",
    "  }",
    "  float spec = smoothstep(0.86, 0.97, n.z + 0.08 * f);",
    "  col = mix(col, vec3(1.0), 0.35 * (1.0 - spec));",
    "  col += 0.08 * f;",
    "  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);",
    "}"
  ].join("\n");

  function compile(type, source) {
    var shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.warn(gl.getShaderInfoLog(shader));
      return null;
    }
    return shader;
  }

  var vs = compile(gl.VERTEX_SHADER, vertexSource);
  var fs = compile(gl.FRAGMENT_SHADER, fragmentSource);
  var program = gl.createProgram();
  if (!vs || !fs) {
    document.documentElement.classList.add("psychedelic-fallback");
    canvas.remove();
    return;
  }
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.useProgram(program);

  var buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  var aPosition = gl.getAttribLocation(program, "aPosition");
  gl.enableVertexAttribArray(aPosition);
  gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0);

  var uResolution = gl.getUniformLocation(program, "uResolution");
  var uTime = gl.getUniformLocation(program, "uTime");
  var uPointer = gl.getUniformLocation(program, "uPointer");

  // Rendering below native resolution keeps the effect smooth and cheap.
  var RENDER_SCALE = 0.5;
  var pointer = { x: 0, y: 0, tx: 0, ty: 0 };

  function resize() {
    var w = Math.max(1, Math.round(window.innerWidth * RENDER_SCALE));
    var h = Math.max(1, Math.round(window.innerHeight * RENDER_SCALE));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
    }
  }

  window.addEventListener("resize", resize, { passive: true });
  window.addEventListener("pointermove", function (event) {
    var aspect = window.innerWidth / window.innerHeight;
    pointer.tx = (event.clientX / window.innerWidth - 0.5) * aspect * 1.6;
    pointer.ty = (0.5 - event.clientY / window.innerHeight) * 1.6;
  }, { passive: true });

  var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  var start = performance.now();
  var frameId = null;

  function draw(now) {
    resize();
    pointer.x += (pointer.tx - pointer.x) * 0.04;
    pointer.y += (pointer.ty - pointer.y) * 0.04;
    gl.uniform2f(uResolution, canvas.width, canvas.height);
    gl.uniform1f(uTime, (now - start) / 1000 + 20.0);
    gl.uniform2f(uPointer, pointer.x, pointer.y);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function loop(now) {
    draw(now);
    frameId = requestAnimationFrame(loop);
  }

  function update() {
    if (frameId) cancelAnimationFrame(frameId);
    frameId = null;
    if (reducedMotion.matches || document.hidden) {
      draw(start);
    } else {
      frameId = requestAnimationFrame(loop);
    }
  }

  document.addEventListener("visibilitychange", update);
  if (reducedMotion.addEventListener) reducedMotion.addEventListener("change", update);
  document.documentElement.classList.add("psychedelic-background-active");
  update();
})();

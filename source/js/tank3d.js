(function (root) {
  'use strict';
  var T = root.THREE;
  if (!T) return;

  var TAU = Math.PI * 2;
  // Tank interior size in scene units. Set from the chosen tank size by setDims().
  // These are illustrative proportions for the demo (about 2:1:1.2 for the US gallon
  // sizes, the real 36 x 22 x 26 cm for the paper [3] tank). They are not a product spec.
  var W = 8, H = 4.87, D = 4, SURFACE = 4.6;
  var INCH = 0.513;

  function dimsFor(size) {
    var wIn, lIn, hIn;
    if (size === 'p3') { lIn = 36 / 2.54; wIn = 22 / 2.54; hIn = 26 / 2.54; }
    else { var g = Number(size) || 5; wIn = Math.cbrt(94.7 * g); lIn = 2 * wIn; hIn = 1.22 * wIn; }
    return { W: lIn * INCH, D: wIn * INCH, H: hIn * INCH, SURFACE: hIn * INCH - 0.27 };
  }
  function setDims(d) { W = d.W; H = d.H; D = d.D; SURFACE = d.SURFACE; }

  // Controller geometry (local y = 0 is the top edge of the glass).
  // Concept dimensions: fixed 24 x 7 x 4.5 cm housing on the front rim, 2.0 cm square outer
  // rail tube with a 1.5 cm inner bar sliding in it. Proposal only, for team confirmation.
  var CM = INCH / 2.54;
  var RAIL = { outer: 2.0 * CM, inner: 1.5 * CM, y: 1.2 * CM };
  var HEAD = { w: 24 * CM, d: 7 * CM, h: 4.5 * CM, bottom: 0, zOver: 1.2 * CM };   // sits on the rim; the rail tubes run inside it
  var FEED = { hopperX: -1.15, armX: 0, z: 0 };   // housing-local: arm in the centre, hopper to its left
  // arm geometry (scene units, about 4.7 + 4.5 cm links) and its folded rest pose [yaw, shoulder, elbow, wrist]
  var ARM = { sh: 0.24, l1: 0.95, l2: 0.9, l3: 0.22, rest: [Math.PI, 1.35, -2.55, 1.2] };
  var SLEEVE = 10 * CM, CORNER = 3 * CM, TRACK = 0.8 * CM;
  var TOP = HEAD.bottom + HEAD.h;           // top face of the housing

  function randomGenerator(seed) {
    return function () {
      seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
  }

  function standard(color, options) {
    return new T.MeshStandardMaterial(Object.assign({ color: color, roughness: 0.65 }, options));
  }

  function mesh(parent, geometry, material, x, y, z) {
    var result = new T.Mesh(geometry, material);
    result.position.set(x || 0, y || 0, z || 0);
    parent.add(result);
    return result;
  }

  function box(parent, size, material, x, y, z) {
    return mesh(parent, new T.BoxGeometry(size[0], size[1], size[2]), material, x, y, z);
  }

  function tube(parent, points, radius, material, segments) {
    var path = new T.CatmullRomCurve3(points.map(function (p) { return new T.Vector3().fromArray(p); }));
    return mesh(parent, new T.TubeGeometry(path, segments || 16, radius, 6, false), material);
  }

  function surface(columns, rows, point) {
    var positions = [], colors = [], indices = [];
    for (var j = 0; j <= rows; j++) {
      for (var i = 0; i <= columns; i++) {
        var vertex = point(i / columns, j / rows);
        positions.push(vertex[0], vertex[1], vertex[2]);
        if (vertex[3]) colors.push(vertex[3].r, vertex[3].g, vertex[3].b);
        var a = j * (columns + 1) + i, b = a + columns + 1;
        if (i < columns && j < rows) indices.push(a, a + 1, b, b, a + 1, b + 1);
      }
    }
    var geometry = new T.BufferGeometry();
    geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
    if (colors.length) geometry.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  }

  function makeGravel(parent, rng) {
    var mat = standard(0xffffff, { vertexColors: true, flatShading: true, side: T.DoubleSide });
    var clock = { value: 0 };
    mat.onBeforeCompile = function (shader) {
      shader.uniforms.aquaTime = clock;
      shader.vertexShader = 'varying vec3 bedPoint;\n' + shader.vertexShader.replace('#include <begin_vertex>',
        '#include <begin_vertex>\nbedPoint = position;');
      shader.fragmentShader = 'varying vec3 bedPoint; uniform float aquaTime;\n' + shader.fragmentShader.replace('#include <color_fragment>', [
        '#include <color_fragment>',
        'vec2 p = bedPoint.xz;',
        'float grain = fract(sin(dot(floor(p * 435.0), vec2(127.1, 311.7))) * 43758.5453);',
        'float a = sin(p.x * 6.0 + p.y * 9.0 + aquaTime + sin(p.x * 3.0 + aquaTime * .4));',
        'float b = cos(p.x * 9.0 - p.y * 6.0 - aquaTime * .9 + cos(p.y * 4.0));',
        'float caustic = pow(max(0.0, a * b), 4.0);',
        'diffuseColor.rgb *= (0.64 + grain * .47 + caustic * .39);'
      ].join('\n'));
    };
    var palette = [0x837563, 0x6e6557, 0x9c8a70, 0xb9aa8c, 0x504a44, 0x9b8d77].map(function (c) { return new T.Color(c); });
    function depth(x, z) {
      return 0.13 + 0.07 * Math.sin(x * 0.78 - z) + 0.12 * (1.9 - z) / D;
    }
    var bed = surface(65, 33, function (u, v) {
      var x = (u - 0.5) * W, z = (0.5 - v) * D;
      return [x, depth(x, z), z, palette[Math.floor(rng() * palette.length)]];
    });
    mesh(parent, bed, mat);
    box(parent, [W, 0.12, D], standard(0x554637), 0, 0.05, 0);

    var pebbles = new T.InstancedMesh(new T.IcosahedronGeometry(1, 0), standard(0xffffff, { flatShading: true }), Math.round(1750 * W * D / 32));
    var pose = new T.Object3D();
    for (var i = 0; i < pebbles.count; i++) {
      var x = (rng() - 0.5) * (W - 0.08), z = (rng() - 0.5) * (D - 0.08);
      var r = 0.016 + Math.pow(rng(), 3) * 0.075;
      pose.position.set(x, depth(x, z) + r * 0.18, z);
      pose.rotation.set(rng() * 3, rng() * 6, rng() * 2);
      pose.scale.set(r * 1.22, r * 0.58, r);
      pose.updateMatrix();
      pebbles.setMatrixAt(i, pose.matrix);
      pebbles.setColorAt(i, palette[Math.floor(rng() * palette.length)]);
    }
    parent.add(pebbles);
    return { clock: clock, depth: depth, bed: mat, pebbles: pebbles };
  }

  function rock(parent, rng, mat, x, y, z, sx, sy, sz) {
    var geometry = new T.IcosahedronGeometry(1, 5);
    var p = geometry.attributes.position, colors = [];
    for (var i = 0; i < p.count; i++) {
      var px = p.getX(i), py = p.getY(i), pz = p.getZ(i);
      var noise = Math.sin(px * 13 + pz * 9) * Math.cos(py * 12 - pz * 8);
      var layer = Math.sin(py * 16 + px * 4 + noise * 1.4);
      var r = 1 + noise * 0.12 + layer * 0.07;
      p.setXYZ(i, px * r + py * 0.19, py * r, pz * r);
      var color = new T.Color(0x625f54).multiplyScalar(0.74 + layer * 0.19 + noise * 0.21 + py * 0.15);
      colors.push(color.r, color.g, color.b);
    }
    geometry.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    var stone = mesh(parent, geometry, mat, x, y, z);
    stone.rotation.y = rng() * TAU;
    stone.scale.set(sx, sy, sz);
  }

  function wood(parent, mat, points, from, to) {
    var path = new T.CatmullRomCurve3(points.map(function (p) { return new T.Vector3().fromArray(p); }));
    var frames = path.computeFrenetFrames(24, false);
    var dark = new T.Color(0x332017), pale = new T.Color(0x97704e);
    var geometry = surface(20, 24, function (u, v) {
      var i = Math.round(v * 24), a = u * TAU;
      var grain = Math.sin(13 * a + 1.1 * Math.sin(v * 12)) * 0.49 + Math.cos(7 * a - v * 4) * 0.29 + Math.sin(21 * a) * 0.16;
      var r = T.MathUtils.lerp(from, to, v) * (1 + grain * 0.27);
      var c = path.getPointAt(v).addScaledVector(frames.normals[i], Math.cos(a) * r)
        .addScaledVector(frames.binormals[i], Math.sin(a) * r * 0.72);
      var color = dark.clone().lerp(pale, 0.39 + grain * 0.37 + Math.sin(v * 18) * 0.09);
      return [c.x, c.y, c.z, color];
    });
    mesh(parent, geometry, mat);
  }

  // Keep a vertex inside the glass. The margin grows with height because each
  // plant sways about its base, so a tall tip needs more room than a short one.
  function keepInside(v, origin) {
    var wx = origin.x + v.x, wy = origin.y + v.y, wz = origin.z + v.z;
    var mx = 0.07 + 0.055 * wy, mz = 0.07 + 0.035 * wy;
    wx = Math.max(-(W / 2 - mx), Math.min(W / 2 - mx, wx));
    wz = Math.max(-(D / 2 - mz), Math.min(D / 2 - mz, wz));
    wy = Math.min(SURFACE - 0.08, wy);
    v.set(wx - origin.x, wy - origin.y, wz - origin.z);
  }

  function leafGeometry(length, width, bend, dark, light) {
    return surface(6, 10, function (u, v) {
      var span = Math.pow(Math.sin(Math.PI * v), 0.85);
      var edge = Math.abs(u - 0.5) * 2;
      var vein = 0.62 - edge * 0.40 + 0.11 * Math.cos(v * 67 + edge * 4) + (edge < 0.01 ? 0.22 : 0);
      return [(u - 0.5) * width * span, v * length, bend * v * v + edge * edge * width * span * 0.24,
        dark.clone().lerp(light, vein * (0.65 + 0.35 * v))];
    });
  }

  function makePlant(parent, rng, x, z, height, style) {
    var plant = new T.Group();
    plant.position.set(x, 0.16, z);
    parent.add(plant);
    var palettes = {
      ribbon: [0x244a0c, 0x9fbc44],
      fern: [0x1b3b12, 0x7aab4e],
      red: [0x532032, 0xb3524e],
      grass: [0x224510, 0xa6c933]
    };
    var colors = palettes[style].map(function (color) { return new T.Color(color); });
    var material = standard(0xffffff, { vertexColors: true, side: T.DoubleSide, roughness: 0.52 });
    var j;
    if (style === 'fern' || style === 'red') {
      var stem = standard(palettes[style][0]);
      for (j = 0; j < 5; j++) {
        var angle = rng() * TAU;
        var spread = 0.1 + rng() * 0.32, dx = Math.cos(angle) * spread, dz = Math.sin(angle) * spread;
        var h = height * (0.72 + rng() * 0.28);
        tube(plant, [[0, 0, 0], [dx * 0.35, h * 0.48, dz * 0.35], [dx, h, dz]], 0.013, stem, 8);
        for (var k = 2; k <= 8; k++) {
          var level = k / 9, size = (0.23 + Math.sin(level * Math.PI) * 0.33) * Math.min(1.5, height);
          for (var side = -1; side <= 1; side += 2) {
            var leaf = mesh(plant, leafGeometry(size, size * 0.48, size * 0.45, colors[0], colors[1]), material,
              dx * level * level, h * level, dz * level * level);
            leaf.rotation.set(0.54 + rng() * 0.65, angle + level * 1.6 + side * Math.PI / 2 + rng() * 0.55, (rng() - 0.5) * 0.42);
          }
        }
      }
    } else {
      var count = style === 'grass' ? 13 : 12;
      for (j = 0; j < count; j++) {
        var length = height * (0.36 + rng() * 0.64);
        var blade = mesh(plant, leafGeometry(length, style === 'grass' ? 0.052 : 0.26,
          length * (0.16 + rng() * 0.45), colors[0], colors[1]), material,
        (rng() - 0.5) * 0.29, 0, (rng() - 0.5) * 0.23);
        blade.rotation.set((rng() - 0.5) * 0.48, rng() * TAU, (rng() - 0.5) * 0.48);
      }
    }
    // Each cluster sways as one mesh. Baking the individual leaves keeps the
    // detailed geometry affordable on phone GPUs. Every vertex is also kept
    // inside the glass here, so no leaf can poke through the walls or the surface.
    var positions = [], normals = [], vertexColors = [];
    var v = new T.Vector3(), normalMatrix = new T.Matrix3();
    Array.from(plant.children).forEach(function (leaf) {
      leaf.updateMatrix();
      normalMatrix.getNormalMatrix(leaf.matrix);
      var geometry = leaf.geometry, index = geometry.index, attributes = geometry.attributes;
      var count = index ? index.count : attributes.position.count;
      for (var i = 0; i < count; i++) {
        var j = index ? index.getX(i) : i;
        v.fromBufferAttribute(attributes.position, j).applyMatrix4(leaf.matrix);
        keepInside(v, plant.position);
        positions.push(v.x, v.y, v.z);
        v.fromBufferAttribute(attributes.normal, j).applyNormalMatrix(normalMatrix);
        normals.push(v.x, v.y, v.z);
        if (attributes.color) {
          v.fromBufferAttribute(attributes.color, j);
          vertexColors.push(v.x, v.y, v.z);
        } else {
          var color = leaf.material.color;
          vertexColors.push(color.r, color.g, color.b);
        }
      }
      geometry.dispose();
      if (leaf.material !== material) leaf.material.dispose();
      plant.remove(leaf);
    });
    var combined = new T.BufferGeometry();
    combined.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
    combined.setAttribute('normal', new T.Float32BufferAttribute(normals, 3));
    combined.setAttribute('color', new T.Float32BufferAttribute(vertexColors, 3));
    mesh(plant, combined, material);
    return plant;
  }

  function makeFish(parent, rng, i) {
    var fish = new T.Group();
    parent.add(fish);
    var gold = i % 4 === 0, c1 = new T.Color(gold ? 0xbc401c : 0x314956);
    var c2 = new T.Color(gold ? 0xf2ba62 : 0xd4e4db);
    var blue = new T.Color(0x24a9e8), red = new T.Color(0xc42a33);
    var body = surface(30, 24, function (u, v) {
      var a = v * TAU, r = Math.pow(Math.sin(u * Math.PI), 0.72) * (0.60 + u * 0.58);
      var y = Math.cos(a) * r * (gold ? 0.205 : 0.143);
      var z = Math.sin(a) * r * 0.104;
      var color = c1.clone().lerp(c2, 0.52 - Math.cos(a) * 0.34 + Math.sin(u * 158 + a * 10) * 0.12);
      if (!gold && y > 0.011 && y < 0.068 && u > 0.14 && u < 0.93) color.lerp(blue, 0.94);
      if (!gold && y < -0.002 && y > -0.095 && u > 0.11 && u < 0.53) color.lerp(red, 0.95);
      return [(u - 0.5) * 0.84, y, z, color];
    });
    mesh(fish, body, standard(0xffffff, { vertexColors: true, side: T.DoubleSide, metalness: 0.16, roughness: 0.33 }));

    var finDark = new T.Color(gold ? 0xb64921 : 0x3a626b);
    var finLight = new T.Color(gold ? 0xf4b457 : 0xa8c6c7);
    var finMat = standard(0xffffff, { vertexColors: true, side: T.DoubleSide, roughness: 0.49 });
    function fin(target, x, y, z, span, height, fan) {
      return mesh(target, surface(12, 7, function (u, v) {
        var a = (u - 0.5) * 2;
        var scallop = Math.cos(u * 42) * 0.018;
        var color = finDark.clone().lerp(finLight, 0.24 + v * 0.40 + Math.cos(u * 60) * 0.15);
        return [v * (-span + fan * (1 - Math.abs(a))), a * (0.024 + (height + scallop) * v), Math.sin(u * 19) * 0.024 * v, color];
      }), finMat, x, y, z);
    }
    var tail = fin(fish, -0.35, 0.002, 0, 0.265, gold ? 0.18 : 0.133, gold ? 0.064 : 0.093);
    var dorsal = fin(fish, 0.12, gold ? 0.10 : 0.077, 0, 0.27, 0.065, -0.05);
    dorsal.rotation.z = -0.47;
    var ventral = fin(fish, -0.02, -0.08, 0, 0.19, 0.038, -0.03);
    ventral.rotation.z = 0.42;
    var fins = [];
    for (var side = -1; side <= 1; side += 2) {
      var eye = mesh(fish, new T.SphereGeometry(0.038, 12, 8), standard(gold ? 0xb69e64 : 0x9fbbb4, { roughness: 0.31 }), 0.278, 0.019, side * 0.064);
      mesh(eye, new T.SphereGeometry(0.023, 12, 8), standard(0x08141a, { roughness: 0.18 }), 0.009, 0, side * 0.024);
      var swimFin = fin(fish, 0.13, -0.038, side * 0.083, 0.16, 0.043, -0.025);
      swimFin.rotation.z = 0.38;
      fins.push(swimFin);
    }
    fish.scale.setScalar((gold ? 0.85 : 0.60) * (0.87 + rng() * 0.22));
    return { node: fish, tail: tail, fins: fins, phase: rng() * TAU, orbit: i * 0.58,
      lane: i % 3, gold: gold, direction: new T.Vector3() };
  }

  function waterMaterial() {
    return new T.ShaderMaterial({
      side: T.DoubleSide, transparent: true, depthWrite: false,
      uniforms: { time: { value: 0 }, turbidity: { value: 0 } },
      vertexShader: [
        'uniform float time;', 'varying vec3 point;', 'varying vec3 world;',
        'void main(){ point=position; vec3 p=position;',
        'p.z+=.017*sin(p.x*6.+p.y*4.+time*2.)+.011*cos(p.y*9.-p.x*3.+time*1.5);',
        'world=(modelMatrix*vec4(p,1.)).xyz; gl_Position=projectionMatrix*viewMatrix*vec4(world,1.); }'
      ].join('\n'),
      fragmentShader: [
        'uniform float time;', 'uniform float turbidity;', 'varying vec3 point;', 'varying vec3 world;',
        'void main(){ vec2 p=point.xy;',
        'float a=sin(p.x*10.+p.y*8.+time*2.+sin(p.y*9.-time));',
        'float b=sin(-p.x*17.+p.y*11.-time*2.7+cos(p.x*10.+time));',
        'float ripple=pow(max(0., a*b), 5.);',
        'float grazing=pow(1.-abs(normalize(cameraPosition-world).y), 3.);',
        'vec3 c=mix(vec3(.05,.37,.43),vec3(.35,.29,.14),turbidity*.65);',
        'gl_FragColor=vec4(mix(c,vec3(.66,.90,.94),ripple*.84),.14+grazing*.21+ripple*.29); }'
      ].join('\n')
    });
  }

  function makeDust(parent, rng) {
    var count = Math.min(1500, Math.round(680 * (W * D * SURFACE) / 110)), anchors = [];
    var positions = new Float32Array(count * 3);
    for (var i = 0; i < count; i++) {
      anchors.push([(rng() - 0.5) * (W - 0.24), 0.30 + rng() * (SURFACE - 0.4), (rng() - 0.5) * (D - 0.24), rng() * 18]);
    }
    var geometry = new T.BufferGeometry();
    geometry.setAttribute('position', new T.BufferAttribute(positions, 3));
    var particles = new T.Points(geometry, new T.PointsMaterial({ color: 0xe8ecda, size: 0.021, transparent: true, opacity: 0.38, depthWrite: false }));
    particles.frustumCulled = false;
    parent.add(particles);
    return { mesh: particles, positions: positions, anchors: anchors, count: count };
  }

  // ---------- the controller display (canvas texture) ----------
  var SEG = { '0': 'abcdef', '1': 'bc', '2': 'abdeg', '3': 'abcdg', '4': 'bcfg', '5': 'acdfg', '6': 'acdefg', '7': 'abc', '8': 'abcdefg', '9': 'abcdfg', '-': 'g' };
  function pill(ctx, x, y, w, h) {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, Math.min(w, h) * 0.32); else ctx.rect(x, y, w, h);
    ctx.fill();
  }
  function sevenText(ctx, text, x, y, dw, dh, gap, color) {
    var t = dh * 0.15, off = 'rgba(233,244,247,.07)';
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (ch === ':') {
        ctx.fillStyle = color;
        ctx.fillRect(x + dw * 0.12, y + dh * 0.28, t * 0.9, t * 0.9);
        ctx.fillRect(x + dw * 0.12, y + dh * 0.64, t * 0.9, t * 0.9);
        x += dw * 0.42 + gap;
      } else if (ch === '.') {
        ctx.fillStyle = color;
        ctx.fillRect(x + dw * 0.06, y + dh - t, t, t);
        x += dw * 0.26 + gap;
      } else {
        var on = SEG[ch] || '';
        var segs = {
          a: [x + t * 0.55, y, dw - t * 1.1, t], g: [x + t * 0.55, y + dh / 2 - t / 2, dw - t * 1.1, t],
          d: [x + t * 0.55, y + dh - t, dw - t * 1.1, t],
          f: [x, y + t * 0.55, t, dh / 2 - t * 0.9], b: [x + dw - t, y + t * 0.55, t, dh / 2 - t * 0.9],
          e: [x, y + dh / 2 + t * 0.35, t, dh / 2 - t * 0.9], c: [x + dw - t, y + dh / 2 + t * 0.35, t, dh / 2 - t * 0.9]
        };
        Object.keys(segs).forEach(function (k) {
          ctx.fillStyle = on.indexOf(k) >= 0 ? color : off;
          pill(ctx, segs[k][0], segs[k][1], segs[k][2], segs[k][3]);
        });
        x += dw + gap;
      }
    }
    return x;
  }

  // lines: [status line 1, status line 2, clock, temperature, pH, TDS, NTU, feeds]
  function displayPanel(parent, x, y, z) {
    var cw = 1312, ch = 160;
    var canvas = document.createElement('canvas');
    canvas.width = cw; canvas.height = ch;
    var ctx = canvas.getContext('2d');
    var texture = new T.CanvasTexture(canvas);
    texture.colorSpace = T.SRGBColorSpace;
    texture.anisotropy = 4;
    var face = mesh(parent, new T.PlaneGeometry(4.1, 0.5), new T.MeshBasicMaterial({ map: texture }), x, y, z);
    face.material.toneMapped = false;
    var key = '', lastDraw = 0, lastArgs = null;
    function draw(lines, power, force) {
      lines = lines || [];
      lastArgs = [lines, power];
      var next = power + '|' + lines.join('|');
      var now = performance.now();
      if (next === key || (!force && now - lastDraw < 140)) return;
      key = next; lastDraw = now;
      var mono = 'bold 31px ui-monospace, Menlo, Consolas, monospace', sans = 'bold 44px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif';
      var bg = ctx.createLinearGradient(0, 0, cw, ch);
      bg.addColorStop(0, '#05090c'); bg.addColorStop(1, '#0a1115');
      ctx.fillStyle = bg; ctx.fillRect(0, 0, cw, ch);
      ctx.fillStyle = 'rgba(255,255,255,.035)';           // glass glare
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(330, 0); ctx.lineTo(150, ch); ctx.lineTo(0, ch); ctx.fill();
      var dim = power === 'off', bright = dim ? 'rgba(233,244,247,.10)' : '#eaf5f7', green = dim ? 'rgba(208,237,156,.10)' : '#d0ed9c';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = dim ? 'rgba(233,244,247,.16)' : '#f1f6f7'; ctx.font = sans; ctx.fillText('AquaCare', 30, 70);
      ctx.fillStyle = dim ? 'rgba(243,199,53,.18)' : '#f3c735'; ctx.font = 'bold 17px ui-monospace, Menlo, Consolas, monospace';
      ctx.fillText('SIMULATION', 32, 102); ctx.fillText('DEMO DATA', 32, 126);
      ctx.fillStyle = 'rgba(233,244,247,.18)'; ctx.fillRect(298, 22, 2, 116);
      if (power === 'booting') {
        ctx.fillStyle = green; ctx.font = mono;
        ctx.fillText(lines[0] || 'AquaCare  SIM', 336, 70); ctx.fillText(lines[1] || 'Booting...', 336, 118);
      } else {
        var xe = sevenText(ctx, dim ? '88:88' : (lines[2] || '--:--'), 336, 20, 58, 92, 13, bright);
        ctx.fillStyle = 'rgba(233,244,247,.18)'; ctx.fillRect(xe + 14, 22, 2, 116);
        var tx = xe + 44;
        var te = sevenText(ctx, dim ? '88.8' : (lines[3] || '--.-'), tx, 20, 58, 92, 13, bright);
        ctx.fillStyle = bright; ctx.font = 'bold 36px system-ui, Arial, sans-serif'; ctx.fillText('°C', te + 4, 62);
        ctx.fillStyle = 'rgba(233,244,247,.18)'; ctx.fillRect(te + 76, 22, 2, 116);
        var rx = te + 104;
        ctx.font = mono;
        var rows = [['pH', lines[4] || '--'], ['TDS', lines[5] || '--'], ['NTU', lines[6] || '--']];
        rows.forEach(function (r, i) {
          ctx.fillStyle = dim ? 'rgba(233,244,247,.10)' : '#8fa7ae'; ctx.fillText(r[0], rx, 52 + i * 42);
          ctx.fillStyle = green; ctx.fillText(dim ? '--' : r[1], rx + 78, 52 + i * 42);
        });
        ctx.font = 'bold 25px ui-monospace, Menlo, Consolas, monospace';
        ctx.fillStyle = dim ? 'rgba(208,237,156,.10)' : '#b7c9cf';
        ctx.fillText(dim ? '' : (lines[1] || ''), 336, 148, 560);
        ctx.fillText(dim ? '' : (lines[7] || ''), 336 + 580, 148, 300);
      }
      texture.needsUpdate = true;
    }
    return {
      face: face, canvas: canvas, draw: draw,
      redraw: function () { if (lastArgs) draw(lastArgs[0], lastArgs[1], true); },
      dispose: function () { texture.dispose(); }
    };
  }

  function grilleTexture() {
    var c = document.createElement('canvas'); c.width = 256; c.height = 64;
    var g = c.getContext('2d');
    g.fillStyle = '#0b0f12'; g.fillRect(0, 0, 256, 64);
    g.fillStyle = '#3b464c';
    for (var j = 0; j < 7; j++) for (var i = 0; i < 31; i++) {
      g.beginPath(); g.arc(7 + i * 8 + (j % 2) * 4, 7 + j * 8.4, 2.1, 0, TAU); g.fill();
    }
    var tx = new T.CanvasTexture(c); tx.colorSpace = T.SRGBColorSpace; return tx;
  }
  function labelTexture(lines, w, h, scale) {
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    var g = c.getContext('2d');
    g.fillStyle = '#0b0f12'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#9db0b6'; g.textBaseline = 'middle';
    lines.forEach(function (l, i) {
      g.font = (l.bold ? 'bold ' : '') + (l.size || 22) * scale + 'px ui-monospace, Menlo, Consolas, monospace';
      g.fillStyle = l.color || '#9db0b6';
      g.fillText(l.text, 18 * scale, (l.y || (30 + i * 30)) * scale);
    });
    var tx = new T.CanvasTexture(c); tx.colorSpace = T.SRGBColorSpace; tx.anisotropy = 4; return tx;
  }
  function glowTexture() {
    var c = document.createElement('canvas'); c.width = c.height = 128;
    var g = c.getContext('2d'), r = g.createRadialGradient(64, 64, 4, 64, 64, 64);
    r.addColorStop(0, 'rgba(255,226,160,.9)'); r.addColorStop(1, 'rgba(255,226,160,0)');
    g.fillStyle = r; g.fillRect(0, 0, 128, 128);
    return new T.CanvasTexture(c);
  }

  // ---------- the universal controller ----------
  // One module for every tank. The head, hopper, arm, camera and display never change
  // size. Two telescoping rails and four clamps stretch to the tank that the phone app
  // reports, and the camera field of view follows the same tank profile.
  var FINISH = {
    black: { body: 0x0e1215, top: 0x171c20, rail: 0x1d2327, leg: 0x12171a },
    white: { body: 0xe6e8e3, top: 0xf3f4f0, rail: 0xd2d6d0, leg: 0xdadcd6 }
  };

  function buildController(dim, finish) {
    var g = new T.Group(), w = dim.W, d = dim.D;
    var out = { group: g, labels: [], finishMats: [] };
    var fin = FINISH[finish] || FINISH.black;
    var body = standard(fin.body, { roughness: 0.42, metalness: 0.12 });
    var topMat = standard(fin.top, { roughness: 0.22, metalness: 0.32 });
    var railMat = standard(fin.rail, { roughness: 0.38, metalness: 0.45 });
    var legMat = standard(fin.leg, { roughness: 0.5, metalness: 0.2 });
    out.finishMats = { body: body, top: topMat, rail: railMat, leg: legMat };
    var metal = standard(0xa5afb3, { metalness: 0.75, roughness: 0.32 });
    var white = standard(0xf1f2ed, { roughness: 0.55 });
    var blue = standard(0x2b66cc, { roughness: 0.35 });
    var black = standard(0x0b0e10, { roughness: 0.5 });
    var glass = standard(0x0a1013, { roughness: 0.08, metalness: 0.4 });
    var RY = RAIL.y;                                     // rail centre height above the glass top

    // Frame. Each run has a fixed part (the housing or a centre sleeve) and two inner bars
    // that slide out of it to the corner blocks. The scale ticks on the inner bars are 1 cm.
    var tickGeo = new T.BoxGeometry(0.014, 0.006, 0.12), ticks = [];
    out.extension = {};
    function slides(axis, total, fixedLen, cx, cz, name, offset) {
      var from = fixedLen / 2 - 0.25, to = total / 2 - CORNER / 2, len = Math.max(0.12, to - from);
      out.extension[name] = Math.max(0, (to - fixedLen / 2)) / CM;   // cm each bar sticks out
      var cz0 = cz;
      [-1, 1].forEach(function (side) {
        var mid = side * (from + len / 2), cz = cz0 + (offset ? side * offset : 0);
        if (axis === 'x') box(g, [len, RAIL.inner, RAIL.inner], metal, cx + mid, RY, cz);
        else box(g, [RAIL.inner, RAIL.inner, len], metal, cx, RY, cz + mid);
        for (var k = 0.25 + CM; k < len; k += CM) {
          var o = side * (from + k), major = Math.round((k - 0.25) / CM) % 5 === 0;
          ticks.push(axis === 'x' ? [cx + o, RY + RAIL.inner / 2, cz, 0, major] : [cx, RY + RAIL.inner / 2, cz + o, 1, major]);
        }
      });
    }
    function sleeve(axis, len, cx, cz) {
      return axis === 'x' ? box(g, [len, RAIL.outer, RAIL.outer], railMat, cx, RY, cz) : box(g, [RAIL.outer, RAIL.outer, len], railMat, cx, RY, cz);
    }
    var zf = d / 2, zr = -d / 2, xs = w / 2;
    // front run: the housing is the fixed part. The two bars run on offset tracks (left bar
    // in front, right bar behind) so they can pass each other inside the 24 cm housing.
    slides('x', w, HEAD.w, 0, zf, 'front', TRACK);
    // rear run and the camera crossbar: short centre sleeves
    sleeve('x', SLEEVE, 0, zr); slides('x', w, SLEEVE, 0, zr, 'rear');
    out.camZ = Math.min(0, zf - HEAD.zOver - HEAD.d - 0.45);
    sleeve('x', SLEEVE, 0, out.camZ); slides('x', w, SLEEVE, 0, out.camZ, 'cross');
    // side runs, front to back
    [-1, 1].forEach(function (s) { sleeve('z', 1.2, s * xs, 0); slides('z', d, 1.2, s * xs, 0, 'side'); });
    // crossbar ends ride on the side rails
    [-1, 1].forEach(function (s) { box(g, [0.36, RAIL.outer + 0.06, 0.42], body, s * xs, RY + 0.02, out.camZ); });
    var tickMesh = new T.InstancedMesh(tickGeo, standard(0x2a3236, { roughness: 0.6 }), ticks.length), pose = new T.Object3D();
    ticks.forEach(function (t, i) {
      pose.position.set(t[0], t[1], t[2]); pose.rotation.set(0, t[3] ? Math.PI / 2 : 0, 0);
      pose.scale.set(1, 1, t[4] ? 1.6 : 1); pose.updateMatrix();
      tickMesh.setMatrixAt(i, pose.matrix);
    });
    g.add(tickMesh);
    // corner blocks: a U-channel over the glass rim, a thumbscrew and a lock knob for the slides
    [-1, 1].forEach(function (sx) {
      [-1, 1].forEach(function (sz) {
        var cx = sx * xs, cz = sz * d / 2;
        box(g, [CORNER, 0.34, CORNER], body, cx, RY + 0.02, cz);
        box(g, [CORNER, 0.42, 0.07], body, cx, -0.16, cz + sz * 0.13);       // outer lip
        box(g, [CORNER, 0.30, 0.07], body, cx, -0.10, cz - sz * 0.13);       // inner lip
        var screw = mesh(g, new T.CylinderGeometry(0.045, 0.045, 0.2, 10), metal, cx, -0.22, cz + sz * 0.22);
        screw.rotation.x = Math.PI / 2;
        mesh(g, new T.CylinderGeometry(0.1, 0.1, 0.05, 14), metal, cx, -0.22, cz + sz * 0.34).rotation.x = Math.PI / 2;
        mesh(g, new T.CylinderGeometry(0.075, 0.075, 0.08, 12), metal, cx, RY + 0.23, cz);
      });
    });
    // light bars under the crossbar and the rear rail
    out.lightStrip = new T.MeshBasicMaterial({ color: 0xffe2a8 });
    [out.camZ - 0.16, out.camZ + 0.16, zr + 0.12].forEach(function (z) {
      mesh(g, new T.BoxGeometry(Math.max(1, w - 0.8), 0.03, 0.09), out.lightStrip, 0, RY - RAIL.outer / 2 - 0.02, z);
    });
    out.glow = mesh(g, new T.PlaneGeometry(w, d), new T.MeshBasicMaterial({ map: glowTexture(), transparent: true, opacity: 0.18,
      depthWrite: false, blending: T.AdditiveBlending, color: 0xffe2a8 }), 0, RY - 0.2, (out.camZ + zr) / 2);
    out.glow.rotation.x = Math.PI / 2;
    // camera, recessed under the crossbar centre, looking straight down
    var podY = RY - RAIL.outer / 2 + 0.02;   // lens about level with the rim, ~1.3 cm above the water
    mesh(g, new T.CylinderGeometry(0.2, 0.2, 0.14, 24), black, 0, podY, out.camZ);
    mesh(g, new T.SphereGeometry(0.11, 18, 12), standard(0x0a1622, { roughness: 0.05, metalness: 0.6 }), 0, podY - 0.07, out.camZ);
    mesh(g, new T.SphereGeometry(0.035, 10, 8), new T.MeshBasicMaterial({ color: 0x6fb2ff }), 0.035, podY - 0.13, out.camZ + 0.03);
    out.lens = new T.Vector3(0, podY - 0.13, out.camZ);  // used for the camera feed
    // probe cable cover along the right side rail, four clipped drops
    var coverLen = d - 0.7;
    box(g, [0.26, 0.2, coverLen], body, xs - 0.3, RY - 0.02, 0);
    out.jacks = [0x3b82f6, 0xef4444, 0x22c55e, 0xeab308].map(function (c, k) {
      var jz = T.MathUtils.clamp(d * (0.26 - k * 0.17), -coverLen / 2 + 0.1, coverLen / 2 - 0.1);
      mesh(g, new T.CylinderGeometry(0.045, 0.045, 0.05, 10), new T.MeshBasicMaterial({ color: c }), xs - 0.3, RY - 0.13, jz);
      box(g, [0.1, 0.06, 0.12], black, xs - 0.3, RY - 0.17, jz);   // strain-relief clip
      return new T.Vector3(xs - 0.3, RY - 0.18, jz);
    });

    // ---- housing: fixed 24 cm unit on the front rim, overhanging the glass by HEAD.zOver ----
    var head = new T.Group();
    out.headZ = zf + HEAD.zOver - HEAD.d / 2;
    head.position.z = out.headZ;
    g.add(head);
    out.head = head;
    var hy = HEAD.bottom + HEAD.h / 2, fz = HEAD.d / 2;
    box(head, [HEAD.w, HEAD.h, HEAD.d], body, 0, hy, 0);
    box(head, [HEAD.w - 0.08, 0.025, HEAD.d - 0.08], topMat, 0, TOP + 0.004, 0);
    box(head, [HEAD.w + 0.02, 0.04, HEAD.d + 0.02], standard(0x05080a, { roughness: 0.3 }), 0, HEAD.bottom + 0.02, 0);
    // rail sockets in both ends of the housing (the front bars slide out of these)
    [-1, 1].forEach(function (s) { box(head, [0.02, RAIL.outer, RAIL.outer], black, s * (HEAD.w / 2 + 0.006), RY, zf - out.headZ + s * TRACK); });
    out.panel = displayPanel(head, -0.42, hy + 0.05, fz + 0.012);
    out.panel.face.scale.set(3.5 / 4.1, 0.86, 1);
    box(head, [3.62, 0.5, 0.02], glass, -0.42, hy + 0.05, fz - 0.006);
    out.panel.button = mesh(head, new T.CylinderGeometry(0.15, 0.15, 0.09, 22), standard(0xa42d1c, { roughness: 0.4 }), 1.95, hy, fz + 0.045);
    out.panel.button.rotation.x = Math.PI / 2;
    mesh(head, new T.TorusGeometry(0.172, 0.02, 8, 24), metal, 1.95, hy, fz + 0.01);
    out.panel.led = mesh(head, new T.SphereGeometry(0.045, 12, 8), new T.MeshBasicMaterial(), 1.58, hy + 0.2, fz + 0.01);
    // rear face: label plate only (it sits over the water, so no cables leave from here)
    var rz = -fz - 0.004;
    var rear = mesh(head, new T.PlaneGeometry(3.6, 0.6), new T.MeshBasicMaterial({ map: labelTexture([
      { text: 'AquaCare  universal controller   SIMULATION MODEL', y: 22, size: 19, color: '#e9f2f4', bold: true },
      { text: 'Not a product, rating or approval.  Fits 31-50 cm rims.', y: 50, size: 16, color: '#f3c735' },
      { text: 'Tank size is set in the phone app.', y: 76, size: 16 }], 820, 96, 1) }), -0.3, hy, rz);
    rear.rotation.y = Math.PI;
    // left end: 12 V DC IN jack, ON/OFF rocker and USB-C service port. The lead runs along
    // the front rail to the corner and drops outside the front glass with a drip loop.
    var lx = -HEAD.w / 2 - 0.004, jz = 0.42;
    var jack = mesh(head, new T.CylinderGeometry(0.075, 0.075, 0.06, 18), black, lx - 0.02, hy, jz); jack.rotation.z = Math.PI / 2;
    mesh(head, new T.CylinderGeometry(0.025, 0.025, 0.065, 8), metal, lx - 0.022, hy, jz).rotation.z = Math.PI / 2;
    box(head, [0.05, 0.3, 0.2], black, lx - 0.02, hy, 0.0);
    out.rocker = box(head, [0.05, 0.12, 0.14], standard(0x2f9e8f, { roughness: 0.4 }), lx - 0.04, hy + 0.06, 0.0);
    out.rocker.rotation.z = 0.25;
    box(head, [0.01, 0.06, 0.18], black, lx - 0.004, hy, -0.42);
    var plate = mesh(head, new T.PlaneGeometry(1.25, 0.2), new T.MeshBasicMaterial({ map: labelTexture([
      { text: '12V DC IN  ON/OFF  USB-C', y: 20, size: 18, color: '#7fe3d2', bold: true }], 330, 40, 1) }), lx, hy - 0.3, 0);
    plate.rotation.y = -Math.PI / 2;
    var cx0 = -HEAD.w / 2 - 0.05, zl = out.headZ + jz, xc = -w / 2;
    tube(g, [[cx0, hy, zl], [cx0 - 0.25, RY + 0.12, zf + 0.05], [xc + 0.4, RY + 0.12, zf + 0.05], [xc - 0.05, RY + 0.05, zf + 0.25],
      [xc - 0.1, -1.2, zf + 0.35], [xc + 0.2, -1.9, zf + 0.6], [xc - 0.1, -1.5, zf + 1.0], [xc - 0.5, -2.6, zf + 1.5]], 0.028, black, 40);
    for (var cl = 0; cl < 3; cl++) {           // cable clips on the front rail
      box(g, [0.06, 0.08, 0.12], body, cx0 - 0.3 - cl * ((w / 2 - HEAD.w / 2 - 0.5) / 3), RY + 0.12, zf + 0.05);
    }
    // right end: speaker grille
    var grille = mesh(head, new T.PlaneGeometry(1.1, 0.5), new T.MeshBasicMaterial({ map: grilleTexture() }), HEAD.w / 2 + 0.002, hy + 0.1, -0.1);
    grille.rotation.y = Math.PI / 2;
    // touch keys along the top front edge
    for (var i = 0; i < 4; i++) {
      var key = mesh(head, new T.RingGeometry(0.055, 0.075, 24), new T.MeshBasicMaterial({ color: 0x5d6a70 }), -1.9 + i * 0.42, TOP + 0.02, fz - 0.16);
      key.rotation.x = -Math.PI / 2;
    }
    var under = mesh(head, new T.PlaneGeometry(2.0, 0.7), new T.MeshBasicMaterial({ map: labelTexture([
      { text: 'AquaCare  SIM', y: 26, size: 24, color: '#e9f2f4', bold: true }, { text: 'Chute  IR beam', y: 58, size: 19 },
      { text: 'Rails: 24 cm fixed', y: 88, size: 17 }], 400, 116, 1) }), -0.9, HEAD.bottom - 0.002, 0);
    under.rotation.x = Math.PI / 2;

    // feeder on the housing: hopper, servo arm (3D-printed look), funnel, chute and IR beam
    var hopperY = TOP + 0.26;
    [0, 1, 2].forEach(function (k) {
      var an = Math.PI / 3 + k / 3 * TAU;      // 60, 180, 300 degrees: open toward the arm
      mesh(head, new T.CylinderGeometry(0.03, 0.03, 0.26, 8), metal, FEED.hopperX + Math.cos(an) * 0.26, TOP + 0.13, FEED.z + Math.sin(an) * 0.26);
    });
    mesh(head, new T.CylinderGeometry(0.30, 0.19, 0.11, 20), black, FEED.hopperX, hopperY + 0.055, FEED.z);
    out.hopperFill = mesh(head, new T.CylinderGeometry(0.29, 0.21, 0.42, 20), standard(0x8b5a2b, { roughness: 0.9, flatShading: true }), FEED.hopperX, hopperY + 0.32, FEED.z);
    mesh(head, new T.CylinderGeometry(0.32, 0.32, 0.6, 24, 1, true), new T.MeshStandardMaterial({ color: 0xbfe3ea, transparent: true, opacity: 0.24, roughness: 0.1, metalness: 0.1, side: T.DoubleSide, depthWrite: false }), FEED.hopperX, hopperY + 0.33, FEED.z).renderOrder = 6;
    mesh(head, new T.CylinderGeometry(0.345, 0.345, 0.065, 24), black, FEED.hopperX, hopperY + 0.65, FEED.z);
    mesh(head, new T.SphereGeometry(0.045, 10, 8), metal, FEED.hopperX, hopperY + 0.71, FEED.z);
    // Mini 4-axis arm in the centre of the housing: turntable (yaw), shoulder, elbow and
    // wrist servos, printed links and a scoop with an IR gate across its lip. It is posed
    // from joint angles; Tank3D drives those angles through a servo model (see FeedArm).
    var arm = new T.Group();
    arm.position.set(FEED.armX, TOP, FEED.z);
    head.add(arm);
    mesh(arm, new T.CylinderGeometry(0.25, 0.28, 0.08, 28), black, 0, 0.04, 0);
    var yawG = new T.Group(); yawG.position.y = 0.08; arm.add(yawG);
    mesh(yawG, new T.CylinderGeometry(0.23, 0.23, 0.05, 28), white, 0, 0.025, 0);
    box(yawG, [0.24, 0.13, 0.17], blue, 0, 0.1, 0);
    [-1, 1].forEach(function (s) { box(yawG, [0.13, 0.2, 0.035], white, 0, 0.15, s * 0.115); });
    var shoulder = new T.Group(); shoulder.position.y = ARM.sh - 0.08; yawG.add(shoulder);
    mesh(shoulder, new T.CylinderGeometry(0.07, 0.07, 0.27, 18), white).rotation.x = Math.PI / 2;
    function link(parent, len, thick) {
      [-1, 1].forEach(function (s) { box(parent, [len, thick, 0.03], white, len / 2, 0, s * 0.06); });
      box(parent, [len * 0.7, thick * 0.5, 0.09], white, len / 2, 0, 0);
      mesh(parent, new T.CylinderGeometry(0.022, 0.022, 0.16, 8), metal, len, 0, 0).rotation.x = Math.PI / 2;
    }
    link(shoulder, ARM.l1, 0.11);
    var elbow = new T.Group(); elbow.position.x = ARM.l1; shoulder.add(elbow);
    box(elbow, [0.2, 0.12, 0.1], blue, 0, 0, 0.0);
    mesh(elbow, new T.CylinderGeometry(0.065, 0.065, 0.2, 18), white).rotation.x = Math.PI / 2;
    link(elbow, ARM.l2, 0.09);
    var wrist = new T.Group(); wrist.position.x = ARM.l2; elbow.add(wrist);
    box(wrist, [0.14, 0.1, 0.09], blue, 0.02, 0.0, 0);
    mesh(wrist, new T.CylinderGeometry(0.05, 0.05, 0.15, 14), white).rotation.x = Math.PI / 2;
    var scoop = new T.Group(); scoop.position.x = ARM.l3; wrist.add(scoop);
    box(scoop, [0.24, 0.025, 0.16], white, 0, -0.07, 0);
    box(scoop, [0.025, 0.11, 0.16], white, -0.11, -0.02, 0);
    [-1, 1].forEach(function (s) { box(scoop, [0.24, 0.1, 0.022], white, 0, -0.025, s * 0.07); });
    box(wrist, [ARM.l3 - 0.1, 0.04, 0.05], white, (ARM.l3 - 0.1) / 2 + 0.03, -0.01, 0);
    // IR gate on the scoop lip: emitter and receiver on the two side walls
    [-1, 1].forEach(function (s) { box(scoop, [0.04, 0.05, 0.03], black, 0.1, 0.0, s * 0.085); });
    out.ir = mesh(scoop, new T.BoxGeometry(0.008, 0.008, 0.15), new T.MeshBasicMaterial(), 0.1, 0.0, 0);
    var load = new T.Group(); scoop.add(load);
    var pel = standard(0x9f6837, { flatShading: true });
    for (var q = 0; q < 9; q++) mesh(load, new T.IcosahedronGeometry(0.03, 0), pel, -0.07 + (q % 3) * 0.06, -0.035 + Math.floor(q / 3) * 0.012, -0.04 + Math.floor(q / 3) * 0.04);
    load.visible = false;
    [0xc47a2c, 0xa5251f, 0x2a1d14].forEach(function (c, i) {
      tube(yawG, [[-0.1, 0.04 + i * 0.02, -0.08 + i * 0.03], [-0.2, 0.1, 0.0], [-0.12, 0.2, 0.1 - i * 0.02]], 0.01, standard(c), 8);
    });
    out.arm = { group: arm, yaw: yawG, shoulder: shoulder, elbow: elbow, wrist: wrist, scoop: scoop, load: load };
    setArmJoints(out.arm, ARM.rest);
    // the hopper chute stub (food falls from the hopper into the scoop underneath)
    mesh(head, new T.CylinderGeometry(0.06, 0.04, 0.06, 12), black, FEED.hopperX, TOP + 0.235, FEED.z);
    out.outlet = new T.Vector3(0, -0.02, out.headZ - 1.3);
    // camera view volume (hidden until asked for)
    out.cone = new T.Group();
    out.cone.visible = false;
    g.add(out.cone);

    var hz = out.headZ;
    out.labels = [
      ['Display', new T.Vector3(-0.42, hy + 0.4, hz + fz)],
      ['Tank button', new T.Vector3(1.95, hy - 0.35, hz + fz + 0.1)],
      ['Feed hopper', new T.Vector3(FEED.hopperX, TOP + 1.05, hz)],
      ['Mini robot arm', new T.Vector3(0.2, TOP + 0.95, hz)],
      ['Scoop IR gate', new T.Vector3(-0.55, TOP + 0.55, hz)],
      ['Top camera', new T.Vector3(0, podY - 0.26, out.camZ)],
      ['Extending rail', new T.Vector3(-(HEAD.w / 2 + (w / 2 - HEAD.w / 2) / 2), RY + 0.18, zf)],
      ['Probe cable cover', new T.Vector3(xs - 0.3, RY + 0.2, -d * 0.25)],
      ['12 V DC IN + ON/OFF', new T.Vector3(-HEAD.w / 2 - 0.1, hy + 0.4, hz)]
    ];
    ticks.length = 0;
    return out;
  }

  // ---- mini arm kinematics (arm-local frame: origin on the housing top, y up) ----
  function setArmJoints(arm, q) {
    arm.yaw.rotation.y = q[0];
    arm.shoulder.rotation.z = q[1];
    arm.elbow.rotation.z = q[2];
    arm.wrist.rotation.z = q[3];
  }
  // scoop centre from joint angles
  function armForward(q) {
    var a1 = q[1], a2 = a1 + q[2], a3 = a2 + q[3];
    var r = ARM.l1 * Math.cos(a1) + ARM.l2 * Math.cos(a2) + ARM.l3 * Math.cos(a3);
    var y = ARM.sh + ARM.l1 * Math.sin(a1) + ARM.l2 * Math.sin(a2) + ARM.l3 * Math.sin(a3);
    return new T.Vector3(r * Math.cos(q[0]), y, -r * Math.sin(q[0]));
  }
  // joint angles that put the level scoop at (x, y, z), then tip it forward by `tip` radians
  function armInverse(x, y, z, tip, yawNear) {
    var yaw = Math.atan2(-z, x);
    if (yawNear !== undefined) { while (yaw - yawNear > Math.PI) yaw -= TAU; while (yaw - yawNear < -Math.PI) yaw += TAU; }
    var r = Math.hypot(x, z) - ARM.l3, h = y - ARM.sh;
    var d = T.MathUtils.clamp(Math.hypot(r, h), Math.abs(ARM.l1 - ARM.l2) + 0.02, ARM.l1 + ARM.l2 - 0.02);
    var c2 = T.MathUtils.clamp((d * d - ARM.l1 * ARM.l1 - ARM.l2 * ARM.l2) / (2 * ARM.l1 * ARM.l2), -1, 1);
    var e = Math.acos(c2);                              // elbow up
    var a1 = Math.atan2(h, r) + Math.atan2(ARM.l2 * Math.sin(e), ARM.l1 + ARM.l2 * Math.cos(e));
    var a2 = -e;
    return [yaw, a1, a2, -(a1 + a2) - (tip || 0)];
  }
  // largest horizontal reach of the scoop at height y
  function armReach(y) {
    var h = y - ARM.sh, d = ARM.l1 + ARM.l2 - 0.06;
    return Math.sqrt(Math.max(0, d * d - h * h)) + ARM.l3;
  }



  function disposeTree(root3) {
    root3.traverse(function (o) {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) {
          if (m.map) m.map.dispose();
          m.dispose();
        });
      }
    });
  }

  function Tank3D(host) {
    this.host = host;
    this.viewport = host.querySelector('.tank3d__viewport');
    this.renderer = new T.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.setClearColor(0x081922, 0);
    this.canvas = this.renderer.domElement;
    this.viewport.appendChild(this.canvas);
    this.tagLayer = document.createElement('div');
    this.tagLayer.className = 'tank3d__tags';
    this.tagLayer.setAttribute('aria-hidden', 'true');
    this.viewport.appendChild(this.tagLayer);
    this.scene = new T.Scene();
    this.camera = new T.PerspectiveCamera(37, 1, 0.03, 85);
    this.feedCamera = new T.PerspectiveCamera(70, 16 / 9, 0.05, 60);
    this.target = new T.Vector3();
    this.cameraDirection = new T.Vector3();
    this.raycaster = new T.Raycaster();
    this.pointer = new T.Vector2();
    this.animate = true;
    this.time = 0;
    this.last = 0;
    this.dirty = true;
    this.fish = [];
    this.pellets = [];
    this.view = {};
    this.beam = 'idle';
    this.behaviour = 'normal';
    this.finish = 'black';
    this.showTags = false;
    this.armPhase = 'rest';
    this.lastFeedAt = 0;
    this.feed = null;
    this.scene.add(new T.HemisphereLight(0xd5edfc, 0x4d3c29, 2.0));
    this.light = new T.DirectionalLight(0xe4f6ff, 2.75);
    this.light.position.set(-2.5, 9, 4);
    this.scene.add(this.light);
    var fill = new T.DirectionalLight(0x8bb6c5, 1.10);
    fill.position.set(4, 4, -5);
    this.scene.add(fill);
    this.world = new T.Group();           // fish and pellets: kept when the tank is rebuilt
    this.scene.add(this.world);
    var seed = randomGenerator(9081);
    this.fishNote = { rng: seed };
    this.build('5');
    for (var i = 0; i < 10; i++) this.fish.push(makeFish(this.world, randomGenerator(500 + i * 17), i));
    this.pelletGeometry = new T.IcosahedronGeometry(0.038, 1);
    this.pelletMaterial = standard(0x9f6837, { flatShading: true });
    this.setCamera('reset');
    this.bindControls();
    new ResizeObserver(this.resize.bind(this)).observe(this.viewport);
    new IntersectionObserver(function (entries) {
      this.onScreen = entries[0].isIntersecting;
      this.dirty = true;
    }.bind(this)).observe(this.viewport);
    this.frame = this.frame.bind(this);
    root.requestAnimationFrame(this.frame);
  }

  // ---- building the tank for a chosen size ----
  Tank3D.prototype.build = function (size) {
    if (this.aquarium) { this.scene.remove(this.aquarium); disposeTree(this.aquarium); }
    this.size = String(size);
    setDims(dimsFor(this.size));
    this.dims = { W: W, H: H, D: D, SURFACE: SURFACE };
    var a = this.aquarium = new T.Group();
    this.scene.add(a);
    var rng = randomGenerator(42711);
    var kx = W / 8, kz = D / 3.8, ky = SURFACE / 3.63, ks = Math.cbrt(kx * kz * ky);
    var base = standard(0x18232a), frame = standard(0x26383d, { metalness: 0.58, roughness: 0.38 });
    var edge = new T.MeshBasicMaterial({ color: 0x84d0cb, transparent: true, opacity: 0.50 });
    var frosted = new T.MeshBasicMaterial({ color: 0x82cbd1, transparent: true, opacity: 0.081, depthWrite: false });
    this.waterBackdrop = new T.MeshBasicMaterial({ color: 0x103e44 });
    var meniscus = new T.MeshBasicMaterial({ color: 0x70b9c0, opacity: 0.44, transparent: true, depthWrite: false });
    box(a, [W + 0.14, 0.14, D + 0.14], frame, 0, -0.065, 0);
    box(a, [W + 0.39, 0.21, D + 0.36], base, 0, -0.23, 0);
    box(a, [W - 0.12, 0.68, D - 0.14], base, 0, -0.65, 0);
    box(a, [W - 0.32, 0.54, 0.055], standard(0x27343a), 0, -0.65, D / 2 - 0.055);
    box(a, [0.033, 0.53, 0.018], base, 0, -0.65, D / 2 - 0.022);
    [-1, 1].forEach(function (side) {
      box(a, [W, H, 0.025], frosted, 0, H / 2, side * D / 2).renderOrder = 4;
      box(a, [0.025, H, D], frosted, side * W / 2, H / 2, 0).renderOrder = 4;
      box(a, [W, 0.023, 0.030], edge, 0, H, side * D / 2);
      box(a, [0.030, 0.023, D], edge, side * W / 2, H, 0);
      box(a, [W - 0.025, 0.015, 0.010], meniscus, 0, SURFACE, side * (D / 2 - 0.015)).renderOrder = 5;
      box(a, [0.010, 0.015, D - 0.025], meniscus, side * (W / 2 - 0.015), SURFACE, 0).renderOrder = 5;
      for (var k = -1; k <= 1; k += 2) box(a, [0.029, H, 0.029], edge, side * W / 2, H / 2, k * D / 2);
    });
    mesh(a, new T.PlaneGeometry(W - 0.04, SURFACE), this.waterBackdrop, 0, SURFACE / 2, -D / 2 + 0.027);
    this.water = waterMaterial();
    var water = mesh(a, new T.PlaneGeometry(W - 0.025, D - 0.025, Math.round(54 * W / 8), Math.round(27 * D / 3.8)), this.water, 0, SURFACE, 0);
    water.rotation.x = -Math.PI / 2;
    water.renderOrder = 3;
    var gravel = makeGravel(a, rng);
    this.caustics = gravel.clock; this.bedDepth = gravel.depth; this.bed = gravel.bed; this.pebbles = gravel.pebbles;

    // hardscape, laid out in proportion to the tank. Stone and wood share a material so
    // that algae can tint them as the days go by.
    this.mats = { rock: standard(0xffffff, { vertexColors: true, flatShading: true }), wood: standard(0xffffff, { vertexColors: true, side: T.DoubleSide }) };
    var mats = this.mats;
    [[-2.70, 0.59, -0.87, 1.04, 0.66, 0.65], [-2.03, 0.44, 0.31, 0.76, 0.42, 0.58],
      [-2.99, 0.31, 0.83, 0.53, 0.30, 0.47], [-1.18, 0.28, -0.35, 0.73, 0.29, 0.44],
      [2.24, 0.83, -0.64, 0.76, 0.77, 0.61], [2.80, 0.53, 0.32, 0.70, 0.51, 0.53],
      [1.52, 0.43, -0.35, 0.76, 0.41, 0.45], [1.83, 0.24, 0.80, 0.42, 0.23, 0.34]
    ].forEach(function (r) {
      rock(a, rng, mats.rock, r[0] * kx, r[1] * ks, r[2] * kz, r[3] * ks, r[4] * ks, r[5] * ks);
    });
    function scaled(points) { return points.map(function (p) { return [p[0] * kx, p[1] * ky, p[2] * kz]; }); }
    wood(a, mats.wood, scaled([[-2.83, 0.34, 0.53], [-2.19, 0.78, 0.32], [-1.76, 1.37, -0.03], [-1.29, 1.84, -0.42], [-0.62, 2.15, -0.67]]), 0.43 * ks, 0.013);
    wood(a, mats.wood, scaled([[-2.07, 0.83, 0.29], [-1.53, 1.05, 0.54], [-0.84, 1.29, 0.56], [-0.35, 1.47, 0.36]]), 0.19 * ks, 0.006);
    wood(a, mats.wood, scaled([[-2.19, 0.76, 0.26], [-2.53, 1.16, -0.09], [-2.44, 1.67, -0.42], [-2.15, 1.96, -0.59]]), 0.16 * ks, 0.006);
    wood(a, mats.wood, scaled([[2.80, 0.34, -0.24], [2.50, 0.91, -0.35], [2.07, 1.29, -0.49], [1.48, 1.54, -0.77], [0.68, 1.64, -0.83]]), 0.45 * ks, 0.022);
    wood(a, mats.wood, scaled([[2.34, 0.92, -0.26], [1.80, 1.00, -0.05], [1.19, 0.98, 0.21], [0.78, 0.83, 0.37]]), 0.17 * ks, 0.006);
    wood(a, mats.wood, scaled([[2.05, 1.29, -0.44], [2.36, 1.84, -0.55], [2.64, 2.16, -0.69], [2.59, 2.43, -0.71]]), 0.18 * ks, 0.006);

    this.plants = [];
    var maxH = SURFACE - 0.55;
    var plantLayout = [
      [-3.40, -1.35, 2.9, 'ribbon'], [-2.87, -1.51, 2.65, 'ribbon'], [-2.36, -1.49, 2.58, 'fern'],
      [-1.53, -1.48, 2.05, 'red'], [-0.45, -1.56, 1.50, 'fern'], [0.26, -1.57, 1.83, 'red'],
      [1.11, -1.51, 2.26, 'red'], [1.68, -1.37, 2.65, 'fern'], [2.47, -1.47, 2.88, 'red'],
      [3.18, -1.34, 3.0, 'ribbon'], [3.43, -0.78, 2.4, 'ribbon'], [3.25, 0.65, 1.35, 'fern'],
      [-3.38, -0.32, 1.95, 'fern'], [-2.62, 0.77, 0.89, 'fern'], [1.19, 0.28, 0.83, 'fern'],
      [2.67, 0.60, 0.76, 'fern'], [-1.17, 0.42, 0.57, 'fern']
    ].map(function (p) { return [p[0] * kx, p[1] * kz, Math.min(maxH, p[2] * ky * 0.86), p[3]]; });
    var grass = Math.round(31 * kx * kz);
    for (var i = 0; i < grass; i++) {
      var side = i % 2 ? -1 : 1;
      plantLayout.push([side * (1.36 + rng() * 2.19) * kx, (0.56 + rng() * 1.14) * kz, (0.21 + rng() * 0.32) * ky, 'grass']);
    }
    plantLayout.forEach(function (p) {
      // plants sit well inside the glass; the vertex clamp in makePlant handles the leaf tips
      var x = Math.max(-(W / 2 - 0.45), Math.min(W / 2 - 0.45, p[0])), z = Math.max(-(D / 2 - 0.4), Math.min(D / 2 - 0.4, p[1]));
      this.plants.push(makePlant(a, rng, x, z, p[2], p[3]));
    }, this);

    // filter, heater, air stone
    var filter = standard(0x203337);
    var fx = -W / 2 + 0.5, fz = -D / 2 + 0.36;
    box(a, [0.65, 0.90, 0.49], filter, fx, SURFACE - 0.41, fz);
    box(a, [0.46, 0.07, 0.35], frame, fx, SURFACE + 0.04, fz + 0.21);
    tube(a, [[fx - 0.02, SURFACE - 0.44, fz + 0.08], [fx - 0.04, SURFACE * 0.72, fz + 0.16], [fx - 0.04, SURFACE * 0.34, fz + 0.16]], 0.067, frame, 8);
    for (i = 0; i < 5; i++) box(a, [0.17, 0.023, 0.13], base, fx - 0.04, SURFACE * 0.34 + i * 0.069, fz + 0.17);
    this.heater = new T.Group();
    this.heater.position.set(-W / 2 + 0.32, SURFACE * 0.55, -D * 0.03);
    a.add(this.heater);
    mesh(this.heater, new T.CylinderGeometry(0.096, 0.096, 1.26 * ky, 14), standard(0x713a2c, { emissive: 0x33120b }), 0, 0, 0);
    box(this.heater, [0.20, 0.19, 0.19], base, 0, 0.67 * ky, 0);
    this.airX = -W / 2 + 0.6; this.airZ = -D * 0.23;
    mesh(a, new T.CylinderGeometry(0.07, 0.09, 0.07, 10), standard(0x30393d), this.airX, 0.30, this.airZ);

    // the controller, fitted to this tank
    this.ctrl = buildController(this.dims, this.finish);
    this.ctrl.group.position.y = H;
    a.add(this.ctrl.group);
    this.panel = this.ctrl.panel;
    this.lightStrip = this.ctrl.lightStrip;
    this.ir = this.ctrl.ir;
    this.arm = this.ctrl.arm;
    this.resetArm();
    this.chute = this.ctrl.outlet.clone().add(new T.Vector3(0, H, 0));
    this.lens = this.ctrl.lens.clone().add(new T.Vector3(0, H, 0));
    this.buildCone();

    // probes hang from the colour-coded sockets
    this.probes = {};
    this.probeTips = [];
    var self = this, cable = standard(0x1a2326, { roughness: 0.6 });
    ['ph', 'temp', 'tds', 'turb'].forEach(function (name, index) {
      var px = W / 2 - 0.62 - index * 0.34, pz = D * (0.26 - index * 0.17), py = SURFACE * 0.60 + index * 0.13;
      var jack = self.ctrl.jacks[index];
      tube(a, [[jack.x, H + jack.y, jack.z], [jack.x + 0.1, H + 0.40, jack.z], [px, H + 0.20, pz],
        [px, SURFACE + 0.18, pz], [px, py + 0.26, pz]], 0.02, cable, 20);
      var tipMaterial = standard(index === 1 ? 0x98a3a4 : 0x45545a, { metalness: index === 1 ? 0.59 : 0.19 });
      self.probes[name] = tipMaterial;
      mesh(a, new T.CylinderGeometry(0.057, 0.051, 0.43, 12), tipMaterial, px, py, pz);
      self.probeTips.push(new T.Vector3(px, py, pz));
    });

    this.buildFilter(a);

    // dust, bubbles and the algae layers
    this.dust = makeDust(a, rng);
    this.bubbles = [];
    var bubbleMat = new T.MeshBasicMaterial({ color: 0xc6eeee, transparent: true, opacity: 0.48, depthWrite: false });
    var bubbleGeo = new T.SphereGeometry(1, 8, 6);
    for (i = 0; i < 32; i++) {
      var bubble = mesh(a, bubbleGeo, bubbleMat);
      bubble.scale.setScalar(0.012 + rng() * 0.026);
      this.bubbles.push({ mesh: bubble, speed: 0.31 + rng() * 0.31, phase: rng() * 9 });
    }
    this.algaeU = { amount: { value: 0 } };
    var algaeMat = new T.ShaderMaterial({
      transparent: true, depthWrite: false, side: T.DoubleSide, uniforms: this.algaeU,
      vertexShader: 'varying vec2 p; void main(){p=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader: 'varying vec2 p; uniform float amount; void main(){vec2 c=floor(p*vec2(160.,81.));float n=fract(sin(dot(c,vec2(12.9898,78.233)))*43758.5453);float edge=pow(abs(p.x-.5)*2.,4.);float spot=max(0., n-.87)*2.;float film=amount*.10;float spot2=max(0.,n-.80)*2.2;gl_FragColor=vec4(.22,.38,.10,min(.85,film+amount*(edge*.22+spot2*(.34+edge*.6))));}'
    });
    var front = mesh(a, new T.PlaneGeometry(W - 0.12, SURFACE - 0.15), algaeMat, 0, SURFACE / 2, D / 2 - 0.019);
    var rear = mesh(a, new T.PlaneGeometry(W - 0.12, SURFACE - 0.15), algaeMat, 0, SURFACE / 2, -D / 2 + 0.033);
    var left = mesh(a, new T.PlaneGeometry(D - 0.12, SURFACE - 0.15), algaeMat, -W / 2 + 0.019, SURFACE / 2, 0);
    var right = mesh(a, new T.PlaneGeometry(D - 0.12, SURFACE - 0.15), algaeMat, W / 2 - 0.019, SURFACE / 2, 0);
    left.rotation.y = Math.PI / 2; right.rotation.y = -Math.PI / 2;
    [front, rear, left, right].forEach(function (m) { m.renderOrder = 5; });
    // detritus on the gravel, and the film that gathers at the waterline
    var blobs = this.detritus = new T.InstancedMesh(new T.IcosahedronGeometry(1, 0), standard(0x4b3623, { roughness: 1, flatShading: true }), 520);
    var pose = new T.Object3D();
    for (i = 0; i < 520; i++) {
      var bx = (rng() - 0.5) * (W - 0.3), bz = (rng() - 0.5) * (D - 0.3), br = 0.06 + rng() * 0.14;
      pose.position.set(bx, this.bedDepth(bx, bz) + 0.045, bz);
      pose.rotation.set(0, rng() * 6, 0); pose.scale.set(br * 1.5, 0.018 + br * 0.09, br); pose.updateMatrix();
      blobs.setMatrixAt(i, pose.matrix);
    }
    blobs.count = 0;
    a.add(blobs);
    this.scum = new T.Group();
    this.scumMat = new T.MeshBasicMaterial({ color: 0x7c8b4c, transparent: true, opacity: 0, depthWrite: false });
    [[W - 0.1, 0.16, 0, D / 2 - 0.1], [W - 0.1, 0.16, 0, -D / 2 + 0.1]].forEach(function (s) {
      var m = mesh(self.scum, new T.PlaneGeometry(s[0], s[1]), self.scumMat, s[2], 0, s[3]); m.rotation.x = -Math.PI / 2;
    });
    [[0.16, D - 0.1, W / 2 - 0.1, 0], [0.16, D - 0.1, -W / 2 + 0.1, 0]].forEach(function (s) {
      var m = mesh(self.scum, new T.PlaneGeometry(s[0], s[1]), self.scumMat, s[2], 0, s[3]); m.rotation.x = -Math.PI / 2;
    });
    this.scum.position.y = SURFACE + 0.004;
    this.scum.renderOrder = 6;
    a.add(this.scum);
    this.fishBox = { x: W / 2 - 0.5, z0: -(D / 2 - 0.42), z1: D / 2 - 0.4, y0: 0.45, y1: SURFACE - 0.3 };
    this.buildTags();
    if (this.upkeep) this.applyUpkeep(this.upkeep);
    this.setFinish(this.finish);
    this.dirty = true;
  };

  Tank3D.prototype.buildCone = function () {
    var cone = this.ctrl.cone, lens = this.ctrl.lens, c = this.feedFov();
    while (cone.children.length) { var o = cone.children.pop(); disposeTree(o); }
    var floorY = -H + 0.2 - 0, fw = c.footW / 2, fd = c.footD / 2;
    var apex = [lens.x, lens.y, lens.z];
    var lz = lens.z, corners = [[-fw, floorY, lz - fd], [fw, floorY, lz - fd], [fw, floorY, lz + fd], [-fw, floorY, lz + fd]];
    var lines = [];
    corners.forEach(function (p, i) { lines.push(apex[0], apex[1], apex[2], p[0], p[1], p[2]); var q = corners[(i + 1) % 4]; lines.push(p[0], p[1], p[2], q[0], q[1], q[2]); });
    var lg = new T.BufferGeometry(); lg.setAttribute('position', new T.Float32BufferAttribute(lines, 3));
    cone.add(new T.LineSegments(lg, new T.LineBasicMaterial({ color: 0x6fd0ff, transparent: true, opacity: 0.55 })));
    var faces = [];
    corners.forEach(function (p, i) { var q = corners[(i + 1) % 4]; faces.push(apex[0], apex[1], apex[2], p[0], p[1], p[2], q[0], q[1], q[2]); });
    var fg = new T.BufferGeometry(); fg.setAttribute('position', new T.Float32BufferAttribute(faces, 3));
    var m = new T.Mesh(fg, new T.MeshBasicMaterial({ color: 0x6fd0ff, transparent: true, opacity: 0.06, side: T.DoubleSide, depthWrite: false, blending: T.AdditiveBlending }));
    m.renderOrder = 7; cone.add(m);
  };

  // One fixed lens for every tank (the controller is universal). The lens sits in air just
  // above the water, so refraction at the surface narrows the view under water (Snell's law).
  // Together with the lens being behind the housing, that leaves blind spots near the surface
  // at the ends and sides. The feed camera is set to the coverage the lens has at the floor.
  var LENS = { hfovAir: 120, aspect: 4 / 3, n: 1.333 };   // proposed wide lens, illustrative
  Tank3D.prototype.feedFov = function () {
    var hA = T.MathUtils.degToRad(LENS.hfovAir / 2), vA = Math.atan(Math.tan(hA) / LENS.aspect);
    var hW = Math.asin(Math.sin(hA) / LENS.n), vW = Math.asin(Math.sin(vA) / LENS.n);
    var lens = this.ctrl.lens, air = Math.max(0.02, lens.y + 0.27), depth = SURFACE - 0.2;
    var footW = 2 * (air * Math.tan(hA) + depth * Math.tan(hW)), footD = 2 * (air * Math.tan(vA) + depth * Math.tan(vW));
    var nearW = 2 * (air * Math.tan(hA) + 0.4 * Math.tan(hW)), nearD = 2 * (air * Math.tan(vA) + 0.4 * Math.tan(vW));
    function share(fw, fd) {
      var x = Math.max(0, Math.min(fw / 2, W / 2) * 2), z0 = Math.max(-D / 2, lens.z - fd / 2), z1 = Math.min(D / 2, lens.z + fd / 2);
      return Math.min(1, x / W) * Math.max(0, z1 - z0) / D;
    }
    return { aspect: footW / footD, fov: T.MathUtils.radToDeg(2 * Math.atan(footD / 2 / (air + depth))), footW: footW, footD: footD,
      hfov: LENS.hfovAir, hfovWater: T.MathUtils.radToDeg(2 * hW), floorSeen: share(footW, footD), surfaceSeen: share(nearW, nearD) };
  };
  Tank3D.prototype.aimFeedCamera = function () {
    var c = this.feedFov(), cam = this.feedCamera;
    cam.fov = c.fov; cam.aspect = c.aspect; cam.updateProjectionMatrix();
    cam.position.copy(this.lens); cam.up.set(0, 0, -1); cam.lookAt(this.lens.x, 0, this.lens.z); cam.updateMatrixWorld();
    return c;
  };
  // true when a point is inside what the top camera can see (rocks and plants not modelled)
  Tank3D.prototype.inCameraView = function (x, y, z) {
    var v = new T.Vector3(x, y, z).project(this.feedCamera);
    return v.z < 1 && Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1;
  };

  Tank3D.prototype.buildTags = function () {
    this.tagLayer.textContent = '';
    this.tags = [];
    var self = this;
    var items = this.ctrl.labels.map(function (l) { return [l[0], l[1].clone().add(new T.Vector3(0, H, 0))]; });
    items.push(['Probes', this.probeTips[1].clone().add(new T.Vector3(0, 0.3, 0))]);
    if (this.filt) this.filt.labels.forEach(function (l) { items.push([l[0], l[1], true]); });
    items.forEach(function (it) {
      var el = document.createElement('span');
      el.className = 'tank3d__tag' + (it[2] ? ' tank3d__tag--filter' : ''); el.textContent = it[0];
      self.tagLayer.appendChild(el);
      self.tags.push({ el: el, pos: it[1], filter: !!it[2] });
    });
    this.setTags(this.showTags);
  };

  Tank3D.prototype.setTags = function (on) {
    this.showTags = !!on;
    var fOn = !!(this.filt && this.filt.group.visible);
    this.tags.forEach(function (t) { t.el.hidden = !on || (t.filter && !fOn); });
    this.dirty = true;
  };

  // ---- mechanical filter (proposal): external unit beside the tank, tubes over the back rim ----
  Tank3D.prototype.buildFilter = function (a) {
    var g = new T.Group(), self = this;
    var V3 = function (p) { return new T.Vector3().fromArray(p); };
    var bw = 11 * CM, bd = 10 * CM, bh = Math.min(24 * CM, H * 0.86);
    var bx = W / 2 + 0.5 + bw / 2, bz = -D / 2 + bd / 2 + 0.05, by = -0.125;
    var shell = standard(0x1d3342, { metalness: 0.3, roughness: 0.45 });
    var trim = standard(0x2b6f9e, { metalness: 0.35, roughness: 0.3 });
    var dark = standard(0x111b22, { roughness: 0.6 });
    var baseMat = standard(0x18232a);
    // plinth from the floor, matching the aquarium stand
    box(g, [bw + 0.3, 0.86, bd + 0.3], baseMat, bx, -0.56, bz);
    box(g, [bw + 0.36, 0.06, bd + 0.36], standard(0x26383d, { metalness: 0.5, roughness: 0.4 }), bx, -0.15, bz);
    // housing: back, sides, base, lid; front is a clear window
    box(g, [bw, bh, 0.06], shell, bx, by + bh / 2, bz - bd / 2 + 0.03);
    box(g, [0.07, bh, bd], shell, bx - bw / 2 + 0.035, by + bh / 2, bz);
    box(g, [0.07, bh, bd], shell, bx + bw / 2 - 0.035, by + bh / 2, bz);
    box(g, [bw, 0.1, bd], shell, bx, by + 0.05, bz);
    box(g, [bw + 0.08, 0.16, bd + 0.08], trim, bx, by + bh + 0.08, bz);
    box(g, [bw * 0.42, 0.07, 0.16], dark, bx, by + bh + 0.19, bz);                               // lid handle
    box(g, [0.05, bh - 0.05, 0.05], trim, bx - bw / 2 + 0.03, by + bh / 2, bz + bd / 2 - 0.03);  // front corner posts
    box(g, [0.05, bh - 0.05, 0.05], trim, bx + bw / 2 - 0.03, by + bh / 2, bz + bd / 2 - 0.03);
    var glassF = mesh(g, new T.PlaneGeometry(bw - 0.1, bh - 0.12), new T.MeshBasicMaterial({ color: 0xa8d8ec, transparent: true, opacity: 0.12, depthWrite: false }), bx, by + bh / 2, bz + bd / 2);
    glassF.renderOrder = 8;
    // water inside the unit
    var wl = by + bh * 0.9;
    var wat = box(g, [bw - 0.16, wl - by - 0.12, bd - 0.14], new T.MeshBasicMaterial({ color: 0x3f9fc6, transparent: true, opacity: 0.16, depthWrite: false }), bx, (wl + by + 0.1) / 2, bz);
    wat.renderOrder = 7;
    // sponge (upper chamber) on a perforated tray; colour follows load
    var trayY = by + bh * 0.38;
    box(g, [bw - 0.16, 0.05, bd - 0.16], standard(0x5b6b74, { metalness: 0.4, wireframe: false }), bx, trayY, bz);
    var pore = document.createElement('canvas'); pore.width = pore.height = 64;
    var pc = pore.getContext('2d'); pc.fillStyle = '#fff'; pc.fillRect(0, 0, 64, 64);
    var prng = randomGenerator(3311);
    for (var q = 0; q < 260; q++) { pc.fillStyle = 'rgba(0,0,0,' + (0.08 + prng() * 0.22).toFixed(2) + ')'; pc.beginPath(); pc.arc(prng() * 64, prng() * 64, 0.6 + prng() * 1.8, 0, TAU); pc.fill(); }
    var poreTex = new T.CanvasTexture(pore); poreTex.wrapS = poreTex.wrapT = T.RepeatWrapping; poreTex.repeat.set(2, 3);
    this.filtSpongeMat = standard(0xe7d48c, { roughness: 1, map: poreTex });
    var spH = bh * 0.42;
    box(g, [bw - 0.3, spH, bd - 0.32], this.filtSpongeMat, bx - 0.04, trayY + 0.03 + spH / 2, bz - 0.02);
    // pump chamber: volute, motor can and an impeller (hub + rim + six curved blades)
    var pumpY = by + bh * 0.19;
    mesh(g, new T.CylinderGeometry(bd * 0.24, bd * 0.24, 0.5, 24), dark, bx - 0.1, pumpY, bz - 0.18).rotation.x = Math.PI / 2;
    var imp = this.filtImpeller = new T.Group(), bladeMat = standard(0xcfe9f5, { roughness: 0.35 });
    mesh(imp, new T.CylinderGeometry(0.07, 0.07, 0.08, 16), trim, 0, 0, 0).rotation.x = Math.PI / 2;
    mesh(imp, new T.TorusGeometry(bd * 0.2, 0.018, 8, 32), bladeMat, 0, 0, -0.02);
    for (var bI = 0; bI < 6; bI++) {
      var bl = box(imp, [bd * 0.17, 0.035, 0.05], bladeMat, 0, 0, 0);
      var ang = bI * TAU / 6;
      bl.position.set(Math.cos(ang) * bd * 0.1, Math.sin(ang) * bd * 0.1, 0);
      bl.rotation.z = ang + 0.55;
    }
    imp.position.set(bx - 0.1, pumpY, bz + bd / 2 - 0.12);
    g.add(imp);
    mesh(g, new T.TorusGeometry(bd * 0.235, 0.025, 8, 32), shell, bx - 0.1, pumpY, bz + bd / 2 - 0.1);   // volute ring
    // riser: pump outlet up the back corner to the lid outlet
    var rx = bx + bw / 2 - 0.22, rz = bz - bd / 2 + 0.22, top = by + bh + 0.16;
    var riser = new T.CatmullRomCurve3([[bx - 0.1 + bd * 0.24, pumpY, bz - 0.18], [rx, pumpY, rz], [rx, by + bh * 0.6, rz], [rx, top, rz]].map(V3));
    mesh(g, new T.TubeGeometry(riser, 30, 0.06, 10, false), standard(0x8fb8c8, { transparent: true, opacity: 0.55, roughness: 0.2 }));
    // lid fittings: inlet (front left) and outlet (back right)
    var inX = bx - bw * 0.26, inZ = bz + 0.05;
    [[inX, inZ], [rx, rz]].forEach(function (f) {
      mesh(g, new T.CylinderGeometry(0.1, 0.11, 0.16, 16), dark, f[0], top + 0.06, f[1]);
      mesh(g, new T.CylinderGeometry(0.115, 0.115, 0.04, 16), trim, f[0], top + 0.15, f[1]);
    });
    // on-unit status display (flow, sponge, state)
    var dc = document.createElement('canvas'); dc.width = 256; dc.height = 128;
    var dTex = new T.CanvasTexture(dc); dTex.anisotropy = 4;
    var dW = bw * 0.62, dH = dW / 2;
    box(g, [dW + 0.08, dH + 0.08, 0.04], dark, bx, by + bh - dH / 2 - 0.16, bz + bd / 2 + 0.03);
    mesh(g, new T.PlaneGeometry(dW, dH), new T.MeshBasicMaterial({ map: dTex }), bx, by + bh - dH / 2 - 0.16, bz + bd / 2 + 0.055);
    this.filtLed = mesh(g, new T.SphereGeometry(0.055, 12, 8), new T.MeshBasicMaterial({ color: 0x354438 }), bx + bw / 2 - 0.16, by + bh - 0.12, bz + bd / 2 + 0.04);
    // tubes over the back rim
    var xI = W / 2 - 1.1, xR = W / 2 - 0.42, zT = -D / 2 + 0.22, over = H + 0.48;
    var intake = new T.CatmullRomCurve3([[xI, 0.55, zT], [xI, SURFACE - 0.3, zT], [xI, H + 0.3, zT], [xI + 0.12, over, zT], [W / 2 + 0.25, over + 0.04, zT],
      [inX - 0.1, over + 0.02, inZ - 0.1], [inX, top + 0.4, inZ], [inX, top + 0.15, inZ]].map(V3));
    var ret = new T.CatmullRomCurve3([[rx, top + 0.15, rz], [rx, top + 0.4, rz], [rx - 0.1, over + 0.12, rz], [W / 2 + 0.25, over + 0.14, zT + 0.14],
      [xR + 0.12, over + 0.08, zT + 0.14], [xR, H + 0.3, zT + 0.14], [xR, SURFACE - 0.12, zT + 0.14], [xR, SURFACE - 0.14, zT + 0.42]].map(V3));
    var tubeMat = new T.MeshStandardMaterial({ color: 0x9ccfe0, transparent: true, opacity: 0.4, roughness: 0.2, depthWrite: false });
    [intake, ret].forEach(function (c) { var m = mesh(g, new T.TubeGeometry(c, 70, 0.065, 10, false), tubeMat); m.renderOrder = 6; });
    // intake strainer in the tank, and the return spout
    mesh(g, new T.CylinderGeometry(0.12, 0.12, 0.55, 14, 1, true), standard(0x30424c, { wireframe: true }), xI, 0.5, zT);
    mesh(g, new T.CylinderGeometry(0.1, 0.1, 0.06, 14), trim, xI, 0.22, zT);
    mesh(g, new T.CylinderGeometry(0.075, 0.09, 0.12, 12), trim, xR, SURFACE - 0.14, zT + 0.42).rotation.x = Math.PI / 2;
    // the path water takes inside the unit: down through the sponge to the pump
    var inner = new T.CatmullRomCurve3([[inX, top, inZ], [inX, wl, inZ], [bx - 0.05, trayY + spH * 0.7, bz], [bx - 0.05, trayY + 0.05, bz + 0.05],
      [bx - 0.1, pumpY + 0.25, bz + 0.1], [bx - 0.1, pumpY, bz + 0.12]].map(V3));
    // flow particles: tank -> intake -> sponge -> pump -> riser -> return -> tank
    var pg = new T.SphereGeometry(0.034, 6, 5), pm = new T.MeshBasicMaterial({ color: 0x6fe0ff });
    var dirtM = new T.MeshBasicMaterial({ color: 0xb08a52 });
    var parts = [];
    [[intake, 16, pm], [inner, 10, dirtM], [riser, 7, pm], [ret, 16, pm]].forEach(function (c) { for (var n = 0; n < c[1]; n++) parts.push({ c: c[0], u: n / c[1], m: mesh(g, pg, c[2], 0, 0, 0) }); });
    var jet = [], jm = new T.MeshBasicMaterial({ color: 0xd8f6ff, transparent: true, opacity: 0.55, depthWrite: false });
    for (var jI = 0; jI < 12; jI++) jet.push({ u: jI / 12, m: mesh(g, pg, jm, 0, 0, 0) });
    this.filt = {
      extra: 2 * (bx + bw / 2 + 0.15 - W / 2), center: new T.Vector3(bx, by + bh / 2, bz),
      group: g, parts: parts, jet: jet, spout: new T.Vector3(xR, SURFACE - 0.14, zT + 0.5), dir: new T.Vector3(-0.15, -0.12, 1).normalize(), spin: 0,
      disp: { canvas: dc, tex: dTex, sig: '' },
      labels: [['Filter unit (proposal)', new T.Vector3(bx, by + bh + 0.55, bz)], ['Sponge', new T.Vector3(bx - bw / 2 + 0.1, trayY + spH * 0.6, bz + bd / 2)],
        ['Pump', new T.Vector3(bx - bw / 2 + 0.1, pumpY, bz + bd / 2)], ['Intake strainer (in tank)', new T.Vector3(xI, 0.8, zT)], ['Return', new T.Vector3(xR, SURFACE + 0.05, zT + 0.45)]]
    };
    g.visible = !!(this.filtView && this.filtView.enabled);
    a.add(g);
    this.drawFilterDisplay();
    this.placeFilterParts(0);
  };
  Tank3D.prototype.drawFilterDisplay = function () {
    var f = this.filt, v = this.filtView;
    if (!f) return;
    var st = v ? v.state : 'OFF', flow = v ? Math.round(v.flow) : 0, cond = v ? Math.round((1 - v.load) * 100) : 100;
    var sig = st + '|' + flow + '|' + cond;
    if (sig === f.disp.sig) return;
    f.disp.sig = sig;
    var c = f.disp.canvas.getContext('2d');
    c.fillStyle = '#071318'; c.fillRect(0, 0, 256, 128);
    var col = st === 'RUNNING' ? '#9cec7c' : st === 'FAULT' ? '#ff6852' : (st === 'WARNING' || st === 'STARTING') ? '#ffc262' : '#5d6e74';
    c.fillStyle = col; c.font = '700 26px monospace'; c.textBaseline = 'top';
    c.fillText(st, 14, 10);
    c.fillStyle = '#d9f3fb'; c.font = '700 34px monospace';
    c.fillText(('   ' + flow).slice(-3) + ' L/h', 14, 44);
    c.font = '600 24px monospace'; c.fillStyle = '#9ec5d2';
    c.fillText('SPONGE ' + cond + '%', 14, 88);
    c.fillStyle = '#1f3a45'; c.fillRect(196, 92, 46, 20);
    c.fillStyle = cond > 40 ? '#4fb0de' : '#d9822b'; c.fillRect(198, 94, Math.round(42 * cond / 100), 16);
    f.disp.tex.needsUpdate = true;
  };
  Tank3D.prototype.placeFilterParts = function (dt) {
    var f = this.filt, v = this.filtView;
    if (!f) return;
    var frac = v && v.enabled && v.flowMax > 0 ? Math.max(0, v.flow / v.flowMax) : 0;
    var moving = frac > 0.002;
    f.spin += dt * 40 * frac;
    this.filtImpeller.rotation.z = f.spin;
    f.parts.forEach(function (p) {
      p.u = (p.u + dt * 0.55 * frac) % 1;
      p.m.visible = moving;
      if (moving) p.m.position.copy(p.c.getPointAt(p.u));
    });
    var sp = f.spout, d = f.dir;
    f.jet.forEach(function (q, i) {
      q.u = (q.u + dt * 1.1 * frac) % 1;
      q.m.visible = moving;
      if (moving) { var r = q.u * (0.25 + 1.4 * frac); q.m.position.set(sp.x + d.x * r + Math.sin(i * 2.3) * 0.04 * q.u, sp.y + d.y * r * 0.6, sp.z + d.z * r); q.m.scale.setScalar(1 + q.u * 1.6); }
    });
  };

  Tank3D.prototype.setCone = function (on) { this.ctrl.cone.visible = !!on; this.dirty = true; };
  Tank3D.prototype.setFinish = function (name) {
    this.finish = FINISH[name] ? name : 'black';
    var f = FINISH[this.finish], m = this.ctrl.finishMats;
    m.body.color.setHex(f.body); m.top.color.setHex(f.top); m.rail.color.setHex(f.rail); m.leg.color.setHex(f.leg);
    this.dirty = true;
  };
  Tank3D.prototype.setBehaviour = function (mode) { this.behaviour = mode; this.dirty = true; };

  Tank3D.prototype.applyUpkeep = function (u) {
    this.upkeep = u;
    var g = Math.min(1, (u.decor || 0) * 0.85), p = Math.min(1, (u.probes || 0) * 0.9), d = Math.min(1, u.detritus || 0);
    this.algaeU.amount.value = u.glass || 0;
    this.mats.rock.color.setRGB(1 - 0.66 * g, 1 - 0.16 * g, 1 - 0.80 * g);
    this.mats.wood.color.setRGB(1 - 0.52 * g, 1 - 0.10 * g, 1 - 0.70 * g);
    for (var k in this.probes) {
      var base = k === 'temp' ? 0x98a3a4 : 0x45545a;
      this.probes[k].color.setHex(base).lerp(new T.Color(0x586b2c), p * 0.75);
    }
    this.detritus.count = Math.round(d * 520);
    this.bed.color.setRGB(1 - 0.30 * d, 1 - 0.27 * d, 1 - 0.44 * d);
    this.pebbles.material.color.setRGB(1 - 0.24 * d, 1 - 0.22 * d, 1 - 0.38 * d);
    this.scumMat.opacity = Math.min(0.62, Math.max(d, u.glass || 0) * 0.7);
    this.haze = Math.min(1, ((u.glass || 0) + (u.detritus || 0)) / 2);
    this.dirty = true;
  };

  // ---- camera ----
  Tank3D.prototype.resize = function () {
    var width = this.viewport.clientWidth, height = this.viewport.clientHeight;
    if (!width || !height) return;
    this.pixelRatio = Math.min(root.devicePixelRatio || 1, width < 650 ? 1.35 : 1.6);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.dirty = true;
  };

  Tank3D.prototype.presetFor = function (name) {
    var cy = (H + 1.5) / 2, fx = FEED.armX, fz = this.ctrl ? this.ctrl.headZ : 0;
    var ex = this.filtExtra() / 2, fc = this.filt ? this.filt.center : new T.Vector3(W / 2 + 1.5, H * 0.45, -D / 2 + 1);
    var presets = {
      reset: [0.17, 0.19, 1, ex, cy, 0],
      front: [0, 0.075, 0.96, ex, cy, 0],
      filter: [0.3, 0.16, 0.5, fc.x - 1.1, fc.y + 0.2, fc.z + 0.4],
      surface: [0.22, 0.86, 0.74, 0, SURFACE * 0.78, 0],
      fish: [-0.16, 0.10, 0.55, -W * 0.03, SURFACE * 0.5, D * 0.12],
      feeder: [2.55, 0.5, 0.62, fx, H + 0.1, fz - 0.9],
      controller: [0.3, 0.2, 0.5, 0, H + 0.6, fz * 0.6],
      top: [0, 1.36, 0.82, 0, H * 0.5, 0]
    };
    return presets[name] || presets.reset;
  };

  Tank3D.prototype.setCamera = function (preset) {
    var p = this.presetFor(preset);
    this.yaw = p[0]; this.pitch = p[1]; this.zoom = p[2];
    this.target.set(p[3], p[4], p[5]);
    this.dirty = true;
  };

  Tank3D.prototype.filtExtra = function () { return this.filt && this.filt.group.visible ? this.filt.extra : 0; };
  Tank3D.prototype.cameraDistance = function () {
    var aspect = this.camera.aspect;
    var widthDistance = 2.15 * (W + 0.7 + this.filtExtra()) / Math.max(0.8, aspect);
    var heightDistance = (H + 2.7) / (2 * Math.tan(T.MathUtils.degToRad(this.camera.fov / 2)) * 0.9);
    return T.MathUtils.clamp(Math.max(9.6, widthDistance, heightDistance) * this.zoom, 2.2, 48);
  };

  Tank3D.prototype.positionCamera = function () {
    var radius = this.cameraDistance();
    this.camera.position.copy(this.target).add(this.cameraDirection.set(
      Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      Math.cos(this.yaw) * Math.cos(this.pitch)
    ).multiplyScalar(radius));
    this.camera.lookAt(this.target);
    this.camera.updateMatrixWorld();
  };

  Tank3D.prototype.move = function (x, y, pan) {
    if (pan) {
      var scale = 0.668 * this.cameraDistance() / Math.max(1, this.viewport.clientHeight);
      var right = new T.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0);
      var up = new T.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 1);
      this.target.addScaledVector(right, -x * scale).addScaledVector(up, y * scale);
      this.target.clamp(new T.Vector3(-(W / 2 + 0.6), -0.5, -(D / 2 + 0.6)), new T.Vector3(W / 2 + 0.6, H + 2.6, D / 2 + 0.6));
    } else {
      this.yaw -= x * 0.007;
      this.pitch = T.MathUtils.clamp(this.pitch + y * 0.007, -0.21, 1.4);
    }
    this.dirty = true;
  };

  Tank3D.prototype.zoomBy = function (factor) {
    this.zoom = T.MathUtils.clamp(this.zoom * factor, 0.2, 2.4);
    this.dirty = true;
  };

  Tank3D.prototype.bindControls = function () {
    var self = this, viewport = this.viewport, pointers = new Map();
    var drag = null, moved = false, panMode = false;
    var panButton = this.host.querySelector('[data-camera="pan"]');
    this.host.addEventListener('click', function (event) {
      var button = event.target.closest('[data-camera]');
      if (!button) return;
      var action = button.dataset.camera;
      if (action === 'in' || action === 'out') {
        self.zoomBy(action === 'in' ? 0.80 : 1.25);
      } else if (action === 'pan') {
        panMode = !panMode;
        panButton.setAttribute('aria-pressed', String(panMode));
        viewport.classList.toggle('is-panning', panMode);
      } else if (action === 'button') {
        self.pulseButton();
        self.buttonHandler();
      } else {
        self.setCamera(action);
        self.host.querySelector('select').value = action === 'reset' ? 'reset' : action;
      }
    });
    this.host.querySelector('select').addEventListener('change', function (event) {
      self.setCamera(event.target.value);
    });
    viewport.addEventListener('contextmenu', function (event) { event.preventDefault(); });
    viewport.addEventListener('wheel', function (event) {
      event.preventDefault();
      var amount = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 480 : 1);
      self.zoomBy(Math.exp(T.MathUtils.clamp(amount * 0.0013, -0.42, 0.42)));
    }, { passive: false });
    viewport.addEventListener('pointerdown', function (event) {
      if (event.button > 2) return;
      viewport.focus({ preventScroll: true });
      viewport.setPointerCapture(event.pointerId);
      pointers.set(event.pointerId, [event.clientX, event.clientY]);
      if (pointers.size === 1) {
        moved = false;
        drag = { x: event.clientX, y: event.clientY, pan: event.button !== 0 };
      } else {
        moved = true;
      }
    });
    viewport.addEventListener('pointermove', function (event) {
      if (!pointers.has(event.pointerId)) return;
      var previous = pointers.get(event.pointerId), next = [event.clientX, event.clientY];
      pointers.set(event.pointerId, next);
      if (pointers.size > 1) {
        var other;
        for (var entry of pointers) {
          if (entry[0] !== event.pointerId) { other = entry[1]; break; }
        }
        var before = Math.hypot(previous[0] - other[0], previous[1] - other[1]);
        var after = Math.hypot(next[0] - other[0], next[1] - other[1]);
        self.zoomBy(Math.max(8, before) / Math.max(8, after));
        self.move((next[0] - previous[0]) / 2, (next[1] - previous[1]) / 2, true);
      } else if (drag) {
        if (Math.hypot(next[0] - drag.x, next[1] - drag.y) > 5) moved = true;
        self.move(next[0] - previous[0], next[1] - previous[1], panMode || drag.pan || event.shiftKey);
      }
    });
    function release(event) {
      if (!pointers.has(event.pointerId)) return;
      pointers.delete(event.pointerId);
      if (!pointers.size) {
        if (event.type === 'pointerup' && !moved && drag && event.button === 0 && self.buttonHit(event)) {
          self.pulseButton();
          self.buttonHandler();
        }
        drag = null;
      } else {
        var point = pointers.values().next().value;
        drag = { x: point[0], y: point[1], pan: false };
      }
    }
    viewport.addEventListener('pointerup', release);
    viewport.addEventListener('pointercancel', release);
    viewport.addEventListener('lostpointercapture', release);
    viewport.addEventListener('keydown', function (event) {
      var keys = { ArrowLeft: [-24, 0], ArrowRight: [24, 0], ArrowUp: [0, -24], ArrowDown: [0, 24] };
      if (keys[event.key]) {
        self.move(keys[event.key][0], keys[event.key][1], panMode || event.shiftKey);
      } else if (event.key === '+' || event.key === '=') self.zoomBy(0.82);
      else if (event.key === '-') self.zoomBy(1.22);
      else if (event.key === 'Home') self.host.querySelector('[data-camera="reset"]').click();
      else return;
      event.preventDefault();
    });
  };

  Tank3D.prototype.buttonHit = function (event) {
    var rect = this.canvas.getBoundingClientRect();
    this.pointer.set(2 * (event.clientX - rect.left) / rect.width - 1, 1 - 2 * (event.clientY - rect.top) / rect.height);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    var button = this.panel.button;
    // The button only responds when the camera is on the panel's front side.
    return this.camera.position.z > button.getWorldPosition(new T.Vector3()).z &&
      this.raycaster.intersectObject(button, false).length > 0;
  };
  Tank3D.prototype.render = function (size, fishCount) {
    if (String(size) !== this.size) {
      this.build(size);
      this.setCamera(this.host.querySelector('select').value || 'reset');
      this.fish.forEach(function (f) { f.initialized = false; });
      this.sizeChangedAt = performance.now();
      if (this.onFit) this.onFit(this.dims, this.size);
    }
    this.fish.forEach(function (fish, index) { fish.node.visible = index < fishCount; });
    this.clearPellets();
    this.beam = 'idle';
    this.beamUntil = 0;
    this.resetArm();
    this.dirty = true;
  };

  Tank3D.prototype.setAnimate = function (on) {
    this.animate = on;
    if (!on) this.clearPellets();
    this.dirty = true;
  };

  Tank3D.prototype.pulseButton = function () {
    this.pulseUntil = performance.now() + 240;
    this.dirty = true;
  };

  Tank3D.prototype.update = function (state) {
    this.view = state;
    this.panel.draw(state.lcd, state.power);
    this.heater.visible = state.heater;
    var turbidity = T.MathUtils.clamp((state.turb - 5) / 95, 0, 1);
    this.water.uniforms.turbidity.value = turbidity;
    this.waterBackdrop.color.set(0x103e44).lerp(new T.Color(0x2a5a3a), (this.haze || 0) * 0.45).lerp(new T.Color(0x665435), turbidity * 0.86);
    var dust = this.dust;
    dust.mesh.geometry.setDrawRange(0, Math.round(dust.count * (0.10 + turbidity * 0.90)));
    dust.mesh.material.color.set(0xc8e1dc).lerp(new T.Color(0xbe9e6d), turbidity);
    dust.mesh.material.size = 0.019 + turbidity * 0.024;
    if (state.upkeep) this.applyUpkeep(state.upkeep);
    this.filtView = state.filter || null;
    if (this.filt) {
      var fv = this.filtView, fon = !!(fv && fv.enabled);
      if (this.filt.group.visible !== fon) {
        this.filt.group.visible = fon; this.setTags(this.showTags);
        var sel = this.host.querySelector('select');
        if (sel && (sel.value === 'reset' || sel.value === 'front' || sel.value === 'filter')) { if (!fon && sel.value === 'filter') sel.value = 'reset'; this.setCamera(sel.value); }
      }
      if (fon) {
        this.filtSpongeMat.color.set(0xe7d48c).lerp(new T.Color(0x4f3b24), Math.min(1, fv.load * 1.1));
        this.filtLed.material.color.setHex(fv.state === 'RUNNING' ? 0x9cec7c : fv.state === 'FAULT' ? 0xff6852 : (fv.state === 'WARNING' || fv.state === 'STARTING') ? 0xffc262 : 0x354438);
        this.drawFilterDisplay();
        this.placeFilterParts(0);
      }
    }
    this.light.intensity = state.power === 'off' ? 0.65 : 2.75;
    var lit = state.power === 'off' ? 0x29343c : 0xffe2a8;
    this.lightStrip.color.setHex(lit);
    this.ctrl.glow.visible = state.power !== 'off';
    Object.keys(this.probes).forEach(function (name) {
      this.probes[name].emissive.setHex(state.probes[name] === 'ok' ? 0x000000 : 0x731a13);
    }, this);
    this.dirty = true;
  };

  Tank3D.prototype.clearPellets = function () {
    this.pellets.forEach(function (pellet) { pellet.removeFromParent(); });
    this.pellets.length = 0;
  };

  // ---- camera-guided feeding with a servo-driven mini arm ----
  // The tank button still decides WHETHER to feed (simulation logic). The top camera only
  // picks WHERE: the scoop is carried over the spot where the fish are, inside the arm's
  // reach and behind the housing. Pellets then fall, float and sink under simple physics.
  var SERVO = { kp: 170, kd: 23, vmax: 5.5 };     // stiffness, damping, rad/s limit (illustrative)
  var G = 9.81 * 100 * INCH / 2.54;              // gravity in scene units per s^2
  var SINK = 1.4 * INCH / 2.54;                  // pellet sinking speed, about 1.4 cm/s (illustrative)

  Tank3D.prototype.resetArm = function () {
    this.servo = ARM.rest.map(function (q) { return { q: q, v: 0, t: q }; });
    this.fd = { phase: 'rest', t: 0, outcome: null, queue: 0, tip: 0, released: 0, jam: false };
    this.armPhase = 'rest';
    if (this.arm) { this.arm.load.visible = false; setArmJoints(this.arm, ARM.rest); }
  };

  // camera step: where are the fish, and where can the arm drop food near them?
  Tank3D.prototype.chooseFeedSpot = function () {
    this.aimFeedCamera();
    var self = this, fish = this.fishStates().filter(function (f) { return self.inCameraView(f.x, f.y, f.z); }), n = fish.length, cx = 0, cz = 0;
    fish.forEach(function (f) { cx += f.x; cz += f.z; });
    var hz = this.ctrl.headZ, yDrop = -TOP + 0.3, reach = armReach(yDrop) - 0.08;
    var dx = n ? cx / n : 0, dz = n ? cz / n - hz : -1.3, zMax = -(HEAD.d / 2 + 0.28), clamped = false;
    if (dz > zMax) { dz = zMax; clamped = true; }
    var r = Math.hypot(dx, dz);
    if (r > reach) { dx *= reach / r; dz *= reach / r; clamped = true; }
    if (dz > zMax) { dz = zMax; dx = Math.sign(dx || 1) * Math.sqrt(Math.max(0, reach * reach - dz * dz)) * 0.98; }
    var xLim = W / 2 - 0.4, zMin = -D / 2 + 0.4 - hz;
    if (Math.abs(dx) > xLim) { dx = Math.sign(dx) * xLim; clamped = true; }
    if (dz < zMin) { dz = zMin; clamped = true; }
    var spot = new T.Vector3(dx, SURFACE, hz + dz), near = 0;
    fish.forEach(function (f) { if (Math.hypot(f.x - spot.x, f.z - spot.z) < 1.4) near++; });
    this.feedSpot = spot;
    this.feedPlan = { fish: n, near: near, clamped: clamped, at: performance.now(),
      local: new T.Vector3(dx - FEED.armX, yDrop, dz) };
    return spot;
  };

  Tank3D.prototype.dispense = function (phase, outcome) {
    var fd = this.fd;
    if (phase === 'start') {
      if (fd.phase === 'rest') {
        this.chooseFeedSpot();
        fd.phase = 'toHopper'; fd.t = 0; fd.outcome = null; fd.tip = 0; fd.released = 0; fd.jam = false;
        this.beam = 'active'; this.beamUntil = 0;
      } else fd.queue = Math.min(2, fd.queue + 1);
    }
    if (phase === 'chute') fd.outcome = outcome;     // the arm acts on it when it gets there
    this.armPhase = fd.phase;
    this.armLast = 0;
    this.dirty = true;
  };

  function servoStep(s, dt) {
    for (var k = 0; k < 4; k++) {
      var h = dt / 4, acc = SERVO.kp * (s.t - s.q) - SERVO.kd * s.v;
      s.v = T.MathUtils.clamp(s.v + acc * h, -SERVO.vmax, SERVO.vmax);
      s.q += s.v * h;
    }
  }

  Tank3D.prototype.spawnPellet = function (from, vel) {
    if (this.pellets.length > 60) return;
    var local = this.world.worldToLocal(from.clone());
    var p = mesh(this.world, this.pelletGeometry, this.pelletMaterial, local.x, local.y, local.z);
    p.userData = { v: vel.clone(), state: 'air', t: 0, floatFor: 0.5 + Math.random() * 2.2, seed: Math.random() * 10 };
    this.pellets.push(p);
  };

  Tank3D.prototype.animateArm = function () {
    var now = performance.now(), dt = this.armLast ? Math.min(0.05, (now - this.armLast) / 1000) : 0.016;
    this.armLast = now;
    var fd = this.fd, sv = this.servo, arm = this.arm, plan = this.feedPlan;
    if (!fd || !sv) return;
    fd.t += dt;
    var q = sv.map(function (s) { return s.q; }), target = null, tip = 0, joints = null;
    var hop = new T.Vector3(FEED.hopperX - FEED.armX, 0, 0);
    var drop = plan ? plan.local : new T.Vector3(0, -TOP + 0.3, -1.3);
    switch (fd.phase) {
      case 'toHopper': target = hop.clone().setX(hop.x + 0.55).setY(0.14); break;   // beside the hopper, low
      case 'dip': target = hop.clone().setY(0.14); break;                            // slide in under the outlet
      case 'lift': target = fd.t < 0.5 ? hop.clone().setX(hop.x + 0.55).setY(0.16) : hop.clone().setX(hop.x + 0.6).setY(0.6); break;
      case 'carry': target = drop.clone().setY(0.45); break;
      case 'lower': target = drop.clone(); break;
      case 'pour': target = drop.clone(); tip = fd.jam ? 0.95 + Math.sin(fd.t * 30) * 0.12 : Math.min(1.7, fd.t * 3.2); break;
      case 'back': target = drop.clone().setY(0.45); break;
      case 'unload': target = fd.t < 0.7 ? hop.clone().setX(hop.x + 0.55).setY(0.4) : hop.clone().setX(hop.x + 0.55).setY(0.14); tip = fd.t > 1.0 ? 0.9 : 0; break;
      case 'home': joints = ARM.rest; break;
      default: joints = null;
    }
    if (target) joints = armInverse(target.x, target.y, target.z, tip, sv[0].q);
    if (joints) sv.forEach(function (s, i) { s.t = joints[i]; });
    sv.forEach(function (s) { servoStep(s, dt); });
    q = sv.map(function (s) { return s.q; });
    setArmJoints(arm, q);
    var settled = sv.every(function (s) { return Math.abs(s.t - s.q) < 0.035 && Math.abs(s.v) < 0.5; }) || fd.t > 3.2;
    var next = function (p) { fd.phase = p; fd.t = 0; };
    switch (fd.phase) {
      case 'toHopper': if (settled) next('dip'); break;
      case 'dip': if (settled && fd.t > 0.35) { arm.load.visible = true; next('lift'); } break;
      case 'lift': if (settled && fd.t > 0.6 && fd.outcome) next('carry'); break;
      case 'carry': if (settled) next('lower'); break;
      case 'lower': if (settled) {
        fd.jam = fd.outcome !== 'detect';
        this.beam = fd.jam ? 'blocked' : 'passed';
        this.dropOutcome = fd.outcome; this.lastFeedAt = now;
        next('pour');
      } break;
      case 'pour':
        if (!fd.jam && fd.t > 0.22 && fd.released < 9 && fd.t > 0.22 + fd.released * 0.045) {
          var tipPos = arm.scoop.localToWorld(new T.Vector3(0.11, -0.03, (fd.released % 3 - 1) * 0.04));
          var vel = new T.Vector3((Math.random() - 0.5) * 0.4, -0.2, (Math.random() - 0.5) * 0.4);
          if (this.animate) this.spawnPellet(tipPos, vel);
          fd.released++;
          if (fd.released >= 9) arm.load.visible = false;
        }
        if (fd.t > (fd.jam ? 1.1 : 1.0)) { this.beamUntil = now + 1600; next('back'); }
        break;
      case 'back': if (settled) next(fd.jam ? 'unload' : 'home'); break;
      case 'unload': if (fd.t > 1.6) { arm.load.visible = false; next('home'); } break;
      case 'home': if (settled) {
        next('rest');
        if (fd.queue > 0) { fd.queue--; this.dispense('start'); }
      } break;
    }
    this.armPhase = fd.phase;
  };

  // falling, floating, sinking and settling; fish eat what they reach
  Tank3D.prototype.stepPellets = function (dt) {
    var xl = W / 2 - 0.12, zl = D / 2 - 0.12;
    for (var i = this.pellets.length - 1; i >= 0; i--) {
      var p = this.pellets[i], d = p.userData, pos = p.position;
      d.t += dt;
      if (d.state === 'air') {
        d.v.y -= G * dt;
        pos.addScaledVector(d.v, dt);
        if (pos.y <= SURFACE) { pos.y = SURFACE; d.state = 'float'; d.t = 0; d.v.multiplyScalar(0.15); d.v.y = 0; }
      } else if (d.state === 'float') {
        d.v.x += (Math.sin(d.t * 1.3 + d.seed) * 0.05 - d.v.x) * dt * 2;
        d.v.z += (Math.cos(d.t * 1.1 + d.seed) * 0.05 - d.v.z) * dt * 2;
        pos.addScaledVector(d.v, dt);
        pos.y = SURFACE + Math.sin(this.time * 3 + d.seed) * 0.006;
        if (d.t > d.floatFor) { d.state = 'sink'; d.t = 0; d.v.y = 0; }
      } else if (d.state === 'sink') {
        d.v.y += (-SINK - d.v.y) * dt * 3;
        d.v.x = Math.sin(d.t * 2.1 + d.seed) * 0.05; d.v.z = Math.cos(d.t * 1.7 + d.seed) * 0.05;
        pos.addScaledVector(d.v, dt);
        var floor = this.bedDepth(pos.x, pos.z) + 0.04;
        if (pos.y <= floor) { pos.y = floor; d.state = 'bed'; d.t = 0; }
      } else if (d.t > 90) { p.removeFromParent(); this.pellets.splice(i, 1); continue; }
      pos.x = T.MathUtils.clamp(pos.x, -xl, xl);
      pos.z = T.MathUtils.clamp(pos.z, -zl, zl);
      p.rotation.x += dt * (d.state === 'air' ? 9 : d.state === 'sink' ? 1.5 : 0.2);
      p.rotation.y += dt * 0.7;
    }
  };

  Tank3D.prototype.nearestPellet = function (pos) {
    var best = null, bd = Infinity;
    for (var i = 0; i < this.pellets.length; i++) {
      var p = this.pellets[i];
      if (p.userData.state === 'air') continue;
      var dd = p.position.distanceToSquared(pos);
      if (dd < bd) { bd = dd; best = p; }
    }
    return best;
  };

  Tank3D.prototype.eatPellet = function (pellet) {
    var i = this.pellets.indexOf(pellet);
    if (i >= 0) { this.pellets.splice(i, 1); pellet.removeFromParent(); this.eaten = (this.eaten || 0) + 1; }
  };

  Tank3D.prototype.fishStates = function () {
    var out = [];
    this.fish.forEach(function (f, i) {
      if (!f.node.visible) return;
      var p = f.node.position;
      out.push({ id: i + 1, x: p.x, y: p.y, z: p.z, speed: f.speed || 0, gold: f.gold, heading: f.node.rotation.y });
    });
    return out;
  };

  Tank3D.prototype.animateScene = function (dt, now) {
    var t = this.time += dt;
    this.water.uniforms.time.value = t;
    this.caustics.value = t;
    this.plants.forEach(function (p, i) {
      p.rotation.z = Math.sin(t * 1.08 + i * 1.23) * 0.046;
      p.rotation.x = Math.cos(t * 0.92 + i * 0.86) * 0.027;
    });
    var feedAt = this.pellets.length ? 1 : 0, sx = W / 8, sy = Math.max(0.8, SURFACE / 3.63), sz = D / 3.8, box_ = this.fishBox;
    var speedMul = this.behaviour === 'lethargic' ? 0.14 : (this.behaviour === 'surface' ? 0.55 : 1);
    this.fish.forEach(function (fish, i) {
      if (!fish.node.visible) return;
      if (fish.theta === undefined) fish.theta = fish.orbit;
      fish.theta += dt * (fish.gold ? 0.56 : 0.61) * speedMul;
      var a = fish.theta;
      var altitude = (1.28 + fish.lane * 0.33) * sy;
      if (this.behaviour === 'lethargic') altitude = 0.62 + fish.lane * 0.16;
      if (this.behaviour === 'surface') altitude = SURFACE - 0.32 - fish.lane * 0.1;
      var x = Math.sin(a) * (2.26 + fish.lane * 0.36) * sx;
      var y = altitude + Math.sin(a * 1.49 + fish.phase) * 0.26 * (this.behaviour === 'normal' ? 1 : 0.35) + Math.sin(t * 2.9 + fish.phase) * 0.026;
      var z = (0.62 + Math.cos(a) * (0.68 + fish.lane * 0.16)) * sz;
      var destination = fish.direction.set(x, y, z);
      var food = feedAt && i % 4 !== 3 ? this.nearestPellet(fish.node.position) : null;
      if (food) {
        destination.lerp(food.position, 0.85);
        if (fish.node.position.distanceTo(food.position) < 0.2) this.eatPellet(food);
      }
      destination.x = T.MathUtils.clamp(destination.x, -box_.x, box_.x);
      destination.y = T.MathUtils.clamp(destination.y, box_.y0, box_.y1);
      destination.z = T.MathUtils.clamp(destination.z, box_.z0, box_.z1);
      if (!fish.initialized) {
        fish.initialized = true;
        fish.node.position.copy(destination);
        fish.last = fish.node.position.clone();
      }
      var delta = destination.sub(fish.node.position);
      if (delta.lengthSq() > 0.00001) {
        var wanted = -Math.atan2(delta.z, delta.x);
        var diff = T.MathUtils.euclideanModulo(wanted - fish.node.rotation.y + Math.PI, TAU) - Math.PI;
        fish.node.rotation.y += dt ? diff * Math.min(1, dt * 5) : diff;
        fish.node.rotation.z = T.MathUtils.clamp(delta.y * 0.7, -0.29, 0.29);
        fish.node.position.addScaledVector(delta, Math.min(1, dt * 2.4));
      }
      if (dt > 0 && fish.last) {
        var moved = fish.node.position.distanceTo(fish.last) / dt;
        fish.speed = (fish.speed || 0) * 0.9 + moved * 0.1;
        fish.last.copy(fish.node.position);
      }
      var tailRate = 5 + 6 * Math.min(1, (fish.speed || 0) / 0.8);
      fish.tail.rotation.y = Math.sin(t * tailRate + fish.phase) * 0.48;
      fish.fins[0].rotation.y = 0.3 + Math.sin(t * 8.1 + fish.phase) * 0.50;
      fish.fins[1].rotation.y = -fish.fins[0].rotation.y;
    }, this);
    var dust = this.dust, count = dust.mesh.geometry.drawRange.count;
    for (var i = 0; i < Math.min(count, dust.anchors.length); i++) {
      var p = dust.anchors[i], offset = i * 3;
      dust.positions[offset] = p[0] + Math.sin(t * 0.20 + p[3]) * 0.095;
      dust.positions[offset + 1] = p[1] + Math.sin(t * 0.32 + p[3]) * 0.08;
      dust.positions[offset + 2] = p[2] + Math.cos(t * 0.27 + p[3]) * 0.095;
    }
    dust.mesh.geometry.attributes.position.needsUpdate = true;
    this.bubbles.forEach(function (bubble, index) {
      bubble.mesh.visible = index < 10 || !!this.view.bubbles;
      var y = 0.42 + (t * bubble.speed + bubble.phase) % (SURFACE - 0.45);
      bubble.mesh.position.set(this.airX + Math.sin(y * 7 + bubble.phase) * 0.10, y, this.airZ + Math.cos(y * 5 + bubble.phase) * 0.10);
    }, this);
    this.stepPellets(dt);
    if (this.filt && this.filt.group.visible) this.placeFilterParts(dt);
    if (this.beamUntil && now >= this.beamUntil) {
      this.beam = 'idle';
      this.beamUntil = 0;
    }
    var color = this.view.led === 'blink' ? (Math.floor(now / 380) % 2 ? 0xffc262 : 0x60472c) :
      this.view.led === 'fault' ? 0xff6852 : this.view.led === 'ok' ? 0x9cec7c : 0x354438;
    this.panel.led.material.color.setHex(color);
    this.panel.button.scale.y = now < this.pulseUntil ? 0.58 : 1;
    this.ir.material.color.setHex(this.beam === 'passed' ? 0x91ed88 : this.beam === 'blocked' ? 0xf77958 : this.beam === 'active' ? 0xffbb5b : 0x39535a);
    if (this.fd && this.fd.phase !== 'rest') this.animateArm();
  };

  Tank3D.prototype.frame = function (now) {
    root.requestAnimationFrame(this.frame);
    var wantFeed = !!(this.feed && this.feed.visible);
    if ((!this.onScreen && !wantFeed) || this.host.hidden || document.hidden) {
      this.last = 0;
      return;
    }
    var moving = this.animate || this.armPhase !== 'rest';
    if (!moving && !this.dirty && !this.beamUntil && !(now < this.pulseUntil + 90) && !wantFeed) return;
    if (this.animate && !this.dirty && this.last && now - this.last < 28) return;
    var dt = this.animate && this.last ? Math.min(0.055, (now - this.last) / 1000) : 0;
    this.last = now;
    this.animateScene(dt, now);
    if (wantFeed && now - (this.feedAt || 0) > 220) { this.feedAt = now; this.renderFeed(); }
    if (this.onScreen) {
      this.positionCamera();
      var pr = this.pixelRatio || 1;
      this.renderer.setViewport(0, 0, this.canvas.width / pr, this.canvas.height / pr);
      this.renderer.render(this.scene, this.camera);
      if (this.showTags) this.placeTags();
    }
    this.dirty = false;
  };

  Tank3D.prototype.placeTags = function () {
    var w = this.viewport.clientWidth, h = this.viewport.clientHeight, v = new T.Vector3();
    this.tags.forEach(function (tag) {
      v.copy(tag.pos).project(this.camera);
      var hidden = v.z > 1 || Math.abs(v.x) > 1.05 || Math.abs(v.y) > 1.05;
      tag.el.style.visibility = hidden ? 'hidden' : 'visible';
      if (!hidden) tag.el.style.transform = 'translate(' + ((v.x * 0.5 + 0.5) * w).toFixed(1) + 'px,' + ((-v.y * 0.5 + 0.5) * h).toFixed(1) + 'px)';
    }, this);
  };

  // ---- the top camera: what the phone app receives ----
  Tank3D.prototype.attachFeed = function (canvas, onVisible) {
    var self = this;
    this.feed = { canvas: canvas, ctx: canvas.getContext('2d'), visible: false };
    new IntersectionObserver(function (entries) {
      self.feed.visible = entries[0].isIntersecting;
      self.dirty = true;
      if (onVisible) onVisible(self.feed.visible);
    }).observe(canvas);
  };

  Tank3D.prototype.renderFeed = function () {
    var f = this.feed, c = this.aimFeedCamera(), cam = this.feedCamera;
    var pr = this.pixelRatio || 1, bw = Math.min(this.canvas.width, 480), bh = Math.round(bw / c.aspect);
    if (bh > this.canvas.height) { bh = this.canvas.height; bw = Math.round(bh * c.aspect); }
    if (bw < 40 || bh < 30) return;
    var cone = this.ctrl.cone.visible, ctrl = this.ctrl.group.visible, tags = this.tagLayer.hidden;
    this.ctrl.cone.visible = false;
    this.renderer.setViewport(0, 0, bw / pr, bh / pr);
    this.renderer.render(this.scene, cam);
    this.ctrl.cone.visible = cone;
    var cw = f.canvas.width, ch = Math.round(cw / c.aspect);
    if (f.canvas.height !== ch) f.canvas.height = ch;
    f.ctx.drawImage(this.canvas, 0, this.canvas.height - bh, bw, bh, 0, 0, cw, ch);
    f.aspect = c.aspect;
    if (this.onFeedFrame) this.onFeedFrame(f);
  };

  // project a tank-space point into feed pixels (0..1, 0..1)
  Tank3D.prototype.feedProject = function (x, y, z) {
    var v = new T.Vector3(x, y, z).project(this.feedCamera);
    return [v.x * 0.5 + 0.5, -v.y * 0.5 + 0.5, v.z];
  };

  // ---- the controller seen from every side (separate studio scene) ----
  Tank3D.prototype.controllerViews = function (canvases, lines, power) {
    var w = 760, h = 500;
    var renderer = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.outputColorSpace = T.SRGBColorSpace;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.setPixelRatio(1);
    renderer.setSize(w, h, false);
    var scene = new T.Scene();
    scene.background = new T.Color(0xd9e3e6);
    scene.add(new T.HemisphereLight(0xffffff, 0x9aa8ad, 2.1));
    var key = new T.DirectionalLight(0xffffff, 2.4); key.position.set(-4, 7, 6); scene.add(key);
    var rim = new T.DirectionalLight(0xcfe6ee, 1.1); rim.position.set(5, 3, -6); scene.add(rim);
    var under = new T.DirectionalLight(0xffffff, 0.9); under.position.set(0, -6, 2); scene.add(under);
    var studio = buildController(this.dims, this.finish);
    studio.panel.draw(lines || (this.view && this.view.lcd) || [], power || 'on', true);
    studio.group.position.y = 0;
    scene.add(studio.group);
    var wanted = this.finish;
    var cam = new T.PerspectiveCamera(30, w / h, 0.1, 120);
    // [yaw, pitch, distance, target x, y, z]: the whole assembly, rails included, at this tank size
    var span = Math.max(this.dims.W, this.dims.D * 1.6), far = span * 1.95 + 1.6, hz = studio.headZ;
    var views = {
      front: [0.0, 0.10, far * 0.8, 0.0, 0.2, 0.0], back: [Math.PI, 0.10, far * 0.8, 0.0, 0.2, 0.0],
      left: [-Math.PI / 2, 0.12, far * 0.72, 0.0, 0.35, 0.0], right: [Math.PI / 2, 0.12, far * 0.72, 0.0, 0.35, 0.0],
      top: [0.0, 1.45, far * 0.78, 0.0, 0.3, 0.0], under: [0.6, -0.7, far * 0.85, 0.0, 0.2, hz * 0.4]
    };
    Object.keys(views).forEach(function (id) {
      var v = views[id], tgt = new T.Vector3(v[3], v[4], v[5]), dist = v[2];
      cam.position.set(tgt.x + Math.sin(v[0]) * Math.cos(v[1]) * dist, tgt.y + Math.sin(v[1]) * dist, tgt.z + Math.cos(v[0]) * Math.cos(v[1]) * dist);
      cam.up.set(0, 1, 0);
      cam.lookAt(tgt);
      renderer.render(scene, cam);
      var c = canvases[id];
      if (c) { c.width = w; c.height = h; c.getContext('2d').drawImage(renderer.domElement, 0, 0); }
    });
    disposeTree(studio.group);
    studio.panel.dispose();
    renderer.dispose();
    if (renderer.forceContextLoss) renderer.forceContextLoss();
    return wanted;
  };

  root.AquaTank3D = Tank3D;
  root.AquaTank3D.dimsFor = dimsFor;
}(window));

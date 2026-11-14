(function (root) {
  'use strict';
  var T = root.THREE;
  if (!T) return;

  var W = 8, H = 3.9, D = 3.8, SURFACE = 3.63;
  var TAU = Math.PI * 2;

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

    var pebbles = new T.InstancedMesh(new T.IcosahedronGeometry(1, 0), standard(0xffffff, { flatShading: true }), 1750);
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
    return clock;
  }

  function rock(parent, rng, x, y, z, sx, sy, sz) {
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
    var stone = mesh(parent, geometry, standard(0xffffff, { vertexColors: true, flatShading: true }), x, y, z);
    stone.rotation.y = rng() * TAU;
    stone.scale.set(sx, sy, sz);
  }

  function wood(parent, points, from, to) {
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
    mesh(parent, geometry, standard(0xffffff, { vertexColors: true, side: T.DoubleSide }));
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
    // detailed geometry affordable on phone GPUs.
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

  function displayPanel(parent, casing) {
    var canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 192;
    var context = canvas.getContext('2d');
    var texture = new T.CanvasTexture(canvas);
    texture.colorSpace = T.SRGBColorSpace;
    var enclosure = new T.Group();
    enclosure.position.set(4.37, 2.68, 1.77);
    parent.add(enclosure);
    box(enclosure, [1.16, 0.93, 0.53], casing, 0, 0, 0);
    var face = mesh(enclosure, new T.PlaneGeometry(0.99, 0.37), new T.MeshBasicMaterial({ map: texture }), 0, 0.16, 0.268);
    face.material.toneMapped = false;
    var button = mesh(enclosure, new T.CylinderGeometry(0.108, 0.108, 0.08, 18), standard(0xa42d1c), 0.29, -0.225, 0.29);
    button.rotation.x = Math.PI / 2;
    var led = mesh(enclosure, new T.SphereGeometry(0.046, 10, 8), new T.MeshBasicMaterial(), -0.36, -0.225, 0.281);
    var key = '';
    return {
      button: button, led: led,
      draw: function (lines, power) {
        var next = power + lines.join('|');
        if (next === key) return;
        key = next;
        context.fillStyle = power === 'off' ? '#131e18' : '#334c2d';
        context.fillRect(0, 0, 512, 192);
        context.fillStyle = '#d0ed9c';
        context.font = 'bold 41px monospace';
        context.fillText(lines[0] || '', 22, 76, 468);
        context.fillText(lines[1] || '', 22, 145, 468);
        texture.needsUpdate = true;
      }
    };
  }

  function makeDust(parent, rng) {
    var positions = new Float32Array(680 * 3), anchors = [];
    for (var i = 0; i < 680; i++) {
      anchors.push([(rng() - 0.5) * 7.76, 0.30 + rng() * 3.24, (rng() - 0.5) * 3.56, rng() * 18]);
    }
    var geometry = new T.BufferGeometry();
    geometry.setAttribute('position', new T.BufferAttribute(positions, 3));
    var particles = new T.Points(geometry, new T.PointsMaterial({ color: 0xe8ecda, size: 0.021, transparent: true, opacity: 0.38, depthWrite: false }));
    particles.frustumCulled = false;
    parent.add(particles);
    return { mesh: particles, positions: positions, anchors: anchors };
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
    this.scene = new T.Scene();
    this.camera = new T.PerspectiveCamera(37, 1, 0.03, 85);
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
    this.scene.add(new T.HemisphereLight(0xd5edfc, 0x4d3c29, 2.0));
    this.light = new T.DirectionalLight(0xe4f6ff, 2.75);
    this.light.position.set(-2.5, 9, 4);
    this.scene.add(this.light);
    var fill = new T.DirectionalLight(0x8bb6c5, 1.10);
    fill.position.set(4, 4, -5);
    this.scene.add(fill);
    this.build();
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

  Tank3D.prototype.build = function () {
    var aquarium = this.aquarium = new T.Group();
    var rng = randomGenerator(42711);
    this.scene.add(aquarium);
    var base = standard(0x18232a), frame = standard(0x26383d, { metalness: 0.58, roughness: 0.38 });
    var edge = new T.MeshBasicMaterial({ color: 0x84d0cb, transparent: true, opacity: 0.50 });
    var frosted = new T.MeshBasicMaterial({ color: 0x82cbd1, transparent: true, opacity: 0.081, depthWrite: false });
    this.waterBackdrop = new T.MeshBasicMaterial({ color: 0x103e44 });
    var meniscus = new T.MeshBasicMaterial({ color: 0x70b9c0, opacity: 0.44, transparent: true, depthWrite: false });
    box(aquarium, [8.14, 0.14, 3.94], frame, 0, -0.065, 0);
    box(aquarium, [8.39, 0.21, 4.16], base, 0, -0.23, 0);
    box(aquarium, [7.88, 0.68, 3.66], base, 0, -0.65, 0);
    box(aquarium, [7.68, 0.54, 0.055], standard(0x27343a), 0, -0.65, 1.845);
    box(aquarium, [0.033, 0.53, 0.018], base, 0, -0.65, 1.878);
    [-1, 1].forEach(function (side) {
      box(aquarium, [W, H, 0.025], frosted, 0, H / 2, side * D / 2).renderOrder = 4;
      box(aquarium, [0.025, H, D], frosted, side * W / 2, H / 2, 0).renderOrder = 4;
      box(aquarium, [W, 0.023, 0.030], edge, 0, H, side * D / 2);
      box(aquarium, [0.030, 0.023, D], edge, side * W / 2, H, 0);
      box(aquarium, [W - 0.025, 0.015, 0.010], meniscus, 0, SURFACE, side * (D / 2 - 0.015)).renderOrder = 5;
      box(aquarium, [0.010, 0.015, D - 0.025], meniscus, side * (W / 2 - 0.015), SURFACE, 0).renderOrder = 5;
      for (var k = -1; k <= 1; k += 2) {
        box(aquarium, [0.029, H, 0.029], edge, side * W / 2, H / 2, k * D / 2);
      }
    });
    mesh(aquarium, new T.PlaneGeometry(W - 0.04, SURFACE), this.waterBackdrop, 0, SURFACE / 2, -D / 2 + 0.027);
    this.water = waterMaterial();
    var water = mesh(aquarium, new T.PlaneGeometry(W - 0.025, D - 0.025, 54, 27), this.water, 0, SURFACE, 0);
    water.rotation.x = -Math.PI / 2;
    water.renderOrder = 3;
    this.caustics = makeGravel(aquarium, rng);

    [[-2.70, 0.59, -0.87, 1.04, 0.66, 0.65], [-2.03, 0.44, 0.31, 0.76, 0.42, 0.58],
      [-2.99, 0.31, 0.83, 0.53, 0.30, 0.47], [-1.18, 0.28, -0.35, 0.73, 0.29, 0.44],
      [2.24, 0.83, -0.64, 0.76, 0.77, 0.61], [2.80, 0.53, 0.32, 0.70, 0.51, 0.53],
      [1.52, 0.43, -0.35, 0.76, 0.41, 0.45], [1.83, 0.24, 0.80, 0.42, 0.23, 0.34]
    ].forEach(function (r) { rock.apply(null, [aquarium, rng].concat(r)); });
    wood(aquarium, [[-2.83, 0.34, 0.53], [-2.19, 0.78, 0.32], [-1.76, 1.37, -0.03], [-1.29, 1.84, -0.42], [-0.62, 2.15, -0.67]], 0.43, 0.013);
    wood(aquarium, [[-2.07, 0.83, 0.29], [-1.53, 1.05, 0.54], [-0.84, 1.29, 0.56], [-0.35, 1.47, 0.36]], 0.19, 0.006);
    wood(aquarium, [[-2.19, 0.76, 0.26], [-2.53, 1.16, -0.09], [-2.44, 1.67, -0.42], [-2.15, 1.96, -0.59]], 0.16, 0.006);
    wood(aquarium, [[2.80, 0.34, -0.24], [2.50, 0.91, -0.35], [2.07, 1.29, -0.49], [1.48, 1.54, -0.77], [0.68, 1.64, -0.83]], 0.45, 0.022);
    wood(aquarium, [[2.34, 0.92, -0.26], [1.80, 1.00, -0.05], [1.19, 0.98, 0.21], [0.78, 0.83, 0.37]], 0.17, 0.006);
    wood(aquarium, [[2.05, 1.29, -0.44], [2.36, 1.84, -0.55], [2.64, 2.16, -0.69], [2.59, 2.43, -0.71]], 0.18, 0.006);

    this.plants = [];
    var plantLayout = [
      [-3.40, -1.35, 2.9, 'ribbon'], [-2.87, -1.51, 2.65, 'ribbon'], [-2.36, -1.49, 2.58, 'fern'],
      [-1.53, -1.48, 2.05, 'red'], [-0.45, -1.56, 1.50, 'fern'], [0.26, -1.57, 1.83, 'red'],
      [1.11, -1.51, 2.26, 'red'], [1.68, -1.37, 2.65, 'fern'], [2.47, -1.47, 2.88, 'red'],
      [3.18, -1.34, 3.0, 'ribbon'], [3.43, -0.78, 2.4, 'ribbon'], [3.25, 0.65, 1.35, 'fern'],
      [-3.38, -0.32, 1.95, 'fern'], [-2.62, 0.77, 0.89, 'fern'], [1.19, 0.28, 0.83, 'fern'],
      [2.67, 0.60, 0.76, 'fern'], [-1.17, 0.42, 0.57, 'fern']
    ];
    for (var i = 0; i < 31; i++) {
      var side = i % 2 ? -1 : 1;
      plantLayout.push([side * (1.36 + rng() * 2.19), 0.56 + rng() * 1.14, 0.21 + rng() * 0.32, 'grass']);
    }
    plantLayout.forEach(function (p) {
      this.plants.push(makePlant.apply(null, [aquarium, rng].concat(p)));
    }, this);

    var lamp = standard(0x667780, { metalness: 0.5, roughness: 0.32 });
    box(aquarium, [6.88, 0.14, 0.37], lamp, -0.39, 4.28, -0.11);
    this.lightStrip = box(aquarium, [6.62, 0.033, 0.20], new T.MeshBasicMaterial({ color: 0xcbf4ff }), -0.39, 4.195, -0.11);
    [-3.43, 2.67].forEach(function (x) {
      tube(aquarium, [[x, 3.85, -1.83], [x, 4.23, -1.79], [x, 4.27, -0.91], [x, 4.27, -0.17]], 0.038, frame);
    });
    var filter = standard(0x203337);
    box(aquarium, [0.65, 0.90, 0.49], filter, -3.49, 3.22, -1.54);
    box(aquarium, [0.46, 0.07, 0.35], frame, -3.49, 3.67, -1.33);
    tube(aquarium, [[-3.51, 3.19, -1.46], [-3.53, 2.63, -1.38], [-3.53, 1.25, -1.38]], 0.067, frame, 8);
    for (i = 0; i < 5; i++) box(aquarium, [0.17, 0.023, 0.13], base, -3.53, 1.25 + i * 0.069, -1.37);

    var feeder = standard(0x2d4549, { metalness: 0.22 });
    box(aquarium, [0.94, 0.50, 0.58], feeder, 2.82, 4.14, 0.78);
    box(aquarium, [0.86, 0.059, 0.53], lamp, 2.82, 4.40, 0.78);
    box(aquarium, [0.22, 0.32, 0.22], base, 2.82, 3.86, 0.78);
    this.feederGate = box(aquarium, [0.22, 0.035, 0.18], lamp, 2.82, 3.76, 0.78);
    this.ir = mesh(aquarium, new T.SphereGeometry(0.038, 10, 8), new T.MeshBasicMaterial(), 2.95, 3.80, 0.85);
    this.probes = {};
    var self = this;
    ['ph', 'temp', 'tds', 'turb'].forEach(function (name, index) {
      var x = 3.77 - index * 0.22, y = 2.16 + index * 0.17;
      tube(aquarium, [[4.33, 3.07, 1.52], [4.03, 3.98, 1.38 - index * 0.10], [x, 3.96, 1.08 - index * 0.69],
        [x, 3.56, 1.08 - index * 0.69], [x, y, 1.08 - index * 0.69]], 0.023, frame);
      var tipMaterial = standard(index === 1 ? 0x98a3a4 : 0x45545a, { metalness: index === 1 ? 0.59 : 0.19 });
      self.probes[name] = tipMaterial;
      mesh(aquarium, new T.CylinderGeometry(0.057, 0.051, 0.43, 12), tipMaterial, x, y, 1.08 - index * 0.69);
    });
    this.heater = new T.Group();
    this.heater.position.set(-3.68, 1.98, -0.12);
    aquarium.add(this.heater);
    mesh(this.heater, new T.CylinderGeometry(0.096, 0.096, 1.26, 14), standard(0x713a2c, { emissive: 0x33120b }), 0, 0, 0);
    box(this.heater, [0.20, 0.19, 0.19], base, 0, 0.67, 0);

    this.panel = displayPanel(aquarium, base);
    this.dust = makeDust(aquarium, rng);
    this.bubbles = [];
    var bubbleMat = new T.MeshBasicMaterial({ color: 0xc6eeee, transparent: true, opacity: 0.48, depthWrite: false });
    var bubbleGeo = new T.SphereGeometry(1, 8, 6);
    for (i = 0; i < 32; i++) {
      var bubble = mesh(aquarium, bubbleGeo, bubbleMat);
      bubble.scale.setScalar(0.012 + rng() * 0.026);
      this.bubbles.push({ mesh: bubble, speed: 0.31 + rng() * 0.31, phase: rng() * 9 });
    }
    this.algae = mesh(aquarium, new T.PlaneGeometry(W - 0.12, SURFACE - 0.15), new T.ShaderMaterial({
      transparent: true, depthWrite: false, side: T.DoubleSide, uniforms: { amount: { value: 0 } },
      vertexShader: 'varying vec2 p; void main(){p=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader: 'varying vec2 p; uniform float amount; void main(){vec2 c=floor(p*vec2(160.,81.));float n=fract(sin(dot(c,vec2(12.9898,78.233)))*43758.5453);float edge=pow(abs(p.x-.5)*2.,4.);float spot=max(0., n-.87)*2.;gl_FragColor=vec4(.25,.35,.12,amount*(edge*.16+spot*(.27+edge*.56)));}'
    }), 0, SURFACE / 2, D / 2 - 0.019);
    this.algae.renderOrder = 5;
    this.pelletGeometry = new T.IcosahedronGeometry(0.038, 1);
    this.pelletMaterial = standard(0x9f6837, { flatShading: true });
    for (i = 0; i < 10; i++) this.fish.push(makeFish(aquarium, rng, i));
  };

  Tank3D.prototype.resize = function () {
    var width = this.viewport.clientWidth, height = this.viewport.clientHeight;
    if (!width || !height) return;
    this.renderer.setPixelRatio(Math.min(root.devicePixelRatio || 1, width < 650 ? 1.35 : 1.6));
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.dirty = true;
  };

  Tank3D.prototype.setCamera = function (preset) {
    var presets = {
      reset: [0.17, 0.19, 1, 0.38, 1.66, 0],
      front: [0, 0.075, 0.96, 0.43, 1.68, 0],
      surface: [0.22, 0.86, 0.78, 0, 2.76, 0],
      fish: [-0.16, 0.10, 0.57, -0.22, 1.78, 0.45],
      feeder: [0.44, 0.25, 0.48, 3.21, 3.25, 0.98]
    };
    var p = presets[preset];
    this.yaw = p[0];
    this.pitch = p[1];
    this.zoom = p[2];
    this.target.set(p[3], p[4], p[5]);
    this.dirty = true;
  };

  Tank3D.prototype.cameraDistance = function () {
    var aspect = this.camera.aspect;
    // Fit the opening view across phones and desktop panes, even after rotation.
    var widthDistance = (5.64 * this.aquarium.scale.x) / (Math.max(0.8, aspect) * 0.335);
    return T.MathUtils.clamp(Math.max(9.6, widthDistance) * this.zoom, 3.1, 42);
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
      this.target.clamp(new T.Vector3(-4.4, -0.5, -1.85), new T.Vector3(4.4, 4.5, 1.85));
    } else {
      this.yaw -= x * 0.007;
      this.pitch = T.MathUtils.clamp(this.pitch + y * 0.007, -0.21, 1.38);
    }
    this.dirty = true;
  };

  Tank3D.prototype.zoomBy = function (factor) {
    this.zoom = T.MathUtils.clamp(this.zoom * factor, 0.28, 2.4);
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
    var ratio = size === 'p3' ? 1.02 : Math.cbrt((Number(size) || 5) / 5);
    this.aquarium.scale.set(ratio, Math.pow(ratio, 0.62), Math.pow(ratio, 0.74));
    this.fish.forEach(function (fish, index) { fish.node.visible = index < fishCount; });
    this.clearPellets();
    this.beam = 'idle';
    this.beamUntil = 0;
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
    this.waterBackdrop.color.set(0x103e44).lerp(new T.Color(0x665435), turbidity * 0.86);
    this.dust.mesh.geometry.setDrawRange(0, Math.round(65 + turbidity * 615));
    this.dust.mesh.material.color.set(0xc8e1dc).lerp(new T.Color(0xbe9e6d), turbidity);
    this.dust.mesh.material.size = 0.019 + turbidity * 0.024;
    this.algae.material.uniforms.amount.value = state.upkeep ? state.upkeep.glass : 0;
    this.light.intensity = state.power === 'off' ? 0.65 : 2.75;
    this.lightStrip.material.color.setHex(state.power === 'off' ? 0x29343c : 0xcbf4ff);
    Object.keys(this.probes).forEach(function (name) {
      this.probes[name].emissive.setHex(state.probes[name] === 'ok' ? 0x000000 : 0x731a13);
    }, this);
    this.dirty = true;
  };

  Tank3D.prototype.clearPellets = function () {
    this.pellets.forEach(function (pellet) { pellet.removeFromParent(); });
    this.pellets.length = 0;
  };

  Tank3D.prototype.dispense = function (phase, outcome) {
    if (phase === 'start') {
      this.beamUntil = 0;
      this.beam = 'active';
    }
    if (phase === 'chute') {
      this.beam = outcome === 'detect' ? 'passed' : 'blocked';
      if (outcome === 'detect' && this.animate && this.pellets.length < 18) {
        for (var i = 0; i < 6; i++) {
          var pellet = mesh(this.aquarium, this.pelletGeometry, this.pelletMaterial, 2.79 + (i % 3) * 0.028, 3.73, 0.76);
          pellet.userData = { age: -i * 0.095, sway: (i % 3 - 1) * 0.45 };
          pellet.visible = false;
          this.pellets.push(pellet);
        }
      }
    }
    if (phase === 'end') this.beamUntil = performance.now() + 1600;
    this.dirty = true;
  };

  Tank3D.prototype.animateScene = function (dt, now) {
    var t = this.time += dt;
    this.water.uniforms.time.value = t;
    this.caustics.value = t;
    this.plants.forEach(function (p, i) {
      p.rotation.z = Math.sin(t * 1.08 + i * 1.23) * 0.046;
      p.rotation.x = Math.cos(t * 0.92 + i * 0.86) * 0.027;
    });
    var feedAt = this.pellets.length ? 1 : 0;
    this.fish.forEach(function (fish, i) {
      if (!fish.node.visible) return;
      var a = t * (fish.gold ? 0.56 : 0.61) + fish.orbit;
      var altitude = 1.28 + fish.lane * 0.33;
      var x = Math.sin(a) * (2.26 + fish.lane * 0.36);
      var y = altitude + Math.sin(a * 1.49 + fish.phase) * 0.26 + Math.sin(t * 2.9 + fish.phase) * 0.026;
      var z = 0.62 + Math.cos(a) * (0.68 + fish.lane * 0.16);
      var destination = fish.direction.set(x, y, z);
      if (feedAt && i % 3 !== 2) {
        destination.lerp(new T.Vector3(2.18 + Math.sin(a * 3) * 0.54, 2.68 + Math.cos(a * 3) * 0.30, 0.78 + Math.cos(a * 2) * 0.44), 0.62);
      }
      if (!fish.initialized) {
        fish.initialized = true;
        fish.node.position.copy(destination);
      }
      var delta = destination.sub(fish.node.position);
      if (delta.lengthSq() > 0.00001) {
        var wanted = -Math.atan2(delta.z, delta.x);
        var diff = T.MathUtils.euclideanModulo(wanted - fish.node.rotation.y + Math.PI, TAU) - Math.PI;
        fish.node.rotation.y += dt ? diff * Math.min(1, dt * 5) : diff;
        fish.node.rotation.z = T.MathUtils.clamp(delta.y * 0.7, -0.29, 0.29);
        fish.node.position.addScaledVector(delta, Math.min(1, dt * 2.4));
      }
      fish.tail.rotation.y = Math.sin(t * 11.3 + fish.phase) * 0.48;
      fish.fins[0].rotation.y = 0.3 + Math.sin(t * 8.1 + fish.phase) * 0.50;
      fish.fins[1].rotation.y = -fish.fins[0].rotation.y;
    });
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
      var y = 0.42 + (t * bubble.speed + bubble.phase) % 3.18;
      bubble.mesh.position.set(-3.40 + Math.sin(y * 7 + bubble.phase) * 0.10, y, -0.87 + Math.cos(y * 5 + bubble.phase) * 0.10);
    }, this);
    for (i = this.pellets.length - 1; i >= 0; i--) {
      var pellet = this.pellets[i], data = pellet.userData;
      data.age += dt;
      pellet.visible = data.age >= 0;
      if (pellet.visible) {
        pellet.position.y = 3.73 - data.age * 0.51;
        pellet.position.x = 2.82 + Math.sin(data.age * 2.7) * data.sway;
        pellet.rotation.x += dt * 1.6;
      }
      if (data.age > 5.5) {
        pellet.removeFromParent();
        this.pellets.splice(i, 1);
      }
    }
    if (this.beamUntil && now >= this.beamUntil) {
      this.beam = 'idle';
      this.beamUntil = 0;
    }
    var color = this.view.led === 'blink' ? (Math.floor(now / 380) % 2 ? 0xffc262 : 0x60472c) :
      this.view.led === 'fault' ? 0xff6852 : this.view.led === 'ok' ? 0x9cec7c : 0x354438;
    this.panel.led.material.color.setHex(color);
    this.panel.button.scale.y = now < this.pulseUntil ? 0.58 : 1;
    this.ir.material.color.setHex(this.beam === 'passed' ? 0x91ed88 : this.beam === 'blocked' ? 0xf77958 : this.beam === 'active' ? 0xffbb5b : 0x39535a);
    this.feederGate.rotation.z = this.beam === 'active' ? -0.67 : 0;
  };

  Tank3D.prototype.frame = function (now) {
    root.requestAnimationFrame(this.frame);
    if (!this.onScreen || this.host.hidden || document.hidden) {
      this.last = 0;
      return;
    }
    if (!this.animate && !this.dirty && !this.beamUntil && !(now < this.pulseUntil + 90)) return;
    if (this.animate && !this.dirty && this.last && now - this.last < 28) return;
    var dt = this.animate && this.last ? Math.min(0.055, (now - this.last) / 1000) : 0;
    this.last = now;
    this.animateScene(dt, now);
    this.positionCamera();
    this.renderer.render(this.scene, this.camera);
    this.dirty = false;
  };

  root.AquaTank3D = Tank3D;
}(window));

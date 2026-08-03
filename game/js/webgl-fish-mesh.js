(function (root) {
  "use strict";

  const DEFAULT_COLUMNS = 16;
  const DEFAULT_ROWS = 4;
  const FRAME_WIDTH = 384;
  const FRAME_HEIGHT = 192;
  const CONTENT_SCALE_X = 0.68;
  const CONTENT_SCALE_Y = 0.68;
  const TEXTURE_FLIP_Y = false;

  const vertexShaderSource = `
    attribute vec2 a_position;
    attribute vec2 a_texCoord;

    uniform float u_time;
    uniform float u_amplitude;
    uniform float u_frequency;
    uniform float u_phase;
    uniform float u_headStability;
    uniform float u_tailOnLeft;
    uniform float u_motionMode;
    uniform vec2 u_bendAxis;

    varying vec2 v_texCoord;

    void main() {
      float fishProgress = mix(
        a_texCoord.x,
        1.0 - a_texCoord.x,
        u_tailOnLeft
      );
      float seaweedProgress = 1.0 - a_texCoord.y;
      float motionProgress = mix(
        fishProgress,
        seaweedProgress,
        u_motionMode
      );
      float motionWeight = pow(
        smoothstep(0.0, 1.0, motionProgress),
        1.65
      );
      float fishBodyWeight = mix(
        1.0 - u_headStability,
        1.0,
        motionWeight
      );
      float bodyWeight = mix(
        fishBodyWeight,
        motionWeight,
        u_motionMode
      );
      float wavePhase = (
        u_time * u_frequency
        + motionProgress * 6.2
        + u_phase
      );
      float wave = sin(wavePhase);
      float crossSectionTilt = cos(wavePhase);

      vec2 position = a_position;
      position.x *= ${CONTENT_SCALE_X.toFixed(2)};
      position.y *= ${CONTENT_SCALE_Y.toFixed(2)};
      vec2 primaryOffset = (
        u_bendAxis
        * wave
        * u_amplitude
        * bodyWeight
      );
      vec2 crossAxis = vec2(u_bendAxis.y, u_bendAxis.x);
      float crossCoordinate = mix(
        a_position.y,
        a_position.x,
        u_motionMode
      );
      float crossStrength = mix(0.18, 0.12, u_motionMode);
      vec2 crossOffset = (
        crossAxis
        * crossCoordinate
        * crossSectionTilt
        * u_amplitude
        * motionWeight
        * crossStrength
      );
      crossOffset -= (
        crossAxis
        *
        abs(wave)
        * u_amplitude
        * motionWeight
        * 0.055
        * (1.0 - u_motionMode)
      );
      position += primaryOffset + crossOffset;

      gl_Position = vec4(position, 0.0, 1.0);
      v_texCoord = a_texCoord;
    }
  `;

  const fragmentShaderSource = `
    precision mediump float;

    uniform sampler2D u_texture;
    varying vec2 v_texCoord;

    void main() {
      gl_FragColor = texture2D(u_texture, v_texCoord);
    }
  `;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function resolveMotionMode(aspectRatio) {
    const ratio = Number(aspectRatio);
    return Number.isFinite(ratio) && ratio > 0 && ratio < 1
      ? "seaweed"
      : "fish";
  }

  function resolveCustomFishMotion(
    storedAspectRatio,
    naturalWidth,
    naturalHeight
  ) {
    const storedRatio = Number(storedAspectRatio);
    const naturalRatio = Number(naturalWidth) / Number(naturalHeight);
    const aspectRatio = Number.isFinite(storedRatio) && storedRatio > 0
      ? storedRatio
      : Number.isFinite(naturalRatio) && naturalRatio > 0
        ? naturalRatio
        : 1;
    return {
      aspectRatio,
      motionMode: resolveMotionMode(aspectRatio)
    };
  }

  function resolveSourceFacing(motionMode, meshFrame) {
    return motionMode === "fish"
      && meshFrame
      && !meshFrame.tailOnLeft
      ? -1
      : 1;
  }

  function buildMesh(columns, rows) {
    const safeColumns = Math.max(2, Math.floor(Number(columns) || DEFAULT_COLUMNS));
    const safeRows = Math.max(1, Math.floor(Number(rows) || DEFAULT_ROWS));
    const vertices = [];
    const indices = [];

    for (let row = 0; row <= safeRows; row += 1) {
      const v = row / safeRows;
      const y = 1 - v * 2;
      for (let column = 0; column <= safeColumns; column += 1) {
        const u = column / safeColumns;
        const x = u * 2 - 1;
        vertices.push(x, y, u, v);
      }
    }

    const stride = safeColumns + 1;
    for (let row = 0; row < safeRows; row += 1) {
      for (let column = 0; column < safeColumns; column += 1) {
        const topLeft = row * stride + column;
        const topRight = topLeft + 1;
        const bottomLeft = topLeft + stride;
        const bottomRight = bottomLeft + 1;
        indices.push(
          topLeft,
          bottomLeft,
          topRight,
          topRight,
          bottomLeft,
          bottomRight
        );
      }
    }

    return {
      vertices,
      indices,
      columns: safeColumns,
      rows: safeRows
    };
  }

  function calculateMotion(fish) {
    const source = fish || {};
    const motionMode = source.motionMode === "seaweed" ? 1 : 0;
    const motionAmplitudeScale = motionMode ? 2.0 : 1.8;
    const baseSpeed = Math.max(0.001, Number(source.speed) || 0.02);
    const currentSpeed = Math.max(
      0,
      Number(source.currentSpeed) || baseSpeed
    );
    const speedRatio = clamp(currentSpeed / baseSpeed, 0.2, 2.4);
    let behaviorStrength = 0.72;
    let frequencyStrength = 1;

    if (source.behavior === "rest") {
      behaviorStrength = 0.28;
      frequencyStrength = 0.62;
    } else if (source.behavior === "dart") {
      behaviorStrength = 1.18;
      frequencyStrength = 1.24;
    } else if (
      Number.isFinite(Number(source.eatingUntil))
      && Number(source.eatingUntil) > Number(source.time || 0)
    ) {
      behaviorStrength = 0.38;
      frequencyStrength = 0.76;
    }

    const reducedMotionStrength = source.reducedMotion ? 0.34 : 1;
    const reducedFrequencyStrength = source.reducedMotion ? 0.72 : 1;

    return {
      amplitude: clamp(
        (0.052 + speedRatio * 0.034)
          * behaviorStrength
          * reducedMotionStrength,
        0.012,
        0.148
      ) * motionAmplitudeScale,
      frequency: clamp(
        (5.2 + speedRatio * 1.45)
          * frequencyStrength
          * reducedFrequencyStrength,
        3.2,
        10.8
      ),
      phase: Number(source.phase) || 0,
      headStability: 0.91,
      motionMode,
      bendAxisX: motionMode,
      bendAxisY: 1 - motionMode
    };
  }

  function createUnavailableRenderer() {
    return {
      available: false,
      render() {
        return false;
      }
    };
  }

  function createShader(gl, type, source) {
    const shader = gl.createShader(type);
    if (!shader) {
      throw new Error("Unable to create WebGL shader");
    }
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const detail = gl.getShaderInfoLog(shader) || "Unknown shader error";
      gl.deleteShader(shader);
      throw new Error(detail);
    }
    return shader;
  }

  function createProgram(gl) {
    const vertexShader = createShader(
      gl,
      gl.VERTEX_SHADER,
      vertexShaderSource
    );
    const fragmentShader = createShader(
      gl,
      gl.FRAGMENT_SHADER,
      fragmentShaderSource
    );
    const program = gl.createProgram();
    if (!program) {
      throw new Error("Unable to create WebGL program");
    }
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const detail = gl.getProgramInfoLog(program) || "Unknown link error";
      gl.deleteProgram(program);
      throw new Error(detail);
    }
    return program;
  }

  function createTailAnalyzer(createCanvas) {
    const canvas = createCanvas();
    const context = canvas && typeof canvas.getContext === "function"
      ? canvas.getContext("2d", { willReadFrequently: true })
      : null;
    const cache = new WeakMap();

    if (!context) {
      return function fallbackTailSide() {
        return true;
      };
    }

    canvas.width = 48;
    canvas.height = 24;

    return function tailOnLeft(image) {
      if (!image || (typeof image !== "object" && typeof image !== "function")) {
        return true;
      }
      if (cache.has(image)) {
        return cache.get(image);
      }

      let result = true;
      try {
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const pixels = context.getImageData(
          0,
          0,
          canvas.width,
          canvas.height
        ).data;
        let leftAlpha = 0;
        let rightAlpha = 0;
        const edgeWidth = Math.floor(canvas.width * 0.36);

        for (let y = 0; y < canvas.height; y += 1) {
          for (let x = 0; x < edgeWidth; x += 1) {
            leftAlpha += pixels[(y * canvas.width + x) * 4 + 3];
            const rightX = canvas.width - 1 - x;
            rightAlpha += pixels[(y * canvas.width + rightX) * 4 + 3];
          }
        }

        const difference = Math.abs(leftAlpha - rightAlpha);
        const meaningfulDifference = difference
          > Math.max(leftAlpha, rightAlpha) * 0.035;
        result = meaningfulDifference ? leftAlpha < rightAlpha : true;
      } catch (_error) {
        result = true;
      }

      cache.set(image, result);
      return result;
    };
  }

  function createRenderer(options) {
    const settings = options || {};
    const createCanvas = typeof settings.createCanvas === "function"
      ? settings.createCanvas
      : function defaultCreateCanvas() {
        return document.createElement("canvas");
      };
    const canvas = createCanvas();
    if (!canvas || typeof canvas.getContext !== "function") {
      return createUnavailableRenderer();
    }

    canvas.width = FRAME_WIDTH;
    canvas.height = FRAME_HEIGHT;

    const gl = canvas.getContext("webgl", {
      alpha: true,
      antialias: true,
      depth: false,
      premultipliedAlpha: true,
      preserveDrawingBuffer: true,
      stencil: false
    });
    if (!gl) {
      return createUnavailableRenderer();
    }

    let available = true;
    let program;
    let positionBuffer;
    let indexBuffer;
    let indexCount = 0;
    let locations;
    let textureCache = new WeakMap();
    const tailOnLeft = createTailAnalyzer(createCanvas);

    function initialize() {
      program = createProgram(gl);
      const mesh = buildMesh(
        settings.columns || DEFAULT_COLUMNS,
        settings.rows || DEFAULT_ROWS
      );
      positionBuffer = gl.createBuffer();
      indexBuffer = gl.createBuffer();
      if (!positionBuffer || !indexBuffer) {
        throw new Error("Unable to create WebGL mesh buffers");
      }

      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array(mesh.vertices),
        gl.STATIC_DRAW
      );
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
      gl.bufferData(
        gl.ELEMENT_ARRAY_BUFFER,
        new Uint16Array(mesh.indices),
        gl.STATIC_DRAW
      );
      indexCount = mesh.indices.length;

      locations = {
        position: gl.getAttribLocation(program, "a_position"),
        texCoord: gl.getAttribLocation(program, "a_texCoord"),
        time: gl.getUniformLocation(program, "u_time"),
        amplitude: gl.getUniformLocation(program, "u_amplitude"),
        frequency: gl.getUniformLocation(program, "u_frequency"),
        phase: gl.getUniformLocation(program, "u_phase"),
        headStability: gl.getUniformLocation(program, "u_headStability"),
        tailOnLeft: gl.getUniformLocation(program, "u_tailOnLeft"),
        motionMode: gl.getUniformLocation(program, "u_motionMode"),
        bendAxis: gl.getUniformLocation(program, "u_bendAxis"),
        texture: gl.getUniformLocation(program, "u_texture")
      };

      gl.useProgram(program);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.disable(gl.DEPTH_TEST);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, TEXTURE_FLIP_Y);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.clearColor(0, 0, 0, 0);
      gl.viewport(0, 0, canvas.width, canvas.height);

      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
      gl.enableVertexAttribArray(locations.position);
      gl.vertexAttribPointer(
        locations.position,
        2,
        gl.FLOAT,
        false,
        16,
        0
      );
      gl.enableVertexAttribArray(locations.texCoord);
      gl.vertexAttribPointer(
        locations.texCoord,
        2,
        gl.FLOAT,
        false,
        16,
        8
      );
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
      gl.uniform1i(locations.texture, 0);
      textureCache = new WeakMap();
    }

    function textureFor(image) {
      if (textureCache.has(image)) {
        return textureCache.get(image);
      }
      const texture = gl.createTexture();
      if (!texture) {
        return null;
      }
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        image
      );
      textureCache.set(image, texture);
      return texture;
    }

    try {
      initialize();
    } catch (error) {
      available = false;
      console.warn("WebGL fish mesh unavailable", error);
    }

    if (typeof canvas.addEventListener === "function") {
      canvas.addEventListener("webglcontextlost", (event) => {
        if (event && typeof event.preventDefault === "function") {
          event.preventDefault();
        }
        available = false;
      });
      canvas.addEventListener("webglcontextrestored", () => {
        try {
          initialize();
          available = true;
        } catch (error) {
          available = false;
          console.warn("WebGL fish mesh restore failed", error);
        }
      });
    }

    return {
      get available() {
        return available;
      },
      render(image, fish) {
        if (!available || !image) {
          return false;
        }

        try {
          const texture = textureFor(image);
          if (!texture) {
            return false;
          }
          const motion = calculateMotion(fish);
          const isTailOnLeft = tailOnLeft(image);

          gl.viewport(0, 0, canvas.width, canvas.height);
          gl.clear(gl.COLOR_BUFFER_BIT);
          gl.useProgram(program);
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, texture);
          gl.uniform1f(
            locations.time,
            Math.max(0, Number(fish && fish.time) || 0) / 1000
          );
          gl.uniform1f(locations.amplitude, motion.amplitude);
          gl.uniform1f(locations.frequency, motion.frequency);
          gl.uniform1f(locations.phase, motion.phase);
          gl.uniform1f(locations.headStability, motion.headStability);
          gl.uniform1f(locations.tailOnLeft, isTailOnLeft ? 1 : 0);
          gl.uniform1f(locations.motionMode, motion.motionMode);
          gl.uniform2f(
            locations.bendAxis,
            motion.bendAxisX,
            motion.bendAxisY
          );
          gl.drawElements(
            gl.TRIANGLES,
            indexCount,
            gl.UNSIGNED_SHORT,
            0
          );
          gl.flush();

          return {
            canvas,
            contentScaleX: CONTENT_SCALE_X,
            contentScaleY: CONTENT_SCALE_Y,
            tailOnLeft: isTailOnLeft
          };
        } catch (error) {
          available = false;
          console.warn("WebGL fish mesh render failed", error);
          return false;
        }
      }
    };
  }

  root.AquariumWebGLFishMesh = {
    buildMesh,
    calculateMotion,
    createRenderer,
    resolveCustomFishMotion,
    resolveMotionMode,
    resolveSourceFacing,
    textureFlipY: TEXTURE_FLIP_Y,
    vertexShaderSource
  };
})(globalThis);

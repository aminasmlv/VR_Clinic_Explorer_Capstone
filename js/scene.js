"use strict";

(() => {
  const THREE = AFRAME.THREE;
  const $ = id => document.getElementById(id);

  const C = {
    teal: "#087F8C",
    navy: "#163E50",
    coral: "#D75B43",
    gold: "#E8A434",
    green: "#287B63",
    purple: "#7153A1"
  };

  const stages = [
    ["Welcome", "Meet the guide. Select CHECK IN, then continue."],
    ["Examination", "Explore the three labelled stations. Select an object or its button."],
    ["Preparation and Finish", "Practise with three questions. You can try again."]
  ];

  const tools = [
    ["stethoscope", "Stethoscope", "A stethoscope helps the doctor listen to your heartbeat and breathing."],
    ["thermometer", "Thermometer", "A thermometer measures your body temperature."],
    ["bed", "Examination bed", "The examination bed is a place to sit or lie down during a check-up."]
  ];

  const quiz = [
    ["Which tool helps the doctor listen to your heartbeat?", ["Stethoscope", "Thermometer", "Examination bed"], 0],
    ["Which tool measures your temperature?", ["Examination bed", "Thermometer", "Stethoscope"], 1],
    ["What can you do if you need a pause?", ["Say nothing", "Keep quiet", "Ask the doctor"], 2]
  ];

  let stage = 0, checkedIn = false, explored = new Set();
  let question = 0, firstCorrect = 0, attempts = 0, complete = false;
  let scene, camera, player, groups, taskText, quizText, quizFeedback;
  let checkButton, backButton, nextButton, restartButton, quizButtons, toolButtons;
  let visitBadge, statusPanel;

  const textureCache = new Map();

  let mode = "mouse", hover = null, hoverSince = 0;
  let gazeLocked = false, lockUntil = 0;
  let pointer = null, press = null, dragDistance = 0;

  const targets = [], keys = new Set();
  const ray = new THREE.Raycaster();
  const origin = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const rotation = new THREE.Quaternion();

  function entity(tag, attrs, parent) {
    const el = document.createElement(tag);
    Object.entries(attrs).forEach(([key, val]) => el.setAttribute(key, val));
    parent.appendChild(el);
    return el;
  }

  function group(parent, position = "0 0 0") {
    return entity("a-entity", { position }, parent);
  }

  function box(parent, position, size, color) {
    const [width, height, depth] = size.split(" ");
    return entity("a-box", {
      position,
      width,
      height,
      depth,
      shadow: "cast: true; receive: true",
      material: `shader: standard; roughness: 0.85; color: ${color}`
    }, parent);
  }

  function text(parent, message, position, width = 3, wrap = 28, color = C.navy) {
    return entity("a-text", {
      value: message,
      position,
      width,
      "wrap-count": wrap,
      align: "center",
      color,
      "baseline": "center"
    }, parent);
  }

  function setText(el, message) {
    el.setAttribute("value", message);
  }

  function shape(parent, tag, attrs, color) {
    return entity(tag, {
      ...attrs,
      shadow: "cast: true; receive: true",
      material: `shader: standard; roughness: 0.8; color: ${color}`
    }, parent);
  }

  function button(parent, label, position, width, action, color = C.teal) {
    const el = entity("a-plane", {
      position,
      width,
      height: 0.43,
      material: `shader: flat; color: ${color}`
    }, parent);

    const labelEl = text(
      el,
      label,
      "0 0 0.015",
      width * 0.92,
      Math.max(25, label.length + 4),
      "#FFFFFF"
    );

    const item = { el, label: labelEl, action, color, enabled: true };
    targets.push(item);
    return item;
  }

  function enable(item, enabled) {
    item.enabled = enabled;
    item.el.setAttribute("visible", enabled);
  }

  function isVisible(item) {
    if (!item.enabled || !item.el.object3D) return false;

    for (let obj = item.el.object3D; obj; obj = obj.parent) {
      if (!obj.visible) return false;
    }

    return true;
  }

  function clearHover() {
    if (hover) hover.el.setAttribute("material", "color", hover.color);
    hover = null;
    $("gazeProgress").setAttribute("theta-length", 0);
  }

  function guardTransition() {
    clearHover();
    gazeLocked = true;
    lockUntil = performance.now() + 500;
  }

  function status(message) {
    $("taskStatus").textContent = message;
    setText(taskText, message);
  }

  function showStage(index) {
    if (index < 0 || index > 2) return;

    stage = index;
    statusPanel.setAttribute("visible", stage !== 2);
    groups.forEach((el, i) => el.setAttribute("visible", i === stage));

    $("stageTitle").textContent = stages[stage][0];
    $("description").textContent = stages[stage][1];
    $("stepCount").textContent = `${stage + 1} / 3`;
    $("backButton").disabled = stage === 0;
    $("nextButton").disabled = stage === 2;

    enable(backButton, stage > 0);
    enable(nextButton, stage < 2);
    guardTransition();

    if (stage === 0) {
      status(checkedIn
        ? "Checked in! Select Next when ready."
        : "Select CHECK IN to begin your visit.");
    }

    if (stage === 1) {
      status(`Objects explored: ${explored.size} / 3. Select the labelled stations.`);
    }

    if (stage === 2) {
      status(complete
        ? "Tour complete! You can start again."
        : `Question ${question + 1} of 3. Choose an answer.`);
    }
  }

  function explore(index) {
    if (stage !== 1) return;

    const [key, name, explanation] = tools[index];
    explored.add(key);

    toolButtons[index].color = C.green;
    toolButtons[index].el.setAttribute("material", "color", C.green);
    setText(toolButtons[index].label, name);
    setText(toolButtons[index].badge, "EXPLORED");

    status(`${explored.size} / 3 explored. ${explanation}`);
  }

  function renderQuiz() {
    setText(
      quizText,
      complete ? "Well done! You completed the tour." : quiz[question][0]
    );

    quizButtons.forEach((item, i) => {
      enable(item, !complete);
      if (!complete) setText(item.label, quiz[question][1][i]);
    });

    enable(restartButton, complete);

    setText(
      quizFeedback,
      complete
        ? `3 questions completed.\n${firstCorrect} correct on the first try.\nYou can always ask for a pause.`
        : `Question ${question + 1} / 3. Take your time.`
    );
  }

  function answer(index) {
    if (stage !== 2 || complete) return;

    attempts++;

    if (index !== quiz[question][2]) {
      setText(quizFeedback, "Not quite. Try another answer.");
      status("You can try again. Learning takes practice.");
      return;
    }

    if (attempts === 1) firstCorrect++;

    question++;
    attempts = 0;
    complete = question === quiz.length;

    renderQuiz();
    guardTransition();

    status(complete
      ? "Tour complete! Select Start again to repeat."
      : `Correct! Now answer question ${question + 1}.`);
  }

  function restart() {
    if (!complete || stage !== 2) return;

    checkedIn = false;
    explored.clear();
    question = 0;
    firstCorrect = 0;
    attempts = 0;
    complete = false;

    setText(checkButton.label, "CHECK IN");
    setText(visitBadge, "Your visitor pass appears here");
    $("guideModel")?.setAttribute("animation-mixer", "clip: Wave; loop: repeat");

    toolButtons.forEach((item, i) => {
      item.color = C.teal;
      item.el.setAttribute("material", "color", item.color);
      setText(item.label, tools[i][1]);
      setText(item.badge, "SELECT TO EXPLORE");
    });

    window.ClinicGuide?.stopListening(false);

    // Manual selection also invalidates a pending AI response.
    window.ClinicGuide?.chooseTopic("checkup");

    $("questionInput").value = "";
    renderQuiz();
    showStage(0);
  }

  // Original lightweight textures generated locally.
  function texture(kind) {
    if (textureCache.has(kind)) return textureCache.get(kind);

    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 256;

    const ctx = canvas.getContext("2d");
    ctx.fillStyle = kind === "wood" ? "#e6caa2" : "#f4f6ee";
    ctx.fillRect(0, 0, 256, 256);

    if (kind === "tiles") {
      ctx.fillStyle = "#d3e8e2";
      ctx.fillRect(0, 0, 128, 128);
      ctx.fillRect(128, 128, 128, 128);
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 3;

      for (let n = 0; n <= 256; n += 128) {
        ctx.beginPath();
        ctx.moveTo(n, 0);
        ctx.lineTo(n, 256);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(0, n);
        ctx.lineTo(256, n);
        ctx.stroke();
      }
    } else {
      for (let n = 0; n < 160; n++) {
        const y = (n * 47) % 256;
        ctx.strokeStyle = kind === "wood" ? "#b68b5b25" : "#769c8d15";
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.bezierCurveTo(80, y - 4, 170, y + 5, 256, y);
        ctx.stroke();
      }
    }

    const result = new THREE.CanvasTexture(canvas);
    result.colorSpace = THREE.SRGBColorSpace;
    result.wrapS = result.wrapT = THREE.RepeatWrapping;
    result.repeat.set(kind === "tiles" ? 6 : 2, kind === "tiles" ? 6 : 2);

    textureCache.set(kind, result);
    return result;
  }

  function textured(el, kind) {
    const apply = () => {
      const mesh = el.getObject3D("mesh");
      if (!mesh) return;
      mesh.material.map = texture(kind);
      mesh.material.needsUpdate = true;
    };

    el.addEventListener("object3dset", apply);
    el.addEventListener("loaded", apply, { once: true });
    apply();

    return el;
  }

  function panel(parent, position, width, height, color = "#FFFFFF") {
    return entity("a-plane", {
      position,
      width,
      height,
      material: `shader: flat; color: ${color}`
    }, parent);
  }

  function plant(parent, position) {
    const pot = group(parent, position);

    shape(pot, "a-cylinder", {
      radius: 0.21,
      height: 0.38,
      position: "0 0.19 0"
    }, "#EDAA7A");

    [-0.16, 0, 0.16].forEach((x, i) => {
      shape(pot, "a-sphere", {
        radius: 0.28,
        position: `${x} ${0.68 + (i % 2) * 0.22} 0`,
        scale: "0.7 1.4 0.7"
      }, "#62A57B");
    });
  }

  function bench(parent, position, color) {
    const g = group(parent, position);

    box(g, "0 0.48 0", "1.7 0.23 0.7", color);
    box(g, "0 0.88 -0.29", "1.7 0.72 0.16", color);

    [-0.7, 0.7].forEach(x => {
      box(g, `${x} 0.2 0`, "0.1 0.4 0.5", "#A7B7BA");
    });

    box(g, "-0.45 0.66 0", "0.5 0.14 0.5", "#FFF4D8");
    box(g, "0.43 0.66 0", "0.5 0.14 0.5", "#D7EEEF");
  }

  function picture(parent, position, color) {
    const g = group(parent, position);

    box(g, "0 0 -0.04", "1.08 0.88 0.08", "#E7CA9E");
    panel(g, "0 0 0.01", 0.94, 0.74, "#FFFFFF");

    shape(g, "a-circle", {
      position: "-0.2 0.15 0.025",
      radius: 0.13
    }, "#F2C15D");

    shape(g, "a-triangle", {
      position: "0 -0.12 0.03",
      scale: "0.7 0.55 1"
    }, color);
  }
function decorativeDoor(parent, position) {
  const door = group(parent, position);
  door.setAttribute("rotation", "0 90 0");

  // Door panel and light frame.
  box(door, "0 1.15 0", "1.18 2.3 0.08", "#B9825A");
  box(door, "-0.64 1.18 0.02", "0.12 2.5 0.16", "#F3E2C5");
  box(door, "0.64 1.18 0.02", "0.12 2.5 0.16", "#F3E2C5");
  box(door, "0 2.38 0.02", "1.4 0.14 0.16", "#F3E2C5");
  box(door, "0 0.08 0.02", "1.4 0.14 0.16", "#F3E2C5");

  // Small window in the door and a handle.
  panel(door, "0 1.72 0.055", 0.48, 0.42, "#AFE3F6");
  shape(door, "a-sphere", {
    position: "0.43 1.05 0.09",
    radius: 0.055
  }, "#E8A434");
}

function medicalCart(parent, position) {
  const cart = group(parent, position);
  cart.setAttribute("rotation", "0 90 0");

  // Cart top and lower shelf.
  box(cart, "0 0.92 0", "1.3 0.1 0.58", "#FFFFFF");
  box(cart, "0 0.38 0", "1.15 0.08 0.5", "#D7EEEF");

  // Four legs now reach down close to the floor.
  [-0.52, 0.52].forEach(x => {
    [-0.2, 0.2].forEach(z => {
      box(cart, `${x} 0.47 ${z}`, "0.07 0.82 0.07", "#9BAEB8");

      shape(cart, "a-cylinder", {
        position: `${x} 0.08 ${z}`,
        radius: 0.08,
        height: 0.05,
        rotation: "90 0 0"
      }, "#536E7A");
    });
  });

  // Tray and pretend clinic supplies.
  box(cart, "-0.18 1.02 0", "0.52 0.035 0.32", "#BEDDD1");

  shape(cart, "a-cylinder", {
    position: "-0.38 1.16 0",
    radius: 0.075,
    height: 0.24
  }, "#73BBB4");

  shape(cart, "a-cylinder", {
    position: "0.12 1.13 0",
    radius: 0.09,
    height: 0.18
  }, "#F2C56A");

  box(cart, "0.37 1.08 0", "0.2 0.1 0.2", "#F6F3FF");
}
function medicalCabinet(parent, position) {
  const cabinet = group(parent, position);
  cabinet.setAttribute("rotation", "0 90 0");

  // Cabinet body sits directly on the floor.
  box(cabinet, "0 1.05 0", "1.0 2.1 0.48", "#EDF6F4");
  box(cabinet, "0 0.12 0.02", "1.08 0.16 0.56", "#9BAEB8");
  box(cabinet, "0 2.12 0", "1.12 0.12 0.58", "#FFFFFF");

  // Two pale glass doors and small handles.
  panel(cabinet, "-0.24 1.18 0.25", 0.38, 1.55, "#D7EEEF");
  panel(cabinet, "0.24 1.18 0.25", 0.38, 1.55, "#D7EEEF");

  box(cabinet, "0 1.18 0.28", "0.035 1.6 0.04", "#A7CBCD");

  shape(cabinet, "a-sphere", {
    position: "-0.05 1.15 0.3",
    radius: 0.035
  }, "#E8A434");

  shape(cabinet, "a-sphere", {
    position: "0.05 1.15 0.3",
    radius: 0.035
  }, "#E8A434");

  // Visible supplies on the shelves behind the glass.
  box(cabinet, "-0.23 0.75 0.12", "0.16 0.28 0.12", "#73BBB4");
  box(cabinet, "0.22 0.75 0.12", "0.16 0.28 0.12", "#F2C56A");
  box(cabinet, "-0.22 1.55 0.12", "0.18 0.3 0.12", "#AE98CF");
  box(cabinet, "0.2 1.55 0.12", "0.18 0.3 0.12", "#EAAE82");
}
function finishShelf(parent, position) {
  const shelf = group(parent, position);
  shelf.setAttribute("rotation", "0 90 0");

  box(shelf, "0 0.72 0", "1.15 1.44 0.12", "#E7C998");
  box(shelf, "0 0.18 0.1", "1.3 0.12 0.35", "#FFFFFF");
  box(shelf, "0 0.78 0.1", "1.3 0.12 0.35", "#FFFFFF");
  box(shelf, "0 1.38 0.1", "1.3 0.12 0.35", "#FFFFFF");

  // Colourful books on the shelves.
  box(shelf, "-0.38 0.46 0.12", "0.16 0.42 0.2", "#73BBB4");
  box(shelf, "-0.18 0.46 0.12", "0.16 0.42 0.2", "#AE98CF");
  box(shelf, "0.04 0.46 0.12", "0.16 0.42 0.2", "#EAAE82");

  box(shelf, "-0.32 1.06 0.12", "0.18 0.42 0.2", "#F2C56A");
  box(shelf, "-0.1 1.06 0.12", "0.18 0.42 0.2", "#73BBB4");
  box(shelf, "0.14 1.06 0.12", "0.18 0.42 0.2", "#AE98CF");
}
function sideWindow(parent, position) {
  const windowGroup = group(parent, position);
  windowGroup.setAttribute("rotation", "0 90 0");

  // Window frame and blue glass.
  box(windowGroup, "0 0 0", "1.65 1.4 0.1", "#F3E2C5");
  panel(windowGroup, "0 0 0.06", 1.48, 1.22, "#AFE3F6");

  // Window dividers.
  box(windowGroup, "0 0 0.1", "0.055 1.22 0.05", "#FFFFFF");
  box(windowGroup, "0 0 0.1", "1.48 0.055 0.05", "#FFFFFF");

  // A small sun detail.
  shape(windowGroup, "a-circle", {
    position: "0.42 0.32 0.13",
    radius: 0.12
  }, "#FFD66D");
}
  // Room surfaces receive shadows but do not block the room's light.
  function architecture(parent, position, size, color, kind) {
    const el = box(parent, position, size, color);
    el.setAttribute("shadow", "cast: false; receive: true");
    if (kind) textured(el, kind);
    return el;
  }

  function buildWorld() {
    const world = $("world");

    architecture(world, "0 -0.09 0", "12 0.18 14", "#FFFFFF", "tiles");
    architecture(world, "0 2.3 -5", "12 4.6 0.12", "#FFF9ED", "wall");
    architecture(world, "-6 2.3 0", "0.12 4.6 14", "#D3EFF0");
    architecture(world, "6 2.3 0", "0.12 4.6 14", "#E4E3F5");
    architecture(world, "0 2.3 6.8", "12 4.6 0.12", "#F6F2E8");
    architecture(world, "0 4.65 0", "12 0.1 14", "#FFFFFF");
    architecture(world, "0 0.45 -4.9", "12 0.65 0.06", "#9BD2C7");
    architecture(world, "0 0.83 -4.85", "12 0.07 0.08", "#FFFFFF");

    [-3, 0, 3].forEach(x => {
      architecture(world, `${x} 4.52 -1`, "1.5 0.06 0.7", "#FFF9DD");
    });

    // Window and outdoor scenery.
    const view = group(world, "-3.7 2.8 -4.82");

    panel(view, "0 0 0", 2.35, 1.65, "#AFE3F6");
    shape(view, "a-circle", {
      position: "0.65 0.45 0.02",
      radius: 0.19
    }, "#FFD66D");

    [-0.7, 0, 0.8].forEach((x, i) => {
      shape(view, "a-circle", {
        position: `${x} -0.53 0.03`,
        radius: 0.36,
        scale: "1 0.7 1"
      }, i % 2 ? "#80BF96" : "#9BCC9C");
    });

    box(view, "0 0 -0.04", "2.55 1.85 0.05", "#FFFFFF");

    [-1.2, 0, 1.2].forEach(x => {
      box(view, `${x} 0 0.07`, "0.065 1.78 0.08", "#FFFFFF");
    });

    [-0.87, 0.87].forEach(y => {
      box(view, `0 ${y} 0.07`, "2.46 0.06 0.08", "#FFFFFF");
    });

    textured(box(view, "0 -0.96 0.1", "2.65 0.1 0.38", "#FFFFFF"), "wood");

    picture(world, "2.7 2.8 -4.85", "#73BBB4");
    picture(world, "4.1 2.8 -4.85", "#AE98CF");
    plant(world, "-5 0 -4");
    plant(world, "5.15 0 -4.2");

    groups = [group(world), group(world), group(world)];
    const [welcome, exam, finish] = groups;

    // Welcome room.
    sideWindow(welcome, "-5.88 2.7 -0.3");
plant(welcome, "-4.8 0 2.8");
    decorativeDoor(welcome, "-5.82 0 1.8");
    panel(welcome, "0 3.62 -4.7", 4.7, 0.92, "#FFFFFF");
    text(welcome, "WELCOME, LITTLE EXPLORER!", "0 3.85 -4.66", 4.3, 35, C.teal);
    text(welcome, "Say hello. Explore. Ask questions.", "0 3.42 -4.66", 4, 39);

    const reception = group(welcome, "-1.65 0 -2.7");

    box(reception, "0 0.6 0", "2.5 1.2 0.85", "#57B8AF");
    textured(box(reception, "0 1.24 0", "2.7 0.12 1", "#FFFFFF"), "wood");

    [-0.9, -0.6, -0.3, 0, 0.3, 0.6, 0.9].forEach(x => {
      box(reception, `${x} 0.5 0.44`, "0.035 0.85 0.025", "#A4DFD4");
    });

    panel(reception, "0 0.85 0.48", 1.4, 0.35, "#FFFFFF");
    text(reception, "RECEPTION", "0 0.85 0.5", 1.3, 19, C.teal);
    box(reception, "-0.8 1.54 -0.1", "0.5 0.35 0.06", "#294B5D");
    box(reception, "-0.8 1.34 0", "0.35 0.05 0.25", "#829DA9");
    box(reception, "0.8 1.36 0", "0.36 0.12 0.3", "#F2C56A");

    checkButton = button(
      welcome,
      "CHECK IN",
      "-1.65 1.85 -2.12",
      1.65,
      () => {
        if (stage !== 0) return;
        checkedIn = true;
        setText(checkButton.label, "CHECKED IN");
        setText(visitBadge, `VISITOR PASS READY
Little explorer
Next stop: the examination room`);
        $("guideModel").setAttribute("animation-mixer", "clip: Wave; loop: repeat");
        status("Welcome! Your visitor pass is ready. Select Next when you are ready.");
      },
      C.coral
    );

    panel(welcome, "0.2 1.68 -4.6", 1.8, 0.75, "#FFF1C7");
    visitBadge = text(
      welcome,
      "Your visitor pass appears here",
      "0.2 1.68 -4.56",
      1.65,
      24
    );

    const robot = entity("a-entity", {
      id: "guideModel",
      "gltf-model": "url(./assets/models/RobotExpressive.glb)",
      "animation-mixer": "clip: Wave; loop: repeat",
      position: "1.55 0 -2.9",
      scale: "0.38 0.38 0.38"
    }, welcome);

    robot.addEventListener("model-loaded", () => {
      $("assetStatus").hidden = true;
    });

    robot.addEventListener("model-error", () => {
      $("assetStatus").textContent = "Guide model unavailable. The tour still works.";
    });

    bench(welcome, "-4 0 -3.7", "#EAAE82");
    bench(welcome, "3.4 0 -4", "#9DABD5");

    const table = group(welcome, "3.4 0 -2.9");

    shape(table, "a-cylinder", {
      position: "0 0.55 0",
      radius: 0.42,
      height: 0.08
    }, "#E7C998");

    shape(table, "a-cylinder", {
      position: "0 0.28 0",
      radius: 0.07,
      height: 0.55
    }, "#A4B9BE");

    // Examination room.
    sideWindow(exam, "-5.88 2.7 -0.3");
plant(exam, "-5 0 4.8");
    decorativeDoor(exam, "-5.82 0 1.8");
medicalCart(exam, "-5.55 0 0.15");
medicalCabinet(exam, "-5.55 0 4.0");
    panel(exam, "0 3.62 -4.7", 4.7, 0.92, "#FFFFFF");
    text(exam, "DISCOVER THE EXAMINATION ROOM", "0 3.85 -4.66", 4.3, 39, C.teal);
    text(exam, "Two instruments on the left. A bed on the right.", "0 3.42 -4.66", 4.3, 46);

    toolButtons = [];

    [-3.7, -1.95].forEach((x, i) => {
      const station = group(exam, `${x} 0 -2.65`);
      station.setAttribute("rotation", `0 ${i === 0 ? 20 : 10} 0`);

      textured(box(station, "0 0.53 0", "1.4 1.06 0.8", "#FFFFFF"), "wood");
      box(station, "0 1.1 0", "1.5 0.08 0.9", "#FFFFFF");

      const model = group(station, "0 1.7 0");

      if (i === 0) {
        shape(model, "a-torus", {
          radius: 0.23,
          "radius-tubular": 0.028,
          arc: 250,
          rotation: "0 0 -35"
        }, C.teal);

        shape(model, "a-cylinder", {
          position: "0 -0.27 0",
          radius: 0.028,
          height: 0.25
        }, C.teal);

        shape(model, "a-cylinder", {
          position: "0 -0.42 0",
          radius: 0.11,
          height: 0.04,
          rotation: "90 0 0"
        }, "#A9BEC4");

        [-0.18, 0.18].forEach(x => {
          shape(model, "a-cylinder", {
            position: `${x} 0.25 0`,
            radius: 0.018,
            height: 0.28,
            rotation: `0 0 ${x < 0 ? -15 : 15}`
          }, "#A9BEC4");

          shape(model, "a-sphere", {
            position: `${x} 0.4 0`,
            radius: 0.04
          }, C.navy);
        });
      } else {
        box(model, "0 0 0", "0.23 0.65 0.13", "#F9FFFF");
        panel(model, "0 0.1 0.07", 0.17, 0.18, "#BEDDD1");
        text(model, "TEMP", "0 0.1 0.08", 0.15, 6);

        shape(model, "a-cylinder", {
          position: "0 -0.42 0",
          radius: 0.025,
          height: 0.25
        }, "#B2C8CF");

        shape(model, "a-circle", {
          position: "0 -0.13 0.075",
          radius: 0.035
        }, C.teal);
      }

      const hit = button(station, "", "0 1.7 0.45", 1.35, () => explore(i));
      hit.el.setAttribute("height", 1.15);
      hit.el.setAttribute("material", "opacity", 0);
      hit.el.setAttribute("material", "transparent", true);
      hit.el.setAttribute("material", "depthWrite", false);

      const item = button(
        station,
        tools[i][1],
        "0 0.8 0.44",
        1.42,
        () => explore(i)
      );

      item.badge = text(
        station,
        "SELECT TO EXPLORE",
        "0 0.43 0.45",
        1.3,
        28,
        C.navy
      );

      toolButtons.push(item);
    });

    // Bed positioned on the right side.
    const bed = group(exam, "3.3 0 -2.65");
    bed.setAttribute("rotation", "0 -55 0");

    box(bed, "0 0.73 0", "2.65 0.16 1.12", "#9BAEB8");
    box(bed, "0 0.88 0", "2.6 0.2 1.08", "#64B7CD");
    box(bed, "0.96 1.08 0", "0.57 0.16 0.88", "#FFFFFF");

    [-1.05, 1.05].forEach(x => {
      [-0.4, 0.4].forEach(z => {
        box(bed, `${x} 0.4 ${z}`, "0.09 0.65 0.09", "#99ADB5");

        shape(bed, "a-cylinder", {
          position: `${x} 0.1 ${z}`,
          radius: 0.09,
          height: 0.055,
          rotation: "90 0 0"
        }, "#536E7A");
      });
    });

    const bedHit = button(bed, "", "0 0.9 0.57", 2.7, () => explore(2));
    bedHit.el.setAttribute("height", 0.6);
    bedHit.el.setAttribute("material", "opacity", 0);
    bedHit.el.setAttribute("material", "transparent", true);
    bedHit.el.setAttribute("material", "depthWrite", false);

    const bedButton = button(
      bed,
      "Examination bed",
      "0 1.55 0.35",
      2,
      () => explore(2)
    );

    bedButton.badge = text(bed, "SELECT TO EXPLORE", "0 1.2 0.37", 1.8, 32);
    toolButtons.push(bedButton);

    const cabinet = group(exam, "4.4 0 -4.1");

    box(cabinet, "0 0.8 0", "1 1.6 0.5", "#EDF6F4");

    [0.45, 0.85, 1.25].forEach(y => {
      box(cabinet, `0 ${y} 0.27`, "0.85 0.035 0.03", "#90B4B1");
      box(cabinet, `0 ${y + 0.13} 0.3`, "0.23 0.04 0.04", "#6A9099");
    });

    shape(exam, "a-cylinder", {
      position: "4.8 0.55 -2",
      radius: 0.32,
      height: 0.14
    }, "#E4C57F");

    shape(exam, "a-cylinder", {
      position: "4.8 0.25 -2",
      radius: 0.055,
      height: 0.5
    }, "#9BAEB8");

    // Finish room: furniture surrounds a wall-mounted quiz display.
    plant(finish, "-5.0 0 4.8");
    decorativeDoor(finish, "-5.82 0 1.8");
    finishShelf(finish, "-5.65 0 -0.2");
    bench(finish, "-4 0 -3.8", "#B3A0D0");
    bench(finish, "3.7 0 -4", "#E6B092");

    const sideArt = group(finish, "-5.9 2.5 -1.8");
    sideArt.setAttribute("rotation", "0 90 0");
    picture(sideArt, "0 0 0", "#DB9EAD");

    architecture(finish, "0 2.62 -4.78", "4.3 3.26 0.16", "#234B5D");
    panel(finish, "0 2.62 -4.68", 4.12, 3.08, "#F6F3FF");

    text(
      finish,
      "A LITTLE CHECK-UP CHALLENGE",
      "0 3.95 -4.64",
      3.8,
      39,
      C.purple
    );

    quizText = text(finish, "", "0 3.38 -4.63", 3.7, 36);

    quizButtons = [0, 1, 2].map(i => button(
      finish,
      "Answer",
      `0 ${2.74 - i * 0.53} -4.6`,
      3.5,
      () => answer(i),
      C.purple
    ));

    quizFeedback = text(finish, "", "0 1.42 -4.63", 3.8, 46);
    restartButton = button(
      finish,
      "START AGAIN",
      "0 2.4 -4.6",
      2.9,
      restart,
      C.coral
    );

    // Guide panel on the right, outside the main furniture area.
    const guide = group(world, "5.25 0 0.2");
    guide.setAttribute("rotation", "0 -65 0");

    panel(guide, "0 1.85 -0.02", 2.3, 3.5, "#FFFFFF");
    text(guide, "CLINIC GUIDE", "0 3.17 0.02", 2, 27, C.teal);

    const response = text(
      guide,
      $("aiResponse").textContent,
      "0 2.6 0.02",
      2.04,
      38
    );

    response.id = "vrResponse";

    button(
      guide,
      "ASK / CANCEL VOICE",
      "0 1.98 0.04",
      2.05,
      () => window.startVoiceQuestion?.()
    );

    text(guide, "Or select a topic", "0 1.64 0.02", 1.95, 32);

    ["stethoscope", "thermometer", "checkup"].forEach((key, i) => {
      button(
        guide,
        ["Stethoscope", "Thermometer", "Regular check-up"][i],
        `0 ${1.28 - i * 0.47} 0.04`,
        2.05,
        () => window.ClinicGuide?.chooseTopic(key)
      );
    });

    // Status is now on the wall, not in front of the furniture.
    statusPanel = group(world, "0 2.65 -4.67");
    panel(statusPanel, "0 0 0", 4.35, 0.62, "#FFF3CF");
    taskText = text(statusPanel, "", "0 0 0.025", 4.05, 48);

    const nav = group(world, "0 0 -2.55");

    backButton = button(
      nav,
      "BACK",
      "-0.82 0.6 0",
      1.45,
      () => showStage(stage - 1)
    );

    nextButton = button(
      nav,
      "NEXT",
      "0.82 0.6 0",
      1.45,
      () => showStage(stage + 1)
    );

    renderQuiz();
    showStage(0);
  }

  function gazeMode() {
    return scene.is("vr-mode") || mode === "gaze";
  }

  function pick() {
    if (!scene.camera) return null;

    scene.object3D.updateMatrixWorld(true);

    if (gazeMode()) {
      scene.camera.getWorldPosition(origin);
      scene.camera.getWorldQuaternion(rotation);
      direction.set(0, 0, -1).applyQuaternion(rotation);
      ray.set(origin, direction);
    } else {
      if (!pointer || press) return null;

      const rect = scene.canvas.getBoundingClientRect();

      ray.setFromCamera({
        x: (pointer.x - rect.left) / rect.width * 2 - 1,
        y: -(pointer.y - rect.top) / rect.height * 2 + 1
      }, scene.camera);
    }

    const active = targets.filter(isVisible);
    const hits = ray.intersectObjects(
      active.map(item => item.el.object3D),
      true
    );

    for (const hit of hits) {
      let obj = hit.object;

      while (obj) {
        const item = active.find(target => target.el.object3D === obj);
        if (item) return item;
        obj = obj.parent;
      }
    }

    return null;
  }

  function activate(item) {
    if (!item || !isVisible(item) || performance.now() < lockUntil) return;
    gazeLocked = true;
    item.action();
  }

  function tick(time, dt) {
    if (!scene?.canvas) return;

    const gaze = gazeMode();

    ["gazeOutline", "gazeRing", "gazeProgress"].forEach((id, i) => {
      const mesh = $(id).getObject3D("mesh");

      if (mesh) {
        mesh.renderOrder = 10000 + i;
        mesh.material.depthTest = false;
        mesh.material.depthWrite = false;
        mesh.material.transparent = true;
      }
    });

    $("gazeOutline").setAttribute("visible", gaze);
    $("gazeRing").setAttribute("visible", gaze);
    $("gazeProgress").setAttribute("visible", gaze);

    const hit = pick();

    if (hit !== hover) {
      clearHover();
      hover = hit;
      hoverSince = performance.now();
      if (hover) hover.el.setAttribute("material", "color", "#B76D18");
    }

    if (!hit) gazeLocked = false;

    scene.canvas.style.cursor = !gaze && hit ? "pointer" : "grab";

    if (gaze && hit && !gazeLocked && performance.now() >= lockUntil) {
      const fraction = Math.min((performance.now() - hoverSince) / 1500, 1);
      $("gazeProgress").setAttribute("theta-length", fraction * 360);
      if (fraction === 1) activate(hit);
    }

    if (
      !scene.is("vr-mode") &&
      $("walkEnabled").checked &&
      !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)
    ) {
      const dx =
        Number(keys.has("KeyD") || keys.has("ArrowRight")) -
        Number(keys.has("KeyA") || keys.has("ArrowLeft"));

      const dz =
        Number(keys.has("KeyS") || keys.has("ArrowDown")) -
        Number(keys.has("KeyW") || keys.has("ArrowUp"));

      const speed = Math.min(dt || 0, 40) / 1000 * 0.7;
      const yaw = camera.components["look-controls"]?.yawObject.rotation.y || 0;
      const length = Math.max(1, Math.hypot(dx, dz));

      const moveX = (dx * Math.cos(yaw) + dz * Math.sin(yaw)) / length;
      const moveZ = (-dx * Math.sin(yaw) + dz * Math.cos(yaw)) / length;

      const position = player.object3D.position;
      position.x = THREE.MathUtils.clamp(position.x + moveX * speed, -2.6, 2.6);
      position.z = THREE.MathUtils.clamp(position.z + moveZ * speed, 1.7, 5.6);
    }
  }

  function resetView() {
    if (scene.is("vr-mode")) return;

    player.object3D.position.set(0, 0, 3.8);

    const look = camera.components["look-controls"];

    if (look) {
      look.pitchObject.rotation.x = 0;
      look.yawObject.rotation.y = 0;
    }

    camera.setAttribute("rotation", "0 0 0");
    guardTransition();
  }

  function bindCanvas() {
    const canvas = scene.canvas;

    canvas.tabIndex = 0;
    canvas.setAttribute(
      "aria-label",
      "Clinic view. Drag to look. Optional WASD movement."
    );

    canvas.addEventListener("pointermove", event => {
      pointer = { x: event.clientX, y: event.clientY };

      if (press) {
        dragDistance = Math.max(
          dragDistance,
          Math.hypot(pointer.x - press.x, pointer.y - press.y)
        );
      }
    });

    canvas.addEventListener("pointerdown", event => {
      if (event.button !== 0) return;
      press = { x: event.clientX, y: event.clientY };
      dragDistance = 0;
      canvas.focus({ preventScroll: true });
    });

    canvas.addEventListener("pointerup", event => {
      if (!press || event.button !== 0) return;

      const wasClick = Math.max(
        dragDistance,
        Math.hypot(event.clientX - press.x, event.clientY - press.y)
      ) < 6;

      press = null;
      pointer = { x: event.clientX, y: event.clientY };

      if (!gazeMode() && wasClick) activate(pick());
    });

    canvas.addEventListener("pointerleave", () => {
      pointer = null;
      press = null;
    });

    canvas.addEventListener("pointercancel", () => {
      pointer = null;
      press = null;
    });
  }

  function boot() {
    scene = $("clinicScene");
    camera = $("camera");
    player = $("player");

    buildWorld();

    $("backButton").onclick = () => showStage(stage - 1);
    $("nextButton").onclick = () => showStage(stage + 1);
    $("resetView").onclick = resetView;
   
 $("inputMode").onchange = event => {
      mode = event.target.value;
      guardTransition();

      $("viewHint").textContent = mode === "mouse"
        ? "Click labelled buttons · Drag empty space to look around"
        : "Hold the ring on a button for 1.5 seconds · Look away before choosing again";
    };

    $("walkEnabled").onchange = () => {
      keys.clear();

      $("movementHelp").textContent = $("walkEnabled").checked
        ? "Movement ON. Click the scene, then use WASD or arrow keys. Desktop only."
        : "Stationary mode. Drag to look around. No walking is needed.";
    };

    window.addEventListener("keydown", event => {
      if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;

      if (
        $("walkEnabled").checked &&
        !scene.is("vr-mode") &&
        /^(Key[WASD]|Arrow(Up|Down|Left|Right))$/.test(event.code)
      ) {
        event.preventDefault();
      }

      if (!event.repeat) keys.add(event.code);
    });

    window.addEventListener("keyup", event => {
      keys.delete(event.code);
    });

    window.addEventListener("blur", () => {
      keys.clear();
      pointer = null;
      press = null;
    });

    scene.addEventListener("enter-vr", () => {
      document.body.classList.add("xr");
      keys.clear();
      $("walkEnabled").checked = false;
      $("movementHelp").textContent = "Stationary mode. Walking is disabled in VR.";
      guardTransition();
    });

    scene.addEventListener("exit-vr", () => {
      document.body.classList.remove("xr");
      guardTransition();
      window.dispatchEvent(new Event("resize"));
    });

    const ready = () => {
      bindCanvas();
      scene.setAttribute("clinic-interaction", "");
    };

    if (scene.hasLoaded && scene.canvas) {
      ready();
    } else {
      scene.addEventListener("loaded", ready, { once: true });
    }
  }

  AFRAME.registerComponent("clinic-interaction", { tick });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
// The crossing, drawn in matchsticks.
//
// Lifted from render-refs.html, which drew reference images for the machine
// experiment. Two changes: it draws into a canvas you hand it rather than
// appending one to the page, and it takes the claimed ground as well as the
// shape, because how deep the gap is depends on what the two of them said was
// under it — water, a drop in rock, or nothing anybody has described.
//
// A crossing is eight independent choices, and the primitives here are keyed on
// those choices rather than on a name, so every one of them draws without a
// case of its own.
(function (global) {
  const W = 1200, H = 700;
  const GAP_L = 430, GAP_R = 770, SPAN = GAP_R - GAP_L;
  const GROUND_Y = 392;
  const BED_STREAM = GROUND_Y + 128;      // a shallow bed
  const BED_CLEFT  = GROUND_Y + 286;      // a long drop
  const WATER_Y    = GROUND_Y + 66;
  const DECK_LOW   = GROUND_Y - 12;       // lying across, level with both banks
  const DECK_HIGH  = GROUND_Y - 132;      // slung above
  const MATCH = 74, THICK = 9, HEAD = 6.6;

  const C = { land:"#d9d2c4", land2:"#c9c1b1", water:"#a9c4d2",
              wood:"#b07a3c", woodDark:"#7d5227", head:"#3d2a15", paper:"#eee8dc" };

  const bedOf = world => world && world.rock ? BED_CLEFT
                       : world && world.water ? BED_STREAM
                       : GROUND_Y + 96;

  const wob = i => Math.sin(i * 12.9898) * 0.03;

  function lay(list, x1, y1, x2, y2) {
    const len = Math.hypot(x2 - x1, y2 - y1);
    const n = Math.max(1, Math.round(len / MATCH));
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = (i + 1) / n;
      list.push({ x1: x1 + (x2 - x1) * t0, y1: y1 + (y2 - y1) * t0,
                  x2: x1 + (x2 - x1) * t1, y2: y1 + (y2 - y1) * t1 });
    }
  }

  function drawMatch(ctx, m, i) {
    const cx = (m.x1 + m.x2) / 2, cy = (m.y1 + m.y2) / 2, a = wob(i);
    const rot = (px, py) => ({ x: cx + (px - cx) * Math.cos(a) - (py - cy) * Math.sin(a),
                               y: cy + (px - cx) * Math.sin(a) + (py - cy) * Math.cos(a) });
    const p1 = rot(m.x1, m.y1), p2 = rot(m.x2, m.y2);
    ctx.lineCap = "round";
    ctx.strokeStyle = C.woodDark; ctx.lineWidth = THICK + 2.4;
    ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
    ctx.strokeStyle = C.wood; ctx.lineWidth = THICK;
    ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
    const head = i % 2 ? p1 : p2;
    ctx.fillStyle = C.head;
    ctx.beginPath(); ctx.arc(head.x, head.y, HEAD, 0, Math.PI * 2); ctx.fill();
  }

  function assemble(d, world) {
    const list = [];
    if (!d) return list;
    const deck = d.level === "raised" ? DECK_HIGH : DECK_LOW;
    const bed = bedOf(world);
    const MID = (GAP_L + GAP_R) / 2;

    // the walk itself, and a second alongside where two may pass
    lay(list, GAP_L, deck, GAP_R, deck);
    if (d.width === "two") {
      const off = 16;
      lay(list, GAP_L, deck + off, GAP_R, deck + off);
      [GAP_L + SPAN * 0.25, MID, GAP_R - SPAN * 0.25].forEach(x => lay(list, x, deck, x, deck + off));
    }
    // raised: it has to be got up to, and held up
    if (d.level === "raised") [GAP_L, GAP_R].forEach(x => lay(list, x, GROUND_Y, x, deck));
    // something at the hand
    if (d.hand === "rail") {
      const rh = 52;
      lay(list, GAP_L + 18, deck - rh, GAP_R - 18, deck - rh);
      [GAP_L + 18, MID, GAP_R - 18].forEach(x => lay(list, x, deck, x, deck - rh));
    }
    // something set down in the gap
    if (d.middle === "post") {
      lay(list, MID, deck, MID, bed);
    } else if (d.middle === "tower") {
      const l = MID - SPAN * 0.17, r = MID + SPAN * 0.17;
      [l, r].forEach(x => lay(list, x, deck, x, bed));
      lay(list, l, bed, r, deck); lay(list, r, bed, l, deck); lay(list, l, bed, r, bed);
    }
    // a coarse surface: short marks along the walk
    if (d.surface === "rough")
      for (let i = 1; i < 8; i++) {
        const x = GAP_L + SPAN * i / 8;
        lay(list, x, deck - 5, x + 10, deck - 5);
      }
    // ends carried down past the banks to something firmer
    if (d.ends === "footed") [GAP_L, GAP_R].forEach(x => lay(list, x, deck, x, GROUND_Y + 34));
    // a roof over the whole length
    if (d.cover === "roof") {
      const rh = 74;
      lay(list, GAP_L, deck - rh, GAP_R, deck - rh);
      [GAP_L, MID, GAP_R].forEach(x => lay(list, x, deck - rh, x, deck - rh + 16));
    }
    // struts driven back into the banks
    if (d.bracing === "struts") {
      lay(list, GAP_L, deck, GAP_L + SPAN * 0.34, deck + 70);
      lay(list, GAP_R, deck, GAP_R - SPAN * 0.34, deck + 70);
      lay(list, GAP_L + SPAN * 0.34, deck + 70, GAP_R - SPAN * 0.34, deck + 70);
    }
    return list;
  }

  // Draws into the canvas given, sized to its own box. `shape` may be null,
  // which draws the gap with nothing across it — which is the honest picture
  // before anybody has been understood.
  global.drawCrossing = function (canvas, shape, world) {
    const box = canvas.getBoundingClientRect();
    const dpr = global.devicePixelRatio || 1;
    const cw = Math.max(1, Math.round(box.width || 400));
    const scale = cw / W;
    canvas.width = Math.round(cw * dpr);
    canvas.height = Math.round(H * scale * dpr);
    canvas.style.height = Math.round(H * scale) + "px";
    const ctx = canvas.getContext("2d");
    ctx.scale(scale * dpr, scale * dpr);
    const bed = bedOf(world);
    ctx.fillStyle = C.paper; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = C.land;
    ctx.fillRect(0, GROUND_Y, GAP_L, H - GROUND_Y);
    ctx.fillRect(GAP_R, GROUND_Y, W - GAP_R, H - GROUND_Y);
    ctx.fillStyle = C.land2; ctx.fillRect(GAP_L, bed, SPAN, H - bed);
    if (world && world.water) { ctx.fillStyle = C.water; ctx.fillRect(GAP_L, WATER_Y, SPAN, bed - WATER_Y); }
    assemble(shape, world).forEach((m, i) => drawMatch(ctx, m, i));
  };
})(window);

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

  // The crossing is drawn turned a little, so that its width — one abreast or
  // two — and anything beside the walk can be seen. A side view could not show
  // a footway at all; it drew two abreast as a second line below the first.
  // z runs across the deck: 0 at the near edge, DW at the far one.
  const AX = 0.55, AY = 0.32;                 // the oblique: right and up, per unit of z
  const P = (x, y, z) => ({ x: x + z * AX, y: y - z * AY });
  function lay3(list, x1, y1, z1, x2, y2, z2) {
    const p = P(x1, y1, z1), q = P(x2, y2, z2);
    lay(list, p.x, p.y, q.x, q.y);
  }
  // Extras come from the sheet: parts the kit does not have, proposed by the
  // builder and accepted by both people. They are drawn as an added layer, in
  // another colour, and change nothing about the kit, the choosing or the score.
  function assemble(d, world, extras) {
    const list = [], strokes = [];
    if (!d) return { list, strokes };
    const deck = d.level === "raised" ? DECK_HIGH : DECK_LOW;
    const bed = bedOf(world);
    const MID = (GAP_L + GAP_R) / 2;
    const DW = d.width === "two" ? 78 : 44;   // across the walk
    const X = extras || {};

    // the walk: two long edges and a few ties across
    lay3(list, GAP_L, deck, 0, GAP_R, deck, 0);
    lay3(list, GAP_L, deck, DW, GAP_R, deck, DW);
    const ties = d.width === "two" ? 5 : 3;
    for (let i = 0; i <= ties; i++) { const x = GAP_L + SPAN * i / ties; lay3(list, x, deck, 0, x, deck, DW); }
    // raised: it has to be got up to, and held up — a post at each corner
    if (d.level === "raised") for (const x of [GAP_L, GAP_R]) for (const z of [0, DW]) lay3(list, x, GROUND_Y, z, x, deck, z);
    // something at the hand, along the near edge
    if (d.hand === "rail") {
      const rh = 52;
      lay3(list, GAP_L + 18, deck - rh, 0, GAP_R - 18, deck - rh, 0);
      for (const x of [GAP_L + 18, MID, GAP_R - 18]) lay3(list, x, deck, 0, x, deck - rh, 0);
    }
    // something set down in the gap, under the middle of the walk
    if (d.middle === "post") {
      lay3(list, MID, deck, DW / 2, MID, bed, DW / 2);
    } else if (d.middle === "tower") {
      const l = MID - SPAN * 0.17, r = MID + SPAN * 0.17, z = DW / 2;
      for (const x of [l, r]) lay3(list, x, deck, z, x, bed, z);
      lay3(list, l, bed, z, r, deck, z); lay3(list, r, bed, z, l, deck, z); lay3(list, l, bed, z, r, bed, z);
    }
    // a coarse surface: short marks across the walk
    if (d.surface === "rough")
      for (let i = 1; i < 8; i++) { const x = GAP_L + SPAN * i / 8; lay3(list, x, deck - 4, DW * 0.2, x + 8, deck - 4, DW * 0.8); }
    // ends carried down past the banks to something firmer
    if (d.ends === "footed") for (const x of [GAP_L, GAP_R]) for (const z of [0, DW]) lay3(list, x, deck, z, x, GROUND_Y + 34, z);
    // a roof over the whole length: posts at the corners, eaves along both edges
    if (d.cover === "roof") {
      const rh = 74;
      for (const z of [0, DW]) { lay3(list, GAP_L, deck - rh, z, GAP_R, deck - rh, z); for (const x of [GAP_L, MID, GAP_R]) lay3(list, x, deck, z, x, deck - rh, z); }
    }
    // struts driven back into the banks, under both edges
    if (d.bracing === "struts") for (const z of [0, DW]) {
      lay3(list, GAP_L, deck, z, GAP_L + SPAN * 0.34, deck + 70, z);
      lay3(list, GAP_R, deck, z, GAP_R - SPAN * 0.34, deck + 70, z);
      lay3(list, GAP_L + SPAN * 0.34, deck + 70, z, GAP_R - SPAN * 0.34, deck + 70, z);
    }

    // ── from the sheet, accepted by both ──
    const seg = (x1, y1, z1, x2, y2, z2, o) => { const p = P(x1, y1, z1), q = P(x2, y2, z2); strokes.push({ x1: p.x, y1: p.y, x2: q.x, y2: q.y, ...o }); };
    const poly = (pts, o) => strokes.push({ poly: pts.map(([x, y, z]) => P(x, y, z)), ...o });
    // a sealed, even surface: a wash over the walk
    if (X.sealed) poly([[GAP_L, deck, 0], [GAP_R, deck, 0], [GAP_R, deck, DW], [GAP_L, deck, DW]], { fill: "rgba(74,107,79,.18)" });
    // a footway beside the walk, on the far side, kept clear of it
    if (X.footway) {
      const z0 = DW + 16, z1 = z0 + 26;
      seg(GAP_L, deck, z0, GAP_R, deck, z0, { dash: [7, 6] }); seg(GAP_L, deck, z1, GAP_R, deck, z1, { dash: [7, 6] });
      for (let i = 0; i <= 4; i++) { const x = GAP_L + SPAN * i / 4; seg(x, deck, z0, x, deck, z1, { dash: [4, 5] }); }
      // a kerb: the footway's inner edge raised a step
      if (X.kerb) seg(GAP_L, deck - 7, z0, GAP_R, deck - 7, z0, { width: 4 });
    } else if (X.kerb) seg(GAP_L, deck - 7, DW, GAP_R, deck - 7, DW, { width: 4 });
    // a gate at each end: an upright and a bar across the near edge
    if (X.gate) for (const x of [GAP_L + 6, GAP_R - 6]) { seg(x, deck, 0, x, deck - 40, 0, { width: 4 }); seg(x, deck - 30, 0, x, deck - 30, DW, { width: 3 }); }
    return { list, strokes };
  }

  // Draws into the canvas given, sized to its own box. `shape` may be null,
  // which draws the gap with nothing across it — which is the honest picture
  // before anybody has been understood.
  global.crossingMatches = function(shape, world, extras) {
    return assemble(shape, world, extras).list.map((m,i) => {
      const cx=(m.x1+m.x2)/2, cy=(m.y1+m.y2)/2, a=wob(i);
      const pt=(x,y)=>({x:600+1.4*(cx+(x-cx)*Math.cos(a)-(y-cy)*Math.sin(a)-640),y:370+1.4*(cy+(x-cx)*Math.sin(a)+(y-cy)*Math.cos(a)-360)});
      const a1=pt(m.x1,m.y1), b1=pt(m.x2,m.y2);
      return {id:String(i),x1:a1.x,y1:a1.y,x2:b1.x,y2:b1.y};
    });
  };
  global.drawCrossing = function (canvas, shape, world, extras, feedback) {
    const box = canvas.getBoundingClientRect();
    const dpr = global.devicePixelRatio || 1;
    const cw = Math.max(1, Math.round(box.width || 400));
    const scale = cw / W;
    canvas.width = Math.round(cw * dpr);
    canvas.height = Math.round(H * scale * dpr);
    canvas.style.height = Math.round(H * scale) + "px";
    const ctx = canvas.getContext("2d");
    ctx.scale(scale * dpr, scale * dpr);
    // Closer in on the gap: the turned view sits smaller in the scene than the
    // side view did, and the banks are not what anybody is looking at.
    ctx.translate(600, 370); ctx.scale(1.4, 1.4); ctx.translate(-600 - 40, -370 + 10);
    const bed = bedOf(world);
    ctx.fillStyle = C.paper; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = C.land;
    ctx.fillRect(0, GROUND_Y, GAP_L, H - GROUND_Y);
    ctx.fillRect(GAP_R, GROUND_Y, W - GAP_R, H - GROUND_Y);
    ctx.fillStyle = C.land2; ctx.fillRect(GAP_L, bed, SPAN, H - bed);
    if (world && world.water) { ctx.fillStyle = C.water; ctx.fillRect(GAP_L, WATER_Y, SPAN, bed - WATER_Y); }
    const { list, strokes } = assemble(shape, world, extras);
    list.forEach((m, i) => {
      if(feedback?.removed?.includes(String(i))) return;
      drawMatch(ctx,m,i);
      const color=feedback?.colors?.[String(i)];
      if(color){ const old={...C}; C.wood=color;C.woodDark=color;C.head=color;drawMatch(ctx,m,i);Object.assign(C,old); }
    });
    // what both people accepted onto the sheet, in the wall's colour
    for (const st of strokes) {
      ctx.save();
      if (st.poly) { ctx.fillStyle = st.fill; ctx.beginPath(); st.poly.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath(); ctx.fill(); }
      else { ctx.strokeStyle = "#4a6b4f"; ctx.lineWidth = st.width || 2.5; ctx.lineCap = "round"; if (st.dash) ctx.setLineDash(st.dash);
             ctx.beginPath(); ctx.moveTo(st.x1, st.y1); ctx.lineTo(st.x2, st.y2); ctx.stroke(); }
      ctx.restore();
    }
  };
})(window);

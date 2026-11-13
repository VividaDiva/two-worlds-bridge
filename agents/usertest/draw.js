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
  // Named parts are drawn in the colour of the person whose word they carry.
  const WHO = { A: "#b4441f", B: "#2d5470" }, WHO_NAME = { A: "Role 1", B: "Role 2" }, SHEET = "#4a6b4f";

  const X_ID = l => l.id;
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
    const dim = FOCUS && m.part !== FOCUS;
    if (m.ghost || dim) { ctx.save(); ctx.globalAlpha = dim ? (m.part ? 0.15 : 0.3) : 0.42; drawMatchSolid(ctx, m, i); ctx.restore(); return; }
    drawMatchSolid(ctx, m, i);
  }
  function drawMatchSolid(ctx, m, i) {
    const cx = (m.x1 + m.x2) / 2, cy = (m.y1 + m.y2) / 2, a = wob(i);
    const rot = (px, py) => ({ x: cx + (px - cx) * Math.cos(a) - (py - cy) * Math.sin(a),
                               y: cy + (px - cx) * Math.sin(a) + (py - cy) * Math.cos(a) });
    const p1 = rot(m.x1, m.y1), p2 = rot(m.x2, m.y2);
    ctx.lineCap = "round";
    ctx.strokeStyle = C.woodDark; ctx.lineWidth = THICK + 2.4;
    ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
    ctx.strokeStyle = C.wood; ctx.lineWidth = THICK;
    ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
    const head = m.head === "p2" ? p2 : m.head === "p1" ? p1 : i % 2 ? p1 : p2;
    ctx.fillStyle = C.head;
    ctx.beginPath(); ctx.arc(head.x, head.y, HEAD, 0, Math.PI * 2); ctx.fill();
  }

  // The crossing is drawn turned a little, so that its width — one abreast or
  // two — and anything beside the walk can be seen. A side view could not show
  // a footway at all; it drew two abreast as a second line below the first.
  // z runs across the deck: 0 at the near edge, DW at the far one.
  // The oblique: right and up, per unit of z. With named parts beside the walk
  // it opens wider and the view pulls back, so lanes, walls and lights beside
  // the walk sit apart instead of on top of it. Without them the picture is
  // exactly what it always was, so older records and their marks still line up.
  let AX = 0.55, AY = 0.32, TOP = false, FOCUS = null;
  // From above (`extras.view === "top"`): x stays x, what is beside the walk
  // goes up the page, height is ignored. Lanes, walls and lights beside the
  // walk read at a glance; what is under the deck is left out of that view.
  const PLAN_Y = 600;
  const P = (x, y, z) => TOP ? { x, y: PLAN_Y - z * 1.5 } : { x: x + z * AX, y: y - z * AY };
  const viewOf = extras => {
    if (extras && extras.view === "top") return { ax: 0, ay: 0, k: 1, dx: 0, dy: 0, top: true };
    const n = (extras && extras.named || []).length;
    return n ? { ax: 0.9, ay: 0.42, k: 1.08, dx: -30, dy: 26, top: false } : { ax: 0.55, ay: 0.32, k: 1.4, dx: -40, dy: 10, top: false };
  };
  const setView = extras => { const v = viewOf(extras); AX = v.ax; AY = v.ay; TOP = v.top; FOCUS = extras && extras.focus || null; return v; };
  function lay3(list, x1, y1, z1, x2, y2, z2) {
    const p = P(x1, y1, z1), q = P(x2, y2, z2);
    lay(list, p.x, p.y, q.x, q.y);
  }
  // Extras come from the sheet: parts the kit does not have, proposed by the
  // builder and accepted by both people. They are drawn as an added layer, in
  // another colour, and change nothing about the kit, the choosing or the score.
  function assemble(d, world, extras) {
    const list = [], strokes = [], labels = [];
    setView(extras);
    if (!d) return { list, strokes, labels };
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
    if (!TOP && d.level === "raised") for (const x of [GAP_L, GAP_R]) for (const z of [0, DW]) lay3(list, x, GROUND_Y, z, x, deck, z);
    // something at the hand, along the near edge
    if (d.hand === "rail") {
      const rh = 52;
      lay3(list, GAP_L + 18, deck - rh, 0, GAP_R - 18, deck - rh, 0);
      for (const x of [GAP_L + 18, MID, GAP_R - 18]) lay3(list, x, deck, 0, x, deck - rh, 0);
    }
    // something set down in the gap, under the middle of the walk
    if (!TOP && d.middle === "post") {
      lay3(list, MID, deck, DW / 2, MID, bed, DW / 2);
    } else if (!TOP && d.middle === "tower") {
      const l = MID - SPAN * 0.17, r = MID + SPAN * 0.17, z = DW / 2;
      for (const x of [l, r]) lay3(list, x, deck, z, x, bed, z);
      lay3(list, l, bed, z, r, deck, z); lay3(list, r, bed, z, l, deck, z); lay3(list, l, bed, z, r, bed, z);
    }
    // a coarse surface: short marks across the walk
    if (d.surface === "rough")
      for (let i = 1; i < 8; i++) { const x = GAP_L + SPAN * i / 8; lay3(list, x, deck - 4, DW * 0.2, x + 8, deck - 4, DW * 0.8); }
    // ends carried down past the banks to something firmer
    if (!TOP && d.ends === "footed") for (const x of [GAP_L, GAP_R]) for (const z of [0, DW]) lay3(list, x, deck, z, x, GROUND_Y + 34, z);
    // a roof over the whole length: posts at the corners, eaves along both edges
    if (d.cover === "roof") {
      const rh = 74;
      for (const z of [0, DW]) { lay3(list, GAP_L, deck - rh, z, GAP_R, deck - rh, z); for (const x of [GAP_L, MID, GAP_R]) lay3(list, x, deck, z, x, deck - rh, z); }
    }
    // struts driven back into the banks, under both edges
    if (!TOP && d.bracing === "struts") for (const z of [0, DW]) {
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

    // ── named parts ──
    // What the kit has no part for is not translated into one. It is placed
    // with one of eight primitives and labelled with the speaker's own word.
    // It is built of the same matchsticks as the rest — it is the same bridge,
    // whoever's word it carries — ghosted while it is only a proposal, solid
    // once its owner has confirmed it or it was placed directly. A numbered
    // marker in the owner's colour ties it to the legend.
    let bands = 0, decksAbove = 0, decksBelow = 0, signs = 0, washes = 0, edgesBetween = 0, postsAlong = 0, lifts = 0;
    const GAPZ = 58, BANDW = 30;                 // space between strips, and a strip's own width
    const nBands = (X.named || []).filter(n => n.primitive === "band").length;
    const outerZ = DW + (nBands ? 14 + nBands * GAPZ - (GAPZ - BANDW) : 0);   // the far edge of the last strip
    let k = 0;
    const label = (x, y, z, n, o) => labels.push({ ...P(x, y, z), n: k, id: n.id, text: n.label, who: n.who, status: n.status, ...o });
    for (const n of X.named || []) {
      k++;
      const settled = n.status === "confirmed" || n.status === "placed";
      const from = list.length;
      const stick = (x1, y1, z1, x2, y2, z2, head) => { const at = list.length; lay3(list, x1, y1, z1, x2, y2, z2); if (head) list[list.length - 1].head = head; return at; };
      const pos = n.position || "";
      switch (n.primitive) {
        case "band": {                      // a lane or path running beside the walk, on the far side
          const z0 = DW + 14 + bands * GAPZ, z1 = z0 + BANDW; bands++;
          stick(GAP_L, deck, z0, GAP_R, deck, z0); stick(GAP_L, deck, z1, GAP_R, deck, z1);
          for (let i = 0; i <= 2; i++) { const x = GAP_L + SPAN * i / 2; stick(x, deck, z0, x, deck, z1); }
          label(GAP_R + 8, deck + 4, (z0 + z1) / 2, n, { align: "left" });
          break; }
        case "deck": {                      // another level, above or below the walk
          const above = pos !== "below";
          const y = above ? deck - 96 - decksAbove * 60 : deck + 64 + decksBelow * 50; above ? decksAbove++ : decksBelow++;
          for (const z of [0, DW]) stick(GAP_L, y, z, GAP_R, y, z);
          for (let i = 0; i <= 3; i++) { const x = GAP_L + SPAN * i / 3; stick(x, y, 0, x, y, DW); }
          for (const x of [GAP_L, GAP_R]) for (const z of [0, DW]) stick(x, deck, z, x, y, z);
          label(GAP_R + 8, y + 4, DW / 2, n, { align: "left" });
          break; }
        case "post": {                      // uprights with their heads up: lights, poles
          const xs = pos === "ends" ? [GAP_L + 12, GAP_R - 12] : [GAP_L + SPAN * 0.2, GAP_L + SPAN * 0.5, GAP_L + SPAN * 0.8];
          const z = pos === "ends" ? 0 : outerZ + 10 + postsAlong * 12, h = 64 + postsAlong * 14; postsAlong++;
          for (const x of xs) stick(x, deck, z, x, deck - h, z, "p2");
          label(xs[xs.length - 1] + 8, deck - h - 6, z, n, { align: "left" });
          break; }
        case "edge": {                      // a wall, barrier, kerb or high rail: a rail with uprights
          // "along": the far edge of the walk, where it meets what is beside it;
          // "between": in the gaps between the strips, one gap per wall.
          const z = pos === "between" ? DW + 14 + (edgesBetween + 1) * GAPZ - (GAPZ - BANDW) / 2 : DW; if (pos === "between") edgesBetween++;
          const h = 34;
          stick(GAP_L + 10, deck - h, z, GAP_R - 10, deck - h, z);
          for (const x of [GAP_L + 10, MID, GAP_R - 10]) stick(x, deck, z, x, deck - h, z);
          label(GAP_L + 10, deck - h - 14, z, n, { align: "left" });
          break; }
        case "wash": {                      // the surface of the walk itself: a wash over it
          const inset = washes * 6; washes++;
          poly([[GAP_L + inset, deck, inset], [GAP_R - inset, deck, inset], [GAP_R - inset, deck, DW - inset], [GAP_L + inset, deck, DW - inset]], { fill: settled ? "rgba(176,122,60,.30)" : "rgba(176,122,60,.14)", who: n.who });
          label(MID, deck + 96 + washes * 18, DW / 2, n, { align: "center" });
          break; }
        case "sign": {                      // a plate on a post on the bank: a rule
          const x = GAP_L - 70 - signs * 100, top = GROUND_Y - 84 - (signs % 2) * 40; signs++;
          const w = 44, h = 30;
          if (TOP) {                        // seen from above: a plate on the bank, beside the walk's line
            const z0 = -20 - (signs % 2) * 40, z1 = z0 + 24;
            stick(x - w / 2, deck, z0, x + w / 2, deck, z0); stick(x - w / 2, deck, z1, x + w / 2, deck, z1);
            stick(x - w / 2, deck, z0, x - w / 2, deck, z1); stick(x + w / 2, deck, z0, x + w / 2, deck, z1);
            label(x, deck, (z0 + z1) / 2, n, { align: "center", plate: true, words: String(n.label || "") });
          } else {
            stick(x, GROUND_Y, 0, x, top, 0);
            stick(x - w / 2, top - h, 0, x + w / 2, top - h, 0); stick(x - w / 2, top, 0, x + w / 2, top, 0);
            stick(x - w / 2, top - h, 0, x - w / 2, top, 0); stick(x + w / 2, top - h, 0, x + w / 2, top, 0);
            label(x, top - h / 2, 0, n, { align: "center", plate: true, words: String(n.label || "") });
          }
          break; }
        case "lift": {                      // a span that opens: two leaves raised from the middle of the walk
          if (lifts++) break;               // one opening span per crossing
          // Each half of the middle of the span turns up about its pier, as an open
          // bascule does: the leaves stand steep, and the water shows between them.
          const reach = SPAN * 0.36, gapHalf = SPAN * 0.05, up = 70 * Math.PI / 180;
          const rise = reach * Math.sin(up), lean = reach * Math.cos(up);
          for (const side of [-1, 1]) {
            const hinge = MID + side * (gapHalf + reach), tipX = hinge - side * lean, tipY = deck - rise;
            for (const z of [0, DW]) stick(hinge, deck, z, tipX, tipY, z);
            for (const t of [0.25, 0.5, 0.75, 1]) { const x = hinge + (tipX - hinge) * t, y = deck + (tipY - deck) * t; stick(x, y, 0, x, y, DW); }
            stick(hinge, deck, 0, hinge, deck + 30, 0);   // the pivot, standing on the pier
          }
          label(MID, deck - rise - 14, DW / 2, n, { align: "center" });
          break; }
        case "end": {                       // gates, ramps, steps: something at the two ends
          for (const x of [GAP_L + 6, GAP_R - 6]) { stick(x, deck, 0, x, deck - 44, 0); stick(x, deck - 32, 0, x, deck - 32, DW); }
          label(GAP_R + 8, deck - 46, 0, n, { align: "left" });
          break; }
      }
      for (let i = from; i < list.length; i++) { list[i].part = n.id; list[i].who = n.who; if (!settled) list[i].ghost = true; }
    }
    return { list, strokes, labels };
  }

  // Draws into the canvas given, sized to its own box. `shape` may be null,
  // which draws the gap with nothing across it — which is the honest picture
  // before anybody has been understood.
  // The three layers, un-drawn — for tests and for anything that wants to list
  // what the picture would show.
  global.crossingLayers = (shape, world, extras) => assemble(shape, world, extras);
  global.crossingMatches = function(shape, world, extras) {
    const v = viewOf(extras);
    return assemble(shape, world, extras).list.map((m,i) => {
      const cx=(m.x1+m.x2)/2, cy=(m.y1+m.y2)/2, a=wob(i);
      const pt=(x,y)=>({x:600+v.k*(cx+(x-cx)*Math.cos(a)-(y-cy)*Math.sin(a)-600+v.dx),y:370+v.k*(cy+(x-cx)*Math.sin(a)+(y-cy)*Math.cos(a)-370+v.dy)});
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
    const v = setView(extras);
    ctx.translate(600, 370); ctx.scale(v.k, v.k); ctx.translate(-600 + v.dx, -370 + v.dy);
    const bed = bedOf(world);
    ctx.fillStyle = C.paper; ctx.fillRect(0, 0, W, H);
    if (TOP) {
      // the banks either side, the gap between them running top to bottom
      ctx.fillStyle = C.land; ctx.fillRect(0, 0, GAP_L, H); ctx.fillRect(GAP_R, 0, W - GAP_R, H);
      ctx.fillStyle = world && world.water ? C.water : C.land2; ctx.fillRect(GAP_L, 0, SPAN, H);
    } else {
      ctx.fillStyle = C.land;
      ctx.fillRect(0, GROUND_Y, GAP_L, H - GROUND_Y);
      ctx.fillRect(GAP_R, GROUND_Y, W - GAP_R, H - GROUND_Y);
      ctx.fillStyle = C.land2; ctx.fillRect(GAP_L, bed, SPAN, H - bed);
      if (world && world.water) { ctx.fillStyle = C.water; ctx.fillRect(GAP_L, WATER_Y, SPAN, bed - WATER_Y); }
    }
    const { list, strokes, labels } = assemble(shape, world, extras);
    list.forEach((m, i) => {
      if(feedback?.removed?.includes(String(i))) return;
      drawMatch(ctx,m,i);
      const color=feedback?.colors?.[String(i)];
      if(color){ const old={...C}; C.wood=color;C.woodDark=color;C.head=color;drawMatch(ctx,m,i);Object.assign(C,old); }
    });
    // the sheet's layer: legacy extras in the wall's colour, named parts in the
    // colour of the person whose word they carry
    for (const st of strokes) {
      const col = WHO[st.who] || SHEET;
      ctx.save();
      if (st.poly) { ctx.fillStyle = st.fill; ctx.beginPath(); st.poly.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath(); ctx.fill(); }
      else if (st.dot) { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(st.dot.x, st.dot.y, 6, 0, Math.PI * 2); ctx.fill(); }
      else if (st.plate) { ctx.fillStyle = C.paper; ctx.strokeStyle = col; ctx.lineWidth = 2.5; if (st.dash) ctx.setLineDash(st.dash);
             ctx.beginPath(); ctx.rect(st.plate.x, st.plate.y, st.plate.w, st.plate.h); ctx.fill(); ctx.stroke(); }
      else { ctx.strokeStyle = col; ctx.lineWidth = st.width || 2.5; ctx.lineCap = "round"; if (st.dash) ctx.setLineDash(st.dash);
             ctx.beginPath(); ctx.moveTo(st.x1, st.y1); ctx.lineTo(st.x2, st.y2); ctx.stroke(); }
      ctx.restore();
    }
    // the words on a sign; a numbered marker for everything else (or the words
    // themselves, when asked for)
    const words = !!(extras && extras.words);
    // feedback views draw the parts but not the numbered markers
    for (const l of (feedback && feedback.marks === false ? [] : labels)) {
      const col = WHO[l.who] || SHEET;
      ctx.save();
      if (FOCUS && (X_ID(l) !== FOCUS)) ctx.globalAlpha = 0.3;
      ctx.textBaseline = "middle";
      if (l.plate && words) {
        ctx.font = `600 10px system-ui, -apple-system, "Helvetica Neue", sans-serif`; ctx.textAlign = "center";
        ctx.fillStyle = col; ctx.fillText(l.words.slice(0, 9), l.x, l.y);
      } else if (words) {
        const text = `${l.text} · ${WHO_NAME[l.who] || "sheet"}${l.status === "confirmed" || l.status === "placed" ? "" : l.status === "objected" ? " · objected" : " · proposed"}`;
        ctx.font = `600 13px system-ui, -apple-system, "Helvetica Neue", sans-serif`; ctx.textAlign = l.align || "left";
        ctx.lineWidth = 4; ctx.strokeStyle = C.paper; ctx.lineJoin = "round"; ctx.strokeText(text, l.x, l.y);
        ctx.fillStyle = col; ctx.fillText(text, l.x, l.y);
      } else {
        // a circled number: filled once its owner has confirmed, hollow while proposed
        const x = l.plate || l.align === "center" ? l.x : l.align === "right" ? l.x - 10 : l.x + 10, y = l.y, r = 9;
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
        const filled = l.status === "confirmed" || l.status === "placed";
        ctx.fillStyle = filled ? col : C.paper; ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = col; if (l.status === "objected") ctx.setLineDash([3, 3]); ctx.stroke();
        ctx.setLineDash([]); ctx.font = `700 11px system-ui, -apple-system, "Helvetica Neue", sans-serif`; ctx.textAlign = "center";
        ctx.fillStyle = filled ? C.paper : col; ctx.fillText(String(l.n), x, y + 0.5);
      }
      ctx.restore();
    }
  };
})(window);

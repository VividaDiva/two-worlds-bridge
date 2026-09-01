// One-shot: serve the render harness, take the PNGs it posts back, write them
// to refs/. The images never travel through anything but this socket.
import http from "node:http";
import fs from "node:fs";
import { ALL_SHAPES } from "./ref-pairs.mjs";

fs.mkdirSync("refs", { recursive: true });
const harness = fs.readFileSync("render-refs.html", "utf8");
const page = harness + `
<script>
const SHAPES = ${JSON.stringify(ALL_SHAPES)};
const urls = SHAPES.map(s => ({ id: s.id, png: renderRef(s.shape).toDataURL("image/png") }));
fetch("/save", {method:"POST", headers:{"content-type":"application/json"},
                body: JSON.stringify(urls)})
  .then(r => r.text()).then(t => { document.title = "done " + t; });
</script>`;

let done = false;
const srv = http.createServer((req, res) => {
  if (req.method === "POST" && req.url === "/save"){
    let body = "";
    req.on("data", d => body += d);
    req.on("end", () => {
      const rows = JSON.parse(body);
      for (const r of rows){
        const b64 = r.png.replace(/^data:image\/png;base64,/, "");
        fs.writeFileSync(`refs/${r.id}.png`, Buffer.from(b64, "base64"));
      }
      res.end(String(rows.length));
      console.log(`wrote ${rows.length} images`);
      done = true;
      setTimeout(() => srv.close(() => process.exit(0)), 300);
    });
    return;
  }
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.end(page);
});
srv.listen(8731, () => console.log("listening on http://localhost:8731/"));
setTimeout(() => { if (!done){ console.error("timed out with no post"); process.exit(1); } }, 60000);

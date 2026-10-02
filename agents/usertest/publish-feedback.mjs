import fs from 'node:fs';import {fileURLToPath} from 'node:url';import path from 'node:path';import {createHash} from 'node:crypto';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../..');
const version=createHash('sha256').update(fs.readFileSync(path.join(here,'feedback.js'))).update(fs.readFileSync(path.join(root,'feedback-connection.js'))).digest('hex').slice(0,10);
let html=fs.readFileSync(path.join(here,'feedback.html'),'utf8');
html=html.replace('<script src="/draw.js"></script>',`<script>if(!location.search){history.replaceState(null,'','?room=0uxtt&role=B&participant=1');}</script><script src="./cloud-transport.js"></script><script src="./feedback-connection.js?v=${version}"></script><script src="./agents/usertest/draw.js?v=${version}"></script>`).replace('<script src="/feedback.js"></script>',`<script src="./agents/usertest/feedback.js?v=${version}"></script>`);
fs.writeFileSync(path.join(root,'feedback.html'),html);
console.log('Built GitHub Pages feedback.html (UI only; no participant data bundled)');

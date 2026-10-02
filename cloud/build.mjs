import fs from 'node:fs';
fs.mkdirSync('dist/agents/usertest',{recursive:true});
for(const name of ['feedback.html','feedback-records.html','feedback-records.js','feedback-connection.js','study-connection.js','cloud-transport.js','bridge.html','history.html','toolmakers-kit.html','the-wall.html','live.html'])fs.copyFileSync(name,'dist/'+name);
for(const name of ['draw.js','feedback.js'])fs.copyFileSync('agents/usertest/'+name,'dist/agents/usertest/'+name);
fs.copyFileSync('feedback.html','dist/index.html');
fs.writeFileSync('dist/live.json',JSON.stringify({url:'same-origin',transport:'blob-chunks-v1'}));

const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'src', 'rag');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.js'));

files.forEach(f => {
  const fp = path.join(dir, f);
  let content = fs.readFileSync(fp, 'utf8');
  content = content.replace(/require\(['"]\.\.\/logger\/index\.js['"]\)/g, 'require("./logger/index.js")');
  content = content.replace(/require\(['"]\.\.\/\.\.\/logger\/index\.js['"]\)/g, 'require("./logger/index.js")');
  fs.writeFileSync(fp, content);
});

console.log("Logger paths fixed.");

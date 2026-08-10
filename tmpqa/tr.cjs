const ts=require('typescript'),fs=require('fs'),path=require('path');
const c={compilerOptions:{target:'ES2022',module:'ESNext'}};
const fait=new Set();
const nom = r => 'tmpqa/m/' + r.replace(/\.ts$/,'').split(/[\/]/).join('__') + '.mjs';
function tr(rel){
  rel = rel.split(path.sep).join('/');
  if(fait.has(rel)) return; fait.add(rel);
  let s = ts.transpileModule(fs.readFileSync(rel,'utf8'),c).outputText;
  s = s.replace(/(from\s+|import\(\s*)['"](\.\.?\/[^'"]+|@\/[^'"]+)['"]/g,(m,pre,r)=>{
    const cible = r.startsWith('@/') ? r.slice(2) : path.posix.join(path.posix.dirname(rel), r);
    if (fs.existsSync(cible + '.ts')) { tr(cible + '.ts'); return pre + "'" + 'file:///' + process.cwd().split(path.sep).join('/') + '/' + nom(cible) + "'"; }
    return m;
  });
  fs.mkdirSync('tmpqa/m',{recursive:true});
  fs.writeFileSync(nom(rel), s);
}
tr(process.argv[2]);
console.log('modules transpilés :', fait.size);

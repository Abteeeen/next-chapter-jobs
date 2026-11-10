import {build} from 'esbuild';
import {mkdir, copyFile} from 'node:fs/promises';
await mkdir('site', {recursive:true});
await build({entryPoints:['app.js'],bundle:true,outfile:'site/app.js',minify:true,target:['es2022']});
for (const file of ['index.html','style.css','jobs.json']) await copyFile(file,`site/${file}`);

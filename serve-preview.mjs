import {createServer} from 'node:http'
import {readFile} from 'node:fs/promises'
const files={'/':'preview.html','/client.js':'client.js'};
createServer(async(req,res)=>{
  const file=files[req.url];if(!file){res.writeHead(404);res.end();return;}
  try{const body=await readFile(new URL(file,import.meta.url));res.setHeader('Content-Type',file.endsWith('.html')?'text/html; charset=utf-8':'text/javascript; charset=utf-8');res.setHeader('Cache-Control','no-store');res.end(body);}catch{res.writeHead(500);res.end();}
}).listen(32187,'127.0.0.1',()=>console.log('演示：http://127.0.0.1:32187（仅此机；不读取存档）'));

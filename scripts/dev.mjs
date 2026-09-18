/** Starts the real Python API and Vite together; forwards all Vite flags. */
import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const local=path.join(root,'.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
const python=process.env.PYTHON_BIN??(existsSync(local)?local:'python');
const backend=spawn(python,['-m','uvicorn','backend.app.main:create_app','--factory','--host','127.0.0.1','--port','8000'],{cwd:root,stdio:'inherit',env:process.env});
const frontend=spawn(process.execPath,[path.join(root,'frontend/node_modules/vite/bin/vite.js'),...process.argv.slice(2)],{cwd:path.join(root,'frontend'),stdio:'inherit',env:process.env});
let exiting=false;
function stop(code=0){if(exiting)return;exiting=true;backend.kill();frontend.kill();process.exitCode=code;}
for(const child of [backend,frontend]){child.on('error',e=>{console.error(e.message);stop(1);});child.on('exit',code=>stop(code??0));}
process.on('SIGINT',()=>stop());process.on('SIGTERM',()=>stop());

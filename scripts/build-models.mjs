import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

// Offline asset authoring. The deployed Node server serves committed GLBs.
const result=spawnSync(process.env.HOS_MODEL_PYTHON || 'python3',[fileURLToPath(new URL('./model-review/rebuild.py',import.meta.url)),...process.argv.slice(2)],{stdio:'inherit'});
if(result.error){console.error(result.error.message);process.exit(1);}
process.exit(result.status ?? 1);

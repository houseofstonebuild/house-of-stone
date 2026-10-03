import { DatabaseSync } from 'node:sqlite';
import { resolve } from 'node:path';
const id=process.argv[2];
if(!/^[0-9a-f-]{36}$/i.test(id||'')||process.argv[3]!=='--confirm') throw new Error('Use npm run remove-enquiry -- EXACT_REFERENCE --confirm. This removes the enquiry and related session activity.');
const db=new DatabaseSync(resolve(process.env.DATA_DIR||'data','house-of-stone.sqlite'));
const row=db.prepare('SELECT session_hash FROM inquiries WHERE id=?').get(id);
if(!row) throw new Error('This enquiry was not found.');
db.exec('BEGIN');
try { if(row.session_hash) db.prepare('DELETE FROM events WHERE session_hash=?').run(row.session_hash);db.prepare('DELETE FROM inquiries WHERE id=?').run(id);db.exec('COMMIT'); }catch(error){db.exec('ROLLBACK');throw error;}
db.close();console.log('Enquiry removed from the live database. Review any existing backups and notification emails separately.');

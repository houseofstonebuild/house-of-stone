import { existsSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
if (existsSync('.env')) { console.log('Your .env already exists. It was left unchanged.'); process.exit(0); }
const password = randomBytes(24).toString('base64url');
writeFileSync('.env', `ADMIN_PASSWORD=${password}\nHOST=127.0.0.1\nPORT=8000\nENABLE_INDEXING=false\n`, {mode:0o600});
console.log('Setup complete. Run npm start, then open http://localhost:8000.');
console.log('Private inbox: http://localhost:8000/admin');
console.log('Collection editor: http://localhost:8000/admin/content');
console.log('Username: admin');
console.log('Password: ' + password);
console.log('Keep the password private. The .env file is excluded from version control.');

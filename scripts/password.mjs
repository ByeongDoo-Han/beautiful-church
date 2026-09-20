import { randomBytes, scryptSync } from 'node:crypto';
process.stderr.write('관리자 비밀번호를 입력하고 Enter를 누르세요 (터미널에 표시됩니다): ');
let value = '';
for await (const chunk of process.stdin) { value += chunk; if (value.includes('\n')) break; }
const password = value.trimEnd();
if (password.length < 12) throw new Error('12자 이상 사용하세요.');
const salt = randomBytes(16).toString('hex');
console.log(`scrypt$${salt}$${scryptSync(password, salt, 64).toString('hex')}`);

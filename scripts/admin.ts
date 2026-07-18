import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { dataStore } from '../src/server/dataStore.js';
import { saveAdminPassword } from '../src/server/auth.js';

await dataStore.initialize();

const action = process.argv[2];
if (action !== 'create' && action !== 'change-password') {
  console.error('用法：npm run admin:create 或 npm run admin:change-password');
  process.exitCode = 1;
} else {
  const reader = createInterface({ input: stdin, output: stdout });
  const password = await reader.question('输入管理员密码（至少 12 个字符）：');
  const confirmation = await reader.question('再次输入密码：');
  reader.close();
  if (password !== confirmation) throw new Error('两次密码不一致');
  await saveAdminPassword(password);
  console.log(action === 'create' ? '管理员已创建。' : '管理员密码已更新。');
}

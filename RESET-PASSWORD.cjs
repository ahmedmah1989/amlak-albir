// إعادة تعيين كلمة مرور مستخدم في برنامج الأملاك (قاعدة البيانات المحلية data\db)
// الاستخدام الأسهل: افتح RESET-PASSWORD.cmd بالنقر المزدوج. أو: node RESET-PASSWORD.cjs اسم_المستخدم كلمة_المرور
// يجب إيقاف البرنامج أولاً (الأداة تفعل ذلك). تتغير كلمة المرور فقط ولا تُمس أي بيانات.
const { randomBytes, scryptSync } = require('crypto');
const path = require('path');
(async () => {
  const user = process.argv[2] || 'admin', pass = process.env.AMLAK_NEW_PASS || process.argv[3];
  if (process.argv[2] === '--list') { /* عرض المستخدمين فقط */ }
  if (!pass && process.argv[2] !== '--list') { console.log('كلمة المرور الجديدة غير محددة'); process.exit(1); }
  const { PGlite } = await import('@electric-sql/pglite');
  const db = new PGlite(process.env.PGLITE_DIR || path.join(__dirname, 'data', 'db'));
  const users = (await db.query('select username, full_name, role, active from users order by role, username')).rows;
  console.log('المستخدمون:'); users.forEach((u) => console.log(`  - ${u.username} (${u.full_name}) — ${u.role}${u.active === false ? ' — موقوف' : ''}`));
  if (process.argv[2] === '--list') { await db.close(); return; }
  if (!users.some((u) => u.username === user)) { console.log(`لا يوجد مستخدم باسم ${user}`); await db.close(); process.exit(1); }
  const salt = randomBytes(16).toString('hex'), hash = `${salt}:${scryptSync(pass, salt, 64).toString('hex')}`;
  await db.query('update users set pass_hash=$1, must_change=false, active=true where username=$2', [hash, user]);
  await db.query(`insert into activity_log (username,action,details) values ('النظام','إعادة تعيين كلمة المرور',$1)`, [`المستخدم ${user} — من أداة RESET-PASSWORD على الجهاز`]);
  await db.close();
  console.log(`تم تعيين كلمة المرور الجديدة للمستخدم ${user}. البيانات كما هي.`);
})().catch((e) => { console.error('تعذر التنفيذ:', e.message, '\nتأكد أن البرنامج متوقف (أغلق نافذة start.bat).'); process.exit(1); });

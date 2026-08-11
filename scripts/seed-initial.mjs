// Seed satu kali: Roles dasar (admin, manager, member) + 1 user Admin awal.
// Jalankan: node scripts/seed-initial.mjs
import { google } from 'googleapis';
import { readFileSync } from 'fs';
import { randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => {
      const idx = l.indexOf('=');
      let v = l.slice(idx + 1);
      if (v.startsWith("'") && v.endsWith("'")) v = v.slice(1, -1);
      return [l.slice(0, idx), v];
    })
);

const credentials = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_KEY);
const auth = new google.auth.GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });

async function getClient() {
  const authClient = await auth.getClient();
  return google.sheets({ version: 'v4', auth: authClient });
}

async function appendRow(sheets, spreadsheetId, header, data) {
  const row = header.map((col) => data[col] ?? '');
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: 'A1',
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [row] },
  });
}

async function getHeader(sheets, spreadsheetId) {
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: '1:1' });
  return res.data.values[0];
}

async function main() {
  const sheets = await getClient();
  const now = new Date().toISOString();

  // 1. Roles
  const rolesHeader = await getHeader(sheets, env.SHEET_ID_ROLES);
  const roles = [
    { id: randomUUID(), role_key: 'admin', role_name: 'Administrator', status: 'Active', created_at: now, updated_at: now },
    { id: randomUUID(), role_key: 'manager', role_name: 'Manager', status: 'Active', created_at: now, updated_at: now },
    { id: randomUUID(), role_key: 'member', role_name: 'Member', status: 'Active', created_at: now, updated_at: now },
  ];
  for (const r of roles) {
    await appendRow(sheets, env.SHEET_ID_ROLES, rolesHeader, r);
  }
  console.log('Roles ditambahkan:', roles.map((r) => `${r.role_key} (${r.id})`).join(', '));

  // 2. Admin user
  const usersHeader = await getHeader(sheets, env.SHEET_ID_USERS);
  const adminPassword = 'Admin123!';
  const passwordHash = await bcrypt.hash(adminPassword, 10);
  const adminRole = roles.find((r) => r.role_key === 'admin');
  const adminUser = {
    id: randomUUID(),
    name: 'Administrator',
    email: 'admin@tms.local',
    password_hash: passwordHash,
    role_id: adminRole.id,
    employment_type_id: '',
    can_assign_others: 'Ya',
    status: 'Active',
    created_at: now,
    updated_at: now,
    created_by: '',
    updated_by: '',
    deleted_at: '',
  };
  await appendRow(sheets, env.SHEET_ID_USERS, usersHeader, adminUser);

  console.log('\nUser Admin awal berhasil dibuat:');
  console.log('  Email   :', adminUser.email);
  console.log('  Password:', adminPassword);
  console.log('\n(Segera ganti password ini setelah login pertama kali.)');
}

main().catch((err) => {
  console.error('SEED FAILED:', err.message);
  process.exit(1);
});

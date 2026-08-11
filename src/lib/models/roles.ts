import * as SheetTable from '@/lib/google/sheet-table';

export type Role = {
  id: string;
  role_key: string;
  role_name: string;
  status: string;
};

export async function findRoleById(id: string): Promise<Role | undefined> {
  const row = await SheetTable.findById('roles', id);
  return row as Role | undefined;
}

export async function getAllRoles(): Promise<Role[]> {
  const rows = await SheetTable.getAll('roles');
  return rows as Role[];
}

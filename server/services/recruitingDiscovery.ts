export type AccountDiscoveryRow = {
  id: string;
  name: string | null;
  status: string | null;
  number: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  dealerId: string | null;
  network: string | null;
};

export function toAccountDiscoveryResult(row: AccountDiscoveryRow) {
  return {
    id: row.id,
    name: row.name || row.number || row.id,
    status: row.status || "Active",
    address: row.address || null,
    city: row.city || null,
    state: row.state || null,
    zip: row.zip || null,
    dealerId: row.dealerId || null,
    network: row.network || null,
    hasAddress: !!(row.address || row.city),
  };
}

export type DriverDiscoveryRow = {
  id: string;
  status: string | null;
  employeeId: string | null;
  driverClassification: string | null;
  driverType: string | null;
  employmentType: string | null;
  hireDate: string | Date | null;
  market: string | null;
  firstName: string | null;
  lastName: string | null;
};

export function toDriverDiscoveryResult(row: DriverDiscoveryRow) {
  return {
    id: row.id,
    displayName: [row.firstName, row.lastName].filter(Boolean).join(" ") || `Driver ${row.id}`,
    employeeId: row.employeeId || null,
    status: row.status || "active",
    driverClassification: row.driverClassification || null,
    driverType: row.driverType || null,
    employmentType: row.employmentType || null,
    hireDate: row.hireDate || null,
    market: row.market || null,
  };
}
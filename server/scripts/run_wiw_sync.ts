async function main() {
  const { syncShifts } = await import("../services/wiwSyncService");
  const r = await syncShifts();
  console.log("Shifts synced:", JSON.stringify({ fetched: r.fetched, inserted: r.inserted, updated: r.updated, errors: r.errors }));
  if (r.errorMessages?.length) console.log("Errors:", r.errorMessages.slice(0, 3));
}
main().catch(console.error);

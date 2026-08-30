/**
 * Bootstrap reconciliation for all existing import batches.
 * Run with: npx tsx server/scripts/bootstrap_reconciliation.ts
 */
import { db } from "../db";
import { rideshareImportBatches } from "@shared/schema";
import { computeAndStoreReconciliation } from "../services/rideshareReconciliationService";

async function run() {
  const batches = await db
    .select({ id: rideshareImportBatches.id })
    .from(rideshareImportBatches);

  console.log(`Bootstrapping reconciliation for ${batches.length} batches…`);

  for (const b of batches) {
    try {
      const result = await computeAndStoreReconciliation(b.id);
      console.log(
        `  ${b.id.slice(0, 8)}: ${result.reconciliationStatus} ` +
        `(${result.totalAccountedRows}/${result.totalRowsInFile} rows, $${result.fileTotalAmount})`
      );
    } catch (err: any) {
      console.error(`  ${b.id.slice(0, 8)}: ERROR — ${err.message}`);
    }
  }

  console.log("Done.");
  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });

import { runUpdatedAlertCorrectiveSend } from "../services/updatedAlertCorrectiveService";

const mondayDate = "2026-08-24";

async function main() {
  if (process.env.UPDATED_ALERT_SEND_APPROVED !== "production-approved") {
    throw new Error(
      "Refusing to send. Set UPDATED_ALERT_SEND_APPROVED=production-approved only after explicit production approval.",
    );
  }

  const result = await runUpdatedAlertCorrectiveSend(mondayDate);
  console.log(JSON.stringify(result, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : error);
    process.exit(1);
  });
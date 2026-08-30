// ──────────────────────────────────────────────────────────────────────────────
// Claim Auto Narrative Service
// Generates a structured 4-section narrative for a claim using OpenAI.
// Sections: What Happened | Who Was Involved | Damage Summary | Liability Context
// ──────────────────────────────────────────────────────────────────────────────
import crypto from "crypto";

export interface NarrativeSections {
  whatHappened: string;
  whoInvolved: string;
  damageSummary: string;
  liabilityContext: string;
}

// ── Build a canonical hash of inputs so we can detect staleness ───────────────
export function buildInputHash(claim: any, driver: any, attachmentCount: number): string {
  const key = JSON.stringify({
    incidentType:       claim.incidentType,
    accidentDate:       claim.accidentDate,
    location:           claim.location,
    lossLocation:       claim.lossLocation,
    description:        claim.description,
    descriptionOfLoss:  claim.descriptionOfLoss,
    notesReceived:      claim.notesReceived,
    reviewNotes:        claim.reviewNotes,
    injuryFlag:         claim.injuryFlag,
    injuries:           claim.injuries,
    dodAtFault:         claim.dodAtFault,
    liabilityFault:     claim.liabilityFault,
    preventability:     claim.preventability,
    reviewPreventability: claim.reviewPreventability,
    totalEstimate:      claim.totalEstimate,
    probableCost:       claim.probableCost,
    actualCost:         claim.actualCost,
    vehicleMake:        claim.vehicleMake,
    vehicleModel:       claim.vehicleModel,
    vehicleYear:        claim.vehicleYear,
    weatherConditions:  claim.weatherConditions,
    roadConditions:     claim.roadConditions,
    policeReportFiled:  claim.policeReportFiled,
    policeReportNumber: claim.policeReportNumber,
    driverFirstName:    driver?.firstName,
    driverLastName:     driver?.lastName,
    driverNumber:       driver?.driverNumber,
    attachmentCount,
  });
  return crypto.createHash("sha256").update(key).digest("hex").slice(0, 16);
}

// ── Format money amounts ───────────────────────────────────────────────────────
function fmt(v: any): string {
  const n = parseFloat(String(v ?? "").replace(/[^0-9.-]/g, ""));
  if (isNaN(n) || n === 0) return "N/A";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

// ── Build the prompt context block ────────────────────────────────────────────
function buildPromptContext(claim: any, driver: any, attachmentCount: number): string {
  const lines: string[] = [];

  // Incident basics
  const incidentDate = claim.lossDate || claim.accidentDate;
  lines.push(`Incident Date: ${incidentDate ? new Date(incidentDate).toLocaleDateString("en-US", { dateStyle: "long" }) : "Unknown"}`);
  lines.push(`Incident Time: ${claim.lossTime || "Unknown"}`);
  lines.push(`Location: ${claim.lossLocation || claim.location || "Unknown"}`);
  lines.push(`Incident Type: ${claim.incidentType || "Not specified"}`);
  lines.push(`Claim Status: ${claim.claimStatus || "DRAFT"}`);
  lines.push(`Claim Category: ${claim.claimCategory || "Not specified"}`);

  // Driver
  if (driver) {
    lines.push(`Driver: ${driver.firstName || ""} ${driver.lastName || ""}`.trim());
    lines.push(`Driver Number: ${driver.driverNumber || "N/A"}`);
    lines.push(`Driver Classification: ${claim.driverClassification || "Not specified"}`);
  }

  // Vehicle
  if (claim.vehicleMake || claim.vehicleModel) {
    lines.push(`Vehicle: ${[claim.vehicleYear, claim.vehicleMake, claim.vehicleModel].filter(Boolean).join(" ")}`);
  }
  if (claim.vehicleLicensePlate) {
    lines.push(`License Plate: ${claim.vehicleLicensePlate} ${claim.vehicleState || ""}`);
  }

  // Environmental context
  if (claim.weatherConditions) lines.push(`Weather Conditions: ${claim.weatherConditions}`);
  if (claim.roadConditions) lines.push(`Road Conditions: ${claim.roadConditions}`);

  // Incident narrative
  const narrative = [
    claim.descriptionOfLoss,
    claim.description,
    claim.notesReceived,
    claim.reviewNotes,
  ].filter(Boolean).join("\n");
  if (narrative) lines.push(`\nIncident Description / Notes:\n${narrative}`);

  // Injuries
  lines.push(`Injuries Reported: ${claim.injuryFlag ? "Yes" : "No"}`);
  if (claim.injuries) lines.push(`Injury Details: ${claim.injuries}`);

  // Police
  lines.push(`Police Report Filed: ${claim.policeReportFiled ? "Yes" : "No"}`);
  if (claim.policeReportNumber) lines.push(`Police Report #: ${claim.policeReportNumber}`);
  if (claim.policeReportCaseNumber) lines.push(`Police Case #: ${claim.policeReportCaseNumber}`);
  if (claim.policeReportDepartment) lines.push(`Police Department: ${claim.policeReportDepartment}`);

  // Liability
  lines.push(`At-Fault Determination: ${claim.dodAtFault || claim.atFault || "Pending"}`);
  if (claim.liabilityFault) lines.push(`Liability Fault: ${claim.liabilityFault}`);
  lines.push(`Preventability: ${claim.preventability || claim.reviewPreventability || "Undetermined"}`);
  if (claim.reviewRootCause) lines.push(`Root Cause: ${claim.reviewRootCause}`);

  // Damage / financials
  lines.push(`\nDamage Estimates:`);
  lines.push(`  Total Estimate: ${fmt(claim.totalEstimate)}`);
  lines.push(`  Probable Cost: ${fmt(claim.probableCost)}`);
  lines.push(`  Actual Cost: ${fmt(claim.actualCost)}`);
  if (claim.insuranceReserve) lines.push(`  Insurance Reserve: ${fmt(claim.insuranceReserve)}`);
  if (claim.pointOfImpact) lines.push(`Point of Impact: ${claim.pointOfImpact}`);

  // Evidence
  lines.push(`Supporting Documents / Evidence: ${attachmentCount} file${attachmentCount !== 1 ? "s" : ""} attached`);

  // Insurance
  if (claim.insuranceClaimNumber) lines.push(`Insurance Claim #: ${claim.insuranceClaimNumber}`);

  return lines.join("\n");
}

// ── Main generation function ──────────────────────────────────────────────────
export async function generateClaimNarrative(
  claim: any,
  driver: any,
  attachmentCount: number,
): Promise<NarrativeSections> {
  const OpenAI = (await import("openai")).default;
  const openai = new OpenAI({
    apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  });

  const context = buildPromptContext(claim, driver, attachmentCount);

  const prompt = `You are a professional claims analyst for a transportation and logistics company. 
Based on the claim data below, generate a clear, factual, professionally worded claim narrative.

The narrative must be structured into exactly four sections:
1. "whatHappened" — A concise account of the incident: when, where, and how it occurred. Include relevant environmental factors.
2. "whoInvolved" — Identify all parties involved: our driver (name, classification, vehicle), and any third parties if mentioned.
3. "damageSummary" — Summarize property damage, injuries, estimated/actual costs, and evidence status.
4. "liabilityContext" — Describe the at-fault determination, preventability assessment, police involvement, and any relevant root cause analysis.

Guidelines:
- Write in clear, professional prose. Each section should be 2–4 sentences.
- Be factual; do not speculate beyond the data provided.
- If information is missing or unknown, state it briefly (e.g., "At-fault determination is pending").
- Write for two audiences: internal operations staff AND insurance carrier reviewers.
- Do not include section headings in the text — the JSON keys serve as headings.

Respond ONLY with a valid JSON object in this exact format:
{
  "whatHappened": "...",
  "whoInvolved": "...",
  "damageSummary": "...",
  "liabilityContext": "..."
}

CLAIM DATA:
${context}`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    max_completion_tokens: 1000,
  });

  const raw = response.choices[0]?.message?.content || "{}";
  const parsed = JSON.parse(raw);

  return {
    whatHappened:    String(parsed.whatHappened    || "Unable to generate this section.").trim(),
    whoInvolved:     String(parsed.whoInvolved     || "Unable to generate this section.").trim(),
    damageSummary:   String(parsed.damageSummary   || "Unable to generate this section.").trim(),
    liabilityContext: String(parsed.liabilityContext || "Unable to generate this section.").trim(),
  };
}

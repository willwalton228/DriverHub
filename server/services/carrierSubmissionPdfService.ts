import PDFDocument from 'pdfkit';
import { db } from '../db';
import { accidentAttachments, driverDocuments, accountDocuments } from '@shared/schema';
import { ObjectStorageService } from '../objectStorage';

function fmt(val: any): string {
  if (val === null || val === undefined) return '';
  if (val instanceof Date) return val.toLocaleDateString('en-US');
  return String(val);
}

function fmtBool(val: any): string {
  if (val === true) return 'Yes';
  if (val === false) return 'No';
  return '';
}

function fmtDate(val: any): string {
  if (!val) return '';
  const d = val instanceof Date ? val : new Date(val);
  if (isNaN(d.getTime())) return String(val);
  return d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
}

function addSection(doc: PDFKit.PDFDocument, title: string) {
  doc.moveDown(0.5);
  doc.fontSize(12).fillColor('#1a3a5c').text(title, { underline: true });
  doc.moveDown(0.3);
  doc.fillColor('#000').fontSize(10);
}

function addField(doc: PDFKit.PDFDocument, label: string, value: string) {
  if (!value && value !== '0') return;
  doc.fontSize(9).fillColor('#555').text(`${label}:`, { continued: true });
  doc.fillColor('#000').text(`  ${value}`);
}


function addHRule(doc: PDFKit.PDFDocument) {
  doc.moveDown(0.3);
  doc.moveTo(50, doc.y).lineTo(562, doc.y).stroke('#cccccc');
  doc.moveDown(0.4);
}

function addLabelVal(doc: PDFKit.PDFDocument, label: string, value: string, required = false) {
  const lc = required ? '#cc0000' : '#555555';
  doc.fontSize(8).fillColor(lc).text(label + ':', { continued: true });
  doc.fillColor('#000000').fontSize(9).text('  ' + (value || ''), { lineGap: 1 });
}

function addCheck(doc: PDFKit.PDFDocument, label: string, checked: boolean | null | undefined) {
  const box = checked === true ? '[X]' : '[ ]';
  doc.fontSize(9).fillColor('#000000').text(box + '  ' + label, { lineGap: 1 });
}

function addSectionHeader(doc: PDFKit.PDFDocument, title: string) {
  doc.moveDown(0.4);
  doc.fontSize(10).fillColor('#1a3a5c').text(title, { underline: true });
  doc.moveDown(0.25);
  doc.fillColor('#000000').fontSize(9);
}

function collectBuffer(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
}

// ─── Transportation Auto Loss Report — layout constants & helpers ─────────────
const _L   = 50;   // left margin
const _R   = 562;  // right edge
const _FW  = 512;  // full usable width
const _C1W = 248;  // left-column width in 2-col layout

// Draw label (small, colored) + underline + optional value at absolute (x, y).
// Returns the bottom y of this field element.
function _rFld(doc: PDFKit.PDFDocument, x: number, y: number, w: number,
               label: string, value: string, required = false): number {
  const lc = required ? '#cc0000' : '#555555';
  doc.fontSize(8).fillColor(lc).text(label + ':', x, y, { width: w, lineBreak: false });
  const uy = y + 14;
  doc.moveTo(x, uy).lineTo(x + w, uy).stroke('#dddddd');
  if (value) {
    doc.fontSize(9).fillColor('#000000').text(value, x + 2, y + 2, { width: w - 4, lineBreak: false });
  }
  return uy + 5;
}

// Two-column field row — returns bottom y
function _r2(doc: PDFKit.PDFDocument, y: number,
             ll: string, lv: string, rl: string, rv: string,
             lreq = false, rreq = false, lw = _C1W): number {
  const rx = _L + lw + 16;
  const rw = _FW - lw - 16;
  const lb = _rFld(doc, _L, y, lw, ll, lv, lreq);
  const rb = _rFld(doc, rx, y, rw, rl, rv, rreq);
  return Math.max(lb, rb) + 6;
}

// Three-column field row — returns bottom y
function _r3(doc: PDFKit.PDFDocument, y: number,
             l1: string, v1: string, l2: string, v2: string, l3: string, v3: string): number {
  const w1 = 170, w2 = 150;
  const w3 = _FW - w1 - w2 - 24;
  const x2 = _L + w1 + 12;
  const x3 = x2 + w2 + 12;
  const b1 = _rFld(doc, _L, y, w1, l1, v1);
  const b2 = _rFld(doc, x2, y, w2, l2, v2);
  const b3 = _rFld(doc, x3, y, w3, l3, v3);
  return Math.max(b1, b2, b3) + 6;
}

// Full-width field row — returns bottom y
function _rFull(doc: PDFKit.PDFDocument, y: number,
                label: string, value: string, required = false): number {
  return _rFld(doc, _L, y, _FW, label, value, required) + 6;
}

// Full-width text box with outline — returns bottom y
function _rBox(doc: PDFKit.PDFDocument, y: number,
               label: string, value: string, required = false, h = 40): number {
  const lc = required ? '#cc0000' : '#555555';
  doc.fontSize(8).fillColor(lc).text(label + ':', _L, y, { width: _FW, lineBreak: false });
  const by = y + 13;
  doc.rect(_L, by, _FW, h).stroke('#dddddd');
  if (value) {
    doc.fontSize(9).fillColor('#000000').text(value, _L + 3, by + 3, { width: _FW - 6, height: h - 6, lineBreak: true });
  }
  return by + h + 6;
}

// Horizontal rule — returns bottom y
function _hr(doc: PDFKit.PDFDocument, y: number): number {
  doc.moveTo(_L, y).lineTo(_R, y).stroke('#cccccc');
  return y + 8;
}

// Move PDFKit cursor to explicit y without printing
function _mv(doc: PDFKit.PDFDocument, y: number) {
  doc.text('', _L, y, { lineBreak: false });
}

// ─── Transportation Auto Loss Report (standalone, template-faithful) ──────────

export async function generateAutoLossReportPdf(
  claim: any,
  driver: any,
  account: any,
  reportedByName?: string
): Promise<Buffer> {
  const doc = new PDFDocument({ margin: 50, size: 'LETTER', autoFirstPage: true });
  const bufferPromise = collectBuffer(doc);

  const driverClass = (claim.driverClassification || '').toLowerCase();
  const isOwnerOp = driverClass === 'independent_contractor' || driverClass === 'ic';
  const driverName  = driver ? [driver.firstName, driver.lastName].filter(Boolean).join(' ') : '';
  const driverPhone = driver?.phoneNumber || '';
  const dateTimeStr = [
    fmtDate(claim.lossDate || claim.incidentDate || claim.accidentDate),
    fmt(claim.lossTime),
  ].filter(Boolean).join('  ');
  const drivable  = claim.drivable;
  const injured   = claim.injuryFlag;
  const policeYes = !!(claim.policeReportFiled || claim.policeReportObtained ||
                       claim.policeReportNumber || claim.policeReportCaseNumber);
  const hasOther  = !!(claim.claimantName || claim.claimantPhone || claim.claimantVehicleYear);

  // ══════════════════════════ PAGE 1 ══════════════════════════════════════════
  let y = 50;

  // Title / disclaimers
  doc.fontSize(16).fillColor('#1a3a5c')
     .text('Transportation Auto Loss Report', _L, y, { width: _FW, align: 'center' });
  y += 26;
  doc.fontSize(8).fillColor('#cc0000')
     .text('* Submit this promptly. Late reporting causes poor claims outcomes.', _L, y, { width: _FW, align: 'center' });
  y += 12;
  doc.fontSize(8).fillColor('#555555')
     .text('Please fill out form as completely as possible. Indicate if unsure/unknown.', _L, y, { width: _FW, align: 'center' });
  y += 12;
  doc.fontSize(8).fillColor('#cc0000')
     .text('Items in red text are required, but all information is important.', _L, y, { width: _FW, align: 'center' });
  y += 16;
  y = _hr(doc, y);

  // Row: Report Completed By | Accident Date & Time
  y = _r2(doc, y,
    'Report Completed By', reportedByName || '',
    'Accident Date & Time', dateTimeStr,
    true, true);

  // Row: Accident Location (full-width, required)
  y = _rFull(doc, y, 'Accident Location (city/state)', fmt(claim.lossLocation || claim.location), true);

  // Describe the Incident (multi-line box, required)
  y = _rBox(doc, y, 'Describe the Incident', fmt(claim.descriptionOfLoss || claim.description), true, 52);

  y += 2;
  y = _hr(doc, y);

  // Row: Our Company Name | Our Local Office
  y = _r2(doc, y,
    'Our Company Name', fmt(account?.customerName || account?.companyName || ''),
    'Our Local Office',  fmt(account?.city || ''),
    true, false);

  // Row: Our Contact Name | Phone | Email
  y = _r3(doc, y, 'Our Contact Name', reportedByName || '', 'Phone', '', 'Email', '');

  y += 2;
  y = _hr(doc, y);

  // Vehicle Classification section
  doc.fontSize(10).fillColor('#1a3a5c')
     .text('Describe Our Vehicle', _L, y, { lineBreak: false });
  doc.fontSize(8).fillColor('#555555')
     .text('  (check the box or boxes in a row that apply – NOTE this is very important. Do not skip over.)');
  y += 17;

  _mv(doc, y);
  doc.fontSize(9).fillColor('#000000')
     .text(`[${!isOwnerOp ? 'X' : ' '}]  Owned or Leased (6 months or longer) by us`, _L, y, { width: _FW });
  y += 14;

  _mv(doc, y);
  doc.fontSize(9).fillColor('#000000')
     .text('[ ]  Rented by us', _L, y, { lineBreak: false });
  doc.fontSize(9).fillColor('#555555')
     .text('        [ ] Rolling (renewing monthly/weekly)    [ ] Short Term Rental (1 hour to 5 months)', { lineBreak: false });
  y += 14;

  _mv(doc, y);
  doc.fontSize(9).fillColor('#000000')
     .text(`[${isOwnerOp ? 'X' : ' '}]  Furnished by the driver (owner-operator)`, _L, y, { width: _FW });
  y += 14;

  _mv(doc, y);
  doc.fontSize(9).fillColor('#000000')
     .text('[ ]  Substitute for a vehicle in the shop for repair/maintenance', _L, y, { lineBreak: false });
  doc.fontSize(9).fillColor('#555555')
     .text('        [ ] Check box if we own/lease the vehicle in shop', { lineBreak: false });
  y += 16;

  y = _hr(doc, y);

  // Our Vehicle
  y = _rFull(doc, y, "Our Vehicle's VIN (vehicle ID number)", fmt(claim.vehicleVin));
  y = _rFull(doc, y, 'Year, Make, Model, and Plate Number',
    [fmt(claim.vehicleYear), fmt(claim.vehicleMake), fmt(claim.vehicleModel), fmt(claim.vehicleLicensePlate)]
      .filter(Boolean).join(' / '));

  // Vehicle Damaged? (inline, same row)
  _mv(doc, y);
  doc.fontSize(9).fillColor('#000000')
     .text('Vehicle Damaged?    [ ] Yes    [ ] No    Describe:', _L, y, { lineBreak: false });
  doc.moveTo(_L + 220, y + 14).lineTo(_R, y + 14).stroke('#dddddd');
  if (claim.vehicleDamageDescription || claim.description) {
    doc.fontSize(9).fillColor('#000').text(
      fmt(claim.vehicleDamageDescription || ''), _L + 222, y, { width: _FW - 222, lineBreak: false });
  }
  y += 20;

  // Vehicle Drivable? (inline, same row)
  _mv(doc, y);
  doc.fontSize(9).fillColor('#000000')
     .text(
       `Vehicle Drivable?    [${drivable === true ? 'X' : ' '}] Yes    [${drivable === false ? 'X' : ' '}] No    Where taken?`,
       _L, y, { lineBreak: false });
  doc.moveTo(_L + 270, y + 14).lineTo(_R, y + 14).stroke('#dddddd');
  y += 20;

  y = _hr(doc, y);

  // Our Driver
  y = _r2(doc, y, 'Name of Our Driver', driverName, 'Driver Phone No.', driverPhone);
  _mv(doc, y);
  doc.fontSize(9).fillColor('#000000')
     .text(
       `Our Driver is an:    [${isOwnerOp ? ' ' : 'X'}] Employee    [${isOwnerOp ? 'X' : ' '}] Independent Contractor`,
       _L, y, { width: _FW });
  y += 16;

  // Driver Injured? (inline)
  _mv(doc, y);
  doc.fontSize(9).fillColor('#000000')
     .text(
       `Driver Injured?    [${injured ? 'X' : ' '}] Yes    [${!injured ? 'X' : ' '}] No    Describe:`,
       _L, y, { lineBreak: false });
  doc.moveTo(_L + 200, y + 14).lineTo(_R, y + 14).stroke('#dddddd');
  if (claim.injuryDescription) {
    doc.fontSize(9).fillColor('#000').text(fmt(claim.injuryDescription), _L + 202, y, { width: _FW - 202, lineBreak: false });
  }
  y += 20;

  // Cargo Damage? (inline)
  _mv(doc, y);
  doc.fontSize(9).fillColor('#000000')
     .text('Cargo Damage?    [ ] Yes    [ ] No    Describe:', _L, y, { lineBreak: false });
  doc.moveTo(_L + 200, y + 14).lineTo(_R, y + 14).stroke('#dddddd');
  y += 20;

  y = _hr(doc, y);

  // Other Party section
  _mv(doc, y);
  doc.fontSize(10).fillColor('#1a3a5c')
     .text('Other Party Involved in Accident', _L, y, { lineBreak: false });
  doc.fontSize(9).fillColor('#000000')
     .text(`    [${hasOther ? ' ' : 'X'}] Check box if none.  (If multiple parties, copy form and complete one for each)`, { lineBreak: false });
  y += 17;

  y = _rFull(doc, y, 'Describe Damage to Other Vehicle and/or Property',
    fmt(claim.propertyDamageDescription || ''));

  // Any Injuries? (inline)
  _mv(doc, y);
  doc.fontSize(9).fillColor('#000000')
     .text('Any Injuries?    [ ] Yes    [ ] No    [ ] Not Sure    Describe:', _L, y, { lineBreak: false });
  doc.moveTo(_L + 266, y + 14).lineTo(_R, y + 14).stroke('#dddddd');
  y += 20;

  y = _rFull(doc, y, 'Owner of the Vehicle or Property (also Address & Phone No.)',
    [fmt(claim.claimantName), fmt(claim.claimantAddress), fmt(claim.claimantPhone)].filter(Boolean).join('   '));
  y = _rFull(doc, y, 'Other Vehicle Year / Make / Model / Plate Number',
    [fmt(claim.claimantVehicleYear), fmt(claim.claimantVehicleMake), fmt(claim.claimantVehicleModel)].filter(Boolean).join(' / '));

  // Other Driver's Name + same-as-owner checkbox
  _mv(doc, y);
  doc.fontSize(8).fillColor('#555555')
     .text("Other Driver's Name / Address / Phone No.", _L, y, { lineBreak: false });
  doc.fontSize(9).fillColor('#000000')
     .text('  [ ] check box if same as owner', { lineBreak: false });
  doc.moveTo(_L, y + 14).lineTo(_R, y + 14).stroke('#dddddd');
  y += 20;

  // Other Party Insurance
  _mv(doc, y);
  doc.fontSize(9).fillColor('#444444')
     .text("Other Party's Insurance Information:", _L, y);
  y += 16;
  y = _r3(doc, y, 'Company', fmt(claim.claimantInsurance || ''),
          'Policy Number', fmt(claim.claimantPolicyNumber || ''),
          'Effective Date', '');

  // Page 1 footer
  doc.fontSize(7).fillColor('#aaaaaa')
     .text('Transportation Auto Loss Report  |  Page 1 of 2  |  Generated by DriverHub 360',
           _L, 758, { width: _FW, align: 'center' });

  // ══════════════════════════ PAGE 2 ══════════════════════════════════════════
  doc.addPage();
  y = 50;

  // Page 2 header
  doc.fontSize(14).fillColor('#1a3a5c')
     .text('Transportation Auto Loss Report', _L, y, { width: _FW - 80, lineBreak: false });
  doc.fontSize(9).fillColor('#555555')
     .text('page 2 (of 2)', _R - 75, y, { width: 75, align: 'right' });
  y += 26;
  y = _hr(doc, y);

  // Police Involvement
  _mv(doc, y);
  doc.fontSize(9).fillColor('#000000')
     .text(
       `Police Involvement?    [${policeYes ? 'X' : ' '}] Yes    [${!policeYes ? 'X' : ' '}] No`,
       _L, y, { width: _FW });
  y += 18;
  y = _r2(doc, y,
    'Police Department Making Report', fmt(claim.policeReportDepartment || ''),
    'Report Number', fmt(claim.policeReportNumber || claim.policeReportCaseNumber || ''));
  y = _r2(doc, y, 'Police Officer Name', '', 'Badge Number', '');
  y += 2;

  _mv(doc, y);
  doc.fontSize(9).fillColor('#000000')
     .text(
       'Citation Issued to You?    [ ] Yes    [ ] No        Citation Issued to Other Party?    [ ] Yes    [ ] No',
       _L, y, { width: _FW });
  y += 18;

  y = _hr(doc, y);

  // Witnesses
  y = _rFull(doc, y, 'Witness 1: (name / address / phone)',
    [fmt(claim.witnessName), fmt(claim.witnessPhone)].filter(Boolean).join('   '));
  y = _rFull(doc, y, 'Witness 2', '');

  y += 2;
  y = _hr(doc, y);

  // Additional Comments
  y = _rBox(doc, y, 'Additional Comments', fmt(claim.notes || ''), false, 60);

  y += 2;
  y = _hr(doc, y);

  // Accident Scene Diagram
  _mv(doc, y);
  doc.fontSize(10).fillColor('#1a3a5c').text('Accident Scene Diagram', _L, y);
  y += 16;
  doc.fontSize(8).fillColor('#555555')
     .text(
       '(Please sketch a simple diagram of the accident scene showing road, vehicles, etc. Use the sample diagram as a guide. Number the vehicles with ours labeled as #1.)',
       _L, y, { width: _FW });
  y += 28;

  const diagH = Math.max(748 - y, 120);
  doc.rect(_L, y, _FW, diagH).stroke('#cccccc');
  doc.fontSize(9).fillColor('#bbbbbb')
     .text('[Accident Scene Diagram — Phase 1 Placeholder]', _L, y + diagH / 2 - 10, { width: _FW, align: 'center' });
  doc.fontSize(7).fillColor('#cccccc')
     .text('Future phase: user sketch / markup tool', _L, y + diagH / 2 + 5, { width: _FW, align: 'center' });

  // Page 2 footer
  doc.fontSize(7).fillColor('#aaaaaa')
     .text('Generated by DriverHub 360', _L, 758, { width: _FW / 2, align: 'left' });
  doc.fontSize(7).fillColor('#aaaaaa')
     .text('ed. 5-18', _R - 50, 758, { width: 50, align: 'right' });

  doc.end();
  return bufferPromise;
}


// ─── Save Auto Loss Report to claim + driver + account records ───────────────

export async function saveAutoLossReportToAll(
  pdfBuffer: Buffer,
  claim: any,
  driver: any,
  account: any,
  fileName: string,
  userId: string,
  userName: string
): Promise<{ objectPath: string; attachmentId: string }> {
  const storageService = new ObjectStorageService();
  const { objectPath } = await storageService.uploadFile(pdfBuffer, 'application/pdf', fileName);

  // 1. Save to claim attachments
  const [attachment] = await db.insert(accidentAttachments).values({
    accidentId: claim.id,
    fileName,
    fileType: 'application/pdf',
    fileSize: pdfBuffer.length,
    fileUrl: objectPath,
    uploadedBy: userId,
    category: 'auto_loss_report',
    notes: `Auto-generated by ${userName}`,
  }).returning();

  // 2. Save to driver documents (base64 encoded)
  if (driver?.id) {
    try {
      await db.insert(driverDocuments).values({
        driverId: driver.id,
        documentType: 'auto_loss_report',
        fileName,
        fileSize: String(pdfBuffer.length),
        mimeType: 'application/pdf',
        fileData: pdfBuffer.toString('base64'),
        description: `Auto Loss Report — Claim ${claim.id.substring(0, 8).toUpperCase()} — ${new Date().toLocaleDateString('en-US')}`,
        uploadedBy: userId,
      });
    } catch (e) {
      // Non-fatal: claim attachment already saved
      console.warn('Could not link auto loss report to driver record:', e);
    }
  }

  // 3. Save to account documents
  if (account?.id) {
    try {
      await db.insert(accountDocuments).values({
        customerId: account.id,
        filename: fileName,
        originalFilename: fileName,
        fileUrl: objectPath,
        fileSize: pdfBuffer.length,
        mimeType: 'application/pdf',
        category: 'auto_loss_report',
        label: `Auto Loss Report — Claim ${claim.id.substring(0, 8).toUpperCase()}`,
        notes: `Linked from claim ${claim.id}. Generated by ${userName}.`,
        uploadedByUserId: userId,
        status: 'active',
      });
    } catch (e) {
      console.warn('Could not link auto loss report to account record:', e);
    }
  }

  return { objectPath, attachmentId: attachment.id };
}

function addCoverSheet(doc: PDFKit.PDFDocument, claim: any, driver: any, account: any, claimType: string) {
  doc.fontSize(18).fillColor('#1a3a5c').text('DriverHub 360', { align: 'center' });
  doc.fontSize(14).text('Carrier Submission Packet', { align: 'center' });
  doc.moveDown(0.5);
  doc.fontSize(10).fillColor('#666').text(`Generated: ${new Date().toLocaleDateString('en-US')}`, { align: 'center' });
  doc.text(`Claim Type: ${claimType === 'general_liability' ? 'General Liability' : 'Auto'}`, { align: 'center' });
  doc.moveDown();

  doc.fillColor('#000');
  addSection(doc, 'Claim Summary');
  addField(doc, 'Claim ID', fmt(claim.id));
  addField(doc, 'Incident Date', fmtDate(claim.incidentDate));
  addField(doc, 'Status', fmt(claim.claimStatus));
  addField(doc, 'Carrier Submission Status', fmt(claim.carrierSubmissionStatus));
  addField(doc, 'Severity', fmt(claim.claimSeverity || claim.triageSeverity));
  addField(doc, 'Catastrophic Loss', fmtBool(claim.catastrophicLoss));

  if (driver) {
    addSection(doc, 'Driver Information');
    const driverName = [driver.firstName, driver.lastName].filter(Boolean).join(' ');
    addField(doc, 'Name', driverName);
    addField(doc, 'Driver Number', fmt(driver.driverNumber));
    addField(doc, 'License Number', fmt(driver.licenseNumber));
    addField(doc, 'License State', fmt(driver.licenseState));
  }

  if (account) {
    addSection(doc, 'Account Information');
    addField(doc, 'Customer', fmt(account.customerName));
    addField(doc, 'Account Number', fmt(account.accountNumber));
  }
}

export async function generateAutoCarrierFormPdf(claim: any, driver: any, account: any): Promise<Buffer> {
  const doc = new PDFDocument({ margin: 40, size: 'LETTER' });
  const bufferPromise = collectBuffer(doc);

  doc.fontSize(16).fillColor('#1a3a5c').text('Auto Claim Carrier Report Form', { align: 'center' });
  doc.moveDown(0.3);
  doc.fontSize(9).fillColor('#666').text(`Claim ID: ${claim.id}  |  Generated: ${new Date().toLocaleDateString('en-US')}`, { align: 'center' });
  doc.moveDown();
  doc.fillColor('#000');

  addSection(doc, 'Loss Details');
  addField(doc, 'Date of Loss', fmtDate(claim.lossDate || claim.incidentDate));
  addField(doc, 'Time of Loss', fmt(claim.lossTime));
  addField(doc, 'Location', fmt(claim.lossLocation || claim.location));
  addField(doc, 'Description of Loss', fmt(claim.descriptionOfLoss || claim.description));
  addField(doc, 'Point of Impact', fmt(claim.pointOfImpact));
  addField(doc, 'Weather Conditions', fmt(claim.weatherConditions));
  addField(doc, 'Road Conditions', fmt(claim.roadConditions));

  addSection(doc, 'Our Vehicle');
  addField(doc, 'Year', fmt(claim.vehicleYear));
  addField(doc, 'Make', fmt(claim.vehicleMake));
  addField(doc, 'Model', fmt(claim.vehicleModel));
  addField(doc, 'VIN', fmt(claim.vehicleVin));
  addField(doc, 'License Plate', fmt(claim.vehicleLicensePlate));
  addField(doc, 'State', fmt(claim.vehicleState));

  if (driver) {
    addSection(doc, 'Driver');
    const driverName = [driver.firstName, driver.lastName].filter(Boolean).join(' ');
    addField(doc, 'Name', driverName);
    addField(doc, 'License Number', fmt(driver.licenseNumber));
    addField(doc, 'License State', fmt(driver.licenseState));
    addField(doc, 'Phone', fmt(driver.phoneNumber));
  }

  addSection(doc, 'Other Party / Claimant');
  addField(doc, 'Name', fmt(claim.claimantName));
  addField(doc, 'Phone', fmt(claim.claimantPhone));
  addField(doc, 'Address', fmt(claim.claimantAddress));
  addField(doc, 'Insurance Company', fmt(claim.claimantInsurance));
  addField(doc, 'Policy Number', fmt(claim.claimantPolicyNumber));
  addField(doc, 'Vehicle Year', fmt(claim.claimantVehicleYear));
  addField(doc, 'Vehicle Make', fmt(claim.claimantVehicleMake));
  addField(doc, 'Vehicle Model', fmt(claim.claimantVehicleModel));
  addField(doc, 'Vehicle VIN', fmt(claim.claimantVehicleVin));

  addSection(doc, 'Police Report');
  addField(doc, 'Police Report Obtained', fmtBool(claim.policeReportObtained));
  addField(doc, 'Department', fmt(claim.policeReportDepartment));
  addField(doc, 'Case Number', fmt(claim.policeReportCaseNumber));

  addSection(doc, 'Witnesses');
  addField(doc, 'Name', fmt(claim.witnessName));
  addField(doc, 'Phone', fmt(claim.witnessPhone));
  addField(doc, 'Statement', fmt(claim.witnessStatement));

  addSection(doc, 'Injuries');
  addField(doc, 'Injury Description', fmt(claim.injuryDescription));
  addField(doc, 'Medical Treatment Sought', fmtBool(claim.medicalTreatmentSought));
  addField(doc, 'Medical Provider', fmt(claim.medicalProvider));

  addSection(doc, 'Catastrophic Loss');
  addField(doc, 'Catastrophic Loss', fmtBool(claim.catastrophicLoss));
  addField(doc, 'Acknowledged', fmtBool(claim.catastrophicAcknowledged));

  if (claim.branchName || claim.policyNumber) {
    addSection(doc, 'Policy Information');
    addField(doc, 'Branch', fmt(claim.branchName));
    addField(doc, 'Branch Number', fmt(claim.branchNumber));
    addField(doc, 'Policy Number', fmt(claim.policyNumber));
    addField(doc, 'Account Number', fmt(claim.accountNumber));
  }

  doc.moveDown(2);
  doc.fontSize(8).fillColor('#999').text('Generated by DriverHub 360 — Auto Carrier Claim Form', { align: 'center' });

  doc.end();

  return bufferPromise;
}

export async function generateGLCarrierFormPdf(claim: any, driver: any, account: any): Promise<Buffer> {
  const doc = new PDFDocument({ margin: 40, size: 'LETTER' });
  const bufferPromise = collectBuffer(doc);

  doc.fontSize(16).fillColor('#1a3a5c').text('General Liability Claim Report Form', { align: 'center' });
  doc.moveDown(0.3);
  doc.fontSize(9).fillColor('#666').text(`Claim ID: ${claim.id}  |  Generated: ${new Date().toLocaleDateString('en-US')}`, { align: 'center' });
  doc.moveDown();
  doc.fillColor('#000');

  addSection(doc, 'Insured');
  addField(doc, 'Insured Name', fmt(claim.insuredName || 'AutoNition, LLC DBA Driver on Demand'));

  addSection(doc, 'Loss Information');
  addField(doc, 'Date of Loss', fmtDate(claim.lossDate || claim.incidentDate));
  addField(doc, 'Time of Loss', fmt(claim.lossTime));
  addField(doc, 'Location Address', fmt(claim.lossLocationAddress || claim.lossLocation || claim.location));
  addField(doc, 'City', fmt(claim.lossLocationCity));
  addField(doc, 'State', fmt(claim.lossLocationState));
  addField(doc, 'Zip', fmt(claim.lossLocationZip));
  addField(doc, 'Description of Alleged Incident', fmt(claim.allegedIncidentDescription || claim.descriptionOfLoss || claim.description));

  addSection(doc, 'Product Involvement');
  addField(doc, 'Product Involved', fmtBool(claim.productInvolved));
  addField(doc, 'Product Description', fmt(claim.productDescription));

  addSection(doc, 'Injured Parties');
  const parties = Array.isArray(claim.injuredParties) ? claim.injuredParties : [];
  if (parties.length === 0) {
    doc.fontSize(9).fillColor('#888').text('None reported');
    doc.fillColor('#000');
  } else {
    parties.forEach((p: any, i: number) => {
      doc.fontSize(9).fillColor('#333').text(`Party ${i + 1}:`);
      doc.fillColor('#000');
      addField(doc, '  Name', fmt(p.name));
      addField(doc, '  Phone', fmt(p.phone));
      addField(doc, '  Address', fmt(p.address));
      addField(doc, '  City', fmt(p.city));
      addField(doc, '  State', fmt(p.state));
      addField(doc, '  Zip', fmt(p.zip));
      addField(doc, '  Extent of Injury', fmt(p.extentOfInjury));
    });
  }

  addSection(doc, 'Property Damage');
  const dmgEntries = Array.isArray(claim.propertyDamageEntries) ? claim.propertyDamageEntries : [];
  if (dmgEntries.length === 0) {
    doc.fontSize(9).fillColor('#888').text('None reported');
    doc.fillColor('#000');
  } else {
    dmgEntries.forEach((d: any, i: number) => {
      doc.fontSize(9).fillColor('#333').text(`Entry ${i + 1}:`);
      doc.fillColor('#000');
      addField(doc, '  Name', fmt(d.name));
      addField(doc, '  Phone', fmt(d.phone));
      addField(doc, '  Address', fmt(d.address));
      addField(doc, '  City', fmt(d.city));
      addField(doc, '  State', fmt(d.state));
      addField(doc, '  Zip', fmt(d.zip));
      addField(doc, '  Type of Damage', fmt(d.typeOfDamage));
      addField(doc, '  Extent of Damage', fmt(d.extentOfDamage));
    });
  }

  addSection(doc, 'Lawsuit');
  addField(doc, 'Lawsuit Filed', fmtBool(claim.lawsuitFiled));
  addField(doc, 'County / State', fmt(claim.lawsuitCountyState));
  addField(doc, 'Date of Service', fmtDate(claim.dateOfService));

  addSection(doc, 'Report Filed By');
  addField(doc, 'Name', fmt(claim.reportFiledByName));
  addField(doc, 'Email', fmt(claim.reportFiledByEmail));
  addField(doc, 'Phone', fmt(claim.reportFiledByPhone));
  addField(doc, 'Date of Report', fmtDate(claim.dateOfReport));

  addSection(doc, 'Catastrophic Loss');
  addField(doc, 'Catastrophic Loss', fmtBool(claim.catastrophicLoss));
  addField(doc, 'Acknowledged', fmtBool(claim.catastrophicAcknowledged));

  if (claim.branchName || claim.policyNumber) {
    addSection(doc, 'Policy Information');
    addField(doc, 'Branch', fmt(claim.branchName));
    addField(doc, 'Branch Number', fmt(claim.branchNumber));
    addField(doc, 'Policy Number', fmt(claim.policyNumber));
    addField(doc, 'Account Number', fmt(claim.accountNumber));
  }

  doc.moveDown(2);
  doc.fontSize(8).fillColor('#999').text('Generated by DriverHub 360 — General Liability Carrier Claim Form', { align: 'center' });

  doc.end();

  return bufferPromise;
}

export async function generateSubmissionPacketPdf(
  claim: any,
  driver: any,
  account: any,
  attachments: any[],
  claimType: string
): Promise<Buffer> {
  const doc = new PDFDocument({ margin: 40, size: 'LETTER' });
  const bufferPromise = collectBuffer(doc);

  addCoverSheet(doc, claim, driver, account, claimType);

  // For auto claims, embed the Transportation Auto Loss Report before the carrier form
  if (claimType !== 'general_liability') {
    doc.addPage();
    const navy2 = '#1a3a5c';
    const red2  = '#cc0000';
    const driverClass2 = (claim.driverClassification || '').toLowerCase();
    const isOwnerOp2 = driverClass2 === 'independent_contractor' || driverClass2 === 'ic';
    const driverName2 = driver ? [driver.firstName, driver.lastName].filter(Boolean).join(' ') : '';

    doc.fontSize(14).fillColor(navy2).text('Transportation Auto Loss Report', { align: 'center' });
    doc.moveDown(0.2);
    doc.fontSize(8).fillColor(red2).text('* Submit this promptly. Late reporting causes poor claims outcomes.', { align: 'center' });
    addHRule(doc);

    addLabelVal(doc, 'Accident Date & Time',
      [fmtDate(claim.lossDate || claim.incidentDate || claim.accidentDate), fmt(claim.lossTime)].filter(Boolean).join('  '),
      true
    );
    addLabelVal(doc, 'Accident Location (city/state)', fmt(claim.lossLocation || claim.location), true);
    doc.fontSize(8).fillColor(red2).text('Describe the Incident:');
    doc.fontSize(9).fillColor('#000').text(fmt(claim.descriptionOfLoss || claim.description) || '', { width: 462 });

    addSectionHeader(doc, 'Vehicle Classification');
    addCheck(doc, 'Owned or Leased (6 months or longer) by us', isOwnerOp2 ? false : true);
    addCheck(doc, 'Furnished by the driver (owner-operator)', isOwnerOp2);
    addCheck(doc, 'Rented / Rolling rental / Short Term Rental', false);
    addCheck(doc, 'Substitute for vehicle in shop', false);

    addSectionHeader(doc, 'Our Vehicle');
    addLabelVal(doc, 'VIN', fmt(claim.vehicleVin));
    addLabelVal(doc, 'Year / Make / Model / Plate',
      [fmt(claim.vehicleYear), fmt(claim.vehicleMake), fmt(claim.vehicleModel), fmt(claim.vehicleLicensePlate)].filter(Boolean).join(' / ')
    );
    const drivable2 = claim.drivable;
    doc.fontSize(8).fillColor('#555').text('Vehicle Drivable?', { continued: true });
    doc.fillColor('#000').fontSize(9).text(`  [${drivable2 === true ? 'X' : ' '}] Yes  [${drivable2 === false ? 'X' : ' '}] No`);

    addSectionHeader(doc, 'Our Driver');
    addLabelVal(doc, 'Name', driverName2);
    doc.fontSize(8).fillColor('#555').text('Driver Classification:', { continued: true });
    doc.fillColor('#000').fontSize(9).text(
      `  [${isOwnerOp2 ? ' ' : 'X'}] Employee  [${isOwnerOp2 ? 'X' : ' '}] Independent Contractor`
    );
    const driverInjured2 = claim.injuryFlag;
    doc.fontSize(8).fillColor('#555').text('Driver Injured?', { continued: true });
    doc.fillColor('#000').fontSize(9).text(
      `  [${driverInjured2 ? 'X' : ' '}] Yes  [${!driverInjured2 ? 'X' : ' '}] No` +
      (claim.injuryDescription ? `   ${claim.injuryDescription}` : '')
    );

    addSectionHeader(doc, 'Other Party');
    if (claim.claimantName || claim.claimantPhone) {
      addLabelVal(doc, 'Name / Address / Phone',
        [fmt(claim.claimantName), fmt(claim.claimantAddress), fmt(claim.claimantPhone)].filter(Boolean).join('  ')
      );
      addLabelVal(doc, 'Other Vehicle',
        [fmt(claim.claimantVehicleYear), fmt(claim.claimantVehicleMake), fmt(claim.claimantVehicleModel)].filter(Boolean).join(' / ')
      );
      addLabelVal(doc, 'Insurance / Policy', `${fmt(claim.claimantInsurance)}  ${fmt(claim.claimantPolicyNumber)}`);
    } else {
      doc.fontSize(9).fillColor('#000').text('[X] None');
    }

    addSectionHeader(doc, 'Police');
    const policeInvolved2 = !!(claim.policeReportFiled || claim.policeReportObtained || claim.policeReportNumber || claim.policeReportCaseNumber);
    doc.fontSize(8).fillColor('#555').text('Police Involvement?', { continued: true });
    doc.fillColor('#000').fontSize(9).text(`  [${policeInvolved2 ? 'X' : ' '}] Yes  [${!policeInvolved2 ? 'X' : ' '}] No`);
    if (policeInvolved2) {
      addLabelVal(doc, 'Department', fmt(claim.policeReportDepartment || ''));
      addLabelVal(doc, 'Report Number', fmt(claim.policeReportNumber || claim.policeReportCaseNumber || ''));
    }

    addSectionHeader(doc, 'Witnesses');
    addLabelVal(doc, 'Witness 1', [fmt(claim.witnessName), fmt(claim.witnessPhone)].filter(Boolean).join('  '));

    doc.moveDown(0.5);
    addSectionHeader(doc, 'Accident Scene Diagram');
    doc.fontSize(8).fillColor('#555').text('(Phase 1 Placeholder — sketch tool coming in future release)');
    doc.moveDown(0.3);
    const dY = doc.y;
    doc.rect(50, dY, 462, 130).stroke('#cccccc');
    doc.fontSize(9).fillColor('#aaaaaa').text('[Accident Scene Diagram]', 50, dY + 55, { width: 462, align: 'center' });
    doc.moveDown(0.3);
    if (doc.y < dY + 140) {
      doc.text('', 50, dY + 140);
    }

    doc.moveDown(0.5);
    doc.fontSize(7).fillColor('#aaaaaa').text(
      'Transportation Auto Loss Report  |  Included in Carrier Submission Packet  |  Generated by DriverHub 360',
      { align: 'center' }
    );
  }

  doc.addPage();
  if (claimType === 'general_liability') {
    doc.fontSize(16).fillColor('#1a3a5c').text('General Liability Claim Report Form', { align: 'center' });
    doc.moveDown(0.3);
    doc.fillColor('#000');

    addSection(doc, 'Insured');
    addField(doc, 'Insured Name', fmt(claim.insuredName || 'AutoNition, LLC DBA Driver on Demand'));

    addSection(doc, 'Loss Information');
    addField(doc, 'Date of Loss', fmtDate(claim.lossDate || claim.incidentDate));
    addField(doc, 'Time of Loss', fmt(claim.lossTime));
    addField(doc, 'Location Address', fmt(claim.lossLocationAddress || claim.lossLocation || claim.location));
    addField(doc, 'City', fmt(claim.lossLocationCity));
    addField(doc, 'State', fmt(claim.lossLocationState));
    addField(doc, 'Zip', fmt(claim.lossLocationZip));
    addField(doc, 'Description', fmt(claim.allegedIncidentDescription || claim.descriptionOfLoss || claim.description));

    addSection(doc, 'Injured Parties');
    const parties = Array.isArray(claim.injuredParties) ? claim.injuredParties : [];
    if (parties.length === 0) {
      doc.fontSize(9).fillColor('#888').text('None reported');
    } else {
      parties.forEach((p: any, i: number) => {
        doc.fillColor('#333').fontSize(9).text(`Party ${i + 1}: ${fmt(p.name)} — ${fmt(p.injuryDescription)}`);
      });
    }
    doc.fillColor('#000');

    addSection(doc, 'Property Damage');
    const dmgEntries = Array.isArray(claim.propertyDamageEntries) ? claim.propertyDamageEntries : [];
    if (dmgEntries.length === 0) {
      doc.fontSize(9).fillColor('#888').text('None reported');
    } else {
      dmgEntries.forEach((d: any, i: number) => {
        doc.fillColor('#333').fontSize(9).text(`Entry ${i + 1}: ${fmt(d.ownerName)} — ${fmt(d.description)}`);
      });
    }
    doc.fillColor('#000');

    addSection(doc, 'Lawsuit');
    addField(doc, 'Lawsuit Filed', fmtBool(claim.lawsuitFiled));
    addField(doc, 'County / State', fmt(claim.lawsuitCountyState));

    addSection(doc, 'Reporter');
    addField(doc, 'Name', fmt(claim.reportFiledByName));
    addField(doc, 'Email', fmt(claim.reportFiledByEmail));
    addField(doc, 'Phone', fmt(claim.reportFiledByPhone));
  } else {
    doc.fontSize(16).fillColor('#1a3a5c').text('Auto Claim Carrier Report Form', { align: 'center' });
    doc.moveDown(0.3);
    doc.fillColor('#000');

    addSection(doc, 'Loss Details');
    addField(doc, 'Date of Loss', fmtDate(claim.lossDate || claim.incidentDate));
    addField(doc, 'Time of Loss', fmt(claim.lossTime));
    addField(doc, 'Location', fmt(claim.lossLocation || claim.location));
    addField(doc, 'Description', fmt(claim.descriptionOfLoss || claim.description));
    addField(doc, 'Point of Impact', fmt(claim.pointOfImpact));
    addField(doc, 'Weather', fmt(claim.weatherConditions));
    addField(doc, 'Road Conditions', fmt(claim.roadConditions));

    addSection(doc, 'Our Vehicle');
    addField(doc, 'Year/Make/Model', [claim.vehicleYear, claim.vehicleMake, claim.vehicleModel].filter(Boolean).join(' '));
    addField(doc, 'VIN', fmt(claim.vehicleVin));
    addField(doc, 'License Plate', fmt(claim.vehicleLicensePlate));

    addSection(doc, 'Other Party');
    addField(doc, 'Name', fmt(claim.claimantName));
    addField(doc, 'Phone', fmt(claim.claimantPhone));
    addField(doc, 'Insurance', fmt(claim.claimantInsurance));
    addField(doc, 'Policy #', fmt(claim.claimantPolicyNumber));

    addSection(doc, 'Police Report');
    addField(doc, 'Obtained', fmtBool(claim.policeReportObtained));
    addField(doc, 'Department', fmt(claim.policeReportDepartment));
    addField(doc, 'Case #', fmt(claim.policeReportCaseNumber));

    addSection(doc, 'Injuries');
    addField(doc, 'Description', fmt(claim.injuryDescription));
    addField(doc, 'Medical Treatment', fmtBool(claim.medicalTreatmentSought));
    addField(doc, 'Provider', fmt(claim.medicalProvider));
  }

  addSection(doc, 'Catastrophic Loss');
  addField(doc, 'Catastrophic', fmtBool(claim.catastrophicLoss));
  addField(doc, 'Acknowledged', fmtBool(claim.catastrophicAcknowledged));

  doc.addPage();
  doc.fontSize(14).fillColor('#1a3a5c').text('Evidence / Attachments Index', { align: 'center' });
  doc.moveDown();
  doc.fillColor('#000').fontSize(10);

  if (attachments.length === 0) {
    doc.fontSize(10).fillColor('#888').text('No attachments on file.');
  } else {
    const colWidths = [30, 180, 100, 100, 100];
    const headers = ['#', 'File Name', 'Category', 'Uploaded By', 'Date'];
    let x = 40;
    doc.fontSize(8).fillColor('#555');
    headers.forEach((h, i) => {
      doc.text(h, x, doc.y, { width: colWidths[i], continued: i < headers.length - 1 });
      x += colWidths[i];
    });
    doc.moveDown(0.3);
    doc.moveTo(40, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown(0.3);

    doc.fillColor('#000');
    attachments.forEach((att, idx) => {
      if (doc.y > 700) doc.addPage();
      x = 40;
      const row = [
        String(idx + 1),
        (att.fileName || '').substring(0, 35),
        fmt(att.category),
        fmt(att.uploadedByName || att.uploadedBy),
        fmtDate(att.createdAt),
      ];
      row.forEach((cell, i) => {
        doc.fontSize(8).text(cell, x, doc.y, { width: colWidths[i], continued: i < row.length - 1 });
        x += colWidths[i];
      });
      doc.moveDown(0.2);
    });
  }

  doc.moveDown(2);
  doc.fontSize(8).fillColor('#999').text('Generated by DriverHub 360 — Carrier Submission Packet', { align: 'center' });

  doc.end();

  return bufferPromise;
}

export async function savePdfToStorage(
  pdfBuffer: Buffer,
  claimId: string,
  fileName: string,
  category: string,
  userId: string,
  userName: string
): Promise<{ objectPath: string; attachmentId: string }> {
  const storageService = new ObjectStorageService();
  const { objectPath } = await storageService.uploadFile(pdfBuffer, 'application/pdf', fileName);

  const [attachment] = await db.insert(accidentAttachments).values({
    accidentId: claimId,
    fileName,
    fileType: 'application/pdf',
    fileSize: pdfBuffer.length,
    fileUrl: objectPath,
    uploadedBy: userId,
    category,
    notes: `Auto-generated by ${userName}`,
  }).returning();

  return { objectPath, attachmentId: attachment.id };
}

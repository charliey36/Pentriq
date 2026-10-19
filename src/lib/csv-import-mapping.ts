import { parseServiceDate } from '@/lib/eligibility';

export const CSV_IMPORT_FIELDS = ['name', 'email', 'date', 'service', 'phone', 'amount'] as const;
export type CsvImportField = (typeof CSV_IMPORT_FIELDS)[number];
export type CsvConfirmedMapping = Partial<Record<CsvImportField, number>> & {
  firstName?: number;
  lastName?: number;
};
export type CsvFieldMapping = {
  field: CsvImportField;
  columnIndex: number | null;
  header: string | null;
  confidence: 'high' | 'medium' | 'low' | 'none';
  confidenceScore: number;
  samples: string[];
};
export type CsvMappingAnalysis = {
  headers: string[];
  mappings: Record<CsvImportField, CsvFieldMapping>;
  nameParts: { firstName: number | null; lastName: number | null };
};

type Candidate = { columnIndex: number; header: string; samples: string[]; score: number };

const ALIASES: Record<CsvImportField, string[]> = {
  name: [
    'name', 'fullname', 'customername', 'clientname', 'contactname', 'guestname', 'membername', 'username',
    'patientname', 'leadname', 'consumername', 'accountname', 'customer', 'client',
  ],
  email: [
    'email', 'emailaddress', 'email1', 'emailaddress1', 'emailcontact', 'customeremail', 'clientemail',
    'primaryemail', 'personalemail', 'workemail', 'contactemail', 'mail',
  ],
  phone: [
    'phone', 'phonenumber', 'telephonenumber', 'mobile', 'mobilenumber', 'cell', 'cellphone', 'cellnumber',
    'telephone', 'tel', 'contactnumber', 'primaryphone', 'customerphone', 'clientphone', 'workphone',
    'homephone', 'businessphone', 'daytimephone',
  ],
  date: [
    'date', 'visitdate', 'appointmentdate', 'bookingdate', 'servicedate', 'lastvisit', 'lastappointment',
    'transactiondate', 'attendancedate', 'visittimestamp', 'appointmenttimestamp', 'bookingtimestamp',
    'datecompleted', 'completeddate', 'saledate', 'invoicedate', 'dateofservice', 'jobdate',
  ],
  service: [
    'service', 'servicename', 'treatment', 'treatmentname', 'bookingtype', 'appointmenttype', 'visittype',
    'package', 'category', 'procedure', 'sessiontype', 'workperformed', 'jobtype', 'servicedescription',
    'serviceType', 'servicetype', 'jobname', 'worktype', 'description', 'workcompleted',
  ],
  amount: [
    'amount', 'amountspent', 'total', 'totalspend', 'spend', 'price', 'cost', 'salevalue', 'revenue',
    'transactionamount', 'paymentamount', 'invoicevalue', 'appointmentvalue', 'grossvalue', 'netvalue',
    'totalrevenue', 'charge', 'amountpaid', 'serviceprice', 'servicecost', 'value', 'fee',
  ],
};

const FIRST_NAME_ALIASES = ['firstname', 'givenname', 'forename', 'christianname', 'first'];
const LAST_NAME_ALIASES = ['lastname', 'surname', 'familyname', 'secondname', 'last', 'family'];
const STAFF_HEADERS = ['barber', 'serviceprovider', 'stylist', 'therapist', 'technician', 'employee', 'staffmember', 'staff'];
const ID_HEADER_PARTS = ['id', 'identifier', 'number', 'code', 'reference', 'ref'];
const SERVICE_VALUE_PATTERNS = /^(?:skin fade|beard trim|buzz cut|classic cut|hair colour|hair color|consultation|boiler repair)$/i;

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function headerWords(value: string): string[] {
  return value.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

function sampleValues(rows: string[][], index: number): string[] {
  return rows.slice(1, 4).map((row) => row[index]?.trim() ?? '').filter(Boolean);
}

function isDateLike(value: string): boolean {
  return Boolean(parseServiceDate(value)) || (/\d{1,4}[/-]\d{1,2}[/-]\d{1,4}/.test(value) && !Number.isNaN(Date.parse(value)));
}

function isLikelyName(value: string): boolean {
  const clean = value.trim();
  if (!/[a-z]/i.test(clean) || clean.length < 2 || /@/.test(clean)) return false;
  if (/^cust(?:omer)?[-_ ]?\d+$/i.test(clean) || /^[a-z]+[-_ ]?(?:id|number|code|ref)\d*$/i.test(clean)) return false;
  if (SERVICE_VALUE_PATTERNS.test(clean)) return false;
  if (/^\d+$/.test(clean) || /^\+?[\d ()-]{7,}$/.test(clean)) return false;
  return true;
}

function patternRatio(values: string[], predicate: (value: string) => boolean): number {
  return values.length === 0 ? 0 : values.filter(predicate).length / values.length;
}

function sampleScore(field: CsvImportField, values: string[]): number {
  switch (field) {
    case 'email':
      return patternRatio(values, (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) * 30;
    case 'phone':
      return patternRatio(values, (v) => {
        const digits = v.replace(/\D/g, '');
        return digits.length >= 7 && digits.length <= 15 && !/^[$£€]?\s*\d[\d,]*(?:\.\d+)?$/.test(v);
      }) * 30;
    case 'date':
      return patternRatio(values, isDateLike) * 30;
    case 'amount':
      return patternRatio(values, (v) => /^[-+]?\s*[$£€]?\s*\d[\d,]*(?:\.\d+)?\s*$/.test(v)) * 30;
    case 'name':
      return patternRatio(values, isLikelyName) * 30;
    case 'service':
      return patternRatio(values, (v) => isLikelyName(v) && v.length <= 120) * 18;
  }
}

function headerScore(field: CsvImportField, header: string): number {
  const normalizedHeader = normalize(header);
  if (STAFF_HEADERS.includes(normalizedHeader) && (field === 'name' || field === 'service')) return 0;
  if (field === 'name' && (FIRST_NAME_ALIASES.includes(normalizedHeader) || LAST_NAME_ALIASES.includes(normalizedHeader))) return 0;
  const aliases = ALIASES[field];
  // Name priority is intentionally strict: only an exact approved full-name alias
  // may win here. `service name` must never inherit the generic `name` token.
  if (field === 'name') return aliases.includes(normalizedHeader) ? 70 : 0;
  if (aliases.includes(normalizedHeader)) return 70;
  if (aliases.some((alias) => normalizedHeader.includes(alias) || alias.includes(normalizedHeader))) return 45;
  return 0;
}

function score(field: CsvImportField, header: string, values: string[]): number {
  const normalizedHeader = normalize(header);
  if (STAFF_HEADERS.includes(normalizedHeader) && (field === 'name' || field === 'service')) return 0;
  const words = headerWords(header);
  if (field === 'name' && words.some((word) => ID_HEADER_PARTS.includes(word))) return 0;
  return Math.min(100, headerScore(field, header) + sampleScore(field, values));
}

function confidence(scoreValue: number): CsvFieldMapping['confidence'] {
  if (scoreValue >= 90) return 'high';
  if (scoreValue >= 70) return 'medium';
  if (scoreValue >= 40) return 'low';
  return 'none';
}

function bestCandidate(
  field: CsvImportField,
  headers: string[],
  rows: string[][],
  used: Set<number>
): Candidate | null {
  const candidates = headers
    .map((header, columnIndex) => {
      const samples = sampleValues(rows, columnIndex);
      return { columnIndex, header, samples, score: score(field, header, samples) };
    })
    .filter((candidate) => !used.has(candidate.columnIndex))
    .sort((a, b) => b.score - a.score || a.columnIndex - b.columnIndex);
  return candidates[0] && candidates[0].score >= 40 ? candidates[0] : null;
}

function bestNamePart(field: 'firstName' | 'lastName', headers: string[], rows: string[][], used: Set<number>): Candidate | null {
  const aliases = field === 'firstName' ? FIRST_NAME_ALIASES : LAST_NAME_ALIASES;
  const candidates = headers
    .map((header, columnIndex) => {
      const normalized = normalize(header);
      const exact = aliases.includes(normalized);
      const partial = aliases.some((alias) => normalized.includes(alias));
      const samples = sampleValues(rows, columnIndex);
      const valueScore = patternRatio(samples, isLikelyName) * 30;
      return { columnIndex, header, samples, score: (exact ? 70 : partial ? 45 : 0) + valueScore };
    })
    .filter((candidate) => !used.has(candidate.columnIndex) && candidate.score >= 40)
    .sort((a, b) => b.score - a.score || a.columnIndex - b.columnIndex);
  return candidates[0] ?? null;
}

function heuristicNameCandidate(headers: string[], rows: string[][], used: Set<number>): Candidate | null {
  const candidates = headers
    .map((header, columnIndex) => {
      const samples = sampleValues(rows, columnIndex);
      const normalized = normalize(header);
      const blocked = STAFF_HEADERS.includes(normalized) || FIRST_NAME_ALIASES.includes(normalized) || LAST_NAME_ALIASES.includes(normalized) || ID_HEADER_PARTS.some((part) => headerWords(header).includes(part)) || headerScore('service', header) >= 45;
      return { columnIndex, header, samples, score: blocked ? 0 : sampleScore('name', samples) };
    })
    .filter((candidate) => !used.has(candidate.columnIndex) && candidate.score >= 30)
    .sort((a, b) => b.score - a.score || a.columnIndex - b.columnIndex);
  return candidates[0] ?? null;
}

function logDevelopmentScores(headers: string[], rows: string[][]): void {
  if (process.env.NODE_ENV !== 'development') return;
  for (const [columnIndex, header] of headers.entries()) {
    const values = sampleValues(rows, columnIndex);
    const scores = CSV_IMPORT_FIELDS.map((field) => `${field[0].toUpperCase()}${field.slice(1)} Score: ${score(field, header, values)}%`).join(' | ');
    console.debug(`[CSV mapping] Column: ${header} | ${scores}`);
  }
}

function emptyMapping(field: CsvImportField): CsvFieldMapping {
  return { field, columnIndex: null, header: null, confidence: 'none', confidenceScore: 0, samples: [] };
}

/** Local deterministic mapping: no AI, network calls, external APIs, or customer-data egress. */
export function analyzeCsvMapping(rows: string[][]): CsvMappingAnalysis | { error: string } {
  if (rows.length === 0 || rows[0].length === 0) return { error: 'The file is empty.' };
  const headers = rows[0].map((header, index) => header.trim() || `Column ${index + 1}`);
  const used = new Set<number>();
  const mappings = {} as Record<CsvImportField, CsvFieldMapping>;
  for (const field of CSV_IMPORT_FIELDS) mappings[field] = emptyMapping(field);

  const fullName = bestCandidate('name', headers, rows, used);
  if (fullName) {
    used.add(fullName.columnIndex);
    mappings.name = { field: 'name', columnIndex: fullName.columnIndex, header: fullName.header, confidence: confidence(fullName.score), confidenceScore: fullName.score, samples: fullName.samples };
  }

  const nameParts = { firstName: null as number | null, lastName: null as number | null };
  if (!fullName) {
    const first = bestNamePart('firstName', headers, rows, used);
    if (first) { nameParts.firstName = first.columnIndex; used.add(first.columnIndex); }
    const last = bestNamePart('lastName', headers, rows, used);
    if (last) { nameParts.lastName = last.columnIndex; used.add(last.columnIndex); }
    if (first && last) {
      const partScore = Math.min(first.score, last.score);
      mappings.name = { field: 'name', columnIndex: null, header: `${first.header} + ${last.header}`, confidence: confidence(partScore), confidenceScore: partScore, samples: [`${first.samples[0] ?? ''} ${last.samples[0] ?? ''}`.trim()] };
    }
  }

  if (mappings.name.columnIndex === null && (nameParts.firstName === null || nameParts.lastName === null)) {
    const heuristicName = heuristicNameCandidate(headers, rows, used);
    if (heuristicName) {
      used.add(heuristicName.columnIndex);
      mappings.name = { field: 'name', columnIndex: heuristicName.columnIndex, header: heuristicName.header, confidence: confidence(heuristicName.score), confidenceScore: heuristicName.score, samples: heuristicName.samples };
    }
  }

  logDevelopmentScores(headers, rows);
  for (const field of CSV_IMPORT_FIELDS.filter((candidate) => candidate !== 'name')) {
    const candidate = bestCandidate(field, headers, rows, used);
    if (!candidate) continue;
    used.add(candidate.columnIndex);
    mappings[field] = { field, columnIndex: candidate.columnIndex, header: candidate.header, confidence: confidence(candidate.score), confidenceScore: candidate.score, samples: candidate.samples };
  }

  const hasName = mappings.name.columnIndex !== null || (nameParts.firstName !== null && nameParts.lastName !== null);
  if (!hasName || mappings.email.columnIndex === null) {
    return { error: 'Could not confidently detect both a name and email column. Review your CSV headers and try again.' };
  }
  return { headers, mappings, nameParts };
}

export function mappingIndexes(analysis: CsvMappingAnalysis): CsvConfirmedMapping {
  const regular = Object.fromEntries(
    CSV_IMPORT_FIELDS.filter((field) => analysis.mappings[field].columnIndex !== null).map((field) => [field, analysis.mappings[field].columnIndex])
  ) as CsvConfirmedMapping;
  if (analysis.nameParts.firstName !== null) regular.firstName = analysis.nameParts.firstName;
  if (analysis.nameParts.lastName !== null) regular.lastName = analysis.nameParts.lastName;
  return regular;
}

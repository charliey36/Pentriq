import { describe, expect, it } from '@jest/globals';
import { analyzeCsvMapping, mappingIndexes } from '../csv-import-mapping';
import { mapCsvRowsToCustomers } from '../customers';

describe('local CSV import mapping', () => {
  it('maps booking-system headers using names and sample values', () => {
    const result = analyzeCsvMapping([
      ['Client Name', 'Mobile Number', 'Appointment Date', 'Service Type', 'Cost', 'Email Address'],
      ['Alex Smith', '07700 900111', '08/10/2026', 'Boiler Repair', '125.00', 'alex@example.com'],
    ]);
    expect('error' in result).toBe(false);
    if ('error' in result) return;
    expect(result.mappings.name.header).toBe('Client Name');
    expect(result.mappings.name.confidenceScore).toBeGreaterThanOrEqual(90);
    expect(result.mappings.email.header).toBe('Email Address');
    expect(result.mappings.phone.header).toBe('Mobile Number');
    expect(result.mappings.date.header).toBe('Appointment Date');
    expect(result.mappings.service.header).toBe('Service Type');
    expect(result.mappings.amount.header).toBe('Cost');
  });

  it('maps a customer export with only name, email and total spent', () => {
    const result = analyzeCsvMapping([
      ['Customer', 'Email Address', 'Total Spent'],
      ['Alex Smith', 'alex@example.com', '250.00'],
    ]);
    expect('error' in result).toBe(false);
    if ('error' in result) return;
    expect(result.mappings.name.header).toBe('Customer');
    expect(result.mappings.email.header).toBe('Email Address');
    expect(result.mappings.amount.header).toBe('Total Spent');
    expect(result.mappings.date.columnIndex).toBeNull();
  });

  it('uses confirmed indexes when the user changes a detected mapping', () => {
    const csv = [
      ['Customer', 'Contact Email', 'Treatment'],
      ['Alex Smith', 'alex@example.com', 'Massage'],
    ];
    const analysis = analyzeCsvMapping(csv);
    expect('error' in analysis).toBe(false);
    if ('error' in analysis) return;
    const indexes = mappingIndexes(analysis);
    const mapped = mapCsvRowsToCustomers(csv, { name: indexes.name, email: indexes.email, service: indexes.service });
    expect(mapped.rows[0]).toMatchObject({ name: 'Alex Smith', email: 'alex@example.com', service: 'Massage' });
  });

  it('prioritises first/last names and keeps Service Provider unused', () => {
    const csv = [
      ['First Name', 'Last Name', 'Email', 'Appointment Date', 'Service Name', 'Service Provider', 'Service Price'],
      ['Charlie', 'Youlten', 'charlie@example.com', '2026-10-19', 'Skin Fade', 'Marcus', '35'],
    ];
    const result = analyzeCsvMapping(csv);
    expect('error' in result).toBe(false);
    if ('error' in result) return;
    expect(result.nameParts).toEqual({ firstName: 0, lastName: 1 });
    expect(result.mappings.name.header).toBe('First Name + Last Name');
    expect(result.mappings.service.header).toBe('Service Name');
    expect(result.mappings.service.columnIndex).toBe(4);
    expect(result.mappings.amount.header).toBe('Service Price');
    expect(result.headers[result.mappings.service.columnIndex!]).not.toBe(result.mappings.name.header);
    expect(result.mappings.service.header).not.toBe('Service Provider');
    expect(result.headers).toContain('Service Provider');
    expect(result.mappings.name.confidenceScore).toBeGreaterThanOrEqual(70);
    expect(mapCsvRowsToCustomers(csv, mappingIndexes(result)).rows[0]).toMatchObject({
      name: 'Charlie Youlten',
      service: 'Skin Fade',
      amountSpent: '35',
    });
  });

  it('detects and combines first and last names when no full name exists', () => {
    const csv = [
      ['First_Name', 'Last Name', 'Email Address'],
      ['John', 'Smith', 'john@example.com'],
    ];
    const result = analyzeCsvMapping(csv);
    expect('error' in result).toBe(false);
    if ('error' in result) return;
    expect(result.nameParts.firstName).toBe(0);
    expect(result.nameParts.lastName).toBe(1);
    const mapped = mapCsvRowsToCustomers(csv, mappingIndexes(result));
    expect(mapped.rows[0].name).toBe('John Smith');
  });

  it('prefers Full Name over separate name parts', () => {
    const csv = [
      ['Full Name', 'First Name', 'Last Name', 'Email'],
      ['John Smith', 'Johnny', 'Smith', 'john@example.com'],
    ];
    const mapped = mapCsvRowsToCustomers(csv);
    expect(mapped.rows[0].name).toBe('John Smith');
  });

  it('does not classify customer IDs as names and exposes numeric confidence', () => {
    const result = analyzeCsvMapping([
      ['Customer ID', 'Email Address'],
      ['CUST-10491', 'john@example.com'],
      ['CUST-10492', 'sarah@example.com'],
    ]);
    expect('error' in result).toBe(true);
    expect(result).toEqual(expect.objectContaining({ error: expect.stringMatching(/name/i) }));
  });

  it('maps an "Appointment" column of text to service, and of dates to date', () => {
    const text = analyzeCsvMapping([['Name', 'Email', 'Appointment'], ['Alex Smith', 'alex@example.com', 'Check-up']]);
    if ('error' in text) throw new Error(text.error);
    expect(text.mappings.service.header).toBe('Appointment');
    expect(text.mappings.date.columnIndex).toBeNull();
    expect(text.mappings.service.confidence).not.toBe('high'); // always shown for confirmation

    const dates = analyzeCsvMapping([['Name', 'Email', 'Appointment'], ['Alex Smith', 'alex@example.com', '2026-01-05']]);
    if ('error' in dates) throw new Error(dates.error);
    expect(dates.mappings.date.header).toBe('Appointment');
    expect(dates.mappings.service.columnIndex).toBeNull();
  });

  it.each([
    ['Services', 'Cut & Colour', 'service'],
    ['Treatment', 'Deep tissue massage', 'service'],
    ['Treatments', 'Facial', 'service'],
    ['Job', 'Boiler repair', 'service'],
    ['Session', 'PT session', 'service'],
    ['Products', 'Shampoo', 'service'],
    ['Package', 'Gold', 'service'],
    ['Task', 'Fit brakes', 'service'],
  ])('recognises "%s" as a service column', (header, value, field) => {
    const r = analyzeCsvMapping([['Client', 'Email', header], ['Alex Smith', 'alex@example.com', value]]);
    if ('error' in r) throw new Error(r.error);
    expect(r.mappings[field as 'service'].header).toBe(header);
  });

  it('scores strong synonyms above weak ones', () => {
    const score = (h: string) => {
      const r = analyzeCsvMapping([['Client', 'Email', h], ['Alex Smith', 'alex@example.com', 'Trim']]);
      return 'error' in r ? 0 : r.mappings.service.confidenceScore;
    };
    expect(score('Service')).toBeGreaterThan(score('Job'));
    expect(score('Appointment')).toBeGreaterThan(score('Task'));
    expect(score('Treatment')).toBeGreaterThan(score('Task'));
    expect(score('Task')).toBeGreaterThanOrEqual(40);
  });
});

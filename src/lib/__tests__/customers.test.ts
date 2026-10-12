import { describe, it, expect } from '@jest/globals';
import { mapCsvRowsToCustomers, parseCsv } from '../customers';

describe('CSV Import - mapCsvRowsToCustomers', () => {
  describe('Real-world business exports', () => {
    it('should import Name,Email,Phone,AmountSpent,ServiceDate', () => {
      const rows = [
        ['Name', 'Email', 'Phone', 'AmountSpent', 'ServiceDate'],
        ['John Smith', 'john@example.com', '555-1234', '150.00', '2026-10-08'],
        ['Jane Doe', 'jane@example.com', '555-5678', '200.00', '2026-10-07'],
      ];
      const result = mapCsvRowsToCustomers(rows);
      expect(result.error).toBeUndefined();
      expect(result.rows).toHaveLength(2);
      expect(result.rows[0]).toEqual({
        name: 'John Smith',
        email: 'john@example.com',
        phone: '555-1234',
        amountSpent: '150.00',
        service: 'General Service',
        date: '2026-10-08',
      });
    });

    it('should import Customer Name,Email Address,Job Type,Date Completed', () => {
      const rows = [
        ['Customer Name', 'Email Address', 'Job Type', 'Date Completed'],
        ['Bob Johnson', 'bob@example.com', 'Plumbing', '2026-10-06'],
      ];
      const result = mapCsvRowsToCustomers(rows);
      expect(result.error).toBeUndefined();
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]).toEqual({
        name: 'Bob Johnson',
        email: 'bob@example.com',
        phone: null,
        amountSpent: null,
        service: 'Plumbing',
        date: '2026-10-06',
      });
    });

    it('should import the standard format name,email,service,date', () => {
      const rows = [
        ['name', 'email', 'service', 'date'],
        ['Alice Brown', 'alice@example.com', 'Electrical', '2026-10-05'],
      ];
      const result = mapCsvRowsToCustomers(rows);
      expect(result.error).toBeUndefined();
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]).toEqual({
        name: 'Alice Brown',
        email: 'alice@example.com',
        phone: null,
        amountSpent: null,
        service: 'Electrical',
        date: '2026-10-05',
      });
    });
  });

  describe('Header alias matching', () => {
    it('should match NAME aliases (name, customer, customername, customer_name, fullname, full_name)', () => {
      const testCases = [
        'name',
        'customer',
        'customername',
        'customer_name',
        'fullname',
        'full_name',
        'FULLNAME',
        'Full Name',
        'full-name',
      ];

      testCases.forEach((header) => {
        const rows = [
          [header, 'email', 'date'],
          ['Test Name', 'test@example.com', '2026-10-08'],
        ];
        const result = mapCsvRowsToCustomers(rows);
        expect(result.error).toBeUndefined();
        expect(result.rows[0].name).toBe('Test Name');
      });
    });

    it('should match EMAIL aliases (email, emailaddress, email_address)', () => {
      const testCases = ['email', 'emailaddress', 'email_address', 'EMAIL', 'Email Address', 'email-address'];

      testCases.forEach((header) => {
        const rows = [
          ['name', header, 'date'],
          ['Test', 'test@example.com', '2026-10-08'],
        ];
        const result = mapCsvRowsToCustomers(rows);
        expect(result.error).toBeUndefined();
        expect(result.rows[0].email).toBe('test@example.com');
      });
    });

    it('should match SERVICE aliases (service, servicetype, service_type, job, jobtype, job_type, description, workcompleted)', () => {
      const testCases = [
        'service',
        'servicetype',
        'service_type',
        'job',
        'jobtype',
        'job_type',
        'description',
        'workcompleted',
        'SERVICE',
        'Service Type',
        'service-type',
      ];

      testCases.forEach((header) => {
        const rows = [
          ['name', 'email', header, 'date'],
          ['Test', 'test@example.com', 'Repair', '2026-10-08'],
        ];
        const result = mapCsvRowsToCustomers(rows);
        expect(result.error).toBeUndefined();
        expect(result.rows[0].service).toBe('Repair');
      });
    });

    it('should match DATE aliases (date, servicedate, service_date, datecompleted, completeddate, completed_date)', () => {
      const testCases = [
        'date',
        'servicedate',
        'service_date',
        'datecompleted',
        'completeddate',
        'completed_date',
        'DATE',
        'Service Date',
        'service-date',
      ];

      testCases.forEach((header) => {
        const rows = [
          ['name', 'email', header],
          ['Test', 'test@example.com', '2026-10-08'],
        ];
        const result = mapCsvRowsToCustomers(rows);
        expect(result.error).toBeUndefined();
        expect(result.rows[0].date).toBe('2026-10-08');
      });
    });

    it('should match PHONE aliases', () => {
      const testCases = ['phone', 'phonenumber', 'phone_number', 'mobile', 'telephone', 'PHONE', 'Phone Number', 'phone-number'];

      testCases.forEach((header) => {
        const rows = [
          ['name', 'email', 'date', header],
          ['Test', 'test@example.com', '2026-10-08', '555-1234'],
        ];
        const result = mapCsvRowsToCustomers(rows);
        expect(result.error).toBeUndefined();
        expect(result.rows[0].phone).toBe('555-1234');
      });
    });

    it('should match AMOUNT aliases', () => {
      const testCases = [
        'amount',
        'amountspent',
        'amount_spent',
        'value',
        'spend',
        'revenue',
        'AMOUNT',
        'Amount Spent',
        'amount-spent',
      ];

      testCases.forEach((header) => {
        const rows = [
          ['name', 'email', 'date', header],
          ['Test', 'test@example.com', '2026-10-08', '150.00'],
        ];
        const result = mapCsvRowsToCustomers(rows);
        expect(result.error).toBeUndefined();
        expect(result.rows[0].amountSpent).toBe('150.00');
      });
    });
  });

  describe('Case-insensitive and symbol-tolerant headers', () => {
    it('should handle mixed case headers', () => {
      const rows = [
        ['Name', 'EMAIL', 'SErViCe', 'dAtE'],
        ['Test', 'test@example.com', 'Repair', '2026-10-08'],
      ];
      const result = mapCsvRowsToCustomers(rows);
      expect(result.error).toBeUndefined();
      expect(result.rows).toHaveLength(1);
    });

    it('should treat spaces, underscores, and hyphens as identical', () => {
      const rows1 = [
        ['name', 'email', 'service date', 'date'],
        ['Test', 'test@example.com', '2026-10-08'],
      ];
      const rows2 = [
        ['name', 'email', 'service_date', 'date'],
        ['Test', 'test@example.com', '2026-10-08'],
      ];
      const rows3 = [
        ['name', 'email', 'service-date', 'date'],
        ['Test', 'test@example.com', '2026-10-08'],
      ];

      const result1 = mapCsvRowsToCustomers(rows1);
      const result2 = mapCsvRowsToCustomers(rows2);
      const result3 = mapCsvRowsToCustomers(rows3);

      expect(result1.error).toBeUndefined();
      expect(result2.error).toBeUndefined();
      expect(result3.error).toBeUndefined();
    });
  });

  describe('Service column fallback', () => {
    it('should use "General Service" when service column is missing', () => {
      const rows = [
        ['name', 'email', 'phone', 'amountspent', 'servicedate'],
        ['Test', 'test@example.com', '555-1234', '100', '2026-10-08'],
      ];
      const result = mapCsvRowsToCustomers(rows);
      expect(result.error).toBeUndefined();
      expect(result.rows[0].service).toBe('General Service');
      expect(result.warning).toContain('General Service');
    });

    it('should allow empty service column and use fallback', () => {
      const rows = [
        ['name', 'email', 'date', 'service'],
        ['Test', 'test@example.com', '2026-10-08', ''],
      ];
      const result = mapCsvRowsToCustomers(rows);
      expect(result.error).toBeUndefined();
      expect(result.rows[0].service).toBe('General Service');
    });
  });

  describe('Required vs optional columns', () => {
    it('should reject missing name', () => {
      const rows = [
        ['email', 'date'],
        ['test@example.com', '2026-10-08'],
      ];
      const result = mapCsvRowsToCustomers(rows);
      expect(result.error).toContain('name');
    });

    it('should reject missing email', () => {
      const rows = [
        ['name', 'date'],
        ['Test', '2026-10-08'],
      ];
      const result = mapCsvRowsToCustomers(rows);
      expect(result.error).toContain('email');
    });

    it('accepts a plain name,email list with no date column and says what that means', () => {
      const rows = [
        ['name', 'email'],
        ['Test', 'test@example.com'],
      ];
      const result = mapCsvRowsToCustomers(rows);
      expect(result.error).toBeUndefined();
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]).toMatchObject({ name: 'Test', email: 'test@example.com', date: '' });
      expect(result.warning).toMatch(/without a service record/);
    });

    it('still requires name and email', () => {
      expect(mapCsvRowsToCustomers([['date'], ['2026-10-01']]).error).toMatch(/name, email/);
    });

    it('should allow missing phone (optional)', () => {
      const rows = [
        ['name', 'email', 'date'],
        ['Test', 'test@example.com', '2026-10-08'],
      ];
      const result = mapCsvRowsToCustomers(rows);
      expect(result.error).toBeUndefined();
      expect(result.rows[0].phone).toBeNull();
    });

    it('should allow missing amount (optional)', () => {
      const rows = [
        ['name', 'email', 'date'],
        ['Test', 'test@example.com', '2026-10-08'],
      ];
      const result = mapCsvRowsToCustomers(rows);
      expect(result.error).toBeUndefined();
      expect(result.rows[0].amountSpent).toBeNull();
    });
  });

  describe('Edge cases', () => {
    it('should handle extra columns gracefully', () => {
      const rows = [
        ['name', 'email', 'date', 'extracolumn1', 'extracolumn2', 'extracolumn3'],
        ['Test', 'test@example.com', '2026-10-08', 'value1', 'value2', 'value3'],
      ];
      const result = mapCsvRowsToCustomers(rows);
      expect(result.error).toBeUndefined();
      expect(result.rows).toHaveLength(1);
    });

    it('should handle empty file', () => {
      const rows: string[][] = [];
      const result = mapCsvRowsToCustomers(rows);
      expect(result.error).toContain('empty');
    });

    it('should handle header-only file', () => {
      const rows = [['name', 'email', 'date']];
      const result = mapCsvRowsToCustomers(rows);
      expect(result.error).toBeUndefined();
      expect(result.rows).toHaveLength(0);
    });
  });
});

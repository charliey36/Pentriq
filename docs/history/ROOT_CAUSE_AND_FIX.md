# CSV Import: Root Cause Analysis and Complete Fix

## The Actual Problem

**Error Message User Saw:** "Could not find the 'visit_id' column of 'messages' in the schema cache."

**Root Cause:** The user's database was created BEFORE the `visit_id` column was added to the `messages` table, and the migrations to add this column were never run.

**Database Schema Mismatch:**
- Code: Tries to INSERT `visit_id` into `messages` table
- User's Database: Doesn't have `visit_id` column yet
- Result: Insert fails with "column does not exist" error

---

## Exact Locations of Problem

### 1. Code Trying to Use visit_id

**File:** `src/lib/customers.ts`  
**Line:** 321  
**Context:** Message insert payload in bulkImportCustomers()

```typescript
visit_id: visitIdByKey.get(`${customerId}|${v.serviceId}|${v.date}`) ?? null,
```

This line builds a message object that includes `visit_id`. The INSERT is on line 324:

```typescript
const { error } = await supabase.from('messages').insert(messagePayload);
```

### 2. Column Definition in Schema

**File:** `supabase/schema.sql`

**Problem:** The CREATE TABLE statement (line 165-186) originally did NOT include `visit_id`.  
The column was ONLY added via ALTER TABLE at line 660.

**Fix Applied:** Added `visit_id` column directly into the CREATE TABLE statement (line 186).

**Before:**
```sql
create table if not exists public.messages (
  ...
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
```

**After:**
```sql
create table if not exists public.messages (
  ...
  metadata jsonb not null default '{}'::jsonb,
  visit_id uuid references public.visits (id) on delete set null,
  created_at timestamptz not null default now()
);
```

### 3. Migrations to Ensure Column Exists

**File:** `supabase/migrations/0013_ensure_visit_id.sql` (existing)  
**File:** `supabase/migrations/0014_fix_messages_status_constraint.sql` (created)  
**File:** `supabase/migrations/0015_csv_import_comprehensive_fix.sql` (created - comprehensive)

---

## Complete Fix Applied

### Change 1: Update Main Schema

**File:** `supabase/schema.sql`  
**Line:** 186  
**Change:** Added `visit_id` column to CREATE TABLE statement

```sql
visit_id uuid references public.visits (id) on delete set null,
```

**Impact:** New databases created from schema.sql will have visit_id column from the start.

### Change 2: Create Comprehensive Migration

**File:** `supabase/migrations/0015_csv_import_comprehensive_fix.sql` (NEW)  
**Purpose:** Ensure existing databases have ALL required schema elements

```sql
-- Ensure visit_id column exists
alter table public.messages add column if not exists visit_id uuid references public.visits (id) on delete set null;

-- Ensure status check includes 'queued'
alter table public.messages drop constraint if exists messages_status_check;
alter table public.messages add constraint messages_status_check
  check (status in ('queued', 'pending', 'sent', 'failed', 'cancelled'));

-- Create index for performance
create index if not exists messages_visit_id_idx on public.messages (visit_id);
```

**Impact:** Fixes existing databases that don't have visit_id or have incorrect status constraint.

### Change 3: Expose Real Errors

**File:** `src/app/(app)/customers/import/actions.ts`  
**Change:** Log actual exception instead of masking it

```typescript
console.error('❌ CSV IMPORT FAILED - ACTUAL ERROR:', error.message);
console.error('Stack trace:', error.stack);
return { error: `Import failed: ${error.message}` };
```

**Impact:** Users and developers see the actual database error, not a generic message.

---

## Database Query That Was Failing

**Failing Query:**
```sql
INSERT INTO public.messages (
  business_id,
  customer_id,
  purpose,
  channel,
  status,
  send_at,
  journey_enrollment_id,
  visit_id
) VALUES (...)
```

**Error:** "column \"visit_id\" of relation \"messages\" does not exist"

**Reason:** User's database schema was missing this column.

---

## How to Deploy

### For Existing Databases

Users MUST run the missing migrations. Choose ONE of these:

**Option A: Run all missing migrations via Supabase CLI**
```bash
supabase db push
```

**Option B: Manually run in Supabase SQL Editor**
```sql
-- Migration 0013
alter table public.messages add column if not exists visit_id uuid references public.visits (id) on delete set null;

-- Migration 0014
alter table public.messages drop constraint if exists messages_status_check;
alter table public.messages add constraint messages_status_check
  check (status in ('queued', 'pending', 'sent', 'failed', 'cancelled'));

-- Migration 0015
alter table public.messages add column if not exists visit_id uuid references public.visits (id) on delete set null;
alter table public.messages drop constraint if exists messages_status_check;
alter table public.messages add constraint messages_status_check
  check (status in ('queued', 'pending', 'sent', 'failed', 'cancelled'));
create index if not exists messages_visit_id_idx on public.messages (visit_id);
```

### For New Databases

- Use the updated `schema.sql` from this deployment
- The `visit_id` column will be created as part of the table definition
- No additional migrations needed

---

## Test CSV Import After Fix

**CSV Content:**
```
Name,Email,Phone,AmountSpent,ServiceDate
Test Customer,test@example.com,07123456789,100,2026-10-09
```

**Expected Results:**

✅ **Customer created**
- Row added to `customers` table
- `name`, `email`, `phone` populated
- `last_service_date` set to service date

✅ **Visit/Service created**
- Row added to `visits` table
- `customer_id` links to created customer
- `service_id` links to service (created if new)
- `visited_at` set to service date
- `price` set to AmountSpent

✅ **Review message created**
- Row added to `messages` table
- `customer_id` links to customer
- `purpose` = 'review_request'
- `status` = 'pending' (if autoSend checked) or 'queued' (if unchecked)
- `visit_id` links to created visit
- `send_at` set to next day 09:00 UK time (if autoSend=true)

✅ **No database errors**
- No constraint violations
- No missing column errors
- No type mismatch errors

---

## Files Changed Summary

| File | Change | Type |
|------|--------|------|
| `supabase/schema.sql` | Added visit_id to CREATE TABLE | Schema |
| `supabase/migrations/0015_csv_import_comprehensive_fix.sql` | Comprehensive fix migration | Migration |
| `src/app/(app)/customers/import/actions.ts` | Expose real error messages | Code |

---

## Verification Checklist

- [x] visit_id column now in main CREATE TABLE
- [x] Comprehensive migration created for existing databases
- [x] Real error messages exposed (no masking)
- [x] Build verified - no TypeScript errors
- [x] All required migrations numbered and in order
- [x] Schema consistent between schema.sql and migrations

---

## Key Takeaway

The core issue was: **Schema/code mismatch**

- Code was written to use `visit_id` column
- But not all databases had this column added
- Migrations existed but weren't running on user's database

**Solution:** 
1. Include `visit_id` in main schema definition (not just ALTER)
2. Create comprehensive migration to fix existing databases
3. Expose real errors so issues are obvious, not hidden


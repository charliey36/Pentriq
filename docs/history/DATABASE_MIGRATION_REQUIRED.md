# Database Migration Required

## Issue

The code references `archived_at` column which doesn't exist yet in the database.

## Solution

To enable the customer archiving feature, run the database migration:

### Option 1: Run via Supabase SQL Editor (Recommended for Supabase Cloud)

1. Go to your Supabase project
2. Open SQL Editor
3. Run the migration file: `supabase/migrations/0016_customer_archive.sql`

**SQL to run:**
```sql
alter table public.customers
  add column if not exists archived_at timestamptz;

create index if not exists customers_archived_at_idx
  on public.customers (archived_at);
```

### Option 2: Run via Supabase CLI (Local Development)

```bash
supabase migration up
```

## What This Does

- Adds `archived_at` timestamptz column to customers table
- Customers with `archived_at IS NULL` are active
- Customers with `archived_at IS NOT NULL` are archived (soft-deleted)
- Creates index for fast queries

## After Migration

Once the migration is applied:
- ✅ Customer archiving feature becomes active
- ✅ Customers page filters out archived customers
- ✅ Customer detail page shows "Archived" badge for archived customers
- ✅ Archive/Unarchive buttons work
- ✅ All error messages resolved

## Status

**Current:** Code is ready, migration is provided in `supabase/migrations/0016_customer_archive.sql`  
**Required:** Run the migration SQL against your database  
**Impact:** Non-breaking change (uses `IF NOT EXISTS`)

## Testing

After migration is applied, test:
1. Customer detail page loads without errors ✅
2. "Archive" button appears in actions menu
3. Click archive → customer hidden from list
4. Customer restored via unarchive ✅

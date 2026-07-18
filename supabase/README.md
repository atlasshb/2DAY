# Supabase Configuration

This directory contains Supabase project configuration and database migrations for 2DAY.

## Database Migrations

**`migrations/0001_init.sql`** is the primary schema initialization file, assembled from
`docs/08-database-schema.md`. It contains the complete DDL (extensions, enums, tables,
indexes, RLS policies, and partitioning setup) in valid dependency order.

## Target Environment

- **PostgreSQL**: 16
- **PostGIS**: 3.4
- **Row-Level Security**: Enabled
- **Partitioning**: pg_partman for append-only audit tables (visit, gps_breadcrumb)

The schema supports multi-tenant data isolation via RLS policies bound to Supabase Auth JWT
claims (`org_id`, `role`).

## Reference Data

Base reference tables (`area`, `building`, `address_unit`, `street_edge`, `poi`, `score_cell`)
are global, read-only to authenticated users, writable only by the ingestion service role.
Tenant-specific data (`plan`, `visit`, `sale`, etc.) carry `org_id` and are RLS-isolated.

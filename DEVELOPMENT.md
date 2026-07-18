# Development Guide

## Workspace Layout

| Workspace | Purpose |
|-----------|---------|
| packages/core | Shared domain types, entity validation, and field brain logic |
| services/planner | Fastify-based planning API with mock routing adapters |
| app | Next.js 15 progressive web application |

## Prerequisites

- Node.js >= 22

## Commands

Install dependencies:
```
npm install
```

Type checking:
```
npm run typecheck
```

Run tests:
```
npm run test
```

Build for production:
```
npm run build
```

Development servers:
```
npm run dev:app      # Start Next.js app
npm run dev:planner  # Start Fastify planner service
```

## References

- **Design decisions**: See `docs/00-design-decisions.md` for the canonical specification
- **Database schema**: See `supabase/migrations` for DDL and schema definitions

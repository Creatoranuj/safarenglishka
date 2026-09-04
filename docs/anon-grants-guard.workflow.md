<!-- Copy this file to .github/workflows/anon-grants-guard.yml via the GitHub UI.
     The API token linked here has no `workflow` scope, so it cannot create files
     under .github/workflows/. Needs repo secret SUPABASE_SERVICE_ROLE_KEY (already set)
     and SUPABASE_URL (or VITE_SUPABASE_URL). -->

```yaml
name: Anon grants guard

on:
  push:
    branches: [main]
    paths:
      - 'supabase/migrations/**'
      - 'scripts/check-anon-grants.mjs'
      - '.github/workflows/anon-grants-guard.yml'
  schedule:
    - cron: '0 3 * * *'
  workflow_dispatch:

permissions:
  contents: read

jobs:
  anon-grants:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
      - name: Check anon write grants
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL || secrets.VITE_SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
        run: node scripts/check-anon-grants.mjs
```

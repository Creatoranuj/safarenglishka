## Plan

Single-line change to `.github/workflows/lighthouse-ci.yml:80`:

```
-        uses: actions/upload-artifact@v4
+        uses: actions/upload-artifact@v6
```

### Why
`upload-artifact@v4` runs on Node 20 (deprecated warning today, hard-fail Q1'26 per ci-e2e-error-monitor S2). All 10 other workflows already on v6/v8 — this is the last v4 pin.

### Verify
- YAML parse: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/lighthouse-ci.yml'))"`
- Signature scan: `rg "artifact@v[0-9]+" .github/workflows/` → expect zero v4 hits.

### Not doing
No other workflow edits, no code changes, no skill sweep beyond this bump.

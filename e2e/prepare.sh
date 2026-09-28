#!/bin/sh
# Resets the e2e data directory and seeds it with two test accounts + the
# histoire seed (if present) before Playwright's webServer starts.
set -e

rm -rf .e2e-data

npm run db:migrate
npm run user:create -- --username alice --display-name Alice --password motdepasse-test
npm run user:create -- --username bob --display-name Bob --password motdepasse-test

if [ -f scripts/seed.ts ]; then
	npm run seed
fi

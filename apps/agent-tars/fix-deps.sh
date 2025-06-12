set -euo pipefail
npx depcheck --json > ./depcheck.json
cat .depcheck.json \
| jq -r '.missing | keys[]' \
| xargs -r pnpm add
rm ./depcheck.json
echo "missing dependencies installed."

#!/usr/bin/env bash

set -e

pnpm changeset pre enter beta

echo "=== start release ==="

echo "1. update version and generate CHANGELOG..."
pnpm changeset version

echo "2. update dependencies..."
pnpm install

echo "3. commit version update..."
git add .
git commit -m "release: publish beta packages"

echo "4. create release tag..."
pnpm changeset tag

echo "5. publish to npm..."
pnpm publish -r --no-git-checks --access public --tag beta

echo "6. exit changeset..."
pnpm changeset pre exit

echo "7. prepare to push to remote git repository..."
read -p "confirm push to remote git repository? (y/N) " confirm
if [[ $confirm == [yY] ]]; then
    echo "pushing code and tag to remote git repository..."
    git push --follow-tags
    echo "=== release-beta completed ==="
else
    echo "cancel pushing to remote git repository"
    echo "=== release-beta completed (not pushed to remote) ==="
fi

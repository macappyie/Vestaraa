#!/bin/bash
echo "Syncing files to S3..."
aws s3 sync . s3://vestara-frontend-2026-eu --cache-control "no-cache, must-revalidate" --exclude ".git/*"

echo "Clearing CloudFront cache..."
aws cloudfront create-invalidation --distribution-id E2OUXVVARAEW4I --paths "/*"

echo "Done! Site live ho jayega 1-2 min me."

#!/bin/bash
echo "=== PM2 Status ==="
pm2 list
echo ""
echo "=== PM2 Processes ==="
pm2 jlist | jq -r '.[] | "\(.name) - \(.pm2_env.status) - PID: \(.pid)"' 2>/dev/null || pm2 list
echo ""
echo "=== Running Node Processes ==="
ps aux | grep -E "node.*server.js|react-scripts" | grep -v grep

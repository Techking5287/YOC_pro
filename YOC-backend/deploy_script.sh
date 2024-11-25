#!/bin/bash
# Pull latest changes or restart services
git pull  # Adjust if you're using a different branch
# Restart your application, e.g., using Docker, PM2, or systemd
yarn install

# pm2 restart backend
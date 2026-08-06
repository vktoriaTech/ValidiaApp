#!/bin/bash
set -e

SSH_KEY="validia-key-v2.pem"
EC2_USER="ubuntu"
EC2_HOST="3.131.93.138"
VITE_API_URL="http://3.131.93.138:8000"

echo "=== Pulling latest code ==="
ssh -i $SSH_KEY $EC2_USER@$EC2_HOST "cd ~/ValidiaApp && git pull origin main"

echo "=== Building images ==="
ssh -i $SSH_KEY $EC2_USER@$EC2_HOST "cd ~/ValidiaApp && docker compose build --build-arg VITE_API_URL=$VITE_API_URL"

echo "=== Restarting services ==="
ssh -i $SSH_KEY $EC2_USER@$EC2_HOST "cd ~/ValidiaApp && docker compose up -d"

echo "=== Running migrations ==="
ssh -i $SSH_KEY $EC2_USER@$EC2_HOST "docker exec validia-backend alembic upgrade head"

echo "=== Deploy complete ==="

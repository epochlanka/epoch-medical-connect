#!/bin/sh
# Recreate the throwaway epoch_video demo DB (never the dev DB).
cd /home/candy/Desktop/medical_system/E-poch-unified/backend
docker exec epoch-postgres-test psql -q -U epoch_test -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='epoch_video'" >/dev/null
docker exec epoch-postgres-test psql -q -U epoch_test -d postgres -c "DROP DATABASE IF EXISTS epoch_video" -c "CREATE DATABASE epoch_video"
PW=$(grep -E '^DATABASE_URL' .env | sed -E 's#.*://epoch_test:([^@]*)@.*#\1#')
U="postgresql://epoch_test:$PW@127.0.0.1:5432/epoch_video?schema=public"
export DATABASE_URL="$U" DIRECT_URL="$U"
npx prisma migrate deploy >/dev/null 2>&1 && npx tsx prisma/seed-demo.ts | tail -1

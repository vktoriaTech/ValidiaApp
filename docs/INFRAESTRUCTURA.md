# Infraestructura y Despliegue — Validia

Conocimiento operativo del entorno. Antes solo vivía en la memoria del equipo;
se documenta para no depender de eso.

**Última actualización:** 2026-09-01

---

## 1. Panorama

Dos repositorios, desplegados como contenedores Docker en un **único EC2** (que
funciona como staging/demo):

- **ValidiaApp** (este repo): frontend (React/Vite + nginx), backend (FastAPI),
  base de datos (PostgreSQL 16).
- **Web-Scraping** (repo aparte): microservicio `cufe-service` (FastAPI +
  Playwright + CapSolver) que valida facturas contra el portal DIAN.

Se comunican por una **red Docker compartida**; el backend resuelve el
microservicio por nombre: `CUFE_SERVICE_URL=http://cufe-service:8001`.

## 2. Servidor

- **EC2** `validia-stage` · región **us-east-2** (Ohio) · IP `3.131.93.138` · Ubuntu 24.04.
- Acceso SSH: `ssh -i validia-key-v2.pem ubuntu@3.131.93.138` (el puerto 22 se abre por "Mi IP" en el Security Group `launch-wizard-2`; la IP cambia según la red, hay que reabrirla).
- **Swap de 2 GB** agregado (`/swapfile`, en `/etc/fstab`) — el t3.micro (1 GB RAM) se congelaba en los builds sin swap.
- Security Group: 22 (SSH, Mi IP), 80/443 (HTTP/HTTPS público). El 8000/8001/3000/5433 NO son públicos.

## 3. Dominio y HTTPS

- Dominio: **veradia.io** (registrado en Dynadot). Registros A `app` y `api` → IP del EC2.
- **nginx** en el EC2 (reverse proxy) enruta `app.veradia.io` → frontend (3000) y `api.veradia.io` → backend (8000).
- **HTTPS** con Let's Encrypt (Certbot), renovación automática. Config en `/etc/nginx/sites-available/veradia`.
- Frontend: `https://app.veradia.io` · API: `https://api.veradia.io`.

## 4. Contenedores

| Contenedor | Puerto | Origen |
|---|---|---|
| `validia-frontend` | 3000→80 | ValidiaApp/frontend (nginx sirve el build de Vite) |
| `validia-backend` | 8000 | ValidiaApp/backend |
| `validia-db` | 5433→5432 | postgres:16 (volumen `postgres_data`) |
| `cufe-service` | 8001 | Web-Scraping (Playwright/Chromium) |

- **Ojo con `VITE_API_URL`:** Vite "hornea" la URL del API en tiempo de build. El frontend SIEMPRE se construye con `--build-arg VITE_API_URL=https://api.veradia.io`; si se omite, apunta a `localhost:8000` y el login falla.

## 5. Variables de entorno (en el servidor, no en el repo)

- `~/ValidiaApp/backend/.env`: `DATABASE_URL`, `ALLOWED_ORIGINS` (incluye los dominios), `CUFE_SERVICE_URL`, llaves AWS (`AWS_ACCESS_KEY_ID/SECRET`, `AWS_REGION=us-east-1` para Textract, `AWS_S3_BUCKET=validia`), `SECRET_KEY`, etc.
- `~/Web-Scraping/.env`: `CUFE_API_KEY`, `CAPSOLVER_API_KEY`.

## 6. AWS

- **Textract** (OCR): `AnalyzeDocument` en us-east-1. Usuario IAM `validia-ocr`, política `validia-textract`.
- **S3**: bucket **`validia`** en us-east-2 (evidencias: PDF + imágenes). Misma política IAM con `s3:PutObject/GetObject` sobre `arn:aws:s3:::validia/*`.
- **CapSolver** (externo): resuelve el captcha Turnstile de la DIAN. Es de saldo — si se agota, la validación DIAN falla (`ERROR_KEY_DENIED_ACCESS`). Mantener con fondos.

## 7. Despliegue

**Script:** `deploy.sh` (en la raíz) hace pull + build + up + `alembic upgrade head` vía SSH. Es CD **manual**.

**Manual, secuencial** (recomendado en el t3.micro para no saturar la RAM):
```bash
# Microservicio CUFE (si cambió Web-Scraping)
ssh … "cd ~/Web-Scraping && git pull origin main && docker compose build cufe-service && docker compose up -d cufe-service"

# Backend (+ migración si aplica)
ssh … "cd ~/ValidiaApp && git pull origin main && docker compose build backend && docker compose up -d backend && docker exec validia-backend alembic upgrade head"

# Frontend (SIEMPRE con el build-arg)
ssh … "cd ~/ValidiaApp && docker compose build --build-arg VITE_API_URL=https://api.veradia.io frontend && docker compose up -d frontend"
```

**Reglas prácticas:**
- Si cambia solo el frontend, construir **solo** el frontend (no el backend).
- El build lento del backend ocurre **solo cuando cambia `requirements.txt`** (reinstala todo con `--no-cache-dir`); si no, usa capas cacheadas y es rápido.
- Construir de a uno (no backend+frontend a la vez) para no agotar la RAM.

## 8. Migraciones (Alembic)

- La DB de prod salió de un dump previo; se hizo `alembic stamp head` y luego se
  fueron aplicando columnas faltantes. El `alembic_version` ya existe, así que
  las migraciones nuevas se aplican con `alembic upgrade head` en el deploy.
- **Regla:** cada migración nueva encadena del head vigente; correr
  `alembic upgrade head` tras desplegar el backend.

## 9. Base de datos — acceso

- Local: `localhost:5433` · `validia` · `validia_user`.
- Prod: no expuesta al público. Se accede por **túnel SSH** (`-L 5434:localhost:5433`) y un cliente Postgres (DBeaver/TablePlus). Cliente: `localhost:5434` · base **`validia`** (no `postgres`).

## 10. Deuda / mejoras conocidas

- **CD real** (DT-001): construir imágenes fuera del EC2 (CI o local) y que el servidor solo las descargue — elimina el dolor de los builds en el t3.micro.
- **DT-003**: tokens de GitHub embebidos en las URLs de git de ambos repos — revocar y migrar a Keychain/SSH.
- **HTTPS del microservicio:** hoy `cufe-service` solo es interno (bien). Si algún día se expone, requiere su propio TLS.

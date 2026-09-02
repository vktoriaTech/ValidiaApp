# SPEC-04B-A: Captura de la factura (OCR) y participación por imagen

**Proyecto:** Validia MVP
**Versión:** 0.2
**Estado:** Implementado y en producción
**Última actualización:** 2026-09-01
**Depende de:** SPEC-04B (Motor de Participación), SPEC-04C (Sorteo), microservicio CUFE (repo Web-Scraping)
**Decisión de origen:** D-008 (y D-008b)

---

> **Nota SDD:** este flujo se construyó bajo presión del demo Cosmocentro y se documenta retroactivamente. Las decisiones de diseño están en D-008; los pendientes de negocio en DT-006 y DT-007.

## 0. Alcance

Cubre cómo una **foto de la factura + la cédula** se convierten en una `Participation`, sin intervención humana. Es la capa de *captura* que alimenta `create_participation` de SPEC-04B. El deber ser es un bot de WhatsApp; el demo lo hace por web, pero **el backend es el mismo**.

## 1. Cambios externos de la DIAN (2026-08-31)

El portal DIAN cambió dos cosas que rompieron la validación en producción:

1. **NIT del emisor obligatorio** en el formulario de búsqueda (`input#SearchDocumentNit`), además del CUFE.
2. **PDF de la factura encriptado**, con el **NIT del emisor como contraseña de apertura**.

Adaptación:
- Microservicio CUFE (Web-Scraping): llena el campo NIT antes de buscar; desencripta el PDF con `pikepdf` usando el NIT antes de extraer con `pdfplumber`. `CUFERequest` gana `nit_emisor` (obligatorio).
- Backend Validia: `nit_emisor` se propaga de punta a punta (`CufeValidateRequest`, `ParticipationCreate`, `validate_cufe(cufe, nit_emisor, tenant_id)`).

## 2. Por qué OCR y no QR

El QR impreso en la factura física no expone el CUFE de forma útil. El único QR con datos estructurados (CUFE, NitFac, montos) vive **dentro del PDF que genera el portal DIAN**, que solo se obtiene tras validar — circular. Por eso el CUFE y el NIT se extraen por **OCR del texto plano** de la(s) foto(s). Ver D-008.

## 3. Extracción (OCR)

- Motor: **AWS Textract** `DetectDocumentText` (`ocr_service.py`). Credenciales por `AWS_ACCESS_KEY_ID/SECRET/REGION` (usuario IAM `validia-ocr`, política `textract:DetectDocumentText`).
- **CUFE**: corrida hex de 96 caracteres; se busca primero junto a la etiqueta "CUFE" (tolerando espacios/saltos que inserta el OCR) y, como respaldo, la corrida hex más larga del documento.
- **NIT emisor**: patrones `NIT … (7-10 dígitos)`; se devuelve el primero como mejor guess (el emisor se imprime primero).
- Es "mejor esfuerzo": si no se logra un CUFE de 96 ni un NIT, se rechaza pidiendo reenviar foto (no hay corrección manual — D-008).

## 4. Endpoints (public_router, sin autenticación)

| Método | Ruta | Qué hace |
|---|---|---|
| `GET` | `/campaigns/{id}/public` | Datos mínimos de la actividad (nombre, estado, tipo, T&C) para la página pública. |
| `POST` | `/campaigns/{id}/terms/accept` | Registra aceptación de T&C por cédula (una vez). *(ya existía)* |
| `POST` | `/campaigns/{id}/participate-by-image` | **Reutilizable.** `foto(s) + cédula` → OCR → validar DIAN → participar → resultado. |

`participate-by-image` (multipart): `files[]`, `cedula`, `full_name?`, `phone_wa?`, `channel` (default `web`). Devuelve `ParticipationResponse` (201 si elegible, 200 si registrada no elegible). Internamente llama `participation_service.create_participation_from_images`, que arma el `ParticipationCreate` y reusa `create_participation` (misma lógica de elegibilidad de SPEC-04C).

## 5. Flujo end-to-end (web y WhatsApp idénticos de la capa de servicio hacia abajo)

1. Front obtiene la actividad (`GET …/public`) y muestra nombre + T&C.
2. Usuario ingresa **cédula** y acepta T&C → `POST …/terms/accept`.
3. Usuario sube 1-2 fotos → `POST …/participate-by-image`.
4. Backend: OCR (CUFE+NIT) → `validate_cufe` (microservicio → DIAN, con desencriptado del PDF) → `evaluate_participation` (SPEC-04C) → `Participation`.
5. Respuesta: elegible + boletas de la factura + boletas totales + monto acumulado; o "no elegible" (monto bajo mínimo); o 422 "reenvía foto" si el OCR falló.

## 6. Front web (demo)

Ruta pública `/participar/:campaignId` (fuera del guard de auth), `ParticiparPage.jsx`, cliente `participacionService.js` sin el interceptor de auth. Mobile-first, marca Validia. Es una cáscara delgada: cédula + T&C → foto → resultado.

## 7. Archivos

**Backend:** `services/ocr_service.py` (nuevo), `services/participation_service.py` (`create_participation_from_images`), `api/v1/participations.py` (`participate-by-image`), `api/v1/campaigns.py` (`/public`), `services/campaign_service.py` (`get_public_campaign`), schemas `participation.py` y `campaign.py` (`PublicCampaignResponse`), + threading de `nit_emisor` (schemas/cufe, api/cufe, cufe_service).
**Frontend:** `pages/participar/ParticiparPage.jsx`, `services/participacionService.js`, ruta en `App.jsx`.
**Microservicio CUFE (repo Web-Scraping):** `main.py`, `scraper.py` (NIT + desencriptado), `docker-compose.yml`.

## 7bis. Actualización v0.2 (2026-09-01) — lo agregado tras el primer end-to-end

**Perfil del participante desde la DIAN.** La página solo pide la **cédula**; el
nombre, celular y correo se leen del bloque *Adquiriente/Comprador* de la factura
(`receptor_razon_social`, `receptor_telefono`, `receptor_correo`) y completan el
`Participant` automáticamente (`cufe_service.extract_participant_fields`, aplicado
en `create_participation`, solo rellena campos vacíos). Así los ganadores y la
lista de participantes muestran el nombre real sin pedirlo.

**Persistencia de evidencia en S3 (DT-006 — hecho).** El microservicio devuelve
el PDF en `pdf_base64`; el backend lo sube a S3 (`invoices/{cufe}/pdf.pdf`) y lo
saca del `raw_data` para no inflar el JSONB. Las fotos se suben a
`invoices/{cufe}/img-N.jpg`. Las llaves quedan en `Invoice.pdf_s3_key` e
`Invoice.image_s3_key`. Bucket `validia` (us-east-2); `s3_service` best-effort
(si S3 falla, la participación no se cae). Config: `AWS_S3_REGION` separada de
`AWS_REGION` (Textract en us-east-1, S3 en us-east-2).

**Arreglos de robustez (bugs reales encontrados en el primer ciclo):**
- OCR: se usa **Textract `AnalyzeDocument` (LAYOUT)**, no `DetectDocumentText`, porque este último se comía un carácter del CUFE de 96 (doble letra). El NIT tolera puntos/DV y descarta el del proveedor tecnológico/adquirente.
- La DIAN devuelve la respuesta **plana** (`emisor_nit`, `total_factura_cop`), no anidada — los extractores se corrigieron (con fallback).
- Fecha de la factura en formato **DD/MM/YYYY** (no ISO) — parser corregido.
- Monto en formato COP (`530.814,00` / `$530,814`) — parser dedicado.
- Cambios externos DIAN: NIT obligatorio en la búsqueda + PDF encriptado con el NIT como clave (desencriptado con `pikepdf`).
- Front: el detalle de error puede ser string u objeto `{reason}` — se normaliza a mensaje legible para no romper el render.

**Editar activas/pausadas (D-008b):** una actividad se puede editar en `draft`,
`active` y `paused` (no solo draft), con advertencia en la UI. Ver D-008b.

## 8. Pendientes (fuera de alcance de este spec)

- **DT-006 · Fase D** — ver/descargar el PDF y la imagen desde el admin con URLs prefirmadas (la persistencia ya está hecha).
- **DT-007** — estructurar toda la data de la factura en BD, asociada a la cédula (activo de negocio). El `raw_data` y el PDF ya se guardan; falta normalizar/explotar.
- Guardar también la **dirección** del adquirente (requiere columna en `Participant`).
- Endurecer los endpoints públicos antes de exponerlos a un webhook real de WhatsApp (secreto compartido) — ver nota en `campaign_service.accept_campaign_terms`.

## 9. Casos de prueba (pendientes de automatizar — DT-001)

- OCR extrae CUFE (96) + NIT de una foto legible → participa y genera boletas.
- OCR no logra leer → 422 con mensaje de reenviar foto, sin crear `Participation`.
- Factura de POS/fecha no elegible → 422 auditado (D-005), sin boletas.
- Actividad no activa → la página pública muestra "no disponible".

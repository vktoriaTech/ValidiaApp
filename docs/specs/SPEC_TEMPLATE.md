# SPEC-XX: [Nombre del módulo o funcionalidad]
**Proyecto:** Validia MVP
**Versión:** 0.1
**Estado:** Borrador | Propuesto | Aprobado | Implementado
**Última actualización:** AAAA-MM-DD
**Depende de:** [specs previos de los que depende]
**Precede a:** [specs que dependen de este, si aplica]

> **Cómo usar esta plantilla:** este es el modelo estándar de specs de Validia
> (definido a partir de SPEC-04B). Todo spec nuevo parte de esta estructura.
> Principio rector: un spec tiene DOS capas y ambas son obligatorias —
> (1) la capa conceptual (secciones 1–2): contexto, vocabulario y objetivo de
> negocio, escrita para que cualquier persona (socio, técnico nuevo, agente IA)
> entienda el "por qué" sin necesidad de preguntar; y (2) la capa técnica
> (secciones 3 en adelante): precisión total, sin ambigüedad, porque quien
> construye (Claude Code) no pregunta — interpreta. Las decisiones de negocio
> que el equipo técnico no pueda resolver solo NO se asumen en silencio: se
> registran en docs/DECISIONES_PENDIENTES.md, se deja la asunción temporal
> explícita en el spec, y se resuelven con los socios.

---

## 1. Conceptos y vocabulario

_Definiciones y distinciones que el lector necesita antes de entrar al detalle.
Ejemplos concretos del negocio, no abstracciones. Si un término ya está definido
en otro spec (ej. mecánica vs. reglas en SPEC-04B §1), referenciarlo en vez de
redefinirlo._

---

## 2. Descripción general y objetivo

_La pregunta de negocio que este spec responde y las relaciones/capacidades
nuevas que crea en el sistema. Debe poder leerlo un socio no técnico y decir
"sí, esto es lo que queremos". Cerrar con el alcance: qué decide este documento
y qué delega a otros._

---

## 3. Punto de partida (qué ya existe en el código vs. qué falta)

_Revisar el código real ANTES de escribir esta sección — no asumir de memoria.
Tabla: elemento | estado. Deja explícito qué se reutiliza y cuál es el gap
exacto que este spec cierra._

---

## 4. Flujo end-to-end

_Diagrama de texto del camino completo, señalando qué pasos ya existen y cuáles
crea este spec. Anotar las excepciones por tipo/caso donde el flujo se desvía._

---

## 5. Modelo de datos

_Tablas/columnas nuevas o modificadas. Si no hay cambios, decirlo explícitamente
("ninguna migración") — la ausencia también es información. Documentar las
decisiones de modelado no obvias (ej. por qué un vínculo vive en la tabla X y
no en la Y) y las asunciones temporales pendientes de decisión de negocio._

---

## 6. Endpoints / API

_Método, ruta, auth requerida, request y response de ejemplo en JSON, tabla de
errores con códigos y condición. Para endpoints que delegan lógica, decir
explícitamente a dónde delegan._

---

## 7. Contratos e interfaces internas

_Firmas de funciones/módulos que otros specs o módulos implementan o consumen.
Es la frontera entre lo que este spec define y lo que otros detallan._

---

## 8. Reglas de negocio

_Las condiciones y comportamientos específicos que este spec sí decide (no los
delegados). Incluir estructuras JSON exactas si aplica._

---

## 9. Auditoría

_Eventos de audit_log que este spec introduce, con el formato `entidad.accion`._

---

## 10. Archivos a crear/modificar

_Árbol de archivos con anotación de qué va en cada uno. Respetar la estructura
existente del proyecto (services/, schemas/, api/v1/, models/)._

---

## 11. Migración de BD

_Comando exacto o "ninguna". Recordar: `create_all()` solo crea tablas nuevas —
cualquier columna nueva en tabla existente requiere migración de Alembic escrita
y corrida explícitamente._

---

## 12. Casos de prueba

_Tabla: # | caso | resultado esperado. Cubrir el camino feliz, los rechazos con
su razón, y los casos borde de idempotencia/duplicados. Estos casos son el
criterio de aceptación de la implementación._

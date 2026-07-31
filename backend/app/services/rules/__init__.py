"""Dispatcher: routes to the rule module implementing a given activity_type.

Only Sorteo is implemented in this cycle (SPEC-04C). Incentivo Fuerza de
Venta, Compras Consumidor, and Rotación are future work (SPEC-04D/E/F) — per
D-004, only the Factura (CUFE) mechanic is functional in the MVP, so any
activity type without a registered module returns 501.
"""
from types import ModuleType

from fastapi import HTTPException, status

from app.models.campaign import ActivityType
from app.services.rules import sorteo

_REGISTRY: dict[ActivityType, ModuleType] = {
    ActivityType.sorteo: sorteo,
}


def get_rule_module(activity_type: ActivityType | None) -> ModuleType:
    module = _REGISTRY.get(activity_type) if activity_type is not None else None
    if module is None:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail=f"El tipo de actividad '{activity_type.value if activity_type else None}' aún no está implementado",
        )
    return module

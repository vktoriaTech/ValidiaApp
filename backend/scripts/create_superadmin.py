"""Crea (o actualiza) el tenant demo y el usuario super_admin inicial de Validia."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy.orm import sessionmaker

from app.core.security import hash_password
from app.db.session import engine
from app.models.tenant import Tenant, TenantStatus
from app.models.user import User, UserRole

TENANT_SLUG = "validia-demo"
TENANT_NAME = "Validia Demo"
TENANT_NIT = "900000000-1"

ADMIN_EMAIL = "admin@validia.co"
ADMIN_PASSWORD = "Admin2026!"
ADMIN_FULL_NAME = "Admin Validia"


def main() -> None:
    SessionLocal = sessionmaker(bind=engine)
    db = SessionLocal()

    try:
        tenant = db.query(Tenant).filter(Tenant.slug == TENANT_SLUG).first()
        tenant_created = tenant is None
        if tenant is None:
            tenant = Tenant(
                name=TENANT_NAME,
                slug=TENANT_SLUG,
                nit=TENANT_NIT,
                status=TenantStatus.active,
            )
            db.add(tenant)
            db.commit()
            db.refresh(tenant)

        password_hash = hash_password(ADMIN_PASSWORD)

        user = db.query(User).filter(User.email == ADMIN_EMAIL).first()
        user_created = user is None
        if user is None:
            user = User(
                tenant_id=tenant.id,
                email=ADMIN_EMAIL,
                password_hash=password_hash,
                full_name=ADMIN_FULL_NAME,
                role=UserRole.super_admin,
                is_active=True,
            )
            db.add(user)
        else:
            user.password_hash = password_hash

        db.commit()
        db.refresh(user)

        print("=== Resultado ===")
        print(f"Tenant: {tenant.name} ({tenant.slug}) [{'creado' if tenant_created else 'ya existía'}] id={tenant.id}")
        print(
            f"Usuario: {user.email} [{'creado' if user_created else 'password actualizado'}] "
            f"role={user.role.value} tenant_id={user.tenant_id}"
        )
    finally:
        db.close()


if __name__ == "__main__":
    main()

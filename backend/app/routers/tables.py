import uuid
from fastapi import APIRouter, Depends, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.dependencies import require_roles
from app.models.table import Table
from app.models.user import User
from app.schemas.table import TableAssign, TableCreate, TableResponse, TableUpdate
from app.utils.helpers import generate_qr_image_bytes

router = APIRouter(prefix="/tables", tags=["tables"])


@router.get("", response_model=list[TableResponse])
async def list_tables(
    current_user: User = Depends(require_roles("owner", "attendant", "cashier")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Table).where(Table.venue_id == current_user.venue_id))
    return result.scalars().all()


@router.post("", response_model=TableResponse)
async def create_table(
    req: TableCreate,
    current_user: User = Depends(require_roles("owner")),
    db: AsyncSession = Depends(get_db),
):
    table = Table(
        id=str(uuid.uuid4()),
        venue_id=current_user.venue_id,
        label=req.label,
        capacity=getattr(req, "capacity", None),
        zone=req.zone,
        qr_token=str(uuid.uuid4()),
    )
    db.add(table)
    await db.commit()
    await db.refresh(table)
    return table


@router.patch("/{table_id}", response_model=TableResponse)
async def update_table(
    table_id: str,
    req: TableUpdate,
    current_user: User = Depends(require_roles("owner")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Table).where(Table.id == table_id, Table.venue_id == current_user.venue_id)
    )
    table = result.scalar_one_or_none()
    if not table:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Table not found")
    for field, value in req.model_dump(exclude_none=True).items():
        setattr(table, field, value)
    await db.commit()
    await db.refresh(table)
    return table


@router.delete("/{table_id}", status_code=204)
async def delete_table(
    table_id: str,
    current_user: User = Depends(require_roles("owner")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Table).where(Table.id == table_id, Table.venue_id == current_user.venue_id)
    )
    table = result.scalar_one_or_none()
    if table:
        await db.delete(table)
        await db.commit()


@router.get("/{table_id}/qr")
async def get_qr(
    table_id: str,
    current_user: User = Depends(require_roles("owner")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Table).where(Table.id == table_id, Table.venue_id == current_user.venue_id)
    )
    table = result.scalar_one_or_none()
    if not table:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Table not found")
    url = f"https://app.easyserve.ng/table/{table.qr_token}"
    img_bytes = generate_qr_image_bytes(url)
    return Response(content=img_bytes, media_type="image/png")


@router.patch("/{table_id}/assign", response_model=TableResponse)
async def assign_table(
    table_id: str,
    req: TableAssign,
    current_user: User = Depends(require_roles("owner")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Table).where(Table.id == table_id, Table.venue_id == current_user.venue_id)
    )
    table = result.scalar_one_or_none()
    if not table:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Table not found")
    table.assigned_attendant_id = req.attendant_id
    await db.commit()
    await db.refresh(table)
    return table


@router.patch("/{table_id}/unassign", response_model=TableResponse)
async def unassign_table(
    table_id: str,
    current_user: User = Depends(require_roles("owner")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Table).where(Table.id == table_id, Table.venue_id == current_user.venue_id)
    )
    table = result.scalar_one_or_none()
    if not table:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Table not found")
    table.assigned_attendant_id = None
    await db.commit()
    await db.refresh(table)
    return table

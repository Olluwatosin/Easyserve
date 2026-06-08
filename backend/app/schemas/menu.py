from datetime import datetime
from typing import Literal
from pydantic import BaseModel


class CategoryCreate(BaseModel):
    name: str
    sort_order: int = 0


class CategoryUpdate(BaseModel):
    name: str | None = None
    sort_order: int | None = None
    is_active: bool | None = None


class CategoryResponse(BaseModel):
    id: str
    venue_id: str
    name: str
    sort_order: int
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class MenuItemCreate(BaseModel):
    category_id: str | None = None
    name: str
    description: str | None = None
    price: float
    image_url: str | None = None
    item_type: Literal["drink", "food", "other"] = "other"
    stock_threshold: int = 10


class MenuItemUpdate(BaseModel):
    category_id: str | None = None
    name: str | None = None
    description: str | None = None
    price: float | None = None
    image_url: str | None = None
    item_type: Literal["drink", "food", "other"] | None = None
    is_available: bool | None = None
    stock_threshold: int | None = None


class MenuItemResponse(BaseModel):
    id: str
    venue_id: str
    category_id: str | None
    name: str
    description: str | None
    price: float
    original_price: float | None = None
    effective_price: float | None = None
    image_url: str | None
    item_type: str
    is_available: bool
    stock_threshold: int
    order_count: int

    model_config = {"from_attributes": True}


class PromoCreate(BaseModel):
    name: str
    discount_pct: float
    start_time: str
    end_time: str
    days_active: list[str] = []
    applies_to: list[str] = []


class PromoUpdate(BaseModel):
    name: str | None = None
    discount_pct: float | None = None
    start_time: str | None = None
    end_time: str | None = None
    days_active: list[str] | None = None
    applies_to: list[str] | None = None
    is_active: bool | None = None


class PromoResponse(BaseModel):
    id: str
    venue_id: str
    name: str
    discount_pct: float
    start_time: str
    end_time: str
    days_active: list[str] | None
    applies_to: list[str] | None
    is_active: bool

    model_config = {"from_attributes": True}

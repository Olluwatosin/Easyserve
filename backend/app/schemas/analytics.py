from pydantic import BaseModel


class SummaryResponse(BaseModel):
    today_revenue: float
    active_orders: int
    tables_served_today: int
    pending_alerts: int


class PeakHourEntry(BaseModel):
    hour: int
    order_count: int


class TopItemEntry(BaseModel):
    item_id: str
    name: str
    item_type: str
    total_quantity: int
    total_revenue: float


class SlowTableEntry(BaseModel):
    table_id: str
    table_number: str
    zone: str | None
    minutes_idle: int


class StaffScoreEntry(BaseModel):
    staff_id: str
    full_name: str
    orders_delivered: int
    avg_delivery_minutes: float


class FeedbackSummary(BaseModel):
    great: int
    okay: int
    poor: int
    total: int


class InventoryAlertEntry(BaseModel):
    item_id: str
    name: str
    item_type: str
    order_count: int
    stock_threshold: int


class ExitPassLogEntry(BaseModel):
    order_id: str
    table_number: str | None
    status: str
    created_at: str
    used_at: str | None

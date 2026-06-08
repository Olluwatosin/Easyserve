"""
Parallel order routing: on new order, simultaneously notifies bar (drinks),
kitchen (food), and the assigned attendant.
"""
from app.services.ws_manager import manager


def determine_route(item_type: str) -> str:
    if item_type == "drink":
        return "bar"
    if item_type == "food":
        return "kitchen"
    return "none"


async def route_new_order(venue_id: str, order, table_number: str, attendant_name: str | None):
    drink_items = [i for i in order.items if i.routed_to == "bar"]
    food_items = [i for i in order.items if i.routed_to == "kitchen"]

    def _item_payload(item):
        return {"name": item.name, "qty": item.quantity, "notes": item.notes or ""}

    # Notify bar
    if drink_items:
        await manager.broadcast_bar(
            venue_id,
            "new_order_bar",
            {
                "order_id": order.id,
                "table_number": table_number,
                "attendant_name": attendant_name or "Unassigned",
                "items": [_item_payload(i) for i in drink_items],
            },
        )

    # Notify kitchen
    if food_items:
        await manager.broadcast_kitchen(
            venue_id,
            "new_order_kitchen",
            {
                "order_id": order.id,
                "table_number": table_number,
                "attendant_name": attendant_name or "Unassigned",
                "items": [_item_payload(i) for i in food_items],
            },
        )

    # Notify staff (full order)
    await manager.broadcast_staff(
        venue_id,
        "new_order_attendant",
        {
            "order_id": order.id,
            "table_number": table_number,
            "assigned_to": order.assigned_to,
            "drink_count": len(drink_items),
            "food_count": len(food_items),
            "items": [
                {"name": i.name, "qty": i.quantity, "item_type": i.item_type}
                for i in order.items
            ],
        },
    )


async def broadcast_item_ready(venue_id: str, order_id: str, table_number: str, item_type: str, station: str, assigned_to: str | None):
    event = "bar_order_ready" if station == "bar" else "kitchen_order_ready"
    await manager.broadcast_staff(
        venue_id,
        event,
        {
            "order_id": order_id,
            "table_number": table_number,
            "station": station,
            "assigned_to": assigned_to,
        },
    )

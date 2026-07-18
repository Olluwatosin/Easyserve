from types import SimpleNamespace

from app.services.order_service import apply_bill_charges


def _order(subtotal: float):
    return SimpleNamespace(total_amount=subtotal, service_charge=0.0, vat_amount=0.0)


def _venue(sc: float, vat: float):
    return SimpleNamespace(service_charge_pct=sc, vat_pct=vat)


def test_no_charges_by_default():
    o = _order(10000)
    apply_bill_charges(o, _venue(0, 0))
    assert o.service_charge == 0
    assert o.vat_amount == 0


def test_service_charge_and_vat():
    o = _order(10000)
    apply_bill_charges(o, _venue(10, 7.5))
    assert o.service_charge == 1000.0
    # VAT applies to subtotal + service charge
    assert o.vat_amount == round((10000 + 1000) * 0.075, 2)


def test_charges_recomputed_after_void():
    o = _order(10000)
    apply_bill_charges(o, _venue(10, 7.5))
    o.total_amount = 6000  # item voided
    apply_bill_charges(o, _venue(10, 7.5))
    assert o.service_charge == 600.0
    assert o.vat_amount == round(6600 * 0.075, 2)


def test_grand_total_property():
    from app.models.order import Order

    o = Order(total_amount=10000, service_charge=1000, vat_amount=825)
    assert o.grand_total == 11825.0

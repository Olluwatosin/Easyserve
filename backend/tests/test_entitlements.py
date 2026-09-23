"""What a venue is entitled to use.

Gating used to name plans at the call site. That works at three call sites and
becomes a liability at thirty — renaming or repricing a tier turns a commercial
decision into a search through the codebase, and the kind of search where
missing one leaves a paying venue locked out of something it bought.

Two properties are pinned here, and the second is the one that matters for what
comes next:

  * nothing a venue needs to trade is ever sellable
  * a capability can be switched on for one venue without touching its plan

The second is how the hotel module will ship: merged, deployed, and off
everywhere until a venue is switched on — rather than living on a branch that
drifts from main for two months and lands in one frightening merge.
"""
import pytest

from app import entitlements as ent


def test_nothing_needed_to_trade_is_sellable():
    """A venue that cannot take an order is not a customer, it is a support
    ticket. The two sets must never overlap."""
    assert ent.CORE & ent.PREMIUM == frozenset(), (
        "a capability is both core and premium — one of them is a mistake"
    )
    for essential in ("orders", "tables", "menu", "payments", "exit_passes", "staff"):
        assert essential in ent.CORE


def test_the_cheapest_plan_can_still_run_a_venue():
    starter = ent.features_for("starter")
    assert ent.CORE <= starter
    assert "analytics.advanced" not in starter


def test_plans_only_ever_add():
    """A venue that upgrades must never lose something. This is the check that
    catches a typo in a plan definition, which otherwise surfaces as a customer
    losing a feature they were using."""
    order = ["starter", "growth", "pro", "enterprise"]
    for lower, higher in zip(order, order[1:]):
        assert ent.features_for(lower) <= ent.features_for(higher), (
            f"moving from {lower} to {higher} takes something away"
        )


def test_an_unknown_plan_keeps_the_till_working():
    """A typo in a plan name should cost a venue its premium features, never its
    ability to serve a guest."""
    granted = ent.features_for("groth")  # misspelled on purpose
    assert ent.CORE <= granted
    assert "analytics.advanced" not in granted


def test_a_single_venue_can_be_granted_a_premium_module():
    """The pilot case. A venue runs free with premium modules without inventing
    a tier that has to be un-invented at the first invoice."""
    granted = ent.features_for("starter", ["hotel.rooms"])
    assert "hotel.rooms" in granted
    assert ent.CORE <= granted
    # and it did not quietly become a different plan
    assert "analytics.advanced" not in granted


def test_an_override_cannot_invent_a_capability():
    """Otherwise a stale override keeps naming something that was removed, and
    the list drifts from what the code can actually do."""
    granted = ent.features_for("starter", ["hotel.rooms", "teleportation"])
    assert "hotel.rooms" in granted
    assert "teleportation" not in granted


def test_the_hotel_module_is_declared_but_off_by_default():
    """How it ships dark: the capability exists so routes can ask for it, and
    no plan below enterprise grants it, so merging the module changes nothing
    for a working venue."""
    assert "hotel.rooms" in ent.ALL
    for plan in ("starter", "growth", "pro"):
        assert "hotel.rooms" not in ent.features_for(plan), (
            f"{plan} would switch the hotel module on before it is finished"
        )


def test_forecasting_is_not_given_away_before_it_exists():
    assert "forecasting" in ent.PREMIUM
    assert "forecasting" not in ent.features_for("starter")


@pytest.mark.parametrize("feature", sorted(ent.ALL))
def test_every_capability_belongs_to_at_least_one_plan(feature):
    """A capability no plan grants is one nobody can ever buy — usually a
    rename that was only half done."""
    assert any(feature in ent.features_for(p) for p in ent.PLANS), (
        f"{feature} is unreachable from every plan"
    )

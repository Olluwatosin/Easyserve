"""Reading a menu out of the file the venue already has it in.

A new lounge's menu arrives as whatever its designer produced. Typing a hundred
lines into a web form is most of a day and the kind of job that gets
three-quarters done.

The tests that matter here are about *honesty*, not coverage. A parser that is
right most of the time is a large saving when a person reviews it and a disaster
when it writes straight to the menu, so what is pinned below is: prices are read
the way Nigerian menus write them, a guess is labelled as a guess, and a file
that cannot be read says so instead of succeeding emptily.

The DOCX and PDF cases build real files rather than mocking the libraries —
mocking a parser tests the mock.
"""
import io

import pytest

from app.services import menu_import as mi


# ── Prices, as menus actually write them ─────────────────────────────────────

@pytest.mark.parametrize(
    "text,expected",
    [
        ("₦45,000", 45000),
        ("N45,000", 45000),
        ("NGN 45,000", 45000),
        ("45,000", 45000),
        ("45000", 45000),
        ("2,500.50", 2500.50),
        ("45k", 45000),
        ("₦45k", 45000),
        ("Hennessy VS .......... ₦45,000", 45000),
    ],
)
def test_prices_are_read_the_way_menus_write_them(text, expected):
    assert mi.parse_price(text) == expected


@pytest.mark.parametrize("text", ["", "Market price", "—", "TBC", "0", "₦0"])
def test_a_missing_price_is_none_not_zero(text):
    """Zero would import as a free item and be discovered by a guest."""
    assert mi.parse_price(text) is None


# ── CSV: exact, because the columns say what they are ────────────────────────

def test_csv_with_headers_is_read_exactly():
    csv = (
        "Name,Price,Cost,Category,Item Type\n"
        "Hennessy VS,45000,28000,Cognac,drink\n"
        "Pepper Soup,6500,2200,Starters,food\n"
    )
    out = mi.parse_csv(csv.encode())
    assert [i.name for i in out.items] == ["Hennessy VS", "Pepper Soup"]
    assert out.items[0].price == 45000
    assert out.items[0].unit_cost == 28000
    assert out.items[0].category == "Cognac"
    assert out.items[0].item_type == "drink"
    assert out.items[1].item_type == "food"
    assert all(i.confidence == "high" for i in out.items)
    assert out.needs_review == 0


def test_csv_column_names_do_not_have_to_be_exact():
    """Whoever exported it wrote 'Item' and 'Amount', not our field names."""
    out = mi.parse_csv(b"Item,Amount\nSmall Chops,7500\n")
    assert out.items[0].name == "Small Chops"
    assert out.items[0].price == 7500


def test_a_headerless_csv_is_read_but_flagged():
    """Two columns in an unknown order is a guess, and says so."""
    out = mi.parse_csv(b"Star Lager,2500\nGulder,2800\n")
    assert len(out.items) == 2
    assert all(i.confidence == "low" for i in out.items)
    assert out.needs_review == 2


def test_csv_semicolons_and_a_bom_still_parse():
    """What Excel produces on a machine with European locale settings."""
    out = mi.parse_csv("﻿Name;Price\nJollof Rice;5500\n".encode("utf-8"))
    assert out.items[0].name == "Jollof Rice"
    assert out.items[0].price == 5500


# ── DOCX: usually a table, so read the table ─────────────────────────────────

def _docx(rows, paragraphs=()) -> bytes:
    docx = pytest.importorskip("docx")
    d = docx.Document()
    for p in paragraphs:
        d.add_paragraph(p)
    if rows:
        t = d.add_table(rows=0, cols=len(rows[0]))
        for r in rows:
            cells = t.add_row().cells
            for i, v in enumerate(r):
                cells[i].text = v
    buf = io.BytesIO()
    d.save(buf)
    return buf.getvalue()


def test_a_word_table_is_read_with_its_section_headings():
    data = _docx(
        [
            ["COCKTAILS", ""],
            ["Chapman", "6,500"],
            ["Pina Colada", "8,000"],
            ["STARTERS", ""],
            ["Pepper Soup", "6,500"],
        ]
    )
    out = mi.parse_docx(data)
    names = {i.name: i for i in out.items}
    assert "Chapman" in names and names["Chapman"].price == 6500
    assert names["Chapman"].category == "COCKTAILS"
    assert names["Chapman"].item_type == "drink"
    assert names["Pepper Soup"].item_type == "food"


def test_a_word_menu_written_as_paragraphs_still_yields_items():
    data = _docx([], paragraphs=["SPIRITS", "Johnnie Walker Black .... 65,000"])
    out = mi.parse_docx(data)
    assert out.items[0].name == "Johnnie Walker Black"
    assert out.items[0].price == 65000
    assert out.items[0].confidence == "low"


def test_something_that_is_not_a_word_file_is_refused_clearly():
    with pytest.raises(ValueError, match="Word document"):
        mi.parse_docx(b"this is not a docx")


# ── PDF: a guess, labelled as one ────────────────────────────────────────────

def _pdf(lines: list[str]) -> bytes:
    """A minimal text PDF, written by hand to avoid another dependency."""
    body = "BT /F1 12 Tf 40 780 Td 14 TL\n" + "\n".join(
        f"({l.replace('(', '').replace(')', '')}) Tj T*" for l in lines
    ) + "\nET"
    objs = [
        "<< /Type /Catalog /Pages 2 0 R >>",
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] "
        "/Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
        f"<< /Length {len(body)} >>\nstream\n{body}\nendstream",
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    out = "%PDF-1.4\n"
    offsets = []
    for i, o in enumerate(objs, start=1):
        offsets.append(len(out))
        out += f"{i} 0 obj\n{o}\nendobj\n"
    xref = len(out)
    out += f"xref\n0 {len(objs) + 1}\n0000000000 65535 f \n"
    for off in offsets:
        out += f"{off:010d} 00000 n \n"
    out += (
        f"trailer\n<< /Size {len(objs) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF"
    )
    return out.encode("latin-1")


def test_a_text_pdf_yields_items_marked_as_guesses():
    pytest.importorskip("pypdf")
    out = mi.parse_pdf(_pdf(["COGNAC", "Hennessy VS 45,000", "Martell VS 42,000"]))
    names = {i.name: i for i in out.items}
    assert "Hennessy VS" in names
    assert names["Hennessy VS"].price == 45000
    assert names["Hennessy VS"].category == "COGNAC"
    assert all(i.confidence == "low" for i in out.items), (
        "a PDF is an inference and must never be presented as exact"
    )


def test_a_scanned_pdf_says_so_rather_than_succeeding_emptily():
    """The failure mode that matters: a photographed menu has no text in it, and
    returning zero items as a success reads as 'your menu was empty'."""
    pytest.importorskip("pypdf")
    with pytest.raises(ValueError, match="scan or a photo"):
        mi.parse_pdf(_pdf([]))


# ── Dispatch and refusals ────────────────────────────────────────────────────

def test_the_file_type_decides_the_parser():
    out = mi.parse("menu.csv", b"Name,Price\nGulder,2800\n")
    assert out.source == "csv" and out.items[0].name == "Gulder"


@pytest.mark.parametrize(
    "filename,hint",
    [
        ("menu.doc", "save as .docx"),
        ("menu.xlsx", "CSV"),
        ("menu.pages", "CSV, Word"),
    ],
)
def test_unsupported_files_say_what_to_do_instead(filename, hint):
    """An error that only says 'unsupported' leaves someone stuck with the
    file they have."""
    with pytest.raises(ValueError, match=hint):
        mi.parse(filename, b"x")


def test_section_headings_are_not_imported_as_items():
    out = mi.parse_csv(b"Name,Price\nCOCKTAILS,\nChapman,6500\n")
    # A heading has no price, so it survives parsing but carries none — the
    # review screen is what keeps it out of the menu.
    chapman = [i for i in out.items if i.name == "Chapman"]
    assert chapman and chapman[0].price == 6500
    heading = [i for i in out.items if i.name == "COCKTAILS"]
    assert heading and heading[0].price is None

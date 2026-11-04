"""Lumi PCB v1 parts budget: writes BUDGET.md, budget.csv and budget.xlsx
(live formulas: edit the blue cells in Excel and the totals follow) next to
this file.

Edit the price tables below (or USD_TO_CAD) and re-run:

    python3 hardware/pcb/budget.py

Prices are USD, checked 2026-10-30. "est" marks a number I couldn't see
on a live listing (an estimate from similar listings); refresh those from
the JLCPCB quote page before ordering.
"""

import csv
import os

HERE = os.path.dirname(os.path.abspath(__file__))
CHECKED = "2026-10-30"
USD_TO_CAD = 1.40   # late October 2026 (about 1.40-1.43 through the month)
GST = 0.05          # federal GST on imports; HST provinces pay 13-15% instead

# Quantity tiers used for per-board prices.
TIERS = ("proto", "100", "1000")  # proto = buying for 5-10 boards

# Board parts, per board, by tier (USD). From the JLCPCB BOM (kicad/fab/lumi-bom.csv).
BOARD_PARTS = [
    # ref, part, LCSC, (proto, 100, 1000), estimated?
    ("U1", "ESP32-C3-WROOM-02-N4 module", "C2934560", (3.40, 2.60, 2.09), False),
    ("U2", "LIS2DH12TR accelerometer", "C110926", (0.57, 0.39, 0.36), False),
    ("J2", "Hirose FH12-30S-0.5SH screen connector", "C506793", (0.72, 0.62, 0.50), True),
    ("D1", "USBLC6-2SC6 USB ESD", "C7519", (0.20, 0.15, 0.11), True),
    ("J1", "USB-C receptacle TYPE-C-31-M-12", "C165948", (0.18, 0.13, 0.10), False),
    ("U4", "RT9080-33GJ5 3.3 V regulator", "C841192", (0.12, 0.09, 0.07), True),
    ("U3", "TP4054 charger", "C32574", (0.06, 0.05, 0.04), True),
    ("SW1", "MSK12C02 slide switch", "C431540", (0.06, 0.05, 0.04), True),
    ("R/C", "27 resistors and capacitors (JLCPCB Basic)", "various", (0.10, 0.06, 0.04), True),
]

# Everything else that goes in one Lumi, per unit, by tier.
OTHER_PARTS = [
    ("Screen", "BuyDisplay ER-OLED0.96-1 plug-in OLED", (2.49, 2.23, 1.70), "1,000: est. factory quote"),
    ("Battery", "503030 LiPo ~500 mAh, protected, UN38.3", (6.00, 2.50, 1.40), "est."),
    ("Case", "Mini Lumi PCB case, PLA, ~17 g at $25/kg", (0.45, 0.45, 0.45), "your printer; ~2.5 h"),
    ("Sundries", "foam tape, Kapton, battery wire", (0.15, 0.10, 0.06), "est."),
]

# Factory costs per board (USD) by tier.
PCB_PER_BOARD = {"100": 0.25, "1000": 0.08}           # est. (31 x 33 mm, 2 layers, 1.0 mm)
JOINTS = 165                                           # solder joints per board (SMT)
JOINT_COST = 0.0017                                    # JLCPCB Economic assembly, per joint
HAND_JOINTS, HAND_JOINT_COST = 4, 0.0173               # USB-C shell legs (through-hole)

# One-off fees per order (USD).
PCB_ORDER = {5: 4.00, 10: 6.00}                        # 5 or 10 bare boards, est. for 1.0 mm
ASSEMBLY_SETUP = 8.00                                  # Economic PCBA setup
STENCIL = 1.50
EXTENDED = 8                                           # Extended parts (U1-U4, D1, J1, J2, SW1)
EXTENDED_FEE = 3.00                                    # per Extended part type; some sources say $1.50 now
HAND_SOLDER_SETUP = 3.50
VOLUME_SETUP = 25.00                                   # Standard PCBA setup for 100+ runs

# Shipping to Canada (USD).
SHIP_PROTO = {"JLCPCB boards (DHL)": 25.00, "Screens from BuyDisplay": 15.00, "Batteries (AliExpress, ground)": 4.00}
BROKERAGE_CAD = 15.00                                  # courier brokerage, per courier parcel (2 parcels)
SHIP_PER_UNIT = {"100": 0.60, "1000": 0.20}            # est. air freight share, all parts

# ---- From the device cost to the full average unit cost (CAD; bought in Canada) ----
# Packaging per unit at 100 / 1,000 (estimates; replace with real quotes).
PACKAGING_CAD = [
    ("Mailer box, 3 x 3 x 2 in", (0.60, 0.35), "Uline.ca / Amazon packs"),
    ("Padding (crinkle paper or foam)", (0.10, 0.05), "est."),
    ("Birth certificate (1/8 Letter sheet of card stock + ink)", (0.15, 0.10), "home or Staples printing"),
    ("Odds card (printed 4 x 6 postcard)", (0.40, 0.12), "Vistaprint / Staples run"),
    ("Shipping label", (0.10, 0.05), "4 x 6 label sheets"),
]
SPARES = 0.05            # extra parts for failed or damaged units, as a share of the device cost
PRICE_CAD = 59.00        # example selling price (the demo price); only used for the Stripe fee and margin
STRIPE_PCT, STRIPE_FIXED_CAD = 0.029, 0.30   # Stripe Canada, domestic cards
CERT_CAD = 0.0           # EMC testing (ICES-003 / FCC Part 15B) for the finished product: enter a lab quote
TOOLS_CAD = 0.0          # one-time tools (trimmer, calipers, ...): enter what you spend

SOURCES = [
    ("JLCPCB: what the PCB assembly price includes", "https://jlcpcb.com/help/article/pcb-assembly-price"),
    ("JLCPCB PCBA price overview (feeder fee change)", "https://techoverflow.net/2024/04/09/jlcpcb-pcba-assembly-price-overview/"),
    ("JLCPCB $2 PCB offer", "https://jlcpcb.com/blog/free-assembly-for-1-6-layer-pcbs-and-discounts-on-8-20-layer-pcba"),
    ("ESP32-C3-WROOM-02-N4 on LCSC", "https://www.lcsc.com/product-detail/WiFi-Modules_Espressif-Systems-ESP32-C3-WROOM-02-N4_C2934560.html"),
    ("LIS2DH12TR on LCSC", "https://www.lcsc.com/product-image/C110926.html"),
    ("TYPE-C-31-M-12 on LCSC", "https://lcsc.com/product-detail/USB-Connectors_Korean-Hroparts-Elec-TYPE-C-31-M-12_C165948.html"),
    ("Hirose FH12-30S-0.5SH on LCSC", "https://lcsc.com/product-detail/FFC-FPC-Flat-Flexible-Connector-Assemblies_HRS-Hirose-FH12-30S-0-5SH-55_C506793.html"),
    ("USBLC6-2SC6 on JLCPCB", "https://jlcpcb.com/partdetail/C7519"),
    ("BuyDisplay ER-OLED0.96-1", "https://buydisplay.com/blue-128x64-0-96-inch-oled-display-top-contact-connector-fpc-ssd1306"),
    ("503030 500 mAh protected LiPo (retail reference)", "https://www.walmart.com/ip/seot/5362991161"),
    ("Shipping and brokerage to Canada (forum reports)", "https://forum.kicad.info/t/alternatives-to-jlcpcb-or-pcbway-for-canadian-hobbyist/61624"),
    ("CBSA: courier imports from outside the US/Mexico (CAD 20 threshold)", "https://www.cbsa-asfc.gc.ca/services/cusma-aceum/lvs-efv-eng.html"),
    ("USD/CAD, October 2026", "https://moneyexchangerate.org/currencyexchange/usd/cad"),
    ("Stripe pricing, Canada", "https://stripe.com/en-ca/pricing"),
]


def tier_index(tier):
    return TIERS.index(tier)


def per_board(tier):
    """USD per assembled board (parts + bare board share + joints), no one-offs."""
    i = tier_index(tier)
    parts = sum(p[3][i] for p in BOARD_PARTS)
    joints = JOINTS * JOINT_COST + HAND_JOINTS * HAND_JOINT_COST
    pcb = PCB_PER_BOARD.get(tier, 0.0)
    return parts, joints, pcb


def per_unit_other(tier):
    i = tier_index(tier)
    return sum(o[2][i] for o in OTHER_PARTS)


def one_off_assembly(volume=False):
    return (VOLUME_SETUP if volume else ASSEMBLY_SETUP) + STENCIL + EXTENDED * EXTENDED_FEE + HAND_SOLDER_SETUP


def prototype(n):
    parts, joints, _ = per_board("proto")
    rows = [
        ("Board parts", n * parts),
        ("Assembly (solder joints)", n * joints),
        ("Bare boards (order of %d)" % n, PCB_ORDER[n]),
        ("Assembly setup, stencil, %d Extended-part fees" % EXTENDED, one_off_assembly()),
        ("Screens", n * OTHER_PARTS[0][2][0]),
        ("Batteries", n * OTHER_PARTS[1][2][0]),
        ("Cases (printed) and sundries", n * (OTHER_PARTS[2][2][0] + OTHER_PARTS[3][2][0])),
    ]
    rows += [(f"Shipping: {k}", v) for k, v in SHIP_PROTO.items()]
    goods = sum(v for _, v in rows)
    rows.append(("GST 5% on imports", GST * goods))
    rows.append(("Courier brokerage (2 parcels)", 2 * BROKERAGE_CAD / USD_TO_CAD))
    total = sum(v for _, v in rows)
    return rows, total


def volume(n):
    tier = str(n)
    parts, joints, pcb = per_board(tier)
    other = per_unit_other(tier)
    setup = one_off_assembly(volume=True) / n
    ship = SHIP_PER_UNIT[tier]
    rows = [
        ("Board parts", parts),
        ("Bare board", pcb),
        ("Assembly (joints)", joints),
        ("Assembly setup and fees, shared", setup),
        ("Screen", OTHER_PARTS[0][2][tier_index(tier)]),
        ("Battery", OTHER_PARTS[1][2][tier_index(tier)]),
        ("Case and sundries", OTHER_PARTS[2][2][tier_index(tier)] + OTHER_PARTS[3][2][tier_index(tier)]),
        ("Shipping share", ship),
    ]
    sub = sum(v for _, v in rows)
    rows.append(("GST 5% on imports", GST * sub))
    return rows, sum(v for _, v in rows)


def full_unit(n, proto_total_usd):
    """CAD per unit from the device cost to the average unit cost, for a run of n."""
    j = 0 if n == 100 else 1
    device = volume(n)[1] * USD_TO_CAD
    rows = [("Device: board, screen, battery, case, import shipping, GST", device)]
    rows += [(name, pr[j]) for name, pr, _ in PACKAGING_CAD]
    rows.append((f"Spares and failed units ({SPARES:.0%} of the device)", SPARES * device))
    make = sum(v for _, v in rows)
    extra = [
        (f"Stripe fee at a ${PRICE_CAD:.2f} price", PRICE_CAD * STRIPE_PCT + STRIPE_FIXED_CAD),
        ("Prototype run (10 boards) spread over the run", proto_total_usd * USD_TO_CAD / n),
        ("Certification (lab quote) spread over the run", CERT_CAD / n),
        ("One-time tools spread over the run", TOOLS_CAD / n),
    ]
    return rows, make, extra, make + sum(v for _, v in extra)


def money(usd):
    return f"${usd:,.2f}", f"${usd * USD_TO_CAD:,.2f}"


def table(rows, total, total_label="**Total**"):
    out = ["| Item | USD | CAD |", "|---|--:|--:|"]
    for name, v in rows:
        u, c = money(v)
        out.append(f"| {name} | {u} | {c} |")
    u, c = money(total)
    out.append(f"| {total_label} | **{u}** | **{c}** |")
    return out


def main():
    lines = [
        "# Lumi PCB v1: budget",
        "",
        f"Generated by [`budget.py`](budget.py) from prices checked on **{CHECKED}**,",
        f"at **1 USD = {USD_TO_CAD:.2f} CAD**.",
        "",
        "Prices move. Before you order:",
        "- recheck everything against the JLCPCB quote page and LCSC,",
        "- refresh lines marked *est.*, which come from similar listings rather than a live quote.",
        "",
        "Edit the tables in `budget.py` and re-run it to update this page.",
        "",
        "## At a glance",
        "",
        "| | USD | CAD |",
        "|---|--:|--:|",
    ]
    proto = {n: prototype(n) for n in (5, 10)}
    vol = {n: volume(n) for n in (100, 1000)}
    for n in (5, 10):
        total = proto[n][1]
        lines.append(f"| {n} prototypes, all in | {money(total)[0]} | {money(total)[1]} |")
        lines.append(f"| … per prototype | {money(total / n)[0]} | {money(total / n)[1]} |")
    for n in (100, 1000):
        lines.append(f"| One Lumi at {n:,} units | {money(vol[n][1])[0]} | {money(vol[n][1])[1]} |")
    full = {n: full_unit(n, proto[10][1]) for n in (100, 1000)}
    for n in (100, 1000):
        lines.append(f"| **Average unit cost at {n:,} units** (packed, fees, spares, prototypes) | – | **${full[n][3]:,.2f}** |")
    lines += [
        "",
        "The device figures include:",
        "- the board, built by JLCPCB,",
        "- the screen, battery and printed case,",
        "- shipping to Canada, GST and courier brokerage.",
        "",
        "The average unit cost adds packaging, spares, the Stripe fee and the prototype run (see below).",
        "Neither includes certification (until you enter a lab quote), customs duty beyond GST, or your time.",
        "",
    ]
    for n in (5, 10):
        lines += [f"## {n} prototypes", ""] + table(*proto[n]) + [""]
    lines += [
        "Notes on the prototype runs:",
        "- **Fixed costs dominate:**",
        f"  - JLCPCB's setup, stencil and the {EXTENDED} Extended-part fees (${EXTENDED_FEE:.2f} each) come to ${one_off_assembly():.2f} however many boards you build,",
        "  - so does shipping.",
        "  - That's why 10 boards cost far less than twice 5.",
        "- **Extended-part fee:** one source says it dropped to $1.50 per part in December 2025. If your quote shows that, the run is about $12 cheaper.",
        "- **Batteries:** buy them separately, by ground shipping. JLCPCB doesn't send lithium cells by air with boards.",
        "- **Taxes:** courier parcels from China are taxed above CAD 20. HST provinces pay 13–15% instead of the 5% GST used here.",
        "",
    ]
    for n in (100, 1000):
        lines += [f"## Per Lumi at {n:,} units", ""] + table(*vol[n], total_label="**Per unit**") + [""]
    lines += [
        "Notes on volume:",
        f"- **Setup:** assembly switches to Standard PCBA (${VOLUME_SETUP:.0f} setup), shared across the run.",
        "- **Biggest items:** the module and the screen are the two largest costs.",
        "- **Screen:** at 1,000 the screen is an estimate for a factory-direct quote (the listing stops at $2.23 for 100).",
        "- **Battery:** the 1,000 price assumes a factory quote with UN38.3 reports.",
        "- **Case:** a home-printed case is cheap in plastic (~$0.45) but takes about 2.5 hours of printer time each. At 1,000, a print farm or an injection mould changes this line.",
        "",
        "## Average unit cost (CAD)",
        "",
        "From the device cost above to what each Lumi really costs: packed, with spares, the Stripe fee and the",
        "prototype run spread over the batch. Packaging prices are estimates; edit `PACKAGING_CAD` (or the",
        "**Full unit cost** tab in the workbook) with real quotes.",
        "",
        "| Item | 100 units | 1,000 units |",
        "|---|--:|--:|",
    ]
    rows100, make100, extra100, auc100 = full[100]
    rows1k, make1k, extra1k, auc1k = full[1000]
    for (name, a), (_, b) in zip(rows100, rows1k):
        lines.append(f"| {name} | ${a:,.2f} | ${b:,.2f} |")
    lines.append(f"| **Cost to make and pack** | **${make100:,.2f}** | **${make1k:,.2f}** |")
    for (name, a), (_, b) in zip(extra100, extra1k):
        lines.append(f"| {name} | ${a:,.2f} | ${b:,.2f} |")
    lines.append(f"| **Average unit cost** | **${auc100:,.2f}** | **${auc1k:,.2f}** |")
    lines.append(f"| Left from a ${PRICE_CAD:.2f} sale | ${PRICE_CAD - auc100:,.2f} ({(PRICE_CAD - auc100) / PRICE_CAD:.0%}) "
                 f"| ${PRICE_CAD - auc1k:,.2f} ({(PRICE_CAD - auc1k) / PRICE_CAD:.0%}) |")
    lines += [
        "",
        "Notes:",
        "- **Shipping** isn't here: the customer pays it at checkout. Stripe's fee on the shipping part (2.9%) is left out too.",
        "- **Certification** is the big unknown: EMC testing of the finished Lumi (the radio module is already certified) often costs thousands. $2,000 adds $20 a unit at 100 and $2 at 1,000. Enter your lab quote in `CERT_CAD`.",
        "- **Your time** (assembly, provisioning, testing, packing: maybe 10–15 minutes a unit) and **printer time** (about 2.5 h a case) aren't counted.",
        f"- The **price** (${PRICE_CAD:.2f}) is only an example, used for the Stripe fee and the margin line.",
        "",
        "## Board parts by quantity (USD each)",
        "",
        "| Ref | Part | LCSC | 5–10 boards | 100 | 1,000 |",
        "|---|---|---|--:|--:|--:|",
    ]
    for ref, name, lcsc, pr, est in BOARD_PARTS:
        tag = " *est.*" if est else ""
        lines.append(f"| {ref} | {name}{tag} | {lcsc} | ${pr[0]:.2f} | ${pr[1]:.2f} | ${pr[2]:.2f} |")
    for name, desc, pr, note in OTHER_PARTS:
        lines.append(f"| {name} | {desc} ({note}) | – | ${pr[0]:.2f} | ${pr[1]:.2f} | ${pr[2]:.2f} |")
    lines += ["", "## Sources", ""] + [f"- [{t}]({u})" for t, u in SOURCES] + [""]

    with open(os.path.join(HERE, "BUDGET.md"), "w", encoding="utf-8", newline="\n") as fh:
        fh.write("\n".join(lines))

    with open(os.path.join(HERE, "budget.csv"), "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["section", "item", "usd", "cad"])
        for n in (5, 10):
            for name, v in proto[n][0]:
                w.writerow([f"{n} prototypes", name, f"{v:.2f}", f"{v * USD_TO_CAD:.2f}"])
            w.writerow([f"{n} prototypes", "TOTAL", f"{proto[n][1]:.2f}", f"{proto[n][1] * USD_TO_CAD:.2f}"])
        for n in (100, 1000):
            for name, v in vol[n][0]:
                w.writerow([f"per unit at {n}", name, f"{v:.2f}", f"{v * USD_TO_CAD:.2f}"])
            w.writerow([f"per unit at {n}", "TOTAL", f"{vol[n][1]:.2f}", f"{vol[n][1] * USD_TO_CAD:.2f}"])
        for n in (100, 1000):
            rows, make, extra, auc = full[n]
            for name, v in rows + [("Cost to make and pack", make)] + extra:
                w.writerow([f"average unit cost at {n}", name, f"{v / USD_TO_CAD:.2f}", f"{v:.2f}"])
            w.writerow([f"average unit cost at {n}", "TOTAL", f"{auc / USD_TO_CAD:.2f}", f"{auc:.2f}"])
    write_xlsx(os.path.join(HERE, "budget.xlsx"))
    for n in (5, 10):
        print(f"{n} prototypes: ${proto[n][1]:.2f} USD (${proto[n][1] * USD_TO_CAD:.2f} CAD)")
    for n in (100, 1000):
        print(f"per unit at {n}: ${vol[n][1]:.2f} USD (${vol[n][1] * USD_TO_CAD:.2f} CAD)")
    for n in (100, 1000):
        print(f"average unit cost at {n}: ${full[n][3]:.2f} CAD")


# ---------------------------------------------------------------- Excel

def write_xlsx(path):
    """The same budget as a workbook with live formulas: change any blue
    input (prices, fees, exchange rate, quantities) and the totals follow."""
    from openpyxl import Workbook
    from openpyxl.comments import Comment
    from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
    from openpyxl.utils import get_column_letter

    ARIAL = "Arial"
    BLUE, GREEN = "0000FF", "008000"
    usd = '$#,##0.00;($#,##0.00);"-"'
    f_title = Font(name=ARIAL, size=14, bold=True)
    f_head = Font(name=ARIAL, bold=True, color="FFFFFF")
    f_bold = Font(name=ARIAL, bold=True)
    f_norm = Font(name=ARIAL)
    f_input = Font(name=ARIAL, color=BLUE)
    f_link = Font(name=ARIAL, color=GREEN)
    f_note = Font(name=ARIAL, italic=True, color="666666", size=9)
    head_fill = PatternFill("solid", fgColor="3B3F6B")
    key_fill = PatternFill("solid", fgColor="FFFF00")
    total_fill = PatternFill("solid", fgColor="E8EAF6")
    thin = Side(style="thin", color="999999")
    top_line = Border(top=thin)

    wb = Workbook()
    summary = wb.active
    summary.title = "Summary"
    inputs = wb.create_sheet("Inputs")
    parts = wb.create_sheet("Parts")
    proto_ws = wb.create_sheet("Prototypes")
    unit_ws = wb.create_sheet("Per unit")
    full_ws = wb.create_sheet("Full unit cost")
    src_ws = wb.create_sheet("Sources")

    def put(ws, ref, value, font=f_norm, fmt=None, fill=None, bold=False, note=None):
        c = ws[ref]
        c.value = value
        c.font = Font(name=ARIAL, bold=True, color=font.color) if bold else font
        if fmt:
            c.number_format = fmt
        if fill:
            c.fill = fill
        if note:
            c.comment = Comment(note, "budget.py")
        return c

    def header(ws, row, labels, col=1):
        for i, label in enumerate(labels):
            c = ws.cell(row=row, column=col + i, value=label)
            c.font = f_head
            c.fill = head_fill
            c.alignment = Alignment(horizontal="center" if i else "left", wrap_text=True)

    def widths(ws, cols):
        for i, w in enumerate(cols, start=1):
            ws.column_dimensions[get_column_letter(i)].width = w

    # ---- Inputs
    widths(inputs, [44, 14, 70])
    put(inputs, "A1", "Inputs: edit the blue cells", f_title)
    put(inputs, "A2", f"Prices in USD, checked {CHECKED}. Yellow = key assumptions.", f_note)
    header(inputs, 4, ["Assumption", "Value", "Note"])
    rows = [
        ("fx", "Exchange rate (CAD per 1 USD)", USD_TO_CAD, "0.00", True,
         "About 1.40-1.43 through October 2026 (moneyexchangerate.org)."),
        ("gst", "GST on imports", GST, "0.0%", True,
         "Federal GST. HST provinces pay 13-15% instead: change this."),
        ("broker", "Courier brokerage per parcel (CAD)", BROKERAGE_CAD, usd, False,
         "Forum reports of DHL/UPS clearance fees for Canada."),
        ("parcels", "Courier parcels per prototype run", 2, "0", False,
         "JLCPCB boards + screens; batteries come by ground post."),
        (None, "JLCPCB assembly", None, None, False, None),
        ("setup", "Economic assembly setup (per order)", ASSEMBLY_SETUP, usd, False, "JLCPCB help: PCB assembly price."),
        ("stencil", "Stencil (per order)", STENCIL, usd, False, "JLCPCB help: PCB assembly price."),
        ("ext_n", "Extended part types on the board", EXTENDED, "0", False, "U1-U4, D1, J1, J2, SW1."),
        ("ext_fee", "Fee per Extended part type", EXTENDED_FEE, usd, False,
         "Official FAQ says $3; one source says $1.50 since Dec 2025."),
        ("hand_setup", "Hand-soldering setup (USB-C shell legs)", HAND_SOLDER_SETUP, usd, False, "JLCPCB help."),
        ("vol_setup", "Standard assembly setup (100+ runs)", VOLUME_SETUP, usd, False, "JLCPCB help (older price page)."),
        ("joints", "SMT solder joints per board", JOINTS, "0", False, "Counted from the board's pads (approx.)."),
        ("joint_cost", "Cost per SMT joint", JOINT_COST, "$0.0000", False, "JLCPCB Economic assembly."),
        ("hand_joints", "Hand-soldered joints per board", HAND_JOINTS, "0", False, "USB-C shell legs."),
        ("hand_cost", "Cost per hand-soldered joint", HAND_JOINT_COST, "$0.0000", False, "JLCPCB help."),
        (None, "Bare boards (31 x 33 mm, 2 layers, 1.0 mm)", None, None, False, None),
        ("pcb5", "Order of 5 boards", PCB_ORDER[5], usd, False, "Estimate; $2 offer is for 1.6 mm boards."),
        ("pcb10", "Order of 10 boards", PCB_ORDER[10], usd, False, "Estimate."),
        ("pcb100", "Per board at 100", PCB_PER_BOARD["100"], usd, False, "Estimate."),
        ("pcb1000", "Per board at 1,000", PCB_PER_BOARD["1000"], usd, False, "Estimate."),
        (None, "Shipping", None, None, False, None),
        ("ship_jlc", "JLCPCB boards to Canada (DHL)", SHIP_PROTO["JLCPCB boards (DHL)"], usd, False,
         "Forum reports: ~$17-25 for small orders."),
        ("ship_oled", "Screens from BuyDisplay", SHIP_PROTO["Screens from BuyDisplay"], usd, False, "Estimate."),
        ("ship_bat", "Batteries (AliExpress, ground)", SHIP_PROTO["Batteries (AliExpress, ground)"], usd, False,
         "Estimate."),
        ("ship100", "Shipping share per unit at 100", SHIP_PER_UNIT["100"], usd, False, "Estimate (air freight)."),
        ("ship1000", "Shipping share per unit at 1,000", SHIP_PER_UNIT["1000"], usd, False, "Estimate (air freight)."),
        (None, "Selling and one-time costs (CAD)", None, None, False, None),
        ("price", "Example selling price (CAD)", PRICE_CAD, usd, True,
         "Only used for the Stripe fee and the margin on the Full unit cost tab."),
        ("stripe_pct", "Stripe fee, percent of the sale", STRIPE_PCT, "0.0%", False,
         "Stripe Canada, domestic cards (stripe.com/en-ca/pricing)."),
        ("stripe_fixed", "Stripe fee, fixed per order (CAD)", STRIPE_FIXED_CAD, usd, False, "Stripe Canada."),
        ("spares", "Spares and failed units (share of device cost)", SPARES, "0.0%", True,
         "Planning allowance for parts that fail testing or get damaged."),
        ("cert", "Certification lab quote (CAD)", CERT_CAD, usd, True,
         "EMC testing of the finished Lumi (ICES-003 / FCC Part 15B). Enter your quote; often thousands."),
        ("tools", "One-time tools (CAD)", TOOLS_CAD, usd, False, "Paper trimmer, calipers, corner punch..."),
    ]
    ref = {}
    r = 5
    for key, label, value, fmt, key_cell, note in rows:
        if key is None:
            r += 1
            put(inputs, f"A{r}", label, f_bold)
            r += 1
            continue
        put(inputs, f"A{r}", label)
        put(inputs, f"B{r}", value, f_input, fmt, key_fill if key_cell else None)
        put(inputs, f"C{r}", note, f_note)
        ref[key] = f"Inputs!$B${r}"
        r += 1

    # ---- Parts
    widths(parts, [10, 46, 12, 13, 13, 13, 11, 40])
    put(parts, "A1", "Parts: price each (USD) by how many you buy", f_title)
    put(parts, "A2", "Blue = edit. Prices from LCSC/JLCPCB listings; 'Yes' in Estimate = no live quote seen.", f_note)
    header(parts, 4, ["Ref", "Part", "LCSC", "5-10 boards", "100", "1,000", "Estimate?", "Note"])
    r = 5
    for pref, name, lcsc, pr, est in BOARD_PARTS:
        put(parts, f"A{r}", pref)
        put(parts, f"B{r}", name)
        put(parts, f"C{r}", lcsc)
        for j, v in enumerate(pr):
            put(parts, f"{'DEF'[j]}{r}", v, f_input, usd)
        put(parts, f"G{r}", "Yes" if est else "No")
        r += 1
    board_first, board_last = 5, r - 1
    put(parts, f"B{r}", "Board parts, per board", f_bold)
    for col in "DEF":
        c = put(parts, f"{col}{r}", f"=SUM({col}{board_first}:{col}{board_last})", f_bold, usd, total_fill)
        c.border = top_line
    ref["board_total"] = r
    r += 2
    header(parts, r, ["Item", "Part", "", "5-10 units", "100", "1,000", "", "Note"])
    r += 1
    other_rows = {}
    for name, desc, pr, note in OTHER_PARTS:
        put(parts, f"A{r}", name)
        put(parts, f"B{r}", desc)
        for j, v in enumerate(pr):
            put(parts, f"{'DEF'[j]}{r}", v, f_input, usd)
        put(parts, f"H{r}", note, f_note)
        other_rows[name] = r
        r += 1

    def part(tier_col, row):
        return f"Parts!${tier_col}${row}"

    # ---- Prototypes
    widths(proto_ws, [46, 15, 15, 15, 15])
    put(proto_ws, "A1", "Prototype runs, all in", f_title)
    put(proto_ws, "A2", "Edit the quantities in row 4 (blue). Bare-board order prices are on Inputs.", f_note)
    header(proto_ws, 3, ["", "Run A (USD)", "Run A (CAD)", "Run B (USD)", "Run B (CAD)"])
    put(proto_ws, "A4", "Boards in the run", f_bold)
    put(proto_ws, "B4", 5, f_input, "0")
    put(proto_ws, "D4", 10, f_input, "0")
    labels = ["Board parts", "Assembly (solder joints)", "Bare boards (one order)",
              "Assembly setup, stencil, Extended-part fees", "Screens", "Batteries",
              "Cases (printed) and sundries", "Shipping: JLCPCB boards (DHL)",
              "Shipping: screens", "Shipping: batteries", "GST on imports",
              "Courier brokerage"]
    first = 5
    for i, label in enumerate(labels):
        put(proto_ws, f"A{first + i}", label)
    last_goods = first + 9          # rows taxed by GST: first..last_goods
    gst_row, broker_row = first + 10, first + 11
    total_row, each_row = first + 12, first + 13
    put(proto_ws, f"A{total_row}", "Total", f_bold)
    put(proto_ws, f"A{each_row}", "Per prototype", f_bold)
    for ucol, ccol, pcb in (("B", "C", ref["pcb5"]), ("D", "E", ref["pcb10"])):
        n = f"${ucol}$4"
        f = [
            f"={n}*{part('D', ref['board_total'])}",
            f"={n}*({ref['joints']}*{ref['joint_cost']}+{ref['hand_joints']}*{ref['hand_cost']})",
            f"={pcb}",
            f"={ref['setup']}+{ref['stencil']}+{ref['ext_n']}*{ref['ext_fee']}+{ref['hand_setup']}",
            f"={n}*{part('D', other_rows['Screen'])}",
            f"={n}*{part('D', other_rows['Battery'])}",
            f"={n}*({part('D', other_rows['Case'])}+{part('D', other_rows['Sundries'])})",
            f"={ref['ship_jlc']}",
            f"={ref['ship_oled']}",
            f"={ref['ship_bat']}",
            f"={ref['gst']}*SUM({ucol}{first}:{ucol}{last_goods})",
            f"={ref['parcels']}*{ref['broker']}/{ref['fx']}",
        ]
        for i, formula in enumerate(f):
            row = first + i
            linky = formula.count("!") == 1 and not any(op in formula[1:] for op in "+-*/(")
            put(proto_ws, f"{ucol}{row}", formula, f_link if linky else f_norm, usd)
            put(proto_ws, f"{ccol}{row}", f"={ucol}{row}*{ref['fx']}", f_norm, usd)
        for col in (ucol, ccol):
            c = put(proto_ws, f"{col}{total_row}", f"=SUM({col}{first}:{col}{broker_row})", f_bold, usd, total_fill)
            c.border = top_line
            put(proto_ws, f"{col}{each_row}", f"=IFERROR({col}{total_row}/{n},0)", f_bold, usd)
    put(proto_ws, f"A{each_row + 2}",
        "Fixed costs (setup, stencil, Extended-part fees, shipping) are the same for any run size, "
        "which is why 10 boards cost far less than twice 5.", f_note)
    ref["proto"] = (total_row, each_row)

    # ---- Per unit
    widths(unit_ws, [46, 15, 15, 15, 15])
    put(unit_ws, "A1", "Cost of one Lumi at volume", f_title)
    put(unit_ws, "A2", "Uses the 100 and 1,000 price columns on Parts. Edit run sizes in row 4.", f_note)
    header(unit_ws, 3, ["", "100 run (USD)", "100 run (CAD)", "1,000 run (USD)", "1,000 run (CAD)"])
    put(unit_ws, "A4", "Units in the run", f_bold)
    put(unit_ws, "B4", 100, f_input, "#,##0")
    put(unit_ws, "D4", 1000, f_input, "#,##0")
    ulabels = ["Board parts", "Bare board", "Assembly (solder joints)", "Assembly setup and fees, shared",
               "Screen", "Battery", "Case and sundries", "Shipping share", "GST on imports"]
    for i, label in enumerate(ulabels):
        put(unit_ws, f"A{first + i}", label)
    ugst = first + 8
    utotal, urun = first + 9, first + 10
    put(unit_ws, f"A{utotal}", "Per unit", f_bold)
    put(unit_ws, f"A{urun}", "Whole run", f_bold)
    for ucol, ccol, tier, pcb, ship in (("B", "C", "E", ref["pcb100"], ref["ship100"]),
                                        ("D", "E", "F", ref["pcb1000"], ref["ship1000"])):
        n = f"${ucol}$4"
        f = [
            f"={part(tier, ref['board_total'])}",
            f"={pcb}",
            f"={ref['joints']}*{ref['joint_cost']}+{ref['hand_joints']}*{ref['hand_cost']}",
            f"=IFERROR(({ref['vol_setup']}+{ref['stencil']}+{ref['ext_n']}*{ref['ext_fee']}+{ref['hand_setup']})/{n},0)",
            f"={part(tier, other_rows['Screen'])}",
            f"={part(tier, other_rows['Battery'])}",
            f"={part(tier, other_rows['Case'])}+{part(tier, other_rows['Sundries'])}",
            f"={ship}",
            f"={ref['gst']}*SUM({ucol}{first}:{ucol}{ugst - 1})",
        ]
        for i, formula in enumerate(f):
            row = first + i
            linky = formula.count("!") == 1 and not any(op in formula[1:] for op in "+-*/(")
            put(unit_ws, f"{ucol}{row}", formula, f_link if linky else f_norm, usd)
            put(unit_ws, f"{ccol}{row}", f"={ucol}{row}*{ref['fx']}", f_norm, usd)
        for col in (ucol, ccol):
            c = put(unit_ws, f"{col}{utotal}", f"=SUM({col}{first}:{col}{ugst})", f_bold, usd, total_fill)
            c.border = top_line
            put(unit_ws, f"{col}{urun}", f"={col}{utotal}*{n}", f_bold, '$#,##0;($#,##0);"-"')
    ref["unit"] = utotal

    # ---- Full unit cost (CAD)
    widths(full_ws, [52, 16, 16, 44])
    put(full_ws, "A1", "Average unit cost (CAD)", f_title)
    put(full_ws, "A2", "The device cost, packed, plus spares, the Stripe fee and one-time costs spread over the run. "
                       "Blue = edit (packaging here; price, fees and quotes on Inputs).", f_note)
    header(full_ws, 3, ["", "100 run (CAD)", "1,000 run (CAD)", "Note"])
    put(full_ws, "A4", "Units in the run", f_bold)
    put(full_ws, "B4", "='Per unit'!B4", f_link, "#,##0")
    put(full_ws, "C4", "='Per unit'!D4", f_link, "#,##0")
    put(full_ws, "D4", "Set on the Per unit tab.", f_note)
    put(full_ws, "A5", "Device: board, screen, battery, case, import shipping, GST")
    put(full_ws, "B5", f"='Per unit'!C{utotal}", f_link, usd)
    put(full_ws, "C5", f"='Per unit'!E{utotal}", f_link, usd)
    put(full_ws, "D5", "From the Per unit tab.", f_note)
    r = 6
    for name, pr, note in PACKAGING_CAD:
        put(full_ws, f"A{r}", name)
        put(full_ws, f"B{r}", pr[0], f_input, usd)
        put(full_ws, f"C{r}", pr[1], f_input, usd)
        put(full_ws, f"D{r}", f"Estimate; {note}.", f_note)
        r += 1
    spares_row = r
    put(full_ws, f"A{r}", "Spares and failed units")
    for col in "BC":
        put(full_ws, f"{col}{r}", f"={ref['spares']}*{col}5", f_norm, usd)
    put(full_ws, f"D{r}", "Share set on Inputs.", f_note)
    make_row = r + 1
    put(full_ws, f"A{make_row}", "Cost to make and pack", f_bold)
    for col in "BC":
        c = put(full_ws, f"{col}{make_row}", f"=SUM({col}5:{col}{spares_row})", f_bold, usd, total_fill)
        c.border = top_line
    extra = [
        ("Stripe fee on the selling price", lambda col: f"={ref['price']}*{ref['stripe_pct']}+{ref['stripe_fixed']}",
         "Stripe also takes 2.9% of the shipping the customer pays; not counted."),
        ("Prototype run B spread over the run", lambda col: f"=IFERROR(Prototypes!$E${total_row}/{col}$4,0)",
         "The 10-board run's total, from the Prototypes tab."),
        ("Certification spread over the run", lambda col: f"=IFERROR({ref['cert']}/{col}$4,0)", "Lab quote on Inputs."),
        ("One-time tools spread over the run", lambda col: f"=IFERROR({ref['tools']}/{col}$4,0)", "On Inputs."),
    ]
    r = make_row + 1
    for label, formula, note in extra:
        put(full_ws, f"A{r}", label)
        for col in "BC":
            put(full_ws, f"{col}{r}", formula(col), f_norm, usd)
        put(full_ws, f"D{r}", note, f_note)
        r += 1
    auc_row = r
    put(full_ws, f"A{auc_row}", "Average unit cost", f_bold)
    for col in "BC":
        c = put(full_ws, f"{col}{auc_row}", f"={col}{make_row}+SUM({col}{make_row + 1}:{col}{auc_row - 1})",
                f_bold, usd, total_fill)
        c.border = top_line
    put(full_ws, f"A{auc_row + 2}", "Selling price", f_bold)
    put(full_ws, f"A{auc_row + 3}", "Left from each sale", f_bold)
    put(full_ws, f"A{auc_row + 4}", "Margin", f_bold)
    for col in "BC":
        put(full_ws, f"{col}{auc_row + 2}", f"={ref['price']}", f_link, usd)
        put(full_ws, f"{col}{auc_row + 3}", f"={col}{auc_row + 2}-{col}{auc_row}", f_bold, usd)
        put(full_ws, f"{col}{auc_row + 4}", f"=IFERROR({col}{auc_row + 3}/{col}{auc_row + 2},0)", f_bold, "0.0%")
    put(full_ws, f"A{auc_row + 6}", "Shipping isn't here: the customer pays it at checkout. Your time "
                                    "(assembly, testing, packing) and printer time aren't counted.", f_note)

    # ---- Summary
    widths(summary, [40, 16, 16])
    put(summary, "A1", "Lumi PCB v1: budget", f_title)
    put(summary, "A2", f"Prices checked {CHECKED}. Change inputs on the Inputs and Parts tabs; "
                       "everything here updates.", f_note)
    header(summary, 4, ["", "USD", "CAD"])
    srows = [
        ("Prototype run A, all in", f"Prototypes!B{total_row}", f"Prototypes!C{total_row}"),
        ("... per prototype", f"Prototypes!B{each_row}", f"Prototypes!C{each_row}"),
        ("Prototype run B, all in", f"Prototypes!D{total_row}", f"Prototypes!E{total_row}"),
        ("... per prototype", f"Prototypes!D{each_row}", f"Prototypes!E{each_row}"),
        ("One Lumi in a 100 run", f"'Per unit'!B{utotal}", f"'Per unit'!C{utotal}"),
        ("One Lumi in a 1,000 run", f"'Per unit'!D{utotal}", f"'Per unit'!E{utotal}"),
        ("Average unit cost, 100 run", f"'Full unit cost'!B{auc_row}/{ref['fx']}", f"'Full unit cost'!B{auc_row}"),
        ("Average unit cost, 1,000 run", f"'Full unit cost'!C{auc_row}/{ref['fx']}", f"'Full unit cost'!C{auc_row}"),
    ]
    for i, (label, u, c) in enumerate(srows):
        row = 5 + i
        put(summary, f"A{row}", label, f_bold if not label.startswith("...") else f_norm)
        put(summary, f"B{row}", f"={u}", f_link, usd)
        put(summary, f"C{row}", f"={c}", f_link, usd)
    b = 5 + len(srows) + 1
    put(summary, f"A{b}", "Run A boards", f_norm)
    put(summary, f"B{b}", "=Prototypes!B4", f_link, "0")
    put(summary, f"A{b + 1}", "Run B boards", f_norm)
    put(summary, f"B{b + 1}", "=Prototypes!D4", f_link, "0")
    put(summary, f"A{b + 2}", "Exchange rate (CAD per USD)", f_norm)
    put(summary, f"B{b + 2}", f"={ref['fx']}", f_link, "0.00")
    put(summary, f"A{b + 3}", "GST on imports", f_norm)
    put(summary, f"B{b + 3}", f"={ref['gst']}", f_link, "0.0%")
    put(summary, f"A{b + 5}", "Colour key", f_bold)
    put(summary, f"A{b + 6}", "Blue text: an input you can change", f_input)
    put(summary, f"A{b + 7}", "Black text: a formula", f_norm)
    put(summary, f"A{b + 8}", "Green text: a value pulled from another tab", f_link)
    c = put(summary, f"A{b + 9}", "Yellow fill: key assumption", f_norm)
    c.fill = key_fill
    put(summary, f"A{b + 11}", "One Lumi: board built by JLCPCB, screen, battery, printed case, shipping to Canada, GST", f_note)
    put(summary, f"A{b + 12}", "and courier brokerage. Average unit cost adds packaging, spares, Stripe's fee and the", f_note)
    put(summary, f"A{b + 13}", "prototype run. Excludes certification (until a quote is entered on Inputs) and your time.", f_note)

    # ---- Sources
    widths(src_ws, [60, 90])
    put(src_ws, "A1", "Sources", f_title)
    header(src_ws, 3, ["What", "Link"])
    for i, (title, url) in enumerate(SOURCES):
        put(src_ws, f"A{4 + i}", title)
        c = put(src_ws, f"B{4 + i}", url, Font(name=ARIAL, color=BLUE, underline="single"))
        c.hyperlink = url

    for ws in wb.worksheets:
        ws.sheet_view.showGridLines = False
    wb.calculation.fullCalcOnLoad = True  # Excel computes every formula on open
    wb.save(path)


if __name__ == "__main__":
    main()

"""Lumi PCB v1 parts budget: writes BUDGET.md and budget.csv next to this file.

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
    lines += [
        "",
        "These figures include:",
        "- the board, built by JLCPCB,",
        "- the screen, battery and printed case,",
        "- shipping to Canada, GST and courier brokerage.",
        "",
        "They don't include tools, test equipment, certification (FCC/ISED for the finished product, UN38.3 paperwork), packaging, or your time.",
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

    with open(os.path.join(HERE, "BUDGET.md"), "w") as fh:
        fh.write("\n".join(lines))

    with open(os.path.join(HERE, "budget.csv"), "w", newline="") as fh:
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
    for n in (5, 10):
        print(f"{n} prototypes: ${proto[n][1]:.2f} USD (${proto[n][1] * USD_TO_CAD:.2f} CAD)")
    for n in (100, 1000):
        print(f"per unit at {n}: ${vol[n][1]:.2f} USD (${vol[n][1] * USD_TO_CAD:.2f} CAD)")


if __name__ == "__main__":
    main()

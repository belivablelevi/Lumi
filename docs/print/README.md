# Printable personality-odds card

A 4 × 6 in card to put in the box with each Lumi. It shows how likely every
rarity, temperament and look is, so the owner can see how lucky they got.

| Front | Back |
|---|---|
| ![Front](card-front.png) | ![Back](card-back.png) |

Every number comes from the firmware's gene weights, and every face is drawn by
the firmware's own face engine.

## Print it at home

Use [`lumi-odds-card-letter.pdf`](lumi-odds-card-letter.pdf): two cards per Letter sheet.

1. Load card stock: 65–110 lb cover (about 175–300 gsm), or plain paper to try it first.
2. Print with these settings:
   - **Actual size / 100%** (not "Fit to page"),
   - **Double-sided**, **flip on long edge**.
3. Cut on the marks: two cuts across, two down. A paper trimmer gives the cleanest edges.

Before a big run, print one sheet on plain paper and hold it up to a window to
check the backs line up with the fronts. If your printer can't print double-sided,
print page 1, put the sheet back in the tray face down with the top edge going in
first, and print page 2.

## Print shop

Send [`lumi-odds-card.pdf`](lumi-odds-card.pdf):
- 2 pages (front, back),
- 4 × 6 in trim with 0.125 in bleed (4.25 × 6.25 in pages),
- fonts embedded.

Ask for "4 × 6 postcard, double-sided, 14–16 pt card".

## Rebuild it

The card updates itself when the gene weights change. Rebuild it either way:
- **Lumi Studio:** Factory batch tab → **Export odds card…**,
- **Command line:** `python tools/studio/odds_card.py` (needs liblumicore; see [studio.md](../studio.md)).

---

# Birth certificates

A business-card-sized card (3.5 × 2 in) for each unit: its name, serial,
temperament, rarity with its odds, a drawing of its face, and how to wake it and
open its settings. Each one goes in the box with the Lumi that has the same serial.

## Make them

In **Lumi Studio**, open the **Factory batch** tab, make or open a batch, then click
**Export cards…** and choose a folder. You get:
- `lumi-unit-cards-letter.pdf`: the sheets to print, 8 cards per Letter sheet (a page of fronts, then its backs),
  in serial order,
- a PNG per unit, named by serial, and `sheet.png`, an overview of the batch.

## Print them

1. Load card stock: 80–110 lb cover (about 215–300 gsm) prints well on most home
   printers. Matte stock is easier to write on and shows no glare.
2. Print with these settings:
   - **Actual size / 100%** (not "Fit to page"),
   - **Double-sided**, **flip on long edge**.
3. Cut on the marks. There's a small gap between cards, so each card edge has
   its own mark: 8 cuts across and 4 down per sheet. Cut on the marks, not
   halfway between cards.
4. Optional: round the corners with a corner punch.

Test first: print one sheet on plain paper and hold it up to a window, to check
each back lines up with its front. If your printer can't print double-sided,
print the odd pages (fronts), put the stack back face down with the top edge
going in first, and print the even pages (backs).

## Packing

The cards come out in serial order, the same order as the batch manifest. Match
each card's serial to the unit's before it goes in the box, and type its name in
**Lumi(s) packed** on the order page in `/admin`. The name only reaches the
customer in the shipping email if you tick **Name it in the email**.

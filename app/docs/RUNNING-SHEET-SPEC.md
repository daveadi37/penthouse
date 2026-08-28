# The Daily Prayer Running Sheet — authoritative spec

Transcribed verbatim from the two source documents. **This file is the single
source of truth.** Where the app and this file disagree, this file is right.

Source: `OneDrive_1_8-28-2026.zip`
- `2026-08-21_Daily_Running_Sheet.docx` — a completed example (9th day of the Prayer)
- `2026-08-28_Daily_Running_Sheet.docx` — the blank template

---

## 0. Identity

| | |
|---|---|
| Title | **DAILY PRAYER RUNNING SHEET** |
| Address | Goldcrest Views 1, Jumeirah Lakes Towers, Cluster V, Dubai |
| Apartment | **3808** |
| Distribution | Posted to the **3808 Home** WhatsApp group **by 09:00** |
| Checked by | **Earl Tiongco** (fixed — printed on every sheet) |
| Prepared by | blank line, filled in by whoever prepared it |

### Palette taken from the documents

| Token | Hex | Used for |
|---|---|---|
| Section header | `#E8E4DC` | The numbered section bars (1.–6.) |
| Table header | `#F5F3EF` | Every table's header row |
| Rule block | `#F7E9E4` | The FOOD RULE / PRAYER ITEM RULE panel |
| Ink | `#1A1A1A` | Body text |
| Muted | `#5A5A5A` | Secondary text |

Typeface in the source is Calibri at 8pt / 8.5pt / 10pt / 16pt.

---

## 1. Header bar

A single row, six columns:

| Date | Occasion | Meals | Guests | Prayers start | Prayers end |
|---|---|---|---|---|---|
| Friday 21 August 2026 | 9th day of the Prayer | *(blank)* | *(blank)* | 16:00 | 19:30 |

`Occasion` counts the day of a multi-day observance — "9th day of the Prayer".

---

## 2. The rules — reproduce word for word

### FOOD RULE — THIS IS NOT OPTIONAL

> All food today is vegetarian. NO meat. NO fish. NO eggs. Milk, cheese, yoghurt
> and butter are fine. Onion and garlic are fine.
>
> Do not bring meat into the kitchen or the home today. Wash shrine items with the
> shrine sponge only — that sponge never touches meat or normal washing-up.

### PRAYER ITEM RULE — THIS IS NOT OPTIONAL

> Any items brought for prayer (Milk, Yoghurt, Juices, Fruits etc) are to be
> marked and not used for Consumption.

*(Present in the 21 August sheet, absent from the blank template. It belongs on
every sheet.)*

### Standing footer rules

> **IF YOU ARE NOT SURE ABOUT THE SHRINE OR THE PRAYERS — STOP AND ASK ADITYA
> BEFORE YOU DO ANYTHING.**

> Never send this sheet out with the prayer start time or the number of meals left
> blank.

The second is a **hard validation rule**: the app must refuse to mark a sheet as
posted while `prayersStart` or `meals` is empty.

---

## 3. Section 1 — Who is working today

| Who | Job | Hours | What they do |
|---|---|---|---|
| **Rosie** | House staff — in charge of the kitchen | Lives in — on duty until close-down | Runs the kitchen and tells Reza what to do. Makes the salads. Keeps Jagdishbhai's food covered and reheats it. Dusts the shrine, checks the divo and tops it up. |
| **Reza** | Helper (paid hourly) | 14:00 – 22:00 | Helps Rosie in the kitchen. Balconies and outside from 17:00. Looks after guests in the breaks. Keeps Ken away. Helps serve and clear up. |
| **Jagdishbhai** | Cook — afternoon | 15:00 – 17:00 | Cooks sabji, dal, farsan and sweets. Hands his food to Rosie before he leaves, with next week's shopping list. Ensures stock for tomorrow's meal is complete before he leaves. |
| **Hiteshbhai** | Cook — evening | 19:00 – 21:00 | Reheats the food. Makes breads fresh — rotli, bhakhri, paratha, rotla. Shows the others how to lay the table. |
| **Marvin** | House staff | As directed | Buys milk, yoghurt and regular items. Clears clutter with Rosie. Receives guests and deliveries. Posts deliveries on the group. |
| **Aditya** | Looks after the priests; co-ordinates with the chefs on menu and ingredients in advance | All day | Stays with the priests. Passes what they need to Earl or Rosie. Tells Marvin what time prayers will finish so the cook knows when to heat the food. |
| **Earl** | In charge overall | All day | Checks this sheet before it goes out. Ask Earl if anything is unclear. |
| **Shrien** | Owner | — | Owner of the home. Not staff. |

Two further actors appear in the Order of the day but not in this table:

- **Priests** — lead the prayers, the aarti, and hand out prasad.
- **Ken** — the cat. Must be kept away from the prayer area and the open doors.

---

## 4. Section 2 — Order of the day

| Time | What happens | Who |
|---|---|---|
| Morning | Marvin buys the regular items — milk, yoghurt and so on. House and shrine made tidy. All clutter put away. | Marvin / Rosie |
| 09:00 | Prepare a list of anything needed for the day, in case there are regular items to buy. | Rosie |
| 14:00 | Reza arrives. Straight into the kitchen to prepare food with Rosie. | Rosie / Reza |
| 15:00 | Jagdishbhai arrives. Starts the food. | Jagdishbhai |
| By 15:45 | Prayer set-up finished. Mics on and tested. Everything ready for prayers to start. | Earl / Marvin / Aditya |
| 16:00 | PRAYERS BEGIN. They run until about 19:30–20:00, with 2 or 3 breaks. Serve water to everyone at every break. | Priests / Reza |
| 17:00 | Jagdishbhai leaves. Hands his food to Rosie and gives her the shopping list for next week. Stock for tomorrow's meal complete before he leaves. Kitchen is Rosie's until 19:00. | Rosie |
| During prayers | Fill water jugs and glasses. Reza checks cleanliness and restocks toilet paper in the guest toilet every 20 mins. Rosie offers refreshments. Marvin checks Ken is away from the open doors. Aditya stays with the priests. Earl keeps Marvin informed — no messages passed second-hand. | Reza / Aditya / Earl / Rosie |
| 19:00 | Hiteshbhai arrives. Reheats the food and starts the breads. Tell Marvin what time prayers should finish so the breads are timed right. | Rosie / Earl |
| 19:30 – 20:30 | Prayers finish. Aarti, then prasad handed out. | Priests |
| Straight after aarti | Meal served. Hiteshbhai shows Rosie, Marvin and Reza how to lay the table. | Hiteshbhai |
| 21:00 | Hiteshbhai leaves. | Rosie |
| After the meal | Do the Daily Checks in section 6. | Rosie / Reza |
| 22:00 | Reza shift ends. | Rosie |
| Before bed | Check the divo and top it up. Post photos of the set-up and clear-up on the group. Log any cash spent, with receipts. | Rosie |

Note the `Time` column is **not always a clock time** — "Morning", "By 15:45",
"During prayers", "Straight after aarti", "After the meal", "Before bed" are all
valid. The model must allow a free-text label alongside an optional sort time.

---

## 5. Section 3 — Menu

Columns: **Dish | Who makes it | How many | Notes**

The 21 August sheet is headed "Menu (Dinner)"; the template is just "Menu". The
sheet supports a sitting label.

| Dish | Who makes it | How many | Notes |
|---|---|---|---|
| OLO | Jagdishbhai | | |
| KADHI | Jagdishbhai | | |
| KHICHDI | Jagdishbhai | | |
| Rotlo / Bhakhri | Hiteshbhai | | |
| Chutney & Chillies | Jagdishbhai | | |
| Salad 2 types | Rosie | | Rosie is still yet to send the Lunch Menu up to Saturday! |
| Buttermilk | Rosie | | |
| Milk | | | Double Cream |

Blank template: 6 empty rows.

---

## 6. Section 4 — Shopping list

Columns: **Item | How much | In stock? | Who buys**

Standing rows carried on the blank template:

| Item | How much | In stock? | Who buys |
|---|---|---|---|
| Daily items — milk and yoghurt | 2L low-fat fresh milk<br>1kg yoghurt | | Marvin. Mark the containers so prayer items are not used for consumption. Check yoghurt daily — only buy if finished or nearly finished. |
| Oil for the divo | Keep 2 spare | | Marvin — first thing |
| Flowers, incense, matches, wicks | | | Marvin |

---

## 7. Section 5 — Guests

Columns: **Guest name | Arriving | Notes — food they can't eat, seating**

| Guest name | Arriving | Notes |
|---|---|---|
| Mama | - | Prefer sugar-free Tea |

---

## 8. Section 6 — Daily checks — tick each box

Four groups, laid out two-by-two. **Exact items, exact order.**

### SHRINE — before prayers  *(7)*
1. Divo lit and topped up — correct oil only
2. Shoes off before going near the shrine
3. Dusted with the shrine cloth — no sprays, no chemicals
4. Used matchsticks and ash cleared away
5. Statues not moved
6. Area around the shrine clear
7. Matches, wicks and 2 spare bottles of divo oil in stock

### PRAYER SET-UP — finished by 15:45  *(8)*
1. Mats and seating laid out for the number expected
2. Mics on and tested
3. Fresh flowers
4. Incense
5. Prasad made and covered
6. Thali and prayer items laid out
7. Drinking water and clean glasses ready for the breaks
8. Prayer books or sheets out, if being used

### THE HOUSE — before the first guest arrives  *(7)*
1. Dining room, lounge and balcony clear and tidy
2. No cat bowls or cleaning things on show
3. Ken shut away from the prayer area and the open doors
4. Guest toilet spotless and stocked
5. Table laid to standard
6. Rooms aired — no cooking smell in the lounge
7. Lights set warm for the evening

### AFTER THE MEAL — close-down  *(9)*
1. Prayer area cleared and put back
2. Shrine items washed with the shrine sponge only
3. Divo checked and topped up before anyone goes to bed
4. Leftovers covered, labelled and dated
5. All bins emptied
6. Kitchen back to normal
7. Photos of the set-up and clear-up posted on the 3808 Home group
8. Any cash spent logged, with receipts
9. Anything broken, missing or missed — tell Earl the same day

---

## 9. What the documents imply the app must do

Derived requirements, each traceable to a line above.

| # | Requirement | Source |
|---|---|---|
| R1 | A sheet exists per date, with occasion, meals count, guest count, prayer start and end. | Header bar |
| R2 | A sheet cannot be posted with prayer start or meals blank. | Footer rule |
| R3 | The sheet is exported as text for WhatsApp, and printable. | "Posted to the 3808 Home WhatsApp group by 09:00" |
| R4 | It must be ready by 09:00 — so a reminder before then, and a late flag after. | Same |
| R5 | Every sheet carries the food rule and the prayer item rule verbatim. | Rules |
| R6 | Prayer items are marked and excluded from consumption — a flag on stock. | PRAYER ITEM RULE |
| R7 | The shrine sponge and shrine cloth are separate items that never touch meat or chemicals. | Food rule, checks |
| R8 | Divo oil: keep 2 spare. Matches and wicks tracked. | Shopping list, shrine check 7 |
| R9 | Roster per sheet: who is on, their job, their hours, their duties. | Section 1 |
| R10 | Order of the day: ordered rows with a free-text time label and an assignee list. | Section 2 |
| R11 | Menu rows: dish, maker, quantity, notes — with a sitting label. | Section 3 |
| R12 | Shopping rows with an in-stock state and a named buyer. | Section 4 |
| R13 | Guests with arrival and a "can't eat / seating" note. | Section 5 |
| R14 | 31 checks in 4 named groups, tickable, with who ticked and when. | Section 6 |
| R15 | Prayer breaks: water served at every break. | 16:00 row |
| R16 | Guest toilet checked and restocked every 20 minutes during prayers. | During prayers row |
| R17 | Ken is kept away from the prayer area and open doors. | During prayers, house check 3 |
| R18 | Photos of set-up and clear-up posted to the group. | Before bed, close-down check 7 |
| R19 | Cash spent is logged with receipts. | Before bed, close-down check 8 |
| R20 | Anything broken, missing or missed is told to Earl the same day. | Close-down check 9 |
| R21 | Jagdishbhai hands over next week's shopping list and confirms tomorrow's stock before leaving at 17:00. | 17:00 row |
| R22 | Prayers-finish time is passed to Marvin so the breads are timed right. | 19:00 row |
| R23 | Earl checks the sheet before it goes out; prepared-by is recorded. | Footer |
| R24 | No messages passed second-hand — Earl keeps Marvin informed directly. | During prayers row |

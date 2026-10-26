# Living with Lumi

Lumi has no buttons. Everything is done by touching and moving it.

## Gestures

| Do this | Lumi… |
|---|---|
| **Pat** it (a light tap on the shell or screen) | giggles, purrs, blushes or does a little hop. Mood goes up. |
| **Double pat** | heart eyes or star eyes |
| **Pat it 6+ times in a few seconds** | gets annoyed. Mood goes down a little. |
| **Shake** it | dizzy spiral eyes, gets scared or grumpy. Mood goes down. |
| **Drop** it (free-fall) | screams, then sees stars |
| **Tilt** it left or right | eyes roll toward the low side, "whoa" |
| **Turn it upside down** | panics. Hold it there ~1.5 s to open the menu (below). |
| **Pick it up** after it's been resting | surprised, then says hi |
| **Put it down** | settles in contentedly |
| **Lay it face-down** for ~2.5 s | goes straight to sleep |
| **Leave it alone** | idles: looks around, hums, yawns, daydreams, side-eyes you, peeks off-screen… After ~45 s untouched (or 2 min ignored) it yawns and falls asleep. |

Asleep, the screen is off and the ESP32-C3 is in deep sleep. The
accelerometer keeps watch and wakes Lumi when it's picked up. If it was
woken by motion but nobody plays with it within 20 s (say it's just
bouncing around in a bag), it goes back to sleep.

## Mood

Lumi tracks **happiness** and **energy**, and they survive sleep.

- Pats raise happiness. Shaking, dropping and pat-spam lower it. Winning a
  Boop Pong match is a big boost, and even losing one is fun.
- Energy drains while awake and recharges while asleep.
- The resting face follows mood: happy crescent eyes when it's content,
  droopy eyes when it's sad, half-closed lids when it's tired.
- Which animation plays depends on mood too. A cheerful Lumi giggles at a
  pat; a grumpy one pouts first. Long neglect makes it lonely, and it may
  cry when it wakes up.

## The menu

1. Turn Lumi **upside down** and hold it for about 1.5 s. The screen flips
   to say *"flip me back for the MENU"*.
2. Turn it back upright. The menu opens.
3. **Tilt right** for the next item, **tilt left** for the previous one,
   returning to upright between tilts.
4. **Pat** to choose. **Shake** to close (it also closes by itself after 10 s).

| Item | What it does |
|---|---|
| **PONG** | Boop Pong (below) |
| **BATTERY** | Charge level, voltage, lifetime pats and match wins |
| **UPDATE** | Wi-Fi firmware update (below) |
| **SLEEP** | Go to sleep now |
| **BACK** | Close the menu |

## Boop Pong (2 players)

Classic Pong between two Lumis. Each screen is your half of the table, with
your paddle along the bottom.

1. Both players pick **PONG** from the menu within ~20 s of each other.
   The two Lumis find each other over ESP-NOW (no Wi-Fi network needed, and
   the range is tens of metres).
2. **Tilt Lumi to move your paddle**, like turning the knob on the old Pong
   machine. Right side down slides it right; about 30° of tilt reaches the
   edge of the screen.
3. One Lumi serves. The ball flies up off its screen and drops onto the
   other Lumi's screen from the top.
4. Get your paddle under the ball and it bounces back to your pal.
   - Where it hits sets the angle: the centre sends it straight back, the
     edges send it off sideways, bouncing off the walls.
   - Every return is a little faster, so long rallies get hard.
   - **Pat** Lumi just as the ball meets the paddle for a **SMASH**: it goes
     back much faster. Patting is optional; it never loses you a point.
5. Miss the ball and your pal scores. Whoever lost the point serves the next
   one. First to **5 points** wins.

Shake to back out while still searching. If the other Lumi disappears
mid-match, yours notices after a few seconds and goes home.

## Updating the firmware over Wi-Fi

New animations come as firmware updates. Pick **UPDATE** in the menu, then:

1. Lumi shows a Wi-Fi name (`Lumi-XXXX`) and a fresh 8-digit password.
   Join that network from your phone or laptop.
2. Open `http://192.168.4.1` and choose the `.bin` file:
   - PlatformIO: `firmware/.pio/build/xiao_esp32c3/firmware.bin`
   - arduino-cli script: `build/arduino/out/Lumi.ino.bin`
3. Press **Install**. Lumi shows a progress bar and restarts on the new
   firmware. A failed or interrupted upload leaves the old firmware running.

Shake to cancel. Update mode closes by itself after 5 minutes.

## Serial console

Plug in USB and open a serial monitor at 115200 baud
(`pio device monitor`). Commands:

| Command | |
|---|---|
| `i` | live accelerometer + detected orientation (use it to check IMU mounting) |
| `a` | list all animations |
| `p <name>` | play an animation, e.g. `p double_pat_hearts` |
| `m` | mood, energy, lifetime stats |
| `b` | battery voltage |
| `s` | sleep now |

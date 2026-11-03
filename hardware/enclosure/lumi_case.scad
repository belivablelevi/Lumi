// Lumi keychain case - parametric, two parts that snap together. Only the keyring tab needs support.
//
//   openscad -D 'part="front"' -o front.stl lumi_case.scad
//   openscad -D 'part="back"'  -o back.stl  lumi_case.scad
//   openscad -D 'part="assembly"' lumi_case.scad     (preview with parts)
//   openscad -D 'part="fit_check"' -o check.stl lumi_case.scad
//       (case material that hits a part or the other half; "object is empty" means it all fits)
//
// Coordinates: X = across the screen, Y = up towards the keyring,
// Z = 0 at the front face, positive into the case.
// Print both parts face-down (front: screen side on the bed; back: outside
// on the bed). Glitter / "galaxy" PLA or PETG gives the sparkly shell look.

part = "assembly";  // front | back | assembly | print | fit_check
// Which controller board:
//   "xiao"      Seeed XIAO ESP32C3 (built-in charger)
//   "s3"        ESP32-S3 SuperMini with built-in charger (BAT+/BAT- pads)
//   "s3_tp4056" ESP32-S3 SuperMini without a charger, plus a TP4056 USB-C
//               charger board in its own layer (case gets deeper and has a
//               second USB-C opening on the left for charging)
board = "xiao";
has_charger_board = board == "s3_tp4056";

/* [Outer shell] */
W = 35;            // width  (X)
H = 37;            // height (Y)
corner_r = 6;      // corner radius seen from the front (inside corners must clear the square battery)
edge_r = 2.4;      // rounding of the front and back edges
wall = 1.4;
lip = 2.2;         // depth of the overlapping lip (the snap hooks sit inside it)
lip_t = 0.75;      // lip wall thickness
fit = 0.15;        // clearance per side for the lip (tune for your printer)

/* [Display: 0.96in SSD1306 module, 4-pin I2C] */
oled_pcb = [27.4, 27.8, 1.2];
oled_glass = [26.7, 19.3, 1.5];
oled_glass_offset_y = -1.6;   // glass centre relative to PCB centre (pins at top)
oled_back = 1.2;              // parts on the back of the module
oled_top_z = wall + oled_glass[2] + oled_pcb[2];  // back of the module's PCB
view = [22.8, 12.0];          // window; active area is 21.7 x 10.9 mm
view_offset_y = -0.6;         // window centre relative to PCB centre
window_chamfer = 0.8;
screen_offset_y = -1.2;       // whole display shifted down a bit from case centre
mount_top = oled_top_z + 0.6; // top of the display pocket's walls

/* [Electronics: each layer gets room for its solder joints, wires and Kapton] */
xiao = board == "xiao" ? [21.0, 17.8, 1.2]   // Seeed XIAO ESP32C3 PCB (USB-C on the +X end)
                       : [22.6, 18.0, 1.2];  // ESP32-S3 SuperMini PCB
xiao_tall = 3.2;              // USB-C and shield above the PCB
xiao_y = 3.5;                 // centre of the XIAO in Y (clears the inner corner fillet)
xiao_z = oled_top_z + 2.2;    // front of the XIAO PCB: the OLED's back parts, wires and battery pads
xiao_x = W / 2 - wall - xiao[0] / 2 - 0.3;
usb = [9.4, 3.6];             // USB-C opening (Y height x Z thickness of the plug face)
usb_z = xiao_z + xiao[2] + xiao_tall / 2;  // centre of the USB-C receptacle in Z
imu = [20.5, 15.5, 2.6];      // GY-521 MPU-6050 board, no header, lies behind the XIAO
imu_z = xiao_z + xiao[2] + xiao_tall + 1.3;  // room for the IMU's solder joints and Kapton
charger = [27.0, 17.2, 1.6];  // TP4056 USB-C charger board (s3_tp4056 only); USB-C on its -X end
charger_z = imu_z + imu[2] + 0.4;
charger_usb_z = charger_z + charger[2] + 1.6;
battery = [30.2, 30.2, 5.4];  // 503030 LiPo pouch (nominal 30 x 30 x 5 mm)
foam = 0.6;                   // foam tape behind the battery

// Front and back meet just far enough forward that the whole lip stays in front of
// the battery, so the battery's square corners don't have to fit inside the lip.
split_z = has_charger_board ? charger_usb_z + (usb[1] + 0.6) / 2 + 0.2 : 13.8;
battery_z = split_z + lip + 0.1;
D = battery_z + battery[2] + foam + wall;  // total depth (Z): display | board | IMU | (charger) | battery

/* [Snap joint: four hooks on the front part click into grooves in the back part] */
snap_x = 6.5;      // hook centres, either side of the middle, on the top and bottom walls
snap_w = 6;        // hook width
snap_t = 1.2;      // arm thickness
snap_len = 9;      // free length of the arm below the split line
snap_gap = 0.4;    // between the arm and the wall (any less and the slicer may fuse them)
snap_catch = 0.35; // how far the hook reaches into the back wall
snap_flat = 0.2;   // flat on the hook's nose
snap_depth = snap_catch + 0.1;  // groove depth; leaves 0.95 mm of wall behind it
snap_clear = 0.1;  // play in the closed joint, so the seam can close fully
snap_lift = 0.4;   // the hook starts this far above the split line
inner_y = H / 2 - wall;
arm_y = inner_y - snap_gap;  // outer face of the arm
hook_rise = snap_gap + snap_catch;
hook_top = split_z + snap_lift + 2 * hook_rise + snap_flat;
snap_flex = snap_catch + 0.05;  // how far the hook bends inward as the back goes on
assert(hook_top <= split_z + lip, "the hooks must stay inside the lip");
assert(hook_top < battery_z, "the hooks must stay in front of the battery");
assert(wall - snap_depth >= 0.9, "the groove leaves too little wall");
assert(arm_y - snap_t - snap_flex > battery[1] / 2 || hook_top < battery_z, "the arm can't flex past the battery");

/* [Keyring bail] */
bail_w = 10;
bail_h = 7.5;      // how far it sticks out above the case
bail_t = 4;        // thickness front-to-back
bail_hole = 3.4;
bail_z = D / 2 - bail_t / 2;  // front of the tab: centred on the top, wholly in the front part
assert(bail_z + bail_t < split_z, "the keyring tab must stay in the front part");

$fn = 48;

module rounded_rect(w, h, r) {
  offset(r) square([w - 2 * r, h - 2 * r], center = true);
}

// Box with rounded corners and rounded front/back edges.
module shell_solid(w, h, d, r, er) {
  hull() {
    for (sx = [-1, 1], sy = [-1, 1])
      translate([sx * (w / 2 - r), sy * (h / 2 - r), 0]) {
        translate([0, 0, er]) rotate_extrude() translate([r - er, 0]) circle(er);
        translate([0, 0, d - er]) rotate_extrude() translate([r - er, 0]) circle(er);
      }
  }
}

module inner_cavity() {
  translate([0, 0, wall])
    shell_solid(W - 2 * wall, H - 2 * wall, D - 2 * wall, corner_r - wall, max(edge_r - wall, 0.4));
}

// A (y, z) outline run across the X range centred on x, on the +Y wall or mirrored to the -Y wall.
module on_wall(x, w, sy) {
  mirror([0, sy < 0 ? 1 : 0, 0]) translate([x - w / 2, 0, 0])
    rotate([90, 0, 90]) linear_extrude(w) children();
}

// Flat tab centred on top of the case; the split ring goes through front-to-back.
// It stands clear of the build plate, so give it support from the plate when printing.
module bail() {
  difference() {
    translate([0, 0, bail_z]) hull() {
      translate([-bail_w / 2, H / 2 - 3, 0]) cube([bail_w, 1, bail_t]);
      translate([0, H / 2 + bail_h - bail_w / 2, 0]) cylinder(d = bail_w, h = bail_t);
    }
    translate([0, H / 2 + bail_h - bail_w / 2, bail_z - 1]) cylinder(d = bail_hole, h = bail_t + 2);
    inner_cavity();
  }
}

module usb_cut(length) {
  translate([W / 2 - wall / 2, xiao_y, usb_z]) rotate([0, 90, 0])
    linear_extrude(length, center = true) rounded_rect(usb[1] + 0.6, usb[0] + 0.6, (usb[1] + 0.6) / 2 - 0.01);
}

module whole_case() {
  difference() {
    union() {
      shell_solid(W, H, D, corner_r, edge_r);
      bail();
    }
    inner_cavity();
    // display window, chamfered on the outside
    translate([0, screen_offset_y + view_offset_y, 0]) {
      translate([0, 0, -0.01]) linear_extrude(wall + 0.02) rounded_rect(view[0], view[1], 1.2);
      translate([0, 0, -0.01]) linear_extrude(window_chamfer, scale = [view[0] / (view[0] + 2 * window_chamfer), view[1] / (view[1] + 2 * window_chamfer)])
        rounded_rect(view[0] + 2 * window_chamfer, view[1] + 2 * window_chamfer, 1.6);
    }
    // USB-C opening on the right side
    usb_cut(wall + 2);
    // charging port of the TP4056 board on the left side
    if (has_charger_board)
      translate([-W / 2 + wall / 2, 0, charger_usb_z]) rotate([0, 90, 0])
        linear_extrude(wall + 2, center = true) rounded_rect(usb[1] + 0.6, usb[0] + 0.6, (usb[1] + 0.6) / 2 - 0.01);
  }
}

// Pocket that holds the display module against the window.
module display_mount() {
  difference() {
    translate([0, 0, wall]) linear_extrude(mount_top - wall)
      difference() {
        rounded_rect(W - 2 * wall + 0.01, H - 2 * wall + 0.01, corner_r - wall);
        translate([0, screen_offset_y]) square([oled_pcb[0] + 0.4, oled_pcb[1] + 0.4], center = true);
      }
    // glass recess
    translate([0, screen_offset_y + oled_glass_offset_y, wall - 0.01])
      linear_extrude(oled_glass[2] + 0.02) square([oled_glass[0] + 0.4, oled_glass[1] + 0.4], center = true);
  }
}

// Holds the controller at its depth, with its USB-C lined up with the opening.
module xiao_seat() {
  // Short rails beside the USB-C end: a ledge under the PCB and a guide past its edges.
  // They stop short of the first solder pads along the board's edges.
  rail_len = 2.4;
  for (sy = [-1, 1])
    translate([W / 2 - wall - rail_len, xiao_y + sy * (xiao[1] / 2 + 0.25) + (sy < 0 ? -1.2 : 0), mount_top])
      cube([rail_len + 0.01, 1.2, xiao_z + xiao[2] + xiao_tall - mount_top]);
  for (sy = [-1, 1])
    translate([W / 2 - wall - rail_len, xiao_y + sy * (xiao[1] / 2 - 0.5) + (sy < 0 ? -1.25 : -0.5), mount_top])
      cube([rail_len + 0.01, 1.75, xiao_z - 0.02 - mount_top]);
  // A stop at the far end takes the push of a USB plug. It grows out of the top wall at
  // 45 degrees, so it needs no support.
  stop_x = xiao_x - xiao[0] / 2 - 0.2 - 1.2;
  stop_top = xiao_z + xiao[2];
  wall_y = screen_offset_y + oled_pcb[1] / 2 + 0.2;
  translate([stop_x, 0, 0]) rotate([90, 0, 90]) linear_extrude(1.2)
    polygon([[wall_y + 0.5, mount_top - 0.5], [wall_y - (stop_top - mount_top), stop_top],
             [H / 2 - wall + 0.01, stop_top], [H / 2 - wall + 0.01, mount_top - 0.5]]);
}

// Two ribs on the left wall: a ledge the IMU's edge rests on, and a fence that stops it sliding.
module imu_seat() {
  ledge_x = -imu[0] / 2 + 1.0;
  fence_x = -imu[0] / 2 - 0.25;
  pocket_x = -oled_pcb[0] / 2 - 0.2;
  fence_top = min(imu_z + imu[2], split_z);  // the back part's wall starts at the split
  for (y = [-5, 5])
    translate([0, y + 0.6, 0]) rotate([90, 0, 0]) linear_extrude(1.2)
      polygon([[-W / 2 + wall - 0.01, mount_top - 0.5], [pocket_x + 0.5, mount_top - 0.5],
               [ledge_x, mount_top - 0.5 + ledge_x - pocket_x - 0.5], [ledge_x, imu_z - 0.02], [fence_x, imu_z - 0.02],
               [fence_x, fence_top], [-W / 2 + wall - 0.01, fence_top]]);
}

// A hook's outline on the +Y wall as (y, z). The arm rises past the split line with the
// hook on its outer face. The hook's lower slope is the catch, at 45 degrees so it prints
// without support and can still be pulled open; the upper slope is the lead-in.
module snap_arm_profile() {
  root_z = split_z - snap_len;
  polygon([[arm_y - snap_t, root_z], [arm_y, root_z], [arm_y, split_z + snap_lift],
           [arm_y + hook_rise, split_z + snap_lift + hook_rise],
           [arm_y + hook_rise, split_z + snap_lift + hook_rise + snap_flat],
           [arm_y, hook_top], [arm_y - snap_t, hook_top]]);
}

// The groove in the back wall that a hook clicks into, as (y, z).
module snap_groove_profile() {
  groove_z = split_z + snap_lift + hook_rise - snap_catch - snap_clear;  // where the catch meets the wall
  polygon([[inner_y - 0.05, groove_z - 0.05], [inner_y + snap_depth, groove_z + snap_depth],
           [inner_y + snap_depth, hook_top + 0.1 - snap_depth], [inner_y - 0.05, hook_top + 0.15]]);
}

module snap_arms() {
  root_z = split_z - snap_len;
  for (x = [-snap_x, snap_x], sy = [-1, 1]) {
    on_wall(x, snap_w, sy) snap_arm_profile();
    // base: fillets the root of the arm, and joins it to the wall when the root is
    // above the display pocket (the deeper charger version)
    on_wall(x, snap_w, sy)
      polygon([[arm_y - snap_t - 0.6, mount_top - 0.5], [arm_y - snap_t - 0.6, root_z - 0.01], [arm_y - snap_t, root_z + 0.6],
               [arm_y, root_z + 0.6], [inner_y + 0.01, root_z + 0.6], [inner_y + 0.01, mount_top - 0.5]]);
  }
}

module snap_grooves() {
  for (x = [-snap_x, snap_x], sy = [-1, 1])
    on_wall(x, snap_w + 0.6, sy) snap_groove_profile();
}

module front_part() {
  difference() {
    union() {
      intersection() {
        whole_case();
        translate([-50, -50, -1]) cube([100, 100, split_z + 1]);
      }
      // lip rising above the split line, inside the wall
      difference() {
        union() {
          translate([0, 0, split_z - 0.01]) linear_extrude(lip)
            difference() {
              rounded_rect(W - 2 * wall - 2 * fit, H - 2 * wall - 2 * fit, corner_r - wall - fit);
              rounded_rect(W - 2 * wall - 2 * lip_t - 2 * fit, H - 2 * wall - 2 * lip_t - 2 * fit, corner_r - wall - lip_t - fit);
            }
          // shelf joining the lip to the wall, sloped at 45 degrees underneath so it needs no support
          difference() {
            translate([0, 0, split_z - lip_t - fit]) linear_extrude(lip_t + fit)
              rounded_rect(W - 2 * wall + 0.02, H - 2 * wall + 0.02, corner_r - wall);
            hull() {
              translate([0, 0, split_z - lip_t - fit - 0.01]) linear_extrude(0.01)
                rounded_rect(W - 2 * wall, H - 2 * wall, corner_r - wall);
              translate([0, 0, split_z + 0.01]) linear_extrude(0.01)
                rounded_rect(W - 2 * wall - 2 * lip_t - 2 * fit, H - 2 * wall - 2 * lip_t - 2 * fit, corner_r - wall - lip_t - fit);
            }
          }
        }
        // the lip stops either side of each hook, so the arm can flex
        for (x = [-snap_x, snap_x], sy = [-1, 1])
          translate([x - snap_w / 2 - 0.6, sy * (H / 4) - H / 4, split_z - lip_t - fit - 1]) cube([snap_w + 1.2, H / 2, lip + lip_t + fit + 2]);
      }
      snap_arms();
      intersection() {
        union() {
          display_mount();
          xiao_seat();
          imu_seat();
        }
        translate([0, 0, wall]) shell_solid(W - 2 * wall + 0.02, H - 2 * wall + 0.02, D, corner_r - wall, 0.5);
      }
    }
    // cable notch in the lip for the battery leads
    translate([-W / 2 + wall - 0.1, 8, split_z]) cube([lip_t + fit + 0.3, 4, lip + 1]);
    // keep the USB openings clear of the seat and the shelf
    usb_cut(wall + 8);
    if (has_charger_board) {
      translate([-W / 2 + wall / 2, 0, charger_usb_z]) rotate([0, 90, 0])
        linear_extrude(wall + 8, center = true) rounded_rect(usb[1] + 0.6, usb[0] + 0.6, (usb[1] + 0.6) / 2 - 0.01);
      // inside the wall the socket's square corners sit level with the shelf, so clear a full rectangle
      translate([-W / 2 + wall - 0.01, -(usb[0] + 0.6) / 2, charger_usb_z - (usb[1] + 0.6) / 2]) cube([8, usb[0] + 0.6, usb[1] + 0.6]);
    }
  }
}

module back_part() {
  difference() {
    intersection() {
      whole_case();
      translate([-50, -50, split_z]) cube([100, 100, D]);
    }
    snap_grooves();
    // a fingernail notch in the seam, for opening the case
    translate([-W / 2 - 0.1, -4, split_z - 0.1]) cube([wall - 0.5 + 0.1, 8, 0.7]);
  }
  // crush ribs keep the battery from rattling
  rib = D - wall - foam - 2;
  for (sx = [-1, 1])
    translate([sx * (battery[0] / 2 + 0.2 + 0.4), 0, (rib + D - wall + 0.01) / 2]) cube([0.8, 10, D - wall + 0.01 - rib], center = true);
  for (sy = [-1, 1])
    translate([0, sy * (battery[1] / 2 + 0.2 + 0.4), (rib + D - wall + 0.01) / 2]) cube([10, 0.8, D - wall + 0.01 - rib], center = true);
}

// Stand-ins for the parts, sized with their solder joints and tallest components.
module components() {
  color("black") translate([0, screen_offset_y, wall + oled_glass[2] + oled_pcb[2] / 2]) cube(oled_pcb, center = true);
  color("#222222") translate([0, screen_offset_y + 3, oled_top_z + oled_back / 2]) cube([20, 8, oled_back], center = true);
  color("#1a1a1a") translate([0, screen_offset_y + oled_glass_offset_y, wall + oled_glass[2] / 2]) cube(oled_glass, center = true);
  color("#3ce6ff") translate([0, screen_offset_y + view_offset_y, wall - 0.06]) cube([21.7, 10.9, 0.1], center = true);
  color("steelblue") translate([xiao_x, xiao_y, xiao_z + xiao[2] / 2]) cube(xiao, center = true);
  color("silver") translate([W / 2 - wall - 3.75, xiao_y, usb_z]) cube([7.4, 8.9, xiao_tall], center = true);
  color("purple") translate([0, 0, imu_z + imu[2] / 2]) cube(imu, center = true);
  if (has_charger_board) {
    color("darkgreen") translate([-W / 2 + wall + charger[0] / 2 + 0.3, 0, charger_z + charger[2] / 2]) cube(charger, center = true);
    color("silver") translate([-W / 2 + wall + 3.75, 0, charger_usb_z]) cube([7.4, 8.9, 3.2], center = true);
  }
  color("orange") translate([0, 0, battery_z + battery[2] / 2]) cube(battery, center = true);
}

if (part == "front") {
  front_part();
} else if (part == "back") {
  // flip so the outside is on the bed
  translate([0, 0, D]) rotate([180, 0, 0]) back_part();
} else if (part == "print") {
  translate([-W / 2 - 4, 0, 0]) front_part();
  translate([W / 2 + 4, 0, D]) rotate([180, 0, 0]) back_part();
} else if (part == "fit_check") {
  // The back sits a hair above its seat, so the two halves resting on each other don't count.
  intersection() { union() { front_part(); translate([0, 0, 0.02]) back_part(); } components(); }
  intersection() { front_part(); translate([0, 0, 0.02]) back_part(); }
} else {
  color("#2b2b33", 0.9) front_part();
  color("#2b2b33", 0.6) translate([0, 0, 6]) back_part();
  components();
}

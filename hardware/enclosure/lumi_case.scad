// Lumi keychain case - parametric, two parts, prints without supports.
//
//   openscad -D 'part="front"' -o front.stl lumi_case.scad
//   openscad -D 'part="back"'  -o back.stl  lumi_case.scad
//   openscad -D 'part="assembly"' lumi_case.scad     (preview with parts)
//
// Coordinates: X = across the screen, Y = up towards the keyring,
// Z = 0 at the front face, positive into the case.
// Print both parts face-down (front: screen side on the bed; back: outside
// on the bed). Glitter / "galaxy" PLA or PETG gives the sparkly shell look.

part = "assembly";  // front | back | assembly | print

/* [Outer shell] */
W = 35;            // width  (X)
H = 37;            // height (Y)
D = 19.5;          // total depth (Z): display | XIAO | IMU | battery
corner_r = 7;      // corner radius seen from the front
edge_r = 2.4;      // rounding of the front and back edges
wall = 1.4;
split_z = 12.4;    // where front and back meet
lip = 1.6;         // depth of the overlapping lip
lip_t = 0.9;       // lip wall thickness
fit = 0.15;        // clearance per side for the lip (tune for your printer)

/* [Display: 0.96in SSD1306 module, 4-pin I2C] */
oled_pcb = [27.4, 27.8, 1.2];
oled_glass = [26.7, 19.3, 1.5];
oled_glass_offset_y = -1.6;   // glass centre relative to PCB centre (pins at top)
view = [22.8, 12.0];          // window; active area is 21.7 x 10.9 mm
view_offset_y = -0.6;         // window centre relative to PCB centre
window_chamfer = 0.8;
screen_offset_y = -1.2;       // whole display shifted down a bit from case centre

/* [Electronics] */
xiao = [21.0, 17.8, 1.2];     // Seeed XIAO ESP32C3 PCB (USB-C on the +X end)
xiao_y = 3.5;                 // centre of the XIAO in Y (clears the inner corner fillet)
xiao_z = 5.1;                 // front of the XIAO PCB (display stack + 1 mm for wires)
usb = [9.4, 3.6];             // USB-C opening (Y height x Z thickness of the plug face)
usb_z = 7.9;                  // centre of the USB-C receptacle in Z
battery = [30.5, 30.5, 5.4];  // 503030 LiPo pouch, 500 mAh
imu = [20.5, 15.5, 2.6];      // GY-521 MPU-6050 board, no header, lies behind the XIAO
imu_z = 9.7;

/* [Keyring bail] */
bail_w = 10;
bail_h = 6.5;      // how far it sticks out above the case
bail_t = 5;        // thickness front-to-back
bail_hole = 3.4;

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

// Flat tab on top of the front half; the split ring goes through front-to-back.
// It starts on the build plate, so it prints without supports.
module bail() {
  difference() {
    hull() {
      translate([-bail_w / 2, H / 2 - 3, 0]) cube([bail_w, 1, bail_t]);
      translate([0, H / 2 + bail_h - bail_w / 2, 0]) cylinder(d = bail_w, h = bail_t);
    }
    translate([0, H / 2 + bail_h - bail_w / 2, -1]) cylinder(d = bail_hole, h = bail_t + 2);
    inner_cavity();
  }
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
    translate([W / 2 - wall / 2, xiao_y, usb_z]) rotate([0, 90, 0])
      linear_extrude(wall + 2, center = true) rounded_rect(usb[1] + 0.6, usb[0] + 0.6, (usb[1] + 0.6) / 2 - 0.01);
  }
}

// Pocket + ledges that hold the display module against the window.
module display_mount() {
  pocket_z = wall + oled_glass[2];
  difference() {
    translate([0, screen_offset_y, wall]) linear_extrude(oled_glass[2] + oled_pcb[2] + 0.6)
      difference() {
        rounded_rect(W - 2 * wall + 0.01, H - 2 * wall + 0.01, corner_r - wall);
        square([oled_pcb[0] + 0.4, oled_pcb[1] + 0.4], center = true);
      }
    // glass recess
    translate([0, screen_offset_y + oled_glass_offset_y, wall - 0.01])
      linear_extrude(oled_glass[2] + 0.02) square([oled_glass[0] + 0.4, oled_glass[1] + 0.4], center = true);
  }
  // two tiny pegs at the bottom of the pocket stop the PCB sliding down
  for (sx = [-1, 1])
    translate([sx * (oled_pcb[0] / 2 - 2), screen_offset_y - oled_pcb[1] / 2 - 0.9, pocket_z])
      cylinder(d = 1.4, h = oled_pcb[2] + 0.6);
}

// Cradle rails that hold the XIAO so its USB-C lines up with the opening.
module xiao_rails() {
  rail_len = 6;
  for (sy = [-1, 1])
    translate([W / 2 - wall - rail_len / 2, xiao_y + sy * (xiao[1] / 2 + 0.6), xiao_z + (split_z - xiao_z) / 2])
      cube([rail_len, 1.2, split_z - xiao_z], center = true);
}

module front_part() {
  difference() {
    union() {
      intersection() {
        whole_case();
        translate([-50, -50, -1]) cube([100, 100, split_z + 1]);
      }
      // lip rising above the split line, inside the wall
      translate([0, 0, split_z - 0.01]) linear_extrude(lip)
        difference() {
          rounded_rect(W - 2 * wall - 2 * fit, H - 2 * wall - 2 * fit, corner_r - wall - fit);
          rounded_rect(W - 2 * wall - 2 * lip_t - 2 * fit, H - 2 * wall - 2 * lip_t - 2 * fit, corner_r - wall - lip_t - fit);
        }
      intersection() {
        union() {
          display_mount();
          xiao_rails();
        }
        translate([0, 0, wall]) shell_solid(W - 2 * wall + 0.02, H - 2 * wall + 0.02, D, corner_r - wall, 0.5);
      }
    }
    // cable notch in the lip for the battery leads
    translate([-W / 2 + wall + 3, H / 2 - wall - 8, split_z + lip / 2]) cube([4, 3, lip + 0.1], center = true);
    // keep the USB opening clear of the lip and rails
    translate([W / 2 - wall / 2, xiao_y, usb_z]) rotate([0, 90, 0])
      linear_extrude(wall + 8, center = true) rounded_rect(usb[1] + 0.6, usb[0] + 0.6, (usb[1] + 0.6) / 2 - 0.01);
  }
}

module back_part() {
  difference() {
    intersection() {
      whole_case();
      translate([-50, -50, split_z]) cube([100, 100, D]);
    }
    translate([W / 2 - wall / 2, xiao_y, usb_z]) rotate([0, 90, 0])
      linear_extrude(wall + 8, center = true) rounded_rect(usb[1] + 0.6, usb[0] + 0.6, (usb[1] + 0.6) / 2 - 0.01);
  }
  // two crush ribs keep the battery from rattling
  for (sx = [-1, 1])
    translate([sx * (battery[0] / 2 + 0.4), 0, D - wall - 1.5]) cube([0.8, 10, 3], center = true);
}

// Rough stand-ins for checking fit in the assembly view.
module components() {
  color("black") translate([0, screen_offset_y, wall + oled_glass[2] + oled_pcb[2] / 2]) cube(oled_pcb, center = true);
  color("#1a1a1a") translate([0, screen_offset_y + oled_glass_offset_y, wall + oled_glass[2] / 2]) cube(oled_glass, center = true);
  color("#3ce6ff") translate([0, screen_offset_y + view_offset_y, wall - 0.06]) cube([21.7, 10.9, 0.1], center = true);
  color("steelblue") translate([W / 2 - wall - xiao[0] / 2 - 0.3, xiao_y, xiao_z + xiao[2] / 2]) cube(xiao, center = true);
  color("silver") translate([W / 2 - wall - 3.5, xiao_y, usb_z]) cube([7.4, 8.9, 3.2], center = true);
  color("purple") translate([0, 0, imu_z + imu[2] / 2]) cube(imu, center = true);
  color("orange") translate([0, 0, D - wall - battery[2] / 2 - 0.2]) cube(battery, center = true);
}

if (part == "front") {
  front_part();
} else if (part == "back") {
  // flip so the outside is on the bed
  translate([0, 0, D]) rotate([180, 0, 0]) back_part();
} else if (part == "print") {
  translate([-W / 2 - 4, 0, 0]) front_part();
  translate([W / 2 + 4, 0, D]) rotate([180, 0, 0]) back_part();
} else {
  color("#2b2b33", 0.9) front_part();
  color("#2b2b33", 0.6) translate([0, 0, 6]) back_part();
  components();
}

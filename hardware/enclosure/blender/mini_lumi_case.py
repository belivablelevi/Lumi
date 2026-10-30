"""Mini Lumi case for the Lumi PCB, built parametrically in Blender.

It keeps the style of the Mini Lumi 2 desk case
(../alternatives/mini_lumi2/): a chamfered box, a chin with a raised
"Lumi" badge, a screen bezel leaning back 6 degrees, a vented lid. Every
size comes from the PCB references (lumi_pcb_v1_refs.json), so when the
board changes, run this again and the case follows.

    blender --background --python hardware/enclosure/blender/mini_lumi_case.py [-- --previews]

or open it in Blender's Scripting workspace and press Run Script. It
writes, into ../mini_lumi_pcb/:

    mini_lumi_pcb_body.stl   prints as modelled: base on the bed, back open
    mini_lumi_pcb_lid.stl    prints outside face down
    mini_lumi_pcb.blend      case + references, assembled

and stops with an error if the case doesn't pass its checks: every part
closed (manifold), and check_fit.py finding no part that hits the case and
no opening it blocks.

Axes are the references' (millimetres; X right, Z up, -Y toward you; the
board's centre on its front face is the origin).
"""

import json
import math
import os
import runpy
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__)) if "__file__" in globals() else ""
OUT = os.path.join(HERE, "..", "mini_lumi_pcb")

# Design parameters, millimetres.
P = {
    "wall": 2.4,           # side walls
    "floor": 3.0,
    "roof": 3.0,
    "board_gap": 0.3,      # around the board's edges
    "battery_gap": 0.5,    # around the battery
    "bend_gap": 0.4,       # below the screen cable's bend
    "bezel": 1.2,          # bezel thickness at the top (it thickens toward the chin)
    "lean": 6.0,           # bezel lean, degrees
    "window_margin": 1.2,  # window beyond the screen's active area, each side
    "frame_step": 0.6,     # outer step around the window
    "chin_reach": 6.5,     # how far the chin sticks out in front of the bezel's foot
    "chin_top": -9.5,      # chin top, Z (below the window)
    "chamfer": 1.2,        # outside edges
    "lid_rim": 5.0,        # lid rim depth (carries the walls on)
    "lid_plate": 3.0,
    "lip": 1.5,            # lid/body lip joint depth
    "fit": 0.15,           # sliding clearance per side for the lip
    "badge": 0.6,          # raised height of the "Lumi" letters
}


# ---------------------------------------------------------------- helpers

def refs_doc():
    path = os.path.join(HERE, "lumi_pcb_v1_refs.json")
    with open(path) as fh:
        return path, json.load(fh)


def ref_box(doc, prefix):
    for b in doc["boxes"]:
        if b["name"].startswith(prefix):
            return b["min"], b["max"]
    raise KeyError(prefix)


def mesh_box(name, x1, x2, y1, y2, z1, z2, chamfer=0.0, col=None):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=(x2 - x1, y2 - y1, z2 - z1), verts=bm.verts)
    bmesh.ops.translate(bm, vec=((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2), verts=bm.verts)
    if chamfer:
        bmesh.ops.bevel(bm, geom=bm.edges[:], offset=chamfer, segments=1, affect="EDGES",
                        profile=0.5, clamp_overlap=True)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(name, me)
    (col or bpy.context.scene.collection).objects.link(obj)
    return obj


def boolean(target, cutter, op="DIFFERENCE"):
    m = target.modifiers.new(f"{op}-{cutter.name}", "BOOLEAN")
    m.operation = op
    m.solver = "EXACT"
    m.object = cutter
    cutter.hide_set(True)
    cutter.hide_render = True
    return m


def apply_all(obj):
    """Apply the object's modifiers (without bpy.ops, so it works headless)."""
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(obj.evaluated_get(dg))
    # Booleans leave a few near-duplicate vertices; weld them so the STL is tidy.
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
    bmesh.ops.dissolve_degenerate(bm, edges=bm.edges, dist=1e-4)
    bm.to_mesh(me)
    bm.free()
    old = obj.data
    obj.modifiers.clear()
    obj.data = me
    bpy.data.meshes.remove(old)


def remove(*objs):
    for o in objs:
        bpy.data.objects.remove(o, do_unlink=True)


def non_manifold(obj):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bad = sum(1 for e in bm.edges if not e.is_manifold)
    vol = bm.calc_volume(signed=True)
    bm.free()
    return bad, vol


def text_badge(name, text, size, depth, at, col):
    curve = bpy.data.curves.new(name, "FONT")
    curve.body = text
    curve.size = size
    curve.extrude = depth / 2
    curve.align_x = "CENTER"
    curve.align_y = "CENTER"
    tobj = bpy.data.objects.new(name + "-text", curve)
    col.objects.link(tobj)
    tobj.rotation_euler = (math.radians(90), 0, 0)  # face -Y
    tobj.location = at
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(tobj.evaluated_get(dg))
    me.transform(tobj.matrix_world)
    remove(tobj)
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(name, me)
    col.objects.link(obj)
    return obj


# ---------------------------------------------------------------- the case

def build(doc, col):
    p = P
    (bx1, _, bz1), (bx2, by2, bz2) = ref_box(doc, "PCB")
    (gx1, gy1, gz1), (gx2, _, gz2) = ref_box(doc, "OLED glass")
    (ax1, _, az1), (ax2, _, az2) = ref_box(doc, "OLED active area")
    (cx1, _, cz1), _ = ref_box(doc, "OLED cable, bend")
    (tx1, ty1, tz1), (tx2, ty2, tz2) = ref_box(doc, "Battery")
    (_, uy1, uz1), (_, uy2, uz2) = ref_box(doc, "USB-C opening")
    (_, sy1, sz1), (_, sy2, sz2) = ref_box(doc, "Switch lever slot")
    (_, wy1, wz1_), (wx2_, wy2, wz2_) = ref_box(doc, "SW1 ")

    # Inside of the case.
    xi = max(bx2 + p["board_gap"], tx2 + p["battery_gap"])
    zi_lo = min(cz1 - p["bend_gap"], tz1 - p["battery_gap"])
    zi_hi = max(bz2 + p["board_gap"], tz2 + p["battery_gap"])
    yi_front = gy1 - 0.1                       # glass rests on the bezel
    yi_back = ty2 + p["battery_gap"] + 0.5     # room for foam behind the battery

    # Outside.
    xo = xi + p["wall"]
    zo_lo, zo_hi = zi_lo - p["floor"], zi_hi + p["roof"]
    y_face_top = yi_front - p["bezel"]                         # bezel face at the roof
    lean = math.tan(math.radians(p["lean"]))
    y_face_foot = y_face_top - lean * (zo_hi - p["chin_top"])  # bezel face at the chin
    y_chin = y_face_foot - p["chin_reach"]
    y_body_back = yi_back - p["lid_rim"]                        # where the lid meets the body
    y_lid_back = yi_back + p["lid_plate"]
    inset = p["wall"] / 2                                       # lip: half the wall

    # Body: shell + chin, then cut the inside, the leaning face, the window.
    body = mesh_box("Mini Lumi body", -xo, xo, y_chin - 5, y_body_back + p["lip"], zo_lo, zo_hi,
                    chamfer=p["chamfer"], col=col)
    cutters = []

    # Leaning face above the chin: remove everything in front of the plane.
    lean_cut = mesh_box("cut lean", -xo - 5, xo + 5, -40, 0, 0, 80, col=col)
    lean_cut.rotation_euler = (math.radians(-p["lean"]), 0, 0)
    lean_cut.location = (0, y_face_foot, p["chin_top"])
    cutters.append(lean_cut)
    # Chin front.
    cutters.append(mesh_box("cut chin front", -xo - 5, xo + 5, y_chin - 10, y_chin, zo_lo - 5, zo_hi + 5, col=col))
    # Back sleeve of the lip joint: the body keeps only the outer half of its wall there.
    cutters.append(mesh_box("cut lip", -xo + inset, xo - inset, y_body_back, y_body_back + p["lip"] + 1,
                            zo_lo + inset, zo_hi - inset, col=col))
    # Inside (open at the back), plus the hollow inside the chin.
    cutters.append(mesh_box("cut inside", -xi, xi, yi_front, y_body_back + 5, zi_lo, zi_hi, col=col))
    cutters.append(mesh_box("cut chin hollow", -xi, xi, y_chin + p["wall"], yi_front + 0.5,
                            zi_lo, p["chin_top"] - p["wall"], col=col))
    # Window and its outer step.
    wx = max(abs(ax1), abs(ax2)) + p["window_margin"]
    wz1, wz2 = az1 - p["window_margin"], az2 + p["window_margin"]
    cutters.append(mesh_box("cut window", -wx, wx, y_face_foot - 10, yi_front + 0.5, wz1, wz2, col=col))
    st = p["frame_step"]
    # A shallow pocket, st deep, following the leaning face.
    step = mesh_box("cut window step", -wx - st, wx + st, -40, 0,
                    wz1 - st - p["chin_top"], wz2 + st - p["chin_top"], col=col)
    step.rotation_euler = (math.radians(-p["lean"]), 0, 0)
    step.location = (0, y_face_foot + st, p["chin_top"])
    cutters.append(step)

    # USB-C: opening through the left wall and a recess for the plug.
    uc = ((uy1 + uy2) / 2, (uz1 + uz2) / 2)
    cutters.append(mesh_box("cut usb", -xo - 1, -xi + 1.0, uc[0] - 2.4, uc[0] + 2.4,
                            uc[1] - 5.2, uc[1] + 5.2, chamfer=0.8, col=col))
    cutters.append(mesh_box("cut usb recess", -xo - 1, -xo + 1.2, uc[0] - 3.4, uc[0] + 3.4,
                            uc[1] - 6.3, uc[1] + 6.3, chamfer=1.5, col=col))
    # Switch: lever slot through the right wall, and a finger pocket outside.
    sc = ((sy1 + sy2) / 2, (sz1 + sz2) / 2)
    cutters.append(mesh_box("cut switch", xi - 0.5, xo + 1, sy1 - 0.1, sy2 + 0.1,
                            sc[1] - 2.6, sc[1] + 2.6, col=col))
    cutters.append(mesh_box("cut switch pocket", xo - 1.3, xo + 1, sc[0] - 2.4, sc[0] + 2.4,
                            sc[1] - 4.0, sc[1] + 4.0, chamfer=1.0, col=col))
    # The switch body pokes past the board edge into the wall: a pocket on
    # the inside of the wall for it.
    cutters.append(mesh_box("cut switch body", xi - 0.5, wx2_ + 0.25, wy1 - 0.2, wy2 + 0.2,
                            wz1_ - 0.3, wz2_ + 0.3, col=col))
    for c in cutters:
        boolean(body, c)

    # Supports (added after the cuts): ledges for the board's front edges,
    # beside the glass, and posts under its bottom edge. None in the
    # antenna zone.
    adds = []
    ledge_x = gx2 + 0.25
    for s in (-1, 1):
        x1, x2 = sorted((s * ledge_x, s * (xi + 0.2)))
        adds.append(mesh_box(f"ledge {s}", x1, x2, yi_front - 0.2, -0.1, bz1 + 0.5, gz2, col=col))
        x1, x2 = sorted((s * 12.0, s * (xi + 0.2)))
        adds.append(mesh_box(f"post {s}", x1, x2, yi_front - 0.2, by2, zi_lo - 0.2, bz1 - 0.1, col=col))
    for a in adds:
        boolean(body, a, "UNION")

    # Badge on the chin, plus three grooves like the original.
    chin_mid = (zo_lo + p["chin_top"]) / 2
    badge = text_badge("Lumi badge", "Lumi", 6.0, p["badge"] + 0.3,
                       (-3.5, y_chin - (p["badge"] + 0.3) / 2 + 0.3, chin_mid), col)
    boolean(body, badge, "UNION")
    for i in range(3):
        g = mesh_box(f"cut groove {i}", 7.0, 12.5, y_chin - 1, y_chin + 0.5,
                     chin_mid + 1.6 - i * 1.6 - 0.35, chin_mid + 1.6 - i * 1.6 + 0.35, col=col)
        boolean(body, g)
        cutters.append(g)
    apply_all(body)
    remove(*cutters, *adds, badge)

    # Lid: rim carrying the walls on, plate, the inner lip that slides into
    # the body's sleeve, and three vents.
    lid = mesh_box("Mini Lumi lid", -xo, xo, y_body_back + p["lip"], y_lid_back, zo_lo, zo_hi,
                   chamfer=p["chamfer"], col=col)
    # The lip is the band between the inside of the case and the body's
    # sleeve, less the sliding clearance.
    lip = mesh_box("lid lip", -xo + inset + p["fit"], xo - inset - p["fit"], y_body_back + 0.1,
                   y_body_back + p["lip"] + 0.5, zo_lo + inset + p["fit"], zo_hi - inset - p["fit"], col=col)
    lip_hole = mesh_box("lid lip hole", -xi, xi, y_body_back, y_body_back + p["lip"] + 1, zi_lo, zi_hi, col=col)
    lid_inside = mesh_box("cut lid inside", -xi, xi, y_body_back - 1, yi_back, zi_lo, zi_hi, col=col)
    vents = [mesh_box(f"cut vent {i}", -10.5, 10.5, yi_back - 1, y_lid_back + 1,
                      4.0 + 3.0 * i, 6.0 + 3.0 * i, chamfer=0.4, col=col) for i in range(3)]
    lip_ring = lip
    boolean(lip_ring, lip_hole)
    apply_all(lip_ring)
    boolean(lid, lip_ring, "UNION")
    boolean(lid, lid_inside)
    for v in vents:
        boolean(lid, v)
    apply_all(lid)
    remove(lip_ring, lip_hole, lid_inside, *vents)

    sizes = {
        "outside": (round(2 * xo, 2), round(y_lid_back - y_chin + p["badge"], 2), round(zo_hi - zo_lo, 2)),
        "inside": (round(2 * xi, 2), round(yi_back - yi_front, 2), round(zi_hi - zi_lo, 2)),
        "window": (round(2 * wx, 2), round(wz2 - wz1, 2)),
        "lid_offset_y": round(y_body_back, 3),
        "base_z": round(zo_lo, 3),
    }
    return body, lid, sizes


# ---------------------------------------------------------------- run

def export_stl(obj, path, matrix):
    me = obj.data.copy()
    me.transform(matrix)
    tmp = bpy.data.objects.new(obj.name + " (print)", me)
    bpy.context.scene.collection.objects.link(tmp)
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    tmp.select_set(True)
    bpy.context.view_layer.objects.active = tmp
    bpy.ops.wm.stl_export(filepath=path, export_selected_objects=True, apply_modifiers=True)
    remove(tmp)
    bpy.data.meshes.remove(me)


def render_previews(body, lid):
    """preview_front.png, preview_open.png and preview_exploded.png in OUT."""
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_WORKBENCH"
    shading = scene.display.shading
    shading.light = "STUDIO"
    shading.color_type = "MATERIAL"
    shading.show_cavity = True
    scene.render.resolution_x = scene.render.resolution_y = 900
    mat = bpy.data.materials.get("Mini Lumi plastic") or bpy.data.materials.new("Mini Lumi plastic")
    mat.diffuse_color = (0.80, 0.83, 0.95, 1)
    for obj in (body, lid):
        obj.data.materials.clear()
        obj.data.materials.append(mat)
    cam = bpy.data.objects.get("Mini Lumi camera")
    if cam is None:
        cam = bpy.data.objects.new("Mini Lumi camera", bpy.data.cameras.new("Mini Lumi camera"))
        scene.collection.objects.link(cam)
    scene.camera = cam
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = 62
    cam.data.clip_end = 1000
    target = Vector((0, 2, 0))
    others = [o for o in bpy.data.objects if o.type == "MESH" and o not in (body, lid)]
    saved = {o.name: o.hide_render for o in others}
    views = [
        # name, camera offset, show the board parts, lid pulled back by
        ("front", (-45, -90, 30), True, 0.0),
        ("open", (55, 90, 40), True, None),
        ("exploded", (60, 85, 45), True, 22.0),
    ]
    for name, offset, parts, lid_out in views:
        for o in others:
            kind = o.get("lumi_kind")
            o.hide_render = not parts or kind is None or kind in ("keepout", "clearance", "opening")
        lid.hide_render = lid_out is None
        lid.location.y = lid_out or 0.0
        cam.location = target + Vector(offset)
        cam.rotation_euler = (target - cam.location).to_track_quat("-Z", "Y").to_euler()
        scene.render.filepath = os.path.join(OUT, f"preview_{name}.png")
        bpy.ops.render.render(write_still=True)
    lid.location.y = 0.0
    lid.hide_render = False
    for o in others:
        o.hide_render = saved[o.name]


def main():
    refs = runpy.run_path(os.path.join(HERE, "lumi_refs.py"), run_name="lumi_refs")
    fit = runpy.run_path(os.path.join(HERE, "check_fit.py"), run_name="check_fit")
    path, doc = refs_doc()
    refs["build"](path)
    handle = bpy.data.objects[refs["HANDLE"]]
    handle.matrix_basis = Matrix.Identity(4)  # the case is built around the references' own origin

    case = bpy.data.collections[refs["CASE"]]
    for obj in list(case.all_objects):
        if obj.name.startswith("Mini Lumi"):
            remove(obj)
    body, lid, sizes = build(doc, case)

    problems = []
    for obj in (body, lid):
        bad, vol = non_manifold(obj)
        print(f"{obj.name}: {len(obj.data.polygons)} faces, {bad} non-manifold edges, {vol / 1000:.1f} cm3")
        if bad or vol <= 0:
            problems.append(f"{obj.name} isn't a closed solid ({bad} open edges, volume {vol:.0f})")
    problems += fit["check"](case_name=refs["CASE"])

    os.makedirs(OUT, exist_ok=True)
    # Body prints as modelled, base on the bed; the lid prints outside face down.
    export_stl(body, os.path.join(OUT, "mini_lumi_pcb_body.stl"),
               Matrix.Translation((0, 0, -sizes["base_z"])))
    lid_print = Matrix.Rotation(math.radians(-90), 4, "X")  # outside (+Y) face down onto the bed
    me = lid.data.copy()
    me.transform(lid_print)
    zmin = min(v.co.z for v in me.vertices)
    bpy.data.meshes.remove(me)
    export_stl(lid, os.path.join(OUT, "mini_lumi_pcb_lid.stl"), Matrix.Translation((0, 0, -zmin)) @ lid_print)
    with open(os.path.join(OUT, "sizes.json"), "w") as fh:
        json.dump(sizes, fh, indent=1)
    if "--previews" in sys.argv:
        render_previews(body, lid)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, "mini_lumi_pcb.blend"), compress=True)

    print("Mini Lumi PCB case:", json.dumps(sizes))
    if problems:
        raise SystemExit("Case checks failed:\n  " + "\n  ".join(problems))
    print("Case checks passed.")


if __name__ in ("__main__", "<run_path>"):
    main()

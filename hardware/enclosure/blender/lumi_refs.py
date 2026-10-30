"""Load the Lumi PCB reference parts into Blender, ready to model a case.

In Blender (4.2 or newer): Scripting workspace > Open > this file > Run
Script. Or from a terminal:

    blender --python hardware/enclosure/blender/lumi_refs.py

It sets the scene to millimetres and builds a "Lumi PCB v1 (reference)"
collection from lumi_pcb_v1_refs.json (next to this file): the board, its
parts, the screen glass and cable, the battery, the USB-C and switch
openings, and the antenna keep-out, all parented to one empty, "Lumi PCB v1
origin", so the whole stack can be moved or rotated into place in a case.
An empty "Case" collection is made active for your own modelling. Running
it again rebuilds the references (keeping where the origin was moved to)
and leaves "Case" alone. check_fit.py then checks a case against them.

Axes: X right (seen from the front), Z up toward the keyring, -Y toward
you; front view (numpad 1) shows the face. The board's front face is Y = 0.
"""

import json
import os
import sys

import bpy

REF = "Lumi PCB v1 (reference)"
CASE = "Case"
HANDLE = "Lumi PCB v1 origin"
JSON_NAME = "lumi_pcb_v1_refs.json"

GROUPS = {
    "board": "Board", "module": "Parts", "chip": "Parts", "connector": "Parts",
    "switch": "Parts", "passive": "Parts", "test pad": "Parts", "battery pad": "Parts",
    "screen": "Screen", "screen-active": "Screen", "screen-cable": "Screen",
    "battery": "Battery", "opening": "Openings", "clearance": "Openings",
    "keepout": "Keep-outs",
}
COLOURS = {
    "board": (0.10, 0.35, 0.18, 1), "module": (0.75, 0.75, 0.78, 1), "chip": (0.12, 0.12, 0.12, 1),
    "connector": (0.85, 0.85, 0.85, 1), "switch": (0.25, 0.25, 0.25, 1), "passive": (0.55, 0.42, 0.30, 1),
    "test pad": (0.85, 0.70, 0.25, 1), "battery pad": (0.85, 0.70, 0.25, 1), "screen": (0.05, 0.05, 0.08, 1),
    "screen-active": (0.20, 0.85, 0.95, 1), "screen-cable": (0.90, 0.55, 0.10, 1),
    "battery": (0.30, 0.45, 0.80, 1), "opening": (1.0, 0.5, 0.0, 0.4), "clearance": (1.0, 0.8, 0.3, 0.25),
    "keepout": (1.0, 0.1, 0.1, 0.2),
}
# Shown as wireframes and left out of renders: they're rules, not objects.
GHOSTS = {"opening", "clearance", "keepout"}


def find_json():
    candidates = []
    if "--" in sys.argv:
        candidates += sys.argv[sys.argv.index("--") + 1:]
    here = globals().get("__file__")
    if here:
        candidates.append(os.path.join(os.path.dirname(os.path.abspath(here)), JSON_NAME))
    for text in bpy.data.texts:
        if text.filepath:
            candidates.append(os.path.join(os.path.dirname(bpy.path.abspath(text.filepath)), JSON_NAME))
    if bpy.data.filepath:
        candidates.append(os.path.join(os.path.dirname(bpy.data.filepath), JSON_NAME))
    for c in candidates:
        if os.path.isfile(c):
            return c
    raise FileNotFoundError(f"Can't find {JSON_NAME}; pass its path after --")


def setup_units(scene):
    u = scene.unit_settings
    u.system = "METRIC"
    u.scale_length = 0.001   # 1 Blender unit = 1 mm, so STL exports come out in mm
    u.length_unit = "MILLIMETERS"
    # Small objects: pull the viewport's near clip in so close-ups don't vanish.
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type == "VIEW_3D":
                for space in area.spaces:
                    if space.type == "VIEW_3D":
                        space.clip_start = 0.1
                        space.clip_end = 10000


def collection(name, parent):
    col = bpy.data.collections.get(name) or bpy.data.collections.new(name)
    if col.name not in parent.children:
        parent.children.link(col)
    return col


def material(kind):
    name = f"lumi-ref {kind}"
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    rgba = COLOURS.get(kind, (0.5, 0.5, 0.5, 1))
    mat.diffuse_color = rgba   # solid-mode viewport colour
    tree = getattr(mat, "node_tree", None)
    if tree is None and hasattr(mat, "use_nodes"):
        mat.use_nodes = True
        tree = mat.node_tree
    bsdf = tree.nodes.get("Principled BSDF") if tree else None
    if bsdf:
        bsdf.inputs["Base Color"].default_value = rgba
        bsdf.inputs["Alpha"].default_value = rgba[3]
    return mat


def add_box(b, col, handle):
    (x1, y1, z1), (x2, y2, z2) = b["min"], b["max"]
    verts = [(x, y, z) for x in (x1, x2) for y in (y1, y2) for z in (z1, z2)]
    faces = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)]
    mesh = bpy.data.meshes.new(b["name"])
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(b["name"], mesh)
    obj.parent = handle
    obj.data.materials.append(material(b["kind"]))
    obj["lumi_kind"] = b["kind"]
    if b.get("note"):
        obj["lumi_note"] = b["note"]
    if b["kind"] in GHOSTS:
        obj.display_type = "WIRE"
        obj.show_in_front = True
        obj.hide_render = True
    col.objects.link(obj)
    return obj


def add_outline(name, pts, col, handle):
    verts = [(x, 0.0, z) for x, z in pts]
    edges = [(i, (i + 1) % len(verts)) for i in range(len(verts))]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, edges, [])
    obj = bpy.data.objects.new(name, mesh)
    obj.parent = handle
    obj.hide_render = True
    col.objects.link(obj)
    return obj


def build(path):
    with open(path) as fh:
        doc = json.load(fh)
    scene = bpy.context.scene
    setup_units(scene)

    root = collection(REF, scene.collection)
    # Rebuild: clear the old reference objects (only ours), but keep where
    # the handle was moved to, so a stack placed inside a case stays put.
    old = bpy.data.objects.get(HANDLE)
    keep = old.matrix_basis.copy() if old else None  # no parent, so this is its world placement
    for col in [root, *root.children_recursive]:
        for obj in list(col.objects):
            bpy.data.objects.remove(obj, do_unlink=True)
    # One handle to move or rotate the whole stack into a case design.
    handle = bpy.data.objects.new(HANDLE, None)
    handle.empty_display_type = "ARROWS"
    handle.empty_display_size = 10
    root.objects.link(handle)
    if keep is not None:
        handle.matrix_basis = keep

    groups = {}
    for b in doc["boxes"]:
        g = GROUPS.get(b["kind"], "Parts")
        groups.setdefault(g, collection(g, root))
        add_box(b, groups[g], handle)
    outlines = collection("Today's case outline", root)
    for name, pts in doc["outlines"].items():
        add_outline(name, pts, outlines, handle)
    outlines.hide_render = True

    case = collection(CASE, scene.collection)
    view_layer = bpy.context.view_layer
    for lc in view_layer.layer_collection.children:
        if lc.collection == case:
            view_layer.active_layer_collection = lc

    root["lumi_warnings"] = "\n".join(doc.get("warnings", []))
    print(f"Lumi: loaded {len(doc['boxes'])} reference boxes from {path}")
    for w in doc.get("warnings", []):
        print("  !", w)
    return doc


if __name__ == "__main__":
    build(find_json())

"""Product images of the real Lumi cases, path traced in Blender's Cycles.

    blender --background --python web/scripts/render_products.py
    blender --background --python web/scripts/render_products.py -- --only three-quarter,on-keyring --scale 0.4 --samples 64 --out some/folder

Everything comes from the design files: the case STLs in hardware/enclosure, the
board's reference parts, and the firmware's frames in public/lumi. These are renders
of the CAD model, not photos, and the site labels them that way.

A full run writes public/renders/*.png and src/content/renders.json (the image list,
and where the screen sits in the front shots so the site can play real animations
over it). A run with --only or --out leaves renders.json alone.

Blender axes throughout: X right, Z up, -Y toward the viewer, millimetres.
"""

import json
import math
import os
import sys
import zlib

import bmesh
import bpy
import numpy as np
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
WEB = os.path.dirname(HERE)
ENCLOSURE = os.path.join(WEB, "..", "hardware", "enclosure")

LAVENDER, MINT, PEACH = "#c99be0", "#8fd6b6", "#ffb592"
SCREEN_CYAN = (0.045, 0.871, 1.0)  # #3cf0ff, linear
ACTIVE = (21.7, 10.9)              # OLED active area, mm

SIZE = 2000  # image width in pixels; the keyring shot is 7:8

# The ground shadow is its own render, because the shadow catcher barely registers the big softboxes.
SHADOW_LAMP_AT = (-30, 80, 300)
SHADOW_LAMP_SIZE = 200
SHADOW_LAMP_POWER = 160000
SHADOW_WORLD = 0.06  # some ambient light, which darkens the floor right where the case touches it
SHADOW_STRENGTH = 0.5
SHADOW_MARGIN = 0.1  # the shadow has faded out by this close to the image's edge

FRONT = {"fov": 16, "live": True}
SIDE = {"fov": 16, "ground": True}
SHOTS = [
    # Front-on: the screen stays dark so the site can play real animations over it. The face points
    # away from the angled softboxes, so these need more exposure to show the shell's true colour.
    {"file": "front-lavender.png", "alt": "Pocket Lumi, front", "color": LAVENDER, "dist": 172, "look": 3.5, "exposure": 0.55, **FRONT},
    {"file": "front-mint.png", "alt": "Pocket Lumi in a mint shell, front", "color": MINT, "dist": 172, "look": 3.5, "exposure": 0.55, **FRONT},
    {"file": "front-peach.png", "alt": "Pocket Lumi in a peach shell, front", "color": PEACH, "dist": 172, "look": 3.5, "exposure": 0.55, **FRONT},
    {"file": "three-quarter.png", "alt": "Pocket Lumi from the side, showing its face", "color": LAVENDER,
     "yaw": -0.62, "rise": 0.2, "dist": 230, "look": 3, "face": ("yotos", "happy"), **SIDE},
    {"file": "usb-side.png", "alt": "Pocket Lumi from the left, showing the USB-C port", "color": LAVENDER,
     "yaw": 1.05, "rise": 0.18, "dist": 230, "look": 3, "face": ("yotos", "neutral"), "no_glare": True, **SIDE},
    {"file": "on-keyring.png", "alt": "Pocket Lumi on a keyring", "color": MINT, "tall": True, "fov": 18,
     "yaw": -0.35, "rise": 0.05, "dist": 260, "look": 10, "ring": True, "face": ("ni", "sleepy")},
    {"file": "trio.png", "alt": "", "color": PEACH, "yaw": 0.5, "rise": 0.2, "dist": 230, "look": 3,
     "face": ("katos", "love"), **SIDE},
    # The Mini Lumi cases: prototype designs that aren't printed yet.
    {"model": "mini-pcb", "file": "mini-pcb-front.png", "alt": "Mini Lumi case for the PCB, front", "color": MINT,
     "dist": 205, "look": 3, "exposure": 0.5, **FRONT},
    {"model": "mini-pcb", "file": "mini-pcb-three-quarter.png", "alt": "Mini Lumi case for the PCB, from the side",
     "color": MINT, "yaw": -0.62, "rise": 0.2, "dist": 250, "look": 3, "face": ("yotos", "happy"), **SIDE},
    {"model": "mini-pcb", "file": "mini-pcb-usb.png", "alt": "Mini Lumi case for the PCB from the left, showing the USB-C port",
     "color": MINT, "yaw": 1.05, "rise": 0.18, "dist": 250, "look": 3, "face": ("ni", "neutral"), "no_glare": True, **SIDE},
    {"model": "mini2", "file": "mini-lumi2-front.png", "alt": "Mini Lumi 2 case, front", "color": PEACH,
     "dist": 190, "look": 0, "exposure": 0.3, "no_glare": True, **FRONT},
    {"model": "mini2", "file": "mini-lumi2-three-quarter.png", "alt": "Mini Lumi 2 case, from the side", "color": PEACH,
     "yaw": -0.62, "rise": 0.2, "dist": 250, "look": 0, "face": ("katos", "happy"), **SIDE},
]


def arg(name, default=None):
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    return argv[argv.index(name) + 1] if name in argv else default


# ---------------------------------------------------------------- firmware frames

def frames(path):
    raw = zlib.decompress(open(path, "rb").read())
    out, prev = [], np.zeros(1024, dtype=np.uint8)
    for i in range(0, len(raw) - 1023, 1024):
        prev = prev ^ np.frombuffer(raw, dtype=np.uint8, count=1024, offset=i)
        out.append(prev)
    return out


def face_pixels(persona, expression):
    """The frame as a 64 x 128 array of lit pixels."""
    lumi = os.path.join(WEB, "public", "lumi")
    manifest = json.load(open(os.path.join(lumi, "manifest.json")))
    frame = frames(os.path.join(lumi, persona, "expressions.lumi"))[manifest["expressions"].index(expression)]
    return np.array([[(frame[(y >> 3) * 128 + x] >> (y & 7)) & 1 for x in range(128)] for y in range(64)], dtype=float)


def blur(a, sigma):
    r = int(sigma * 3)
    kernel = np.exp(-0.5 * (np.arange(-r, r + 1) / sigma) ** 2)
    kernel /= kernel.sum()
    a = np.apply_along_axis(lambda v: np.convolve(v, kernel, mode="same"), 0, a)
    return np.apply_along_axis(lambda v: np.convolve(v, kernel, mode="same"), 1, a)


def draw_face(image, lit):
    """Paint the OLED: square pixels with hairline gaps, and a little glow in the glass."""
    scale = image.size[0] // 128
    grid = np.kron(lit, np.ones((scale, scale)))
    glow = blur(grid, scale * 0.9)
    gaps = np.ones((scale, scale))
    gaps[-1, :] = gaps[:, -1] = 0.35
    value = np.clip(np.kron(lit, gaps) + 0.1 * glow, 0, 1)
    rgba = np.ones((*value.shape, 4), dtype=np.float32)
    rgba[..., :3] = value[..., None] * np.array(SCREEN_CYAN, dtype=np.float32)
    image.pixels.foreach_set(rgba[::-1].ravel())
    image.update()


# ---------------------------------------------------------------- meshes

def load_stl(*parts):
    data = open(os.path.join(ENCLOSURE, *parts), "rb").read()
    count = np.frombuffer(data, dtype="<u4", count=1, offset=80)[0]
    record = np.dtype([("n", "<f4", 3), ("v", "<f4", (3, 3)), ("a", "<u2")])
    return np.frombuffer(data, dtype=record, count=count, offset=84)["v"].astype(np.float64)


def moved(tris, matrix):
    m = np.array(matrix, dtype=np.float64)
    return tris @ m[:3, :3].T + m[:3, 3]


def new_object(name, mesh, parent, material):
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.parent = parent
    if material:
        mesh.materials.append(material)
    return obj


def shell_object(name, tris, parent, material, bevel):
    """A case part: flat faces merged, curves smooth, and a small soft edge on every hard corner."""
    verts, index = np.unique(np.round(tris.reshape(-1, 3), 4), axis=0, return_inverse=True)
    faces = index.reshape(-1, 3)
    faces = faces[(faces[:, 0] != faces[:, 1]) & (faces[:, 1] != faces[:, 2]) & (faces[:, 0] != faces[:, 2])]
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts.tolist(), [], faces.tolist())
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-3)
    bmesh.ops.dissolve_limit(bm, angle_limit=math.radians(0.4), verts=bm.verts, edges=bm.edges)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    me.shade_smooth()
    me.set_sharp_from_angle(angle=math.radians(32))
    obj = new_object(name, me, parent, material)
    mod = obj.modifiers.new("soft edges", "BEVEL")
    mod.limit_method = "ANGLE"
    mod.angle_limit = math.radians(32)
    mod.width = bevel
    mod.segments = 3
    mod.profile = 0.5
    mod.harden_normals = True
    return obj


def quad_y(name, x1, x2, z1, z2, parent, material, matrix=Matrix.Identity(4), y=0.0):
    """A rectangle facing -Y, its UVs running with X and Z."""
    me = bpy.data.meshes.new(name)
    me.from_pydata([(x1, y, z1), (x2, y, z1), (x2, y, z2), (x1, y, z2)], [], [(0, 1, 2, 3)])
    uv = me.uv_layers.new(name="UVMap")
    for loop, co in zip(uv.data, ((0, 0), (1, 0), (1, 1), (0, 1))):
        loop.uv = co
    obj = new_object(name, me, parent, material)
    obj.matrix_parent_inverse = Matrix.Identity(4)
    obj.matrix_basis = matrix
    return obj


def box(name, lo, hi, parent, material):
    (x1, y1, z1), (x2, y2, z2) = lo, hi
    me = bpy.data.meshes.new(name)
    me.from_pydata([(x1, y1, z1), (x2, y1, z1), (x2, y2, z1), (x1, y2, z1),
                    (x1, y1, z2), (x2, y1, z2), (x2, y2, z2), (x1, y2, z2)], [],
                   [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)])
    return new_object(name, me, parent, material)


def stadium(cy, cz, thick, tall, inset=0.0, steps=14):
    """A USB-C outline, long along Z, as (y, z) points."""
    r = thick / 2 - inset
    half = tall / 2 - thick / 2
    out = []
    for sign, start in ((1, 0), (-1, 180)):
        for i in range(steps + 1):
            a = math.radians(start + 180 * i / steps)
            out.append((cy + r * math.cos(a), cz + sign * half + r * math.sin(a)))
    return out


def usb_port(x_face, cy, cz, thick, tall, parent, metal, dark):
    """A USB-C socket opening toward -X: a metal shell, its dark mouth and the tongue inside."""
    wall, depth, back = 0.28, 2.6, 5.0
    outer, inner = stadium(cy, cz, thick, tall), stadium(cy, cz, thick, tall, wall)
    n = len(outer)
    verts, faces = [], []
    for x, loop in ((x_face + back, outer), (x_face, outer), (x_face, inner), (x_face + depth, inner)):
        verts += [(x, y, z) for y, z in loop]
    for ring in range(3):
        for i in range(n):
            j = (i + 1) % n
            faces.append((ring * n + i, ring * n + j, (ring + 1) * n + j, (ring + 1) * n + i))
    faces.append(tuple(range(3 * n, 4 * n)))
    me = bpy.data.meshes.new("USB-C shell")
    me.from_pydata(verts, [], faces)
    me.shade_smooth()
    me.set_sharp_from_angle(angle=math.radians(40))
    shell = new_object("USB-C shell", me, parent, metal)
    me.materials.append(dark)
    me.polygons[-1].material_index = 1
    lo = (x_face + 0.45, cy - 0.35, cz - tall / 2 + thick / 2 + 0.05)
    hi = (x_face + depth, cy + 0.35, cz + tall / 2 - thick / 2 - 0.05)
    return [shell, box("USB-C tongue", lo, hi, parent, dark)]


def split_ring(centre, radius, wire, parent, material):
    """A two-turn split ring in the YZ plane, its cut ends out of sight at the back."""
    curve = bpy.data.curves.new("split ring", "CURVE")
    curve.dimensions = "3D"
    curve.bevel_depth = wire
    curve.bevel_resolution = 6
    curve.use_fill_caps = True
    spline = curve.splines.new("POLY")
    turns, steps = 2.05, 420
    spline.points.add(steps)
    for i, point in enumerate(spline.points):
        t = i / steps
        a = 2 * math.pi * turns * t + math.pi / 2  # the wire is cut at the top, away from the case
        x = centre[0] + (t - 0.5) * turns * wire * 2.05
        point.co = (x, centre[1] + radius * math.cos(a), centre[2] + radius * math.sin(a), 1)
    obj = bpy.data.objects.new("split ring", curve)
    bpy.context.scene.collection.objects.link(obj)
    obj.parent = parent
    curve.materials.append(material)
    for spline in curve.splines:
        spline.use_smooth = True
    return obj


# ---------------------------------------------------------------- materials

def principled(name, base=(0.5, 0.5, 0.5), **inputs):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    node = mat.node_tree.nodes["Principled BSDF"]
    node.inputs["Base Color"].default_value = (*base, 1)
    for key, value in inputs.items():
        node.inputs[key.replace("_", " ")].default_value = value
    return mat


def hex_linear(value):
    channel = [int(value[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return tuple(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in channel)


def plastic_material():
    """Soft matte plastic: a little light inside it, and a very fine moulded grain."""
    mat = principled("shell plastic", Roughness=0.4, Subsurface_Weight=0.1, Subsurface_Scale=0.6, Coat_Weight=0.2, Coat_Roughness=0.28)
    tree = mat.node_tree
    node = tree.nodes["Principled BSDF"]
    node.inputs["Subsurface Radius"].default_value = (1.0, 0.55, 0.4)
    coord = tree.nodes.new("ShaderNodeTexCoord")
    noise = tree.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 11.0
    noise.inputs["Detail"].default_value = 3.0
    bump = tree.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.035
    bump.inputs["Distance"].default_value = 0.08
    tree.links.new(coord.outputs["Object"], noise.inputs["Vector"])
    tree.links.new(noise.outputs["Fac"], bump.inputs["Height"])
    tree.links.new(bump.outputs["Normal"], node.inputs["Normal"])
    return mat


def screen_material(image):
    mat = principled("OLED active area", (0.002, 0.002, 0.003), Roughness=0.07, Specular_IOR_Level=0.35, Emission_Strength=0.0)
    tree = mat.node_tree
    tex = tree.nodes.new("ShaderNodeTexImage")
    tex.image = image
    tex.interpolation = "Closest"
    tree.links.new(tex.outputs["Color"], tree.nodes["Principled BSDF"].inputs["Emission Color"])
    return mat


# ---------------------------------------------------------------- the three cases

def display(root, material, glass_mat, centre, glass, lean=0.0):
    """The panel behind the window: black glass and, just in front, the active area."""
    cx, y, cz = centre["x"], centre["y"], centre["z"]
    matrix = Matrix.Translation((cx, y, cz)) @ Matrix.Rotation(math.radians(-lean), 4, "X")
    gx1, gx2, gz1, gz2 = glass
    quad_y("OLED glass", gx1, gx2, gz1, gz2, root, glass_mat, matrix, y=0.03)
    w, h = ACTIVE[0] / 2, ACTIVE[1] / 2
    return quad_y("OLED active area", -w, w, -h, h, root, material, matrix)


def build_models(shell, screen, glass, metal, dark, steel, board):
    models = {}

    # Pocket Lumi. The SCAD model has Y up and Z into the case, so seen from the front its +X is on the left.
    root = bpy.data.objects.new("pocket", None)
    bpy.context.scene.collection.objects.link(root)
    upright = Matrix(((-1, 0, 0, 0), (0, 0, 1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))
    unprint = Matrix(((1, 0, 0, 0), (0, -1, 0, 0), (0, 0, -1, 19.5), (0, 0, 0, 1)))  # the back part prints flipped
    front = moved(load_stl("stl", "lumi_front.stl"), upright)
    back = moved(moved(load_stl("stl", "lumi_back.stl"), unprint), upright)
    bodies = [shell_object("pocket front", front, root, shell, 0.22), shell_object("pocket back", back, root, shell, 0.22)]
    active = display(root, screen, glass, {"x": 0, "y": 0.9, "z": -1.8}, (-12, 12, -6.7, 6.7))
    extras = usb_port(-16.4, 7.9, 3.5, 3.2, 8.9, root, metal, dark)
    extras.append(box("XIAO board", (-16.4, 5.1, -5.4), (4.6, 6.3, 12.4), root, board))
    # The bail's hole is at y = 21, z = 9.75 in lumi_case.scad; the wire rests against the top of it.
    ring = split_ring((0, 9.75, 21 + 1.7 - 0.65 + 11.5), 11.5, 0.6, root, steel)
    models["pocket"] = {"root": root, "bodies": [front, back], "active": active, "offset": Matrix.Identity(4),
                        "objects": [root, *bodies, active, *extras, root.children[2]], "ring": ring}

    # Mini Lumi for the PCB: the same axes as the board's reference file.
    root = bpy.data.objects.new("mini-pcb", None)
    bpy.context.scene.collection.objects.link(root)
    sizes = json.load(open(os.path.join(ENCLOSURE, "mini_lumi_pcb", "sizes.json")))
    lid_back = sizes["lid_offset_y"] + 8.0  # lid rim + plate (mini_lumi_case.py)
    body = moved(load_stl("mini_lumi_pcb", "mini_lumi_pcb_body.stl"), Matrix.Translation((0, 0, sizes["base_z"])))
    lid = moved(load_stl("mini_lumi_pcb", "mini_lumi_pcb_lid.stl"),
                Matrix(((1, 0, 0, 0), (0, 0, -1, lid_back), (0, 1, 0, 0), (0, 0, 0, 1))))
    bodies = [shell_object("mini body", body, root, shell, 0.16), shell_object("mini lid", lid, root, shell, 0.16)]
    refs = json.load(open(os.path.join(ENCLOSURE, "blender", "lumi_pcb_v1_refs.json")))
    extras = []
    for ref in refs["boxes"]:
        if ref["kind"] in ("board", "module", "chip", "passive", "switch", "battery") or (ref["kind"] == "connector" and not ref["name"].startswith("J1")):
            extras.append(box(ref["name"], ref["min"], ref["max"], root, board if ref["kind"] == "board" else dark))
    by_name = {b["name"]: b for b in refs["boxes"]}
    area = next(b for name, b in by_name.items() if name.startswith("OLED active area"))
    gl = by_name["OLED glass"]
    cz = (area["min"][2] + area["max"][2]) / 2
    active = display(root, screen, glass, {"x": 0, "y": gl["min"][1] - 0.01, "z": cz},
                     (gl["min"][0], gl["max"][0], gl["min"][2] - cz, gl["max"][2] - cz))
    j1 = next(b for name, b in by_name.items() if name.startswith("J1"))
    extras += usb_port(j1["min"][0], (j1["min"][1] + j1["max"][1]) / 2, (j1["min"][2] + j1["max"][2]) / 2,
                       j1["max"][1] - j1["min"][1], j1["max"][2] - j1["min"][2], root, metal, dark)
    models["mini-pcb"] = {"root": root, "bodies": [body, lid], "active": active, "settle": True,
                          "objects": [root, *bodies, active, *extras, *[c for c in root.children if c.name.startswith("OLED glass")]]}

    # Mini Lumi 2: body and lid side by side in one STL; the lid closes 22.65 mm toward -Y.
    root = bpy.data.objects.new("mini2", None)
    bpy.context.scene.collection.objects.link(root)
    tris = load_stl("alternatives", "mini_lumi2", "mini_lumi2.stl")
    mid = tris[:, :, 1].mean(axis=1)
    body, lid = tris[mid < 24], tris[mid >= 24].copy()
    lid[:, :, 1] -= 22.65
    bodies = [shell_object("mini2 body", body, root, shell, 0.16), shell_object("mini2 lid", lid, root, shell, 0.16)]
    active = display(root, screen, glass, {"x": 0.25, "y": -6.0, "z": 24.1}, (-13.1, 13.1, -7.75, 7.75), lean=7)
    models["mini2"] = {"root": root, "bodies": [body, lid], "active": active, "settle": True,
                       "objects": [root, *bodies, active, *[c for c in root.children if c.name.startswith("OLED glass")]]}

    for model in models.values():
        if model.get("settle"):
            points = np.concatenate(model["bodies"]).reshape(-1, 3)
            lo, hi = points.min(axis=0), points.max(axis=0)
            model["offset"] = Matrix.Translation((-(lo[0] + hi[0]) / 2, -(lo[1] + hi[1]) / 2, -21 - lo[2]))
    return models


# ---------------------------------------------------------------- the studio

def emission_material(name, strength, color=(1, 1, 1)):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    tree = mat.node_tree
    tree.nodes.clear()
    out = tree.nodes.new("ShaderNodeOutputMaterial")
    em = tree.nodes.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = (*color, 1)
    em.inputs["Strength"].default_value = strength
    tree.links.new(em.outputs[0], out.inputs[0])
    return mat


def softbox(name, location, width, height, strength, color=(1, 1, 1), target=(0, 0, 5)):
    """A big soft light that shows in reflections but never in the picture."""
    me = bpy.data.meshes.new(name)
    w, h = width / 2, height / 2
    me.from_pydata([(-w, -h, 0), (w, -h, 0), (w, h, 0), (-w, h, 0)], [], [(0, 1, 2, 3)])
    obj = new_object(name, me, None, emission_material(name, strength, color))
    obj.location = location
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = (Vector(location) - Vector(target)).to_track_quat("Z", "Y")
    obj.visible_camera = False
    obj.visible_shadow = False
    return obj


def studio(scene):
    world = bpy.data.worlds.new("studio")
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (1, 1, 1, 1)
    bg.inputs["Strength"].default_value = 0.26
    scene.world = world
    return [
        softbox("key", (-210, -90, 170), 150, 150, 8.0, (1.0, 0.98, 0.95)),
        # High and behind: lights the top edges.
        softbox("top", (-70, 170, 230), 120, 120, 7.0),
        softbox("rim right", (200, 110, 40), 26, 280, 7.0, (0.96, 0.98, 1.0)),
        softbox("rim left", (-210, 90, 20), 22, 240, 5.0, (1.0, 0.97, 0.96)),
        softbox("low fill", (90, -190, -70), 170, 110, 0.55),
        # Lights the faces that look at the camera, from high enough that the screen's glass doesn't mirror it.
        softbox("front", (-40, -300, 190), 300, 170, 2.7, (1.0, 0.99, 0.97)),
    ]


def shadow_lamp(scene):
    """The one soft light of the shadow pass, high and behind so the shadow falls toward the camera."""
    lamp = bpy.data.lights.new("shadow lamp", "AREA")
    lamp.size = SHADOW_LAMP_SIZE
    lamp.energy = SHADOW_LAMP_POWER
    obj = bpy.data.objects.new("shadow lamp", lamp)
    scene.collection.objects.link(obj)
    obj.location = SHADOW_LAMP_AT
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = (Vector(SHADOW_LAMP_AT) - Vector((0, 0, 0))).to_track_quat("Z", "Y")
    obj.hide_render = True
    return obj


def png_pixels(path):
    image = bpy.data.images.load(path)
    image.colorspace_settings.name = "Non-Color"
    width, height = image.size
    pixels = np.empty(width * height * 4, dtype=np.float32)
    image.pixels.foreach_get(pixels)
    bpy.data.images.remove(image)
    return pixels.reshape(height, width, 4)


def add_shadow(beauty, shadow, path):
    """Slides the shadow under the case: black, and as see-through as the pass says."""
    height, width = beauty.shape[:2]
    a = beauty[..., 3:]
    ramp = lambda n: np.clip(np.minimum(np.arange(n), np.arange(n)[::-1]) / (n * SHADOW_MARGIN), 0, 1)
    edges = np.outer(ramp(height), ramp(width))[..., None]
    edges = edges * edges * (3 - 2 * edges)
    alpha = a + shadow[..., 3:] * SHADOW_STRENGTH * edges * (1 - a)
    pixels = np.concatenate([beauty[..., :3] * a / np.maximum(alpha, 1e-6), alpha], axis=2)
    image = bpy.data.images.new("with shadow", width, height, alpha=True)
    image.colorspace_settings.name = "Non-Color"
    image.alpha_mode = "STRAIGHT"
    image.pixels.foreach_set(np.clip(pixels, 0, 1).astype(np.float32).ravel())
    image.filepath_raw = path
    image.file_format = "PNG"
    image.save()
    bpy.data.images.remove(image)


def catcher(name, location, rotation):
    me = bpy.data.meshes.new(name)
    size = 3000
    me.from_pydata([(-size, -size, 0), (size, -size, 0), (size, size, 0), (-size, size, 0)], [], [(0, 1, 2, 3)])
    obj = new_object(name, me, None, None)
    obj.is_shadow_catcher = True
    obj.visible_glossy = False
    obj.location = location
    obj.rotation_euler = rotation
    return obj


def use_gpu(scene):
    prefs = bpy.context.preferences.addons["cycles"].preferences
    for backend in ("OPTIX", "CUDA"):
        try:
            prefs.compute_device_type = backend
        except TypeError:
            continue
        prefs.get_devices()
        devices = [d for d in prefs.devices if d.type == backend]
        if devices:
            for d in prefs.devices:
                d.use = d in devices
            scene.cycles.device = "GPU"
            print("Rendering on", backend, ", ".join(d.name for d in devices))
            return
    print("Rendering on the CPU")


def main():
    only = arg("--only")
    out_dir = os.path.abspath(arg("--out", os.path.join(WEB, "public", "renders")))
    scale = float(arg("--scale", 1.0))
    os.makedirs(out_dir, exist_ok=True)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    use_gpu(scene)
    cycles = scene.cycles
    cycles.samples = int(arg("--samples", 768))
    cycles.use_adaptive_sampling = True
    cycles.adaptive_threshold = 0.006
    cycles.use_denoising = True
    cycles.denoiser = "OPENIMAGEDENOISE"
    cycles.denoising_input_passes = "RGB_ALBEDO_NORMAL"
    cycles.denoising_prefilter = "ACCURATE"
    cycles.max_bounces = 10
    cycles.glossy_bounces = 6
    cycles.sample_clamp_indirect = 4.0
    cycles.use_light_tree = True
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.compression = 100
    scene.render.dither_intensity = 0.4
    scene.view_settings.view_transform = "Khronos PBR Neutral"
    scene.view_settings.look = "None"
    scene.view_settings.exposure = 0.0

    softboxes = studio(scene)
    lamp = shadow_lamp(scene)
    panel = bpy.data.images.new("OLED pixels", 128 * 8, 64 * 8, alpha=False, float_buffer=True)
    panel.colorspace_settings.name = "Non-Color"
    draw_face(panel, np.zeros((64, 128)))
    shell = plastic_material()
    screen = screen_material(panel)
    glass = principled("OLED glass", (0.002, 0.002, 0.003), Roughness=0.08, Specular_IOR_Level=0.35)
    metal = principled("USB-C shell", (0.78, 0.79, 0.81), Metallic=1.0, Roughness=0.26)
    steel = principled("split ring steel", (0.82, 0.83, 0.85), Metallic=1.0, Roughness=0.2)
    dark = principled("dark parts", (0.012, 0.012, 0.014), Roughness=0.45)
    board = principled("board", (0.01, 0.035, 0.022), Roughness=0.4)
    models = build_models(shell, screen, glass, metal, dark, steel, board)

    cam = bpy.data.cameras.new("camera")
    cam.sensor_fit = "VERTICAL"
    cam.clip_start, cam.clip_end = 1, 8000
    camera = bpy.data.objects.new("camera", cam)
    scene.collection.objects.link(camera)
    scene.camera = camera
    ground = catcher("ground", (0, 0, 0), (0, 0, 0))

    shell_base = shell.node_tree.nodes["Principled BSDF"].inputs["Base Color"]
    screen_node = screen.node_tree.nodes["Principled BSDF"]
    listed = []
    for shot in SHOTS:
        width = SIZE
        height = SIZE * 8 // 7 if shot.get("tall") else SIZE
        render = {"src": f"/renders/{shot['file']}", "alt": shot["alt"], "width": width, "height": height, "color": shot["color"]}
        model = models[shot.get("model", "pocket")]
        place = Matrix.Rotation(shot.get("yaw", 0), 4, "Z") @ model["offset"]
        points = np.concatenate(model["bodies"]).reshape(-1, 3)
        across = points @ np.array(place)[0, :3] + np.array(place)[0, 3]
        place = Matrix.Translation((-(across.min() + across.max()) / 2, 0, 0)) @ place  # centred however it's turned
        model["root"].matrix_world = place

        for other in models.values():
            visible = other is model
            for child in other["root"].children_recursive:
                child.hide_render = not visible
        if model.get("ring"):
            model["ring"].hide_render = not shot.get("ring")

        m = np.array(place)
        lowest =(points @ m[:3, :3].T + m[:3, 3])[:, 2].min()
        ground.location.z = lowest - 0.02
        ground.hide_render = not shot.get("ground")

        shell_base.default_value = (*hex_linear(shot["color"]), 1)
        scene.view_settings.exposure = shot.get("exposure", 0.0)
        cam.angle = math.radians(shot["fov"])
        # The case sits level; the camera looks down on it from "rise" radians above.
        rise = shot.get("rise", 0)
        camera.location = (0, -shot["dist"] * math.cos(rise), shot["look"] + shot["dist"] * math.sin(rise))
        camera.rotation_euler = (math.radians(90) - rise, 0, 0)
        scene.render.resolution_x = round(width * scale)
        scene.render.resolution_y = round(height * scale)
        face = shot.get("face")
        draw_face(panel, face_pixels(*face) if face else np.zeros((64, 128)))
        screen_node.inputs["Emission Strength"].default_value = 1.9 if face else 0.0
        # Side-on, the glass would mirror a whole softbox and wash out the face.
        for node in (screen_node, glass.node_tree.nodes["Principled BSDF"]):
            node.inputs["Specular IOR Level"].default_value = 0.0 if shot.get("no_glare") else 0.35
        bpy.context.view_layer.update()

        if shot.get("live"):
            corners = [model["active"].matrix_world @ v.co for v in model["active"].data.vertices]
            view = [world_to_camera_view(scene, camera, c) for c in corners]
            xs, ys = [v.x for v in view], [1 - v.y for v in view]
            render["screen"] = {"left": min(xs), "top": min(ys), "width": max(xs) - min(xs), "height": max(ys) - min(ys)}
        listed.append(render)

        if not only or any(shot["file"].startswith(name) for name in only.split(",")):
            path = os.path.join(out_dir, shot["file"])
            scene.render.filepath = path
            bpy.ops.render.render(write_still=True)
            if shot.get("ground"):
                # The same view again with only the shadow lamp and an unseen case: the picture's alpha is the shadow.
                seen = [o for o in model["root"].children_recursive if not o.hide_render]
                for obj in seen:
                    obj.visible_camera = False
                for obj in softboxes:
                    obj.hide_render = True
                lamp.hide_render = False
                world_strength = scene.world.node_tree.nodes["Background"].inputs["Strength"]
                beauty_world, beauty_samples = world_strength.default_value, cycles.samples
                world_strength.default_value = SHADOW_WORLD
                cycles.samples = max(beauty_samples // 3, 64)
                shadow_path = path + ".shadow.png"
                scene.render.filepath = shadow_path
                bpy.ops.render.render(write_still=True)
                add_shadow(png_pixels(path), png_pixels(shadow_path), path)
                os.remove(shadow_path)
                for obj in seen:
                    obj.visible_camera = True
                for obj in softboxes:
                    obj.hide_render = False
                lamp.hide_render = True
                world_strength.default_value, cycles.samples = beauty_world, beauty_samples
            print("rendered", shot["file"], flush=True)

    if not only and "--out" not in sys.argv:
        with open(os.path.join(WEB, "src", "content", "renders.json"), "w", newline="\n") as fh:
            fh.write(json.dumps(listed, indent=2) + "\n")


main()

"""Render preview pictures of the reference scene (and anything in "Case").

    blender --background --python hardware/enclosure/blender/render_preview.py

Writes preview_front.png and preview_back.png next to this file.
"""

import math
import os
import runpy

import bpy
import mathutils

HERE = os.path.dirname(os.path.abspath(__file__))
ns = runpy.run_path(os.path.join(HERE, "lumi_refs.py"), run_name="lumi_refs")
ns["build"](os.path.join(HERE, ns["JSON_NAME"]))

scene = bpy.context.scene
scene.render.engine = "BLENDER_WORKBENCH"
scene.display.shading.light = "STUDIO"
scene.display.shading.color_type = "MATERIAL"
scene.render.resolution_x, scene.render.resolution_y = 1200, 900
# Show the keep-outs and openings in these pictures too, plus the case;
# leave out anything else (such as Blender's default cube).
for obj in bpy.data.objects:
    if "lumi_kind" in obj:
        obj.hide_render = False
    elif obj.type == "MESH":
        obj.hide_render = not any(c.name == ns["CASE"] for c in obj.users_collection)

cam = bpy.data.objects.get("Lumi preview camera")
if cam is None:
    cam = bpy.data.objects.new("Lumi preview camera", bpy.data.cameras.new("Lumi preview camera"))
    scene.collection.objects.link(cam)
scene.camera = cam
cam.data.type = "ORTHO"
cam.data.ortho_scale = 70
cam.data.clip_end = 1000

VIEWS = {
    "front": (0, -100, 0),        # straight at the face
    "back": (-60, 80, 40),        # three-quarter view of the parts side
}
for name, loc in VIEWS.items():
    cam.location = loc
    aim = mathutils.Vector((0, 3, 0)) - cam.location
    cam.rotation_euler = aim.to_track_quat("-Z", "Y").to_euler()
    if name == "front":
        cam.rotation_euler = (math.radians(90), 0, 0)
    scene.render.filepath = os.path.join(HERE, f"preview_{name}.png")
    bpy.ops.render.render(write_still=True)

"""Check a case design against the Lumi PCB reference parts.

Run it in Blender (Scripting > Open > Run Script) after lumi_refs.py, with
the case's mesh objects in the "Case" collection and the reference stack
moved into place with its "Lumi PCB v1 origin" handle. Or headless:

    blender my_case.blend --background --python hardware/enclosure/blender/check_fit.py

It reports, and turns red in the viewport:
  - parts, the board, the screen and the battery that run into case material;
  - openings (USB-C, switch lever) that the case blocks.
Modifiers are applied for the check, so a Solidify or Boolean counts.

Only surfaces are compared, so a reference box buried entirely inside solid
case material isn't caught; the X-ray view shows those at a glance.
"""

import os
import runpy

import bpy
import bmesh
from mathutils.bvhtree import BVHTree

HERE = os.path.dirname(os.path.abspath(__file__)) if "__file__" in globals() else ""
SOLID = {"board", "module", "chip", "connector", "switch", "passive", "screen",
         "screen-cable", "battery"}
MUST_BE_OPEN = {"opening"}
RED = "lumi-ref COLLISION"


def world_bvh(obj, depsgraph):
    ev = obj.evaluated_get(depsgraph)
    mesh = ev.to_mesh()
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.transform(ev.matrix_world)
    tree = BVHTree.FromBMesh(bm)
    bm.free()
    ev.to_mesh_clear()
    return tree


def red_material():
    mat = bpy.data.materials.get(RED) or bpy.data.materials.new(RED)
    mat.diffuse_color = (1.0, 0.0, 0.2, 1.0)
    return mat


def check(case_name="Case", ref_name=None):
    refs_mod = runpy.run_path(os.path.join(HERE, "lumi_refs.py"), run_name="lumi_refs") if HERE else None
    ref_name = ref_name or (refs_mod["REF"] if refs_mod else "Lumi PCB v1 (reference)")
    if ref_name not in bpy.data.collections and refs_mod:
        refs_mod["build"](os.path.join(HERE, refs_mod["JSON_NAME"]))
    case_col = bpy.data.collections.get(case_name)
    case = [o for o in (case_col.all_objects if case_col else []) if o.type == "MESH"]
    if not case:
        raise RuntimeError(f'Put the case\'s mesh objects in the "{case_name}" collection first')

    dg = bpy.context.evaluated_depsgraph_get()
    case_trees = [(o.name, world_bvh(o, dg)) for o in case]
    problems = []
    for obj in bpy.data.objects:
        kind = obj.get("lumi_kind")
        if kind not in SOLID | MUST_BE_OPEN or obj.type != "MESH":
            continue
        tree = world_bvh(obj, dg)
        hits = [name for name, ct in case_trees if tree.overlap(ct)]
        if not hits:
            continue
        if kind in MUST_BE_OPEN:
            problems.append(f"BLOCKED  {obj.name}: case material in the way ({', '.join(hits)})")
        else:
            problems.append(f"HITS     {obj.name}: runs into {', '.join(hits)}")
        if obj.data.materials:
            obj.data.materials[0] = red_material()
        obj.display_type = "SOLID"

    lines = problems or ["OK: no reference part touches the case, and every opening is clear."]
    report = "\n".join(lines)
    bpy.context.scene["lumi_fit_report"] = report
    print("Lumi fit check:")
    for line in lines:
        print("  " + line)
    return problems


if __name__ == "__main__":
    check()

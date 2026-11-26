"""Blender 5.3 headless & MCP generator for《今晚，亮一盏灯》v5.2 Stardew-3D campus dioramas.

Produces 5 richly detailed architectural GLB files in public/models/:
  1. dorm_highschool.glb  (3x6 = 18 windows, brick quoins, louvered shutters, tiled roof ribs, bike shed, bulletin board)
  2. dorm_university.glb  (4x6 = 24 windows, #17 colonnade capitals, wrought balustrades, copper-piped AC, laundry, cat house, water tower)
  3. dorm_grad.glb        (5x6 = 30 windows, stone pilasters, glass balconies & plants, grand portico, steel-ribbed conservatory)
  4. dorm_staff.glb       (3x4 = 12 wide windows, Tudor half-timber braces, eave rafters, shutters, vines, tea-set table, Yukimi lantern)
  5. campus_grounds.glb   (brick-pier wrought-iron campus fence, 4 wooden benches, crosswalk, tree planters, multi-mass neighbors)

Contracts preserved for src/scene.js:
  - Every interactive pane is strictly named `Window_Glass_<row>_<col>` (row 0 = ground floor)
  - Entrance glass is strictly named `Entrance_Door` with stepped Y clearances (zero Z-fighting)
  - Seasonal snow meshes start with `Season_Snow_`, climbing vines with `Season_Vines_`
  - Tree canopies use `Mat_Leaf_Main` / `Mat_Leaf_Accent`, laundry uses `Mat_Laundry_*`
  - Spinning AC fans start with `AC_Fan_`
  - Foreground boulevard lamp bulbs keep exact coordinates for additive halos (`(-12.2/12.2/-26/26, -7.92, 4.86)`)
  - Static decorative geometry is batched by material to lock 60+ FPS with minimal draw calls.
"""

import argparse
import math
import os
import random
import sys

try:
    import bpy
    import bmesh
    from mathutils import Matrix, Vector
except ImportError:
    bpy = None
    bmesh = None
    Matrix = None
    Vector = None

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT_DIR = os.path.join(REPO_ROOT, 'public', 'models')
COLOR_ATTR = 'Col'


def clamp(v, lo=0.0, hi=1.0):
    return lo if v < lo else hi if v > hi else v


def hash01(x, y, z):
    n = int((x * 127.1 + y * 311.7 + z * 74.7) * 1024.0) & 0xFFFFFFFF
    n = (n ^ 0x9E3779B9) & 0xFFFFFFFF
    n = (n * 2246822519) & 0xFFFFFFFF
    n ^= n >> 13
    n = (n * 3266489917) & 0xFFFFFFFF
    n ^= n >> 16
    return (n & 0xFFFFFF) / float(0xFFFFFF)


def clear_scene():
    if getattr(bpy.app, 'background', False):
        bpy.ops.wm.read_factory_settings(use_empty=True)
        return
    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob, do_unlink=True)
    for col in (bpy.data.meshes, bpy.data.materials, bpy.data.lights, bpy.data.cameras, bpy.data.worlds):
        for item in list(col):
            if item.users == 0:
                col.remove(item)


def make_mat(name, rgb, rough=0.82, metal=0.0, emission=0.0, alpha=1.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = (rgb[0], rgb[1], rgb[2], 1.0)
    bsdf.inputs['Roughness'].default_value = rough
    if 'Metallic' in bsdf.inputs:
        bsdf.inputs['Metallic'].default_value = metal
    if 'Specular IOR Level' in bsdf.inputs:
        bsdf.inputs['Specular IOR Level'].default_value = 0.25
    if emission > 0.0:
        if 'Emission Color' in bsdf.inputs:
            bsdf.inputs['Emission Color'].default_value = (rgb[0], rgb[1], rgb[2], 1.0)
        if 'Emission Strength' in bsdf.inputs:
            bsdf.inputs['Emission Strength'].default_value = emission
    if alpha < 1.0:
        m.blend_method = 'BLEND' if hasattr(m, 'blend_method') else 'HASHED'
        if 'Alpha' in bsdf.inputs:
            bsdf.inputs['Alpha'].default_value = alpha
    return m


def create_material_library():
    return {
        'brick_red': make_mat('Mat_Wall_BrickRed', (0.58, 0.27, 0.22), rough=0.86),
        'brick_warm': make_mat('Mat_Wall_BrickWarm', (0.48, 0.52, 0.62), rough=0.85),
        'stone_grad': make_mat('Mat_Wall_StoneGrad', (0.56, 0.52, 0.48), rough=0.80),
        'plaster_cream': make_mat('Mat_Wall_Plaster', (0.85, 0.80, 0.70), rough=0.88),
        'wing_warm': make_mat('Mat_Wall_Wing', (0.64, 0.58, 0.53), rough=0.86),
        'roof_terracotta': make_mat('Mat_Roof_Terracotta', (0.62, 0.26, 0.19), rough=0.78),
        'roof_slate': make_mat('Mat_Roof_Slate', (0.24, 0.27, 0.36), rough=0.78),
        'roof_moss': make_mat('Mat_Roof_Moss', (0.20, 0.34, 0.27), rough=0.80),
        'wood_warm': make_mat('Mat_Wood_Warm', (0.44, 0.29, 0.18), rough=0.78),
        'wood_green': make_mat('Mat_Wood_Green', (0.21, 0.38, 0.28), rough=0.75),
        'frame_dark': make_mat('Mat_Frame_Dark', (0.16, 0.19, 0.27), rough=0.72),
        'trim_cream': make_mat('Mat_Trim_Cream', (0.82, 0.78, 0.70), rough=0.84),
        'stone_trim': make_mat('Mat_Stone_Trim', (0.72, 0.69, 0.64), rough=0.80),
        'shutter_slate': make_mat('Mat_Shutter_Slate', (0.23, 0.34, 0.41), rough=0.74),
        'metal_dark': make_mat('Mat_Metal_Dark', (0.18, 0.20, 0.25), rough=0.52, metal=0.45),
        'metal_light': make_mat('Mat_Metal_Light', (0.58, 0.61, 0.66), rough=0.45, metal=0.50),
        'brass': make_mat('Mat_Brass', (0.84, 0.66, 0.30), rough=0.34, metal=0.78),
        'copper': make_mat('Mat_Copper', (0.72, 0.40, 0.28), rough=0.46, metal=0.65),
        'glass_dark': make_mat('Mat_Glass_Dark', (0.10, 0.14, 0.22), rough=0.25),
        'glass_rail': make_mat('Mat_Glass_Rail', (0.65, 0.80, 0.92), rough=0.18, alpha=0.42),
        'stone_ground': make_mat('Mat_Ground_Stone', (0.25, 0.27, 0.33), rough=0.82),
        'lawn_grass': make_mat('Mat_Ground_Grass', (0.19, 0.31, 0.24), rough=0.92),
        'cobble': make_mat('Mat_Ground_Cobble', (0.35, 0.34, 0.38), rough=0.76),
        'terracotta': make_mat('Mat_Pot_Terracotta', (0.62, 0.34, 0.25), rough=0.82),
        'leaf_main': make_mat('Mat_Leaf_Main', (0.24, 0.42, 0.28), rough=0.88),
        'leaf_accent': make_mat('Mat_Leaf_Accent', (0.31, 0.50, 0.33), rough=0.88),
        'hedge_leaf': make_mat('Mat_Hedge_Leaf', (0.17, 0.34, 0.22), rough=0.90),
        'trunk': make_mat('Mat_Trunk', (0.28, 0.20, 0.15), rough=0.92),
        'snow_cap': make_mat('Mat_Snow_Cap', (0.90, 0.94, 0.99), rough=0.65),
        'lamp_glow': make_mat('Mat_Lamp_Glow', (1.00, 0.80, 0.45), rough=0.30, emission=2.0),
        'lantern_warm': make_mat('Mat_Lantern_Warm', (1.00, 0.78, 0.42), rough=0.30, emission=1.6),
        'door_glow': make_mat('Mat_Door_Glow', (1.00, 0.72, 0.38), rough=0.40, emission=1.2),
        'laundry_a': make_mat('Mat_Laundry_A', (0.86, 0.46, 0.42), rough=0.90),
        'laundry_b': make_mat('Mat_Laundry_B', (0.54, 0.72, 0.88), rough=0.90),
        'laundry_c': make_mat('Mat_Laundry_C', (0.92, 0.84, 0.62), rough=0.90),
        'cat_orange': make_mat('Mat_Cat_Orange', (0.86, 0.52, 0.24), rough=0.85),
        'board_green': make_mat('Mat_Board_Green', (0.14, 0.28, 0.22), rough=0.88),
        'neighbor': make_mat('Mat_Neighbor_Sil', (0.16, 0.20, 0.30), rough=0.90),
    }


def apply_box_uv(ob, scale=0.35):
    me = ob.data
    if not me.uv_layers:
        me.uv_layers.new(name='UVMap')
    uv_layer = me.uv_layers.active.data
    for poly in me.polygons:
        n = poly.normal
        ax, ay, az = abs(n.x), abs(n.y), abs(n.z)
        for loop_idx in poly.loop_indices:
            v = me.vertices[me.loops[loop_idx].vertex_index].co
            if az >= ax and az >= ay:
                uv_layer[loop_idx].uv = (v.x * scale, v.y * scale)
            elif ax >= ay and ax >= az:
                uv_layer[loop_idx].uv = (v.y * scale, v.z * scale)
            else:
                uv_layer[loop_idx].uv = (v.x * scale, v.z * scale)


def bake_ao(ob, top_z=18.0, half_w=11.0, flat_white=False):
    me = ob.data
    attr = me.color_attributes.get(COLOR_ATTR)
    if attr is None:
        attr = me.color_attributes.new(name=COLOR_ATTR, type='FLOAT_COLOR', domain='POINT')
    data = attr.data
    if flat_white:
        for idx in range(len(me.vertices)):
            data[idx].color = (1.0, 1.0, 1.0, 1.0)
        return
    mw = ob.matrix_basis
    rot = mw.to_3x3()
    for idx, vert in enumerate(me.vertices):
        world = mw @ vert.co
        n = rot @ vert.normal
        nl = n.length
        nz = n.z / nl if nl > 1e-6 else 0.0
        sky = 0.85 + 0.15 * clamp(nz, -1.0, 1.0)
        ground = 0.72 + 0.28 * clamp(world.z / 5.5)
        edge = min(half_w - abs(world.x), top_z - world.z, world.z + 1.2)
        corner = 0.84 + 0.16 * clamp(edge / 2.2)
        jitter = 0.93 + 0.14 * hash01(world.x, world.y, world.z)
        ao = clamp(sky * ground * corner * jitter, 0.50, 1.0)
        data[idx].color = (clamp(ao * 1.02), ao, clamp(ao * 0.97), 1.0)


def finish_mesh(ob, name, mat, bevel=0.0, segments=1, tint=True, top_z=18.0, half_w=11.0):
    ob.name = name
    ob.data.name = name
    if mat is not None:
        ob.data.materials.append(mat)
    if bevel >= 0.014:
        mod = ob.modifiers.new('Bevel', 'BEVEL')
        mod.width = bevel
        mod.segments = segments
        mod.limit_method = 'ANGLE'
        mod.angle_limit = math.radians(48.0)
        mod.use_clamp_overlap = True
        bpy.ops.object.select_all(action='DESELECT')
        ob.select_set(True)
        bpy.context.view_layer.objects.active = ob
        bpy.ops.object.modifier_apply(modifier=mod.name)
    apply_box_uv(ob)
    bake_ao(ob, top_z=top_z, half_w=half_w, flat_white=not tint)
    return ob


def box(name, loc, size, mat, bevel=0.018, segments=1, rot=(0.0, 0.0, 0.0), tint=True, top_z=18.0, half_w=11.0):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0.0, 0.0, 0.0))
    ob = bpy.context.object
    ob.data.transform(Matrix.Diagonal((size[0], size[1], size[2], 1.0)))
    ob.location = loc
    ob.rotation_euler = rot
    return finish_mesh(ob, name, mat, bevel=bevel, segments=segments, tint=tint, top_z=top_z, half_w=half_w)


def cylinder(name, loc, r, depth, mat, verts=12, rot=(0.0, 0.0, 0.0), tint=True, bevel=0.0):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=depth, end_fill_type='NGON', location=(0, 0, 0))
    ob = bpy.context.object
    ob.location = loc
    ob.rotation_euler = rot
    return finish_mesh(ob, name, mat, bevel=bevel, segments=1, tint=tint)


def cone(name, loc, r1, r2, depth, mat, verts=12, rot=(0.0, 0.0, 0.0), tint=True):
    bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r1, radius2=r2, depth=depth, end_fill_type='NGON', location=(0, 0, 0))
    ob = bpy.context.object
    ob.location = loc
    ob.rotation_euler = rot
    return finish_mesh(ob, name, mat, tint=tint)


def ico(name, loc, r, mat, sub=1, scale=(1.0, 1.0, 1.0), tint=True):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=sub, radius=r, location=(0, 0, 0))
    ob = bpy.context.object
    if scale != (1.0, 1.0, 1.0):
        ob.data.transform(Matrix.Diagonal((scale[0], scale[1], scale[2], 1.0)))
    ob.location = loc
    return finish_mesh(ob, name, mat, tint=tint)


def torus(name, loc, r_maj, r_min, mat, rot=(0.0, 0.0, 0.0), seg_maj=14, seg_min=6):
    bpy.ops.mesh.primitive_torus_add(major_radius=r_maj, minor_radius=r_min, major_segments=seg_maj, minor_segments=seg_min)
    ob = bpy.context.object
    ob.location = loc
    ob.rotation_euler = rot
    return finish_mesh(ob, name, mat)


def gable_prism(name, loc, width, depth, ridge_h, mat, bevel=0.02, tint=True):
    """Create a triangular prism pitched roof (ridge running along X)."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    hw = width / 2.0
    hd = depth / 2.0
    v1 = bm.verts.new((-hw, -hd, 0.0))
    v2 = bm.verts.new((hw, -hd, 0.0))
    v3 = bm.verts.new((hw, hd, 0.0))
    v4 = bm.verts.new((-hw, hd, 0.0))
    v5 = bm.verts.new((-hw, 0.0, ridge_h))
    v6 = bm.verts.new((hw, 0.0, ridge_h))
    bm.faces.new((v1, v2, v3, v4))
    bm.faces.new((v1, v2, v6, v5))
    bm.faces.new((v3, v4, v5, v6))
    bm.faces.new((v4, v1, v5))
    bm.faces.new((v2, v3, v6))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    ob.location = loc
    return finish_mesh(ob, name, mat, bevel=bevel, segments=1, tint=tint)


# ------------------------------------------------------------------ Reusable Architectural Helpers

def add_corner_quoins(body_w, body_d, body_h, plinth_h, mat_quoin, mat_band=None, step_h=0.68, water_table=True):
    """Add alternating stone corner quoins and ground water-table molding to break flat box edges."""
    hw = body_w / 2.0
    hd = body_d / 2.0
    if water_table:
        # Split front water-table cleanly around central entrance opening when plinth is low
        if plinth_h < 2.2:
            seg_w = hw - 2.0
            cx = 2.0 + seg_w / 2.0
            box('WaterTable_FL', (-cx, -hd - 0.06, plinth_h + 0.06), (seg_w + 0.45, 0.24, 0.16), mat_band or mat_quoin, bevel=0.02)
            box('WaterTable_FR', (cx, -hd - 0.06, plinth_h + 0.06), (seg_w + 0.45, 0.24, 0.16), mat_band or mat_quoin, bevel=0.02)
        else:
            box('WaterTable_Front', (0, -hd - 0.05, plinth_h + 0.06), (body_w + 0.42, 0.22, 0.16), mat_band or mat_quoin, bevel=0.02)
        box('WaterTable_L', (-hw - 0.05, 0, plinth_h + 0.06), (0.22, body_d + 0.42, 0.16), mat_band or mat_quoin, bevel=0.02)
        box('WaterTable_R', (hw + 0.05, 0, plinth_h + 0.06), (0.22, body_d + 0.42, 0.16), mat_band or mat_quoin, bevel=0.02)

    z = plinth_h + 0.42
    idx = 0
    while z < body_h - 0.48:
        long_x = (idx % 2 == 0)
        qw = 0.50 if long_x else 0.34
        qd = 0.34 if long_x else 0.50
        qh = step_h * 0.72
        for sx in (-1.0, 1.0):
            for sy in (-1.0, 1.0):
                cx = sx * (hw - qw * 0.32)
                cy = sy * (hd - qd * 0.32)
                box(f'Quoin_{idx}_{int(sx)}_{int(sy)}', (cx, cy, z), (qw, qd, qh), mat_quoin, bevel=0.02)
        z += step_h
        idx += 1


def add_crown_cornice(body_w, body_d, z_top, mat_trim, mat_dentil=None, dentil=True):
    """3-step classical eaves cornice molding + rhythmic dentil blocks along the roofline."""
    box('Cornice_Bot', (0, 0, z_top - 0.22), (body_w + 0.28, body_d + 0.28, 0.14), mat_trim, bevel=0.015)
    box('Cornice_Mid', (0, 0, z_top - 0.08), (body_w + 0.48, body_d + 0.48, 0.14), mat_trim, bevel=0.02)
    box('Cornice_Top', (0, 0, z_top + 0.06), (body_w + 0.72, body_d + 0.72, 0.14), mat_trim, bevel=0.02)
    if dentil:
        count = max(12, int(body_w / 0.72))
        span = body_w - 0.9
        front_y = -body_d / 2.0
        for i in range(count):
            dx = -span / 2.0 + (i / max(1, count - 1)) * span
            box(f'Dentil_F_{i}', (dx, front_y - 0.17, z_top - 0.21), (0.16, 0.16, 0.16), mat_dentil or mat_trim, bevel=0.01)


def add_downspouts(front_y, body_w, z_top, mat_pipe, mat_clamp, z_bot=0.22, x_positions=None):
    """Vertical rainwater downspouts with collector hopper heads, wall straps, and curved base shoes."""
    if x_positions is None:
        x_positions = (-(body_w / 2.0 - 0.48), body_w / 2.0 - 0.48)
    pipe_h = z_top - z_bot - 0.22
    pipe_z = z_bot + 0.16 + pipe_h / 2.0
    py = front_y - 0.12
    for i, px in enumerate(x_positions):
        cylinder(f'Downspout_Pipe_{i}', (px, py, pipe_z), 0.065, pipe_h, mat_pipe, verts=10)
        # Top collector hopper box
        box(f'Downspout_Hopper_{i}', (px, py, z_top - 0.22), (0.24, 0.22, 0.24), mat_pipe, bevel=0.02)
        # Base splash elbow
        box(f'Downspout_Shoe_{i}', (px, py - 0.09, z_bot + 0.06), (0.14, 0.24, 0.14), mat_pipe, bevel=0.02, rot=(0.45, 0, 0))
        # Horizontal wall mounting straps
        z_strap = z_bot + 1.4
        s_idx = 0
        while z_strap < z_top - 0.8:
            box(f'Downspout_Strap_{i}_{s_idx}', (px, front_y - 0.08, z_strap), (0.20, 0.16, 0.07), mat_clamp, bevel=0.01)
            z_strap += 2.6
            s_idx += 1


def add_window_grid(mats, rows, cols, gap_x, gap_y, row_z0, front_y, win_w, win_h,
                    frame_mat, sill_mat, shutter_mat=None, corbel_mat=None,
                    snow_prefix=True, add_planters=False, add_shutters=False,
                    corbel_skip_rows=()):
    """Layered architectural window surrounds keeping Window_Glass_<r>_<c> strictly unobstructed."""
    c_mat = corbel_mat or sill_mat
    s_mat = shutter_mat or frame_mat
    for r in range(rows):
        for c in range(cols):
            x = (c - (cols - 1) / 2.0) * gap_x
            z = row_z0 + r * gap_y

            # Recessed back backing + outer window glass plane (contract geometry)
            box(f'Window_Frame_{r}_{c}', (x, front_y - 0.03, z),
                (win_w + 0.34, 0.20, win_h + 0.34), frame_mat, bevel=0.02)
            box(f'Window_Glass_{r}_{c}', (x, front_y - 0.12, z),
                (win_w, 0.08, win_h), mats['glass_dark'], bevel=0.008, tint=False)

            # Deep physical 3D side jambs framing the interactive Interior Mapping pane without occluding it
            jamb_x = win_w / 2.0 + 0.085
            box(f'WinJamb_L_{r}_{c}', (x - jamb_x, front_y - 0.16, z), (0.15, 0.32, win_h + 0.16), frame_mat, bevel=0.018)
            box(f'WinJamb_R_{r}_{c}', (x + jamb_x, front_y - 0.16, z), (0.15, 0.32, win_h + 0.16), frame_mat, bevel=0.018)

            # Molded sill + drip under-edge + dual sculpted corbel brackets
            sill_z = z - win_h / 2.0 - 0.18
            box(f'Sill_{r}_{c}', (x, front_y - 0.20, sill_z),
                (win_w + 0.56, 0.38, 0.13), sill_mat, bevel=0.02)
            if r not in corbel_skip_rows:
                corb_x = win_w * 0.36
                for side, cx_off in (('L', -corb_x), ('R', corb_x)):
                    box(f'Corbel_{side}_{r}_{c}', (x + cx_off, front_y - 0.15, sill_z - 0.14),
                        (0.14, 0.24, 0.17), c_mat, bevel=0.02)

            # Stepped lintel hood + upper cap molding + center keystone
            hood_z = z + win_h / 2.0 + 0.18
            box(f'Hood_{r}_{c}', (x, front_y - 0.15, hood_z),
                (win_w + 0.42, 0.28, 0.14), sill_mat, bevel=0.018)
            box(f'HoodCap_{r}_{c}', (x, front_y - 0.18, hood_z + 0.10),
                (win_w + 0.54, 0.34, 0.08), c_mat, bevel=0.015)
            box(f'Keystone_{r}_{c}', (x, front_y - 0.20, hood_z + 0.03),
                (0.24, 0.32, 0.26), c_mat, bevel=0.02)

            # Louvered side shutters (highschool & staff) outside jambs
            if add_shutters:
                sh_w = 0.25 if win_w < 1.8 else 0.28
                sh_x = win_w / 2.0 + 0.17 + sh_w * 0.5 + 0.015
                for side, sx in (('L', x - sh_x), ('R', x + sh_x)):
                    box(f'Shutter_{side}_{r}_{c}', (sx, front_y - 0.09, z),
                        (sh_w, 0.09, win_h + 0.04), s_mat, bevel=0.012)
                    # Horizontal 3D louver slats for shadow rhythm
                    for li in range(5):
                        lz = z - win_h * 0.38 + li * (win_h * 0.19)
                        box(f'ShutterSlat_{side}_{r}_{c}_{li}', (sx, front_y - 0.14, lz),
                            (sh_w - 0.04, 0.04, 0.07), s_mat, bevel=0.008)

            # Seasonal sill snow drifts
            if snow_prefix and (r == rows - 1 or (r + c) % 2 == 0):
                box(f'Season_Snow_Sill_{r}_{c}', (x, front_y - 0.22, sill_z + 0.09),
                    (win_w + 0.48, 0.32, 0.08), mats['snow_cap'], bevel=0.025, tint=False)

            # Sill planter flower boxes with terracotta pot & animated leaf clusters
            if add_planters and (r + c) % 4 == 1 and r > 0:
                px = x - win_w * 0.16
                box(f'WinBox_{r}_{c}', (px, front_y - 0.31, sill_z + 0.14),
                    (0.58, 0.20, 0.16), mats['terracotta'], bevel=0.02)
                box(f'WinBox_Rail_{r}_{c}', (px, front_y - 0.41, sill_z + 0.17),
                    (0.62, 0.04, 0.04), mats['metal_dark'], bevel=0.008)
                ico(f'Season_Vines_Win_{r}_{c}', (px, front_y - 0.32, sill_z + 0.28),
                    0.14, mats['leaf_accent'], sub=1, scale=(1.55, 0.85, 0.72))


def add_grand_entrance(mats, cx, front_y, door_w, door_h, z_thresh, frame_mat, trim_mat, door_metal_mat,
                       with_steps=True, with_pilasters=True, with_sconces=True):
    """Build a multi-layered architectural entrance with zero coplanar Y faces:
    Plinth (<= front_y - 0.25) < Entrance_Frame (front_y - 0.35) < Entrance_Door (front_y - 0.42)
    < Three.js doorGlow (+0.55 units) < Mullions/Transom/Handles (front_y - 0.46..-0.53).
    """
    # Optional 3-tier stone entry steps + flanking stone cheek walls
    if with_steps:
        step_total_h = z_thresh
        n_steps = 3
        sh = step_total_h / n_steps
        for si in range(n_steps):
            sw = door_w + 0.72 + si * 0.28
            sd = 0.36
            sy = front_y - 0.56 - si * 0.28
            sz = step_total_h - (si + 0.5) * sh
            box(f'Entrance_Step_{si}', (cx, sy, sz), (sw, sd, sh), mats['stone_trim'], bevel=0.018)
        for side, sx in (('L', -1.0), ('R', 1.0)):
            chk_x = cx + sx * (door_w / 2.0 + 0.56)
            box(f'Entrance_Cheek_{side}', (chk_x, front_y - 0.90, step_total_h * 0.85),
                (0.24, 0.92, step_total_h + 0.28), mats['stone_trim'], bevel=0.02)
            box(f'Entrance_CheekCap_{side}', (chk_x, front_y - 0.90, step_total_h * 1.45 + 0.10),
                (0.30, 0.98, 0.10), trim_mat, bevel=0.015)

    # Outer portal masonry/wood surround (front at front_y - 0.35)
    frame_z = z_thresh + door_h / 2.0 + 0.08
    box('Entrance_Frame', (cx, front_y - 0.23, frame_z), (door_w + 0.62, 0.24, door_h + 0.26), frame_mat, bevel=0.025)
    # Molded lintel + keystone above door
    lintel_z = z_thresh + door_h + 0.16
    box('Entrance_Lintel', (cx, front_y - 0.28, lintel_z), (door_w + 0.92, 0.32, 0.18), trim_mat, bevel=0.02)
    box('Entrance_Keystone', (cx, front_y - 0.31, lintel_z + 0.02), (0.32, 0.36, 0.26), trim_mat, bevel=0.02)

    # Twin flanking pilasters proud of frame (outside door_w)
    if with_pilasters:
        px_off = door_w / 2.0 + 0.24
        for side, sx in (('L', cx - px_off), ('R', cx + px_off)):
            box(f'Entrance_Pilaster_{side}', (sx, front_y - 0.31, frame_z - 0.02),
                (0.26, 0.32, door_h + 0.10), trim_mat, bevel=0.02)
            box(f'Entrance_PilasterBase_{side}', (sx, front_y - 0.33, z_thresh + 0.14),
                (0.32, 0.36, 0.28), frame_mat, bevel=0.02)
            box(f'Entrance_PilasterCap_{side}', (sx, front_y - 0.33, z_thresh + door_h + 0.04),
                (0.34, 0.38, 0.16), frame_mat, bevel=0.02)

    # Warm backlit glass plane (front at front_y - 0.42; strictly named 'Entrance_Door')
    door_cz = z_thresh + door_h / 2.0
    box('Entrance_Door', (cx, front_y - 0.37, door_cz), (door_w, 0.10, door_h), mats['door_glow'], bevel=0.012, tint=False)

    # Front architectural double-door mullions, transom bar, kickplate & brass handles
    # Placed at front_y - 0.48 (back at front_y - 0.46 -> proud of doorGlow by +0.40 Three.js units)
    mull_y = front_y - 0.48
    box('Entrance_Mullion_V', (cx, mull_y, door_cz), (0.09, 0.04, door_h + 0.02), door_metal_mat, bevel=0.01)
    box('Entrance_SideMull_L', (cx - door_w / 2.0 + 0.05, mull_y, door_cz), (0.07, 0.04, door_h + 0.02), door_metal_mat, bevel=0.008)
    box('Entrance_SideMull_R', (cx + door_w / 2.0 - 0.05, mull_y, door_cz), (0.07, 0.04, door_h + 0.02), door_metal_mat, bevel=0.008)
    # Transom bar separating upper fanlight from double doors
    transom_z = z_thresh + door_h * 0.78
    box('Entrance_Mullion_H', (cx, mull_y, transom_z), (door_w, 0.045, 0.08), door_metal_mat, bevel=0.008)
    # Mid lock-rail + bottom kickplate
    box('Entrance_LockRail', (cx, mull_y, z_thresh + door_h * 0.38), (door_w, 0.04, 0.06), door_metal_mat, bevel=0.008)
    box('Entrance_Kickplate', (cx, mull_y, z_thresh + 0.12), (door_w, 0.045, 0.22), door_metal_mat, bevel=0.01)
    # Twin brass vertical pull handles
    handle_z = z_thresh + door_h * 0.46
    for side, hx in (('L', cx - 0.15), ('R', cx + 0.15)):
        cylinder(f'Entrance_Handle_{side}', (hx, front_y - 0.52, handle_z), 0.025, 0.32, mats['brass'], verts=8)
        box(f'Entrance_HandleStand_{side}', (hx, front_y - 0.50, handle_z + 0.10), (0.03, 0.04, 0.03), mats['brass'])
        box(f'Entrance_HandleStandB_{side}', (hx, front_y - 0.50, handle_z - 0.10), (0.03, 0.04, 0.03), mats['brass'])

    # Flanking warm wall sconces
    if with_sconces:
        sx_off = door_w / 2.0 + 0.34
        sz = z_thresh + door_h * 0.68
        for side, sx in (('L', cx - sx_off), ('R', cx + sx_off)):
            box(f'Entrance_SconceArm_{side}', (sx, front_y - 0.42, sz), (0.07, 0.18, 0.07), mats['metal_dark'], bevel=0.01)
            box(f'Entrance_SconceBulb_{side}', (sx, front_y - 0.50, sz - 0.10), (0.16, 0.16, 0.20), mats['lantern_warm'], bevel=0.015, tint=False)
            cone(f'Entrance_SconceCap_{side}', (sx, front_y - 0.50, sz + 0.04), 0.15, 0.03, 0.10, mats['metal_dark'], verts=6)


def add_bicycle(name_prefix, x, y, z, rot_z, mats, frame_mat=None):
    """Detailed bicycle silhouette with spoked wheel rims, fork, diamond frame, saddle & wire basket."""
    f_mat = frame_mat or mats['wood_green']
    wheel_rot = (0.0, math.pi / 2.0, rot_z)
    cos_r, sin_r = math.cos(rot_z), math.sin(rot_z)

    def local(lx, ly, lz):
        return (x + lx * cos_r - ly * sin_r, y + lx * sin_r + ly * cos_r, z + lz)

    torus(f'{name_prefix}_WheelR', local(-0.46, 0, 0.34), 0.33, 0.042, mats['metal_dark'], rot=wheel_rot, seg_maj=16)
    torus(f'{name_prefix}_WheelF', local(0.46, 0, 0.34), 0.33, 0.042, mats['metal_dark'], rot=wheel_rot, seg_maj=16)
    torus(f'{name_prefix}_RimR', local(-0.46, 0, 0.34), 0.28, 0.018, mats['metal_light'], rot=wheel_rot, seg_maj=14)
    torus(f'{name_prefix}_RimF', local(0.46, 0, 0.34), 0.28, 0.018, mats['metal_light'], rot=wheel_rot, seg_maj=14)
    box(f'{name_prefix}_TopTube', local(-0.02, 0, 0.64), (0.64, 0.05, 0.05), f_mat, bevel=0.01, rot=(0, 0, rot_z))
    box(f'{name_prefix}_DownTube', local(0.12, 0, 0.48), (0.66, 0.05, 0.05), f_mat, bevel=0.01, rot=(0, 0.52, rot_z))
    box(f'{name_prefix}_SeatPost', local(-0.24, 0, 0.56), (0.05, 0.05, 0.52), f_mat, bevel=0.01, rot=(0, -0.22, rot_z))
    box(f'{name_prefix}_Fork', local(0.38, 0, 0.54), (0.05, 0.09, 0.54), f_mat, bevel=0.01, rot=(0, -0.25, rot_z))
    box(f'{name_prefix}_Seat', local(-0.28, 0, 0.84), (0.24, 0.13, 0.06), mats['wood_warm'], bevel=0.015, rot=(0, 0, rot_z))
    box(f'{name_prefix}_Bar', local(0.34, 0, 0.86), (0.05, 0.38, 0.045), mats['metal_light'], bevel=0.01, rot=(0, 0, rot_z))
    box(f'{name_prefix}_Basket', local(0.50, 0, 0.72), (0.22, 0.28, 0.18), mats['metal_dark'], bevel=0.015, rot=(0, 0, rot_z))


def add_tree(prefix, x, y, z, height, canopy_r, mats, rng, is_ginkgo=False, with_planter=False):
    """Organic branching tree with flared root collar, primary fork limbs, layered canopy & snow caps."""
    if with_planter:
        cylinder(f'{prefix}_PlanterRing', (x, y, z + 0.12), 0.96, 0.24, mats['stone_trim'], verts=10, bevel=0.015)
        cylinder(f'{prefix}_PlanterSoil', (x, y, z + 0.18), 0.78, 0.14, mats['trunk'], verts=10)

    # Flared root collar + main tapered trunk
    cone(f'{prefix}_RootFlare', (x, y, z + height * 0.14), 0.36, 0.20, height * 0.28, mats['trunk'], verts=10)
    cylinder(f'{prefix}_Trunk', (x, y, z + height * 0.44), 0.20, height * 0.72, mats['trunk'], verts=10, bevel=0.02)

    # 3 primary structural branches forking outward into canopy
    for b_i, ang in enumerate((0.4, 2.5, 4.6)):
        bx = x + math.cos(ang) * (canopy_r * 0.26)
        by = y + math.sin(ang) * (canopy_r * 0.22)
        bz = z + height * 0.76
        tilt_x = math.sin(ang) * 0.46
        tilt_y = -math.cos(ang) * 0.46
        cylinder(f'{prefix}_Branch_{b_i}', (bx, by, bz), 0.10, height * 0.36, mats['trunk'],
                 verts=8, rot=(tilt_x, tilt_y, 0.0), bevel=0.01)

    mat_a = mats['leaf_main']
    mat_b = mats['leaf_accent']
    blobs = 7 if not is_ginkgo else 8
    for i in range(blobs):
        if i == blobs - 1:
            dx, dy = rng.uniform(-0.15, 0.15), rng.uniform(-0.12, 0.12)
            dz = height * 0.92 + canopy_r * 0.65
            r = canopy_r * 0.72
        else:
            ang = (i / (blobs - 1)) * math.pi * 2.0 + rng.uniform(-0.25, 0.25)
            rad = canopy_r * rng.uniform(0.32, 0.56)
            dx = math.cos(ang) * rad
            dy = math.sin(ang) * rad * 0.85
            dz = height * 0.78 + (i % 3) * (canopy_r * 0.22)
            r = canopy_r * rng.uniform(0.56, 0.84)
        ico(f'Tree_Canopy_{prefix}_{i}', (x + dx, y + dy, z + dz), r, mat_a if i % 2 == 0 else mat_b,
            sub=2 if i >= blobs - 3 else 1, scale=(1.15, 1.05, 0.80))
        if i >= blobs - 4:
            ico(f'Season_Snow_Tree_{prefix}_{i}', (x + dx, y + dy, z + dz + r * 0.54), r * 0.70,
                mats['snow_cap'], sub=1, scale=(1.08, 1.0, 0.34), tint=False)


def add_hedge_strip(prefix, x, y, z, length, height, depth, mats, rng, along_x=True):
    """Natural sculpted evergreen hedge row built from soft overlapping clusters."""
    count = max(3, int(length / 0.72))
    for i in range(count):
        t = (i / max(1, count - 1) - 0.5) * (length - 0.55)
        hx = x + (t if along_x else rng.uniform(-0.08, 0.08))
        hy = y + (rng.uniform(-0.08, 0.08) if along_x else t)
        hr = (height * 0.62) * rng.uniform(0.88, 1.15)
        ico(f'{prefix}_{i}', (hx, hy, z + height * 0.42), hr, mats['hedge_leaf'],
            sub=1, scale=(1.05, depth / max(0.3, height * 0.9), 0.92))


# ------------------------------------------------------------------ 4 Dorm Builders + Shared Campus Grounds

def build_highschool(mats, rng):
    """高中宿舍楼 · 晨光楼: 3x6 = 18 windows, brick quoins, shutters, tile ribs, dormers, bulletin & bike shed."""
    rows, cols = 3, 6
    gap_x, gap_y = 2.6, 3.0
    row_z0 = 4.45
    body_w, body_d, body_h = 17.4, 6.0, 12.2
    front_y = -body_d / 2.0

    # Brick plinth + upper plaster body + stone quoins & cornice + downspouts
    box('Dorm_Plinth', (0, 0, 1.3), (body_w + 0.35, body_d + 0.35, 2.6), mats['brick_red'], bevel=0.04)
    box('Dorm_Body', (0, 0, body_h / 2.0 + 1.2), (body_w, body_d, body_h - 2.4), mats['plaster_cream'], bevel=0.04)
    add_corner_quoins(body_w, body_d, body_h, 2.6, mats['brick_red'], mats['stone_trim'], step_h=0.68)
    add_crown_cornice(body_w, body_d, body_h, mats['trim_cream'], mats['stone_trim'], dentil=True)
    add_downspouts(front_y, body_w, body_h, mats['copper'], mats['metal_dark'], x_positions=(-8.15, 8.15))

    for r in range(1, rows):
        z = row_z0 + (r - 0.5) * gap_y
        box(f'Floor_Band_{r}', (0, front_y - 0.04, z), (body_w + 0.30, 0.18, 0.20), mats['brick_red'], bevel=0.02)

    add_window_grid(mats, rows, cols, gap_x, gap_y, row_z0, front_y, 1.5, 1.85,
                    mats['wood_green'], mats['trim_cream'], shutter_mat=mats['wood_green'],
                    corbel_mat=mats['stone_trim'], add_planters=False, add_shutters=True)

    # Gable pitched terracotta roof + raised tile ribs + ridge finials + 3 dormer windows
    roof_w = body_w + 1.3
    roof_d = body_d + 1.3
    ridge_h = 3.4
    roof_z = body_h + 0.3
    box('Roof_Eaves', (0, 0, body_h + 0.15), (body_w + 1.15, body_d + 1.15, 0.28), mats['trim_cream'], bevel=0.03)
    gable_prism('Roof_Pitched', (0, 0, roof_z), roof_w, roof_d, ridge_h, mats['roof_terracotta'], bevel=0.03)
    box('Roof_Ridge', (0, 0, roof_z + ridge_h + 0.04), (roof_w + 0.18, 0.30, 0.22), mats['trim_cream'], bevel=0.02)
    for sx in (-1.0, 1.0):
        ico(f'Roof_Finial_{int(sx)}', (sx * (roof_w * 0.47), 0, roof_z + ridge_h + 0.30), 0.20, mats['brass'], sub=1)

    # Sloped roof tile ribs along front and back slopes
    slope_len = math.hypot(roof_d / 2.0, ridge_h)
    slope_ang = math.atan2(ridge_h, roof_d / 2.0)
    for ri in range(15):
        rx = -roof_w * 0.46 + (ri / 14.0) * (roof_w * 0.92)
        if abs(rx) < 1.35:
            continue  # clear center dormer
        for side_s, ang_s in ((-1.0, slope_ang), (1.0, -slope_ang)):
            ry = side_s * (roof_d * 0.25)
            rz = roof_z + ridge_h * 0.50 + 0.06
            box(f'Roof_Rib_{ri}_{int(side_s)}', (rx, ry, rz), (0.14, slope_len * 0.98, 0.12),
                mats['roof_terracotta'], bevel=0.0, rot=(ang_s, 0.0, 0.0))

    # Center dormer + flanking smaller gable vent dormers
    box('Dormer_Box', (0, front_y * 0.42, body_h + 1.6), (2.4, 2.2, 1.8), mats['plaster_cream'], bevel=0.03)
    gable_prism('Dormer_Roof', (0, front_y * 0.42, body_h + 2.5), 2.75, 2.55, 1.12, mats['roof_terracotta'], bevel=0.02)
    box('Dormer_Frame', (0, front_y * 0.42 - 1.09, body_h + 1.55), (1.32, 0.14, 1.18), mats['wood_green'], bevel=0.015)
    box('Dormer_Glass', (0, front_y * 0.42 - 1.15, body_h + 1.55), (1.06, 0.08, 0.94), mats['lamp_glow'], bevel=0.01, tint=False)
    box('Dormer_Mullion', (0, front_y * 0.42 - 1.20, body_h + 1.55), (0.07, 0.04, 0.96), mats['wood_green'])
    for side, dx in (('L', -5.2), ('R', 5.2)):
        box(f'SideDormer_{side}', (dx, front_y * 0.44, body_h + 1.35), (1.25, 1.45, 1.05), mats['plaster_cream'], bevel=0.02)
        gable_prism(f'SideDormerRoof_{side}', (dx, front_y * 0.44, body_h + 1.88), 1.5, 1.7, 0.65, mats['roof_terracotta'], bevel=0.02)
        box(f'SideDormerVent_{side}', (dx, front_y * 0.44 - 0.74, body_h + 1.35), (0.58, 0.08, 0.56), mats['wood_green'], bevel=0.01)

    gable_prism('Season_Snow_Roof', (0, 0, body_h + 0.46), roof_w + 0.04, roof_d + 0.04, ridge_h - 0.02, mats['snow_cap'], bevel=0.04, tint=False)

    # Grand entrance porch + steps + canopy brackets + school plaque (canopy top < row 0 sill at z ~ 3.23)
    add_grand_entrance(mats, 0.0, front_y, door_w=1.88, door_h=2.06, z_thresh=0.34,
                       frame_mat=mats['brick_red'], trim_mat=mats['stone_trim'],
                       door_metal_mat=mats['wood_green'], with_steps=True, with_pilasters=True, with_sconces=True)
    box('Entrance_Canopy', (0, front_y - 0.85, 2.66), (3.4, 1.65, 0.18), mats['roof_terracotta'], bevel=0.03)
    box('Entrance_CanopyTrim', (0, front_y - 0.85, 2.55), (3.5, 1.74, 0.09), mats['trim_cream'], bevel=0.015)
    box('Entrance_Plaque', (0, front_y - 1.70, 2.64), (1.42, 0.08, 0.34), mats['brass'], bevel=0.015)
    for bx in (-1.30, 1.30):
        box(f'Canopy_Bracket_{bx}', (bx, front_y - 0.80, 2.36), (0.14, 0.90, 0.14), mats['wood_warm'], bevel=0.015, rot=(-0.48, 0, 0))
    box('Season_Snow_Canopy', (0, front_y - 0.85, 2.79), (3.3, 1.58, 0.09), mats['snow_cap'], bevel=0.03, tint=False)

    # Detailed courtyard bulletin blackboard on left
    box('Board_Post_L', (-7.2, front_y - 1.5, 1.12), (0.16, 0.16, 2.24), mats['wood_warm'], bevel=0.02)
    box('Board_Post_R', (-4.4, front_y - 1.5, 1.12), (0.16, 0.16, 2.24), mats['wood_warm'], bevel=0.02)
    box('Board_Frame', (-5.8, front_y - 1.5, 1.56), (3.05, 0.18, 1.54), mats['wood_warm'], bevel=0.02)
    box('Board_Face', (-5.8, front_y - 1.59, 1.56), (2.70, 0.07, 1.24), mats['board_green'], bevel=0.008, tint=False)
    box('Board_ChalkTray', (-5.8, front_y - 1.66, 0.88), (2.80, 0.16, 0.08), mats['wood_warm'], bevel=0.01)
    gable_prism('Board_Roof', (-5.8, front_y - 1.5, 2.36), 3.35, 0.85, 0.42, mats['roof_terracotta'], bevel=0.02)
    box('Season_Snow_Board', (-5.8, front_y - 1.5, 2.74), (3.2, 0.72, 0.08), mats['snow_cap'], bevel=0.02, tint=False)
    # Pinned chalk & poster notes on board
    for ni, (nx, nz, nmat) in enumerate([(-6.5, 1.72, mats['laundry_c']), (-5.8, 1.65, mats['laundry_b']), (-5.1, 1.74, mats['laundry_a'])]):
        box(f'Board_Note_{ni}', (nx, front_y - 1.64, nz), (0.48, 0.03, 0.54), nmat, bevel=0.005, tint=False)

    # Covered corrugated bike shed + wheel racks + 4 bicycles on right
    shed_x, shed_y = 10.6, -1.2
    for px in (shed_x - 1.75, shed_x + 1.75):
        for py in (shed_y - 1.35, shed_y + 1.35):
            cylinder(f'Shed_Post_{px}_{py}', (px, py, 1.25), 0.09, 2.5, mats['metal_dark'], verts=10)
            cylinder(f'Shed_Foot_{px}_{py}', (px, py, 0.08), 0.15, 0.16, mats['stone_trim'], verts=8)
    box('Shed_Roof', (shed_x, shed_y, 2.55), (4.1, 3.3, 0.14), mats['roof_slate'], bevel=0.02, rot=(0.14, 0.0, 0.0))
    for ri in range(7):
        rx = shed_x - 1.7 + ri * 0.56
        box(f'Shed_RoofRib_{ri}', (rx, shed_y, 2.63), (0.08, 3.25, 0.06), mats['metal_light'], rot=(0.14, 0, 0))
    box('Shed_BasePad', (shed_x, shed_y, 0.04), (4.0, 3.2, 0.08), mats['stone_ground'], bevel=0.02)
    box('Shed_RackBar', (shed_x, shed_y - 0.52, 0.24), (3.3, 0.08, 0.08), mats['metal_light'])
    box('Season_Snow_Shed', (shed_x, shed_y, 2.68), (3.95, 3.15, 0.09), mats['snow_cap'], bevel=0.03, rot=(0.14, 0.0, 0.0), tint=False)
    for i, bx in enumerate((shed_x - 1.25, shed_x - 0.42, shed_x + 0.42, shed_x + 1.25)):
        f_mat = mats['wood_green'] if i % 2 == 0 else mats['laundry_b']
        add_bicycle(f'HS_Bike_{i}', bx, shed_y - 0.05, 0.08, math.pi / 2.0, mats, frame_mat=f_mat)

    add_hedge_strip('HS_Hedge_L', -5.8, front_y - 0.72, 0.0, 4.6, 0.72, 0.55, mats, rng)
    add_hedge_strip('HS_Hedge_R', 5.8, front_y - 0.72, 0.0, 4.6, 0.72, 0.55, mats, rng)
    add_tree('HS_Tree_L', -10.8, -1.5, 0.0, 4.9, 1.75, mats, rng, with_planter=True)
    return rows, cols


def build_university(mats, rng):
    """大学宿舍楼 · 17号楼: 4x6 = 24 windows, colonnade capitals, wrought balustrades, copper-piped AC, cat & water tower."""
    rows, cols = 4, 6
    gap_x, gap_y = 2.7, 3.05
    row_z0 = 4.35
    body_w, body_d, body_h = 17.8, 6.2, 15.0
    front_y = -body_d / 2.0

    box('Dorm_Body', (0, 0, body_h / 2.0), (body_w, body_d, body_h), mats['brick_warm'], bevel=0.04)
    box('Dorm_Plinth', (0, 0, 0.35), (body_w + 0.5, body_d + 0.5, 0.7), mats['trim_cream'], bevel=0.03)
    add_corner_quoins(body_w, body_d, body_h, 0.70, mats['stone_trim'], mats['trim_cream'], step_h=0.72, water_table=False)
    add_crown_cornice(body_w, body_d, body_h, mats['trim_cream'], mats['stone_trim'], dentil=True)
    add_downspouts(front_y, body_w, body_h, mats['metal_dark'], mats['metal_light'], x_positions=(-8.40, 8.40))

    # Flanking stairwell wings with slim stair slit windows and multi-step parapets
    wing_x = body_w / 2.0 + 0.88
    for side, wx in (('L', -wing_x), ('R', wing_x)):
        box(f'Dorm_Wing_{side}', (wx, 0.5, 5.5), (1.75, 4.6, 11.0), mats['wing_warm'], bevel=0.04)
        box(f'Wing_Cap_{side}', (wx, 0.5, 11.12), (2.05, 4.9, 0.28), mats['roof_slate'], bevel=0.03)
        box(f'Wing_Cornice_{side}', (wx, 0.5, 10.92), (1.95, 4.8, 0.14), mats['trim_cream'], bevel=0.02)
        for sz in (2.5, 5.3, 8.1):
            box(f'Wing_WinFrame_{side}_{sz}', (wx, -1.82, sz), (0.62, 0.12, 1.35), mats['frame_dark'], bevel=0.015)
            box(f'Wing_WinGlow_{side}_{sz}', (wx, -1.86, sz), (0.44, 0.06, 1.15), mats['lantern_warm'], bevel=0.01, tint=False)

    for r in range(1, rows):
        z = row_z0 + (r - 0.5) * gap_y
        box(f'Floor_Band_{r}', (0, front_y - 0.04, z), (body_w + 0.30, 0.20, 0.20), mats['trim_cream'], bevel=0.02)

    add_window_grid(mats, rows, cols, gap_x, gap_y, row_z0, front_y, 1.52, 1.9,
                    mats['frame_dark'], mats['trim_cream'], corbel_mat=mats['stone_trim'],
                    add_planters=True, add_shutters=False)

    # AC outdoor units mounted on steel L-brackets with curved copper refrigerant pipe loops
    for r in range(1, rows):
        for c in range(cols):
            if (r + c) % 3 == 0:
                x = (c - (cols - 1) / 2.0) * gap_x + 1.32 if c < cols - 1 else (c - (cols - 1) / 2.0) * gap_x - 1.32
                z = row_z0 + r * gap_y - 0.58
                box(f'AC_Unit_{r}_{c}', (x, front_y - 0.18, z), (0.58, 0.34, 0.42), mats['metal_light'], bevel=0.02)
                cylinder(f'AC_Fan_{r}_{c}', (x - 0.10, front_y - 0.36, z), 0.14, 0.04, mats['metal_dark'], verts=12, rot=(math.pi / 2.0, 0, 0))
                box(f'AC_Grille_{r}_{c}', (x + 0.18, front_y - 0.36, z), (0.14, 0.03, 0.28), mats['metal_dark'])
                for b_off in (-0.20, 0.20):
                    box(f'AC_BracketV_{r}_{c}_{b_off}', (x + b_off, front_y - 0.06, z - 0.28), (0.05, 0.08, 0.24), mats['metal_dark'])
                    box(f'AC_BracketH_{r}_{c}_{b_off}', (x + b_off, front_y - 0.18, z - 0.23), (0.05, 0.32, 0.05), mats['metal_dark'])
                cylinder(f'AC_Pipe_{r}_{c}', (x + 0.30, front_y - 0.10, z - 0.04), 0.03, 0.34, mats['copper'], verts=8)

    # Clothesline bars + wire hangers + drying laundry on upper floors
    for idx, (r, c, lmat) in enumerate([(1, 1, mats['laundry_a']), (1, 4, mats['laundry_b']), (2, 2, mats['laundry_c'])]):
        x = (c - (cols - 1) / 2.0) * gap_x
        z = row_z0 + r * gap_y - 0.96
        box(f'Laundry_Bar_{idx}', (x, front_y - 0.36, z + 0.28), (1.42, 0.035, 0.035), mats['metal_dark'])
        box(f'Laundry_SupportL_{idx}', (x - 0.68, front_y - 0.20, z + 0.28), (0.04, 0.34, 0.04), mats['metal_dark'])
        box(f'Laundry_SupportR_{idx}', (x + 0.68, front_y - 0.20, z + 0.28), (0.04, 0.34, 0.04), mats['metal_dark'])
        box(f'Laundry_Shirt_{idx}', (x - 0.22, front_y - 0.37, z), (0.42, 0.06, 0.52), lmat, bevel=0.015)
        box(f'Laundry_SleeveL_{idx}', (x - 0.45, front_y - 0.37, z + 0.14), (0.14, 0.05, 0.20), lmat, bevel=0.01, rot=(0, 0.35, 0))
        box(f'Laundry_SleeveR_{idx}', (x + 0.01, front_y - 0.37, z + 0.14), (0.14, 0.05, 0.20), lmat, bevel=0.01, rot=(0, -0.35, 0))
        box(f'Laundry_Towel_{idx}', (x + 0.32, front_y - 0.37, z + 0.04), (0.30, 0.05, 0.42), mats['trim_cream'], bevel=0.01)

    # Open ground-floor colonnade with column pedestals, molded capitals & stepped canopy balustrade
    walk_y = front_y - 1.35
    box('Corridor_Floor', (0, walk_y, 0.12), (body_w - 0.3, 2.7, 0.24), mats['stone_ground'], bevel=0.03)
    box('Corridor_StepEdge', (0, walk_y - 1.36, 0.06), (body_w - 0.1, 0.24, 0.12), mats['stone_trim'], bevel=0.015)
    box('Corridor_Canopy', (0, walk_y, 2.94), (body_w - 0.2, 2.74, 0.22), mats['trim_cream'], bevel=0.03)
    box('Corridor_Lintels', (0, walk_y - 1.18, 2.76), (body_w - 1.6, 0.28, 0.18), mats['stone_trim'], bevel=0.02)
    box('Season_Snow_Corridor', (0, walk_y, 3.09), (body_w - 0.35, 2.62, 0.09), mats['snow_cap'], bevel=0.03, tint=False)
    for i in range(cols):
        cx = (i - (cols - 1) / 2.0) * gap_x
        cylinder(f'Corridor_Col_{i}', (cx, walk_y - 1.18, 1.54), 0.135, 2.40, mats['trim_cream'], verts=12)
        box(f'Corridor_Base_{i}', (cx, walk_y - 1.18, 0.34), (0.38, 0.38, 0.24), mats['stone_trim'], bevel=0.02)
        box(f'Corridor_Cap_{i}', (cx, walk_y - 1.18, 2.72), (0.40, 0.40, 0.16), mats['stone_trim'], bevel=0.02)
    for i, x in enumerate((-5.4, 0.0, 5.4)):
        box(f'Porch_Lamp_{i}', (x, walk_y - 0.9, 2.74), (0.38, 0.24, 0.14), mats['lamp_glow'], bevel=0.02, tint=False)

    # Clean grand entrance under colonnade
    add_grand_entrance(mats, 0.0, front_y, door_w=1.88, door_h=2.48, z_thresh=0.25,
                       frame_mat=mats['frame_dark'], trim_mat=mats['stone_trim'],
                       door_metal_mat=mats['metal_dark'], with_steps=False, with_pilasters=True, with_sconces=True)

    # Detailed cat house + sitting orange tabby cat + twin ceramic bowls
    box('Cat_House', (-2.85, walk_y - 0.65, 0.44), (0.66, 0.58, 0.48), mats['wood_warm'], bevel=0.02)
    box('Cat_House_Door', (-2.85, walk_y - 0.95, 0.40), (0.28, 0.06, 0.32), mats['metal_dark'], bevel=0.015)
    gable_prism('Cat_House_Roof', (-2.85, walk_y - 0.65, 0.68), 0.78, 0.70, 0.34, mats['roof_terracotta'], bevel=0.015)
    ico('Dorm_Orange_Cat', (-2.18, walk_y - 0.68, 0.36), 0.14, mats['cat_orange'], sub=1, scale=(1.15, 0.9, 1.0))
    ico('Dorm_Orange_CatHead', (-2.04, walk_y - 0.74, 0.50), 0.09, mats['cat_orange'], sub=1)
    cylinder('Dorm_CatBowl_A', (-2.46, walk_y - 0.92, 0.26), 0.09, 0.06, mats['terracotta'], verts=10)
    cylinder('Dorm_CatBowl_B', (-2.26, walk_y - 0.94, 0.26), 0.09, 0.06, mats['laundry_b'], verts=10)

    # Rooftop + full wrought-iron baluster railing + water tower with ladder & piping
    box('Roof_Slab', (0, 0, body_h + 0.22), (body_w + 0.75, body_d + 0.75, 0.44), mats['roof_slate'], bevel=0.03)
    box('Roof_Trim', (0, 0, body_h + 0.50), (body_w + 0.92, body_d + 0.92, 0.14), mats['trim_cream'], bevel=0.02)
    box('Season_Snow_RoofSlab', (0, 0, body_h + 0.61), (body_w + 0.62, body_d + 0.62, 0.11), mats['snow_cap'], bevel=0.04, tint=False)
    for x in (-8.8, -4.4, 0.0, 4.4, 8.8):
        for y in (-3.25, 3.25):
            box(f'Roof_Post_{x}_{y}', (x, y, body_h + 0.92), (0.11, 0.11, 0.80), mats['trim_cream'], bevel=0.015)
    # Dense vertical metal railing spindles across front & back parapets
    for si in range(19):
        sx = -8.4 + si * (16.8 / 18.0)
        box(f'Roof_Spindle_F_{si}', (sx, -3.25, body_h + 0.90), (0.04, 0.04, 0.72), mats['metal_dark'])
        box(f'Roof_Spindle_B_{si}', (sx, 3.25, body_h + 0.90), (0.04, 0.04, 0.72), mats['metal_dark'])
    box('Roof_Rail_F', (0, -3.25, body_h + 1.30), (17.7, 0.09, 0.09), mats['trim_cream'], bevel=0.01)
    box('Roof_Rail_B', (0, 3.25, body_h + 1.30), (17.7, 0.09, 0.09), mats['trim_cream'], bevel=0.01)

    # Detailed water tower + steel ladder + supply pipes + HVAC vents
    tx, ty = 4.6, 0.8
    for dx, dy in ((-0.8, -0.8), (0.8, -0.8), (-0.8, 0.8), (0.8, 0.8)):
        cylinder(f'Tower_Leg_{dx}_{dy}', (tx + dx, ty + dy, body_h + 1.35), 0.09, 1.7, mats['metal_dark'], verts=8)
    box('Tower_Platform', (tx, ty, body_h + 2.12), (2.2, 2.2, 0.14), mats['metal_dark'], bevel=0.02)
    cylinder('Tower_Tank', (tx, ty, body_h + 2.98), 1.15, 1.65, mats['roof_slate'], verts=18)
    for ring_z in (body_h + 2.55, body_h + 3.00, body_h + 3.45):
        torus(f'Tower_Band_{ring_z}', (tx, ty, ring_z), 1.17, 0.035, mats['metal_light'], seg_maj=18)
    cone('Tower_Cap', (tx, ty, body_h + 4.04), 1.32, 0.14, 0.56, mats['roof_slate'], verts=18)
    cylinder('Tower_Spire', (tx, ty, body_h + 4.46), 0.04, 0.36, mats['metal_light'], verts=8)
    cone('Season_Snow_Tower', (tx, ty, body_h + 4.14), 1.26, 0.12, 0.48, mats['snow_cap'], verts=18, tint=False)
    # Tower access ladder & vertical pipe
    for lx_off in (-0.18, 0.18):
        cylinder(f'Tower_LadderRail_{lx_off}', (tx - 1.24, ty + lx_off, body_h + 2.15), 0.025, 3.2, mats['metal_light'], verts=6)
    for ri in range(8):
        box(f'Tower_Rung_{ri}', (tx - 1.24, ty, body_h + 0.80 + ri * 0.38), (0.03, 0.36, 0.03), mats['metal_light'])
    cylinder('Tower_Standpipe', (tx + 0.35, ty - 0.85, body_h + 1.4), 0.07, 1.8, mats['copper'], verts=8)

    # Rooftop HVAC air handler + TV antennas
    box('Roof_HVAC', (-2.4, 0.6, body_h + 0.92), (1.8, 1.2, 0.92), mats['metal_light'], bevel=0.03)
    cylinder('Roof_HVAC_Cap', (-2.4, 0.6, body_h + 1.46), 0.38, 0.16, mats['metal_dark'], verts=12)
    cylinder('Roof_Antenna', (-5.6, 0.4, body_h + 1.9), 0.05, 2.8, mats['metal_dark'], verts=8)
    box('Roof_AntennaCrossA', (-5.6, 0.4, body_h + 2.85), (1.4, 0.04, 0.04), mats['metal_light'])
    box('Roof_AntennaCrossB', (-5.6, 0.4, body_h + 3.15), (0.9, 0.04, 0.04), mats['metal_light'])

    add_bicycle('Uni_Bike_0', 5.2, walk_y - 1.7, 0.0, 0.12, mats, frame_mat=mats['laundry_a'])
    add_bicycle('Uni_Bike_1', 6.4, walk_y - 1.75, 0.0, -0.08, mats, frame_mat=mats['wood_green'])
    return rows, cols


def build_grad(mats, rng):
    """研究生宿舍楼 · 研思楼: 5x6 = 30 windows, vertical stone pilasters, cantilevered balconies, grand portico & conservatory."""
    rows, cols = 5, 6
    gap_x, gap_y = 2.7, 2.82
    row_z0 = 4.35
    body_w, body_d, body_h = 18.2, 6.6, 17.6
    front_y = -body_d / 2.0

    box('Dorm_Body', (0, 0, body_h / 2.0), (body_w, body_d, body_h), mats['stone_grad'], bevel=0.04)
    box('Dorm_Plinth', (0, 0, 0.45), (body_w + 0.5, body_d + 0.5, 0.9), mats['frame_dark'], bevel=0.03)
    add_corner_quoins(body_w, body_d, body_h, 0.90, mats['stone_trim'], mats['metal_light'], step_h=0.76)
    add_crown_cornice(body_w, body_d, body_h, mats['frame_dark'], mats['metal_light'], dentil=False)
    add_downspouts(front_y, body_w, body_h, mats['metal_dark'], mats['metal_light'], x_positions=(-8.65, 8.65))

    # Full-height vertical architectural stone fins between upper window columns
    fin_z0 = 3.15
    fin_h = body_h - fin_z0 - 0.15
    for c in range(1, cols):
        fx = (c - cols / 2.0) * gap_x
        box(f'Facade_Fin_{c}', (fx, front_y - 0.06, fin_z0 + fin_h / 2.0), (0.24, 0.24, fin_h), mats['stone_trim'], bevel=0.02)

    for r in range(1, rows):
        z = row_z0 + (r - 0.5) * gap_y
        box(f'Floor_Band_{r}', (0, front_y - 0.05, z), (body_w + 0.32, 0.24, 0.18), mats['frame_dark'], bevel=0.02)

    add_window_grid(mats, rows, cols, gap_x, gap_y, row_z0, front_y, 1.55, 1.75,
                    mats['frame_dark'], mats['metal_light'], corbel_mat=mats['stone_trim'],
                    add_planters=False, add_shutters=False, corbel_skip_rows=(1, 2, 3))

    # Protruding modern cantilevered balconies on floors 2..4 with steel stanchions, divider fins & potted plants
    for r in (1, 2, 3):
        z = row_z0 + r * gap_y - 1.24
        box(f'Balcony_Slab_{r}', (0, front_y - 0.52, z), (body_w - 1.15, 0.94, 0.16), mats['trim_cream'], bevel=0.02)
        box(f'Balcony_Glass_{r}', (0, front_y - 0.94, z + 0.42), (body_w - 1.25, 0.05, 0.72), mats['glass_rail'], tint=False)
        box(f'Balcony_Rail_{r}', (0, front_y - 0.94, z + 0.80), (body_w - 1.20, 0.08, 0.06), mats['metal_dark'], bevel=0.01)
        for bi in range(7):
            bx = -8.1 + bi * 2.7
            box(f'Balcony_Post_{r}_{bi}', (bx, front_y - 0.94, z + 0.43), (0.06, 0.07, 0.78), mats['metal_dark'])
            if bi % 2 == 1:
                box(f'Balcony_Cantilever_{r}_{bi}', (bx, front_y - 0.36, z - 0.14), (0.12, 0.56, 0.14), mats['frame_dark'], bevel=0.015)
        # Potted plants tucked cleanly on alternate balcony bays
        for px in (-6.75, 1.35) if r % 2 == 1 else (-1.35, 6.75):
            cylinder(f'Balcony_Pot_{r}_{px}', (px, front_y - 0.74, z + 0.22), 0.16, 0.26, mats['terracotta'], verts=10)
            ico(f'Balcony_Plant_{r}_{px}', (px, front_y - 0.74, z + 0.42), 0.18, mats['hedge_leaf'], sub=1, scale=(1.1, 1.0, 0.9))

    # Grand modern entrance lobby + twin architectural portico columns + steps + glowing soffit strip
    add_grand_entrance(mats, 0.0, front_y, door_w=2.85, door_h=2.08, z_thresh=0.34,
                       frame_mat=mats['frame_dark'], trim_mat=mats['metal_light'],
                       door_metal_mat=mats['metal_dark'], with_steps=True, with_pilasters=True, with_sconces=True)
    box('Entrance_Awning', (0, front_y - 1.05, 2.58), (4.6, 2.0, 0.18), mats['metal_dark'], bevel=0.02)
    box('Entrance_AwningTrim', (0, front_y - 1.05, 2.68), (4.7, 2.08, 0.06), mats['metal_light'], bevel=0.01)
    box('Entrance_SoffitGlow', (0, front_y - 1.05, 2.47), (3.8, 0.24, 0.04), mats['lamp_glow'], tint=False)
    for sx in (-1.95, 1.95):
        box(f'Portico_Col_{sx}', (sx, front_y - 1.82, 1.34), (0.24, 0.24, 2.38), mats['stone_trim'], bevel=0.02)
        box(f'Portico_ColBase_{sx}', (sx, front_y - 1.82, 0.16), (0.34, 0.34, 0.26), mats['frame_dark'], bevel=0.02)
    box('Season_Snow_Awning', (0, front_y - 1.05, 2.75), (4.45, 1.90, 0.09), mats['snow_cap'], bevel=0.03, tint=False)

    # Rooftop steel-ribbed glass conservatory + wooden coffee terrace + lounge chairs
    box('Roof_Slab', (0, 0, body_h + 0.22), (body_w + 0.55, body_d + 0.55, 0.44), mats['frame_dark'], bevel=0.03)
    box('Roof_ParapetCap', (0, -body_d / 2.0 - 0.14, body_h + 0.52), (body_w + 0.62, 0.28, 0.16), mats['stone_trim'], bevel=0.02)
    box('Season_Snow_Roof', (0, 0, body_h + 0.52), (body_w + 0.35, body_d + 0.35, 0.11), mats['snow_cap'], bevel=0.04, tint=False)

    # Greenhouse conservatory with dark steel structural portal ribs on left roof
    gx = -3.2
    box('Greenhouse_Base', (gx, 0, body_h + 0.72), (5.2, 3.2, 0.55), mats['brick_warm'], bevel=0.02)
    box('Greenhouse_Glass', (gx, 0, body_h + 1.65), (5.0, 3.0, 1.4), mats['glass_rail'], tint=False)
    gable_prism('Greenhouse_Roof', (gx, 0, body_h + 2.35), 5.3, 3.3, 1.0, mats['glass_rail'], bevel=0.015)
    box('Greenhouse_Ridge', (gx, 0, body_h + 3.38), (5.35, 0.12, 0.10), mats['metal_dark'])
    for rx in (-5.6, -4.4, -3.2, -2.0, -0.8):
        box(f'Greenhouse_Rib_{rx}', (rx, -1.52, body_h + 1.65), (0.08, 0.08, 1.45), mats['metal_dark'])
        box(f'Greenhouse_RibB_{rx}', (rx, 1.52, body_h + 1.65), (0.08, 0.08, 1.45), mats['metal_dark'])
    box('Greenhouse_Glow', (gx, 0, body_h + 1.45), (3.8, 1.8, 0.8), mats['lamp_glow'], tint=False)

    # Coffee patio terrace: wooden deck, round table, two chairs & umbrella
    cx = 4.6
    box('Patio_Deck', (cx, -0.2, body_h + 0.48), (4.6, 3.4, 0.12), mats['wood_warm'], bevel=0.02)
    cylinder('Patio_Table', (cx, -0.4, body_h + 0.90), 0.78, 0.08, mats['wood_warm'], verts=14, bevel=0.015)
    cylinder('Patio_Leg', (cx, -0.4, body_h + 0.68), 0.07, 0.44, mats['metal_dark'], verts=8)
    cylinder('Patio_Pole', (cx, -0.4, body_h + 1.72), 0.045, 1.75, mats['metal_light'], verts=8)
    cone('Patio_Umbrella', (cx, -0.4, body_h + 2.62), 1.45, 0.12, 0.50, mats['laundry_a'], verts=12)
    for side, ox in (('L', cx - 1.15), ('R', cx + 1.15)):
        box(f'Patio_ChairSeat_{side}', (ox, -0.4, body_h + 0.74), (0.46, 0.46, 0.06), mats['wood_warm'], bevel=0.015)
        box(f'Patio_ChairBack_{side}', (ox + (-0.20 if side == 'L' else 0.20), -0.4, body_h + 0.98), (0.06, 0.46, 0.46), mats['wood_warm'], bevel=0.015)
        cylinder(f'Patio_ChairLeg_{side}', (ox, -0.4, body_h + 0.62), 0.04, 0.22, mats['metal_dark'], verts=8)

    add_tree('Grad_Ginkgo_L', -11.4, -1.6, 0.0, 7.2, 2.25, mats, rng, is_ginkgo=True, with_planter=True)
    add_tree('Grad_Ginkgo_R', 11.4, -1.6, 0.0, 7.4, 2.35, mats, rng, is_ginkgo=True, with_planter=True)
    return rows, cols


def build_staff(mats, rng):
    """教职工宿舍楼 · 桂花院: 3x4 = 12 wide cozy windows, Tudor braces, roof rafters, chimney flues, tea set & Yukimi lantern."""
    rows, cols = 3, 4
    gap_x, gap_y = 3.4, 3.1
    row_z0 = 4.75
    body_w, body_d, body_h = 15.6, 6.8, 12.4
    front_y = -body_d / 2.0

    box('Dorm_Plinth', (0, 0, 0.7), (body_w + 0.5, body_d + 0.5, 1.4), mats['stone_ground'], bevel=0.04)
    box('Dorm_Body', (0, 0, body_h / 2.0 + 0.6), (body_w, body_d, body_h - 1.2), mats['plaster_cream'], bevel=0.04)
    box('WaterTable_L', (-5.0, front_y - 0.26, 1.42), (5.8, 0.14, 0.14), mats['stone_trim'], bevel=0.02)
    box('WaterTable_R', (5.0, front_y - 0.26, 1.42), (5.8, 0.14, 0.14), mats['stone_trim'], bevel=0.02)
    add_downspouts(front_y, body_w, body_h, mats['copper'], mats['metal_dark'], x_positions=(-7.35, 7.35))

    # Exposed warm Tudor timber beams + diagonal upper half-timber knee braces
    for bx in (-body_w / 2.0 + 0.2, -3.4, 3.4, body_w / 2.0 - 0.2):
        box(f'Beam_V_{bx}', (bx, front_y - 0.04, body_h / 2.0 + 0.4), (0.28, 0.14, body_h - 0.8), mats['wood_warm'], bevel=0.015)
    for r in range(1, rows):
        z = row_z0 + (r - 0.5) * gap_y
        box(f'Beam_H_{r}', (0, front_y - 0.05, z), (body_w + 0.2, 0.16, 0.26), mats['wood_warm'], bevel=0.02)
    for bx, rot_y in ((-6.8, 0.72), (-4.0, -0.72), (4.0, 0.72), (6.8, -0.72)):
        box(f'Beam_Diag_{bx}', (bx, front_y - 0.04, body_h - 0.62), (0.14, 0.12, 1.0), mats['wood_warm'], bevel=0.01, rot=(0, rot_y, 0))

    add_window_grid(mats, rows, cols, gap_x, gap_y, row_z0, front_y, 2.05, 1.9,
                    mats['wood_warm'], mats['wood_warm'], shutter_mat=mats['shutter_slate'],
                    corbel_mat=mats['wood_warm'], add_planters=True, add_shutters=True)

    # Steep mossy pitched roof + raised tile ribs + exposed wooden eave rafters + chimney flues
    roof_w = body_w + 1.5
    roof_d = body_d + 1.5
    ridge_h = 3.8
    roof_z = body_h + 0.28
    box('Roof_Eaves', (0, 0, body_h + 0.15), (body_w + 1.3, body_d + 1.3, 0.24), mats['wood_warm'], bevel=0.03)
    for ri in range(13):
        rx = -body_w * 0.48 + (ri / 12.0) * (body_w * 0.96)
        box(f'Roof_Rafter_F_{ri}', (rx, front_y - 0.56, body_h - 0.06), (0.14, 0.48, 0.16), mats['wood_warm'], bevel=0.015, rot=(0.24, 0, 0))
    gable_prism('Roof_Pitched', (0, 0, roof_z), roof_w, roof_d, ridge_h, mats['roof_moss'], bevel=0.03)
    box('Roof_Ridge', (0, 0, roof_z + ridge_h + 0.04), (roof_w + 0.15, 0.28, 0.22), mats['wood_warm'], bevel=0.02)

    slope_len = math.hypot(roof_d / 2.0, ridge_h)
    slope_ang = math.atan2(ridge_h, roof_d / 2.0)
    for ri in range(13):
        rx = -roof_w * 0.46 + (ri / 12.0) * (roof_w * 0.92)
        if 3.6 < rx < 5.2:
            continue
        for side_s, ang_s in ((-1.0, slope_ang), (1.0, -slope_ang)):
            box(f'StaffRoof_Rib_{ri}_{int(side_s)}', (rx, side_s * (roof_d * 0.25), roof_z + ridge_h * 0.50 + 0.05),
                (0.13, slope_len * 0.98, 0.11), mats['roof_moss'], bevel=0.012, rot=(ang_s, 0, 0))

    gable_prism('Season_Snow_Roof', (0, 0, body_h + 0.44), roof_w + 0.04, roof_d + 0.04, ridge_h - 0.02, mats['snow_cap'], bevel=0.04, tint=False)
    box('Chimney_Base', (4.4, 1.2, body_h + 3.2), (1.1, 1.1, 2.4), mats['brick_red'], bevel=0.03)
    box('Chimney_Cap', (4.4, 1.2, body_h + 4.48), (1.38, 1.38, 0.22), mats['trim_cream'], bevel=0.02)
    cylinder('Chimney_Pot_L', (4.15, 1.2, body_h + 4.78), 0.14, 0.42, mats['terracotta'], verts=10)
    cylinder('Chimney_Pot_R', (4.65, 1.2, body_h + 4.78), 0.14, 0.42, mats['terracotta'], verts=10)
    box('Season_Snow_Chimney', (4.4, 1.2, body_h + 4.64), (1.3, 1.3, 0.11), mats['snow_cap'], bevel=0.03, tint=False)

    # Cozy timber entrance porch + carved brackets + hanging lantern + steps
    add_grand_entrance(mats, 0.0, front_y, door_w=1.90, door_h=2.02, z_thresh=0.34,
                       frame_mat=mats['wood_warm'], trim_mat=mats['stone_trim'],
                       door_metal_mat=mats['wood_warm'], with_steps=True, with_pilasters=True, with_sconces=True)
    gable_prism('Entrance_Porch_Roof', (0, front_y - 0.88, 2.46), 3.45, 1.88, 0.78, mats['roof_moss'], bevel=0.02)
    for px in (-1.45, 1.45):
        box(f'Porch_Post_{px}', (px, front_y - 1.56, 1.25), (0.16, 0.16, 2.40), mats['wood_warm'], bevel=0.015)
        box(f'Porch_PostBase_{px}', (px, front_y - 1.56, 0.14), (0.26, 0.26, 0.28), mats['stone_trim'], bevel=0.02)
        box(f'Porch_Brace_{px}', (px, front_y - 1.18, 2.26), (0.12, 0.64, 0.12), mats['wood_warm'], bevel=0.01, rot=(-0.55, 0, 0))
    box('Porch_HangLantern', (0, front_y - 1.54, 2.34), (0.24, 0.24, 0.28), mats['lantern_warm'], bevel=0.02, tint=False)
    gable_prism('Season_Snow_Porch', (0, front_y - 0.88, 2.57), 3.48, 1.90, 0.76, mats['snow_cap'], bevel=0.03, tint=False)

    # Climbing ivy clusters hugging left/right wall corners
    for side, sx in (('L', -body_w / 2.0 + 0.45), ('R', body_w / 2.0 - 0.45)):
        for k in range(10):
            iz = 1.0 + k * 1.12
            ix = sx + rng.uniform(-0.32, 0.32)
            ico(f'Season_Vines_{side}_{k}', (ix, front_y - 0.11, iz), rng.uniform(0.24, 0.38),
                mats['leaf_main'] if k % 2 == 0 else mats['leaf_accent'], sub=1, scale=(1.35, 0.35, 1.1))

    # Stone stepping pavers + tea-set table & stools on left courtyard
    for si, (sx, sy) in enumerate([(0.0, front_y - 1.7), (-0.8, front_y - 2.15), (-1.9, front_y - 2.35), (-3.0, front_y - 2.35)]):
        cylinder(f'Stepping_Stone_{si}', (sx, sy, 0.03), 0.36, 0.06, mats['stone_trim'], verts=10, bevel=0.015)
    tx, ty = -4.6, front_y - 2.35
    cylinder('Stone_Table_Top', (tx, ty, 0.72), 0.86, 0.12, mats['stone_ground'], verts=14, bevel=0.02)
    cylinder('Stone_Table_Leg', (tx, ty, 0.36), 0.28, 0.68, mats['stone_ground'], verts=10)
    # Teapot & 3 teacups resting on the table
    ico('Tea_Pot', (tx - 0.12, ty + 0.06, 0.88), 0.13, mats['terracotta'], sub=1, scale=(1.1, 1.1, 0.9))
    cylinder('Tea_Pot_Lid', (tx - 0.12, ty + 0.06, 0.99), 0.06, 0.04, mats['terracotta'], verts=8)
    for ci, ang in enumerate((0.4, 2.4, 4.5)):
        cylinder(f'Tea_Cup_{ci}', (tx + math.cos(ang) * 0.36, ty + math.sin(ang) * 0.36, 0.82), 0.055, 0.08, mats['trim_cream'], verts=8)
    for i, ang in enumerate((0.2, 2.3, 4.4)):
        cylinder(f'Stone_Stool_{i}', (tx + math.cos(ang) * 1.18, ty + math.sin(ang) * 1.18, 0.24),
                 0.27, 0.48, mats['stone_ground'], verts=10, bevel=0.02)

    # Tiered carved Yukimi-inspired courtyard stone lantern on right
    lx, ly = 4.6, front_y - 2.25
    cylinder('Lantern_Foot', (lx, ly, 0.10), 0.42, 0.20, mats['stone_trim'], verts=6, bevel=0.02)
    cylinder('Lantern_Post', (lx, ly, 0.54), 0.16, 0.72, mats['stone_ground'], verts=8)
    box('Lantern_Plate', (lx, ly, 0.96), (0.56, 0.56, 0.12), mats['stone_trim'], bevel=0.02)
    box('Lantern_Light', (lx, ly, 1.20), (0.34, 0.34, 0.34), mats['lantern_warm'], bevel=0.01, tint=False)
    cone('Lantern_Roof', (lx, ly, 1.54), 0.56, 0.10, 0.36, mats['roof_slate'], verts=6)
    ico('Lantern_Finial', (lx, ly, 1.76), 0.09, mats['brass'], sub=1)

    add_hedge_strip('Staff_Hedge_R', 6.4, front_y - 0.8, 0.0, 3.2, 0.68, 0.5, mats, rng)
    add_tree('Staff_Osmanthus_R', 10.6, -1.2, 0.0, 5.3, 1.9, mats, rng, with_planter=True)
    return rows, cols


def build_campus_grounds(mats, rng):
    """Shared Stardew-3D campus diorama plate: cobble avenue, brick-pier wrought fence, benches, crosswalk & neighbors."""
    # Main ground grass & stone apron (preserve Campus_Grass_* and Campus_Road* prefixes for shadow exclusion)
    box('Campus_Grass_Base', (0, 2.0, -0.4), (78.0, 48.0, 0.8), mats['lawn_grass'], bevel=0.05, top_z=4.0, half_w=40.0)
    box('Campus_Stone_Plaza', (0, -3.5, 0.02), (25.4, 12.2, 0.12), mats['stone_ground'], bevel=0.03)
    box('Campus_Road', (0, -9.2, 0.04), (78.0, 4.4, 0.12), mats['cobble'], bevel=0.02)
    box('Campus_Curb_N', (0, -7.0, 0.08), (78.0, 0.30, 0.18), mats['trim_cream'], bevel=0.015)
    box('Campus_Curb_S', (0, -11.4, 0.08), (78.0, 0.30, 0.18), mats['trim_cream'], bevel=0.015)

    # Zebra pedestrian crosswalk stones in foreground center
    for ci in range(7):
        cx = -3.6 + ci * 1.2
        box(f'Campus_Road_Crosswalk_{ci}', (cx, -9.2, 0.11), (0.62, 3.3, 0.03), mats['stone_trim'], bevel=0.01)

    # Vintage street lamps along the avenue (KEEP glowing bulb center at (-12.2/12.2/-26/26, -7.92, 4.86)!)
    for i, lx in enumerate((-12.2, 12.2, -26.0, 26.0)):
        ly = -7.2
        cylinder(f'AveLamp_Foot_{i}', (lx, ly, 0.14), 0.32, 0.28, mats['stone_trim'], verts=10, bevel=0.02)
        cylinder(f'AveLamp_Base_{i}', (lx, ly, 0.55), 0.20, 0.62, mats['metal_dark'], verts=10)
        cylinder(f'AveLamp_Pole_{i}', (lx, ly, 2.85), 0.075, 4.4, mats['metal_dark'], verts=10)
        torus(f'AveLamp_Collar_{i}', (lx, ly, 1.05), 0.16, 0.035, mats['brass'])
        box(f'AveLamp_Arm_{i}', (lx, ly - 0.35, 5.08), (0.10, 0.80, 0.10), mats['metal_dark'], bevel=0.01)
        box(f'AveLamp_Bracket_{i}', (lx, ly - 0.24, 4.82), (0.06, 0.42, 0.06), mats['brass'], rot=(-0.65, 0, 0))
        box(f'AveLamp_Bulb_{i}', (lx, ly - 0.72, 4.86), (0.38, 0.38, 0.38), mats['lamp_glow'], bevel=0.02, tint=False)
        cone(f'AveLamp_Cap_{i}', (lx, ly - 0.72, 5.15), 0.36, 0.06, 0.25, mats['metal_dark'], verts=8)
        ico(f'AveLamp_Tip_{i}', (lx, ly - 0.72, 5.30), 0.06, mats['brass'], sub=1)

    # 4 Slatted wooden & wrought-iron campus benches along the front avenue promenade
    for bi, bx in enumerate((-16.2, -8.8, 8.8, 16.2)):
        by = -6.28
        box(f'Bench_Seat_{bi}', (bx, by, 0.44), (1.9, 0.52, 0.08), mats['wood_warm'], bevel=0.015)
        box(f'Bench_Back_{bi}', (bx, by + 0.22, 0.76), (1.9, 0.08, 0.42), mats['wood_warm'], bevel=0.015, rot=(-0.18, 0, 0))
        for lx_off in (-0.78, 0.78):
            box(f'Bench_Leg_{bi}_{lx_off}', (bx + lx_off, by, 0.22), (0.10, 0.50, 0.44), mats['metal_dark'], bevel=0.01)
            box(f'Bench_Arm_{bi}_{lx_off}', (bx + lx_off, by, 0.62), (0.08, 0.52, 0.06), mats['metal_dark'], bevel=0.01)

    # Brick-pier wrought-iron campus boundary wall in background (replacing plain rectangle)
    wall_y = 16.0
    box('Back_Brick_Base', (0, wall_y, 0.42), (76.0, 0.62, 0.84), mats['brick_red'], bevel=0.03)
    box('Back_Wall_Coping', (0, wall_y, 0.88), (76.2, 0.72, 0.12), mats['stone_trim'], bevel=0.015)
    box('Back_Iron_Rail_Top', (0, wall_y, 1.82), (75.0, 0.08, 0.08), mats['metal_dark'])
    box('Back_Iron_Rail_Mid', (0, wall_y, 1.32), (75.0, 0.06, 0.06), mats['metal_dark'])
    # 11 brick piers with stone caps & warm pier lanterns
    for pi in range(11):
        px = -35.0 + pi * 7.0
        box(f'Back_Pier_{pi}', (px, wall_y, 1.15), (0.92, 0.92, 2.30), mats['brick_red'], bevel=0.03)
        box(f'Back_PierCap_{pi}', (px, wall_y, 2.36), (1.12, 1.12, 0.18), mats['stone_trim'], bevel=0.02)
        if pi % 2 == 1:
            box(f'Back_PierLamp_{pi}', (px, wall_y, 2.60), (0.34, 0.34, 0.30), mats['lantern_warm'], bevel=0.015, tint=False)
            cone(f'Back_PierRoof_{pi}', (px, wall_y, 2.86), 0.34, 0.06, 0.20, mats['metal_dark'], verts=4)
    # Wrought-iron fence pickets between piers
    for xi in range(110):
        px = -34.4 + xi * 0.63
        if any(abs(px - (-35.0 + pi * 7.0)) < 0.65 for pi in range(11)):
            continue
        box(f'Wall_Picket_{xi}', (px, wall_y, 1.44), (0.05, 0.05, 1.05), mats['metal_dark'])

    # Richer background neighbor buildings with cornices, penthouses & dim warm silhouette windows
    neighbors = [
        ('Neighbor_West', (-28.5, 4.5, 0.0), (14.5, 5.5, 11.5), mats['neighbor'], True),
        ('Neighbor_East', (28.5, 4.5, 0.0), (15.0, 5.8, 13.5), mats['neighbor'], False),
        ('Neighbor_NorthW', (-20.0, 21.0, 0.0), (18.0, 6.0, 14.0), mats['neighbor'], True),
        ('Neighbor_NorthE', (21.0, 21.5, 0.0), (17.0, 5.8, 12.5), mats['neighbor'], False),
    ]
    for name, (nx, ny, nz), (nw, nd, nh), nmat, pitched in neighbors:
        box(f'{name}_Body', (nx, ny, nh / 2.0), (nw, nd, nh), nmat, bevel=0.04, top_z=16.0, half_w=38.0)
        box(f'{name}_Cornice', (nx, ny, nh - 0.18), (nw + 0.45, nd + 0.45, 0.34), mats['roof_slate'], bevel=0.02)
        if pitched:
            gable_prism(f'{name}_Roof', (nx, ny, nh), nw + 0.85, nd + 0.85, 2.7, mats['roof_slate'], bevel=0.02)
            box(f'{name}_Ridge', (nx, ny, nh + 2.72), (nw + 0.9, 0.25, 0.18), mats['metal_dark'])
        else:
            box(f'{name}_Roof', (nx, ny, nh + 0.25), (nw + 0.6, nd + 0.6, 0.5), mats['roof_slate'], bevel=0.03)
            box(f'{name}_Penthouse', (nx - nw * 0.18, ny, nh + 1.05), (nw * 0.28, nd * 0.45, 1.2), mats['roof_slate'], bevel=0.02)
        for r in range(3):
            for c in range(4):
                if rng.random() > 0.42:
                    wx = nx + (c - 1.5) * (nw * 0.21)
                    wz = 2.6 + r * (nh * 0.24)
                    box(f'{name}_Glow_{r}_{c}', (wx, ny - nd / 2.0 - 0.06, wz), (0.85, 0.08, 1.15), mats['lamp_glow'], tint=False)

    # Campus trees in stone planters + lush lawn hedges
    add_hedge_strip('Campus_Hedge_FL', -16.5, -6.5, 0.0, 5.2, 0.72, 0.55, mats, rng)
    add_hedge_strip('Campus_Hedge_FR', 16.5, -6.5, 0.0, 5.2, 0.72, 0.55, mats, rng)
    for i, (tx, ty, th, tr, ginkgo) in enumerate([
        (-16.5, -5.2, 4.7, 1.65, False),
        (16.5, -5.2, 5.0, 1.75, True),
        (-21.0, -13.2, 4.5, 1.55, False),
        (21.5, -13.2, 4.9, 1.70, True),
        (-14.0, 8.5, 5.7, 2.05, False),
        (14.5, 8.5, 5.5, 1.95, True),
    ]):
        add_tree(f'Campus_Tree_{i}', tx, ty, 0.0, th, tr, mats, rng, is_ginkgo=ginkgo, with_planter=True)
    return 0, 0


# ------------------------------------------------------------------ Static Mesh Batcher (60+ FPS Draw Call Consolidation)

def _classify_batch_bucket(ob):
    """Return merge group key or None if mesh must remain an independent node."""
    name = ob.name or ''
    if ob.type != 'MESH' or not ob.data.materials:
        return None
    if name.startswith('Window_Glass_') or name == 'Entrance_Door' or name.startswith('AC_Fan_'):
        return None
    mat = ob.data.materials[0]
    mat_name = mat.name if mat else 'Default'
    if name.startswith('Season_Snow_'):
        return ('Season_Snow_Merged', mat_name)
    if name.startswith('Season_Vines_'):
        return ('Season_Vines_Merged', mat_name)
    if name.startswith('Laundry_') or mat_name.startswith('Mat_Laundry_'):
        return ('Laundry_Merged', mat_name)
    if name.startswith('Campus_Grass_'):
        return ('Campus_Grass_Merged', mat_name)
    if name.startswith('Campus_Road'):
        return ('Campus_Road_Merged', mat_name)
    return ('Static_Merged', mat_name)


def merge_static_meshes():
    """Merge static meshes sharing bucket+material after world transform baking so draw calls drop dramatically."""
    buckets = {}
    for ob in list(bpy.context.scene.objects):
        key = _classify_batch_bucket(ob)
        if key is None:
            continue
        buckets.setdefault(key, []).append(ob)

    for (prefix, mat_name), objs in buckets.items():
        if len(objs) <= 1:
            continue
        for ob in objs:
            if not ob.data.uv_layers:
                apply_box_uv(ob)
            if COLOR_ATTR not in ob.data.color_attributes:
                bake_ao(ob, flat_white=True)
            ob.data.transform(ob.matrix_world)
            ob.matrix_world = Matrix.Identity(4)

        bpy.ops.object.select_all(action='DESELECT')
        for ob in objs:
            ob.select_set(True)
        bpy.context.view_layer.objects.active = objs[0]
        objs[0].name = f'{prefix}_{mat_name}'
        bpy.ops.object.join()


BUILDERS = {
    'highschool': build_highschool,
    'university': build_university,
    'grad': build_grad,
    'staff': build_staff,
    'grounds': build_campus_grounds,
}


def export_glb(path):
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    bpy.ops.object.select_all(action='SELECT')
    wanted = {
        'filepath': os.path.abspath(path),
        'export_format': 'GLB',
        'export_apply': True,
        'use_selection': False,
        'export_yup': True,
        'export_normals': True,
        'export_texcoords': True,
        'export_vertex_color': 'ACTIVE',
        'export_all_vertex_colors': False,
        'export_animations': False,
        'export_cameras': False,
        'export_lights': False,
    }
    known = bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
    kwargs = {k: v for k, v in wanted.items() if k == 'filepath' or k in known}
    bpy.ops.export_scene.gltf(**kwargs)


def build_target(target, out_dir=OUT_DIR, seed=20261118, preview_keep=False):
    clear_scene()
    mats = create_material_library()
    rng = random.Random(seed + sum(ord(ch) for ch in target))
    rows, cols = BUILDERS[target](mats, rng)

    if rows > 0 and cols > 0:
        expected = {f'Window_Glass_{r}_{c}' for r in range(rows) for c in range(cols)}
        found = {ob.name for ob in bpy.context.scene.objects if ob.type == 'MESH' and ob.name.startswith('Window_Glass_')}
        missing = sorted(expected - found)
        if missing:
            raise RuntimeError(f'{target} missing panes: {missing}')

    merge_static_meshes()

    filename = 'campus_grounds.glb' if target == 'grounds' else f'dorm_{target}.glb'
    out_path = os.path.join(out_dir, filename)
    export_glb(out_path)

    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    tris = 0
    for o in meshes:
        o.data.calc_loop_triangles()
        tris += len(o.data.loop_triangles)
    size_kb = os.path.getsize(out_path) / 1024.0
    print(f'[build_campus_v4] {target}: {len(meshes)} meshes, {tris} tris -> {filename} ({size_kb:.1f} KB)')
    return out_path, len(meshes), tris, size_kb


def main():
    args = list(sys.argv)
    if '--' in args:
        args = args[args.index('--') + 1:]
    else:
        args = args[1:]
    parser = argparse.ArgumentParser()
    parser.add_argument('--target', default='all', choices=['all', *BUILDERS.keys()])
    parser.add_argument('--out-dir', default=OUT_DIR)
    opt, _ = parser.parse_known_args(args)

    targets = list(BUILDERS.keys()) if opt.target == 'all' else [opt.target]
    for t in targets:
        build_target(t, out_dir=opt.out_dir)


if __name__ == '__main__':
    main()

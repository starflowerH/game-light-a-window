"""Blender 5.3 headless & MCP generator for《今晚，亮一盏灯》v4.0 Stardew-3D campus dioramas.

Produces 5 GLB files in public/models/:
  1. dorm_highschool.glb  (3x6 = 18 windows, red brick & gable tile roof, bike shed, bulletin board)
  2. dorm_university.glb  (4x6 = 24 windows, #17 dorm colonnade, laundry, AC, duty kiosk, water tower)
  3. dorm_grad.glb        (5x6 = 30 windows, modern stone, glass balconies, rooftop conservatory)
  4. dorm_staff.glb       (3x4 = 12 wide windows, timber beams, mossy tile roof, chimney, vines, stone table)
  5. campus_grounds.glb   (shared cobblestone boulevard, perimeter brick fence, streetlamps, trees & neighbor blocks)

Every interactive pane is strictly named `Window_Glass_<row>_<col>` (row 0 = ground floor).
Seasonal snow drifts are named `Season_Snow_*`, climbing vines `Season_Vines_*`,
and tree canopies `Tree_Canopy_*` so Three.js can dynamically drive 4 seasons & weather.
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
        'metal_dark': make_mat('Mat_Metal_Dark', (0.18, 0.20, 0.25), rough=0.52, metal=0.45),
        'metal_light': make_mat('Mat_Metal_Light', (0.58, 0.61, 0.66), rough=0.45, metal=0.5),
        'glass_dark': make_mat('Mat_Glass_Dark', (0.10, 0.14, 0.22), rough=0.25),
        'glass_rail': make_mat('Mat_Glass_Rail', (0.65, 0.80, 0.92), rough=0.18, alpha=0.42),
        'stone_ground': make_mat('Mat_Ground_Stone', (0.25, 0.27, 0.33), rough=0.82),
        'lawn_grass': make_mat('Mat_Ground_Grass', (0.19, 0.31, 0.24), rough=0.92),
        'cobble': make_mat('Mat_Ground_Cobble', (0.35, 0.34, 0.38), rough=0.76),
        'terracotta': make_mat('Mat_Pot_Terracotta', (0.62, 0.34, 0.25), rough=0.82),
        'leaf_main': make_mat('Mat_Leaf_Main', (0.24, 0.42, 0.28), rough=0.88),
        'leaf_accent': make_mat('Mat_Leaf_Accent', (0.31, 0.50, 0.33), rough=0.88),
        'trunk': make_mat('Mat_Trunk', (0.28, 0.20, 0.15), rough=0.92),
        'snow_cap': make_mat('Mat_Snow_Cap', (0.90, 0.94, 0.99), rough=0.65),
        'lamp_glow': make_mat('Mat_Lamp_Glow', (1.00, 0.80, 0.45), rough=0.3, emission=2.0),
        'door_glow': make_mat('Mat_Door_Glow', (1.00, 0.72, 0.38), rough=0.4, emission=1.2),
        'laundry_a': make_mat('Mat_Laundry_A', (0.86, 0.46, 0.42), rough=0.9),
        'laundry_b': make_mat('Mat_Laundry_B', (0.54, 0.72, 0.88), rough=0.9),
        'laundry_c': make_mat('Mat_Laundry_C', (0.92, 0.84, 0.62), rough=0.9),
        'cat_orange': make_mat('Mat_Cat_Orange', (0.86, 0.52, 0.24), rough=0.85),
        'board_green': make_mat('Mat_Board_Green', (0.14, 0.28, 0.22), rough=0.88),
        'neighbor': make_mat('Mat_Neighbor_Sil', (0.16, 0.20, 0.30), rough=0.9),
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


def bake_ao(ob, top_z=18.0, half_w=11.0):
    me = ob.data
    attr = me.color_attributes.get(COLOR_ATTR)
    if attr is None:
        attr = me.color_attributes.new(name=COLOR_ATTR, type='FLOAT_COLOR', domain='POINT')
    mw = ob.matrix_basis
    rot = mw.to_3x3()
    data = attr.data
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
    if bevel > 0.0:
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
    if tint:
        bake_ao(ob, top_z=top_z, half_w=half_w)
    return ob


def box(name, loc, size, mat, bevel=0.02, segments=1, rot=(0.0, 0.0, 0.0), tint=True, top_z=18.0, half_w=11.0):
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


def cone(name, loc, r1, r2, depth, mat, verts=12, tint=True):
    bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r1, radius2=r2, depth=depth, end_fill_type='NGON', location=(0, 0, 0))
    ob = bpy.context.object
    ob.location = loc
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


def add_window_grid(mats, rows, cols, gap_x, gap_y, row_z0, front_y, win_w, win_h,
                    frame_mat, sill_mat, snow_prefix=True, add_planters=False):
    for r in range(rows):
        for c in range(cols):
            x = (c - (cols - 1) / 2.0) * gap_x
            z = row_z0 + r * gap_y
            box(f'Window_Frame_{r}_{c}', (x, front_y - 0.03, z),
                (win_w + 0.36, 0.24, win_h + 0.36), frame_mat, bevel=0.025)
            # Window glass pane sits slightly proud of frame back so raycaster hits it cleanly
            box(f'Window_Glass_{r}_{c}', (x, front_y - 0.12, z),
                (win_w, 0.08, win_h), mats['glass_dark'], bevel=0.01, tint=False)
            box(f'Sill_{r}_{c}', (x, front_y - 0.20, z - win_h / 2.0 - 0.22),
                (win_w + 0.56, 0.38, 0.14), sill_mat, bevel=0.02)
            box(f'Hood_{r}_{c}', (x, front_y - 0.16, z + win_h / 2.0 + 0.22),
                (win_w + 0.44, 0.28, 0.12), sill_mat, bevel=0.02)
            if snow_prefix and (r == rows - 1 or (r + c) % 2 == 0):
                box(f'Season_Snow_Sill_{r}_{c}', (x, front_y - 0.22, z - win_h / 2.0 - 0.12),
                    (win_w + 0.48, 0.32, 0.09), mats['snow_cap'], bevel=0.03, tint=False)
            if add_planters and (r + c) % 4 == 1 and r > 0:
                box(f'WinBox_{r}_{c}', (x - 0.25, front_y - 0.32, z - win_h / 2.0 - 0.07),
                    (0.55, 0.20, 0.18), mats['terracotta'], bevel=0.02)
                ico(f'Season_Vines_Win_{r}_{c}', (x - 0.25, front_y - 0.33, z - win_h / 2.0 + 0.08),
                    0.14, mats['leaf_accent'], sub=1, scale=(1.5, 0.8, 0.7))


def add_bicycle(name_prefix, x, y, z, rot_z, mats):
    g_x, g_y = x, y
    wheel_rot = (0.0, math.pi / 2.0, rot_z)
    torus(f'{name_prefix}_WheelR', (g_x - 0.48, g_y, z + 0.38), 0.34, 0.045, mats['metal_dark'], rot=wheel_rot)
    torus(f'{name_prefix}_WheelF', (g_x + 0.48, g_y, z + 0.38), 0.34, 0.045, mats['metal_dark'], rot=wheel_rot)
    box(f'{name_prefix}_Frame', (g_x, g_y, z + 0.62), (0.96, 0.06, 0.06), mats['wood_green'], bevel=0.01)
    box(f'{name_prefix}_Seat', (g_x - 0.28, g_y, z + 0.84), (0.24, 0.12, 0.06), mats['wood_warm'], bevel=0.015)
    box(f'{name_prefix}_Bar', (g_x + 0.44, g_y, z + 0.86), (0.06, 0.34, 0.05), mats['metal_light'], bevel=0.01)


def add_tree(prefix, x, y, z, height, canopy_r, mats, rng, is_ginkgo=False):
    cylinder(f'{prefix}_Trunk', (x, y, z + height * 0.42), 0.24, height * 0.85, mats['trunk'], verts=8, bevel=0.02)
    mat_a = mats['leaf_main']
    mat_b = mats['leaf_accent']
    blobs = 5 if not is_ginkgo else 6
    for i in range(blobs):
        dx = rng.uniform(-canopy_r * 0.42, canopy_r * 0.42)
        dy = rng.uniform(-canopy_r * 0.32, canopy_r * 0.32)
        dz = height * 0.78 + i * (canopy_r * 0.22)
        r = canopy_r * rng.uniform(0.62, 0.95)
        ico(f'Tree_Canopy_{prefix}_{i}', (x + dx, y + dy, z + dz), r, mat_a if i % 2 == 0 else mat_b,
            sub=2, scale=(1.15, 1.05, 0.82))
        if i >= blobs - 2:
            ico(f'Season_Snow_Tree_{prefix}_{i}', (x + dx, y + dy, z + dz + r * 0.56), r * 0.72,
                mats['snow_cap'], sub=1, scale=(1.1, 1.0, 0.36), tint=False)


def build_highschool(mats, rng):
    """高中宿舍楼 · 晨光楼: 3x6 = 18 windows, red brick, gable terracotta tile roof, bulletin board, bike shed."""
    rows, cols = 3, 6
    gap_x, gap_y = 2.6, 3.0
    row_z0 = 4.45
    body_w, body_d, body_h = 17.4, 6.0, 12.2
    front_y = -body_d / 2.0

    # Brick plinth + upper plaster body
    box('Dorm_Plinth', (0, 0, 1.3), (body_w + 0.35, body_d + 0.35, 2.6), mats['brick_red'], bevel=0.04)
    box('Dorm_Body', (0, 0, body_h / 2.0 + 1.2), (body_w, body_d, body_h - 2.4), mats['plaster_cream'], bevel=0.04)
    for r in range(1, rows):
        z = row_z0 + (r - 0.5) * gap_y
        box(f'Floor_Band_{r}', (0, front_y - 0.03, z), (body_w + 0.25, 0.16, 0.22), mats['brick_red'], bevel=0.02)

    add_window_grid(mats, rows, cols, gap_x, gap_y, row_z0, front_y, 1.5, 1.85,
                    mats['wood_green'], mats['trim_cream'], add_planters=False)

    # Gable pitched terracotta roof + eaves trim + snow blanket
    box('Roof_Eaves', (0, 0, body_h + 0.15), (body_w + 1.1, body_d + 1.1, 0.30), mats['trim_cream'], bevel=0.03)
    gable_prism('Roof_Pitched', (0, 0, body_h + 0.3), body_w + 1.3, body_d + 1.3, 3.4, mats['roof_terracotta'], bevel=0.03)
    box('Roof_Ridge', (0, 0, body_h + 3.72), (body_w + 1.4, 0.28, 0.22), mats['trim_cream'], bevel=0.02)
    # Dormer window gable on roof center
    box('Dormer_Box', (0, front_y * 0.42, body_h + 1.6), (2.4, 2.2, 1.8), mats['plaster_cream'], bevel=0.03)
    gable_prism('Dormer_Roof', (0, front_y * 0.42, body_h + 2.5), 2.7, 2.5, 1.1, mats['roof_terracotta'], bevel=0.02)
    box('Dormer_Glass', (0, front_y * 0.42 - 1.12, body_h + 1.55), (1.1, 0.1, 1.0), mats['lamp_glow'], bevel=0.01, tint=False)
    gable_prism('Season_Snow_Roof', (0, 0, body_h + 0.44), body_w + 1.32, body_d + 1.32, 3.38, mats['snow_cap'], bevel=0.04)

    # Entrance porch + school plaque + bulletin blackboard (clear of row 0 sills at z ~ 3.3)
    box('Entrance_Frame', (0, front_y - 0.08, 1.25), (2.4, 0.22, 2.4), mats['brick_red'], bevel=0.03)
    box('Entrance_Door', (0, front_y - 0.14, 1.18), (1.9, 0.14, 2.15), mats['door_glow'], bevel=0.02, tint=False)
    box('Entrance_Canopy', (0, front_y - 0.85, 2.60), (3.2, 1.6, 0.22), mats['roof_terracotta'], bevel=0.03)
    box('Season_Snow_Canopy', (0, front_y - 0.85, 2.74), (3.1, 1.55, 0.10), mats['snow_cap'], bevel=0.03, tint=False)
    # Bulletin board on left courtyard
    box('Board_Post_L', (-7.2, front_y - 1.5, 1.1), (0.14, 0.14, 2.2), mats['wood_warm'])
    box('Board_Post_R', (-4.4, front_y - 1.5, 1.1), (0.14, 0.14, 2.2), mats['wood_warm'])
    box('Board_Frame', (-5.8, front_y - 1.5, 1.55), (3.0, 0.16, 1.5), mats['wood_warm'], bevel=0.02)
    box('Board_Face', (-5.8, front_y - 1.58, 1.55), (2.65, 0.08, 1.2), mats['board_green'], tint=False)
    box('Board_Roof', (-5.8, front_y - 1.5, 2.42), (3.25, 0.55, 0.18), mats['roof_terracotta'], bevel=0.02)

    # Covered bike shed on right side
    shed_x, shed_y = 10.6, -1.2
    for px in (shed_x - 1.6, shed_x + 1.6):
        for py in (shed_y - 1.3, shed_y + 1.3):
            cylinder(f'Shed_Post_{px}_{py}', (px, py, 1.25), 0.08, 2.5, mats['metal_dark'], verts=8)
    box('Shed_Roof', (shed_x, shed_y, 2.55), (3.8, 3.2, 0.16), mats['roof_slate'], bevel=0.02, rot=(0.14, 0.0, 0.0))
    box('Season_Snow_Shed', (shed_x, shed_y, 2.66), (3.7, 3.1, 0.10), mats['snow_cap'], bevel=0.03, rot=(0.14, 0.0, 0.0), tint=False)
    for i, bx in enumerate((shed_x - 1.0, shed_x, shed_x + 1.0)):
        add_bicycle(f'HS_Bike_{i}', bx, shed_y - 0.1, 0.0, math.pi / 2.0, mats)

    add_tree('HS_Tree_L', -10.8, -1.5, 0.0, 4.8, 1.7, mats, rng)
    return rows, cols


def build_university(mats, rng):
    """大学宿舍楼 · 17号楼: 4x6 = 24 windows, open corridor, laundry, AC, cat house, water tower."""
    rows, cols = 4, 6
    gap_x, gap_y = 2.7, 3.05
    row_z0 = 4.35
    body_w, body_d, body_h = 17.8, 6.2, 15.0
    front_y = -body_d / 2.0

    box('Dorm_Body', (0, 0, body_h / 2.0), (body_w, body_d, body_h), mats['brick_warm'], bevel=0.04)
    box('Dorm_Plinth', (0, 0, 0.35), (body_w + 0.5, body_d + 0.5, 0.7), mats['trim_cream'], bevel=0.03)
    wing_x = body_w / 2.0 + 0.85
    box('Dorm_Wing_L', (-wing_x, 0.5, 5.4), (1.7, 4.6, 10.8), mats['wing_warm'], bevel=0.04)
    box('Dorm_Wing_R', (wing_x, 0.5, 5.4), (1.7, 4.6, 10.8), mats['wing_warm'], bevel=0.04)
    box('Wing_Cap_L', (-wing_x, 0.5, 10.95), (2.0, 4.9, 0.3), mats['roof_slate'], bevel=0.03)
    box('Wing_Cap_R', (wing_x, 0.5, 10.95), (2.0, 4.9, 0.3), mats['roof_slate'], bevel=0.03)
    for r in range(1, rows):
        z = row_z0 + (r - 0.5) * gap_y
        box(f'Floor_Band_{r}', (0, front_y - 0.03, z), (body_w + 0.25, 0.18, 0.2), mats['trim_cream'], bevel=0.02)

    add_window_grid(mats, rows, cols, gap_x, gap_y, row_z0, front_y, 1.52, 1.9,
                    mats['frame_dark'], mats['trim_cream'], add_planters=True)

    # AC outdoor units + balcony laundry shirts
    for r in range(1, rows):
        for c in range(cols):
            if (r + c) % 3 == 0:
                x = (c - (cols - 1) / 2.0) * gap_x + 1.05
                z = row_z0 + r * gap_y - 0.7
                box(f'AC_Unit_{r}_{c}', (x, front_y - 0.18, z), (0.68, 0.36, 0.44), mats['metal_light'], bevel=0.02)
                cylinder(f'AC_Fan_{r}_{c}', (x - 0.12, front_y - 0.37, z), 0.15, 0.04, mats['metal_dark'], verts=12, rot=(math.pi / 2.0, 0, 0))
    # Clothesline & laundry on 2nd and 3rd floors
    for idx, (r, c, lmat) in enumerate([(1, 1, mats['laundry_a']), (1, 4, mats['laundry_b']), (2, 2, mats['laundry_c'])]):
        x = (c - (cols - 1) / 2.0) * gap_x
        z = row_z0 + r * gap_y - 0.95
        box(f'Laundry_Bar_{idx}', (x, front_y - 0.34, z + 0.28), (1.4, 0.03, 0.03), mats['metal_dark'])
        box(f'Laundry_Shirt_{idx}', (x - 0.22, front_y - 0.35, z), (0.42, 0.06, 0.54), lmat, bevel=0.015)
        box(f'Laundry_Towel_{idx}', (x + 0.30, front_y - 0.35, z + 0.04), (0.32, 0.05, 0.44), mats['trim_cream'], bevel=0.01)

    # Open colonnade corridor + entrance + stray cat house
    walk_y = front_y - 1.35
    box('Corridor_Floor', (0, walk_y, 0.12), (body_w - 0.3, 2.7, 0.24), mats['stone_ground'], bevel=0.03)
    box('Corridor_Canopy', (0, walk_y, 2.95), (body_w - 0.3, 2.7, 0.22), mats['trim_cream'], bevel=0.03)
    box('Season_Snow_Corridor', (0, walk_y, 3.10), (body_w - 0.4, 2.6, 0.10), mats['snow_cap'], bevel=0.03, tint=False)
    for i in range(cols):
        x = (i - (cols - 1) / 2.0) * gap_x
        cylinder(f'Corridor_Col_{i}', (x, walk_y - 1.18, 1.54), 0.14, 2.6, mats['trim_cream'], verts=10)
    for i, x in enumerate((-5.4, 0.0, 5.4)):
        box(f'Porch_Lamp_{i}', (x, walk_y - 0.9, 2.72), (0.36, 0.22, 0.14), mats['lamp_glow'], bevel=0.02, tint=False)
    box('Entrance_Frame', (0, front_y - 0.04, 1.62), (2.3, 0.14, 3.0), mats['frame_dark'], bevel=0.02)
    box('Entrance_Door', (0, front_y - 0.10, 1.58), (1.9, 0.14, 2.68), mats['door_glow'], bevel=0.02, tint=False)
    # Cat house + tiny orange cat beside steps
    box('Cat_House', (-2.8, walk_y - 0.65, 0.42), (0.62, 0.56, 0.48), mats['wood_warm'], bevel=0.02)
    gable_prism('Cat_House_Roof', (-2.8, walk_y - 0.65, 0.66), 0.72, 0.66, 0.32, mats['roof_terracotta'], bevel=0.015)
    ico('Dorm_Orange_Cat', (-2.2, walk_y - 0.65, 0.38), 0.16, mats['cat_orange'], sub=1, scale=(1.2, 0.9, 0.95))

    # Rooftop + water tower + railing + antenna
    box('Roof_Slab', (0, 0, body_h + 0.22), (body_w + 0.7, body_d + 0.7, 0.44), mats['roof_slate'], bevel=0.03)
    box('Roof_Trim', (0, 0, body_h + 0.50), (body_w + 0.9, body_d + 0.9, 0.14), mats['trim_cream'], bevel=0.02)
    box('Season_Snow_RoofSlab', (0, 0, body_h + 0.61), (body_w + 0.6, body_d + 0.6, 0.12), mats['snow_cap'], bevel=0.04, tint=False)
    for x in (-8.8, -4.4, 0.0, 4.4, 8.8):
        for y in (-3.25, 3.25):
            box(f'Roof_Post_{x}_{y}', (x, y, body_h + 0.92), (0.09, 0.09, 0.78), mats['trim_cream'], bevel=0.01)
    box('Roof_Rail_F', (0, -3.25, body_h + 1.30), (17.7, 0.09, 0.09), mats['trim_cream'])
    box('Roof_Rail_B', (0, 3.25, body_h + 1.30), (17.7, 0.09, 0.09), mats['trim_cream'])
    # Water tower
    tx, ty = 4.6, 0.8
    for dx, dy in ((-0.8, -0.8), (0.8, -0.8), (-0.8, 0.8), (0.8, 0.8)):
        cylinder(f'Tower_Leg_{dx}_{dy}', (tx + dx, ty + dy, body_h + 1.35), 0.09, 1.7, mats['metal_dark'], verts=8)
    cylinder('Tower_Tank', (tx, ty, body_h + 2.95), 1.15, 1.65, mats['roof_slate'], verts=16)
    cone('Tower_Cap', (tx, ty, body_h + 4.02), 1.3, 0.15, 0.55, mats['roof_slate'], verts=16)
    cone('Season_Snow_Tower', (tx, ty, body_h + 4.12), 1.25, 0.12, 0.48, mats['snow_cap'], verts=16, tint=False)
    cylinder('Roof_Antenna', (-5.6, 0.4, body_h + 1.9), 0.05, 2.8, mats['metal_dark'], verts=6)

    add_bicycle('Uni_Bike_0', 5.2, walk_y - 1.7, 0.0, 0.12, mats)
    return rows, cols


def build_grad(mats, rng):
    """研究生宿舍楼 · 研思楼: 5x6 = 30 windows, modern stone, glass balconies, rooftop conservatory."""
    rows, cols = 5, 6
    gap_x, gap_y = 2.7, 2.82
    row_z0 = 4.35
    body_w, body_d, body_h = 18.2, 6.6, 17.6
    front_y = -body_d / 2.0

    box('Dorm_Body', (0, 0, body_h / 2.0), (body_w, body_d, body_h), mats['stone_grad'], bevel=0.04)
    box('Dorm_Plinth', (0, 0, 0.45), (body_w + 0.5, body_d + 0.5, 0.9), mats['frame_dark'], bevel=0.03)
    for r in range(1, rows):
        z = row_z0 + (r - 0.5) * gap_y
        box(f'Floor_Band_{r}', (0, front_y - 0.04, z), (body_w + 0.3, 0.24, 0.18), mats['frame_dark'], bevel=0.02)

    add_window_grid(mats, rows, cols, gap_x, gap_y, row_z0, front_y, 1.55, 1.75,
                    mats['frame_dark'], mats['metal_light'], add_planters=False)

    # Protruding modern balconies with glass railings on floors 2..4
    for r in (1, 2, 3):
        z = row_z0 + r * gap_y - 1.15
        box(f'Balcony_Slab_{r}', (0, front_y - 0.52, z), (body_w - 1.2, 0.9, 0.16), mats['trim_cream'], bevel=0.02)
        box(f'Balcony_Glass_{r}', (0, front_y - 0.92, z + 0.42), (body_w - 1.3, 0.06, 0.72), mats['glass_rail'], tint=False)
        box(f'Balcony_Rail_{r}', (0, front_y - 0.92, z + 0.80), (body_w - 1.25, 0.08, 0.06), mats['metal_dark'])

    # Modern entrance lobby + awning (clear of row 0 sills at z ~ 3.25)
    box('Entrance_Frame', (0, front_y - 0.12, 1.25), (3.4, 0.26, 2.35), mats['frame_dark'], bevel=0.02)
    box('Entrance_Door', (0, front_y - 0.18, 1.22), (2.9, 0.14, 2.15), mats['door_glow'], bevel=0.02, tint=False)
    box('Entrance_Awning', (0, front_y - 1.0, 2.55), (4.4, 1.9, 0.16), mats['metal_dark'], bevel=0.02)
    box('Season_Snow_Awning', (0, front_y - 1.0, 2.66), (4.3, 1.8, 0.09), mats['snow_cap'], bevel=0.03, tint=False)

    # Rooftop glass greenhouse conservatory + coffee terrace umbrella
    box('Roof_Slab', (0, 0, body_h + 0.22), (body_w + 0.5, body_d + 0.5, 0.44), mats['frame_dark'], bevel=0.03)
    box('Season_Snow_Roof', (0, 0, body_h + 0.50), (body_w + 0.3, body_d + 0.3, 0.12), mats['snow_cap'], bevel=0.04, tint=False)
    # Greenhouse on left half of roof
    gx = -3.2
    box('Greenhouse_Base', (gx, 0, body_h + 0.72), (5.2, 3.2, 0.55), mats['brick_warm'], bevel=0.02)
    box('Greenhouse_Glass', (gx, 0, body_h + 1.65), (5.0, 3.0, 1.4), mats['glass_rail'], tint=False)
    gable_prism('Greenhouse_Roof', (gx, 0, body_h + 2.35), 5.3, 3.3, 1.0, mats['glass_rail'], bevel=0.015)
    box('Greenhouse_Glow', (gx, 0, body_h + 1.45), (3.8, 1.8, 0.8), mats['lamp_glow'], tint=False)
    # Coffee patio table + umbrella on right half of roof
    cx = 4.6
    cylinder('Patio_Table', (cx, -0.4, body_h + 0.85), 0.75, 0.08, mats['wood_warm'], verts=12)
    cylinder('Patio_Leg', (cx, -0.4, body_h + 0.62), 0.06, 0.46, mats['metal_dark'], verts=8)
    cylinder('Patio_Pole', (cx, -0.4, body_h + 1.65), 0.04, 1.7, mats['metal_light'], verts=8)
    cone('Patio_Umbrella', (cx, -0.4, body_h + 2.55), 1.4, 0.12, 0.48, mats['laundry_a'], verts=10)

    # Two flanking tall ginkgo trees
    add_tree('Grad_Ginkgo_L', -11.4, -1.6, 0.0, 7.2, 2.2, mats, rng, is_ginkgo=True)
    add_tree('Grad_Ginkgo_R', 11.4, -1.6, 0.0, 7.4, 2.3, mats, rng, is_ginkgo=True)
    return rows, cols


def build_staff(mats, rng):
    """教职工宿舍楼 · 桂花院: 3x4 = 12 wide cozy windows, timber beams, mossy pitched roof, chimney, ivy vines, stone table."""
    rows, cols = 3, 4
    gap_x, gap_y = 3.4, 3.1
    row_z0 = 4.75
    body_w, body_d, body_h = 15.6, 6.8, 12.4
    front_y = -body_d / 2.0

    box('Dorm_Plinth', (0, 0, 0.7), (body_w + 0.5, body_d + 0.5, 1.4), mats['stone_ground'], bevel=0.04)
    box('Dorm_Body', (0, 0, body_h / 2.0 + 0.6), (body_w, body_d, body_h - 1.2), mats['plaster_cream'], bevel=0.04)
    # Exposed warm Tudor timber beams
    for bx in (-body_w / 2.0 + 0.2, -3.5, 3.5, body_w / 2.0 - 0.2):
        box(f'Beam_V_{bx}', (bx, front_y - 0.04, body_h / 2.0 + 0.4), (0.28, 0.14, body_h - 0.8), mats['wood_warm'], bevel=0.015)
    for r in range(1, rows):
        z = row_z0 + (r - 0.5) * gap_y
        box(f'Beam_H_{r}', (0, front_y - 0.05, z), (body_w + 0.2, 0.16, 0.26), mats['wood_warm'], bevel=0.02)

    add_window_grid(mats, rows, cols, gap_x, gap_y, row_z0, front_y, 2.05, 1.9,
                    mats['wood_warm'], mats['wood_warm'], add_planters=True)

    # Steep mossy dark green pitched roof + brick chimney + snow layer
    box('Roof_Eaves', (0, 0, body_h + 0.15), (body_w + 1.3, body_d + 1.3, 0.26), mats['wood_warm'], bevel=0.03)
    gable_prism('Roof_Pitched', (0, 0, body_h + 0.28), body_w + 1.5, body_d + 1.5, 3.8, mats['roof_moss'], bevel=0.03)
    gable_prism('Season_Snow_Roof', (0, 0, body_h + 0.42), body_w + 1.52, body_d + 1.52, 3.78, mats['snow_cap'], bevel=0.04, tint=False)
    box('Chimney_Base', (4.4, 1.2, body_h + 3.2), (1.1, 1.1, 2.4), mats['brick_red'], bevel=0.03)
    box('Chimney_Cap', (4.4, 1.2, body_h + 4.48), (1.35, 1.35, 0.22), mats['trim_cream'], bevel=0.02)
    box('Season_Snow_Chimney', (4.4, 1.2, body_h + 4.64), (1.3, 1.3, 0.12), mats['snow_cap'], bevel=0.03, tint=False)

    # Wide timber entrance porch (peak at z=3.2 < row 0 sills at z=3.58)
    box('Entrance_Frame', (0, front_y - 0.10, 1.22), (2.4, 0.22, 2.3), mats['wood_warm'], bevel=0.03)
    box('Entrance_Door', (0, front_y - 0.16, 1.18), (1.9, 0.14, 2.05), mats['door_glow'], bevel=0.02, tint=False)
    gable_prism('Entrance_Porch_Roof', (0, front_y - 0.85, 2.42), 3.3, 1.8, 0.78, mats['roof_moss'], bevel=0.02)
    gable_prism('Season_Snow_Porch', (0, front_y - 0.85, 2.52), 3.32, 1.82, 0.76, mats['snow_cap'], bevel=0.03, tint=False)

    # Climbing ivy clusters hugging left/right wall corners
    for side, sx in (('L', -body_w / 2.0 + 0.45), ('R', body_w / 2.0 - 0.45)):
        for k in range(9):
            iz = 1.1 + k * 1.18
            ix = sx + rng.uniform(-0.35, 0.35)
            ico(f'Season_Vines_{side}_{k}', (ix, front_y - 0.10, iz), rng.uniform(0.24, 0.38),
                mats['leaf_main'] if k % 2 == 0 else mats['leaf_accent'], sub=1, scale=(1.35, 0.35, 1.1))

    # Courtyard stone table + stools + stone lantern
    tx, ty = -4.6, front_y - 2.3
    cylinder('Stone_Table_Top', (tx, ty, 0.72), 0.82, 0.12, mats['stone_ground'], verts=12, bevel=0.02)
    cylinder('Stone_Table_Leg', (tx, ty, 0.36), 0.28, 0.68, mats['stone_ground'], verts=10)
    for i, ang in enumerate((0.2, 2.3, 4.4)):
        cylinder(f'Stone_Stool_{i}', (tx + math.cos(ang) * 1.15, ty + math.sin(ang) * 1.15, 0.24),
                 0.26, 0.48, mats['stone_ground'], verts=10, bevel=0.02)
    # Courtyard stone lantern
    lx, ly = 4.6, front_y - 2.2
    box('Lantern_Base', (lx, ly, 0.55), (0.45, 0.45, 1.1), mats['stone_ground'], bevel=0.02)
    box('Lantern_Light', (lx, ly, 1.25), (0.36, 0.36, 0.36), mats['lamp_glow'], bevel=0.01, tint=False)
    cone('Lantern_Roof', (lx, ly, 1.62), 0.52, 0.08, 0.40, mats['roof_slate'], verts=4)

    add_tree('Staff_Osmanthus_R', 10.6, -1.2, 0.0, 5.2, 1.85, mats, rng)
    return rows, cols


def build_campus_grounds(mats, rng):
    """Shared Stardew-3D campus diorama plate: stone avenue, perimeter walls, lamps, neighbor dorm silhouettes."""
    # Main ground grass & stone apron
    box('Campus_Grass_Base', (0, 2.0, -0.4), (78.0, 48.0, 0.8), mats['lawn_grass'], bevel=0.05, top_z=4.0, half_w=40.0)
    box('Campus_Stone_Plaza', (0, -3.5, 0.02), (25.0, 12.0, 0.12), mats['stone_ground'], bevel=0.03)
    # Cobblestone boulevard across foreground
    box('Campus_Road', (0, -9.2, 0.04), (78.0, 4.4, 0.12), mats['cobble'], bevel=0.02)
    box('Campus_Curb_N', (0, -7.0, 0.08), (78.0, 0.28, 0.18), mats['trim_cream'], bevel=0.015)
    box('Campus_Curb_S', (0, -11.4, 0.08), (78.0, 0.28, 0.18), mats['trim_cream'], bevel=0.015)

    # Vintage campus street lamps along the avenue
    for i, lx in enumerate((-12.2, 12.2, -26.0, 26.0)):
        ly = -7.2
        cylinder(f'AveLamp_Base_{i}', (lx, ly, 0.25), 0.24, 0.5, mats['metal_dark'], verts=10)
        cylinder(f'AveLamp_Pole_{i}', (lx, ly, 2.7), 0.08, 4.9, mats['metal_dark'], verts=8)
        box(f'AveLamp_Arm_{i}', (lx, ly - 0.35, 5.08), (0.10, 0.8, 0.10), mats['metal_dark'], bevel=0.01)
        box(f'AveLamp_Bulb_{i}', (lx, ly - 0.72, 4.86), (0.38, 0.38, 0.38), mats['lamp_glow'], bevel=0.02, tint=False)
        cone(f'AveLamp_Cap_{i}', (lx, ly - 0.72, 5.15), 0.34, 0.06, 0.24, mats['metal_dark'], verts=8)

    # Low campus brick perimeter wall in background + neighbor dorm silhouettes
    box('Back_Brick_Wall', (0, 16.0, 0.7), (76.0, 0.6, 1.4), mats['brick_red'], bevel=0.03)
    neighbors = [
        ('Neighbor_West', (-28.5, 4.5, 0.0), (14.5, 5.5, 11.5), mats['neighbor'], True),
        ('Neighbor_East', (28.5, 4.5, 0.0), (15.0, 5.8, 13.5), mats['neighbor'], False),
        ('Neighbor_NorthW', (-20.0, 21.0, 0.0), (18.0, 6.0, 14.0), mats['neighbor'], True),
        ('Neighbor_NorthE', (21.0, 21.5, 0.0), (17.0, 5.8, 12.5), mats['neighbor'], False),
    ]
    for name, (nx, ny, nz), (nw, nd, nh), nmat, pitched in neighbors:
        box(f'{name}_Body', (nx, ny, nh / 2.0), (nw, nd, nh), nmat, bevel=0.04, top_z=16.0, half_w=38.0)
        if pitched:
            gable_prism(f'{name}_Roof', (nx, ny, nh), nw + 0.8, nd + 0.8, 2.6, mats['roof_slate'], bevel=0.02)
        else:
            box(f'{name}_Roof', (nx, ny, nh + 0.25), (nw + 0.6, nd + 0.6, 0.5), mats['roof_slate'], bevel=0.03)
        # Warm silhouette tiny distant lit windows
        for r in range(3):
            for c in range(4):
                if rng.random() > 0.45:
                    wx = nx + (c - 1.5) * (nw * 0.21)
                    wz = 2.6 + r * (nh * 0.24)
                    box(f'{name}_Glow_{r}_{c}', (wx, ny - nd / 2.0 - 0.05, wz), (0.85, 0.08, 1.15), mats['lamp_glow'], tint=False)

    # Campus flanking trees along background & avenue
    for i, (tx, ty, th, tr) in enumerate([
        (-16.5, -5.8, 4.6, 1.6),
        (16.5, -5.8, 5.0, 1.75),
        (-21.0, -13.2, 4.4, 1.5),
        (21.5, -13.2, 4.8, 1.65),
        (-14.0, 8.5, 5.6, 2.0),
        (14.5, 8.5, 5.4, 1.9),
    ]):
        add_tree(f'Campus_Tree_{i}', tx, ty, 0.0, th, tr, mats, rng)
    return 0, 0


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

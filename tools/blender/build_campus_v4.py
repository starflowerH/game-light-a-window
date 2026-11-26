"""Blender 5.3 headless & MCP generator for《今晚，亮一盏灯》v5.3 Oil-Painted Stardew 3D campus dioramas.

Produces 5 richly detailed, smooth-shaded & batched GLB files in public/models/:
  1. dorm_highschool.glb  (3x6 = 18 windows, brick quoins, shutters, tile ribs, rain barrel, bike shed, bulletin & festoons)
  2. dorm_university.glb  (4x6 = 24 windows, #17 colonnade capitals, fairy lights, AC pipes, cat corner, water tower & pergola)
  3. dorm_grad.glb        (5x6 = 30 windows, stone pilasters, glass balconies & blooms, portico, conservatory & rooftop arbor)
  4. dorm_staff.glb       (3x4 = 12 wide windows, Tudor braces, eave rafters, shutters, garden arbor gate, firewood, tea & Yukimi lantern)
  5. campus_grounds.glb   (Stardew left park gazebo pavilion, right lotus pond & wooden arch bridge, horizon woodland grove,
                           campus brick-red clocktower, multi-wing cottage neighbors, stone fence, crosswalk & string lights)

Contracts preserved for src/scene.js:
  - Interactive window glass planes keep exact name `Window_Glass_<row>_<col>` and unobstructed front reveal
  - Entrance glass keeps `Entrance_Door` with stepped Y clearance (zero Z-fighting)
  - Seasonal snow meshes start with `Season_Snow_`, climbing vines with `Season_Vines_`
  - Foliage canopies use `Mat_Leaf_Main` / `Mat_Leaf_Accent`, laundry uses `Mat_Laundry_*`
  - Spinning AC fans start with `AC_Fan_`
  - Foreground avenue lamp bulbs preserve world coords `(-12.2/12.2/-26/26, -7.92, 4.86)`
  - Static geometry is batched per material via `merge_static_meshes()` to preserve 60+ FPS.
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
        bsdf.inputs['Specular IOR Level'].default_value = 0.22
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
        'brick_red': make_mat('Mat_Wall_BrickRed', (0.60, 0.28, 0.22), rough=0.86),
        'brick_warm': make_mat('Mat_Wall_BrickWarm', (0.48, 0.52, 0.62), rough=0.85),
        'stone_grad': make_mat('Mat_Wall_StoneGrad', (0.58, 0.54, 0.49), rough=0.82),
        'plaster_cream': make_mat('Mat_Wall_Plaster', (0.87, 0.81, 0.71), rough=0.88),
        'wing_warm': make_mat('Mat_Wall_Wing', (0.66, 0.59, 0.54), rough=0.86),
        'roof_terracotta': make_mat('Mat_Roof_Terracotta', (0.64, 0.27, 0.20), rough=0.78),
        'roof_slate': make_mat('Mat_Roof_Slate', (0.25, 0.28, 0.37), rough=0.78),
        'roof_moss': make_mat('Mat_Roof_Moss', (0.21, 0.36, 0.28), rough=0.80),
        'wood_warm': make_mat('Mat_Wood_Warm', (0.46, 0.30, 0.19), rough=0.78),
        'wood_green': make_mat('Mat_Wood_Green', (0.22, 0.40, 0.29), rough=0.75),
        'frame_dark': make_mat('Mat_Frame_Dark', (0.17, 0.20, 0.28), rough=0.72),
        'trim_cream': make_mat('Mat_Trim_Cream', (0.84, 0.79, 0.71), rough=0.84),
        'stone_trim': make_mat('Mat_Stone_Trim', (0.74, 0.70, 0.64), rough=0.80),
        'shutter_slate': make_mat('Mat_Shutter_Slate', (0.24, 0.35, 0.42), rough=0.74),
        'metal_dark': make_mat('Mat_Metal_Dark', (0.19, 0.21, 0.26), rough=0.52, metal=0.42),
        'metal_light': make_mat('Mat_Metal_Light', (0.58, 0.61, 0.66), rough=0.45, metal=0.48),
        'brass': make_mat('Mat_Brass', (0.86, 0.68, 0.32), rough=0.35, metal=0.75),
        'copper': make_mat('Mat_Copper', (0.74, 0.42, 0.28), rough=0.46, metal=0.62),
        'glass_dark': make_mat('Mat_Glass_Dark', (0.10, 0.14, 0.22), rough=0.25),
        'glass_rail': make_mat('Mat_Glass_Rail', (0.65, 0.80, 0.92), rough=0.18, alpha=0.42),
        'stone_ground': make_mat('Mat_Ground_Stone', (0.26, 0.28, 0.34), rough=0.82),
        'lawn_grass': make_mat('Mat_Ground_Grass', (0.19, 0.32, 0.24), rough=0.92),
        'cobble': make_mat('Mat_Ground_Cobble', (0.36, 0.35, 0.39), rough=0.78),
        'pond_water': make_mat('Mat_Pond_Water', (0.18, 0.34, 0.44), rough=0.22, metal=0.12),
        'terracotta': make_mat('Mat_Pot_Terracotta', (0.65, 0.35, 0.25), rough=0.82),
        'leaf_main': make_mat('Mat_Leaf_Main', (0.25, 0.44, 0.29), rough=0.88),
        'leaf_accent': make_mat('Mat_Leaf_Accent', (0.33, 0.52, 0.34), rough=0.88),
        'hedge_leaf': make_mat('Mat_Hedge_Leaf', (0.17, 0.36, 0.23), rough=0.90),
        'pine_leaf': make_mat('Mat_Pine_Leaf', (0.12, 0.24, 0.20), rough=0.92),
        'flower_coral': make_mat('Mat_Flower_Coral', (0.90, 0.46, 0.48), rough=0.85),
        'flower_gold': make_mat('Mat_Flower_Gold', (0.96, 0.78, 0.32), rough=0.85),
        'flower_lavender': make_mat('Mat_Flower_Lavender', (0.68, 0.56, 0.86), rough=0.85),
        'trunk': make_mat('Mat_Trunk', (0.30, 0.21, 0.15), rough=0.92),
        'snow_cap': make_mat('Mat_Snow_Cap', (0.90, 0.94, 0.99), rough=0.68),
        'lamp_glow': make_mat('Mat_Lamp_Glow', (1.00, 0.80, 0.45), rough=0.30, emission=2.0),
        'lantern_warm': make_mat('Mat_Lantern_Warm', (1.00, 0.78, 0.42), rough=0.30, emission=1.6),
        'door_glow': make_mat('Mat_Door_Glow', (1.00, 0.72, 0.38), rough=0.40, emission=1.2),
        'laundry_a': make_mat('Mat_Laundry_A', (0.86, 0.46, 0.42), rough=0.90),
        'laundry_b': make_mat('Mat_Laundry_B', (0.54, 0.72, 0.88), rough=0.90),
        'laundry_c': make_mat('Mat_Laundry_C', (0.92, 0.84, 0.62), rough=0.90),
        'cat_orange': make_mat('Mat_Cat_Orange', (0.86, 0.52, 0.24), rough=0.85),
        'board_green': make_mat('Mat_Board_Green', (0.14, 0.28, 0.22), rough=0.88),
        'neighbor': make_mat('Mat_Neighbor_Sil', (0.20, 0.24, 0.35), rough=0.90),
        'neighbor_warm': make_mat('Mat_Neighbor_Warm', (0.28, 0.26, 0.34), rough=0.90),
        'smoke_wisp': make_mat('Mat_Smoke_Wisp', (0.78, 0.82, 0.92), rough=0.95, alpha=0.55),
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
        sky = 0.86 + 0.14 * clamp(nz, -1.0, 1.0)
        ground = 0.74 + 0.26 * clamp(world.z / 5.2)
        edge = min(half_w - abs(world.x), top_z - world.z, world.z + 1.2)
        corner = 0.85 + 0.15 * clamp(edge / 2.2)
        # Smooth painterly gradient AO without diagonal vertex hash jitter
        ao = clamp(sky * ground * corner, 0.54, 1.0)
        data[idx].color = (clamp(ao * 1.02), ao, clamp(ao * 0.98), 1.0)


def shade_smooth(ob):
    me = ob.data
    if me and len(me.polygons) > 0:
        me.polygons.foreach_set('use_smooth', [True] * len(me.polygons))
        me.update()
    return ob


def displace_organic(ob, amp=0.14, freq=1.6, seed=0.0):
    """Apply smooth harmonic surface undulation so foliage & boulders look sculpted instead of geometric spheres."""
    me = ob.data
    for v in me.vertices:
        p = v.co
        l = p.length
        if l < 1e-5:
            continue
        nx, ny, nz = p.x / l, p.y / l, p.z / l
        wave = (
            math.sin(nx * freq * 3.1 + ny * 2.4 + seed) * 0.5 +
            math.cos(ny * freq * 2.7 - nz * 3.2 + seed * 1.7) * 0.5
        )
        v.co = p * (1.0 + wave * amp)
    me.update()
    return ob


def finish_mesh(ob, name, mat, bevel=0.0, segments=1, tint=True, top_z=18.0, half_w=11.0, smooth=False):
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
    if smooth:
        shade_smooth(ob)
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


def cylinder(name, loc, r, depth, mat, verts=12, rot=(0.0, 0.0, 0.0), tint=True, bevel=0.0, smooth=False):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=depth, end_fill_type='NGON', location=(0, 0, 0))
    ob = bpy.context.object
    ob.location = loc
    ob.rotation_euler = rot
    return finish_mesh(ob, name, mat, bevel=bevel, segments=1, tint=tint, smooth=smooth)


def cone(name, loc, r1, r2, depth, mat, verts=12, rot=(0.0, 0.0, 0.0), tint=True, smooth=False):
    bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r1, radius2=r2, depth=depth, end_fill_type='NGON', location=(0, 0, 0))
    ob = bpy.context.object
    ob.location = loc
    ob.rotation_euler = rot
    return finish_mesh(ob, name, mat, tint=tint, smooth=smooth)


def ico(name, loc, r, mat, sub=1, scale=(1.0, 1.0, 1.0), tint=True, smooth=False, organic=0.0, seed=0.0):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=sub, radius=r, location=(0, 0, 0))
    ob = bpy.context.object
    if organic > 0.0:
        displace_organic(ob, amp=organic, seed=seed)
    if scale != (1.0, 1.0, 1.0):
        ob.data.transform(Matrix.Diagonal((scale[0], scale[1], scale[2], 1.0)))
    ob.location = loc
    return finish_mesh(ob, name, mat, tint=tint, smooth=smooth)


def torus(name, loc, r_maj, r_min, mat, rot=(0.0, 0.0, 0.0), seg_maj=14, seg_min=6, smooth=False):
    bpy.ops.mesh.primitive_torus_add(major_radius=r_maj, minor_radius=r_min, major_segments=seg_maj, minor_segments=seg_min)
    ob = bpy.context.object
    ob.location = loc
    ob.rotation_euler = rot
    return finish_mesh(ob, name, mat, smooth=smooth)


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


# ------------------------------------------------------------------ Reusable Architectural & Botanical Helpers

def add_corner_quoins(body_w, body_d, body_h, plinth_h, mat_quoin, mat_band=None, step_h=0.68, water_table=True):
    hw = body_w / 2.0
    hd = body_d / 2.0
    if water_table:
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
    box('Cornice_Bot', (0, 0, z_top - 0.22), (body_w + 0.28, body_d + 0.28, 0.14), mat_trim, bevel=0.015)
    box('Cornice_Mid', (0, 0, z_top - 0.08), (body_w + 0.48, body_d + 0.48, 0.14), mat_trim, bevel=0.02)
    box('Cornice_Top', (0, 0, z_top + 0.06), (body_w + 0.72, body_d + 0.72, 0.14), mat_trim, bevel=0.02)
    if dentil:
        count = max(12, int(body_w / 0.72))
        span = body_w - 0.9
        front_y = -body_d / 2.0
        for i in range(count):
            dx = -span / 2.0 + (i / max(1, count - 1)) * span
            box(f'Dentil_F_{i}', (dx, front_y - 0.17, z_top - 0.21), (0.16, 0.16, 0.16), mat_dentil or mat_trim, bevel=0.0)


def add_downspouts(front_y, body_w, z_top, mat_pipe, mat_clamp, z_bot=0.22, x_positions=None):
    if x_positions is None:
        x_positions = (-(body_w / 2.0 - 0.48), body_w / 2.0 - 0.48)
    pipe_h = z_top - z_bot - 0.22
    pipe_z = z_bot + 0.16 + pipe_h / 2.0
    py = front_y - 0.12
    for i, px in enumerate(x_positions):
        cylinder(f'Downspout_Pipe_{i}', (px, py, pipe_z), 0.065, pipe_h, mat_pipe, verts=10, smooth=True)
        box(f'Downspout_Hopper_{i}', (px, py, z_top - 0.22), (0.24, 0.22, 0.24), mat_pipe, bevel=0.02)
        box(f'Downspout_Shoe_{i}', (px, py - 0.09, z_bot + 0.06), (0.14, 0.24, 0.14), mat_pipe, bevel=0.02, rot=(0.45, 0, 0))
        z_strap = z_bot + 1.4
        s_idx = 0
        while z_strap < z_top - 0.8:
            box(f'Downspout_Strap_{i}_{s_idx}', (px, front_y - 0.08, z_strap), (0.20, 0.16, 0.07), mat_clamp, bevel=0.0)
            z_strap += 2.6
            s_idx += 1


def add_festoon_garland(prefix, x0, x1, y, z0, sag, count, mats):
    """Draped warm café string-light cable with amber bulbs along eaves/porches."""
    for i in range(count):
        t = i / max(1, count - 1)
        bx = x0 + (x1 - x0) * t
        bz = z0 - math.sin(t * math.pi) * sag
        ico(f'{prefix}_Bulb_{i}', (bx, y, bz - 0.06), 0.055, mats['lantern_warm'], sub=1, tint=False, smooth=True)
        if i < count - 1:
            t2 = (i + 1) / max(1, count - 1)
            nx = x0 + (x1 - x0) * t2
            nz = z0 - math.sin(t2 * math.pi) * sag
            seg_len = math.hypot(nx - bx, nz - bz)
            ang = math.atan2(nz - bz, nx - bx)
            box(f'{prefix}_Wire_{i}', ((bx + nx) * 0.5, y, (bz + nz) * 0.5),
                (seg_len, 0.025, 0.025), mats['metal_dark'], bevel=0.0, rot=(0, -ang, 0))


def add_flower_cluster(prefix, x, y, z, width, mats, rng):
    """Blooming overflowing flower-bed cluster with foliage base and colorful blossoms."""
    bloom_mats = (mats['flower_coral'], mats['flower_gold'], mats['flower_lavender'])
    n_leaf = max(3, int(width / 0.24))
    for i in range(n_leaf):
        ox = (i / max(1, n_leaf - 1) - 0.5) * (width * 0.84)
        oy = rng.uniform(-0.08, 0.08)
        ico(f'Season_Vines_{prefix}_{i}', (x + ox, y + oy, z), rng.uniform(0.11, 0.16),
            mats['leaf_accent'] if i % 2 == 0 else mats['leaf_main'], sub=1, scale=(1.2, 1.0, 0.78), smooth=True)
        if i % 2 == 0 or rng.random() > 0.35:
            bmat = bloom_mats[(i + int(abs(x * 3))) % len(bloom_mats)]
            ico(f'{prefix}_Bloom_{i}', (x + ox + rng.uniform(-0.04, 0.04), y + oy - 0.04, z + rng.uniform(0.08, 0.14)),
                rng.uniform(0.065, 0.095), bmat, sub=1, smooth=True)


def add_window_grid(mats, rng, rows, cols, gap_x, gap_y, row_z0, front_y, win_w, win_h,
                    frame_mat, sill_mat, shutter_mat=None, corbel_mat=None,
                    snow_prefix=True, add_planters=False, add_shutters=False,
                    corbel_skip_rows=()):
    c_mat = corbel_mat or sill_mat
    s_mat = shutter_mat or frame_mat
    for r in range(rows):
        for c in range(cols):
            x = (c - (cols - 1) / 2.0) * gap_x
            z = row_z0 + r * gap_y

            box(f'Window_Frame_{r}_{c}', (x, front_y - 0.03, z),
                (win_w + 0.34, 0.20, win_h + 0.34), frame_mat, bevel=0.02)
            box(f'Window_Glass_{r}_{c}', (x, front_y - 0.12, z),
                (win_w, 0.08, win_h), mats['glass_dark'], bevel=0.0, tint=False)

            jamb_x = win_w / 2.0 + 0.085
            box(f'WinJamb_L_{r}_{c}', (x - jamb_x, front_y - 0.16, z), (0.15, 0.32, win_h + 0.16), frame_mat, bevel=0.018)
            box(f'WinJamb_R_{r}_{c}', (x + jamb_x, front_y - 0.16, z), (0.15, 0.32, win_h + 0.16), frame_mat, bevel=0.018)

            sill_z = z - win_h / 2.0 - 0.18
            box(f'Sill_{r}_{c}', (x, front_y - 0.20, sill_z),
                (win_w + 0.56, 0.38, 0.13), sill_mat, bevel=0.02)
            if r not in corbel_skip_rows:
                corb_x = win_w * 0.36
                for side, cx_off in (('L', -corb_x), ('R', corb_x)):
                    box(f'Corbel_{side}_{r}_{c}', (x + cx_off, front_y - 0.15, sill_z - 0.14),
                        (0.14, 0.24, 0.17), c_mat, bevel=0.02)

            hood_z = z + win_h / 2.0 + 0.18
            box(f'Hood_{r}_{c}', (x, front_y - 0.15, hood_z),
                (win_w + 0.42, 0.28, 0.14), sill_mat, bevel=0.018)
            box(f'HoodCap_{r}_{c}', (x, front_y - 0.18, hood_z + 0.10),
                (win_w + 0.54, 0.34, 0.08), c_mat, bevel=0.015)
            box(f'Keystone_{r}_{c}', (x, front_y - 0.20, hood_z + 0.03),
                (0.24, 0.32, 0.26), c_mat, bevel=0.02)

            if add_shutters:
                sh_w = 0.25 if win_w < 1.8 else 0.28
                sh_x = win_w / 2.0 + 0.17 + sh_w * 0.5 + 0.015
                for side, sx in (('L', x - sh_x), ('R', x + sh_x)):
                    box(f'Shutter_{side}_{r}_{c}', (sx, front_y - 0.09, z),
                        (sh_w, 0.09, win_h + 0.04), s_mat, bevel=0.0)
                    for li in range(5):
                        lz = z - win_h * 0.38 + li * (win_h * 0.19)
                        box(f'ShutterSlat_{side}_{r}_{c}_{li}', (sx, front_y - 0.14, lz),
                            (sh_w - 0.04, 0.04, 0.07), s_mat, bevel=0.0)

            if snow_prefix and (r == rows - 1 or (r + c) % 2 == 0):
                box(f'Season_Snow_Sill_{r}_{c}', (x, front_y - 0.22, sill_z + 0.09),
                    (win_w + 0.48, 0.32, 0.08), mats['snow_cap'], bevel=0.025, tint=False)

            if add_planters and (r + c) % 3 == 1 and r > 0:
                px = x - win_w * 0.12
                box(f'WinBox_{r}_{c}', (px, front_y - 0.31, sill_z + 0.14),
                    (0.72, 0.22, 0.16), mats['wood_warm'], bevel=0.018)
                box(f'WinBox_Rail_{r}_{c}', (px, front_y - 0.42, sill_z + 0.17),
                    (0.76, 0.04, 0.04), mats['metal_dark'], bevel=0.0)
                add_flower_cluster(f'WinFlower_{r}_{c}', px, front_y - 0.32, sill_z + 0.25, 0.68, mats, rng)


def add_grand_entrance(mats, cx, front_y, door_w, door_h, z_thresh, frame_mat, trim_mat, door_metal_mat,
                       with_steps=True, with_pilasters=True, with_sconces=True):
    if with_steps:
        step_total_h = z_thresh
        n_steps = 3
        sh = step_total_h / n_steps
        for si in range(n_steps):
            sw = door_w + 0.74 + si * 0.28
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

    frame_z = z_thresh + door_h / 2.0 + 0.08
    box('Entrance_Frame', (cx, front_y - 0.23, frame_z), (door_w + 0.62, 0.24, door_h + 0.26), frame_mat, bevel=0.025)
    lintel_z = z_thresh + door_h + 0.16
    box('Entrance_Lintel', (cx, front_y - 0.28, lintel_z), (door_w + 0.92, 0.32, 0.18), trim_mat, bevel=0.02)
    box('Entrance_Keystone', (cx, front_y - 0.31, lintel_z + 0.02), (0.32, 0.36, 0.26), trim_mat, bevel=0.02)

    if with_pilasters:
        px_off = door_w / 2.0 + 0.24
        for side, sx in (('L', cx - px_off), ('R', cx + px_off)):
            box(f'Entrance_Pilaster_{side}', (sx, front_y - 0.31, frame_z - 0.02),
                (0.26, 0.32, door_h + 0.10), trim_mat, bevel=0.02)
            box(f'Entrance_PilasterBase_{side}', (sx, front_y - 0.33, z_thresh + 0.14),
                (0.32, 0.36, 0.28), frame_mat, bevel=0.02)
            box(f'Entrance_PilasterCap_{side}', (sx, front_y - 0.33, z_thresh + door_h + 0.04),
                (0.34, 0.38, 0.16), frame_mat, bevel=0.02)

    door_cz = z_thresh + door_h / 2.0
    box('Entrance_Door', (cx, front_y - 0.37, door_cz), (door_w, 0.10, door_h), mats['door_glow'], bevel=0.0, tint=False)

    mull_y = front_y - 0.48
    box('Entrance_Mullion_V', (cx, mull_y, door_cz), (0.09, 0.04, door_h + 0.02), door_metal_mat, bevel=0.0)
    box('Entrance_SideMull_L', (cx - door_w / 2.0 + 0.05, mull_y, door_cz), (0.07, 0.04, door_h + 0.02), door_metal_mat, bevel=0.0)
    box('Entrance_SideMull_R', (cx + door_w / 2.0 - 0.05, mull_y, door_cz), (0.07, 0.04, door_h + 0.02), door_metal_mat, bevel=0.0)
    transom_z = z_thresh + door_h * 0.78
    box('Entrance_Mullion_H', (cx, mull_y, transom_z), (door_w, 0.045, 0.08), door_metal_mat, bevel=0.0)
    box('Entrance_LockRail', (cx, mull_y, z_thresh + door_h * 0.38), (door_w, 0.04, 0.06), door_metal_mat, bevel=0.0)
    box('Entrance_Kickplate', (cx, mull_y, z_thresh + 0.12), (door_w, 0.045, 0.22), door_metal_mat, bevel=0.0)
    handle_z = z_thresh + door_h * 0.46
    for side, hx in (('L', cx - 0.15), ('R', cx + 0.15)):
        cylinder(f'Entrance_Handle_{side}', (hx, front_y - 0.52, handle_z), 0.025, 0.32, mats['brass'], verts=8, smooth=True)
        box(f'Entrance_HandleStand_{side}', (hx, front_y - 0.50, handle_z + 0.10), (0.03, 0.04, 0.03), mats['brass'], bevel=0.0)
        box(f'Entrance_HandleStandB_{side}', (hx, front_y - 0.50, handle_z - 0.10), (0.03, 0.04, 0.03), mats['brass'], bevel=0.0)

    if with_sconces:
        sx_off = door_w / 2.0 + 0.34
        sz = z_thresh + door_h * 0.68
        for side, sx in (('L', cx - sx_off), ('R', cx + sx_off)):
            box(f'Entrance_SconceArm_{side}', (sx, front_y - 0.42, sz), (0.07, 0.18, 0.07), mats['metal_dark'], bevel=0.0)
            box(f'Entrance_SconceBulb_{side}', (sx, front_y - 0.50, sz - 0.10), (0.16, 0.16, 0.20), mats['lantern_warm'], bevel=0.015, tint=False)
            cone(f'Entrance_SconceCap_{side}', (sx, front_y - 0.50, sz + 0.04), 0.15, 0.03, 0.10, mats['metal_dark'], verts=6)


def add_bicycle(name_prefix, x, y, z, rot_z, mats, frame_mat=None):
    f_mat = frame_mat or mats['wood_green']
    wheel_rot = (0.0, math.pi / 2.0, rot_z)
    cos_r, sin_r = math.cos(rot_z), math.sin(rot_z)

    def local(lx, ly, lz):
        return (x + lx * cos_r - ly * sin_r, y + lx * sin_r + ly * cos_r, z + lz)

    torus(f'{name_prefix}_WheelR', local(-0.46, 0, 0.34), 0.33, 0.042, mats['metal_dark'], rot=wheel_rot, seg_maj=16, smooth=True)
    torus(f'{name_prefix}_WheelF', local(0.46, 0, 0.34), 0.33, 0.042, mats['metal_dark'], rot=wheel_rot, seg_maj=16, smooth=True)
    torus(f'{name_prefix}_RimR', local(-0.46, 0, 0.34), 0.28, 0.018, mats['metal_light'], rot=wheel_rot, seg_maj=14, smooth=True)
    torus(f'{name_prefix}_RimF', local(0.46, 0, 0.34), 0.28, 0.018, mats['metal_light'], rot=wheel_rot, seg_maj=14, smooth=True)
    # Cross wire spokes + rear rack
    for wx_off, wname in ((-0.46, 'R'), (0.46, 'F')):
        for sp_ang in (0.0, math.pi / 4.0, math.pi / 2.0, math.pi * 0.75):
            box(f'{name_prefix}_Spk_{wname}_{int(sp_ang * 10)}', local(wx_off, 0, 0.34), (0.56, 0.016, 0.016),
                mats['metal_light'], bevel=0.0, rot=(0, sp_ang, rot_z))
    box(f'{name_prefix}_Rack', local(-0.44, 0, 0.70), (0.34, 0.16, 0.03), mats['metal_dark'], bevel=0.0, rot=(0, 0, rot_z))
    box(f'{name_prefix}_TopTube', local(-0.02, 0, 0.64), (0.64, 0.05, 0.05), f_mat, bevel=0.0, rot=(0, 0, rot_z))
    box(f'{name_prefix}_DownTube', local(0.12, 0, 0.48), (0.66, 0.05, 0.05), f_mat, bevel=0.0, rot=(0, 0.52, rot_z))
    box(f'{name_prefix}_SeatPost', local(-0.24, 0, 0.56), (0.05, 0.05, 0.52), f_mat, bevel=0.0, rot=(0, -0.22, rot_z))
    box(f'{name_prefix}_Fork', local(0.38, 0, 0.54), (0.05, 0.09, 0.54), f_mat, bevel=0.0, rot=(0, -0.25, rot_z))
    box(f'{name_prefix}_Seat', local(-0.28, 0, 0.84), (0.24, 0.13, 0.06), mats['wood_warm'], bevel=0.015, rot=(0, 0, rot_z))
    box(f'{name_prefix}_Bar', local(0.34, 0, 0.86), (0.05, 0.38, 0.045), mats['metal_light'], bevel=0.0, rot=(0, 0, rot_z))
    box(f'{name_prefix}_Basket', local(0.50, 0, 0.72), (0.22, 0.28, 0.18), mats['wood_warm'], bevel=0.015, rot=(0, 0, rot_z))


def add_urn_bush(prefix, x, y, z, mats, rng):
    """Turned terracotta garden urn with sculpted multi-lobe topiary bush & blossoms."""
    cylinder(f'{prefix}_UrnBase', (x, y, z + 0.08), 0.28, 0.16, mats['stone_trim'], verts=12, bevel=0.01, smooth=True)
    cone(f'{prefix}_UrnPot', (x, y, z + 0.34), 0.22, 0.34, 0.38, mats['terracotta'], verts=12, smooth=True)
    torus(f'{prefix}_UrnRim', (x, y, z + 0.52), 0.34, 0.045, mats['terracotta'], seg_maj=14, smooth=True)
    for bi, (bx, by, bz, br) in enumerate([
        (0.0, 0.0, 0.72, 0.34),
        (0.14, -0.10, 0.84, 0.22),
        (-0.14, 0.10, 0.86, 0.21),
        (0.0, 0.0, 1.04, 0.24),
    ]):
        ico(f'{prefix}_Bush_{bi}', (x + bx, y + by, z + bz), br, mats['hedge_leaf'] if bi == 0 else mats['leaf_accent'],
            sub=1, scale=(1.05, 1.05, 0.92), smooth=True, organic=0.14, seed=bi * 2.3 + x)
    for fi in range(4):
        ang = fi * 1.57 + 0.4
        ico(f'{prefix}_Bl_{fi}', (x + math.cos(ang) * 0.22, y + math.sin(ang) * 0.22, z + 0.88 + (fi % 2) * 0.12),
            0.055, mats['flower_gold'] if fi % 2 == 0 else mats['flower_coral'], sub=1, smooth=True)


def add_tree(prefix, x, y, z, height, canopy_r, mats, rng, is_ginkgo=False, with_planter=False, tree_lantern=False, low_detail=False):
    """Ghibli/Stardew multi-cluster botanical tree with gnarled roots, forked limbs & dappled layered crown."""
    if with_planter:
        cylinder(f'{prefix}_PlanterRing', (x, y, z + 0.13), 1.02, 0.26, mats['stone_trim'], verts=16, bevel=0.02, smooth=True)
        cylinder(f'{prefix}_PlanterSoil', (x, y, z + 0.19), 0.84, 0.14, mats['trunk'], verts=12)
        for ri in range(8):
            ang = ri * (math.pi / 4.0)
            ico(f'{prefix}_Stone_{ri}', (x + math.cos(ang) * 0.96, y + math.sin(ang) * 0.96, z + 0.24),
                0.13, mats['stone_ground'], sub=1, scale=(1.2, 0.9, 0.7), smooth=True, organic=0.15, seed=ri + x)

    for ri, ang in enumerate((0.2, 1.8, 3.4, 5.0)):
        rx = x + math.cos(ang) * 0.38
        ry = y + math.sin(ang) * 0.34
        box(f'{prefix}_Root_{ri}', (rx, ry, z + 0.24), (0.42, 0.16, 0.15), mats['trunk'], bevel=0.02, rot=(0, 0.42, ang))

    cone(f'{prefix}_RootFlare', (x, y, z + height * 0.15), 0.40, 0.21, height * 0.30, mats['trunk'], verts=12, smooth=True)
    cylinder(f'{prefix}_Trunk', (x, y, z + height * 0.43), 0.21, height * 0.68, mats['trunk'], verts=12, smooth=True)

    # Exposed curved primary fork boughs & upper twig struts reaching into the leaf clusters
    b_count = 3 if low_detail else 4
    for b_i in range(b_count):
        ang = (b_i / b_count) * math.pi * 2.0 + 0.45
        bx = x + math.cos(ang) * (canopy_r * 0.30)
        by = y + math.sin(ang) * (canopy_r * 0.26)
        bz = z + height * 0.72
        tilt_x = math.sin(ang) * 0.56
        tilt_y = -math.cos(ang) * 0.56
        cylinder(f'{prefix}_Branch_{b_i}', (bx, by, bz), 0.095, height * 0.42, mats['trunk'],
                 verts=8, rot=(tilt_x, tilt_y, 0.0), smooth=True)
        if not low_detail:
            tx2 = x + math.cos(ang + 0.35) * (canopy_r * 0.52)
            ty2 = y + math.sin(ang + 0.35) * (canopy_r * 0.46)
            cylinder(f'{prefix}_Twig_{b_i}', (tx2, ty2, bz + height * 0.14), 0.055, height * 0.26, mats['trunk'],
                     verts=6, rot=(tilt_x * 1.15, tilt_y * 1.15, 0.0), smooth=True)

    mat_a = mats['leaf_main']
    mat_b = mats['leaf_accent']
    if low_detail:
        specs = []
        for i in range(6):
            ang = (i / 6.0) * math.pi * 2.0 + rng.uniform(-0.2, 0.2)
            rad = canopy_r * rng.uniform(0.32, 0.55)
            specs.append((math.cos(ang) * rad, math.sin(ang) * rad * 0.85, height * 0.78 + (i % 2) * canopy_r * 0.25, canopy_r * rng.uniform(0.54, 0.72), i % 2))
        specs.append((0.0, 0.0, height * 0.92 + canopy_r * 0.56, canopy_r * 0.68, 1))
    else:
        # 16 multi-deck sculpted foliage clusters: wide lower boughs, fuller middle canopy, sun-kissed crown puffs
        specs = []
        for i in range(6):
            ang = (i / 6.0) * math.pi * 2.0 + rng.uniform(-0.18, 0.18)
            rad = canopy_r * rng.uniform(0.46, 0.66)
            specs.append((math.cos(ang) * rad, math.sin(ang) * rad * 0.86, height * 0.72 + (i % 2) * canopy_r * 0.14, canopy_r * rng.uniform(0.48, 0.62), 0))
        for i in range(6):
            ang = (i / 6.0) * math.pi * 2.0 + 0.52 + rng.uniform(-0.18, 0.18)
            rad = canopy_r * rng.uniform(0.26, 0.48)
            specs.append((math.cos(ang) * rad, math.sin(ang) * rad * 0.86, height * 0.84 + canopy_r * rng.uniform(0.22, 0.36), canopy_r * rng.uniform(0.42, 0.56), 1 if i % 2 == 0 else 0))
        for i in range(4):
            ang = (i / 4.0) * math.pi * 2.0 + 0.25
            rad = canopy_r * 0.22 if i < 3 else 0.0
            specs.append((math.cos(ang) * rad, math.sin(ang) * rad * 0.82, height * 0.92 + canopy_r * (0.48 if i < 3 else 0.68), canopy_r * (0.38 if i < 3 else 0.46), 1))

    for i, (dx, dy, dz, r, role) in enumerate(specs):
        lobe_sub = 1 if (low_detail or i < len(specs) - 4) else 2
        ico(f'Tree_Canopy_{prefix}_{i}', (x + dx, y + dy, z + dz), r, mat_b if role else mat_a,
            sub=lobe_sub, scale=(1.14, 1.04, 0.80), smooth=True, organic=0.18, seed=i * 2.1 + x + y)
        if not low_detail and i >= len(specs) - 5:
            ico(f'Season_Snow_Tree_{prefix}_{i}', (x + dx, y + dy, z + dz + r * 0.52), r * 0.72,
                mats['snow_cap'], sub=1, scale=(1.08, 1.0, 0.34), tint=False, smooth=True)
        elif not low_detail and is_ginkgo and i % 4 == 1:
            # Golden autumn gingko/osmanthus blossom cluster accents
            ico(f'{prefix}_Blossom_{i}', (x + dx * 1.15, y + dy - r * 0.45, z + dz - r * 0.15), 0.12,
                mats['flower_gold'], sub=1, smooth=True)

    if tree_lantern:
        lx, ly, lz = x + canopy_r * 0.48, y - canopy_r * 0.38, z + height * 0.64
        cylinder(f'{prefix}_LantCord', (lx, ly, lz + 0.20), 0.02, 0.40, mats['metal_dark'], verts=6)
        box(f'{prefix}_LantCap', (lx, ly, lz + 0.10), (0.20, 0.20, 0.06), mats['metal_dark'], bevel=0.0)
        ico(f'{prefix}_LantBulb', (lx, ly, lz - 0.02), 0.13, mats['lantern_warm'], sub=1, scale=(1.0, 1.0, 1.25), tint=False, smooth=True)


def add_pine_tree(prefix, x, y, z, height, mats, rng):
    """Sculpted 5-tier evergreen spruce/pine silhouette with notched scalloped bough skirts."""
    cylinder(f'{prefix}_Trunk', (x, y, z + height * 0.24), 0.18, height * 0.48, mats['trunk'], verts=8, smooth=True)
    for tier in range(5):
        frac = tier / 4.0
        r1 = height * (0.36 - frac * 0.22)
        h_cone = height * (0.28 - frac * 0.06)
        tz = z + height * (0.28 + frac * 0.58)
        ob = cone(f'{prefix}_Tier_{tier}', (x, y, tz), r1, 0.05, h_cone,
                  mats['pine_leaf'] if tier % 2 == 0 else mats['hedge_leaf'], verts=12, rot=(0, 0, tier * 0.26), smooth=True)
        displace_organic(ob, amp=0.14, seed=tier * 1.9 + x)


def add_hedge_strip(prefix, x, y, z, length, height, depth, mats, rng, along_x=True, flowers=False):
    count = max(4, int(length / 0.58))
    bloom_mats = (mats['flower_coral'], mats['flower_gold'], mats['flower_lavender'])
    for i in range(count):
        t = (i / max(1, count - 1) - 0.5) * (length - 0.50)
        hx = x + (t if along_x else rng.uniform(-0.10, 0.10))
        hy = y + (rng.uniform(-0.10, 0.10) if along_x else t)
        hr = (height * 0.62) * rng.uniform(0.86, 1.18)
        ico(f'{prefix}_{i}', (hx, hy, z + height * 0.42), hr, mats['hedge_leaf'],
            sub=1, scale=(1.08, depth / max(0.3, height * 0.9), 0.90), smooth=True, organic=0.16, seed=i * 1.4 + hx)
        if i % 2 == 1:
            ico(f'{prefix}_Tuft_{i}', (hx + rng.uniform(-0.08, 0.08), hy + rng.uniform(-0.08, 0.08), z + height * 0.64),
                hr * 0.56, mats['pine_leaf'], sub=1, smooth=True, organic=0.14, seed=i * 2.7 + hx)
        if flowers and i % 2 == 0:
            for fl in range(2):
                ico(f'{prefix}_Fl_{i}_{fl}', (hx + rng.uniform(-0.16, 0.16), hy - rng.uniform(0.14, 0.24), z + height * rng.uniform(0.74, 0.90)),
                    rng.uniform(0.085, 0.115), bloom_mats[(i + fl) % len(bloom_mats)], sub=1, smooth=True)


# ------------------------------------------------------------------ 4 Dorm Builders + Rich Campus Grounds

def build_highschool(mats, rng):
    """高中宿舍楼 · 晨光楼: 3x6 = 18 windows, brick quoins, shutters, tile ribs, rain barrel, bulletin & bike shed."""
    rows, cols = 3, 6
    gap_x, gap_y = 2.6, 3.0
    row_z0 = 4.45
    body_w, body_d, body_h = 17.4, 6.0, 12.2
    front_y = -body_d / 2.0

    box('Dorm_Plinth', (0, 0, 1.3), (body_w + 0.35, body_d + 0.35, 2.6), mats['brick_red'], bevel=0.04)
    box('Dorm_Body', (0, 0, body_h / 2.0 + 1.2), (body_w, body_d, body_h - 2.4), mats['plaster_cream'], bevel=0.04)
    add_corner_quoins(body_w, body_d, body_h, 2.6, mats['brick_red'], mats['stone_trim'], step_h=0.68)
    add_crown_cornice(body_w, body_d, body_h, mats['trim_cream'], mats['stone_trim'], dentil=True)
    add_downspouts(front_y, body_w, body_h, mats['copper'], mats['metal_dark'], x_positions=(-8.15, 8.15))

    # Oak rainwater barrel catching right downspout with stone pad & brass faucet
    box('HS_BarrelPad', (8.15, front_y - 0.42, 0.04), (1.05, 1.05, 0.08), mats['stone_trim'], bevel=0.015)
    cylinder('HS_RainBarrel', (8.15, front_y - 0.42, 0.50), 0.36, 0.90, mats['wood_warm'], verts=16, smooth=True)
    cylinder('HS_BarrelWater', (8.15, front_y - 0.42, 0.91), 0.31, 0.04, mats['pond_water'], verts=14, smooth=True)
    torus('HS_BarrelBandA', (8.15, front_y - 0.42, 0.28), 0.365, 0.025, mats['metal_dark'], seg_maj=16, smooth=True)
    torus('HS_BarrelBandB', (8.15, front_y - 0.42, 0.72), 0.365, 0.025, mats['metal_dark'], seg_maj=16, smooth=True)
    cylinder('HS_BarrelTap', (8.15, front_y - 0.80, 0.36), 0.035, 0.14, mats['brass'], verts=8, rot=(math.pi / 2.0, 0, 0), smooth=True)

    for r in range(1, rows):
        z = row_z0 + (r - 0.5) * gap_y
        box(f'Floor_Band_{r}', (0, front_y - 0.04, z), (body_w + 0.30, 0.18, 0.20), mats['brick_red'], bevel=0.02)

    add_window_grid(mats, rng, rows, cols, gap_x, gap_y, row_z0, front_y, 1.5, 1.85,
                    mats['wood_green'], mats['trim_cream'], shutter_mat=mats['wood_green'],
                    corbel_mat=mats['stone_trim'], add_planters=False, add_shutters=True)

    roof_w = body_w + 1.3
    roof_d = body_d + 1.3
    ridge_h = 3.4
    roof_z = body_h + 0.3
    box('Roof_Eaves', (0, 0, body_h + 0.15), (body_w + 1.15, body_d + 1.15, 0.28), mats['trim_cream'], bevel=0.03)
    for ri in range(19):
        rx = -body_w * 0.48 + (ri / 18.0) * (body_w * 0.96)
        box(f'HS_EaveRafter_{ri}', (rx, front_y - 0.54, body_h - 0.05), (0.12, 0.42, 0.14), mats['wood_warm'], bevel=0.015, rot=(0.2, 0, 0))
    gable_prism('Roof_Pitched', (0, 0, roof_z), roof_w, roof_d, ridge_h, mats['roof_terracotta'], bevel=0.03)
    box('Roof_Ridge', (0, 0, roof_z + ridge_h + 0.04), (roof_w + 0.18, 0.30, 0.22), mats['trim_cream'], bevel=0.02)
    for sx in (-1.0, 1.0):
        ico(f'Roof_Finial_{int(sx)}', (sx * (roof_w * 0.47), 0, roof_z + ridge_h + 0.30), 0.20, mats['brass'], sub=1, smooth=True)
    # Brass weathervane spire & rear terracotta chimney pots
    cylinder('HS_VanePost', (0, 0, roof_z + ridge_h + 0.58), 0.04, 0.95, mats['brass'], verts=8, smooth=True)
    box('HS_VaneArrow', (0, 0, roof_z + ridge_h + 0.96), (0.85, 0.04, 0.14), mats['brass'], bevel=0.0)
    box('HS_Chimney', (-4.8, 1.25, roof_z + ridge_h - 0.15), (0.96, 0.96, 1.75), mats['brick_red'], bevel=0.02)
    box('HS_ChimneyCap', (-4.8, 1.25, roof_z + ridge_h + 0.78), (1.16, 1.16, 0.16), mats['stone_trim'], bevel=0.02)
    cylinder('HS_ChimneyPotA', (-5.0, 1.25, roof_z + ridge_h + 0.98), 0.12, 0.34, mats['terracotta'], verts=10, smooth=True)
    cylinder('HS_ChimneyPotB', (-4.6, 1.25, roof_z + ridge_h + 0.98), 0.12, 0.34, mats['terracotta'], verts=10, smooth=True)

    slope_len = math.hypot(roof_d / 2.0, ridge_h)
    slope_ang = math.atan2(ridge_h, roof_d / 2.0)
    for ri in range(21):
        rx = -roof_w * 0.47 + (ri / 20.0) * (roof_w * 0.94)
        if abs(rx) < 1.38 or 4.45 < abs(rx) < 5.95:
            continue
        for side_s, ang_s in ((-1.0, slope_ang), (1.0, -slope_ang)):
            ry = side_s * (roof_d * 0.25)
            rz = roof_z + ridge_h * 0.50 + 0.06
            box(f'Roof_Rib_{ri}_{int(side_s)}', (rx, ry, rz), (0.14, slope_len * 0.98, 0.12),
                mats['roof_terracotta'], bevel=0.0, rot=(ang_s, 0.0, 0.0))

    box('Dormer_Box', (0, front_y * 0.42, body_h + 1.6), (2.4, 2.2, 1.8), mats['plaster_cream'], bevel=0.03)
    gable_prism('Dormer_Roof', (0, front_y * 0.42, body_h + 2.5), 2.75, 2.55, 1.12, mats['roof_terracotta'], bevel=0.02)
    box('Dormer_GableBeam', (0, front_y * 0.42 - 1.28, body_h + 2.58), (0.14, 0.08, 0.72), mats['wood_warm'], bevel=0.0)
    box('Dormer_Frame', (0, front_y * 0.42 - 1.09, body_h + 1.55), (1.32, 0.14, 1.18), mats['wood_green'], bevel=0.015)
    box('Dormer_Glass', (0, front_y * 0.42 - 1.15, body_h + 1.55), (1.06, 0.08, 0.94), mats['lamp_glow'], bevel=0.0, tint=False)
    box('Dormer_Mullion', (0, front_y * 0.42 - 1.20, body_h + 1.55), (0.07, 0.04, 0.96), mats['wood_green'], bevel=0.0)
    box('Dormer_MullionH', (0, front_y * 0.42 - 1.20, body_h + 1.55), (1.06, 0.04, 0.07), mats['wood_green'], bevel=0.0)
    for side, dx in (('L', -5.2), ('R', 5.2)):
        box(f'SideDormer_{side}', (dx, front_y * 0.44, body_h + 1.35), (1.25, 1.45, 1.05), mats['plaster_cream'], bevel=0.02)
        gable_prism(f'SideDormerRoof_{side}', (dx, front_y * 0.44, body_h + 1.88), 1.5, 1.7, 0.65, mats['roof_terracotta'], bevel=0.02)
        box(f'SideDormerVent_{side}', (dx, front_y * 0.44 - 0.74, body_h + 1.35), (0.58, 0.08, 0.56), mats['wood_green'], bevel=0.0)

    gable_prism('Season_Snow_Roof', (0, 0, body_h + 0.46), roof_w + 0.04, roof_d + 0.04, ridge_h - 0.02, mats['snow_cap'], bevel=0.04, tint=False)

    add_grand_entrance(mats, 0.0, front_y, door_w=1.88, door_h=2.06, z_thresh=0.34,
                       frame_mat=mats['brick_red'], trim_mat=mats['stone_trim'],
                       door_metal_mat=mats['wood_green'], with_steps=True, with_pilasters=True, with_sconces=True)
    add_urn_bush('HS_Urn_L', -2.05, front_y - 1.35, 0.0, mats, rng)
    add_urn_bush('HS_Urn_R', 2.05, front_y - 1.35, 0.0, mats, rng)
    box('Entrance_Canopy', (0, front_y - 0.85, 2.66), (3.4, 1.65, 0.18), mats['roof_terracotta'], bevel=0.03)
    box('Entrance_CanopyTrim', (0, front_y - 0.85, 2.55), (3.5, 1.74, 0.09), mats['trim_cream'], bevel=0.015)
    box('Entrance_Plaque', (0, front_y - 1.70, 2.64), (1.42, 0.08, 0.34), mats['brass'], bevel=0.015)
    for bx in (-1.30, 1.30):
        box(f'Canopy_Bracket_{bx}', (bx, front_y - 0.80, 2.36), (0.14, 0.90, 0.14), mats['wood_warm'], bevel=0.015, rot=(-0.48, 0, 0))
    add_festoon_garland('HS_CanopyFestoon', -1.55, 1.55, front_y - 1.68, 2.50, 0.14, 7, mats)
    box('Season_Snow_Canopy', (0, front_y - 0.85, 2.79), (3.3, 1.58, 0.09), mats['snow_cap'], bevel=0.03, tint=False)

    # Bulletin board + festoon light string + cozy reading crates & wooden bench
    box('Board_Post_L', (-7.2, front_y - 1.5, 1.12), (0.16, 0.16, 2.24), mats['wood_warm'], bevel=0.02)
    box('Board_Post_R', (-4.4, front_y - 1.5, 1.12), (0.16, 0.16, 2.24), mats['wood_warm'], bevel=0.02)
    box('Board_Frame', (-5.8, front_y - 1.5, 1.56), (3.05, 0.18, 1.54), mats['wood_warm'], bevel=0.02)
    box('Board_Face', (-5.8, front_y - 1.59, 1.56), (2.70, 0.07, 1.24), mats['board_green'], bevel=0.0, tint=False)
    box('Board_ChalkTray', (-5.8, front_y - 1.66, 0.88), (2.80, 0.16, 0.08), mats['wood_warm'], bevel=0.0)
    gable_prism('Board_Roof', (-5.8, front_y - 1.5, 2.36), 3.35, 0.85, 0.42, mats['roof_terracotta'], bevel=0.02)
    add_festoon_garland('HS_BoardFestoon', -7.3, -4.3, front_y - 1.86, 2.32, 0.12, 6, mats)
    box('Season_Snow_Board', (-5.8, front_y - 1.5, 2.74), (3.2, 0.72, 0.08), mats['snow_cap'], bevel=0.02, tint=False)
    for ni, (nx, nz, nmat) in enumerate([(-6.5, 1.72, mats['laundry_c']), (-5.8, 1.65, mats['laundry_b']), (-5.1, 1.74, mats['laundry_a'])]):
        box(f'Board_Note_{ni}', (nx, front_y - 1.64, nz), (0.48, 0.03, 0.54), nmat, bevel=0.0, tint=False)
    box('HS_CrateA', (-7.9, front_y - 1.55, 0.24), (0.56, 0.44, 0.44), mats['wood_warm'], bevel=0.015)
    box('HS_CrateBook', (-7.9, front_y - 1.55, 0.50), (0.34, 0.26, 0.09), mats['laundry_a'], bevel=0.0)

    # Corrugated bike shed + 4 detailed bicycles + book crate stool
    shed_x, shed_y = 10.6, -1.2
    for px in (shed_x - 1.75, shed_x + 1.75):
        for py in (shed_y - 1.35, shed_y + 1.35):
            cylinder(f'Shed_Post_{px}_{py}', (px, py, 1.25), 0.09, 2.5, mats['metal_dark'], verts=10, smooth=True)
            cylinder(f'Shed_Foot_{px}_{py}', (px, py, 0.08), 0.15, 0.16, mats['stone_trim'], verts=8, smooth=True)
    box('Shed_Roof', (shed_x, shed_y, 2.55), (4.1, 3.3, 0.14), mats['roof_slate'], bevel=0.02, rot=(0.14, 0.0, 0.0))
    for ri in range(7):
        rx = shed_x - 1.7 + ri * 0.56
        box(f'Shed_RoofRib_{ri}', (rx, shed_y, 2.63), (0.08, 3.25, 0.06), mats['metal_light'], bevel=0.0, rot=(0.14, 0, 0))
    box('Shed_BasePad', (shed_x, shed_y, 0.04), (4.0, 3.2, 0.08), mats['stone_ground'], bevel=0.02)
    box('Shed_RackBar', (shed_x, shed_y - 0.52, 0.24), (3.3, 0.08, 0.08), mats['metal_light'], bevel=0.0)
    box('Season_Snow_Shed', (shed_x, shed_y, 2.68), (3.95, 3.15, 0.09), mats['snow_cap'], bevel=0.03, rot=(0.14, 0.0, 0.0), tint=False)
    for i, bx in enumerate((shed_x - 1.25, shed_x - 0.42, shed_x + 0.42, shed_x + 1.25)):
        f_mat = mats['wood_green'] if i % 2 == 0 else mats['laundry_b']
        add_bicycle(f'HS_Bike_{i}', bx, shed_y - 0.05, 0.08, math.pi / 2.0, mats, frame_mat=f_mat)

    add_hedge_strip('HS_Hedge_L', -5.8, front_y - 0.72, 0.0, 4.6, 0.72, 0.55, mats, rng, flowers=True)
    add_hedge_strip('HS_Hedge_R', 5.8, front_y - 0.72, 0.0, 4.6, 0.72, 0.55, mats, rng, flowers=True)
    add_tree('HS_Tree_L', -10.8, -1.5, 0.0, 5.1, 1.85, mats, rng, with_planter=True, tree_lantern=True)
    return rows, cols


def build_university(mats, rng):
    """大学宿舍楼 · 17号楼: 4x6 = 24 windows, colonnade + festoons, AC pipes, cat house, water tower & pergola."""
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

    wing_x = body_w / 2.0 + 0.88
    for side, wx in (('L', -wing_x), ('R', wing_x)):
        box(f'Dorm_Wing_{side}', (wx, 0.5, 5.5), (1.75, 4.6, 11.0), mats['wing_warm'], bevel=0.04)
        box(f'Wing_Cap_{side}', (wx, 0.5, 11.12), (2.05, 4.9, 0.28), mats['roof_slate'], bevel=0.03)
        box(f'Wing_Cornice_{side}', (wx, 0.5, 10.92), (1.95, 4.8, 0.14), mats['trim_cream'], bevel=0.02)
        for sz in (2.5, 5.3, 8.1):
            box(f'Wing_WinFrame_{side}_{sz}', (wx, -1.82, sz), (0.64, 0.14, 1.38), mats['frame_dark'], bevel=0.015)
            box(f'Wing_WinGlow_{side}_{sz}', (wx, -1.86, sz), (0.44, 0.06, 1.15), mats['lantern_warm'], bevel=0.0, tint=False)
            box(f'Wing_WinBarH_{side}_{sz}', (wx, -1.90, sz), (0.48, 0.04, 0.06), mats['frame_dark'], bevel=0.0)
            box(f'Wing_WinSill_{side}_{sz}', (wx, -1.90, sz - 0.68), (0.72, 0.14, 0.08), mats['stone_trim'], bevel=0.0)

    for r in range(1, rows):
        z = row_z0 + (r - 0.5) * gap_y
        box(f'Floor_Band_{r}', (0, front_y - 0.04, z), (body_w + 0.30, 0.20, 0.20), mats['trim_cream'], bevel=0.02)

    add_window_grid(mats, rng, rows, cols, gap_x, gap_y, row_z0, front_y, 1.52, 1.9,
                    mats['frame_dark'], mats['trim_cream'], corbel_mat=mats['stone_trim'],
                    add_planters=True, add_shutters=False)

    for r in range(1, rows):
        for c in range(cols):
            if (r + c) % 3 == 0:
                x = (c - (cols - 1) / 2.0) * gap_x + 1.32 if c < cols - 1 else (c - (cols - 1) / 2.0) * gap_x - 1.32
                z = row_z0 + r * gap_y - 0.58
                box(f'AC_Unit_{r}_{c}', (x, front_y - 0.18, z), (0.58, 0.34, 0.42), mats['metal_light'], bevel=0.02)
                cylinder(f'AC_Fan_{r}_{c}', (x - 0.10, front_y - 0.36, z), 0.14, 0.04, mats['metal_dark'], verts=12, rot=(math.pi / 2.0, 0, 0), smooth=True)
                box(f'AC_Grille_{r}_{c}', (x + 0.18, front_y - 0.36, z), (0.14, 0.03, 0.28), mats['metal_dark'], bevel=0.0)
                for b_off in (-0.20, 0.20):
                    box(f'AC_BracketV_{r}_{c}_{b_off}', (x + b_off, front_y - 0.06, z - 0.28), (0.05, 0.08, 0.24), mats['metal_dark'], bevel=0.0)
                    box(f'AC_BracketH_{r}_{c}_{b_off}', (x + b_off, front_y - 0.18, z - 0.23), (0.05, 0.32, 0.05), mats['metal_dark'], bevel=0.0)
                cylinder(f'AC_Pipe_{r}_{c}', (x + 0.30, front_y - 0.10, z - 0.04), 0.03, 0.34, mats['copper'], verts=8, smooth=True)

    for idx, (r, c, lmat) in enumerate([(1, 1, mats['laundry_a']), (1, 4, mats['laundry_b']), (2, 2, mats['laundry_c'])]):
        x = (c - (cols - 1) / 2.0) * gap_x
        z = row_z0 + r * gap_y - 0.96
        box(f'Laundry_Bar_{idx}', (x, front_y - 0.36, z + 0.28), (1.42, 0.035, 0.035), mats['metal_dark'], bevel=0.0)
        box(f'Laundry_SupportL_{idx}', (x - 0.68, front_y - 0.20, z + 0.28), (0.04, 0.34, 0.04), mats['metal_dark'], bevel=0.0)
        box(f'Laundry_SupportR_{idx}', (x + 0.68, front_y - 0.20, z + 0.28), (0.04, 0.34, 0.04), mats['metal_dark'], bevel=0.0)
        box(f'Laundry_Shirt_{idx}', (x - 0.22, front_y - 0.37, z), (0.42, 0.06, 0.52), lmat, bevel=0.015)
        box(f'Laundry_SleeveL_{idx}', (x - 0.45, front_y - 0.37, z + 0.14), (0.14, 0.05, 0.20), lmat, bevel=0.0, rot=(0, 0.35, 0))
        box(f'Laundry_SleeveR_{idx}', (x + 0.01, front_y - 0.37, z + 0.14), (0.14, 0.05, 0.20), lmat, bevel=0.0, rot=(0, -0.35, 0))
        box(f'Laundry_Towel_{idx}', (x + 0.32, front_y - 0.37, z + 0.04), (0.30, 0.05, 0.42), mats['trim_cream'], bevel=0.0)

    # Open ground colonnade + festoon string lights + flanking terracotta urns
    walk_y = front_y - 1.35
    box('Corridor_Floor', (0, walk_y, 0.12), (body_w - 0.3, 2.7, 0.24), mats['stone_ground'], bevel=0.03)
    box('Corridor_StepEdge', (0, walk_y - 1.36, 0.06), (body_w - 0.1, 0.24, 0.12), mats['stone_trim'], bevel=0.015)
    box('Corridor_Canopy', (0, walk_y, 2.94), (body_w - 0.2, 2.74, 0.22), mats['trim_cream'], bevel=0.03)
    box('Corridor_CanopyRim', (0, walk_y - 1.36, 2.94), (body_w - 0.1, 0.14, 0.26), mats['stone_trim'], bevel=0.02)
    box('Corridor_Lintels', (0, walk_y - 1.18, 2.76), (body_w - 1.6, 0.28, 0.18), mats['stone_trim'], bevel=0.02)
    box('Season_Snow_Corridor', (0, walk_y, 3.09), (body_w - 0.35, 2.62, 0.09), mats['snow_cap'], bevel=0.03, tint=False)
    for i in range(cols):
        cx = (i - (cols - 1) / 2.0) * gap_x
        cylinder(f'Corridor_Col_{i}', (cx, walk_y - 1.18, 1.54), 0.135, 2.40, mats['trim_cream'], verts=16, smooth=True)
        box(f'Corridor_Base_{i}', (cx, walk_y - 1.18, 0.34), (0.38, 0.38, 0.24), mats['stone_trim'], bevel=0.02)
        box(f'Corridor_Cap_{i}', (cx, walk_y - 1.18, 2.72), (0.42, 0.42, 0.18), mats['stone_trim'], bevel=0.02)
        if i < cols - 1:
            nx = (i + 1 - (cols - 1) / 2.0) * gap_x
            add_festoon_garland(f'Uni_ColFestoon_{i}', cx + 0.18, nx - 0.18, walk_y - 1.18, 2.68, 0.22, 4, mats)
    for i, x in enumerate((-5.4, 0.0, 5.4)):
        box(f'Porch_Lamp_{i}', (x, walk_y - 0.9, 2.74), (0.38, 0.24, 0.14), mats['lamp_glow'], bevel=0.02, tint=False)

    add_grand_entrance(mats, 0.0, front_y, door_w=1.88, door_h=2.48, z_thresh=0.25,
                       frame_mat=mats['frame_dark'], trim_mat=mats['stone_trim'],
                       door_metal_mat=mats['metal_dark'], with_steps=False, with_pilasters=True, with_sconces=True)
    add_urn_bush('Uni_Urn_L', -2.15, walk_y - 1.50, 0.0, mats, rng)
    add_urn_bush('Uni_Urn_R', 2.15, walk_y - 1.50, 0.0, mats, rng)

    # Cozy cat corner + curved sleeping cat cushion + parcel boxes + dormitory mailbox
    box('Cat_House', (-3.25, walk_y - 0.65, 0.44), (0.68, 0.58, 0.48), mats['wood_warm'], bevel=0.02)
    box('Cat_House_Door', (-3.25, walk_y - 0.95, 0.40), (0.28, 0.06, 0.32), mats['metal_dark'], bevel=0.015)
    gable_prism('Cat_House_Roof', (-3.25, walk_y - 0.65, 0.68), 0.80, 0.70, 0.34, mats['roof_terracotta'], bevel=0.015)
    ico('Dorm_Orange_Cat', (-2.55, walk_y - 0.68, 0.36), 0.14, mats['cat_orange'], sub=1, scale=(1.15, 0.9, 1.0), smooth=True)
    ico('Dorm_Orange_CatHead', (-2.42, walk_y - 0.74, 0.50), 0.09, mats['cat_orange'], sub=1, smooth=True)
    cylinder('Dorm_CatBowl_A', (-2.85, walk_y - 0.92, 0.26), 0.09, 0.06, mats['terracotta'], verts=10, smooth=True)
    cylinder('Dorm_CatBowl_B', (-2.65, walk_y - 0.94, 0.26), 0.09, 0.06, mats['laundry_b'], verts=10, smooth=True)
    box('Uni_Parcel_A', (3.15, walk_y - 0.55, 0.42), (0.48, 0.40, 0.34), mats['wing_warm'], bevel=0.015)
    box('Uni_Parcel_B', (3.55, walk_y - 0.60, 0.36), (0.36, 0.32, 0.24), mats['plaster_cream'], bevel=0.015)

    # Rooftop + wrought balustrade + stargazing pergola deck + potted flowers + braced water tower
    box('Roof_Slab', (0, 0, body_h + 0.22), (body_w + 0.75, body_d + 0.75, 0.44), mats['roof_slate'], bevel=0.03)
    box('Roof_Trim', (0, 0, body_h + 0.50), (body_w + 0.92, body_d + 0.92, 0.14), mats['trim_cream'], bevel=0.02)
    box('Season_Snow_RoofSlab', (0, 0, body_h + 0.61), (body_w + 0.62, body_d + 0.62, 0.11), mats['snow_cap'], bevel=0.04, tint=False)
    for x in (-8.8, -4.4, 0.0, 4.4, 8.8):
        for y in (-3.25, 3.25):
            box(f'Roof_Post_{x}_{y}', (x, y, body_h + 0.92), (0.11, 0.11, 0.80), mats['trim_cream'], bevel=0.015)
    for si in range(25):
        sx = -8.6 + si * (17.2 / 24.0)
        box(f'Roof_Spindle_F_{si}', (sx, -3.25, body_h + 0.90), (0.04, 0.04, 0.72), mats['metal_dark'], bevel=0.0)
        box(f'Roof_Spindle_B_{si}', (sx, 3.25, body_h + 0.90), (0.04, 0.04, 0.72), mats['metal_dark'], bevel=0.0)
    box('Roof_Rail_F', (0, -3.25, body_h + 1.30), (17.7, 0.09, 0.09), mats['trim_cream'], bevel=0.0)
    box('Roof_Rail_B', (0, 3.25, body_h + 1.30), (17.7, 0.09, 0.09), mats['trim_cream'], bevel=0.0)

    # Rooftop timber stargazing pergola garden with climbing ivy, lanterns & brass telescope
    px0 = -2.0
    box('UniRoof_Deck', (px0 + 0.6, -0.35, body_h + 0.49), (4.6, 2.7, 0.09), mats['wood_warm'], bevel=0.015)
    for px in (px0 - 1.3, px0 + 1.3):
        for py in (-1.2, 0.6):
            box(f'UniRoof_PergPost_{px}_{py}', (px, py, body_h + 1.48), (0.13, 0.13, 2.0), mats['wood_warm'], bevel=0.015)
    for ri in range(6):
        ry = -1.3 + ri * 0.40
        box(f'UniRoof_PergBar_{ri}', (px0, ry, body_h + 2.48), (3.2, 0.10, 0.10), mats['wood_warm'], bevel=0.0)
    add_festoon_garland('UniRoof_Festoon', px0 - 1.25, px0 + 1.25, -1.2, body_h + 2.40, 0.14, 5, mats)
    for vi in range(5):
        ico(f'Season_Vines_UniPerg_{vi}', (px0 - 1.1 + vi * 0.55, -1.18, body_h + 2.52), 0.16,
            mats['leaf_accent'] if vi % 2 else mats['leaf_main'], sub=1, scale=(1.2, 0.9, 0.8), smooth=True)
    box('UniRoof_Bench', (px0, -0.3, body_h + 0.75), (1.85, 0.56, 0.42), mats['wood_warm'], bevel=0.018)
    box('UniRoof_Cushion', (px0, -0.3, body_h + 0.98), (1.50, 0.46, 0.07), mats['laundry_a'], bevel=0.015)
    add_flower_cluster('UniRoof_Planter', px0 + 1.85, -1.0, body_h + 0.68, 0.72, mats, rng)
    box('UniRoof_PlanterBox', (px0 + 1.85, -1.0, body_h + 0.60), (0.82, 0.34, 0.22), mats['wood_warm'], bevel=0.015)
    # Brass stargazing telescope on tripod beside pergola
    sc_x, sc_y = px0 + 1.85, 0.15
    for ti in range(3):
        ang = ti * (math.pi * 2.0 / 3.0) + 0.3
        cylinder(f'UniRoof_TriLeg_{ti}', (sc_x + math.cos(ang) * 0.22, sc_y + math.sin(ang) * 0.22, body_h + 0.88),
                 0.03, 0.78, mats['wood_warm'], verts=6, rot=(math.sin(ang) * 0.32, -math.cos(ang) * 0.32, 0.0))
    cylinder('UniRoof_ScopeTube', (sc_x, sc_y, body_h + 1.32), 0.075, 0.92, mats['brass'], verts=10, rot=(0.55, 0.0, -0.25), smooth=True)

    tx, ty = 4.6, 0.8
    for dx, dy in ((-0.8, -0.8), (0.8, -0.8), (-0.8, 0.8), (0.8, 0.8)):
        cylinder(f'Tower_Leg_{dx}_{dy}', (tx + dx, ty + dy, body_h + 1.35), 0.09, 1.7, mats['metal_dark'], verts=8, smooth=True)
    box('Tower_XBraceF', (tx, ty - 0.8, body_h + 1.30), (1.85, 0.05, 0.05), mats['metal_dark'], bevel=0.0, rot=(0, 0.55, 0))
    box('Tower_XBraceB', (tx, ty + 0.8, body_h + 1.30), (1.85, 0.05, 0.05), mats['metal_dark'], bevel=0.0, rot=(0, -0.55, 0))
    box('Tower_Platform', (tx, ty, body_h + 2.12), (2.25, 2.25, 0.14), mats['metal_dark'], bevel=0.02)
    cylinder('Tower_Tank', (tx, ty, body_h + 2.98), 1.15, 1.65, mats['roof_slate'], verts=20, smooth=True)
    for ring_z in (body_h + 2.55, body_h + 3.00, body_h + 3.45):
        torus(f'Tower_Band_{ring_z}', (tx, ty, ring_z), 1.17, 0.035, mats['metal_light'], seg_maj=20, smooth=True)
    cone('Tower_Cap', (tx, ty, body_h + 4.04), 1.34, 0.14, 0.58, mats['roof_slate'], verts=20, smooth=True)
    cylinder('Tower_Spire', (tx, ty, body_h + 4.48), 0.04, 0.40, mats['brass'], verts=8, smooth=True)
    cone('Season_Snow_Tower', (tx, ty, body_h + 4.14), 1.26, 0.12, 0.48, mats['snow_cap'], verts=18, tint=False, smooth=True)
    for lx_off in (-0.18, 0.18):
        cylinder(f'Tower_LadderRail_{lx_off}', (tx - 1.24, ty + lx_off, body_h + 2.15), 0.025, 3.2, mats['metal_light'], verts=6)
    for ri in range(8):
        box(f'Tower_Rung_{ri}', (tx - 1.24, ty, body_h + 0.80 + ri * 0.38), (0.03, 0.36, 0.03), mats['metal_light'], bevel=0.0)
    cylinder('Tower_Standpipe', (tx + 0.35, ty - 0.85, body_h + 1.4), 0.07, 1.8, mats['copper'], verts=8, smooth=True)

    box('Roof_HVAC', (-5.8, -0.4, body_h + 0.92), (1.7, 1.1, 0.88), mats['metal_light'], bevel=0.03)
    cylinder('Roof_HVAC_Cap', (-5.8, -0.4, body_h + 1.44), 0.36, 0.16, mats['metal_dark'], verts=12, smooth=True)
    cylinder('Roof_Antenna', (-7.2, 0.4, body_h + 1.9), 0.05, 2.8, mats['metal_dark'], verts=8)
    box('Roof_AntennaCrossA', (-7.2, 0.4, body_h + 2.85), (1.4, 0.04, 0.04), mats['metal_light'], bevel=0.0)
    box('Roof_AntennaCrossB', (-7.2, 0.4, body_h + 3.15), (0.9, 0.04, 0.04), mats['metal_light'], bevel=0.0)

    add_bicycle('Uni_Bike_0', 5.2, walk_y - 1.7, 0.0, 0.12, mats, frame_mat=mats['laundry_a'])
    add_bicycle('Uni_Bike_1', 6.4, walk_y - 1.75, 0.0, -0.08, mats, frame_mat=mats['wood_green'])
    return rows, cols


def build_grad(mats, rng):
    """研究生宿舍楼 · 研思楼: 5x6 = 30 windows, stone pilasters, glass balconies & blooms, portico & greenhouse."""
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

    fin_z0 = 3.15
    fin_h = body_h - fin_z0 - 0.15
    for c in range(1, cols):
        fx = (c - cols / 2.0) * gap_x
        box(f'Facade_Fin_{c}', (fx, front_y - 0.06, fin_z0 + fin_h / 2.0), (0.24, 0.24, fin_h), mats['stone_trim'], bevel=0.02)
        box(f'Facade_FinCap_{c}', (fx, front_y - 0.08, body_h - 0.28), (0.36, 0.32, 0.18), mats['metal_light'], bevel=0.015)

    for r in range(1, rows):
        z = row_z0 + (r - 0.5) * gap_y
        box(f'Floor_Band_{r}', (0, front_y - 0.05, z), (body_w + 0.32, 0.24, 0.18), mats['frame_dark'], bevel=0.02)

    add_window_grid(mats, rng, rows, cols, gap_x, gap_y, row_z0, front_y, 1.55, 1.75,
                    mats['frame_dark'], mats['metal_light'], corbel_mat=mats['stone_trim'],
                    add_planters=False, add_shutters=False, corbel_skip_rows=(1, 2, 3))

    for r in (1, 2, 3):
        z = row_z0 + r * gap_y - 1.24
        box(f'Balcony_Slab_{r}', (0, front_y - 0.52, z), (body_w - 1.15, 0.94, 0.16), mats['trim_cream'], bevel=0.02)
        box(f'Balcony_Glass_{r}', (0, front_y - 0.94, z + 0.42), (body_w - 1.25, 0.05, 0.72), mats['glass_rail'], bevel=0.0, tint=False)
        box(f'Balcony_Rail_{r}', (0, front_y - 0.94, z + 0.80), (body_w - 1.20, 0.08, 0.06), mats['metal_dark'], bevel=0.0)
        for bi in range(7):
            bx = -8.1 + bi * 2.7
            box(f'Balcony_Post_{r}_{bi}', (bx, front_y - 0.94, z + 0.43), (0.06, 0.07, 0.78), mats['metal_dark'], bevel=0.0)
            if bi % 2 == 1:
                box(f'Balcony_Cantilever_{r}_{bi}', (bx, front_y - 0.36, z - 0.14), (0.12, 0.56, 0.14), mats['frame_dark'], bevel=0.015)
        for px in (-6.75, 1.35) if r % 2 == 1 else (-1.35, 6.75):
            cylinder(f'Balcony_Pot_{r}_{px}', (px, front_y - 0.74, z + 0.22), 0.16, 0.26, mats['terracotta'], verts=10, smooth=True)
            add_flower_cluster(f'Balcony_Fl_{r}_{px}', px, front_y - 0.74, z + 0.36, 0.42, mats, rng)

    add_grand_entrance(mats, 0.0, front_y, door_w=2.85, door_h=2.08, z_thresh=0.34,
                       frame_mat=mats['frame_dark'], trim_mat=mats['metal_light'],
                       door_metal_mat=mats['metal_dark'], with_steps=True, with_pilasters=True, with_sconces=True)
    box('Entrance_Awning', (0, front_y - 1.05, 2.58), (4.6, 2.0, 0.18), mats['metal_dark'], bevel=0.02)
    box('Entrance_AwningTrim', (0, front_y - 1.05, 2.68), (4.7, 2.08, 0.06), mats['metal_light'], bevel=0.0)
    box('Entrance_SoffitGlow', (0, front_y - 1.05, 2.47), (3.8, 0.24, 0.04), mats['lamp_glow'], bevel=0.0, tint=False)
    for sx in (-1.95, 1.95):
        box(f'Portico_Col_{sx}', (sx, front_y - 1.82, 1.34), (0.24, 0.24, 2.38), mats['stone_trim'], bevel=0.02)
        box(f'Portico_ColBase_{sx}', (sx, front_y - 1.82, 0.16), (0.34, 0.34, 0.26), mats['frame_dark'], bevel=0.02)
        box(f'Portico_ColCap_{sx}', (sx, front_y - 1.82, 2.48), (0.34, 0.34, 0.14), mats['stone_trim'], bevel=0.015)
    # Entrance plaza bollards + topiary terracotta urns
    for side, bx in (('L', -2.75), ('R', 2.75)):
        cylinder(f'Grad_Bollard_{side}', (bx, front_y - 1.9, 0.42), 0.13, 0.84, mats['frame_dark'], verts=10, smooth=True)
        ico(f'Grad_BollardGlow_{side}', (bx, front_y - 1.9, 0.88), 0.11, mats['lantern_warm'], sub=1, tint=False, smooth=True)
    add_urn_bush('Grad_Urn_L', -3.65, front_y - 1.55, 0.0, mats, rng)
    add_urn_bush('Grad_Urn_R', 3.65, front_y - 1.55, 0.0, mats, rng)
    box('Season_Snow_Awning', (0, front_y - 1.05, 2.75), (4.45, 1.90, 0.09), mats['snow_cap'], bevel=0.03, tint=False)

    box('Roof_Slab', (0, 0, body_h + 0.22), (body_w + 0.55, body_d + 0.55, 0.44), mats['frame_dark'], bevel=0.03)
    box('Roof_ParapetCap', (0, -body_d / 2.0 - 0.14, body_h + 0.52), (body_w + 0.62, 0.28, 0.16), mats['stone_trim'], bevel=0.02)
    box('Season_Snow_Roof', (0, 0, body_h + 0.52), (body_w + 0.35, body_d + 0.35, 0.11), mats['snow_cap'], bevel=0.04, tint=False)

    gx = -3.2
    box('Greenhouse_Base', (gx, 0, body_h + 0.72), (5.2, 3.2, 0.55), mats['brick_warm'], bevel=0.02)
    box('Greenhouse_Glass', (gx, 0, body_h + 1.65), (5.0, 3.0, 1.4), mats['glass_rail'], bevel=0.0, tint=False)
    gable_prism('Greenhouse_Roof', (gx, 0, body_h + 2.35), 5.3, 3.3, 1.0, mats['glass_rail'], bevel=0.015)
    box('Greenhouse_Ridge', (gx, 0, body_h + 3.38), (5.35, 0.12, 0.10), mats['metal_dark'], bevel=0.0)
    box('Greenhouse_Cupola', (gx, 0, body_h + 3.55), (1.4, 0.72, 0.26), mats['frame_dark'], bevel=0.015)
    for rx in (-5.6, -4.4, -3.2, -2.0, -0.8):
        box(f'Greenhouse_Rib_{rx}', (rx, -1.52, body_h + 1.65), (0.08, 0.08, 1.45), mats['metal_dark'], bevel=0.0)
        box(f'Greenhouse_RibB_{rx}', (rx, 1.52, body_h + 1.65), (0.08, 0.08, 1.45), mats['metal_dark'], bevel=0.0)
    box('Greenhouse_Glow', (gx, 0, body_h + 1.45), (3.8, 1.8, 0.8), mats['lamp_glow'], bevel=0.0, tint=False)

    cx = 4.6
    box('Patio_Deck', (cx, -0.2, body_h + 0.48), (4.6, 3.4, 0.12), mats['wood_warm'], bevel=0.02)
    cylinder('Patio_Table', (cx, -0.4, body_h + 0.90), 0.78, 0.08, mats['wood_warm'], verts=16, bevel=0.015, smooth=True)
    ico('Patio_TableLantern', (cx + 0.22, -0.4, body_h + 1.02), 0.10, mats['lantern_warm'], sub=1, tint=False, smooth=True)
    cylinder('Patio_Leg', (cx, -0.4, body_h + 0.68), 0.07, 0.44, mats['metal_dark'], verts=8, smooth=True)
    cylinder('Patio_Pole', (cx, -0.4, body_h + 1.72), 0.045, 1.75, mats['metal_light'], verts=8, smooth=True)
    cone('Patio_Umbrella', (cx, -0.4, body_h + 2.62), 1.48, 0.12, 0.52, mats['laundry_a'], verts=16, smooth=True)
    ico('Patio_UmbrellaFinial', (cx, -0.4, body_h + 2.90), 0.08, mats['brass'], sub=1, smooth=True)
    for side, ox in (('L', cx - 1.15), ('R', cx + 1.15)):
        box(f'Patio_ChairSeat_{side}', (ox, -0.4, body_h + 0.74), (0.46, 0.46, 0.06), mats['wood_warm'], bevel=0.015)
        box(f'Patio_ChairPad_{side}', (ox, -0.4, body_h + 0.78), (0.38, 0.38, 0.04), mats['laundry_c'], bevel=0.0)
        box(f'Patio_ChairBack_{side}', (ox + (-0.20 if side == 'L' else 0.20), -0.4, body_h + 0.98), (0.06, 0.46, 0.46), mats['wood_warm'], bevel=0.015)
        cylinder(f'Patio_ChairLeg_{side}', (ox, -0.4, body_h + 0.62), 0.04, 0.22, mats['metal_dark'], verts=8)
    add_festoon_garland('Grad_PatioFestoon', 2.4, 6.8, -1.65, body_h + 2.35, 0.18, 6, mats)

    add_tree('Grad_Ginkgo_L', -11.4, -1.6, 0.0, 7.2, 2.25, mats, rng, is_ginkgo=True, with_planter=True, tree_lantern=True)
    add_tree('Grad_Ginkgo_R', 11.4, -1.6, 0.0, 7.4, 2.35, mats, rng, is_ginkgo=True, with_planter=True)
    return rows, cols


def build_staff(mats, rng):
    """教职工宿舍楼 · 桂花院: 3x4 = 12 wide windows, Tudor braces, eave rafters, arbor gate, firewood, tea & Yukimi lantern."""
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

    for bx in (-body_w / 2.0 + 0.2, -3.4, 3.4, body_w / 2.0 - 0.2):
        box(f'Beam_V_{bx}', (bx, front_y - 0.04, body_h / 2.0 + 0.4), (0.28, 0.14, body_h - 0.8), mats['wood_warm'], bevel=0.015)
    for r in range(1, rows):
        z = row_z0 + (r - 0.5) * gap_y
        box(f'Beam_H_{r}', (0, front_y - 0.05, z), (body_w + 0.2, 0.16, 0.26), mats['wood_warm'], bevel=0.02)
    for bx, rot_y in ((-6.8, 0.72), (-4.0, -0.72), (4.0, 0.72), (6.8, -0.72)):
        box(f'Beam_Diag_{bx}', (bx, front_y - 0.04, body_h - 0.62), (0.14, 0.12, 1.0), mats['wood_warm'], bevel=0.0, rot=(0, rot_y, 0))

    add_window_grid(mats, rng, rows, cols, gap_x, gap_y, row_z0, front_y, 2.05, 1.9,
                    mats['wood_warm'], mats['wood_warm'], shutter_mat=mats['shutter_slate'],
                    corbel_mat=mats['wood_warm'], add_planters=True, add_shutters=True)

    roof_w = body_w + 1.5
    roof_d = body_d + 1.5
    ridge_h = 3.8
    roof_z = body_h + 0.28
    box('Roof_Eaves', (0, 0, body_h + 0.15), (body_w + 1.3, body_d + 1.3, 0.24), mats['wood_warm'], bevel=0.03)
    for ri in range(17):
        rx = -body_w * 0.48 + (ri / 16.0) * (body_w * 0.96)
        box(f'Roof_Rafter_F_{ri}', (rx, front_y - 0.56, body_h - 0.06), (0.14, 0.48, 0.16), mats['wood_warm'], bevel=0.015, rot=(0.24, 0, 0))
    gable_prism('Roof_Pitched', (0, 0, roof_z), roof_w, roof_d, ridge_h, mats['roof_moss'], bevel=0.03)
    box('Roof_Ridge', (0, 0, roof_z + ridge_h + 0.04), (roof_w + 0.15, 0.28, 0.22), mats['wood_warm'], bevel=0.02)
    add_festoon_garland('Staff_EaveFestoon', -7.2, 7.2, front_y - 0.62, body_h + 0.02, 0.22, 13, mats)

    slope_len = math.hypot(roof_d / 2.0, ridge_h)
    slope_ang = math.atan2(ridge_h, roof_d / 2.0)
    for ri in range(17):
        rx = -roof_w * 0.46 + (ri / 16.0) * (roof_w * 0.92)
        if 3.6 < rx < 5.2:
            continue
        for side_s, ang_s in ((-1.0, slope_ang), (1.0, -slope_ang)):
            box(f'StaffRoof_Rib_{ri}_{int(side_s)}', (rx, side_s * (roof_d * 0.25), roof_z + ridge_h * 0.50 + 0.05),
                (0.13, slope_len * 0.98, 0.11), mats['roof_moss'], bevel=0.0, rot=(ang_s, 0, 0))

    gable_prism('Season_Snow_Roof', (0, 0, body_h + 0.44), roof_w + 0.04, roof_d + 0.04, ridge_h - 0.02, mats['snow_cap'], bevel=0.04, tint=False)
    box('Chimney_Base', (4.4, 1.2, body_h + 3.2), (1.1, 1.1, 2.4), mats['brick_red'], bevel=0.03)
    box('Chimney_Cap', (4.4, 1.2, body_h + 4.48), (1.38, 1.38, 0.22), mats['trim_cream'], bevel=0.02)
    cylinder('Chimney_Pot_L', (4.15, 1.2, body_h + 4.78), 0.14, 0.42, mats['terracotta'], verts=10, smooth=True)
    cylinder('Chimney_Pot_R', (4.65, 1.2, body_h + 4.78), 0.14, 0.42, mats['terracotta'], verts=10, smooth=True)
    # Soft drifting stylized chimney smoke puffs
    for si, (sx, sy, sz, sr) in enumerate([(4.15, 1.25, body_h + 5.35, 0.24), (4.0, 1.38, body_h + 5.85, 0.34), (3.85, 1.52, body_h + 6.45, 0.44)]):
        ico(f'Chimney_Smoke_{si}', (sx, sy, sz), sr, mats['smoke_wisp'], sub=2, scale=(1.2, 1.0, 0.85), tint=False, smooth=True, organic=0.14, seed=si)
    box('Season_Snow_Chimney', (4.4, 1.2, body_h + 4.64), (1.3, 1.3, 0.11), mats['snow_cap'], bevel=0.03, tint=False)

    add_grand_entrance(mats, 0.0, front_y, door_w=1.90, door_h=2.02, z_thresh=0.34,
                       frame_mat=mats['wood_warm'], trim_mat=mats['stone_trim'],
                       door_metal_mat=mats['wood_warm'], with_steps=True, with_pilasters=True, with_sconces=True)
    gable_prism('Entrance_Porch_Roof', (0, front_y - 0.88, 2.46), 3.45, 1.88, 0.78, mats['roof_moss'], bevel=0.02)
    for px in (-1.45, 1.45):
        box(f'Porch_Post_{px}', (px, front_y - 1.56, 1.25), (0.16, 0.16, 2.40), mats['wood_warm'], bevel=0.015)
        box(f'Porch_PostBase_{px}', (px, front_y - 1.56, 0.14), (0.26, 0.26, 0.28), mats['stone_trim'], bevel=0.02)
        box(f'Porch_Brace_{px}', (px, front_y - 1.18, 2.26), (0.12, 0.64, 0.12), mats['wood_warm'], bevel=0.0, rot=(-0.55, 0, 0))
    box('Porch_HangLantern', (0, front_y - 1.54, 2.34), (0.24, 0.24, 0.28), mats['lantern_warm'], bevel=0.02, tint=False)
    gable_prism('Season_Snow_Porch', (0, front_y - 0.88, 2.57), 3.48, 1.90, 0.76, mats['snow_cap'], bevel=0.03, tint=False)
    # Cozy wooden garden arbor trellis archway leading toward front stepping stones
    box('Staff_ArborPostL', (-1.55, front_y - 2.30, 1.25), (0.14, 0.14, 2.50), mats['wood_warm'], bevel=0.015)
    box('Staff_ArborPostR', (1.55, front_y - 2.30, 1.25), (0.14, 0.14, 2.50), mats['wood_warm'], bevel=0.015)
    box('Staff_ArborBeam', (0.0, front_y - 2.30, 2.55), (3.65, 0.26, 0.14), mats['wood_warm'], bevel=0.015)
    for ai in range(4):
        ico(f'Season_Vines_StaffArb_{ai}', (-1.2 + ai * 0.8, front_y - 2.30, 2.66), 0.18,
            mats['leaf_accent'] if ai % 2 else mats['leaf_main'], sub=1, scale=(1.2, 0.9, 0.8), smooth=True)
    add_urn_bush('Staff_Urn_L', -2.25, front_y - 1.65, 0.0, mats, rng)

    # Stacked cozy firewood log rack under miniature shed roof
    box('WoodRack_Frame', (2.35, front_y - 0.45, 0.56), (1.15, 0.46, 0.96), mats['wood_warm'], bevel=0.015)
    box('WoodRack_Cap', (2.35, front_y - 0.48, 1.10), (1.28, 0.62, 0.10), mats['roof_moss'], bevel=0.015, rot=(-0.15, 0, 0))
    for row_i in range(3):
        for col_i in range(4):
            cylinder(f'Firewood_{row_i}_{col_i}', (1.98 + col_i * 0.24, front_y - 0.46, 0.20 + row_i * 0.21),
                     0.095, 0.40, mats['trunk'], verts=10, rot=(math.pi / 2.0, 0, 0), smooth=True)

    for side, sx in (('L', -body_w / 2.0 + 0.45), ('R', body_w / 2.0 - 0.45)):
        for k in range(10):
            iz = 1.0 + k * 1.12
            ix = sx + rng.uniform(-0.32, 0.32)
            ico(f'Season_Vines_{side}_{k}', (ix, front_y - 0.11, iz), rng.uniform(0.24, 0.38),
                mats['leaf_main'] if k % 2 == 0 else mats['leaf_accent'], sub=2, scale=(1.35, 0.38, 1.05), smooth=True, organic=0.14, seed=k)

    for si, (sx, sy) in enumerate([(0.0, front_y - 1.7), (-0.8, front_y - 2.15), (-1.9, front_y - 2.35), (-3.0, front_y - 2.35)]):
        cylinder(f'Stepping_Stone_{si}', (sx, sy, 0.03), 0.36, 0.06, mats['stone_trim'], verts=10, bevel=0.015, smooth=True)
    tx, ty = -4.6, front_y - 2.35
    cylinder('Stone_Table_Top', (tx, ty, 0.72), 0.86, 0.12, mats['stone_ground'], verts=14, bevel=0.02, smooth=True)
    cylinder('Stone_Table_Leg', (tx, ty, 0.36), 0.28, 0.68, mats['stone_ground'], verts=10, smooth=True)
    ico('Tea_Pot', (tx - 0.12, ty + 0.06, 0.88), 0.13, mats['terracotta'], sub=1, scale=(1.1, 1.1, 0.9), smooth=True)
    cylinder('Tea_Pot_Lid', (tx - 0.12, ty + 0.06, 0.99), 0.06, 0.04, mats['terracotta'], verts=8, smooth=True)
    for ci, ang in enumerate((0.4, 2.4, 4.5)):
        cylinder(f'Tea_Cup_{ci}', (tx + math.cos(ang) * 0.36, ty + math.sin(ang) * 0.36, 0.82), 0.055, 0.08, mats['trim_cream'], verts=8, smooth=True)
    for i, ang in enumerate((0.2, 2.3, 4.4)):
        cylinder(f'Stone_Stool_{i}', (tx + math.cos(ang) * 1.18, ty + math.sin(ang) * 1.18, 0.24),
                 0.27, 0.48, mats['stone_ground'], verts=10, bevel=0.02, smooth=True)

    lx, ly = 4.6, front_y - 2.25
    cylinder('Lantern_Foot', (lx, ly, 0.10), 0.42, 0.20, mats['stone_trim'], verts=6, bevel=0.02, smooth=True)
    cylinder('Lantern_Post', (lx, ly, 0.54), 0.16, 0.72, mats['stone_ground'], verts=8, smooth=True)
    box('Lantern_Plate', (lx, ly, 0.96), (0.56, 0.56, 0.12), mats['stone_trim'], bevel=0.02)
    box('Lantern_Light', (lx, ly, 1.20), (0.34, 0.34, 0.34), mats['lantern_warm'], bevel=0.0, tint=False)
    cone('Lantern_Roof', (lx, ly, 1.54), 0.56, 0.10, 0.36, mats['roof_slate'], verts=6)
    ico('Lantern_Finial', (lx, ly, 1.76), 0.09, mats['brass'], sub=1, smooth=True)

    add_hedge_strip('Staff_Hedge_R', 6.4, front_y - 0.8, 0.0, 3.2, 0.68, 0.5, mats, rng, flowers=True)
    add_tree('Staff_Osmanthus_R', 10.6, -1.2, 0.0, 5.4, 1.95, mats, rng, with_planter=True, tree_lantern=True)
    return rows, cols


def _build_detailed_neighbor(name, nx, ny, nw, nd, nh, wall_mat, roof_mat, pitched, mats, rng):
    """Build an intricate multi-mass neighbor hall/cottage with 4-pane windows, shutters, quoins, chimney pots & dormer."""
    box(f'{name}_Plinth', (nx, ny, 0.45), (nw + 0.44, nd + 0.44, 0.9), mats['stone_ground'], bevel=0.03, top_z=18.0, half_w=48.0)
    box(f'{name}_Body', (nx, ny, nh / 2.0), (nw, nd, nh), wall_mat, bevel=0.04, top_z=18.0, half_w=48.0)
    box(f'{name}_Cornice', (nx, ny, nh - 0.16), (nw + 0.58, nd + 0.58, 0.32), mats['trim_cream'], bevel=0.02)
    box(f'{name}_CorniceTop', (nx, ny, nh + 0.04), (nw + 0.72, nd + 0.72, 0.12), roof_mat, bevel=0.02)
    # Corner stone quoins framing cottage silhouette
    for sx in (-1.0, 1.0):
        for sy in (-1.0, 1.0):
            box(f'{name}_Pilaster_{int(sx)}_{int(sy)}', (nx + sx * (nw * 0.48), ny + sy * (nd * 0.48), nh * 0.50),
                (0.36, 0.36, nh - 0.5), mats['stone_trim'], bevel=0.02)

    # Forward-projecting side wing annex so silhouette steps forward naturally
    side_dir = 1.0 if nx < 0 else -1.0
    annex_w = nw * 0.38
    annex_d = nd * 0.80
    annex_h = nh * 0.74
    ax = nx + side_dir * (nw * 0.36)
    ay = ny - nd * 0.24
    box(f'{name}_Annex', (ax, ay, annex_h / 2.0), (annex_w, annex_d, annex_h), wall_mat, bevel=0.03, top_z=18.0, half_w=48.0)
    box(f'{name}_AnnexPlinth', (ax, ay, 0.45), (annex_w + 0.26, annex_d + 0.26, 0.9), mats['stone_ground'], bevel=0.02)
    box(f'{name}_AnnexEave', (ax, ay, annex_h + 0.02), (annex_w + 0.48, annex_d + 0.48, 0.16), mats['trim_cream'], bevel=0.02)
    gable_prism(f'{name}_AnnexRoof', (ax, ay, annex_h + 0.08), annex_w + 0.54, annex_d + 0.54, 1.72, roof_mat, bevel=0.02)
    box(f'{name}_AnnexRidge', (ax, ay, annex_h + 1.82), (annex_w + 0.60, 0.22, 0.14), mats['trim_cream'], bevel=0.0)

    if pitched:
        gable_prism(f'{name}_Roof', (nx, ny, nh + 0.08), nw + 1.05, nd + 1.05, 2.95, roof_mat, bevel=0.02)
        box(f'{name}_Ridge', (nx, ny, nh + 3.05), (nw + 1.12, 0.26, 0.18), mats['trim_cream'], bevel=0.0)
        box(f'{name}_Chimney', (nx - nw * 0.28, ny + 0.6, nh + 2.2), (0.92, 0.92, 2.1), mats['brick_red'], bevel=0.02)
        box(f'{name}_ChimCap', (nx - nw * 0.28, ny + 0.6, nh + 3.30), (1.10, 1.10, 0.14), mats['stone_trim'], bevel=0.015)
        cylinder(f'{name}_ChimPot', (nx - nw * 0.28, ny + 0.6, nh + 3.50), 0.14, 0.34, mats['terracotta'], verts=10, smooth=True)
        # Pitched gable attic dormer overlooking plaza
        dx_d = nx - side_dir * (nw * 0.14)
        dy_d = ny - nd * 0.26
        box(f'{name}_DormBox', (dx_d, dy_d, nh + 1.15), (1.85, 1.65, 1.25), wall_mat, bevel=0.02)
        gable_prism(f'{name}_DormRoof', (dx_d, dy_d, nh + 1.78), 2.15, 1.95, 0.78, roof_mat, bevel=0.015)
        box(f'{name}_DormGlass', (dx_d, dy_d - 0.85, nh + 1.18), (0.86, 0.08, 0.72), mats['lantern_warm'], bevel=0.0, tint=False)
        box(f'{name}_DormCrossV', (dx_d, dy_d - 0.90, nh + 1.18), (0.06, 0.04, 0.74), mats['frame_dark'], bevel=0.0)
    else:
        box(f'{name}_Roof', (nx, ny, nh + 0.26), (nw + 0.72, nd + 0.72, 0.52), roof_mat, bevel=0.03)
        box(f'{name}_ParapetTrim', (nx, ny - nd / 2.0 - 0.16, nh + 0.60), (nw + 0.74, 0.22, 0.18), mats['stone_trim'], bevel=0.02)
        box(f'{name}_Penthouse', (nx - nw * 0.18, ny, nh + 1.05), (nw * 0.30, nd * 0.48, 1.25), roof_mat, bevel=0.02)
        box(f'{name}_PentTrim', (nx - nw * 0.18, ny, nh + 1.72), (nw * 0.34, nd * 0.52, 0.12), mats['stone_trim'], bevel=0.015)

    # Multi-pane framed architectural windows with crossbars, stone hoods & occasional flower boxes
    skip_col = 3 if side_dir > 0 else 0
    for r in range(3):
        for c in range(4):
            if c == skip_col:
                continue
            wx = nx + (c - 1.5) * (nw * 0.22)
            wz = 2.65 + r * (nh * 0.24)
            wy = ny - nd / 2.0
            box(f'{name}_WFrame_{r}_{c}', (wx, wy - 0.05, wz), (1.12, 0.14, 1.40), mats['trim_cream'], bevel=0.015)
            box(f'{name}_WHood_{r}_{c}', (wx, wy - 0.12, wz + 0.74), (1.26, 0.22, 0.12), mats['stone_trim'], bevel=0.015)
            box(f'{name}_WSill_{r}_{c}', (wx, wy - 0.12, wz - 0.72), (1.24, 0.20, 0.12), mats['stone_trim'], bevel=0.015)
            is_lit = rng.random() > 0.36
            box(f'{name}_WGlass_{r}_{c}', (wx, wy - 0.08, wz), (0.84, 0.06, 1.14),
                mats['lantern_warm'] if is_lit else mats['glass_dark'], bevel=0.0, tint=False)
            # 4-pane window mullions in front of glass so every neighbor window reads clean
            box(f'{name}_WCrossV_{r}_{c}', (wx, wy - 0.13, wz), (0.065, 0.05, 1.16), mats['frame_dark'], bevel=0.0)
            box(f'{name}_WCrossH_{r}_{c}', (wx, wy - 0.13, wz + 0.06), (0.86, 0.05, 0.065), mats['frame_dark'], bevel=0.0)
            if pitched and (r + c) % 2 == 0 and r > 0:
                box(f'{name}_WPbox_{r}_{c}', (wx, wy - 0.20, wz - 0.62), (0.64, 0.18, 0.14), mats['wood_warm'], bevel=0.015)
                add_flower_cluster(f'{name}_WFl_{r}_{c}', wx, wy - 0.20, wz - 0.52, 0.56, mats, rng)

    # Upper annex framed windows + stone-stepped doorway porch & sconces
    af_y = ay - annex_d / 2.0
    for r in (1, 2):
        wz = 2.65 + r * (nh * 0.24)
        if wz + 0.8 < annex_h:
            box(f'{name}_AWFrame_{r}', (ax, af_y - 0.05, wz), (1.06, 0.14, 1.32), mats['trim_cream'], bevel=0.015)
            box(f'{name}_AWSill_{r}', (ax, af_y - 0.12, wz - 0.67), (1.20, 0.20, 0.12), mats['stone_trim'], bevel=0.015)
            box(f'{name}_AWGlass_{r}', (ax, af_y - 0.08, wz), (0.80, 0.06, 1.08), mats['lantern_warm'], bevel=0.0, tint=False)
            box(f'{name}_AWCrossV_{r}', (ax, af_y - 0.13, wz), (0.06, 0.05, 1.10), mats['frame_dark'], bevel=0.0)
            box(f'{name}_AWCrossH_{r}', (ax, af_y - 0.13, wz + 0.05), (0.82, 0.05, 0.06), mats['frame_dark'], bevel=0.0)
    box(f'{name}_PorchStep', (ax, af_y - 0.42, 0.14), (1.55, 0.85, 0.28), mats['stone_trim'], bevel=0.015)
    box(f'{name}_PorchCanopy', (ax, af_y - 0.46, 2.40), (2.05, 1.00, 0.16), roof_mat, bevel=0.02)
    box(f'{name}_PorchFrame', (ax, af_y - 0.05, 1.24), (1.28, 0.12, 2.06), mats['wood_warm'], bevel=0.015)
    box(f'{name}_PorchGlow', (ax, af_y - 0.09, 1.22), (1.02, 0.08, 1.90), mats['door_glow'], bevel=0.0, tint=False)
    box(f'{name}_PorchSconce', (ax + 0.72, af_y - 0.14, 1.78), (0.16, 0.16, 0.20), mats['lantern_warm'], bevel=0.015, tint=False)
    for sx_p in (ax - 0.82, ax + 0.82):
        box(f'{name}_PorchPost_{sx_p}', (sx_p, af_y - 0.82, 1.20), (0.13, 0.13, 2.34), mats['wood_warm'], bevel=0.015)
        box(f'{name}_PorchPostBase_{sx_p}', (sx_p, af_y - 0.82, 0.16), (0.22, 0.22, 0.24), mats['stone_trim'], bevel=0.015)


def build_campus_grounds(mats, rng):
    """Shared Stardew-Oil campus world plate: cobblestone avenue, brick-pier wrought fence, ornate gazebo pavilion,
    lily-blooming lotus pond & arched footbridge, collegiate brick clocktower, multi-cluster botanical trees & grove.
    """
    # Expanded soft ground apron (Campus_Grass_* and Campus_Road* preserve shadow exclusion)
    box('Campus_Grass_Base', (0, 6.0, -0.4), (104.0, 68.0, 0.8), mats['lawn_grass'], bevel=0.05, top_z=4.0, half_w=52.0)
    box('Campus_Stone_Plaza', (0, -3.5, 0.02), (25.6, 12.4, 0.12), mats['stone_ground'], bevel=0.03)
    box('Campus_PlazaBorder', (0, -6.95, 0.09), (25.8, 0.34, 0.16), mats['stone_trim'], bevel=0.015)
    box('Campus_Road', (0, -9.2, 0.04), (104.0, 4.4, 0.12), mats['cobble'], bevel=0.02)
    box('Campus_Curb_N', (0, -7.0, 0.08), (104.0, 0.30, 0.18), mats['trim_cream'], bevel=0.015)
    box('Campus_Curb_S', (0, -11.4, 0.08), (104.0, 0.30, 0.18), mats['trim_cream'], bevel=0.015)

    for ci in range(7):
        cx = -3.6 + ci * 1.2
        box(f'Campus_Road_Crosswalk_{ci}', (cx, -9.2, 0.11), (0.62, 3.3, 0.03), mats['stone_trim'], bevel=0.0)

    # Cozy campus wooden welcome signpost beside plaza east entrance
    box('Plaza_SignPost', (10.8, -6.25, 0.95), (0.14, 0.14, 1.90), mats['wood_warm'], bevel=0.015)
    box('Plaza_SignBoardA', (10.8, -6.28, 1.62), (1.05, 0.10, 0.28), mats['wood_warm'], bevel=0.015, rot=(0, 0, -0.06))
    box('Plaza_SignBoardB', (10.8, -6.28, 1.24), (0.95, 0.10, 0.24), mats['plaster_cream'], bevel=0.015, rot=(0, 0, 0.08))

    # Vintage avenue street lamps (KEEP exact bulb positions at (-12.2/12.2/-26/26, -7.92, 4.86)!)
    for i, lx in enumerate((-12.2, 12.2, -26.0, 26.0)):
        ly = -7.2
        cylinder(f'AveLamp_Foot_{i}', (lx, ly, 0.14), 0.34, 0.28, mats['stone_trim'], verts=12, bevel=0.02, smooth=True)
        cylinder(f'AveLamp_Base_{i}', (lx, ly, 0.55), 0.21, 0.62, mats['metal_dark'], verts=12, smooth=True)
        cylinder(f'AveLamp_Pole_{i}', (lx, ly, 2.85), 0.08, 4.4, mats['metal_dark'], verts=12, smooth=True)
        torus(f'AveLamp_Collar_{i}', (lx, ly, 1.05), 0.17, 0.04, mats['brass'], seg_maj=14, smooth=True)
        torus(f'AveLamp_MidRing_{i}', (lx, ly, 2.85), 0.11, 0.028, mats['brass'], seg_maj=12, smooth=True)
        box(f'AveLamp_Arm_{i}', (lx, ly - 0.35, 5.08), (0.10, 0.80, 0.10), mats['metal_dark'], bevel=0.0)
        box(f'AveLamp_Bracket_{i}', (lx, ly - 0.24, 4.82), (0.06, 0.42, 0.06), mats['brass'], bevel=0.0, rot=(-0.65, 0, 0))
        box(f'AveLamp_Bulb_{i}', (lx, ly - 0.72, 4.86), (0.38, 0.38, 0.38), mats['lamp_glow'], bevel=0.02, tint=False)
        for rx_c in (-0.18, 0.18):
            box(f'AveLamp_Cage_{i}_{rx_c}', (lx + rx_c, ly - 0.72, 4.86), (0.03, 0.38, 0.40), mats['metal_dark'], bevel=0.0)
        cone(f'AveLamp_Cap_{i}', (lx, ly - 0.72, 5.15), 0.38, 0.06, 0.26, mats['metal_dark'], verts=8, smooth=True)
        ico(f'AveLamp_Tip_{i}', (lx, ly - 0.72, 5.30), 0.065, mats['brass'], sub=1, smooth=True)

    # Warm campus café festoon string lights draped along left & right avenue lampposts
    add_festoon_garland('Ave_String_L', -26.0, -12.2, -7.2, 4.75, 0.65, 11, mats)
    add_festoon_garland('Ave_String_R', 12.2, 26.0, -7.2, 4.75, 0.65, 11, mats)

    # 4 Slatted wooden campus benches + red postal pillar box
    for bi, bx in enumerate((-16.2, -8.8, 8.8, 16.2)):
        by = -6.28
        box(f'Bench_Seat_{bi}', (bx, by, 0.44), (1.9, 0.52, 0.08), mats['wood_warm'], bevel=0.015)
        box(f'Bench_Back_{bi}', (bx, by + 0.22, 0.76), (1.9, 0.08, 0.42), mats['wood_warm'], bevel=0.015, rot=(-0.18, 0, 0))
        for lx_off in (-0.78, 0.78):
            box(f'Bench_Leg_{bi}_{lx_off}', (bx + lx_off, by, 0.22), (0.10, 0.50, 0.44), mats['metal_dark'], bevel=0.0)
            box(f'Bench_Arm_{bi}_{lx_off}', (bx + lx_off, by, 0.62), (0.08, 0.52, 0.06), mats['metal_dark'], bevel=0.0)
    cylinder('Campus_Postbox', (-14.1, -6.3, 0.62), 0.23, 1.15, mats['roof_terracotta'], verts=14, smooth=True)
    torus('Campus_PostboxTrim', (-14.1, -6.3, 0.96), 0.24, 0.03, mats['brass'], seg_maj=14, smooth=True)
    cone('Campus_PostboxCap', (-14.1, -6.3, 1.28), 0.27, 0.14, 0.18, mats['roof_terracotta'], verts=14, smooth=True)

    # ---- LEFT GARDEN: Ornate Hexagonal Gazebo Pavilion (lantern at (-19.5, 0.5, 3.25)) ----
    gx, gy = -19.5, 0.5
    cylinder('Gazebo_Plinth', (gx, gy, 0.14), 2.75, 0.28, mats['stone_trim'], verts=16, bevel=0.02, smooth=True)
    cylinder('Gazebo_InnerPad', (gx, gy, 0.28), 2.38, 0.06, mats['cobble'], verts=14, smooth=True)
    cylinder('Gazebo_Step', (gx, gy - 2.68, 0.07), 1.10, 0.14, mats['stone_trim'], verts=12, bevel=0.015, smooth=True)
    for gi in range(6):
        ang = gi * (math.pi / 3.0) + math.pi / 6.0
        px = gx + math.cos(ang) * 2.15
        py = gy + math.sin(ang) * 2.15
        cylinder(f'Gazebo_Post_{gi}', (px, py, 1.65), 0.125, 2.75, mats['wood_warm'], verts=10, smooth=True)
        box(f'Gazebo_Foot_{gi}', (px, py, 0.34), (0.32, 0.32, 0.22), mats['stone_trim'], bevel=0.015)
        # Flush downward-sloping roof hip rib running along hexagon corner ridge to eave
        box(f'Gazebo_HipRib_{gi}', (gx + math.cos(ang) * 1.68, gy + math.sin(ang) * 1.68, 3.74),
            (3.15, 0.11, 0.12), mats['wood_warm'], bevel=0.0, rot=(0.0, 0.44, ang))
        if gi not in (3, 4):  # leave south-facing avenue opening clear
            mid_ang = ang + math.pi / 6.0
            mx = gx + math.cos(mid_ang) * 1.92
            my = gy + math.sin(mid_ang) * 1.92
            box(f'Gazebo_Bench_{gi}', (mx, my, 0.62), (1.68, 0.42, 0.12), mats['wood_warm'], bevel=0.015, rot=(0, 0, mid_ang + math.pi / 2.0))
            box(f'Gazebo_Rail_{gi}', (mx, my, 2.74), (1.92, 0.10, 0.16), mats['wood_warm'], bevel=0.0, rot=(0, 0, mid_ang + math.pi / 2.0))
    cone('Gazebo_Roof', (gx, gy, 3.72), 3.22, 0.24, 1.48, mats['roof_terracotta'], verts=6, rot=(0, 0, math.pi / 6.0))
    cone('Gazebo_RoofCupola', (gx, gy, 4.44), 1.15, 0.18, 0.58, mats['roof_terracotta'], verts=6, rot=(0, 0, math.pi / 6.0))
    cone('Gazebo_RoofRim', (gx, gy, 2.98), 3.28, 3.10, 0.16, mats['wood_warm'], verts=6, rot=(0, 0, math.pi / 6.0))
    ico('Gazebo_Finial', (gx, gy, 4.82), 0.18, mats['brass'], sub=1, smooth=True)
    cone('Season_Snow_Gazebo', (gx, gy, 3.84), 3.14, 0.20, 1.40, mats['snow_cap'], verts=6, rot=(0, 0, math.pi / 6.0), tint=False)
    cylinder('Gazebo_LanternCord', (gx, gy, 3.55), 0.025, 0.50, mats['metal_dark'], verts=6)
    box('Gazebo_Lantern', (gx, gy, 3.25), (0.38, 0.38, 0.42), mats['lantern_warm'], bevel=0.02, tint=False)
    # Winding cobblestone footpath from avenue to gazebo
    for pi in range(6):
        t = pi / 5.0
        px = -17.0 - math.sin(t * 1.4) * 2.4
        py = -6.2 + t * 4.2
        cylinder(f'Gazebo_Path_{pi}', (px, py, 0.04), 0.54, 0.08, mats['cobble'], verts=12, bevel=0.015, smooth=True)
    add_hedge_strip('Gazebo_FlowerBed_L', -22.5, -1.6, 0.0, 3.6, 0.68, 0.58, mats, rng, flowers=True)
    add_hedge_strip('Gazebo_FlowerBed_R', -16.6, 2.6, 0.0, 3.4, 0.65, 0.55, mats, rng, flowers=True)

    # ---- RIGHT GARDEN: Lotus Pond, Cattails, Blossoms & Balustrade Footbridge (lanterns at (16.8/22.2, -1.6, 1.55)) ----
    px_c, py_c = 19.5, -0.8
    pond_ob = cylinder('Pond_WaterDisc', (px_c, py_c, 0.07), 4.15, 0.08, mats['pond_water'], verts=28, smooth=True)
    pond_ob.data.transform(Matrix.Diagonal((1.0, 0.785, 1.0, 1.0)))
    # Multi-layered mossy shoreline boulders & scattered river pebbles
    for ri in range(26):
        ang = (ri / 26.0) * math.pi * 2.0
        rx = px_c + math.cos(ang) * (4.18 + rng.uniform(-0.14, 0.16))
        ry = py_c + math.sin(ang) * (3.26 + rng.uniform(-0.12, 0.14))
        ico(f'Pond_Rock_{ri}', (rx, ry, 0.16), rng.uniform(0.30, 0.56), mats['stone_trim'] if ri % 2 == 0 else mats['stone_ground'],
            sub=1, scale=(1.22, 1.0, 0.60), smooth=True, organic=0.18, seed=ri * 1.7)
    # Shoreline cattail reeds framing the water edge
    for cr_i, (rx_c, ry_c) in enumerate([(-3.5, 1.4), (-3.8, 0.9), (3.4, 1.6), (3.7, 1.1), (-2.9, -2.1)]):
        for stalk in range(3):
            sx = px_c + rx_c + (stalk - 1) * 0.16
            sy = py_c + ry_c + rng.uniform(-0.14, 0.14)
            cylinder(f'Pond_Reed_{cr_i}_{stalk}', (sx, sy, 0.45), 0.032, 0.85 + stalk * 0.12,
                     mats['pine_leaf'], verts=6, rot=(rng.uniform(-0.12, 0.12), rng.uniform(-0.12, 0.12), 0), smooth=True)
            if stalk == 1:
                cylinder(f'Pond_Cattail_{cr_i}', (sx, sy, 0.82), 0.055, 0.22, mats['trunk'], verts=7, smooth=True)
    # 7 floating lily pads & 4 multi-petal lotus blossoms
    for li, (lx_o, ly_o, has_fl) in enumerate([
        (-2.2, 1.2, True), (-1.4, 1.8, False), (1.8, 1.5, True), (2.4, 0.4, False),
        (-0.8, -2.0, True), (1.1, 2.0, True), (-2.5, -0.5, False)
    ]):
        cylinder(f'Pond_Lily_{li}', (px_c + lx_o, py_c + ly_o, 0.12), 0.36, 0.04, mats['leaf_main'], verts=12, smooth=True)
        if has_fl:
            for pi in range(5):
                p_ang = pi * (math.pi * 2.0 / 5.0)
                ico(f'Pond_LotusPetal_{li}_{pi}',
                    (px_c + lx_o + math.cos(p_ang) * 0.11, py_c + ly_o + math.sin(p_ang) * 0.11, 0.17),
                    0.09, mats['flower_coral'], sub=1, scale=(1.2, 0.8, 0.9), smooth=True)
            ico(f'Pond_LotusCore_{li}', (px_c + lx_o, py_c + ly_o, 0.20), 0.065, mats['flower_gold'], sub=1, smooth=True)

    # Arched wooden footbridge spanning pond at y = -1.6 with baluster rails & arch stringers
    by_br = -1.6
    for bi in range(11):
        t = (bi / 10.0) - 0.5
        bx = px_c + t * 5.2
        arch_z = 0.22 + (1.0 - (t * 2.0) ** 2) * 0.58
        pitch = -t * 0.36
        box(f'Bridge_Plank_{bi}', (bx, by_br, arch_z), (0.48, 1.72, 0.10), mats['wood_warm'], bevel=0.015, rot=(0, pitch, 0))
    for side_y in (by_br - 0.78, by_br + 0.78):
        box(f'Bridge_Rail_{side_y}', (px_c, side_y, 1.10), (5.5, 0.09, 0.09), mats['wood_warm'], bevel=0.0)
        box(f'Bridge_Stringer_{side_y}', (px_c, side_y, 0.52), (5.35, 0.11, 0.16), mats['wood_warm'], bevel=0.0)
        for pki in range(7):
            pkx = px_c - 2.1 + pki * 0.70
            box(f'Bridge_Picket_{side_y}_{pki}', (pkx, side_y, 0.82), (0.06, 0.06, 0.52), mats['wood_warm'], bevel=0.0)
    # 4 corner bridge posts + 2 front bridge lanterns matching _mountGroundsGlb halos
    for side_x in (16.8, 22.2):
        for side_y in (by_br - 0.78, by_br + 0.78):
            box(f'Bridge_Post_{side_x}_{side_y}', (side_x, side_y, 0.78), (0.15, 0.15, 1.24), mats['wood_warm'], bevel=0.015)
            ico(f'Bridge_PostCap_{side_x}_{side_y}', (side_x, side_y, 1.44), 0.08, mats['brass'], sub=1, smooth=True)
        box(f'Bridge_Lantern_{side_x}', (side_x, by_br, 1.55), (0.24, 0.24, 0.28), mats['lantern_warm'], bevel=0.015, tint=False)
        cone(f'Bridge_LantCap_{side_x}', (side_x, by_br, 1.75), 0.24, 0.04, 0.16, mats['metal_dark'], verts=4)
    add_hedge_strip('Pond_FlowerBed', 15.8, 2.2, 0.0, 4.2, 0.66, 0.55, mats, rng, flowers=True)

    # ---- PERIMETER BRICK & WROUGHT-IRON BOUNDARY WALL ----
    wall_y = 16.0
    box('Back_Brick_Base', (0, wall_y, 0.42), (96.0, 0.62, 0.84), mats['brick_red'], bevel=0.03)
    box('Back_Wall_Coping', (0, wall_y, 0.88), (96.2, 0.72, 0.12), mats['stone_trim'], bevel=0.015)
    box('Back_Iron_Rail_Top', (0, wall_y, 1.82), (94.0, 0.08, 0.08), mats['metal_dark'], bevel=0.0)
    box('Back_Iron_Rail_Mid', (0, wall_y, 1.32), (94.0, 0.06, 0.06), mats['metal_dark'], bevel=0.0)
    for pi in range(13):
        px = -42.0 + pi * 7.0
        box(f'Back_Pier_{pi}', (px, wall_y, 1.15), (0.94, 0.94, 2.30), mats['brick_red'], bevel=0.03)
        box(f'Back_PierCap_{pi}', (px, wall_y, 2.36), (1.14, 1.14, 0.18), mats['stone_trim'], bevel=0.02)
        if pi % 2 == 1:
            box(f'Back_PierLamp_{pi}', (px, wall_y, 2.60), (0.34, 0.34, 0.30), mats['lantern_warm'], bevel=0.015, tint=False)
            cone(f'Back_PierRoof_{pi}', (px, wall_y, 2.86), 0.34, 0.06, 0.20, mats['metal_dark'], verts=4)
    for xi in range(138):
        px = -41.4 + xi * 0.60
        if any(abs(px - (-42.0 + pi * 7.0)) < 0.65 for pi in range(13)):
            continue
        box(f'Wall_Picket_{xi}', (px, wall_y, 1.44), (0.05, 0.05, 1.05), mats['metal_dark'], bevel=0.0)

    # ---- COLLEGIATE BRICK & SLATE BELL CLOCKTOWER LANDMARK at (-19.5, 17.5) ----
    tx_c, ty_c = -19.5, 17.5
    box('ClockTower_Base', (tx_c, ty_c, 3.0), (4.6, 4.6, 6.0), mats['brick_red'], bevel=0.04, top_z=24.0, half_w=48.0)
    for csx in (-2.25, 2.25):
        for csy in (-2.25, 2.25):
            box(f'CT_Buttress_{csx}_{csy}', (tx_c + csx, ty_c + csy, 6.5), (0.55, 0.55, 13.0), mats['stone_trim'], bevel=0.02)
    box('ClockTower_BeltA', (tx_c, ty_c, 6.1), (4.95, 4.95, 0.28), mats['stone_trim'], bevel=0.02)
    box('ClockTower_Shaft', (tx_c, ty_c, 10.6), (3.9, 3.9, 8.8), mats['brick_red'], bevel=0.04, top_z=24.0, half_w=48.0)
    # Recessed belfry window openings glowing warm gold + gothic bell arch
    box('CT_BelfryFrame', (tx_c, ty_c - 1.98, 10.2), (1.55, 0.16, 2.5), mats['stone_trim'], bevel=0.02)
    box('CT_BelfryGlow', (tx_c, ty_c - 2.02, 10.2), (1.18, 0.08, 2.1), mats['lantern_warm'], bevel=0.0, tint=False)
    box('CT_BelfryMull', (tx_c, ty_c - 2.08, 10.2), (0.09, 0.05, 2.14), mats['frame_dark'], bevel=0.0)
    box('ClockTower_BeltB', (tx_c, ty_c, 15.1), (4.4, 4.4, 0.30), mats['stone_trim'], bevel=0.02)
    # Illuminated round clock dial + brass ring + hour ticks + hands facing plaza
    cylinder('ClockTower_DialFrame', (tx_c, ty_c - 1.98, 14.2), 1.08, 0.18, mats['stone_trim'], verts=20, rot=(math.pi / 2.0, 0, 0), smooth=True)
    torus('ClockTower_BrassRim', (tx_c, ty_c - 2.08, 14.2), 0.94, 0.055, mats['brass'], rot=(math.pi / 2.0, 0, 0), seg_maj=20, smooth=True)
    cylinder('ClockTower_DialGlow', (tx_c, ty_c - 2.04, 14.2), 0.88, 0.10, mats['lantern_warm'], verts=20, rot=(math.pi / 2.0, 0, 0), tint=False, smooth=True)
    for tick_i in range(4):
        ta = tick_i * (math.pi / 2.0)
        box(f'CT_Tick_{tick_i}', (tx_c + math.sin(ta) * 0.72, ty_c - 2.11, 14.2 + math.cos(ta) * 0.72),
            (0.08, 0.04, 0.14), mats['frame_dark'], bevel=0.0, rot=(0, ta, 0))
    box('ClockTower_HandH', (tx_c, ty_c - 2.12, 14.42), (0.08, 0.04, 0.46), mats['frame_dark'], bevel=0.0)
    box('ClockTower_HandM', (tx_c + 0.22, ty_c - 2.12, 14.2), (0.48, 0.04, 0.07), mats['frame_dark'], bevel=0.0)
    cone('ClockTower_Spire', (tx_c, ty_c, 18.2), 3.22, 0.14, 6.0, mats['roof_slate'], verts=4)
    cone('Season_Snow_ClockTower', (tx_c, ty_c, 18.3), 3.12, 0.12, 5.8, mats['snow_cap'], verts=4, tint=False)
    ico('ClockTower_OrbFinial', (tx_c, ty_c, 21.35), 0.18, mats['brass'], sub=1, smooth=True)
    cylinder('ClockTower_Vane', (tx_c, ty_c, 21.85), 0.06, 1.4, mats['brass'], verts=8, smooth=True)

    # ---- DETAILED MULTI-WING CAMPUS NEIGHBOR BUILDINGS ----
    neighbors = [
        ('Neighbor_West', (-31.5, 4.5, 0.0), (13.5, 5.5, 10.8), mats['neighbor_warm'], mats['roof_terracotta'], True),
        ('Neighbor_East', (31.5, 4.5, 0.0), (14.0, 5.8, 12.2), mats['neighbor'], mats['roof_slate'], False),
        ('Neighbor_NorthW', (-30.5, 22.5, 0.0), (16.5, 6.0, 13.5), mats['neighbor'], mats['roof_slate'], True),
        ('Neighbor_NorthE', (23.0, 22.0, 0.0), (17.0, 5.8, 12.5), mats['neighbor_warm'], mats['roof_slate'], False),
    ]
    for name, (nx, ny, _nz), (nw, nd, nh), wmat, rmat, pitched in neighbors:
        _build_detailed_neighbor(name, nx, ny, nw, nd, nh, wmat, rmat, pitched, mats, rng)

    # ---- FOREGROUND BOTANICAL GARDEN TREES & AUTUMN LEAF SCATTER ----
    add_hedge_strip('Campus_Hedge_FL', -14.2, -6.5, 0.0, 4.4, 0.72, 0.55, mats, rng, flowers=True)
    add_hedge_strip('Campus_Hedge_FR', 14.2, -6.5, 0.0, 4.4, 0.72, 0.55, mats, rng, flowers=True)
    for i, (tx, ty, th, tr, ginkgo) in enumerate([
        (-15.5, -4.8, 4.9, 1.72, False),
        (15.2, -5.0, 5.1, 1.78, True),
        (-24.8, -13.2, 4.6, 1.60, False),
        (24.8, -13.2, 4.9, 1.72, True),
        (-13.8, 8.8, 5.8, 2.08, False),
        (14.2, 8.8, 5.6, 1.98, True),
    ]):
        add_tree(f'Campus_Tree_{i}', tx, ty, 0.0, th, tr, mats, rng, is_ginkgo=ginkgo, with_planter=True)

    # Fallen botanical autumn leaf scatter along curb & under trees
    leaf_mats = (mats['flower_gold'], mats['flower_coral'], mats['leaf_accent'])
    for li in range(18):
        lx = -26.0 + li * 3.05 + rng.uniform(-0.6, 0.6)
        ly = -6.55 + rng.uniform(-0.35, 0.35)
        if abs(lx) < 9.5:
            continue
        ico(f'Campus_FallenLeaf_{li}', (lx, ly, 0.08), rng.uniform(0.09, 0.16),
            leaf_mats[li % len(leaf_mats)], sub=1, scale=(1.4, 1.1, 0.25), smooth=True)

    # ---- CONTINUOUS WOODED HORIZON GROVE BEHIND FENCE (positioned cleanly clear of neighbor footprints) ----
    horizon_spots = [
        -41.5, -39.5, -17.0, -13.6, -10.2, -6.8, -3.4, 0.0, 3.4, 6.8, 10.4, 38.8, 41.8
    ]
    for wi, base_wx in enumerate(horizon_spots):
        wx = base_wx + rng.uniform(-0.4, 0.4)
        wy = rng.uniform(17.5, 22.2)
        wh = rng.uniform(5.4, 8.6)
        if wi % 3 == 0:
            add_tree(f'Horizon_Tree_{wi}', wx, wy, 0.0, wh, rng.uniform(1.8, 2.3), mats, rng, is_ginkgo=(wi % 2 == 1), with_planter=False, low_detail=True)
        else:
            add_pine_tree(f'Horizon_Pine_{wi}', wx, wy, 0.0, wh * 1.15, mats, rng)
    for fi, (fx, fy, fh) in enumerate([(-23.2, 11.8, 5.2), (21.0, 12.4, 5.4), (25.8, 11.6, 4.8)]):
        add_tree(f'Yard_BackTree_{fi}', fx, fy, 0.0, fh, 1.85, mats, rng, is_ginkgo=(fi % 2 == 1), with_planter=False, low_detail=False)

    return 0, 0


# ------------------------------------------------------------------ Static Mesh Batcher (60+ FPS Draw Call Consolidation)

def _classify_batch_bucket(ob):
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

"""Headless Blender build for dormitory #17, the v3.0 storybook diorama.

Output is a single GLB consumed by src/scene.js:
  * a 4 x 6 window grid whose panes are named Window_Glass_<row>_<col>
    (the raycaster in src/scene.js looks them up by name),
  * an exterior corridor with columns, parapet and porch lights,
  * a roof slab, rooftop railing and a water tower,
  * a street lamp, a parked bicycle, planters and a diorama ground plate.

Every hard edge is softened by an applied Bevel modifier, and a cheap
top-down + corner-distance ambient occlusion is baked into a vertex colour
attribute so the model does not read as flat plastic in three.js.

Run:
  blender -b -P tools/blender/build_campus_v3.py -- --out public/models/dorm_v3.glb
  python tools/blender/build_campus_v3.py --out public/models/dorm_v3.glb

Both invocations are deterministic: the same seed always yields the same GLB.
"""

import argparse
import math
import os
import random
import sys

try:
    import bpy
    from mathutils import Matrix
except ImportError:  # imported outside Blender: keep the module importable
    bpy = None
    Matrix = None


REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DEFAULT_OUT = os.path.join(REPO_ROOT, 'public', 'models', 'dorm_v3.glb')
DEFAULT_SEED = 20261114

# --- window grid -----------------------------------------------------------
COLS, ROWS = 6, 4
WIN_W, WIN_H = 1.5, 1.9
GAP_X, GAP_Y = 2.7, 3.1
ROW_Z0 = 4.4

SPAN_W = (COLS - 1) * GAP_X + WIN_W          # 15.0, width of the window grid
BODY_W = SPAN_W + 2.6                        # 17.6, facade width
BODY_D = 6.0                                 # facade depth
BODY_H = 15.0                                # facade height
FRONT_Y = -BODY_D / 2.0                      # -3.0, facade sits on this plane
ROOF_Z = BODY_H

# --- baked AO bounds (a little wider than the shell) -----------------------
AO_X_HALF = BODY_W / 2.0 + 2.0
AO_Z_TOP = ROOF_Z + 3.5
COLOR_ATTR = 'Col'

BEVEL_BODY = 0.035
BEVEL_ROOF = 0.03
BEVEL_SEGMENTS = 3


# --- tiny helpers ----------------------------------------------------------

def _clamp(value, low=0.0, high=1.0):
    if value < low:
        return low
    if value > high:
        return high
    return value


def _hash01(x, y, z):
    """Stable pseudo-random value in [0, 1] from a world position."""
    n = int((x * 127.1 + y * 311.7 + z * 74.7) * 1024.0) & 0xFFFFFFFF
    n = (n ^ 0x9E3779B9) & 0xFFFFFFFF
    n = (n * 2246822519) & 0xFFFFFFFF
    n ^= n >> 13
    n = (n * 3266489917) & 0xFFFFFFFF
    n ^= n >> 16
    return (n & 0xFFFFFF) / float(0xFFFFFF)


def bake_ao(ob):
    """Bake a cheap AO term into a per-vertex colour attribute.

    Approximation: faces looking at the sky are bright, faces close to the
    ground or to the silhouette corners are dark, plus a stable value jitter
    that reads as hand-painted brush unevenness.
    """
    me = ob.data
    attr = me.color_attributes.get(COLOR_ATTR)
    if attr is None:
        attr = me.color_attributes.new(name=COLOR_ATTR, type='FLOAT_COLOR', domain='POINT')
    # matrix_basis is derived straight from loc/rot/scale, so it is always in
    # sync here (nothing is parented); matrix_world can be one depsgraph late.
    mw = ob.matrix_basis
    rot = mw.to_3x3()
    data = attr.data
    for index, vert in enumerate(me.vertices):
        world = mw @ vert.co
        normal = rot @ vert.normal
        length = normal.length
        nz = normal.z / length if length > 1e-6 else 0.0
        sky = 0.86 + 0.14 * _clamp(nz, -1.0, 1.0)
        ground = 0.78 + 0.22 * _clamp(world.z / 7.0)
        edge = min(AO_X_HALF - abs(world.x), AO_Z_TOP - world.z, world.z + 1.5)
        corner = 0.84 + 0.16 * _clamp(edge / 2.2)
        jitter = 0.94 + 0.12 * _hash01(world.x, world.y, world.z)
        ao = _clamp(sky * ground * corner * jitter, 0.55, 1.0)
        data[index].color = (_clamp(ao * 1.03), ao, _clamp(ao * 0.96), 1.0)


def _apply_modifier(ob, modifier_name):
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.modifier_apply(modifier=modifier_name)


def _finish(ob, name, mat, bevel, segments, tint):
    ob.name = name
    ob.data.name = name
    if mat is not None:
        ob.data.materials.append(mat)
    if bevel > 0.0:
        mod = ob.modifiers.new('Bevel', 'BEVEL')
        mod.width = bevel
        mod.segments = segments
        mod.limit_method = 'ANGLE'
        mod.angle_limit = math.radians(50.0)
        mod.use_clamp_overlap = True
        _apply_modifier(ob, mod.name)
    if tint:
        bake_ao(ob)
    return ob


# --- primitives ------------------------------------------------------------

def box(name, loc, size, mat, bevel=0.0, segments=2, rot=(0.0, 0.0, 0.0), tint=True):
    """Axis-aligned box, scaled through the mesh so no object scale is left."""
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0.0, 0.0, 0.0))
    ob = bpy.context.object
    ob.data.transform(Matrix.Diagonal((size[0], size[1], size[2], 1.0)))
    ob.location = loc
    ob.rotation_euler = rot
    return _finish(ob, name, mat, bevel, segments, tint)


def cylinder(name, loc, radius, depth, mat, verts=12, rot=(0.0, 0.0, 0.0), tint=True):
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=verts, radius=radius, depth=depth, end_fill_type='NGON',
        location=(0.0, 0.0, 0.0), rotation=(0.0, 0.0, 0.0))
    ob = bpy.context.object
    ob.location = loc
    ob.rotation_euler = rot
    return _finish(ob, name, mat, 0.0, 2, tint)


def cone(name, loc, radius1, radius2, depth, mat, verts=16, tint=True):
    bpy.ops.mesh.primitive_cone_add(
        vertices=verts, radius1=radius1, radius2=radius2, depth=depth,
        end_fill_type='NGON', location=(0.0, 0.0, 0.0))
    ob = bpy.context.object
    ob.location = loc
    return _finish(ob, name, mat, 0.0, 2, tint)


def torus(name, loc, major_radius, minor_radius, mat, rot=(0.0, 0.0, 0.0),
          major_segments=16, minor_segments=6, tint=True):
    bpy.ops.mesh.primitive_torus_add(
        major_radius=major_radius, minor_radius=minor_radius,
        major_segments=major_segments, minor_segments=minor_segments,
        location=(0.0, 0.0, 0.0), rotation=(0.0, 0.0, 0.0))
    ob = bpy.context.object
    ob.location = loc
    ob.rotation_euler = rot
    return _finish(ob, name, mat, 0.0, 2, tint)


def ico(name, loc, radius, mat, subdivisions=1, tint=True):
    bpy.ops.mesh.primitive_ico_sphere_add(
        subdivisions=subdivisions, radius=radius, location=(0.0, 0.0, 0.0))
    ob = bpy.context.object
    ob.location = loc
    return _finish(ob, name, mat, 0.0, 2, tint)


# --- materials -------------------------------------------------------------

def gouache(name, rgb, rough=0.86, emission=0.0):
    """Matte, high-roughness gouache surface for the night palette."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = (rgb[0], rgb[1], rgb[2], 1.0)
    bsdf.inputs['Roughness'].default_value = rough
    if 'Specular IOR Level' in bsdf.inputs:
        bsdf.inputs['Specular IOR Level'].default_value = 0.18
    if emission > 0.0:
        if 'Emission Color' in bsdf.inputs:
            bsdf.inputs['Emission Color'].default_value = (rgb[0], rgb[1], rgb[2], 1.0)
        if 'Emission Strength' in bsdf.inputs:
            bsdf.inputs['Emission Strength'].default_value = emission
    return m


def create_materials():
    return {
        'wall': gouache('Wall_Gouache', (0.52, 0.57, 0.69)),
        'wing': gouache('Wall_Warm', (0.63, 0.58, 0.55)),
        'frame': gouache('Frame_Dark', (0.18, 0.20, 0.29)),
        'glass': gouache('Window_Dark', (0.10, 0.13, 0.21), rough=0.35),
        'roof': gouache('Roof_Slate', (0.28, 0.30, 0.38)),
        'trim': gouache('Trim_Cream', (0.79, 0.76, 0.69)),
        'stone': gouache('Ground_Stone', (0.24, 0.26, 0.32)),
        'terracotta': gouache('Pot_Terracotta', (0.58, 0.33, 0.26)),
        'leaf': gouache('Leaf_Green', (0.25, 0.40, 0.30)),
        'metal': gouache('Metal_Indigo', (0.22, 0.24, 0.28), rough=0.6),
        'wood': gouache('Wood_Warm', (0.40, 0.29, 0.21)),
        'lamp': gouache('Lamp_Glow', (1.00, 0.79, 0.46), rough=0.4, emission=1.6),
        'spill': gouache('Lamp_Spill', (1.00, 0.82, 0.52), rough=0.6, emission=0.22),
        'door': gouache('Door_Glow', (1.00, 0.72, 0.38), rough=0.5, emission=1.1),
    }


# --- scene pieces ----------------------------------------------------------

def build_ground(mats):
    box('Diorama_Base', (0.0, -1.0, -0.3), (26.0, 16.0, 0.6), mats['stone'], bevel=0.05)


def build_shell(mats):
    box('Dorm_Body', (0.0, 0.0, BODY_H / 2.0), (BODY_W, BODY_D, BODY_H),
        mats['wall'], bevel=BEVEL_BODY, segments=BEVEL_SEGMENTS)
    box('Dorm_Plinth', (0.0, 0.0, 0.3), (BODY_W + 0.5, BODY_D + 0.5, 0.6),
        mats['trim'], bevel=0.03)

    wing_x = BODY_W / 2.0 + 0.8
    box('Dorm_Wing_L', (-wing_x, 0.5, 5.2), (1.7, 4.6, 10.4), mats['wing'], bevel=0.04)
    box('Dorm_Wing_R', (wing_x, 0.5, 5.2), (1.7, 4.6, 10.4), mats['wing'], bevel=0.04)
    box('Wing_Cap_L', (-wing_x, 0.5, 10.55), (2.0, 4.9, 0.3), mats['roof'], bevel=0.03)
    box('Wing_Cap_R', (wing_x, 0.5, 10.55), (2.0, 4.9, 0.3), mats['roof'], bevel=0.03)

    for r in range(1, ROWS):
        z = ROW_Z0 + (r - 0.5) * GAP_Y
        box('Floor_Band_%d' % r, (0.0, FRONT_Y - 0.02, z), (BODY_W + 0.24, 0.18, 0.2),
            mats['trim'], bevel=0.02)


def build_windows(mats):
    """The 4 x 6 grid: one pane per cell, named Window_Glass_<row>_<col>."""
    for r in range(ROWS):
        for c in range(COLS):
            x = (c - (COLS - 1) / 2.0) * GAP_X
            z = ROW_Z0 + r * GAP_Y
            box('Window_Frame_%d_%d' % (r, c), (x, FRONT_Y - 0.02, z),
                (WIN_W + 0.34, 0.2, WIN_H + 0.34), mats['frame'], bevel=0.02)
            # The pane sits proud of the frame so a camera ray always hits it first.
            box('Window_Glass_%d_%d' % (r, c), (x, FRONT_Y - 0.13, z),
                (WIN_W, 0.1, WIN_H), mats['glass'], bevel=0.015, tint=False)
            box('Sill_%d_%d' % (r, c), (x, FRONT_Y - 0.2, z - WIN_H / 2.0 - 0.24),
                (WIN_W + 0.62, 0.4, 0.16), mats['trim'], bevel=0.02)


def build_corridor(mats):
    walk_y = FRONT_Y - 1.4
    box('Corridor_Floor', (0.0, walk_y, 0.12), (BODY_W - 0.4, 2.8, 0.24),
        mats['stone'], bevel=0.03)
    box('Corridor_Canopy', (0.0, walk_y, 2.95), (BODY_W - 0.4, 2.8, 0.22),
        mats['trim'], bevel=0.03)
    box('Corridor_Parapet', (0.0, -5.72, 0.54), (BODY_W - 0.6, 0.16, 0.6),
        mats['trim'], bevel=0.02)

    for i in range(COLS):
        x = (i - (COLS - 1) / 2.0) * GAP_X
        cylinder('Corridor_Column_%d' % i, (x, -5.55, 1.54), 0.14, 2.6,
                 mats['trim'], verts=10)

    for i, x in enumerate((-5.4, 0.0, 5.4)):
        box('Porch_Light_%d' % i, (x, -5.2, 2.72), (0.34, 0.2, 0.12),
            mats['lamp'], bevel=0.02, tint=False)

    box('Entrance_Frame', (0.0, FRONT_Y - 0.04, 1.62), (2.3, 0.12, 3.0),
        mats['frame'], bevel=0.02)
    box('Entrance_Door', (0.0, FRONT_Y - 0.1, 1.59), (1.9, 0.14, 2.7),
        mats['door'], bevel=0.02, tint=False)


def build_roof(mats):
    box('Roof_Slab', (0.0, 0.0, ROOF_Z + 0.22), (BODY_W + 0.7, BODY_D + 0.7, 0.44),
        mats['roof'], bevel=BEVEL_ROOF, segments=BEVEL_SEGMENTS)
    box('Roof_Trim', (0.0, 0.0, ROOF_Z + 0.51), (BODY_W + 0.9, BODY_D + 0.9, 0.14),
        mats['trim'], bevel=0.02)

    rail_z = 16.33
    rail_y = 3.3
    rail_x = 9.0
    box('Roof_Rail_Front', (0.0, -rail_y, rail_z), (rail_x * 2.0, 0.09, 0.09),
        mats['trim'], bevel=0.015)
    box('Roof_Rail_Back', (0.0, rail_y, rail_z), (rail_x * 2.0, 0.09, 0.09),
        mats['trim'], bevel=0.015)
    box('Roof_Rail_Left', (-rail_x, 0.0, rail_z), (0.09, rail_y * 2.0, 0.09),
        mats['trim'], bevel=0.015)
    box('Roof_Rail_Right', (rail_x, 0.0, rail_z), (0.09, rail_y * 2.0, 0.09),
        mats['trim'], bevel=0.015)

    index = 0
    for x in (-rail_x, -4.5, 0.0, 4.5, rail_x):
        for y in (-rail_y, rail_y):
            box('Roof_Post_%d' % index, (x, y, 15.95), (0.09, 0.09, 0.78),
                mats['trim'], bevel=0.012)
            index += 1

    tower_x, tower_y = 4.4, 1.0
    for i, (dx, dy) in enumerate(((-0.8, -0.8), (0.8, -0.8), (-0.8, 0.8), (0.8, 0.8))):
        cylinder('Tower_Leg_%d' % i, (tower_x + dx, tower_y + dy, 16.39), 0.09, 1.62,
                 mats['metal'], verts=10)
    cylinder('Tower_Tank', (tower_x, tower_y, 17.95), 1.15, 1.6, mats['roof'], verts=16)
    cylinder('Tower_Band_Low', (tower_x, tower_y, 17.5), 1.2, 0.14, mats['metal'], verts=16)
    cylinder('Tower_Band_High', (tower_x, tower_y, 18.4), 1.2, 0.14, mats['metal'], verts=16)
    cone('Tower_Lid', (tower_x, tower_y, 18.95), 1.3, 0.16, 0.5, mats['roof'], verts=16)
    cylinder('Tower_Pipe', (tower_x + 0.7, tower_y, 16.4), 0.06, 1.7, mats['metal'], verts=8)


def build_street_lamp(mats):
    x, y = -11.2, -5.0
    cylinder('Lamp_Base', (x, y, 0.2), 0.26, 0.4, mats['metal'], verts=10)
    cylinder('Lamp_Pole', (x, y, 2.8), 0.09, 5.0, mats['metal'], verts=10)
    box('Lamp_Arm', (x + 0.45, y, 5.32), (1.0, 0.1, 0.1), mats['metal'], bevel=0.015)
    box('Lamp_Lantern', (x + 0.88, y, 5.08), (0.44, 0.44, 0.42), mats['lamp'],
        bevel=0.03, tint=False)
    cone('Lamp_Cap', (x + 0.88, y, 5.38), 0.34, 0.05, 0.24, mats['metal'], verts=10)
    cylinder('Lamp_Glow_Pool', (x + 0.9, y, 0.03), 1.5, 0.06, mats['spill'], verts=16, tint=False)


def build_bicycle(mats):
    x, y = -3.0, -6.4
    wheel_rot = (0.0, math.pi / 2.0, 0.0)
    torus('Bike_Wheel_Rear', (x - 0.52, y, 0.41), 0.36, 0.05, mats['metal'],
          rot=wheel_rot, major_segments=16, minor_segments=6)
    torus('Bike_Wheel_Front', (x + 0.52, y, 0.41), 0.36, 0.05, mats['metal'],
          rot=wheel_rot, major_segments=16, minor_segments=6)
    cylinder('Bike_Top_Tube', (x, y, 0.74), 0.035, 0.95, mats['metal'],
             verts=6, rot=(0.0, math.pi / 2.0, 0.0))
    cylinder('Bike_Down_Tube', (x + 0.02, y, 0.52), 0.035, 0.9, mats['metal'],
             verts=6, rot=(0.0, math.pi / 2.0 + 0.35, 0.0))
    cylinder('Bike_Seat_Post', (x - 0.34, y, 0.82), 0.03, 0.3, mats['metal'], verts=6)
    box('Bike_Saddle', (x - 0.34, y, 0.96), (0.26, 0.12, 0.06), mats['wood'], bevel=0.02)
    cylinder('Bike_Handlebar', (x + 0.5, y, 0.9), 0.028, 0.26, mats['metal'],
             verts=6, rot=(math.pi / 2.0, 0.0, 0.0))


def build_planters(mats, rng):
    spots = (-8.0, -5.4, -2.7, 2.7, 5.4, 8.0)
    for i, x in enumerate(spots):
        box('Planter_%d' % i, (x, -5.1, 0.56), (0.56, 0.5, 0.64),
            mats['terracotta'], bevel=0.03)
        for j in range(3):
            dx = rng.uniform(-0.14, 0.14)
            dy = rng.uniform(-0.12, 0.12)
            radius = rng.uniform(0.16, 0.23)
            ico('Planter_Leaf_%d_%d' % (i, j),
                (x + dx, -5.1 + dy, 0.88 + radius * 0.75), radius, mats['leaf'])


def build_scene(mats, rng):
    build_ground(mats)
    build_shell(mats)
    build_windows(mats)
    build_corridor(mats)
    build_roof(mats)
    build_street_lamp(mats)
    build_bicycle(mats)
    build_planters(mats, rng)


# --- export ----------------------------------------------------------------

def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def scene_stats():
    meshes = [ob for ob in bpy.context.scene.objects if ob.type == 'MESH']
    triangles = 0
    for ob in meshes:
        ob.data.calc_loop_triangles()
        triangles += len(ob.data.loop_triangles)
    return len(meshes), triangles


def glass_object_names():
    return sorted(ob.name for ob in bpy.context.scene.objects
                  if ob.type == 'MESH' and ob.name.startswith('Window_Glass_'))


def export_glb(path):
    """Write a GLB, creating the output directory when it is missing."""
    out_dir = os.path.dirname(os.path.abspath(path))
    os.makedirs(out_dir, exist_ok=True)
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
    # Keep only the keys this Blender build understands.
    known = bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
    kwargs = {k: v for k, v in wanted.items() if k == 'filepath' or k in known}
    bpy.ops.export_scene.gltf(**kwargs)


# --- entry point -----------------------------------------------------------

def build_arg_parser():
    parser = argparse.ArgumentParser(
        prog='build_campus_v3.py',
        description='Build dormitory #17 as a GLB diorama for Light A Window v3.')
    parser.add_argument('--out', default=DEFAULT_OUT,
                        help='GLB output path (default: public/models/dorm_v3.glb)')
    parser.add_argument('--seed', type=int, default=DEFAULT_SEED,
                        help='random seed for deterministic prop scatter')
    return parser


def parse_cli(argv):
    """Blender arguments live before '--'; plain python passes them directly."""
    args = list(argv)
    if '--' in args:
        args = args[args.index('--') + 1:]
    else:
        args = args[1:]
    parsed, _unknown = build_arg_parser().parse_known_args(args)
    return parsed


def main(argv=None):
    if bpy is None or Matrix is None:
        raise SystemExit(
            'build_campus_v3.py needs Blender: run '
            '"blender -b -P tools/blender/build_campus_v3.py -- --out public/models/dorm_v3.glb"')

    options = parse_cli(sys.argv if argv is None else argv)
    out_path = os.path.abspath(options.out)

    reset_scene()
    mats = create_materials()
    rng = random.Random(options.seed)
    build_scene(mats, rng)

    expected = {'Window_Glass_%d_%d' % (r, c) for r in range(ROWS) for c in range(COLS)}
    glasses = glass_object_names()
    missing = sorted(expected.difference(glasses))
    if missing:
        raise SystemExit('missing window glass meshes: %s' % ', '.join(missing))

    export_glb(out_path)

    mesh_count, triangles = scene_stats()
    size_kb = os.path.getsize(out_path) / 1024.0
    print('[build_campus_v3] %d meshes, %d triangles, %d window panes -> %s (%.1f KB)'
          % (mesh_count, triangles, len(glasses), out_path, size_kb))
    if triangles > 15000:
        print('[build_campus_v3] WARNING: triangle budget exceeded (limit ~15000)')


if __name__ == '__main__':
    main()

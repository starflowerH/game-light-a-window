"""Proof of concept: a stylised gouache dorm facade, built headlessly.

Tests the full Blender pipeline this project would use:
  model -> materials -> export GLB -> render preview PNG

Run:
  /tmp/bpyenv/bin/python tools/blender/proof_of_concept.py
"""
import os, math, bpy

OUT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', 'art'))
os.makedirs(OUT, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene


def gouache(name, rgb, rough=0.85):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = (*rgb, 1.0)
    bsdf.inputs['Roughness'].default_value = rough
    if 'Specular IOR Level' in bsdf.inputs:
        bsdf.inputs['Specular IOR Level'].default_value = 0.2
    return m


MAT_WALL  = gouache('Wall_Gouache', (0.62, 0.66, 0.78))
MAT_WALL2 = gouache('Wall_Warm',    (0.72, 0.68, 0.66))
MAT_FRAME = gouache('Frame_Dark',   (0.16, 0.19, 0.28))
MAT_GLASS = gouache('Window_Dark',  (0.09, 0.12, 0.20))
MAT_GLOW  = gouache('Window_Lit',   (1.00, 0.78, 0.42))
MAT_ROOF  = gouache('Roof',         (0.34, 0.36, 0.44))
MAT_TRIM  = gouache('Trim',         (0.86, 0.84, 0.78))


def box(name, loc, size, mat, bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    ob = bpy.context.object
    ob.name = name
    ob.scale = (size[0], size[1], size[2])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if mat:
        ob.data.materials.append(mat)
    if bevel > 0:
        mod = ob.modifiers.new('Bevel', 'BEVEL')
        mod.width = bevel
        mod.segments = 2
    return ob


COLS, ROWS = 6, 4
WIN_W, WIN_H = 2.0, 2.6
GAP_X, GAP_Y = 3.4, 3.6
ORIGIN_X, ORIGIN_Y = 4.0, 4.2

total_w = (COLS - 1) * GAP_X + WIN_W
total_h = (ROWS - 1) * GAP_Y + WIN_H

box('Dorm_Wall', (0, 0, total_h / 2 + 1.0), (total_w + 2.4, 1.2, total_h + 2.0), MAT_WALL, bevel=0.12)
box('Dorm_Wing_L', (-total_w / 2 - 1.6, 0, total_h * 0.36), (2.6, 1.0, total_h * 0.72), MAT_WALL2, bevel=0.1)
box('Dorm_Wing_R', (total_w / 2 + 1.6, 0, total_h * 0.36), (2.6, 1.0, total_h * 0.72), MAT_WALL2, bevel=0.1)
box('Dorm_Roof', (0, 0, total_h + 2.1), (total_w + 3.0, 1.6, 0.5), MAT_ROOF, bevel=0.08)
box('Water_Tank', (total_w * 0.32, 0, total_h + 3.3), (1.6, 1.4, 1.8), MAT_ROOF, bevel=0.1)
box('Tank_Legs', (total_w * 0.32, 0, total_h + 2.4), (1.2, 1.0, 0.5), MAT_ROOF)

windows = []
for r in range(ROWS):
    for c in range(COLS):
        x = ORIGIN_X + c * GAP_X - total_w / 2
        z = ORIGIN_Y + r * GAP_Y
        box(f'Window_Frame_{r}_{c}', (x, -0.66, z), (WIN_W + 0.34, 0.16, WIN_H + 0.34), MAT_FRAME, bevel=0.05)
        glass = box(f'Window_Glass_{r}_{c}', (x, -0.76, z), (WIN_W, 0.1, WIN_H), MAT_GLASS, bevel=0.03)
        windows.append(glass)
        box(f'Window_Sill_{r}_{c}', (x, -0.8, z - WIN_H / 2 - 0.22), (WIN_W + 0.6, 0.34, 0.14), MAT_TRIM, bevel=0.03)

box('Entrance_Door', (0, -0.7, 1.35), (1.9, 0.14, 2.7), MAT_GLOW, bevel=0.06)
box('Entrance_Canopy', (0, -1.15, 3.0), (3.0, 1.4, 0.28), MAT_TRIM, bevel=0.06)

# Lights must face the facade (front is -Y), so rotate X by 90deg.
bpy.ops.object.light_add(type='SUN', location=(-10, -18, 16), rotation=(math.radians(72), 0, math.radians(-28)))
bpy.context.object.data.energy = 3.0
bpy.context.object.data.angle = math.radians(14)
bpy.context.object.data.color = (1.0, 0.94, 0.86)

bpy.ops.object.light_add(type='AREA', location=(0, -16, 7), rotation=(math.radians(90), 0, 0))
bpy.context.object.data.energy = 4000
bpy.context.object.data.size = 16
bpy.context.object.data.color = (0.72, 0.82, 1.0)

bpy.ops.object.camera_add(location=(0, -38, 9.0), rotation=(math.radians(85), 0, 0))
cam = bpy.context.object
cam.data.lens = 35
scene.camera = cam

world = bpy.data.worlds.new('NightSky')
world.use_nodes = True
world.node_tree.nodes['Background'].inputs[0].default_value = (0.05, 0.08, 0.18, 1)
world.node_tree.nodes['Background'].inputs[1].default_value = 0.6
scene.world = world

scene.render.engine = 'BLENDER_EEVEE_NEXT'
scene.render.resolution_x = 1200
scene.render.resolution_y = 900
scene.view_settings.view_transform = 'Standard'

glb_path = os.path.join(OUT, 'dorm_facade.glb')
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=glb_path, export_format='GLB', export_apply=True, use_selection=False)
print('GLB:', glb_path, os.path.getsize(glb_path), 'bytes')

png_path = os.path.join(OUT, 'dorm_facade_preview.png')
scene.render.filepath = png_path
bpy.ops.render.render(write_still=True)
print('PNG:', png_path, os.path.getsize(png_path), 'bytes')

for o in scene.objects:
    if o.type == 'MESH':
        o.data.calc_loop_triangles()
tri = sum(len(o.data.loop_triangles) for o in scene.objects if o.type == 'MESH')
print('TRIS:', tri)

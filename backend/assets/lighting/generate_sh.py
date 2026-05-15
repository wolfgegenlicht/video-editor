"""Generate SH coefficient presets for PortraitRelighting.

The PortraitRelighting model uses 9 greyscale SH coefficients (L0..L2),
shape (9,) float32, matching the example_lightings.npy format in the repo
(shape (100, 9)).

SH basis order: 1, Y, Z, X, YX, YZ, 3Z^2-1, XZ, X^2-Y^2
Coefficient 0:  ambient (L0)
Coefficients 1-3: L1 directional (Y, Z, X axes)
Coefficients 4-8: L2 quadratic terms
"""
import numpy as np

# Front: even, flat lighting from camera direction (strong ambient, no directionality)
FRONT = np.array([
    0.8, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0,
], dtype=np.float32)

# Ring: elevated frontal light — classic vlogger look (ambient + upward Z component)
RING = np.array([
    0.9, 0.0, 0.3, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0,
], dtype=np.float32)

# Window: light from camera-left (viewer's right), natural look (L1 X component)
WINDOW = np.array([
    0.6, 0.5, 0.1, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0,
], dtype=np.float32)

# Side Key: strong directional from camera-right — cinematic (negative L1 X)
SIDE_KEY = np.array([
    0.5, -0.6, 0.1, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0,
], dtype=np.float32)

np.save("front.npy", FRONT)
np.save("ring.npy", RING)
np.save("window.npy", WINDOW)
np.save("side_key.npy", SIDE_KEY)
print("Saved: front.npy ring.npy window.npy side_key.npy")
print(f"  front shape: {FRONT.shape}")
print(f"  ring shape:  {RING.shape}")

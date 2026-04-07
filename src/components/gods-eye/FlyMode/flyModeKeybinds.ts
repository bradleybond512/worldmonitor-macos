export type FlySubMode = 1 | 2 | 3 | 4;

export const FLY_SUB_MODE_NAMES: Record<FlySubMode, string> = {
  1: 'FREE FLY',
  2: 'CINEMATIC',
  3: 'CHASE',
  4: 'CITY',
};

// Mouse look sensitivity (radians per pixel)
export const FLY_SENSITIVITY = 0.0025;

// Base movement speed = altitude * this scale (meters/sec)
export const FLY_SPEED_SCALE = 0.1;

// Minimum base speed so low-altitude flying isn't too slow
export const FLY_MIN_SPEED = 200;

export const FLY_BOOST_MULTIPLIER = 5;
export const FLY_BRAKE_MULTIPLIER = 0.1;

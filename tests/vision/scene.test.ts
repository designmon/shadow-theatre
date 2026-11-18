import { describe, expect, it } from 'vitest';
import { findBlobs } from '../../src/vision/blobs';
import { analyzeScene } from '../../src/vision/scene';
import { fillRect, mask } from '../helpers';

const W = 320, H = 240;
const scene = (m: ReturnType<typeof mask>) => analyzeScene(m, findBlobs(m));

describe('analyzeScene', () => {
  it('returns null with no shadow', () => {
    expect(scene(mask(W, H))).toBeNull();
  });

  it('arm from the left: open side is right', () => {
    const m = mask(W, H);
    fillRect(m, 0, 60, 50, 180, 1);   // body against the left edge
    fillRect(m, 50, 110, 150, 12, 1); // arm
    fillRect(m, 190, 95, 30, 30, 1);  // hand
    const s = scene(m)!;
    expect(s.entry).toBe('left');
    expect(s.openSide).toBe('right');
    expect(s.puppetBox.x).toBeGreaterThanOrEqual(110); // tip window = 30% of frame width (96px) back from the fingertips
    expect(s.puppetBox.x + s.puppetBox.w).toBe(220);
    expect(s.puppetBox.y).toBeLessThanOrEqual(95);
    expect(s.bodyBox!.x).toBe(0);
  });

  it('arm from the bottom: open side is up', () => {
    const m = mask(W, H);
    fillRect(m, 140, 150, 14, 90, 1); // forearm from bottom edge
    fillRect(m, 130, 120, 36, 30, 1); // hand
    const s = scene(m)!;
    expect(s.entry).toBe('down');
    expect(s.openSide).toBe('up');
    expect(s.puppetBox.y).toBe(120);
  });

  it('free-floating blob picks the emptiest side', () => {
    const m = fillRect(mask(W, H), 20, 100, 60, 40, 1);
    const s = scene(m)!;
    expect(s.entry).toBeNull();
    expect(s.openSide).toBe('right');
    expect(s.bodyBox).toBeNull();
    expect(s.puppetBox).toEqual({ x: 20, y: 100, w: 60, h: 40 });
  });
});

describe('analyzeScene with a lit-wall mask', () => {
  it('entry is measured against the lit wall edge, not the camera frame', () => {
    const lit = fillRect(mask(W, H), 30, 20, 260, 200, 1); // wall seen inside a dark border
    const m = mask(W, H);
    fillRect(m, 30, 60, 40, 160, 1);  // body against the wall's left edge
    fillRect(m, 70, 110, 120, 12, 1); // arm
    fillRect(m, 180, 95, 30, 30, 1);  // hand
    const s = analyzeScene(m, findBlobs(m), lit)!;
    expect(s.entry).toBe('left');
    expect(s.openSide).toBe('right');
    expect(s.puppetBox.x).toBeGreaterThanOrEqual(110);
    expect(s.bodyBox!.x).toBe(30);
  });
});

describe('analyzeScene: body standing on the bottom edge', () => {
  it('arm reaching right from a body that touches the bottom: open right, puppet is the hand', () => {
    const lit = fillRect(mask(W, H), 20, 20, 280, 200, 1);
    const m = mask(W, H);
    fillRect(m, 40, 90, 50, 130, 1);  // body, touches only the bottom of the lit wall
    fillRect(m, 90, 110, 120, 12, 1); // arm
    fillRect(m, 200, 95, 30, 30, 1);  // hand
    const s = analyzeScene(m, findBlobs(m), lit)!;
    expect(s.openSide).toBe('right');
    expect(s.puppetBox.x).toBeGreaterThanOrEqual(120);
    expect(s.puppetBox.x + s.puppetBox.w).toBe(230);
    expect(s.puppetBox.y).toBeLessThanOrEqual(95);
  });
});

import { isUsablePuppet } from '../../src/vision/scene';
describe('isUsablePuppet', () => {
  const lit = fillRect(mask(W, H), 20, 20, 280, 200, 1);
  const handScene = () => {
    const m = mask(W, H);
    fillRect(m, 20, 60, 40, 160, 1); fillRect(m, 60, 110, 120, 12, 1); fillRect(m, 170, 95, 30, 30, 1);
    return analyzeScene(m, findBlobs(m), lit)!;
  };

  it('accepts a hand at the end of an arm', () => {
    expect(isUsablePuppet(handScene(), mask(W, H), lit)).toBe(true);
  });

  it('rejects a puppet touching our own projected creature', () => {
    const ours = fillRect(mask(W, H), 201, 90, 40, 40, 1); // creature right next to the hand
    expect(isUsablePuppet(handScene(), ours, lit)).toBe(false);
  });

  it('rejects a puppet too big to be a hand', () => {
    const m = fillRect(mask(W, H), 20, 20, 200, 200, 1); // whole body filling the wall
    const s = analyzeScene(m, findBlobs(m), lit)!;
    expect(isUsablePuppet(s, mask(W, H), lit)).toBe(false);
  });
});

describe('review I2: standing still is not a puppet', () => {
  const lit = fillRect(mask(W, H), 20, 20, 280, 200, 1);
  it('rejects the top of a body that just stands there', () => {
    const m = fillRect(mask(W, H), 120, 90, 60, 130, 1); // body touching the bottom of the wall
    const s = analyzeScene(m, findBlobs(m), lit)!;
    expect(isUsablePuppet(s, mask(W, H), lit)).toBe(false);
  });
  it('rejects head and shoulders', () => {
    const m = mask(W, H);
    fillRect(m, 110, 120, 80, 100, 1); // torso
    fillRect(m, 135, 90, 30, 30, 1);   // head
    const s = analyzeScene(m, findBlobs(m), lit)!;
    expect(isUsablePuppet(s, mask(W, H), lit)).toBe(false);
  });
  it('accepts a forearm swan rising from the bottom', () => {
    const m = mask(W, H);
    fillRect(m, 150, 130, 14, 90, 1); // forearm from the bottom edge
    fillRect(m, 150, 112, 34, 20, 1); // hand bent as head + beak
    const s = analyzeScene(m, findBlobs(m), lit)!;
    expect(isUsablePuppet(s, mask(W, H), lit)).toBe(true);
  });
});

import { sceneLit } from '../../src/vision/scene';
describe('shadows cut by an ignored area (setup card, debug view)', () => {
  it('a hand whose arm disappears under the card still enters from that side', () => {
    const lit = fillRect(mask(W, H), 20, 20, 280, 200, 1);
    const ignored = fillRect(mask(W, H), 20, 20, 100, 200, 1); // card over the left of the wall
    const m = mask(W, H);
    fillRect(m, 120, 110, 70, 12, 1); // arm coming out from right at the edge of the card
    fillRect(m, 185, 95, 30, 30, 1);  // hand
    const s = analyzeScene(m, findBlobs(m), sceneLit(lit, ignored))!;
    expect(s.entry).toBe('left');
    expect(s.openSide).toBe('right');
  });
});

describe('wall smaller than the camera view (camera off to the side)', () => {
  it('the hand part is measured against the wall, not the whole camera frame', () => {
    const lit = fillRect(mask(W, H), 100, 80, 100, 80, 1); // the wall is a small part of the view
    const m = mask(W, H);
    fillRect(m, 100, 115, 60, 8, 1);  // arm from the wall's left edge
    fillRect(m, 160, 105, 20, 20, 1); // hand
    const s = analyzeScene(m, findBlobs(m), lit)!;
    expect(s.openSide).toBe('right');
    expect(s.puppetBox.x).toBeGreaterThanOrEqual(135); // the hand + a short piece of forearm, not the whole 60px arm
  });
});

describe('big shapes with tall ears (review of a real-room report)', () => {
  it('a big rabbit on an arm reaching right is a usable puppet reaching right', () => {
    const lit = fillRect(mask(W, H), 60, 40, 200, 150, 1);
    const ignored = mask(W, H);
    const m = mask(W, H);
    fillRect(m, 70, 70, 30, 120, 1);  // body, standing on the bottom edge of the picture
    fillRect(m, 100, 120, 70, 10, 1); // arm
    fillRect(m, 165, 105, 40, 34, 1); // big hand
    fillRect(m, 172, 45, 9, 60, 1);   // tall ears
    fillRect(m, 188, 48, 9, 57, 1);
    const s = analyzeScene(m, findBlobs(m), sceneLit(lit, ignored))!;
    expect(s.openSide).toBe('right');
    expect(isUsablePuppet(s, mask(W, H), lit)).toBe(true);
    expect(s.puppetBox.x).toBeGreaterThanOrEqual(110); // hand + ears + a bit of forearm, not the body (ends at x=100)
    expect(s.puppetBox.y).toBeLessThanOrEqual(48);     // ears included
  });
});

describe('pointing with one finger (laser drawing)', () => {
  const lit = fillRect(mask(W, H), 20, 20, 280, 200, 1);
  const armWithHand = () => {
    const m = mask(W, H);
    fillRect(m, 20, 110, 90, 14, 1);  // arm from the left edge
    fillRect(m, 105, 100, 28, 30, 1); // fist
    return m;
  };
  it('one long thin finger is pointing, with the tip at its end', () => {
    const m = armWithHand();
    fillRect(m, 133, 108, 34, 5, 1); // index finger
    const s = analyzeScene(m, findBlobs(m), lit)!;
    expect(s.pointing).toBe(true);
    expect(s.tip.x).toBeGreaterThanOrEqual(164);
    expect(s.tipDir.x).toBeGreaterThan(0.8);
  });
  it('two fingers (a rabbit) is not pointing', () => {
    const m = armWithHand();
    fillRect(m, 133, 102, 30, 5, 1);
    fillRect(m, 133, 118, 30, 5, 1);
    expect(analyzeScene(m, findBlobs(m), lit)!.pointing).toBe(false);
  });
  it('a wide snout (a dog) is not pointing', () => {
    const m = armWithHand();
    fillRect(m, 133, 104, 30, 18, 1);
    expect(analyzeScene(m, findBlobs(m), lit)!.pointing).toBe(false);
  });
});

describe('hand pose: point (draw), fist (finish), open (pen lifted)', () => {
  const lit = fillRect(mask(W, H), 20, 20, 280, 200, 1);
  const arm = () => fillRect(mask(W, H), 20, 110, 90, 14, 1);
  const pose = (m: ReturnType<typeof mask>) => analyzeScene(m, findBlobs(m), lit)!.pose;
  it('one finger out is point', () => {
    const m = arm(); fillRect(m, 105, 100, 28, 30, 1); fillRect(m, 133, 108, 34, 5, 1);
    expect(pose(m)).toBe('point');
  });
  it('a closed fist is fist', () => {
    const m = arm(); fillRect(m, 105, 98, 32, 34, 1);
    expect(pose(m)).toBe('fist');
  });
  it('two fingers out is open', () => {
    const m = arm(); fillRect(m, 105, 100, 28, 30, 1); fillRect(m, 133, 102, 30, 5, 1); fillRect(m, 133, 118, 30, 5, 1);
    expect(pose(m)).toBe('open');
  });
  it('a big shadow (hand near the projector) with only the hand in the light, from below: point', () => {
    // like the real wall: the arm is below the picture, the finger's shadow is fat
    const m = mask(W, H);
    fillRect(m, 120, 172, 44, 48, 1); // palm, cut off by the picture's bottom edge
    fillRect(m, 164, 182, 10, 14, 1); // thumb knuckle
    fillRect(m, 134, 112, 16, 60, 1); // a fat index finger pointing up
    const s = analyzeScene(m, findBlobs(m), lit)!;
    expect(s.pose).toBe('point');
    expect(s.tip.y).toBeLessThan(118);
  });
  it('a big fist from below is still a fist', () => {
    const m = mask(W, H);
    fillRect(m, 118, 160, 50, 60, 1);
    expect(pose(m)).toBe('fist');
  });
  it('a flat hand, fingers together and stretched out, is open', () => {
    const m = arm(); fillRect(m, 105, 104, 60, 18, 1);
    expect(pose(m)).toBe('open');
  });
});

describe('fingertip by shape (the pen stays on the finger)', () => {
  const lit = fillRect(mask(W, H), 20, 20, 280, 200, 1);
  const armAndPalm = () => {
    const m = mask(W, H);
    fillRect(m, 20, 112, 90, 14, 1); // forearm from the left edge
    fillRect(m, 105, 96, 44, 40, 1); // a big palm
    return m;
  };
  it('a finger pointing back toward the arm: the pen is its tip, not the far side of the palm', () => {
    const m = armAndPalm();
    fillRect(m, 76, 90, 30, 8, 1); // index finger pointing back left, above the forearm
    const s = analyzeScene(m, findBlobs(m), lit)!;
    expect(s.pose).toBe('point');
    expect(s.tip.x).toBeLessThan(84);
    expect(s.tip.y).toBeGreaterThan(88);
    expect(s.tip.y).toBeLessThan(100);
  });
  it('pointing with the thumb out: still the index fingertip', () => {
    const m = armAndPalm();
    fillRect(m, 149, 104, 42, 9, 1); // index finger
    fillRect(m, 128, 136, 9, 13, 1); // thumb, shorter
    const s = analyzeScene(m, findBlobs(m), lit)!;
    expect(s.pose).toBe('point');
    expect(s.tip.x).toBeGreaterThan(184);
  });
  it('an open hand, fingers spread: open (pen lifted)', () => {
    const m = armAndPalm();
    for (const y of [92, 104, 116, 128]) fillRect(m, 149, y, 36, 7, 1);
    expect(analyzeScene(m, findBlobs(m), lit)!.pose).toBe('open');
  });
  it('stays on the finger it was on when another appears', () => {
    const m = armAndPalm();
    fillRect(m, 149, 100, 40, 8, 1); // index
    fillRect(m, 149, 124, 38, 8, 1); // a second finger, nearly as long
    const first = analyzeScene(m, findBlobs(m), lit)!;
    expect(first.pose).toBe('open');
    const kept = analyzeScene(m, findBlobs(m), lit, { x: 186, y: 128 })!;
    expect(kept.tip.y).toBeGreaterThan(120); // near the previous tip
  });
});

describe('a hand touching another edge of the picture', () => {
  const lit = fillRect(mask(W, H), 20, 20, 280, 200, 1);
  it('the arm (the biggest contact) is where it comes in; a fist touching the top edge is still the hand', () => {
    const m = mask(W, H);
    fillRect(m, 20, 150, 150, 16, 1); // forearm from the left edge
    fillRect(m, 160, 40, 16, 120, 1); // up toward the top
    const memory = {};
    analyzeScene(m, findBlobs(m), lit, null, memory); // the arm reaches in first
    fillRect(m, 150, 20, 36, 30, 1); // then a fist touches the top edge (a wider contact than the arm's)
    const s = analyzeScene(m, findBlobs(m), lit, null, memory)!;
    expect(s.tip.y).toBeLessThan(60);
    expect(s.tip.x).toBeGreaterThan(140);
  });
});

describe('a thin arm between the body and the fist', () => {
  const lit = fillRect(mask(W, H), 20, 20, 280, 200, 1);
  it('is not a finger: a fist stays a fist', () => {
    const m = mask(W, H);
    fillRect(m, 20, 120, 60, 100, 1); // body at the left edge
    fillRect(m, 80, 150, 120, 9, 1); // a thin arm
    fillRect(m, 200, 136, 36, 36, 1); // a fist
    expect(analyzeScene(m, findBlobs(m), lit)!.pose).toBe('fist');
  });
});

import * as THREE from 'three';
import { POINTER_TRAIL_SIZE } from '../particles/ParticleInteraction.js';

// One damped pointer and one short wake drive every depth layer. Coordinates
// use NDC so the interaction remains aligned with the mouse during camera flight.
export class PointerField {
  constructor() {
    this.pointer = new THREE.Vector2(10, 10);
    this.velocity = new THREE.Vector2();
    this.energy = 0;
    this.trail = Array.from({ length: POINTER_TRAIL_SIZE }, () => new THREE.Vector4(10, 10, 10, 0));
    // A left click makes one distinct expanding ring, even when the pointer is still.
    this.clickRipple = new THREE.Vector4(10, 10, 10, 0);
    this.target = new THREE.Vector2(10, 10);
    this.inputVelocity = new THREE.Vector2();
    this.lastTrail = new THREE.Vector2(10, 10);
    this.inside = false;
    this.hasInput = false;
    this.lastInputTime = -10;
    this.lastTrailTime = -10;
    this.lastFrameTime = null;
    this.trailIndex = 0;
  }

  move(x, y, time) {
    if (![x, y, time].every(Number.isFinite)) return;
    const nextX = THREE.MathUtils.clamp(x, -1, 1);
    const nextY = THREE.MathUtils.clamp(y, -1, 1);
    const dt = Math.max(1 / 120, Math.min(0.12, time - this.lastInputTime));
    if (!this.hasInput || !this.inside) {
      this.pointer.set(nextX, nextY);
      this.target.copy(this.pointer);
      this.inputVelocity.set(0, 0);
      this.hasInput = true;
    } else {
      this.inputVelocity.set((nextX - this.target.x) / dt, (nextY - this.target.y) / dt);
      this.inputVelocity.clampLength(0, 5);
      this.target.set(nextX, nextY);
    }
    this.inside = true;
    this.lastInputTime = time;
    const distance = this.target.distanceTo(this.lastTrail);
    if (time - this.lastTrailTime >= 0.065 && distance > 0.018) {
      const strength = Math.min(1, 0.25 + this.inputVelocity.length() * 0.20);
      this.trail[this.trailIndex].set(nextX, nextY, 0, strength);
      this.trailIndex = (this.trailIndex + 1) % POINTER_TRAIL_SIZE;
      this.lastTrail.copy(this.target);
      this.lastTrailTime = time;
    }
  }

  click(x, y, time) {
    if (![x, y, time].every(Number.isFinite)) return;
    this.move(x, y, time);
    this.clickRipple.set(this.target.x, this.target.y, 0, 1);
  }

  leave() {
    this.inside = false;
    this.inputVelocity.set(0, 0);
  }

  update(time, enabled = true) {
    const dt = this.lastFrameTime === null ? 1 / 60 :
      THREE.MathUtils.clamp(time - this.lastFrameTime, 0, 0.12);
    this.lastFrameTime = time;
    if (!enabled) {
      this.energy = 0;
      this.velocity.set(0, 0);
      this.clickRipple.set(10, 10, 10, 0);
      for (const sample of this.trail) sample.set(10, 10, 10, 0);
      return this;
    }
    const follow = 1 - Math.exp(-7.5 * dt);
    this.pointer.lerp(this.target, follow);
    const recency = Math.exp(-Math.max(0, time - this.lastInputTime - 0.025) * 9);
    const velocityFollow = 1 - Math.exp(-10 * dt);
    this.velocity.x += (this.inputVelocity.x * recency - this.velocity.x) * velocityFollow;
    this.velocity.y += (this.inputVelocity.y * recency - this.velocity.y) * velocityFollow;
    const targetEnergy = this.inside ? Math.min(1, 0.42 + this.velocity.length() * 0.22) : 0;
    this.energy += (targetEnergy - this.energy) * (1 - Math.exp(-(this.inside ? 9 : 2.8) * dt));
    for (const sample of this.trail) {
      sample.z += dt;
      if (sample.z > 1.8) sample.w = 0;
    }
    this.clickRipple.z += dt;
    if (this.clickRipple.z > 1.65) this.clickRipple.w = 0;
    return this;
  }
}

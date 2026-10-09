import * as THREE from 'three';

export const POINTER_TRAIL_SIZE = 8;

export function createInteractionUniforms() {
  return {
    uPointer: { value: new THREE.Vector4(10, 10, 0, 0) },
    uPointerEnergy: { value: 0 },
    uClickRipple: { value: new THREE.Vector4(10, 10, 10, 0) },
    uAspect: { value: 1 },
    uPointerTrail: { value: Array.from({ length: POINTER_TRAIL_SIZE }, () => new THREE.Vector4(10, 10, 10, 0)) }
  };
}

export function updateInteractionUniforms(uniforms, interaction, camera) {
  uniforms.uAspect.value = camera?.aspect || 1;
  uniforms.uPointerEnergy.value = interaction?.energy || 0;
  if (interaction) {
    uniforms.uPointer.value.set(interaction.pointer.x, interaction.pointer.y,
      interaction.velocity.x, interaction.velocity.y);
    uniforms.uClickRipple.value.copy(interaction.clickRipple);
    for (let i = 0; i < POINTER_TRAIL_SIZE; i++) {
      uniforms.uPointerTrail.value[i].copy(interaction.trail[i]);
    }
  } else {
    uniforms.uPointer.value.set(10, 10, 0, 0);
    uniforms.uClickRipple.value.set(10, 10, 10, 0);
    for (const sample of uniforms.uPointerTrail.value) sample.set(10, 10, 10, 0);
  }
}

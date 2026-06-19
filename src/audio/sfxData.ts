export type SfxKey =
  | "sfx_queen_hit"
  | "sfx_enemy_death"
  | "sfx_defense_fire"
  | "sfx_phase_wave"
  | "sfx_phase_recovery"
  | "sfx_breach"
  | "sfx_adaptation_unlock"
  | "sfx_contaminate";

export const SFX_DATA: Record<SfxKey, string> = {
  sfx_queen_hit: toneDataUri(150, 0.16, 0.22),
  sfx_enemy_death: toneDataUri(260, 0.12, 0.18),
  sfx_defense_fire: toneDataUri(620, 0.08, 0.12),
  sfx_phase_wave: toneDataUri(220, 0.22, 0.2),
  sfx_phase_recovery: toneDataUri(420, 0.2, 0.16),
  sfx_breach: toneDataUri(90, 0.45, 0.28),
  sfx_adaptation_unlock: toneDataUri(760, 0.28, 0.18),
  sfx_contaminate: toneDataUri(130, 0.22, 0.2),
};

function toneDataUri(frequency: number, durationSeconds: number, volume: number): string {
  const sampleRate = 22050;
  const sampleCount = Math.floor(sampleRate * durationSeconds);
  const dataBytes = sampleCount * 2;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);

  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, "data");
  view.setUint32(40, dataBytes, true);

  for (let index = 0; index < sampleCount; index += 1) {
    const t = index / sampleRate;
    const envelope = Math.max(0, 1 - index / sampleCount);
    const wave = Math.sin(2 * Math.PI * frequency * t) * envelope * volume;
    view.setInt16(44 + index * 2, wave * 32767, true);
  }

  return `data:audio/wav;base64,${arrayBufferToBase64(buffer)}`;
}

function writeString(view: DataView, offset: number, value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

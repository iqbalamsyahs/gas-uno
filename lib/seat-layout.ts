export type SeatPos = { x: number; y: number };

const ARC_SAMPLES = 400;

// Busur setengah elips di atas meja: kursi 0..n-1 dari kiri ke kanan mengikuti urutan giliran.
// Desktop (>=720px, breakpoint sama dengan Table.module.css) pakai busur lebih lebar.
//
// Titik dibagi rata menurut PANJANG BUSUR, bukan sudut: elips ini jauh lebih lebar (radiusX) daripada
// tinggi (radiusY), jadi pembagian sudut yang rata membuat kursi di puncak busur (sudut dekat 90°)
// mengumpul jauh lebih rapat secara visual daripada kursi di tepi. Panjang busur dihitung numerik
// (elips tidak punya rumus panjang busur tertutup) lewat sampel rapat, lalu diinterpolasi.
export function seatLayout(n: number, width: number, height: number): SeatPos[] {
  if (n <= 0) return [];
  const wide = width >= 720;
  const spreadDeg = wide ? 174 : 164;
  const startDeg = 90 + spreadDeg / 2;
  const radiusX = (width / 2) * (wide ? 0.46 : 0.49);
  const radiusY = height * (wide ? 0.9 : 0.88);
  const cx = width / 2;

  const pointAt = (deg: number): SeatPos => {
    const rad = (deg * Math.PI) / 180;
    return { x: cx + Math.cos(rad) * radiusX, y: height - Math.sin(rad) * radiusY };
  };

  if (n === 1) return [pointAt(90)];

  const samples: { deg: number; len: number }[] = [{ deg: startDeg, len: 0 }];
  let prev = pointAt(startDeg);
  for (let i = 1; i <= ARC_SAMPLES; i++) {
    const deg = startDeg - (spreadDeg * i) / ARC_SAMPLES;
    const p = pointAt(deg);
    samples.push({ deg, len: samples[i - 1].len + Math.hypot(p.x - prev.x, p.y - prev.y) });
    prev = p;
  }
  const totalLen = samples[samples.length - 1].len;

  return Array.from({ length: n }, (_, i) => {
    const target = (totalLen * i) / (n - 1);
    let lo = 0;
    let hi = samples.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (samples[mid].len < target) lo = mid;
      else hi = mid;
    }
    const a = samples[lo];
    const b = samples[hi];
    const t = b.len === a.len ? 0 : (target - a.len) / (b.len - a.len);
    return pointAt(a.deg + (b.deg - a.deg) * t);
  });
}

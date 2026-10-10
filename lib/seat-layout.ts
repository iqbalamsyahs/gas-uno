export type SeatPos = { x: number; y: number };

// Busur setengah elips di atas meja: kursi 0..n-1 dari kiri ke kanan mengikuti urutan giliran.
// Desktop (>=720px, breakpoint sama dengan Table.module.css) pakai busur lebih lebar.
export function seatLayout(n: number, width: number, height: number): SeatPos[] {
  if (n <= 0) return [];
  const wide = width >= 720;
  const spreadDeg = wide ? 174 : 164;
  const startDeg = 90 + spreadDeg / 2;
  const radiusX = (width / 2) * (wide ? 0.46 : 0.49);
  const radiusY = height * (wide ? 0.9 : 0.88);
  const cx = width / 2;
  return Array.from({ length: n }, (_, i) => {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const rad = ((startDeg - t * spreadDeg) * Math.PI) / 180;
    return { x: cx + Math.cos(rad) * radiusX, y: height - Math.sin(rad) * radiusY };
  });
}

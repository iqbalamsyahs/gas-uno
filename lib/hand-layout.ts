// step = jarak antar tepi kiri kartu. Kurang dari lebar kartu berarti bertumpuk.
// ponytail: maksimal 2 baris; di atas ~28 kartu pada 360 px jarak bisa turun di bawah 24 px. Tambah baris ketiga kalau itu terjadi di game nyata.
export function handLayout(count: number, width: number, cardW: number, gap = 6, minStep = 24) {
  const stepFor = (n: number) => (n <= 1 ? cardW + gap : Math.min(cardW + gap, (width - cardW) / (n - 1)));
  let rows: 1 | 2 = 1;
  let perRow = count;
  if (count > 14 || stepFor(count) < minStep) {
    rows = 2;
    perRow = Math.ceil(count / 2);
  }
  return { rows, perRow, step: stepFor(perRow) };
}

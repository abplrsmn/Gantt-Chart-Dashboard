# Gantt Chart Dashboard

Dashboard sederhana untuk memantau jadwal, progres, dan pekerjaan tim dalam satu tempat. Aplikasi ini membantu melihat proyek mana yang berjalan, yang mendekati tenggat waktu, dan bagian mana yang perlu ditindaklanjuti.

## Yang bisa dilakukan

- Melihat semua proyek dalam tampilan Gantt Chart interaktif.
- Membuat, mengubah, dan menghapus proyek.
- Mengatur tahap pekerjaan, tanggal mulai, tenggat, prioritas, dan progres.
- Memantau progres rencana vs realisasi dengan S-Curve.
- Menampilkan ringkasan proyek dalam tabel dan dashboard performa.
- Mencatat riwayat perubahan proyek.
- Mengatur data pendukung seperti unit, prioritas, status, anggota tim, dan tahap proyek.
- Berbagi dokumen proyek dan menggunakan chat internal.
- Membuat pengingat serta menggunakan asisten AI untuk pertanyaan seputar data dashboard.

## Cocok untuk siapa?

Gantt Chart Dashboard cocok untuk tim yang mengelola beberapa pekerjaan atau proyek sekaligus dan membutuhkan gambaran jadwal yang jelas. Misalnya tim operasional, desain, konstruksi, IT, event, atau internal project management.

## Cara kerja singkat

1. Buat proyek baru dan isi informasi dasar, seperti nama, unit, prioritas, serta tanggal.
2. Pilih tahap pekerjaan yang sedang berjalan.
3. Perbarui progres, catatan, penanggung jawab, atau jadwal saat ada perubahan.
4. Pantau seluruh pekerjaan dari halaman Dashboard, Gantt Chart, dan S-Curve.
5. Gunakan riwayat perubahan untuk mengetahui apa yang berubah dan siapa yang memperbaruinya.

## Fitur utama

### Gantt Chart

Menampilkan jadwal proyek dalam bentuk garis waktu. Kamu bisa melihat tanggal mulai, tanggal selesai, tahap aktif, risiko keterlambatan, dan prioritas proyek. Jadwal tahap dapat diperbarui langsung dari dashboard.

### Tahap proyek

Setiap proyek dapat memiliki beberapa tahap kerja. Secara default aplikasi menyediakan alur berikut:

`Operational Brief → Design → Project Control → Project Management → Handover`

Tahap tambahan juga dapat dikelola dari halaman Master Setup.

### S-Curve

S-Curve membantu membandingkan progres rencana dengan progres aktual dari minggu ke minggu. Data dapat diisi manual atau diimpor dari file Excel dengan format jadwal yang didukung.

### Dashboard dan laporan

Halaman Dashboard, Performance, Alerts, Weekly Report, dan Summary Matrix membantu tim membaca kondisi proyek tanpa harus membuka satu per satu.

### Team dan chat

Kelola anggota yang terlibat pada proyek, lihat tugas per tim, dan gunakan chat internal untuk berdiskusi. File pendukung juga dapat dilampirkan pada proyek atau percakapan.

### Riwayat perubahan

Perubahan penting pada proyek dicatat agar tim dapat menelusuri pembaruan data dengan lebih mudah.

## Halaman yang tersedia

| Halaman | Kegunaan |
| --- | --- |
| Dashboard | Ringkasan proyek, progres, dan informasi penting. |
| Projects | Daftar seluruh proyek. |
| Gantt Chart | Tampilan jadwal proyek dalam timeline. |
| Summary Matrix | Ringkasan data proyek dalam tabel. |
| Project Detail | Detail proyek, tahap, progres, anggota, file, dan riwayat. |
| Performance | Analisis KPI dan performa proyek. |
| Alerts | Proyek yang perlu perhatian. |
| Team | Pembagian pekerjaan berdasarkan tim. |
| Weekly Report | Laporan progres mingguan. |
| Chat | Percakapan internal dan asisten AI. |
| Master Setup | Pengaturan unit, prioritas, status, tahap, dan pengguna. |

## Teknologi yang digunakan

- Next.js dan React untuk aplikasi web.
- TypeScript untuk kode yang lebih aman dan mudah dirawat.
- PostgreSQL untuk penyimpanan data.
- Tailwind CSS untuk tampilan antarmuka.
- Recharts dan Chart.js untuk grafik.
- Google Calendar, Google Chat webhook, dan Gemini API sebagai integrasi opsional.

## Menjalankan aplikasi di komputer sendiri

### Yang dibutuhkan

- Node.js 20 atau lebih baru.
- PostgreSQL 14 atau lebih baru.

### Instalasi

```bash
npm install
```

Buat file `.env` untuk konfigurasi database dan layanan opsional. Jangan pernah mengunggah file `.env` ke GitHub.

Contoh variabel utama:

```env
PGHOST=localhost
PGPORT=5432
PGUSER=postgres
PGPASSWORD=your_password
PGDATABASE=gantt_dashboard
AUTH_SECRET=replace_with_a_long_random_value
```

Jalankan skrip database yang diperlukan dari folder `scripts/` sesuai kebutuhan proyek, lalu mulai aplikasi:

```bash
npm run dev
```

Buka `http://localhost:3000` di browser.

## Perintah penting

```bash
npm run dev          # Menjalankan aplikasi untuk development
npm run build        # Membuat versi production
npm run start        # Menjalankan versi production
npm run lint         # Memeriksa gaya dan masalah kode
npx tsc --noEmit     # Memeriksa tipe TypeScript
```

## Catatan keamanan

- Simpan semua password, token, dan API key hanya di file `.env` atau secret manager.
- Jangan mengunggah file `.env`, data sensitif, atau file pengguna ke repository publik.
- Gunakan akun dan kata sandi yang aman untuk akses dashboard.
- Sebelum dipakai secara publik, lakukan pengujian keamanan dan batasi akses file proyek sesuai kebutuhan organisasi.

## Struktur folder singkat

```text
src/
  app/                 Halaman dan API aplikasi
  components/          Komponen antarmuka
  lib/                 Logika database, autentikasi, dan fitur inti
scripts/               Skrip database dan migrasi
public/                File statis
docs/                  Dokumentasi tambahan
```

---

Dibuat untuk membantu tim melihat pekerjaan dengan lebih jelas, terarah, dan mudah dipantau.

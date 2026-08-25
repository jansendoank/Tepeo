# VALORA OTP — Node.js & TypeScript Edition

Stress Testing & Security Console untuk endpoint Authentication OTP WhatsApp, di-porting sepenuhnya ke ekosistem modern **Node.js (v18 / v20 / v22)** dan **TypeScript** dengan dashboard antarmuka web interaktif dan real-time Server-Sent Events (SSE).

---

## ⚡ Fitur Utama

- **100% Node.js Native**: Tidak memerlukan runtime Python, lebih cepat, hemat resource, dan mudah di-host di mana saja (Pterodactyl, VPS, Cloud Run, Heroku, Render, dll).
- **Auto-Detection Port**: Otomatis membaca port alokasi hosting dari environment `PORT` (`process.env.PORT || 3000`).
- **Live Stream SSE (Server-Sent Events)**: Log terminal di web browser terupdate otomatis secara real-time.
- **3 Mode Eksekusi**: *Single Run*, *Continuous Loop* (dengan interval delay custom), dan *Custom Platform Pick*.
- **Live System Metrics**: Menampilkan IP Publik server, load RAM, OS, dan CPU Cores.

---

## 🚀 Cara Menjalankan di Pterodactyl (Egg Node.js)

1. Buat server baru di panel Pterodactyl dengan **Egg NodeJS** (Node 18, 20, atau 22).
2. Upload semua file project ini ke menu **File Manager** (atau gunakan `git clone` ke repo ini).
3. Di menu **Startup**, atur **Startup Command**:
   ```bash
   npm install && npm start
   ```
4. Di bagian **Variables**, atur:
   - `MAIN_FILE`: `server.ts`
5. Buka tab **Console**, klik **Start**.
6. Akses melalui browser:
   ```text
   http://IP_SERVER_PTERODACTYL:PORT_ALOKASI
   ```

---

## 💻 Cara Menjalankan di Komputer / VPS Lokal

```bash
# 1. Install dependencies
npm install

# 2. Jalankan server
npm start
```

Buka browser di `http://localhost:3000`.

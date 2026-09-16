# BiyoAI Çalıştırma Kılavuzu

## İlk Kurulum

Okul PC'sinde `/opt/biyoai` altına proje kopyalandıktan sonra, tek seferlik olarak:

1. Ortam dosyasını oluştur:
   ```
   cd /opt/biyoai && cp .env.example .env
   ```
2. `.env` dosyasını aç ve `GROQ_API_KEY` satırına Groq API anahtarını yapıştır.
3. Güçlü bir oturum anahtarı üret ve `.env` dosyasındaki `SESSION_SECRET` satırına yapıştır (bu adım zorunlu, boş bırakılırsa uygulama başlamaz):
   ```
   openssl rand -hex 32
   ```
4. Servisleri başlat:
   ```
   docker compose up -d
   ```
5. Öğretmen şifresini ilk kez belirle (yeni şifreyi kendin seçersin):
   ```
   docker compose exec app npm run seed:teacher -- <ilk-sifre>
   ```
6. `http://biyoai.local:3000/tahta` ve `/ogretmen` adreslerinin açıldığını doğrula.

## Sistem çalışmıyor / tahta soruları cevaplamıyor

1. Okul PC'sinin açık ve internete bağlı olduğundan emin ol.
2. Tarayıcıda `http://biyoai.local:3000/tahta` adresini yeniden yükle.
3. Hâlâ çalışmıyorsa: `/ogretmen` paneline gir, "Sistemi Yeniden Başlat" butonuna bas, 1 dakika bekle.
4. O da işe yaramazsa okulun teknik personelini ara: PC'de bir terminal açıp şunu çalıştırmalı:
   ```
   cd /opt/biyoai && docker compose up -d
   ```

## Şifremi unuttum

Teknik personel PC'de şunu çalıştırmalı (yeni şifreyi kendisi belirler). Sistem tamamen Docker üzerinden çalıştığı için host makinede ayrıca Node kurulu olması gerekmez, komut doğrudan çalışan `app` container'ı içinde çalıştırılır:
```
cd /opt/biyoai && docker compose exec app npm run seed:teacher -- <yeni-sifre>
```

## Yedekten geri yükleme

Yedekler `/opt/biyoai/backups/` klasöründe günlük olarak tutulur (son 30 gün).
```
cd /opt/biyoai
docker compose exec -T db psql -U biyoai biyoai < backups/biyoai-<TARIH>.sql
```

## Yaz tatili

Sistem yaz boyunca kapalı kalabilir, sorun değil. Eylül'de PC açıldığında `biyoai.service` otomatik başlar (systemd `enable` edildiği için). Değişmeyen hiçbir ayar kaybolmaz, veriler diskte kalır.

## API anahtarını yenileme

Groq API anahtarı değişirse, teknik personel `/opt/biyoai/.env` dosyasındaki `GROQ_API_KEY` satırını güncelleyip şunu çalıştırmalı:
```
cd /opt/biyoai && docker compose up -d --force-recreate app
```

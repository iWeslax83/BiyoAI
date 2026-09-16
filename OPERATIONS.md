# BiyoAI Çalıştırma Kılavuzu

## Sistem çalışmıyor / tahta soruları cevaplamıyor

1. Okul PC'sinin açık ve internete bağlı olduğundan emin ol.
2. Tarayıcıda `http://biyoai.local:3000/tahta` adresini yeniden yükle.
3. Hâlâ çalışmıyorsa: `/ogretmen` paneline gir, "Sistemi Yeniden Başlat" butonuna bas, 1 dakika bekle.
4. O da işe yaramazsa okulun teknik personelini ara: PC'de bir terminal açıp şunu çalıştırmalı:
   ```
   cd /opt/biyoai && docker compose up -d
   ```

## Şifremi unuttum

Teknik personel PC'de şunu çalıştırmalı (yeni şifreyi kendisi belirler):
```
cd /opt/biyoai && npm run seed:teacher -- <yeni-sifre>
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

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

## Güncelleme sonrası (mevcut kurulum)

Yeni sürümü kopyaladıktan sonra, teknik personel:

```
cd /opt/biyoai
docker compose exec -T db psql -U biyoai biyoai < lib/schema.sql
docker compose up -d --build
```

İlk komut veritabanı şemasını günceller (tekrar çalıştırmak zararsızdır). İkincisi imajı yeniden kurar. Mevcut kaynaklar ve geri bildirimler korunur.

## Kaynak "işlenmeyi bekliyor" görünüyor

İnternet yokken eklenen kaynaklar bu durumda kalır ve bağlantı gelince otomatik işlenir (birkaç dakika sürebilir). Panel sayfası açıkken liste kendiliğinden yenilenir. Uzun süre değişmiyorsa Groq API anahtarının doğru olduğunu kontrol et.

## Embedding servisi (yerel çalıştırma)

Kaynakların aranabilir hâle gelmesi için metinler vektöre çevrilir (embedding). Varsayılan olarak Groq kullanılır, ama Groq hesabında embedding modeli yoksa kaynaklar "işlenmeyi bekliyor" durumunda kalır ve panelde ayar hatası görünür. Bu durumda okul PC'sinde yerel servis çalıştırılabilir:

```
cd /opt/biyoai
docker compose --profile local-embeddings up -d
docker compose --profile local-embeddings exec ollama ollama pull nomic-embed-text
```

Ardından `.env` dosyasına şunları ekle ve uygulamayı yeniden başlat:

```
EMBED_BASE_URL=http://ollama:11434/v1
EMBED_MODEL=nomic-embed-text
```

```
docker compose up -d --force-recreate app
```

Model 768 boyutlu vektör üretmelidir (veritabanı sütunu buna göre). Embedding sağlayıcısı değiştirilirse eski kaynakların vektörleri yeni modelle uyumsuz olur: tüm kaynaklar silinip yeniden eklenmeli (ya da panelden metni düzenleyip kaydederek yeniden işlenmeli).


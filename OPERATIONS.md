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

## Embedding servisi (yerel)

Kaynakların aranabilir olması için metinler vektöre çevrilir (embedding). Groq hesaplarında embedding modeli olmadığı için bu iş okul PC'sinde, `embeddings` servisinde çalışır (Hugging Face Text Embeddings Inference, model `intfloat/multilingual-e5-base`: Türkçe bilir, 768 boyutlu). Ayrı kurulum gerekmez: `docker compose up -d` servisi başlatır ve model ilk açılışta Hugging Face'ten bir kez indirilir (yaklaşık 1 GB, birkaç dakika). İndirme bitene kadar kaynaklar "işlenmeyi bekliyor" görünür ve model hazır olunca otomatik işlenir.

Hazır olup olmadığını kontrol etmek için:

```
docker compose logs embeddings | tail -3      # "Ready" satırını ara
curl -s localhost:8080/health                 # 200 dönmeli
```

Notlar:
- Okul ağı HTTPS'i denetliyorsa model indirme `certs/extra-ca.pem` olmadan başarısız olur, bkz. "TLS sertifika hatası".
- Bazı ağlar model dağıtım sitelerini engeller (örneğin MEB ağında Ollama'nın model deposu `cloudflarestorage.com` engelli, Hugging Face açık). Bu yüzden Hugging Face tabanlı bir servis seçildi. İndirme "engellendi" hatasıyla başarısız olursa ağ yöneticisinden `huggingface.co` için izin iste.
- Model 768 boyutlu vektör üretmelidir (veritabanı sütunu buna göre). Model değiştirilirse eski kaynakların vektörleri uyumsuz olur: kaynaklar silinip yeniden eklenmeli.
- e5 modelleri soru ve metin için farklı önek ister (`EMBED_QUERY_PREFIX`, `EMBED_DOCUMENT_PREFIX`); compose dosyası bunları ayarlar.
- Benzerlik eşiği `RETRIEVAL_MAX_DISTANCE` (varsayılan `0.22`) bu modelin skor dağılımına göre belirlendi. Kendi materyaline göre `npm run eval` ile doğrula.

## Doğruluk testi (gerçek soru seti ile)

Kaynaklar yüklendikten sonra sistemin cevap kalitesini ölçmek için, hazırladığın soru dosyasını konteynere kopyalayıp çalıştır:

```
cd /opt/biyoai
docker compose cp sorularim.json app:/app/eval/sorularim.json
docker compose exec app npm run eval -- eval/sorularim.json
```

Dosya biçimi için `eval/questions.example.json` dosyasına bak. Çıktıdaki "GROUNDING_MIN_SUPPORT önerisi" değerini `.env` dosyasına yazıp `docker compose up -d --force-recreate app` ile uygulayabilirsin.

## Otomatik başlatma, sağlık kontrolü ve yedek kurulumu

PC'de bir kez, teknik personel tarafından:

```
cd /opt/biyoai
sudo scripts/install-ops.sh
```

Bu betik şunları kurar: PC açılınca BiyoAI'yi başlatan systemd servisi, 5 dakikada bir sağlık kontrolü (düşerse uygulamayı yeniden başlatır) ve her gece 03:15'te veritabanı yedeği. Önce ne yapacağını görmek için `scripts/install-ops.sh --dry-run` çalıştırılabilir.

Yedeğin gerçekten geri yüklenebildiğini doğrulamak için (canlı veritabanına dokunmaz):

```
cd /opt/biyoai
scripts/backup.sh && scripts/restore-check.sh
```

Çıktıda kaynak, parça, soru ve not sayıları ile "Geri yükleme başarılı." görülmelidir. Bunu kurulumdan sonra ve ara sıra tekrarla.

## TLS sertifika hatası (SELF_SIGNED_CERT_IN_CHAIN)

Bazı okul ve kamu ağları (ör. MEB ağı) HTTPS trafiğini denetler: Groq gibi sitelere giderken sertifikayı kendi CA'larıyla yeniden imzalarlar. Tarayıcı ve `curl` bu CA'ya güvenir, uygulamanın Docker imajı güvenmez. Belirtiler: kaynak eklenmez, sorular "sistem yoğun" cevabı verir, panelde şu tür bir uyarı çıkar:

```
TLS sertifikası doğrulanamadı (SELF_SIGNED_CERT_IN_CHAIN)
```

Çözüm (teknik personel):

```
cd /opt/biyoai
scripts/export-ca.sh
docker compose up -d --force-recreate app
```

Betik ağın sertifika zincirinin en üstündeki sertifikayı `certs/extra-ca.pem` dosyasına yazar ve konu/parmak izini gösterir. Bu dosya "ağın ürettiği sertifikalara güven" demektir, o yüzden parmak izini ağ yöneticisiyle doğrula.

Gizlilik notu: ağ HTTPS'i bu şekilde yeniden imzalıyorsa, ağ işletmecisi öğrenci sorularını ve kaynak metinlerini Groq'a giderken çözebilir. Bu, KVKK bilgilendirmesinde ve "veri yurt dışına gidiyor" değerlendirmesinde ayrıca düşünülmelidir. Yerel embedding çalıştırmak (bu belgenin "Embedding servisi" bölümü) en azından arama adımındaki metinlerin ağdan geçmesini engeller. Sohbet modeli çağrısı yine Groq'a gider.


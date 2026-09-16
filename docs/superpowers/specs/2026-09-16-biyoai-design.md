# BiyoAI — Tasarım Belgesi

## Amaç

Lise 11. sınıf biyoloji öğretmeni için kişisel bir yapay zeka öğretim asistanı. Öğretmenin verdiği kaynaklara (makale, ders notu, PDF, link) dayanarak öğrenci sorularını cevaplar. Türkiye'deki akıllı tahta işletim sistemi Pardus (ETAP) üzerinde, dokunmatik ekranda çalışır. Öğretmenin geri bildirimleriyle zamanla cevap kalitesini artırır. En kritik gereksinim: **halüsinasyon yapmama** — sadece verilen kaynaklara dayanarak cevap verir, kapsam dışı sorularda "bilmiyorum" der.

Bu, ödev/demo değil, **gerçek kullanım** için tasarlanır: öğretmen ve öğrenciler sınıfta sürekli kullanacak.

## Kapsam dışı (bilinçli olarak dahil edilmeyen)

- Bireysel öğrenci hesabı / girişi — öğrenciler paylaşımlı tahta ekranından, kimliksiz erişir
- Gerçek fine-tuning — öğretmen geri bildirimi model ağırlığını değiştirmez, prompt zenginleştirme (RAG-on-feedback) ile işler
- Bulut barındırma (Vercel vb.) — sistem okul PC'sinde yerel çalışır, tek dış bağımlılık LLM API çağrısı
- Genel internete açık erişim — öğrenci tarafı sadece okul ağı içi; öğretmen telefon erişimi Tailscale VPN ile, port yönlendirme/genel internete açma yok

## Mimari

### Bileşenler

- **Uygulama**: Next.js, tek uygulama, iki route
  - `/tahta` — girişsiz, dokunmatik-optimize, öğrenci soru-cevap ekranı. Akıllı tahtada tam ekran açılır (Pardus'un yerleşik tarayıcısında).
  - `/ogretmen` — şifreli giriş, responsive (mobil uyumlu) panel: kaynak yükleme/silme/listeleme, geçmiş cevaplara geri bildirim bırakma, sistem durumu ve "Yeniden Başlat" butonu.
- **Veritabanı**: Postgres + pgvector uzantısı, okul PC'sinde yerel (Docker Compose ile). Tutulanlar: kaynak parçaları (chunks), embedding'ler, öğretmen geri bildirimleri, soru-cevap logu (öğrenci kimliği **tutulmaz**).
- **LLM + embedding sağlayıcı**: Groq API (ücretsiz katman). Seçim gerekçesi: sözleşmeyle input/output model eğitiminde kullanılmıyor, varsayılan olarak saklanmıyor (zero retention opsiyonu mevcut), açık kaynak modelleri (Llama vb.) düşük gecikmeyle sunuyor. Gemini ücretsiz katmanı bu nedenle **elendi** (ücretsiz katmanda veri ürün geliştirme/eğitim için kullanılabiliyor, insan incelemesi olabiliyor — KVKK/öğrenci verisi açısından uygun değil).
- **Barındırma**: Okul PC'si üzerinde self-host. Next.js + Postgres, `docker-compose.yml` ile tek komutla ayağa kalkar. systemd servisi olarak yapılandırılır, PC açılınca otomatik başlar; healthcheck cron ile izlenir, düşerse otomatik yeniden başlar.
- **Ağ erişimi**:
  - Tahta → PC: mDNS (`biyoai.local`), sabit IP bağımlılığı yok.
  - Öğretmen telefonu (evden dahil) → PC: Tailscale VPN (ücretsiz kişisel kullanım), port yönlendirme veya genel internete açma yok.

### RAG akışı (halüsinasyon önleme)

1. Öğretmen kaynak yükler (PDF/metin/link) → parçalanır (chunking) → Groq embedding API ile vektörleştirilir → Postgres/pgvector'e yazılır. İnternet yoksa yükleme kuyruğa alınır, bağlantı gelince işlenir.
2. Öğrenci soru sorar → soruya en yakın kaynak parçaları (top-k) pgvector ile bulunur.
3. LLM'e verilen talimat: **sadece bu parçalarla cevap üret, parçalar soruyu kapsamıyorsa "bilmiyorum" de**. Cevapta kaynak referansı zorunlu; referanssız/kaynaksız çıktı frontend'de "doğrulanamadı" olarak işaretlenir.
4. Cevap TYMM (Türkiye Yüzyılı Maarif Modeli) yaklaşımına uygun üretilir: ezber/tek cümlelik değil, beceri temelli ve derinlemesine öğrenmeyi destekleyen (örneğin kavramı örnekle, ilişkilendirerek anlatan) bir sistem promptu ile yönlendirilir.

### Geri bildirim mekanizması (RAG-on-feedback)

- Öğretmen bir cevaba not/düzeltme bıraktığında, bu not da embed edilip ayrı bir tabloda (geri bildirim koleksiyonu) saklanır.
- Yeni bir soru geldiğinde, kaynak parçalarına ek olarak semantik olarak en yakın 3-5 geri bildirim de prompt'a eklenir.
- Çelişen geri bildirimlerde en son tarihli olan önceliklidir.
- Bu yaklaşım, tüm geri bildirim geçmişini prompt'a eklemenin yol açacağı context şişmesini ve maliyet/gecikme artışını önler.

### Güvenilirlik ve operasyon

- Docker Compose ile paketleme: tek komutla kalkar, tekrarlanabilir kurulum.
- systemd servisi: PC yeniden başlayınca otomatik ayağa kalkar.
- Healthcheck + otomatik restart: servis düşerse kendini toparlar.
- Öğretmen paneli üzerinden tek tuşla "Sistemi Yeniden Başlat".
- Günlük otomatik yedekleme (`pg_dump` cron job).
- Tek sayfalık operasyon dokümanı: PC açılışı, API anahtarı yenileme, yedek alma/geri yükleme, teknik bilgisi olmayan öğretmenin takip edebileceği adımlarla.
- Groq rate limit'e karşı: istemci tarafında kuyruk + "sistem yoğun, lütfen bekleyin" geri bildirimi, sık tekrar eden/benzer sorularda yanıt önbellekleme.

### Dokunmatik arayüz (Pardus tahta)

- Tüm dokunma hedefleri min 44px, hover'a bağlı hiçbir etkileşim yok.
- Metin girişi native ekran klavyesini tetikler (ekstra iş gerekmez), büyük font (uzaktan okunabilirlik).
- Sürükle-bırak yok; büyük "sonraki/temizle" butonları.
- Çoklu dokunma yanlış tetiklemesine karşı debounce.
- Pardus'taki tarayıcı sürümü geliştirme öncesi tespit edilir, Next.js `browserslist` buna göre ayarlanır, `backdrop-filter`/`container queries` gibi riskli CSS özelliklerinden kaçınılır.

### KVKK ve veri güvenliği

- Öğrenci kimliği (isim, sınıf vb.) hiçbir tabloda tutulmaz.
- Soru-cevap logu anonimdir, sadece sistem iyileştirme amaçlı (geri bildirim eşleştirme, hata ayıklama) tutulur.
- Groq API seçimi, ücretsiz katmanda dahi veri eğitim amaçlı kullanılmaması nedeniyle bilinçli tercih edildi.
- Ölçek büyürse (çok okul, resmi kullanım vb.) MEB'in YAZEK (Yapay Zeka Uygulamaları Etik Beyan Sistemi) süreci değerlendirilmeli; şu anki tek sınıf/tek öğretmen kapsamında gerekmediği değerlendirildi, ancak akılda tutulmalı.

### İçerik güvenliği

- Öğrenci girdilerinde basit bir uygunsuz içerik filtresi (kelime listesi) + Groq'un kendi güvenlik katmanı ikinci savunma hattı olarak kullanılır.

## Veri modeli (özet)

- `sources` — yüklenen kaynak (başlık, tip: pdf/metin/link, öğretmen id, yüklenme tarihi)
- `chunks` — kaynak parçaları (source_id, metin, embedding vektörü)
- `feedback` — öğretmen geri bildirimi (ilişkili soru-cevap, not metni, embedding vektörü, tarih)
- `qa_log` — soru-cevap kaydı (soru, cevap, kullanılan kaynak referansları, zaman damgası; öğrenci kimliği yok)
- `teacher` — öğretmen hesabı (kimlik doğrulama bilgisi)

## Test stratejisi

- RAG doğruluk testi: bilinen kaynak setiyle örnek soru-cevap çiftleri, kaynak dışı sorularda "bilmiyorum" cevabının doğrulanması.
- Dokunmatik arayüz: gerçek Pardus tahtasında (veya en yakın tarayıcı sürümüyle emülasyon) manuel test.
- Yük/rate-limit testi: eş zamanlı çoklu soru senaryosu ile Groq limitine yaklaşma davranışı.
- Ağ kopması senaryosu: internet giderken kaynak yükleme kuyruğa alma, LLM çağrısı başarısız olunca kullanıcıya anlaşılır mesaj.
- Yeniden başlatma testi: PC'yi kapat/aç, servislerin otomatik ayağa kalkması.

## Açık noktalar (implementasyon sırasında netleştirilecek)

- Okul PC'sinin kesin donanım özellikleri (RAM/CPU) — Docker Compose kaynak limitleri buna göre ayarlanacak.
- Pardus tahta tarayıcısının tam sürümü — geliştirme başında tespit edilecek.
- Groq'ta kullanılacak kesin model adı (embedding + chat) — güncel model/limit tablosuna göre implementasyon sırasında seçilecek.

# BiyoAI

Lise 11. sınıf biyoloji dersi için, öğretmenin verdiği kaynaklara dayanarak öğrenci sorularını cevaplayan yapay zeka asistanı. Akıllı tahtada (Pardus/ETAP) dokunmatik ekranla kullanılır.

Temel kural: **sadece verilen kaynaklara dayanarak cevap verir.** Kaynaklar soruyu kapsamıyorsa "bilmiyorum" der. Kaynak referansı olmayan cevaplar ekranda "Doğrulanamadı" olarak işaretlenir.

Tasarım kararlarının gerekçesi: [docs/superpowers/specs/2026-09-16-biyoai-design.md](docs/superpowers/specs/2026-09-16-biyoai-design.md)

## Nasıl çalışır

1. Öğretmen `/ogretmen` panelinden kaynak ekler: metin yapıştırır, PDF yükler (en fazla 10 MB, metin katmanı olan PDF) ya da bir web sayfasının bağlantısını verir. Metin parçalanır, Groq ile vektörlere çevrilir ve Postgres (pgvector) içine yazılır. Kaynaklar sonradan düzenlenebilir.
2. Öğrenci `/tahta` ekranında soru sorar. Soruya en yakın kaynak parçaları pgvector ile bulunur.
3. Model, sadece bu parçalarla cevap üretir. Cevaptaki kaynak referansları gerçekten getirilen parçalarla karşılaştırılıp doğrulanır.
4. Öğretmen geçmiş cevaplara not bırakır. Notlar da vektörlenir; benzer bir soru geldiğinde en yakın notlar prompt'a eklenir (model ağırlığı değişmez).

Ek korumalar:

- Uygunsuz içerik filtresi: küfür/hakaret içeren sorular modele gitmeden reddedilir ([lib/content-filter.ts](lib/content-filter.ts)). Üreme sistemi gibi müfredat terimleri serbesttir.
- Groq limitine karşı istek kuyruğu, tekrar eden sorular için yanıt önbelleği ve istemci başına dakikada 30 soru sınırı.
- Öğretmen girişinde istemci başına dakikada 10 deneme sınırı.
- İnternet yokken eklenen kaynak silinmez, "işlenmeyi bekliyor" olarak kalır ve bağlantı gelince otomatik işlenir. Bekleyen kaynaklar cevaplarda kullanılmaz.
- Öğretmen notları sadece soruyla ilgiliyse (benzerlik eşiği) prompt'a eklenir. Notlar çelişirse en yeni not geçerlidir.
- Web sayfası kaynakları sunucu tarafında alınır. Yerel ağ ve özel IP adreslerine giden bağlantılar reddedilir.
- Öğrenci kimliği hiçbir yerde tutulmaz. Soru-cevap kaydı anonimdir.

## Teknoloji

| Parça | Seçim |
| --- | --- |
| Uygulama | Next.js 16 (App Router), React 19, TypeScript, Node 22 |
| Veritabanı | Postgres 16 + pgvector (Docker Compose) |
| LLM ve embedding | Groq API |
| Kimlik doğrulama | Öğretmen şifresi (bcrypt) + imzalı oturum çerezi |
| PDF | unpdf |
| Test ve CI | Vitest, GitHub Actions |

## Sayfalar

| Adres | Ne işe yarar |
| --- | --- |
| `/tahta` | Öğrenci soru-cevap ekranı, girişsiz, dokunmatik uyumlu |
| `/ogretmen` | Şifreli panel: kaynak ekleme/silme, son sorulara not bırakma, sistemi yeniden başlatma |
| `/api/health` | Sağlık kontrolü (healthcheck scripti kullanır) |

## Kurulum ve çalıştırma

Okul PC'sindeki kurulum adımları [OPERATIONS.md](OPERATIONS.md) dosyasında.

Geliştirme için:

```bash
cp .env.example .env     # GROQ_API_KEY ve SESSION_SECRET değerlerini doldur
docker compose up -d db  # sadece veritabanı
npm install
npm run dev              # http://localhost:3000
```

`SESSION_SECRET` en az 32 karakter olmalı: `openssl rand -hex 32`

Öğretmen şifresini belirlemek için:

```bash
npm run seed:teacher -- <sifre>
```

## Ortam değişkenleri

| Değişken | Açıklama |
| --- | --- |
| `DATABASE_URL` | Postgres bağlantı adresi |
| `TEST_DATABASE_URL` | Sadece testler için. Adında `test` geçen, silinebilir bir veritabanı olmalı |
| `GROQ_API_KEY` | Groq API anahtarı |
| `GROQ_CHAT_MODEL` | Sohbet modeli (varsayılan `llama-3.3-70b-versatile`) |
| `GROQ_EMBED_MODEL` | Groq üzerinden embedding modeli. Groq hesabında embedding modeli olduğundan emin ol |
| `EMBED_BASE_URL`, `EMBED_MODEL`, `EMBED_API_KEY` | İsteğe bağlı. OpenAI uyumlu başka bir embedding sunucusu (ör. yerel Ollama). Ayarlanırsa embedding için Groq kullanılmaz. Model 768 boyutlu olmalı |
| `SESSION_SECRET` | Oturum imzası, en az 32 karakter |

## Testler

```bash
npm test
```

`tests/lib/retrieve.test.ts` veritabanında silme işlemi yaptığı için, veritabanı adında `test` geçmiyorsa çalışmayı reddeder. Ayrı bir test veritabanı hazırlamak için:

```bash
docker compose exec db createdb -U biyoai biyoai_test
docker compose exec -T db psql -U biyoai biyoai_test < lib/schema.sql
TEST_DATABASE_URL=postgres://biyoai:biyoai@localhost:5432/biyoai_test npm test
```

Mevcut bir veritabanını güncellemek için (şema idempotent, tekrar çalıştırmak zararsız):

```bash
docker compose exec -T db psql -U biyoai biyoai < lib/schema.sql
```

Kalite kontrolleri (aynıları GitHub Actions'ta her push'ta çalışır):

```bash
npm run lint
npx tsc --noEmit
npm run build
```

## Klasör yapısı

```
app/            sayfalar ve API route'ları
  tahta/        öğrenci ekranı
  ogretmen/     öğretmen paneli
  api/          ask, sources, feedback, qa-log, health, restart, auth
lib/            RAG, retrieval, ingest, Groq istemcisi, önbellek, kuyruk, filtre,
                hız sınırı, bekleyen kaynaklar, PDF ve bağlantı okuma
scripts/        yedekleme, healthcheck, öğretmen şifresi
tests/          birim ve API testleri
docs/           tasarım belgesi ve uygulama planı
```

## Operasyon

- `biyoai.service`: PC açılınca Docker Compose'u başlatan systemd servisi
- `scripts/healthcheck.sh`: sağlık kontrolü başarısızsa uygulamayı yeniden başlatır
- `scripts/backup.sh`: günlük `pg_dump`, son 30 yedek tutulur

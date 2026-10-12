# Ek CA sertifikası

Bazı okul ve kamu ağları HTTPS trafiğini denetler: Groq gibi sitelere giderken sertifikayı kendi CA'larıyla yeniden imzalarlar. Tarayıcı ve `curl` bu CA'ya güvenir, ama uygulamanın Docker imajı güvenmez ve şu hatayı alır:

```
SELF_SIGNED_CERT_IN_CHAIN
```

Çözüm: ağın CA sertifikasını bu klasöre `extra-ca.pem` adıyla koymak. `docker-compose.yml` bu klasörü konteynere bağlar ve `NODE_EXTRA_CA_CERTS` ile uygulamaya tanıtır.

```
scripts/export-ca.sh            # sertifikayı api.groq.com zincirinden kaydeder
docker compose up -d --force-recreate app
```

Betiğin yazdığı konu ve parmak izini ağ yöneticisiyle doğrula: bu dosya, ağın ürettiği sertifikalara güvenmek anlamına gelir. `*.pem` dosyaları git'e girmez.

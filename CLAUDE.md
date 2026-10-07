# Vocabulary Defteri — Proje Özeti

Bu dosya, claude.ai sohbetinde alınan kararları özetler. Claude Code her oturumda bunu okur; yeni kararlar alındıkça güncelle.

## Ürün

- **Ana tema:** Uygulama bir *vocabulary defteri* gibi çalışır. Test aracı değil, yaşayan bir defter. Pekiştirme, defterle etkileşim yoluyla olur.
- Ticari değil. Kullanıcılar 18 yaş üstü.
- Flashcard ve benzeri etkinlikler **ekstra**; temel özellik değil, sonraki aşamada.
- Dışa aktarma özelliği **yok**.
- **Uygulama dili her zaman İngilizce.** Arayüz metinleri, rotalar, kod ve kod yorumları İngilizce. Kullanıcı özellikleri Türkçe tarif etse de uygulamaya İngilizce eklenir. (Bu dosya Türkçe kalır.)
- **Masaüstü uygulaması**, mobil hedef değil (en küçük genişlik ~960px).

## Kelime kaydı (kelime sayfası)

**Otomatik gelen katman**
- Kelime, IPA, ses dosyası, tanım, örnek cümleler, eş/zıt anlamlılar, köken
- **Sesletim:** tarayıcının kendi TTS'i (Web Speech API) — kelime, yavaş okuma, örnek cümleler, karşılaşma cümleleri, kendi cümlesi, collocation'lar okunabilir. Free Dictionary kaydı varsa ayrıca insan sesi kaydı.
- **Binlik sıra (K):** "4K" = en sık 4.000 kelime arasında. Datamuse frekansından tahmin edilir (bkz. Kod durumu → frekans). Renkler ve filtreler K bantlarına göre: 1K, 2–3K, 4–5K, 6–10K, 11–20K, 20K+. **CEFR kullanılmıyor** (gömülü liste kaldırıldı, API'ler CEFR vermiyor).
- Collocation'lar: Datamuse'tan en sık birlikte kullanılan kelimeler; **anlamsız olanlar süzülür** ("the", ".", "will", "to" gibi işlev kelimeleri)
- YouGlish: gerçek kullanımda telaffuz

**Kişisel katman**
- Kaynak: nerede öğrenildi (dizi, kitap, iş…) ve tarih
- Kendi cümlesi; ilk karşılaşılan orijinal cümle
- Türkçe anlam: **kullanıcı kendisi yazar** (API'ler sadece İngilizce veri veriyor). Arayüzde "My translation", alan adı `translation`.
- **Karşılaşmalar:** Kelimeyle her yeni karşılaşma (nerede, cümle, tarih) kayda eklenir. Mevcut bir kelime tekrar eklenmeye çalışılınca "yeni karşılaşma olarak ekleyelim mi?" sorulur.
- Kenar notları / çağrışımlar
- Hakimiyet seviyesi, kullanıcının kendi değerlendirmesi: tanıyorum → anlıyorum → kullanıyorum

API'den gelen bilgiler eklenme anında kaydın içine kopyalanır, böylece API çökse bile defter bozulmaz.

## Ekranlar

1. **Defter (ana ekran):** Tarih/kaynak/frekans/hakimiyet/etikete göre gezilir. Üstte "defterden bir sayfa" önerisi (bir süredir bakılmamış kelimeler; aralıklı tekrar mantığı, ama sınav değil, davet).
2. **Kelime sayfası:** Uygulamanın kalbi.
3. **Hızlı ekleme:** Kelime yaz → Datamuse'tan otomatik tamamla → seç → kaynak (+ isteğe bağlı anlam/cümle) → kaydet. 10 saniyeyi geçmemeli.
4. Ayarlar / hesap / sync durumu
5. (Sonra) Flashcard ve diğer etkinlikler

## Veri kaynakları

- **Gömülü kelime listesi yok** (kullanıcı kararı, 7 Ekim 2026): kelime verisi Free Dictionary'den, frekans ve otomatik tamamlama Datamuse'tan.
- **Free Dictionary API** (`https://api.dictionaryapi.dev/api/v2/entries/en/<word>`): ana tanım kaynağı (tanım, örnek, IPA, ses, köken, eş/zıt). Ücretsiz, anahtarsız. Gönüllü proje; çökme ihtimaline karşı tasarla. **7 Ekim 2026'da test sırasında erişilemiyordu** (zaman aşımı) → Datamuse yedeği şart.
- **Datamuse API:** otomatik tamamlama `sp=<önek>*&md=f`, kelime bilgisi `sp=<kelime>&md=dfr&ipa=1` (frekans + yedek tanım + IPA), `rel_bga` (sonra gelenler), `rel_bgb` (önce gelenler), `rel_syn`/`rel_ant`. Günlük 100.000 istek. **1 Ocak 2027'den itibaren API anahtarı zorunlu** → anahtar Worker'da tutulmalı, çağrılar Worker üzerinden.
- **YouGlish JS API** (embed değil): `https://youglish.com/public/emb/widget.js`, `new YG.Widget()`. Betik yüklenince `window.YG`'yi senkron tanımlar ve varsa `onYouglishAPIReady`'yi çağırır (biz script `onload` ile bekliyoruz). Widget verilen elemanı `outerHTML` ile değiştirir → React'in yönetmediği bir alt div'e kurulur. Widget yanında YouTube Kullanım Şartları ve Google Gizlilik Politikası linkleri gösterilir; **çerez onayı alınmadan betik yüklenmez**. Kelime sayfasında gösterilir.
- **Datamuse POS** (`md=p`): sıfat–isim collocation'ları sadece isimlerde (`rel_jjb`) / sıfatlarda (`rel_jja`) istenir; aksi halde deyim parçaları gelir ("failure to thrive" → "thrive children").
- **TTS:** `speechSynthesis`. Sesler gecikmeli yüklenir (`voiceschanged`). macOS efekt sesleri (Albert, Bubbles…) listeden çıkarılır.

## Mimari

```
GitHub repo (herkese açık)
 ├─ /app    → GitHub Actions → GitHub Pages
 └─ /worker → GitHub Actions (wrangler) → Cloudflare Worker (ücretsiz)
                                            ↓ R2 binding (anahtarsız)
                                            R2: users/<google-sub>/progress.json
```

- **Yayın (7 Ekim 2026):** repo https://github.com/dmrgveli/vocabook (herkese açık), site **https://dmrgveli.github.io/vocabook/**. `main`'e her push → `.github/workflows/pages.yml` (test + build + deploy). Pages kaynağı: GitHub Actions.
- **Ön yüz:** Vite + React, `base: '/<repo-adi>/'`, hash router (GitHub Pages alt sayfa 404 sorunu yüzünden). Local-first: veri önce IndexedDB'ye yazılır, arka planda sync.
- **Depolama:** R2 ücretsiz kotası kullanılıyor. R2'de **sadece kullanıcının ilerleme/defter verisi** tutulur; görsel vb. dosya yok.
- **Giriş:** Google Identity Services. Client ID gizli değil, ön yüzde durabilir. Yetkili JavaScript kaynakları: `https://dmrgveli.github.io` ve `http://localhost:5173`.
- **Git/GitHub (bu makine):** Homebrew yok; GitHub CLI `~/.local/gh/gh_2.102.0_macOS_arm64/bin/gh` (resmî sürüm, SHA-256 doğrulandı), hesap `dmrgveli`, git kimlik bilgisi `gh auth setup-git` ile. Kullanıcının GitHub e-posta gizliliği açık → commit yazarı `Veli <97388561+dmrgveli@users.noreply.github.com>` (repo-yerel git config); gerçek e-posta ile push reddedilir. Kullanıcı Terminal paneline yazamıyor → etkileşimli komutlar yerine `--web` + `< /dev/null` gibi sorusuz yollar kullan.

## Güvenlik kuralları

1. Worker her istekte Google ID token'ını doğrular: imza (Google açık anahtarları), `aud` = Client ID, `iss` = Google, süre.
2. R2 yolu **asla istemciden alınmaz**; her zaman token'daki `sub`'dan üretilir (e-posta değil).
3. CORS sadece `https://dmrgveli.github.io` kaynağına izin verir.
4. Gelen veri için boyut sınırı (~2 MB), JSON ve şema doğrulaması.
5. Sync çakışmaları: R2 ETag ile koşullu yazma; çakışmada istemci birleştirip tekrar dener. Kayıtlarda `updatedAt`, silmelerde `deletedAt`.
6. Kullanıcı notları metin olarak gösterilir (`dangerouslySetInnerHTML` yok).
7. CSP, `<meta http-equiv>` ile (GitHub Pages başlık ayarına izin vermez).
8. Google token bellekte tutulur, `localStorage`'a yazılmaz.
9. Repoda hiçbir sır yok. `.dev.vars` `.gitignore`'da. Gizli değerler `wrangler secret put` veya GitHub Actions secret ile.
10. Secret scanning ve Dependabot açık.

## Pedagoji ilkeleri

- Üretme etkisi: kendi cümlesini yazmaya teşvik (zorunlu değil).
- Episodik bağlam: kaynak, tarih, orijinal cümle, karşılaşmalar.
- Collocation ve gerçek kullanım (YouGlish) tanımdan daha kalıcı.
- Aralıklı tekrar arka planda, "göz at" daveti olarak; cezalandırma yok.
- Ekleme hızlı ve zahmetsiz olmalı; zorunlu alanlar minimum.

## Tasarım yönü

- Sakin, okunaklı bir çalışma alanı; oyun değil. Her ekranda tek ana eylem.
- Defter metaforu: sıcak zemin, karakterli tipografi, kenar notu hissi, küçük etiketler. Ama sade ve modern, kitsch "sahte kâğıt" değil.
- **Kullanıcı geri bildirimi (7 Ekim 2026):** liquid glass denemesi "çok corporate" bulundu. Yön: **basit ama monoton değil.** Cam/blur/degrade/hareketli arka plan yok. Düz kâğıt zemin, 1.5px mürekkep kenarlıklar, küçük kaydırılmış düz gölgeler (hover'da kart kalkar), fosforlu kalem sarısı ana düğme ve vurgular, K bandına göre pastel kart dolguları, hafif eğik "çıkartma" rozetler. Animasyonlar küçük ve oyuncu (yay geçişleri, kayan seçici, kartların hafif dönerek girişi), abartısız.
- Anlamlı renkler: K bantları ve hakimiyet için tutarlı skala.
- **Masaüstü öncelikli**, otomatik karanlık mod. `prefers-reduced-motion` desteklenir.

## Yol haritası

| Aşama | İçerik | Durum |
|---|---|---|
| 0. Temel | Veri modeli (karşılaşmalar, notlar dahil), tasarım sistemi | ✅ |
| 1. Defter | Ekle, gez, ara, filtrele; kelime sayfası; Datamuse otomatik tamamlama + frekans | ✅ |
| 2. Zenginleştirme | Free Dictionary, Datamuse collocation'ları, YouGlish, TTS, K sırası | ✅ (YouGlish onay sonrası video oynatma henüz canlı denenmedi) |
| 3. Hesap + Sync | Google girişi, Worker, R2 | Kod ✅ (testli); canlıya alma kullanıcının Google Client ID + Cloudflare adımlarını bekliyor |
| 4. Pekiştirme | Karşılaşma kaydı, "defterden bir sayfa" önerileri | Karşılaşma kaydı ✅; öneriler — |
| 5. Ekstralar | Flashcard ve diğer etkinlikler | — |

## Kod durumu (uygulanan kararlar)

> Kodlama 7 Ekim 2026'da başladı. Bu bölüm her oturumda güncellenir.
> 7 Ekim 2026 (2. tur): arayüz İngilizceye çevrildi, masaüstü + liquid glass yeniden tasarım, gömülü liste kaldırıldı, API zenginleştirme eklendi.

> 7 Ekim 2026 (3. tur): liquid glass kaldırıldı → sade "mürekkep + fosforlu kalem" tasarımı; YouGlish, TTS, K sırası ve süzülmüş collocation'lar eklendi.

**Yapı**
```
CLAUDE.md
.gitignore
.github/workflows/pages.yml   → test + build (BASE_PATH=/<repo-adi>/) + Pages deploy
.github/dependabot.yml        → npm (/app) + github-actions, haftalık
.claude/launch.json           → "app" (dev :5173), "app-preview" (build önizleme :4173), "app-test" (ayrı veriyle dev :5174)
app/
  index.html                  → lang="en", başlık "Vocab Notebook"
  vite.config.ts              → base = BASE_PATH env (yoksa '/'); CSP <meta> sadece build'e eklenir
  src/
    main.tsx                  → fontlar + stiller + HashRouter + AppStateProvider
    app/App.tsx               → kabuk: Sidebar, sayfa geçişleri, ⌘K kısayolu, dialog, toaster
    app/state.tsx             → filtreler, hızlı ekleme açık/kapalı, toast'lar (context)
    hooks.ts                  → useEntries, useEntry, useSuggestions (Datamuse, 140ms debounce)
    speech.ts                 → TTS: speak(), useSpeaking, useEnglishVoices, ses/hız tercihi (localStorage 'speech-prefs')
    youglish.ts               → widget.js yükleyici, YG tipleri, onay durumu (localStorage 'youglish-consent')
    api/http.ts               → getJson (zaman aşımı, 404 → NotFoundError)
    api/datamuse.ts           → suggest, wordInfo, collocations (süzgeç + POS), synonyms, parse*
    api/dictionary.ts         → Free Dictionary lookupWord + parseDictionary
    api/enrich.ts             → fetchEnrichment (iki API paralel, Datamuse yedek), enrichEntry(id)
    data/model.ts             → tipler + create* yardımcıları
    data/frequency.ts         → frekans → tahmini sıra → K, K bantları
    data/db.ts                → IndexedDB (idb): 'vocab-notebook' v1, store 'entries' (index: word)
    data/notebook.ts          → arama/filtre/gün gruplama/kaynak+etiket sayıları
    data/data.test.ts         → vitest
    components/               → Sidebar, QuickAddDialog, Toaster, YouGlishPanel, EditableText, SourceInput,
                                ui.tsx (KBadge, toneClass, MasteryMeter, MasteryControl, SpeakButton, RecordingButton)
    screens/                  → Notebook, WordPage, Settings
    styles/                   → tokens.css, base.css, layout.css, screens.css
```

**Teknik kararlar**
- TypeScript (strict), React 19, Vite 8, react-router-dom 7 (HashRouter), `idb`, `motion`, `lucide-react` (marka ikonları yok → YouTube yerine `Clapperboard`), vitest.
- Fontlar self-host: **Instrument Serif** (kelimeler, örnek cümleler, kenar notları, collocation'lar) + **Bricolage Grotesque** (arayüz, kalın başlıklar).
- Tasarım tokenları `styles/tokens.css`: `--paper`, `--card`, `--ink`, `--line`, `--marker` (sarı), `--pop` (kaydırılmış gölge), K bantları için `--k1…--rare` dolgu + `-ink` renk çiftleri. `.tone-<band>` sınıfı `--fill`/`--tone` atar; kartlar ve rozetler bunu kullanır.
- Kelime kartı "stretched link": kelime `Link`'i `::after` ile tüm kartı kaplar, konuş düğmesi üstte kalır (a içinde button yok).
- Kısayollar: ⌘K/Ctrl+K hızlı ekleme, `/` arama, Esc, ↑↓ Enter.
- API çağrıları doğrudan istemciden. Datamuse 1 Ocak 2027'de anahtar isteyecek → `api/datamuse.ts` `BASE` Worker'a çevrilecek (en geç Aralık 2026).
- CSP `connect-src`: dictionaryapi.dev, datamuse.com, `*.workers.dev`; `script-src`/`frame-src` youglish.com (+ youtube.com frame). YouGlish iframe'i kendi içinde YouTube yükler.
- Komutlar (`app/` içinde): `npm run dev`, `npm test`, `npm run build`.

**Frekans → K sırası** (`data/frequency.ts`)
- Kalibrasyon (7 Ekim 2026): hermitdave/FrequencyWords OpenSubtitles 2018 en_50k listesinin her 20. kelimesi Datamuse'ta sorgulandı, frekanslar büyükten küçüğe sıralandı; n. frekans ≈ n×20. sıra. Uygulamaya **sadece eşik tablosu** girdi (1K…40K), liste değil. Aradaki değerler log ölçekte enterpolasyon. Kontrol: get 1K, decide 3K, grasp 6K, thrive 14K, nuance 26K.
- Liste kelime biçimlerini sayıyor (lemma değil) → sıralar yaklaşık; arayüz sadece binlik gösterir.

**Collocation süzgeci** (`api/datamuse.ts`)
- `rel_bgb` (önce gelen) ve `rel_bga` (sonra gelen) 60 sonuçla istenir, sonra süzülür: işlev kelimeleri (artikeller, zamirler, yardımcı/kip fiiller, bağlaçlar, "only/also/very" vb.) atılır. Edatlar önce-listesinden atılır; sonra-listesinde en fazla 4 tane kalır ("thrive on/in/under"), "of" hiç kalmaz.
- `rel_jjb` ("final decision") sadece isimlerde, `rel_jja` ("meticulous care") sadece sıfatlarda (POS `md=p`). Sıfat listesinde olan kelime önce-listesinden çıkarılır.
- Sayfada gruplar: Described as / Describes / Comes after / Followed by; her öğe tıklanınca TTS ile okunur.
- Eski kayıtlar (`collocations.adjectives` yok) kelime sayfası açılınca otomatik yeniden çekilir; Ayarlar'da toplu güncelleme de var.

**Veri modeli** (`app/src/data/model.ts`)
- `Entry`: `word`, `frequency?` (Datamuse, milyonda), `translation?`, `ownSentence?`, `encounters[]`, `notes[]`, `tags[]`, `mastery` (`recognize|understand|use`), `enrichment?`, `lastViewedAt?`.
- `Enrichment`: `fetchedAt`, `definitionsFrom` (`free-dictionary|datamuse|none`), `phonetic?`, `audioUrl?`, `meanings[]`, `synonyms[]`, `antonyms[]`, `origin?`, `collocations{before[], after[], adjectives?[], nouns?[]}`.
- `Encounter`: `source`, `sourceKind?` (arayüzde yok), `sentence?`, `date`. İlk karşılaşma = en eski `date`.
- Hepsi `id/createdAt/updatedAt/deletedAt?` taşır; silme = `deletedAt`. `lastViewedAt` `updatedAt`'ı değiştirmez.

**Zenginleştirme akışı**
- Kelime hemen kaydedilir; sözlük verisi arka planda çekilip kayda kopyalanır. Free Dictionary (7 sn zaman aşımı) + Datamuse paralel; Free Dictionary yoksa tanım/IPA Datamuse'tan. İkisi de çökerse kayıt etkilenmez, sayfada "Try again".

**Ekran davranışları**
- Kabuk: solda sade sütun (marka, sarı "Add word ⌘K", gezinme, How common / Mastery / Sources / Tags filtreleri), sağda sayfa.
- Notebook: "My notebook" başlığı (fosforlu vurgu), kelime sayısı, yapışkan arama, gün grupları, K bandı renginde pastel kartlar (kelime, K rozeti, konuş düğmesi + IPA, çeviri ya da ilk tanım, kaynak ×karşılaşma, hakimiyet çubuğu).
- Quick add: büyük serif giriş, öneriler K rozetiyle; seçince konuş düğmesi + K rozeti, odak kaynağa.
- Word page: dev serif kelime + eğik K çıkartması; konuş, yavaş konuş (salyangoz), kayıt (mikrofon) düğmeleri, IPA, "Among the N most common words"; sağda hakimiyet seçicisi. Sol: Definitions (örnekler okunabilir), Used together with, Hear it in real videos (YouGlish), Related words, Origin. Sağ: My translation, My sentence (okunabilir), Encounters (cümleler okunabilir), Margin notes, Tags.
- YouGlish paneli: onay yoksa kesik çizgili onay kartı; onay sonrası aksan çipleri (All/US/UK/AU), parça sayacı, önceki/tekrar/sonraki; widget bileşenleri caption+speed+controls, autoStart kapalı, renkler tema tokenlarından.
- Settings: Pronunciation (ses seçimi + önizleme, hız 0.5–1.4×, test), Real-world videos (onay aç/kapa + yasal linkler), Storage (toplu güncelleme), Account & sync, Data sources.

**Hesap + Sync (Aşama 3)**
- **Worker** (`worker/`, ad `vocabook-sync`, R2 bucket `vocabook-data`, `wrangler.jsonc`): `GET/PUT/DELETE /v1/notebook`. Google ID token RS256 imzası Google JWKS ile (Cache-Control süresince önbellek), `iss`, `aud` = `GOOGLE_CLIENT_ID`, `exp` (60 sn tolerans), `sub` sadece rakam. R2 yolu `users/<sub>/progress.json`. CORS `ALLOWED_ORIGINS` (virgüllü; prod: sadece `https://dmrgveli.github.io`; yerel geliştirme `.dev.vars` ile localhost). Gövde ≤ 2 MB (akış okunarak, Content-Length'e güvenmeden), şema doğrulaması (`src/schema.ts`; `enrichment` alanı reddedilir). PUT `If-Match: <etag>` → R2 `onlyIf.etagMatches`; ilk yazma `If-None-Match: *` → R2'de "yalnızca yoksa oluştur" yok, `head` kontrolü (küçük yarış penceresi local-first istemcilerce bir sonraki sync'te iyileşir). Testler: gerçek RSA anahtarıyla imzalanmış token'lar + bellek içi R2.
- **İstemci** (`app/src/sync/`): `auth.ts` (GIS, `auto_select` + FedCM; token sadece bellekte; `localStorage['signed-in-hint']` = profil ipucu, token değil; süresi dolmadan 5 dk önce sessiz `prompt()` ile yenileme), `merge.ts` (saf, testli), `engine.ts` (GET → birleştir → yerel değişenleri yaz → fark varsa koşullu PUT; 412'de en fazla 4 deneme).
- **Birleştirme kuralları:** kayıtlar `id` ile, yeni `updatedAt` kazanır; encounters/notes kendi `id`+`updatedAt`'ıyla tek tek; silme = tombstone; `lastViewedAt` en büyüğü; aynı kelime iki cihazda eklenmişse en eski kayıtta toplanır (çeviri/cümle boşsa doldurulur, hakimiyet en yükseği, etiket birleşimi), diğerleri tombstone olur.
- **Sözlük verisi (`enrichment`) eşitlenmez** — 2 MB sınırını kelime başına birkaç KB yiyordu; her cihaz kendisi çeker (kelime sayfası açılınca otomatik). Silinen kayıtlar buluta küçük tombstone olarak gider.
- **Hesap değişimi:** `localStorage['last-synced-account']` = son eşitlenen `sub`. Farklı hesapla girilip cihazda kelime varsa sync durur, Ayarlar'da seçim: "Add this computer's words" (birleştir) / "Use only this account's words" (yerel defteri buluttakiyle değiştir). Sessiz karışma yok.
- **Tetikleyiciler:** yerel değişiklikten 2.5 sn sonra, girişte, pencere odağında, `online` olayında, 5 dk'da bir.
- **Arayüz:** kenar çubuğu altında durum satırı (Saved on this device / Sign in to sync / Syncing… / Synced x min ago / Offline / Sync paused · action needed) → Ayarlar'a gider. Ayarlar'da "Account & sync" kartı en üstte: Google düğmesi (GIS `renderButton`), profil, Sync now, Sign out, Delete cloud copy.
- **Yapılandırma (gizli değil):** `VITE_GOOGLE_CLIENT_ID`, `VITE_SYNC_URL` — yerelde `app/.env.local` (örnek `app/.env.example`), CI'da GitHub **repo variables** `GOOGLE_CLIENT_ID`, `SYNC_URL`. Boşsa uygulama "sync not set up" der, her şey yerelde çalışır. Worker için `CLOUDFLARE_ACCOUNT_ID` repo variable + `CLOUDFLARE_API_TOKEN` secret; token yoksa `worker.yml` test eder ama deploy etmez.
- CSP'ye `style-src https://accounts.google.com/gsi/style` eklendi. Worker adresi belli olunca `connect-src`'deki `*.workers.dev` tam adrese daraltılacak.
- `worker/` geliştirme bağımlılığı wrangler → miniflare → sharp üzerinden "high" npm audit uyarısı var (librsvg CVE). Yalnızca yerel araç, deploy edilen Worker'a girmez; `npm audit fix --force` wrangler'ı çok eski sürüme düşürdüğü için uygulanmadı, Dependabot'a bırakıldı.

## Kullanıcının yapacağı tek seferlik işler

- [x] GitHub hesabını Claude'a bağlamak (gh CLI, `dmrgveli`)
- [x] Herkese açık repo: `dmrgveli/vocabook`
- [x] Pages → Source: "GitHub Actions" (API ile açıldı)
- [ ] Repo Settings → Code security: Secret scanning + Dependabot alerts açık mı kontrol et (dependabot.yml sadece güncelleme PR'larını açar)
- [ ] Google Cloud Console'da OAuth Client ID (Web uygulaması) oluşturmak; yetkili JavaScript kaynakları `https://dmrgveli.github.io`, `http://localhost:5173`, `http://localhost`; OAuth izin ekranını "In production"a almak (sadece temel kapsamlar, doğrulama gerekmez) ya da kendini test kullanıcısı eklemek
- [ ] Cloudflare hesabı + R2'yi etkinleştirmek (ücretsiz katman için de ödeme yöntemi istenir)
- [ ] Cloudflare API token'ı oluşturup repoya `CLOUDFLARE_API_TOKEN` secret'ı olarak eklemek (token Claude ile paylaşılmaz) — otomatik Worker deploy'u için; ilk kurulum `wrangler login` ile de yapılabilir

## Açık sorular

- Kaynak türü (`sourceKind`: show/book/work…) hızlı eklemede sorulsun mu, yoksa sadece kelime sayfasında mı?
- Elle açık/koyu tema değiştirici istenir mi? (Şu an sistem ayarını izliyor.)
- YouGlish için partner anahtarı / reklam ayarı gerekecek mi? (Şu an anahtarsız, `setAdsLocation` çağrılmıyor.)
- R2 bucket adı ve Worker adı (varsayılan seçildi: `vocabook-data`, `vocabook-sync`; değiştirilebilir)
- Uygulamanın adı (repo `vocabook`, arayüzde şimdilik "Vocab Notebook" — birleştirilsin mi?)

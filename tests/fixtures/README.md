# Fixtures média (tests/fixtures)

Binaires utilisés par les tests unitaires de `src/lib/server/media/**`. Générés
localement, pas de dépendance à un service externe au moment des tests.

## photo-exif-rotated.jpg

JPEG 60x40 (paysage) avec le tag EXIF `Orientation=6` (rotation 90° horaire à
l'affichage), généré avec `sharp`:

```js
sharp(rawPixels, { raw: { width: 60, height: 40, channels: 3 } })
	.jpeg({ quality: 90 })
	.withMetadata({ orientation: 6 })
	.toFile('tests/fixtures/photo-exif-rotated.jpg');
```

Sert à vérifier que `processPhoto` applique `sharp().rotate()` (auto-orient
EXIF) avant de produire l'original et la miniature: les dimensions attendues
après traitement sont 40x60 (largeur/hauteur inversées par rapport aux pixels
bruts).

## photo.heic

Image HEIC 60x40 minimale, encodée depuis un PNG généré avec `sharp` via
`pillow-heif` (bindings Python pour libheif, aucun binaire `heif-enc` requis):

```python
from PIL import Image
import pillow_heif

pillow_heif.register_heif_opener()
Image.open('source.png').convert('RGB').save(
	'tests/fixtures/photo.heic', format='HEIF', quality=90
)
```

Sert à vérifier la conversion HEIC → JPEG (`heic-convert`) dans
`processPhoto` (EC-10).

## fake.jpg

Fichier texte brut nommé avec une extension `.jpg` trompeuse. Sert à vérifier
que `sniffAndValidate` (sniffing réel via `file-type`) rejette un contenu qui
ne correspond pas à son extension, plutôt que de faire confiance au nom de
fichier ou à l'extension client (EC-9).

## video.mp4

MP4 320x240, 2 secondes, généré avec un pattern de test `lavfi` (pas de
dépendance à un fichier source externe):

```sh
ffmpeg -f lavfi -i testsrc=duration=2:size=320x240:rate=10 -pix_fmt yuv420p \
	tests/fixtures/video.mp4
```

Sert à vérifier `makePoster` (T18): extraction d'une image d'aperçu JPEG via
ffmpeg quand il est disponible, et retour `false` sans exception quand le
binaire est absent (EC-11).

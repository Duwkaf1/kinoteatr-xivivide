# Yoru app identity

`yoru-icon-master.png` is the original image generated for this project on 2026-10-25. Direction: a champagne crescent and playback symbol on ink charcoal, with no anime characters, stock logos, text or watermark.

`../yoru.ico` and `../../public/yoru-icon.png` are mechanically resized format conversions of this master. The ICO contains 16/24/32/48/64/128/256 px images for Windows Explorer, shortcuts and high-DPI desktop use. Generated source artwork is excluded from the packaged app; the runtime ICO and PNG are included.

To regenerate these format conversions with free ImageMagick:

```sh
magick assets/branding/yoru-icon-master.png -resize 512x512 public/yoru-icon.png
magick assets/branding/yoru-icon-master.png -define icon:auto-resize=256,128,64,48,32,24,16 assets/yoru.ico
```

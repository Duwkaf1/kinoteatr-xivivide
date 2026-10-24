# Desktop playback fixture

`tone.webm` is an original synthetic two-second black video (160×90, VP8) with a 440 Hz tone (Opus). It contains no anime footage or third-party media.

Regenerate with FFmpeg:

```sh
ffmpeg -hide_banner -loglevel error -f lavfi -i color=c=black:s=160x90:r=6 -f lavfi -i sine=frequency=440:sample_rate=48000 -t 2 -c:v libvpx -b:v 30k -c:a libopus -b:a 16k -y test/fixtures/tone.webm
```

The desktop smoke test serves it from an intercepted test URL to verify that the built `file://` renderer can play video inside the actual Electron process. It does not establish that live sites work or that Discord captures audio.

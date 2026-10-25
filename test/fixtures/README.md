# Desktop playback fixture

`tone.webm` is an original synthetic two-second black video (160×90, VP8) with a 440 Hz tone (Opus). It contains no anime footage or third-party media.

Regenerate with FFmpeg:

```sh
ffmpeg -hide_banner -loglevel error -f lavfi -i color=c=black:s=160x90:r=6 -f lavfi -i sine=frequency=440:sample_rate=48000 -t 2 -c:v libvpx -b:v 30k -c:a libopus -b:a 16k -y test/fixtures/tone.webm
```

The desktop smoke test serves it from an intercepted test URL to verify that the built `file://` renderer can play video inside the actual Electron process. It does not establish that live sites work or that Discord captures audio.

`playback/tone.mp4` and its HLS copies `playback/index.m3u8` / `segment*.ts` are another owned synthetic fixture: six seconds of black 1920×1080 video, 4 fps, H.264, 660 Hz AAC tone at 32 kbit/s. They verify MP4 and HLS audio/video decoding in actual Linux/Windows Electron and contain no third-party anime or studio recordings. Generate the MP4 with FFmpeg lavfi color/sine, `-t 6 -c:v libx264 -preset ultrafast -g 8 -sc_threshold 0 -pix_fmt yuv420p -c:a aac -b:a 32k -movflags +faststart`; segment with `-c copy -hls_time 2 -hls_playlist_type vod`. All test fixtures are excluded from the distributed app.

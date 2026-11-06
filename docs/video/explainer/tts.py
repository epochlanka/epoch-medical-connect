"""Generate one WAV per narration line with Gemini TTS (needs GEMINI_API_KEY).

Existing clips are kept, so a re-run only fills gaps; delete a clip to regenerate it.
"""
import os
import time
import wave
from pathlib import Path

from google import genai
from google.genai import errors, types

from script import LINES, STYLE, VOICE

MODEL = os.environ.get("TTS_MODEL", "gemini-3.8-flash-tts")
OUT = Path(__file__).resolve().parent / "build" / "voice"


def synthesize(client, text, path):
    for attempt in range(10):
        try:
            resp = client.models.generate_content(
                model=MODEL,
                contents=f"{STYLE}\n\n{text}",
                config=types.GenerateContentConfig(
                    response_modalities=["AUDIO"],
                    speech_config=types.SpeechConfig(voice_config=types.VoiceConfig(
                        prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name=VOICE))),
                ),
            )
            break
        except errors.ClientError as e:
            if e.code != 429 or attempt == 9:
                raise
            print("  rate limited, waiting 40s", flush=True)  # free tier: a few requests a minute
            time.sleep(40)
    pcm = resp.candidates[0].content.parts[0].inline_data.data
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(24000)
        w.writeframes(pcm)
    return len(pcm) / 48000


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    client = genai.Client()
    for i, line in enumerate(LINES, 1):
        path = OUT / f"line-{i:02d}.wav"
        if path.exists():
            continue
        secs = synthesize(client, line, path)
        print(f"line {i:2d}: {secs:.1f}s", flush=True)
    print("done", flush=True)


if __name__ == "__main__":
    main()

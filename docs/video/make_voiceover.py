"""Generate the E-Poch explainer voiceover with Gemini TTS and merge it into the exported video.

    pip install google-genai
    export GEMINI_API_KEY=...            # from Google AI Studio
    python docs/video/make_voiceover.py                      # writes voiceover.wav
    python docs/video/make_voiceover.py epoch-explainer.mp4  # ...and epoch-explainer-voiced.mp4

Each scene's line is generated separately and placed at that scene's start time in the Clipkit
project, so the voice stays in step with the animation. Needs ffmpeg on PATH.
"""
import os
import subprocess
import sys
import time
import wave
from pathlib import Path

from google import genai
from google.genai import errors, types

MODEL = os.environ.get("TTS_MODEL", "gemini-3.8-flash-tts")  # check AI Studio for the current name
VOICE = os.environ.get("TTS_VOICE", "Sulafat")                     # alternatives: Kore, Charon
STYLE = ("Read this like a friendly senior nurse explaining a new system to colleagues: warm, calm, "
         "unhurried, with a slight smile. Pause briefly at each full stop. Say E-Poch as 'Ee-pock'.")
LEAD_IN = 0.5  # seconds after a scene starts before its line begins
TOTAL = 180.5  # length of the Clipkit composition

# (scene start in seconds, line) — starts match the Clipkit project.
SCENES = [
    (0.0, "Every clinic day starts the same way. Folders to find, notes to read, prescriptions to copy, stock to count, and money to balance by hand. It works, until a file goes missing or a handwritten dose is misread."),
    (17.9, "This is E-Poch. One system for the whole clinic: the front desk, the doctor, the pharmacy and the office. Everyone signs in at the same address, and each person sees the workspace for their role."),
    (34.5, "When Nimal arrives, reception finds him in seconds by name, phone or number. New patients are registered once, with a photo, and linked to their family. If someone is accidentally registered twice, E-Poch flags the possible duplicate."),
    (52.0, "Booked or walk-in, every patient joins one live queue. The waiting room can see who is next, and the doctor calls the next patient with one click. Skipped patients are never forgotten; they can be recalled."),
    (69.0, "In the consultation room, the doctor sees Nimal's whole history on one screen: past visits, diagnoses, prescriptions and lab results. Diagnoses are coded with the World Health Organization's I-C-D eleven, searched as you type, even without internet. Lab tests are ordered from the same screen, and follow-ups are tracked automatically."),
    (91.6, "Prescribing is typed, not handwritten. Choose the medicine, the dose and the duration, and E-Poch works out the quantity. The prescription prints clearly, and it is already waiting at the pharmacy before Nimal leaves the room."),
    (108.6, "At the pharmacy, the prescription is in the queue. E-Poch picks the batch that expires first, so older stock is used before it goes to waste. Stock goes down as medicine is dispensed, low stock and expiring batches are flagged, and printed labels go on every pack."),
    (130.3, "The bill builds itself from the visit: consultation, medicines and tests. Payments, refunds and unpaid balances are all recorded, and at the end of the day the cash count is checked against what the system expects."),
    (147.3, "Patient records stay inside the clinic. E-Poch runs on the clinic's own computer and network, so it keeps working when the internet is down. Each person sees only what their role allows, every change is logged, and records are backed up, encrypted, every night."),
    (167.8, "Less time searching and copying, fewer mistakes, and a complete record of every visit. E-Poch: one visit, one record."),
]

OUT = Path(__file__).resolve().parent / "voice"


def synthesize(client: genai.Client, text: str, path: Path) -> float:
    """Write one scene's line as a 24 kHz mono WAV; returns its length in seconds."""
    for attempt in range(8):
        try:
            return _synthesize_once(client, text, path)
        except errors.ClientError as e:
            if e.code != 429 or attempt == 7:
                raise
            # The free tier allows a few requests a minute; wait for the window to reset.
            print("  rate limited, waiting 40s ...", flush=True)
            time.sleep(40)


def _synthesize_once(client: genai.Client, text: str, path: Path) -> float:
    resp = client.models.generate_content(
        model=MODEL,
        contents=f"{STYLE}\n\n{text}",
        config=types.GenerateContentConfig(
            response_modalities=["AUDIO"],
            speech_config=types.SpeechConfig(
                voice_config=types.VoiceConfig(prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name=VOICE))
            ),
        ),
    )
    pcm = resp.candidates[0].content.parts[0].inline_data.data
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(24000)
        w.writeframes(pcm)
    return len(pcm) / 2 / 24000


def main() -> None:
    OUT.mkdir(exist_ok=True)
    client = genai.Client()  # reads GEMINI_API_KEY
    clips = []
    for i, (start, text) in enumerate(SCENES, 1):
        path = OUT / f"scene-{i:02d}.wav"
        if not path.exists():  # re-running only fills in what is missing; delete a file to redo it
            secs = synthesize(client, text, path)
        else:
            with wave.open(str(path)) as w:
                secs = w.getnframes() / w.getframerate()
        end = SCENES[i][0] if i < len(SCENES) else TOTAL
        room = end - start - LEAD_IN
        flag = "" if secs <= room else f"  <-- {secs - room:.1f}s too long for its scene"
        print(f"scene {i:2d}: {secs:5.1f}s of voice, {room:5.1f}s available{flag}")
        clips.append((start + LEAD_IN, path))

    # Place every clip at its start time on one silent track the length of the video.
    voice = OUT.parent / "voiceover.wav"
    inputs, filters = [], []
    for k, (at, path) in enumerate(clips):
        inputs += ["-i", str(path)]
        filters.append(f"[{k}:a]adelay={int(at * 1000)}:all=1[a{k}]")
    mix = "".join(f"[a{k}]" for k in range(len(clips)))
    filters.append(f"{mix}amix=inputs={len(clips)}:normalize=0,apad=whole_dur={TOTAL}[out]")
    subprocess.run(["ffmpeg", "-y", *inputs, "-filter_complex", ";".join(filters), "-map", "[out]",
                    "-ar", "48000", str(voice)], check=True, capture_output=True)
    print(f"wrote {voice}")

    if len(sys.argv) > 1:
        video = Path(sys.argv[1])
        voiced = video.with_name(video.stem + "-voiced.mp4")
        subprocess.run(["ffmpeg", "-y", "-i", str(video), "-i", str(voice), "-map", "0:v", "-map", "1:a",
                        "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest", str(voiced)],
                       check=True, capture_output=True)
        print(f"wrote {voiced}")


if __name__ == "__main__":
    main()

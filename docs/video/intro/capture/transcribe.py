import json, sys
from faster_whisper import WhisperModel
m = WhisperModel("small.en", device="cpu", compute_type="int8")
import subprocess, numpy as np
pcm = subprocess.run(["ffmpeg","-v","quiet","-i",sys.argv[1],"-f","s16le","-ac","1","-ar","16000","-"],capture_output=True).stdout
audio = np.frombuffer(pcm, np.int16).astype(np.float32)/32768
segs, _ = m.transcribe(audio, word_timestamps=True, beam_size=5)
words = []
for s in segs:
    for w in s.words:
        words.append({"w": w.word.strip(), "s": round(w.start, 3), "e": round(w.end, 3)})
json.dump(words, open(sys.argv[2], "w"), indent=0)
print(" ".join(f"{x['w']}@{x['s']}" for x in words))

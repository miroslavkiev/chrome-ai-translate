#!/usr/bin/env python3
"""Build measured local Adam speech, an original music bed, and the film mix."""

import argparse
import hashlib
import importlib.metadata
import json
import math
import re
import subprocess
from pathlib import Path

import kokoro_onnx
import numpy as np
import soundfile as sf


PROJECT = Path(__file__).resolve().parents[1]
RATE, FPS, VOICE, SPEED = 24_000, 60, "am_adam", 1.15
OPENING, GAP, ENDING = 0.35, 0.24, 0.60


def ffmpeg(*args):
    return subprocess.run(["ffmpeg", "-hide_banner", "-nostats", *map(str, args)],
                          check=True, capture_output=True, text=True).stderr


def levels(path):
    log = ffmpeg("-i", path, "-af", "loudnorm=I=-16:TP=-1.5:LRA=7:print_format=json", "-f", "null", "-")
    return json.JSONDecoder().raw_decode(log[log.rfind("{"):])[0]


def normalize(source, target, integrated=-16, peak=-1.7):
    measured = levels(source)
    filters = (f"loudnorm=I={integrated}:TP={peak}:LRA=7:linear=true:"
               f"measured_I={measured['input_i']}:measured_TP={measured['input_tp']}:"
               f"measured_LRA={measured['input_lra']}:measured_thresh={measured['input_thresh']}:"
               f"offset={measured['target_offset']}")
    ffmpeg("-y", "-i", source, "-af", filters, "-ar", 48000, "-c:a", "pcm_s24le", target)


def silence_ranges(samples, rate, threshold=10 ** (-50 / 20)):
    window = rate // 100
    blocks = len(samples) // window
    energy = np.max(np.abs(samples[:blocks * window].reshape(blocks, window)), axis=1)
    quiet = energy < threshold
    changes = np.diff(np.r_[False, quiet, False].astype(np.int8))
    return [(int(a * window), int(b * window))
            for a, b in zip(np.flatnonzero(changes == 1), np.flatnonzero(changes == -1))]


def trim(samples, rate):
    assert len(samples) and np.isfinite(samples).all(), "Invalid Kokoro audio"
    active = np.flatnonzero(np.abs(samples) > 10 ** (-50 / 20))
    assert len(active), "Kokoro returned silent audio"
    pad = round(0.045 * rate)
    samples = samples[max(0, active[0] - pad):min(len(samples), active[-1] + pad + 1)]
    shortened = []
    for start, end in reversed(silence_ranges(samples, rate)):
        if (end - start) / rate > 0.8:
            middle = (start + end) // 2
            remove = end - start - round(0.45 * rate)
            samples = np.r_[samples[:middle - remove // 2], samples[middle + (remove + 1) // 2:]]
            shortened.append({"original_seconds": (end - start) / rate, "kept_seconds": 0.45})
    return samples.astype(np.float32), shortened


def pack(scenes, clips):
    parts, timed, cursor = [], [], 0
    for index, scene in enumerate(scenes):
        start = cursor
        if index == 0:
            parts.append(np.zeros(round(OPENING * RATE), dtype=np.float32))
            cursor += len(parts[-1])
        speech_start = cursor
        parts.append(clips[scene["id"]])
        cursor += len(parts[-1])
        speech_end = cursor
        tail = ENDING if index == len(scenes) - 1 else GAP
        end = math.ceil((cursor + round(tail * RATE)) / (RATE // FPS)) * (RATE // FPS)
        parts.append(np.zeros(end - cursor, dtype=np.float32))
        cursor = end
        timed.append({**scene, "start": start / RATE, "duration": (end - start) / RATE,
                      "speechStart": speech_start / RATE, "speechEnd": speech_end / RATE,
                      "localSpeechStart": (speech_start - start) / RATE,
                      "localSpeechEnd": (speech_end - start) / RATE})
    return np.concatenate(parts), {"duration": cursor / RATE, "fps": FPS, "voice": VOICE,
                                 "speed": SPEED, "audio": "assets/audio/master.wav", "scenes": timed}


def music(duration):
    """Original D-major pulse: soft plucks, bass, and a quiet eighth-note tick."""
    rate = 48000
    bed = np.zeros((round(duration * rate), 2), dtype=np.float32)
    rng = np.random.default_rng(721)
    beat = 0.5
    chords = [(50, 57, 62, 66), (45, 57, 61, 64), (47, 54, 59, 62), (43, 55, 59, 62)]

    def place(start, signal, gain, pan=0):
        offset = round(start * rate)
        length = min(len(signal), len(bed) - offset)
        if length <= 0:
            return
        bed[offset:offset + length, 0] += signal[:length] * gain * (1 - pan * 0.3)
        bed[offset:offset + length, 1] += signal[:length] * gain * (1 + pan * 0.3)

    def note(midi, length, decay):
        time = np.arange(round(length * rate)) / rate
        frequency = 440 * 2 ** ((midi - 69) / 12)
        envelope = (1 - np.exp(-time * 160)) * np.exp(-time / decay)
        envelope *= np.minimum(1, (length - time) / 0.04)
        return ((np.sin(2 * np.pi * frequency * time) +
                 0.18 * np.sin(4 * np.pi * frequency * time)) * envelope).astype(np.float32)

    for step in range(math.ceil(duration / (beat / 2))):
        at = step * beat / 2
        chord = chords[(step // 32) % len(chords)]
        if step % 8 == 0:
            place(at, note(chord[0], 1.8, 0.7), 0.34)
        if step % 2 == 0:
            pitch = chord[1 + ((step // 2) % 3)] + 12
            place(at, note(pitch, 0.85, 0.23), 0.17, (-1) ** (step // 2))
        if step % 4 in (1, 3):
            time = np.arange(round(0.045 * rate)) / rate
            noise = rng.normal(0, 1, len(time))
            tick = np.r_[0, np.diff(noise)] * np.exp(-time / 0.007) * np.minimum(time / 0.002, 1)
            place(at, tick, 0.008)
    fade_in = np.minimum(np.arange(len(bed)) / rate / 0.35, 1)
    fade_out = np.minimum((len(bed) - np.arange(len(bed))) / rate / 0.65, 1)
    return bed * (fade_in * fade_out)[:, None]


def verify(timing, narration, master):
    assert timing["fps"] == 60 and timing["speed"] == 1.15
    previous = 0
    for scene in timing["scenes"]:
        assert abs(scene["start"] - previous) < 1e-7
        assert abs(scene["start"] * FPS - round(scene["start"] * FPS)) < 1e-6
        assert abs(scene["duration"] * FPS - round(scene["duration"] * FPS)) < 1e-6
        previous += scene["duration"]
    assert abs(previous - timing["duration"]) < 1e-6
    scan = ffmpeg("-i", narration, "-af", "silencedetect=noise=-50dB:d=0.05", "-f", "null", "-")
    gaps = [float(value) for value in re.findall(r"silence_duration: ([0-9.]+)", scan)]
    assert gaps and max(gaps) < 1, f"Long speech pause: {max(gaps)}"
    voice_info, mix_info = sf.info(narration), sf.info(master)
    assert voice_info.samplerate == mix_info.samplerate == 48000
    assert abs(mix_info.duration - timing["duration"]) < 1 / 48000
    mix_levels = levels(master)
    assert abs(float(mix_levels["input_i"]) + 16) < 0.6, mix_levels
    assert float(mix_levels["input_tp"]) <= -1.5, mix_levels
    setup_seconds = sum(scene["duration"] for scene in timing["scenes"] if scene["id"] in ("s14", "s15", "s16"))
    return {"duration": timing["duration"], "max_narration_pause_seconds": max(gaps),
            "sample_rate": mix_info.samplerate, "channels": mix_info.channels,
            "integrated_lufs": float(mix_levels["input_i"]), "true_peak_dbtp": float(mix_levels["input_tp"]),
            "setup_seconds": setup_seconds, "setup_percent": round(setup_seconds / timing["duration"] * 100, 2)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--self-test", action="store_true")
    parser.add_argument("--model", type=Path, default=Path.home() / ".cache/hyperframes/tts/models/kokoro-v1.0.onnx")
    parser.add_argument("--voices", type=Path, default=Path.home() / ".cache/hyperframes/tts/voices/voices-v1.0.bin")
    args = parser.parse_args()
    audio = PROJECT / "assets/audio"
    narration, master = audio / "narration.wav", audio / "master.wav"
    if args.self_test:
        source = np.r_[np.zeros(3000), np.ones(6000) * 0.1, np.zeros(30000), np.ones(6000) * 0.1, np.zeros(3000)]
        clip, shortened = trim(source, RATE)
        assert len(shortened) == 1 and max((b - a) / RATE for a, b in silence_ranges(clip, RATE)) < 0.8
        packed, timing = pack([{"id": "a", "text": "One"}, {"id": "b", "text": "Two"}], {"a": clip, "b": clip})
        assert len(packed) == round(timing["duration"] * RATE)
        assert timing["scenes"][0]["speechStart"] == OPENING
        print("PASS: silence shortening preserves speech and scene packing keeps exact frame boundaries")
        return
    if args.check:
        print(json.dumps(verify(json.loads((PROJECT / "timings.json").read_text()), narration, master), indent=2))
        return
    story = json.loads((PROJECT / "narrative.json").read_text())
    assert len({scene["id"] for scene in story["scenes"]}) == len(story["scenes"])
    assert all(scene["text"].strip() and not any(char in scene["text"] for char in ("\u2013", "\u2014")) for scene in story["scenes"])
    cache = audio / "cache"
    cache.mkdir(parents=True, exist_ok=True)
    engine = importlib.metadata.version("kokoro-onnx")
    model, clips, records = None, {}, []
    for scene in story["scenes"]:
        key = hashlib.sha256(json.dumps([scene["text"], VOICE, SPEED, engine, "trim45ms-cap450ms-v1"]).encode()).hexdigest()
        cached = cache / f"{key}.wav"
        if cached.exists():
            samples, rate = sf.read(cached, dtype="float32")
            shortened = []
        else:
            if model is None:
                model = kokoro_onnx.Kokoro(str(args.model), str(args.voices))
            samples, rate = model.create(scene["text"], voice=VOICE, speed=SPEED, lang="en-us")
            samples, shortened = trim(samples, rate)
            sf.write(cached, samples, rate, subtype="FLOAT")
        assert rate == RATE and samples.ndim == 1 and np.isfinite(samples).all()
        clips[scene["id"]] = samples
        records.append({"id": scene["id"], "seconds": len(samples) / rate, "shortened_internal_pauses": shortened})
        print(f"{scene['id']}: {len(samples) / rate:.3f}s", flush=True)
    packed, timing = pack(story["scenes"], clips)
    (PROJECT / "timings.json").write_text(json.dumps(timing, indent=2) + "\n")
    (PROJECT / "timings.js").write_text("window.FILM_TIMINGS = " + json.dumps(timing, indent=2) + ";\n")
    script = ["# Narration", "", "Local Kokoro Adam (am_adam), speed 1.15. Speech determines scene timing.", ""]
    for scene in timing["scenes"]:
        script.extend([f"## {scene['id']}: {scene['title']}", "", scene["text"], ""])
    (PROJECT / "SCRIPT.md").write_text("\n".join(script))
    print(f"TIMINGS READY: {timing['duration']:.3f}s", flush=True)
    raw = audio / "narration-raw.wav"
    sf.write(raw, packed, RATE, subtype="PCM_24")
    normalize(raw, narration)
    sf.write(audio / "music-raw.wav", music(timing["duration"]), 48000, subtype="PCM_24")
    normalize(audio / "music-raw.wav", audio / "music.wav", integrated=-33, peak=-8)
    mix = audio / "mix-raw.wav"
    ffmpeg("-y", "-i", narration, "-i", audio / "music.wav", "-filter_complex",
           "[0:a]aformat=channel_layouts=stereo[v];[v][1:a]amix=inputs=2:duration=first:normalize=0[m]",
           "-map", "[m]", "-ar", 48000, "-c:a", "pcm_s24le", mix)
    normalize(mix, master)
    qa = verify(timing, narration, master)
    qa.update(voice=VOICE, speed=SPEED, engine=engine, original_music="Locally synthesized D-major plucks, bass, and ticks at 120 BPM. No sampled or external music.",
              source_sha256=hashlib.sha256((PROJECT / "narrative.json").read_bytes()).hexdigest(), scenes=records)
    (PROJECT / "audio-QA.json").write_text(json.dumps(qa, indent=2) + "\n")
    print(json.dumps(qa, indent=2), flush=True)


if __name__ == "__main__":
    main()

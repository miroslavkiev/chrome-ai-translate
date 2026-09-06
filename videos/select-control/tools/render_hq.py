#!/usr/bin/env python3
"""Capture bounded 4K60 PNG scenes, encode with software, and join the final film."""

import argparse
import fcntl
import hashlib
import json
import math
import os
import re
import shutil
import struct
import subprocess
import tempfile
from fractions import Fraction
from pathlib import Path


PROJECT = Path(__file__).resolve().parents[1]
RENDERS = PROJECT / "renders"
WORK = RENDERS / "hq-scenes"
FINAL = RENDERS / "ai-translator-select-control-4k60.mp4"
FPS, WIDTH, HEIGHT = 60, 3840, 2160
SETTINGS = {"fps": FPS, "width": WIDTH, "height": HEIGHT, "crf": 15,
            "preset": "slow", "workers": 4, "browser_gpu": False,
            "force_screenshot": True, "fast_capture": False, "audio_bitrate": "256k"}


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def sha(path):
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def json_text(value):
    return json.dumps(value, sort_keys=True, indent=2) + "\n"


def fingerprint(value):
    return hashlib.sha256(json_text(value).encode()).hexdigest()


def write_json(path, value):
    require(not path.is_symlink(), f"Refusing a linked evidence file: {path}")
    temporary = path.with_name(path.name + ".pending")
    require(not temporary.is_symlink(), f"Refusing a linked evidence file: {temporary}")
    temporary.write_text(json_text(value))
    temporary.replace(path)


def mkdir(path):
    require(path.resolve() == path and path.is_relative_to(RENDERS),
            f"Render scratch must stay inside {RENDERS}: {path}")
    path.mkdir(parents=True, exist_ok=True)


def command(args, log=None, cwd=None, env=None):
    if log is None:
        return subprocess.run(args, check=True, capture_output=True, text=True).stdout
    print("Running:", " ".join(map(str, args)), flush=True)
    with log.open("x") as handle:
        result = subprocess.run(args, cwd=cwd, env=env, stdout=handle, stderr=subprocess.STDOUT)
    require(result.returncode == 0, f"Command failed. Evidence saved in {log}")


def timings(data):
    require(data.get("fps") == FPS and data.get("scenes"), "Expected a nonempty 60 fps timeline")
    scenes, cursor, seen = [], 0, set()
    for scene in data["scenes"]:
        name = scene["id"]
        require(isinstance(name, str) and re.fullmatch(r"s\d{2}", name) and name not in seen,
                f"Invalid or repeated scene ID: {name}")
        frames = round(scene["duration"] * FPS)
        require(frames > 0 and math.isclose(scene["duration"] * FPS, frames, abs_tol=0.00001)
                and math.isclose(scene["start"] * FPS, cursor, abs_tol=0.00001),
                f"Scene {name} must follow the previous scene on a frame boundary")
        scenes.append({"id": name, "frames": frames, "start_frame": cursor})
        seen.add(name)
        cursor += frames
    require(math.isclose(data["duration"] * FPS, cursor, abs_tol=0.00001),
            "Total duration does not match the scenes")
    return scenes, cursor


def scene_sources(project):
    require(project.is_dir() and project.resolve() == project, f"Missing scene project: {project}")
    require((project / "index.html").is_file() and (project / "hyperframes.json").is_file(),
            f"Build the scene project before rendering: {project}")
    hashes = {}
    for root, directories, files in os.walk(project, followlinks=True):
        directories[:] = sorted(name for name in directories if not name.startswith(".")
                                and name not in {"renders", "node_modules"})
        for name in directories + files:
            path = Path(root) / name
            require(path.resolve().is_relative_to(PROJECT), f"Asset leaves the project: {path}")
            if path.is_dir():
                require(path.resolve() not in [Path(root).resolve(), *Path(root).resolve().parents],
                        f"Asset directory creates a loop: {path}")
        for name in sorted(files):
            path = Path(root) / name
            require(path.is_file(), f"Missing linked asset: {path}")
            hashes[path.relative_to(project).as_posix()] = sha(path)
    return hashes


def storage_check(scene, directory):
    # Two raw RGBA copies cover capture scratch plus output; scenes bound peak disk use.
    required = scene["frames"] * WIDTH * HEIGHT * 4 * 2 + 8 * 1024**3
    free = shutil.disk_usage(directory).free
    require(free > required, f'{scene["id"]}: need {required / 1024**3:.1f} GiB free; '
            f'have {free / 1024**3:.1f} GiB. Existing files were preserved.')
    print(f'{scene["id"]}: {free / 1024**3:.1f} GiB free; '
          f'{required / 1024**3:.1f} GiB reserved.', flush=True)


def validate_pngs(directory, frames):
    require(directory.is_dir() and not directory.is_symlink(), "PNG output must be a normal directory")
    files = sorted(directory.iterdir())
    # Verified against the existing HyperFrames 0.8.29 renderer: numbering starts at one.
    require([path.name for path in files] == [f"frame_{i:06d}.png" for i in range(1, frames + 1)],
            f"PNG sequence has missing or unexpected files: {directory}")
    for path in files:
        require(path.is_file() and not path.is_symlink(), f"Unexpected PNG path: {path}")
        with path.open("rb") as handle:
            header = handle.read(24)
        require(len(header) == 24 and header[:8] == b"\x89PNG\r\n\x1a\n"
                and struct.unpack(">II", header[16:24]) == (WIDTH, HEIGHT),
                f"PNG must be native 3840 by 2160: {path}")
    return files


def verify_video(path, frames, audio=False):
    require(path.is_file() and not path.is_symlink(), f"Missing normal video file: {path}")
    probe = json.loads(command(["ffprobe", "-v", "error", "-count_frames", "-show_streams",
                                "-show_format", "-of", "json", str(path)]))
    video = [item for item in probe["streams"] if item["codec_type"] == "video"]
    sound = [item for item in probe["streams"] if item["codec_type"] == "audio"]
    require(len(video) == 1 and len(sound) == int(audio) and len(probe["streams"]) == 1 + int(audio),
            f"Unexpected video or audio streams: {path}")
    stream = video[0]
    require((stream["width"], stream["height"], stream["pix_fmt"], stream["codec_name"])
            == (WIDTH, HEIGHT, "yuv420p", "h264"), f"Wrong picture format: {path}")
    require(Fraction(stream["avg_frame_rate"]) == FPS and Fraction(stream["r_frame_rate"]) == FPS
            and int(stream["nb_read_frames"]) == frames
            and abs(float(stream["duration"]) - frames / FPS) < 0.001
            and abs(float(stream.get("start_time", 0))) < 0.001, f"Wrong video timing: {path}")
    require(all(stream.get(key) == "bt709" for key in ("color_space", "color_transfer", "color_primaries")),
            f"Missing BT.709 color tags: {path}")
    if audio:
        require(sound[0]["codec_name"] == "aac" and int(sound[0]["sample_rate"]) == 48000
                and abs(float(sound[0].get("start_time", 0))) < 0.05
                and abs(float(sound[0]["duration"]) - frames / FPS) < 0.05,
                f"Audio does not match the complete film: {path}")
    return {"sha256": sha(path), "frames": frames, "duration": frames / FPS, "probe": probe}


def render_scene(scene, versions):
    project = RENDERS / "scene-projects" / scene["id"]
    sources = scene_sources(project)
    manifest = {"scene": scene, "source_sha256": sources, "settings": SETTINGS,
                "versions": versions, "pipeline_sha256": sha(Path(__file__))}
    key = fingerprint(manifest)
    directory = WORK / scene["id"] / key
    mkdir(directory)
    write_json(directory / "source-manifest.json", manifest)
    segment, receipt = directory / "segment.mp4", directory / "segment.json"
    if segment.exists():
        verified = verify_video(segment, scene["frames"])
        if receipt.exists():
            saved = json.loads(receipt.read_text())
            require(saved["source_fingerprint"] == key and saved["video"]["sha256"] == verified["sha256"],
                    f"Cached video changed: {segment}")
        else:
            write_json(receipt, {"source_fingerprint": key, "video": verified})
        print(f'{scene["id"]}: verified cached segment.', flush=True)
        return segment, key
    storage_check(scene, directory)
    attempt = directory / f"attempt-{len(list(directory.glob('attempt-*'))) + 1:04d}"
    require(not attempt.exists(), f"Attempt path already exists: {attempt}")
    mkdir(attempt)
    pngs, pending = attempt / "png", attempt / "segment.pending.mp4"
    env = dict(os.environ, HYPERFRAMES_NO_TELEMETRY="1", PRODUCER_FORCE_SCREENSHOT="true",
               PRODUCER_EXPERIMENTAL_FAST_CAPTURE="false", FFMPEG_ENCODE_TIMEOUT_MS="3600000",
               FFMPEG_PROCESS_TIMEOUT_MS="3600000", FFMPEG_STREAMING_TIMEOUT_MS="3600000")
    command(["hyperframes", "render", str(project), "--fps", str(FPS), "--resolution", "landscape-4k",
             "--quality", "high", "--format", "png-sequence", "--workers", "4", "--no-browser-gpu",
             "--no-best-effort", "--output", str(pngs)], attempt / "capture.log", cwd=project, env=env)
    files = validate_pngs(pngs, scene["frames"])
    require(scene_sources(project) == sources, "Scene source changed during capture; output was preserved")
    command(["ffmpeg", "-hide_banner", "-nostdin", "-n", "-framerate", str(FPS), "-start_number", "1",
             "-i", str(pngs / "frame_%06d.png"), "-an", "-frames:v", str(scene["frames"]),
             "-vf", "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p,setparams=range=limited:color_primaries=bt709:color_trc=bt709:colorspace=bt709",
             "-c:v", "libx264", "-preset", "slow", "-crf", "15", "-profile:v", "high", "-level:v", "5.2",
             "-bf", "0", "-threads", "8", "-color_range", "tv", "-colorspace", "bt709", "-color_trc", "bt709",
             "-color_primaries", "bt709", "-video_track_timescale", "15360", "-movflags", "+faststart",
             str(pending)], attempt / "encode.log")
    verified = verify_video(pending, scene["frames"])
    pending.rename(segment)
    write_json(receipt, {"source_fingerprint": key, "video": verified})
    require(pngs.resolve() == attempt / "png" and validate_pngs(pngs, scene["frames"]) == files,
            "Refusing cleanup of an unexpected PNG folder")
    for path in files:
        path.unlink()
    pngs.rmdir()
    print(f'{scene["id"]}: verified {scene["frames"]} frames; generated PNG files removed.', flush=True)
    return segment, key


def assemble(segments, total_frames, timing_hash, versions):
    audio = PROJECT / "assets/audio/master.wav"
    require(audio.is_file(), f"Missing audio master: {audio}")
    audio_probe = json.loads(command(["ffprobe", "-v", "error", "-show_format", "-of", "json", str(audio)]))
    require(abs(float(audio_probe["format"]["duration"]) - total_frames / FPS) < 0.05,
            "The audio master must cover the complete timeline")
    manifest = {"segments": [key for _, key in segments], "audio_sha256": sha(audio),
                "timings_sha256": timing_hash, "settings": SETTINGS, "versions": versions}
    key = fingerprint(manifest)
    directory = WORK / "final" / key
    mkdir(directory)
    cached, receipt = directory / "final.mp4", directory / "final.json"
    write_json(directory / "source-manifest.json", manifest)
    if not cached.exists():
        attempt = directory / f"attempt-{len(list(directory.glob('attempt-*'))) + 1:04d}"
        require(not attempt.exists(), f"Attempt path already exists: {attempt}")
        mkdir(attempt)
        listing = attempt / "segments.txt"
        # Scratch paths are generated hex hashes and sNN IDs; no shell or arbitrary concat input.
        listing.write_text("".join(f"file '{os.path.relpath(path, attempt)}'\n" for path, _ in segments))
        pending = attempt / "final.pending.mp4"
        command(["ffmpeg", "-hide_banner", "-nostdin", "-n", "-f", "concat", "-safe", "0", "-i", str(listing),
                 "-i", str(audio), "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", "aac",
                 "-b:a", "256k", "-ar", "48000", "-af", "apad", "-t", str(total_frames / FPS),
                 "-map_metadata", "-1", "-movflags", "+faststart", str(pending)], attempt / "assemble.log")
        require(sha(audio) == manifest["audio_sha256"] and sha(PROJECT / "timings.json") == timing_hash,
                "Audio or timeline changed during assembly; output was preserved")
        verified = verify_video(pending, total_frames, audio=True)
        pending.rename(cached)
        write_json(receipt, {"source_fingerprint": key, "video": verified})
    verified = verify_video(cached, total_frames, audio=True)
    if receipt.exists():
        saved = json.loads(receipt.read_text())
        require(saved["source_fingerprint"] == key and saved["video"]["sha256"] == verified["sha256"],
                "Cached final video changed")
    else:
        write_json(receipt, {"source_fingerprint": key, "video": verified})
    require(not FINAL.is_symlink(), "Final output must not be a symlink")
    if FINAL.exists() and sha(FINAL) != verified["sha256"]:
        previous = WORK / "previous"
        mkdir(previous)
        backup = previous / f"{sha(FINAL)}.mp4"
        if not backup.exists():
            shutil.copyfile(FINAL, backup)
    if not FINAL.exists() or sha(FINAL) != verified["sha256"]:
        temporary = FINAL.with_name(FINAL.stem + ".pending.mp4")
        require(not temporary.is_symlink(), "Final temporary output must not be a symlink")
        shutil.copyfile(cached, temporary)
        temporary.replace(FINAL)
    write_json(FINAL.with_suffix(".json"), {"source_fingerprint": key, "video": verified})
    print(f"Final native 4K60 film: {FINAL}", flush=True)


def self_check():
    sample = {"fps": 60, "duration": 0.05, "scenes": [
        {"id": "s01", "start": 0, "duration": 1 / 60},
        {"id": "s02", "start": 1 / 60, "duration": 2 / 60}]}
    assert timings(sample)[1] == 3
    sample["scenes"][1]["start"] = 0
    try:
        timings(sample)
    except RuntimeError:
        pass
    else:
        raise AssertionError("Overlapping scenes must fail")
    with tempfile.TemporaryDirectory() as temporary:
        folder = Path(temporary)
        frame = folder / "frame_000001.png"
        frame.write_bytes(b"\x89PNG\r\n\x1a\n" + b"\0" * 8 + struct.pack(">II", WIDTH, HEIGHT))
        assert validate_pngs(folder, 1) == [frame]
        frame.rename(folder / "frame_000000.png")
        try:
            validate_pngs(folder, 1)
        except RuntimeError:
            pass
        else:
            raise AssertionError("Wrong PNG numbering must fail")
    print("Self-check passed: frame boundaries, overlap rejection, dimensions and PNG numbering.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--only", nargs="+", metavar="sNN", help="Render chosen scenes without final assembly")
    parser.add_argument("--self-check", action="store_true", help="Check timing and PNG validation without rendering")
    args = parser.parse_args()
    if args.self_check:
        self_check()
        return
    scenes, total_frames = timings(json.loads((PROJECT / "timings.json").read_text()))
    require(not args.only or set(args.only) <= {scene["id"] for scene in scenes}, "Unknown scene in --only")
    timing_hash = sha(PROJECT / "timings.json")
    versions = {"hyperframes": command(["hyperframes", "--version"]).strip(),
                "ffmpeg": command(["ffmpeg", "-version"]).splitlines()[0]}
    mkdir(WORK)
    lock = WORK / ".run.lock"
    require(not lock.is_symlink(), "Render lock must not be a symlink")
    with lock.open("a") as handle:
        try:
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as error:
            raise RuntimeError("Another render is active; wait for it to finish") from error
        selected = [scene for scene in scenes if not args.only or scene["id"] in args.only]
        segments = []
        for scene in selected:
            require(sha(PROJECT / "timings.json") == timing_hash, "Timeline changed during this run")
            segments.append(render_scene(scene, versions))
        require(sha(PROJECT / "timings.json") == timing_hash, "Timeline changed during this run")
        for scene, (segment, _) in zip(selected, segments):
            saved = json.loads((segment.parent / "source-manifest.json").read_text())
            require(scene_sources(RENDERS / "scene-projects" / scene["id"]) == saved["source_sha256"],
                    f'Scene {scene["id"]} changed after capture; final assembly was stopped')
        if not args.only:
            assemble(segments, total_frames, timing_hash, versions)


if __name__ == "__main__":
    main()

"""Lumi Studio tests. Run from the repo root after building the native parts:

    cmake -S tools/studio -B build/studio && cmake --build build/studio
    QT_QPA_PLATFORM=offscreen python3 -m pytest tools/studio/tests -q
"""
import os
import subprocess
import sys

import pytest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))

from lumi_studio import native, factory  # noqa: E402
from lumi_studio.model import (AnimationDef, Face, Key, Persona, Project, encode_pack,  # noqa: E402
                               export_firmware_header, EYE_STYLES, MOUTHS, SHINES, ACCENTS)


# ---- native core ---------------------------------------------------------------

def test_renders_match_the_firmware_golden_frames():
    golden = open(os.path.join(REPO, "tests", "golden", "expressions.frames"), "rb").read()
    names = native.expression_names()
    assert len(golden) == len(names) * 1024
    for i in range(len(names)):
        frame = golden[i * 1024:(i + 1) * 1024]
        assert native.render_expression(i, None, 600) == frame, names[i]
        # Faces saved in packs are quantized to 32 bytes; that costs at most a few pixels.
        assert native.frame_diff(native.render_face(native.expression_bytes(i), None, 600), frame) <= 12, names[i]


def test_face_round_trips_through_bytes():
    for i in range(len(native.expression_names())):
        b = native.expression_bytes(i)
        assert Face.from_expression(i).to_bytes() == b


def test_enum_tables_match_the_firmware():
    assert native.gene_options(4) == SHINES
    assert native.gene_options(5) == ACCENTS
    # every eye style and mouth the firmware knows renders, and one past the end is refused
    f = Face()
    for i in range(len(EYE_STYLES)):
        f.styles["styleL"] = i
        assert any(native.render_face(f.to_bytes()))
    f.styles["styleL"] = len(EYE_STYLES)
    assert not any(native.render_face(f.to_bytes()))
    f.styles["styleL"] = 0
    f.styles["mouth"] = len(MOUTHS)
    assert not any(native.render_face(f.to_bytes()))


def test_genes_are_deterministic_and_rarity_is_known():
    g = native.genes_from_seed(1234)
    assert g == native.genes_from_seed(1234)
    assert native.genes_rarity(g) in ("common", "uncommon", "rare", "legendary")
    assert native.look_count() == 108000
    assert native.mac_seed("24:0A:C4:12:34:56") == 0x240AC4123456


# ---- packs -----------------------------------------------------------------------

def sample_project():
    p = Project()
    wink = Face.from_expression(native.expression_names().index("wink"))
    wink.update({"accent": ACCENTS.index("lashes"), "eyeW": 31.5})
    p.faces["big wink"] = wink
    proud = Face.from_expression(native.expression_names().index("smug"))
    proud.update({"cheek": 0.4, "fx": 1 << 4})
    p.faces["proud"] = proud
    p.animations.append(AnimationDef("signature_wink", "pat", 40, 100, 3, [
        Key("custom:big wink", motion="hop", tween=150, hold=600),
        Key("custom:proud", lookX=4, lookY=-2, tween=200, hold=500, fx=["hearts"]),
    ]))
    p.animations.append(AnimationDef("signature_bounce", "double_pat", 0, 100, 1, [
        Key("expr:joy", motion="bounce", tween=120, hold=800, mouth="cat"),
    ]))
    return p


def test_pack_matches_the_firmware_encoder_byte_for_byte():
    persona = Persona("Starla", [2, 2, 2, 1, 4, 1, 4], "LUMI-000421", ["signature_wink"])
    data = encode_pack(sample_project(), persona)
    ok, msg = native.validate_pack(data)
    assert ok, msg
    assert native.reencode_pack(data) == data


def test_bad_projects_are_explained():
    p = sample_project()
    p.animations[0].keys[0].face = "custom:missing"
    p.animations[1].trigger = "tickle"
    with pytest.raises(ValueError) as e:
        encode_pack(p)
    assert "no custom face called 'missing'" in str(e.value)
    assert "unknown trigger 'tickle'" in str(e.value)


def test_project_saves_and_loads(tmp_path):
    p = sample_project()
    path = tmp_path / "x.lumiproject"
    p.save(path)
    q = Project.load(path)
    assert encode_pack(q) == encode_pack(p)


def test_firmware_header_export(tmp_path):
    data = encode_pack(sample_project())
    path = tmp_path / "default_pack.h"
    export_firmware_header(data, str(path))
    text = path.read_text()
    assert f"kDefaultPackSize = {len(data)};" in text
    # Parse the bytes back out of the header.
    body = text[text.index("{", text.index("kDefaultPack[]")) + 1:text.index("};")]
    assert bytes(int(x, 16) for x in body.replace(",", " ").split()) == data


def test_player_plays_pack_animations():
    player = native.Player(seed=3)
    assert player.load_pack(encode_pack(sample_project())) == 0
    assert "signature_wink" in player.animation_names()
    assert player.play("signature_wink") >= 0
    frames = set()
    t = 0
    while player.busy() and t < 10000:
        player.update(t)
        frames.add(player.render())
        t += 33
    assert not player.busy() and len(frames) > 5
    player.close()


# ---- factory batches -----------------------------------------------------------

def test_batches_are_unique_reproducible_and_mixed():
    batch = factory.generate_batch(400, "test-batch", prefix="LUMI", start=100)
    assert len({p.look for p in batch}) == 400
    assert len({p.name.lower() for p in batch}) == 400
    assert batch[0].serial.startswith("LUMI-") and sorted(p.serial for p in batch)[0] == "LUMI-000100"
    counts = {r: sum(p.rarity == r for p in batch) for r in ("common", "uncommon", "rare", "legendary")}
    assert counts == factory.quotas(400, factory.DEFAULT_MIX)
    again = factory.generate_batch(400, "test-batch", prefix="LUMI", start=100)
    assert [p.genes for p in again] == [p.genes for p in batch]
    # A second batch avoids the first one's looks and names.
    second = factory.generate_batch(100, "test-batch-2", avoid_looks={p.look for p in batch},
                                    avoid_names={p.name for p in batch})
    assert not {p.look for p in second} & {p.look for p in batch}


def test_manifest_round_trip(tmp_path):
    batch = factory.generate_batch(5, "m")
    rows = [factory.persona_row(p) for p in batch]
    path = str(tmp_path / "manifest.csv")
    factory.write_manifest(path, rows)
    rows = factory.read_manifest(path)
    assert factory.row_persona(rows[2]).genes == batch[2].genes
    i = factory.next_unprovisioned(rows)
    factory.mark_provisioned(rows, i, "24:0a:c4:00:00:01")
    assert rows[0]["mac"] == "24:0A:C4:00:00:01"
    with pytest.raises(ValueError):
        factory.mark_provisioned(rows, 1, "24:0A:C4:00:00:01")
    assert factory.next_unprovisioned(rows) == 1


# ---- provisioning against a virtual Lumi on a pty ---------------------------------

@pytest.fixture
def virtual_lumi(tmp_path):
    exe = native.find_tool("virtual_lumi")
    if not exe or sys.platform == "win32":
        pytest.skip("virtual_lumi not built")
    store = str(tmp_path / "nvs.bin")
    proc = subprocess.Popen([exe, "--pty", "--store", store, "--mac", "24:0A:C4:AB:CD:EF"],
                            stdout=subprocess.PIPE, text=True)
    path = proc.stdout.readline().strip()
    yield path, store, exe
    proc.kill()
    proc.wait()


def test_provisioning_end_to_end(virtual_lumi):
    from lumi_studio.device import LumiDevice, DeviceError

    path, store, exe = virtual_lumi
    batch = factory.generate_batch(3, "factory-test")
    persona = batch[0]
    data = encode_pack(sample_project(), persona)
    with LumiDevice(path, timeout=3) as dev:
        info = dev.identify()
        assert info["mac"] == "24:0A:C4:AB:CD:EF"
        assert info["persona"] == "auto"
        # The automatic persona matches what Studio predicts from the MAC.
        seed = native.mac_seed(info["mac"])
        assert info["name"] == native.name_from_seed(seed)
        assert info["look"] == str(native.genes_code(native.genes_from_seed(seed)))

        info = dev.provision(data)
        assert info["persona"] == "assigned"
        assert info["name"] == persona.name
        assert info["serial"] == persona.serial
        assert info["look"] == str(persona.look)
        assert dev.download() == data

        with pytest.raises(DeviceError, match="crc mismatch"):
            dev.command("persona begin 4")
            dev.command("persona put 0 00112233")
            dev.command("persona commit 00000000")

    # The pack survives a "reboot" (new process, same storage).
    assert open(store, "rb").read() == data
    proc = subprocess.Popen([exe, "--pty", "--store", store], stdout=subprocess.PIPE, text=True)
    try:
        with LumiDevice(proc.stdout.readline().strip()) as dev:
            assert dev.identify()["name"] == persona.name
            dev.clear()
            assert dev.identify()["persona"] == "auto"
            assert dev.download() is None
    finally:
        proc.kill()
        proc.wait()
